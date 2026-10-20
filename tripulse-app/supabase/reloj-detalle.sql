/* ============================================================
   RELOJES: el detalle de cada entreno (vueltas, tramos y FC)
   ============================================================
   Maqueta aprobada el 2026-10-19 («las 4 como propones»). En «Su reloj», cada
   entreno se abre y enseña sus vueltas, sus tramos (un km en carrera) y el
   tiempo en cada zona de FC del deportista.

   Sale del fichero FIT del reloj (COROS y Polar lo dan). El fichero trae el
   recorrido: se lee en el servidor y se tira en el acto. Aquí solo llega lo
   que se saca de él:
     vueltas      las que grabó el reloj (un paso del entreno, una vuelta a mano);
     tramos       cada `tramo_m` metros (1 km en carrera, 5 km en bici);
     fc_segundos  cuántos segundos pasó a cada pulsación: {"146": 63, …}. Con
                  esto las zonas se calculan al enseñarlas, con las suyas de ese
                  momento, y si cambian (un test nuevo) se recalculan solas.
   Ninguna coordenada, ni el fichero.

   `motivo` dice por qué un entreno no tiene detalle (un fichero sin vueltas ni
   FC, uno que no se pudo leer): la fila existe igual, para no volver a pedir
   ese fichero cada vez. COROS limita las descargas al día.

   QUIÉN: lo ven quienes ven sus mediciones (auth_dep_ids: él, su entrenador y
   el director con acceso). Nadie lo escribe directamente: solo dos pares de
   funciones, las del propio deportista (con su sesión, desde su perfil) y las
   del servidor (con la llave, en la sincronización automática).

   TODO ADITIVO: una tabla y seis funciones nuevas. Nada de lo que existe cambia.
   ============================================================ */

set local lock_timeout = '5s';

create table public.reloj_detalle (
  id_medicion bigint primary key references public.reloj_medicion(id) on delete cascade,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  proveedor text not null check (proveedor in ('polar', 'coros', 'garmin')),
  vueltas jsonb not null default '[]'::jsonb check (jsonb_typeof(vueltas) = 'array'),
  tramos jsonb not null default '[]'::jsonb check (jsonb_typeof(tramos) = 'array'),
  tramo_m integer check (tramo_m is null or tramo_m between 25 and 100000),
  fc_segundos jsonb not null default '{}'::jsonb check (jsonb_typeof(fc_segundos) = 'object'),
  segundos_con_fc integer not null default 0 check (segundos_con_fc between 0 and 172800),
  motivo text check (motivo is null or length(motivo) <= 300),
  version smallint not null default 1,
  recibido_en timestamptz not null default now()
);
create index reloj_detalle_dep on public.reloj_detalle (id_deportista);

alter table public.reloj_detalle enable row level security;

create policy reloj_detalle_ver on public.reloj_detalle
  for select to authenticated using (id_deportista in (select public.auth_dep_ids()));

revoke all on public.reloj_detalle from anon;
revoke insert, update, delete, truncate, references, trigger on public.reloj_detalle from authenticated;


/* ========== Lo común: qué falta y guardar ========== */

/* Los entrenos de ese deportista y esa marca sin detalle todavía, desde una
   fecha, el más reciente primero, con su código de deporte (lo pide COROS).
   SOLO LOS QUE CUENTAN (con disciplina): una caminata no tiene detalle que
   enseñar, y si entrasen aquí, quien camina a diario llenaría la lista y sus
   carreras no llegarían nunca a tener el suyo. */
create or replace function public.reloj_detalle_faltan_de(p_dep bigint, p_proveedor text, p_desde date)
returns table(id_externo text, fecha date, deporte_codigo text, disciplina text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id_externo, m.fecha, m.datos ->> 'deporte_codigo', m.datos ->> 'disciplina'
    from public.reloj_medicion m
   where m.id_deportista = p_dep
     and m.proveedor = p_proveedor
     and m.tipo = 'entreno'
     and nullif(btrim(m.datos ->> 'disciplina'), '') is not null
     and m.fecha >= coalesce(p_desde, current_date - 28)
     and not exists (select 1 from public.reloj_detalle d where d.id_medicion = m.id)
   order by m.fecha desc, m.id desc
   limit 50
$$;
revoke all on function public.reloj_detalle_faltan_de(bigint, text, date) from public, anon, authenticated;

/* Guarda el detalle de cada entreno de la lista: [{id_externo, vueltas,
   tramos, tramo_m, fc_segundos, segundos_con_fc, motivo, version}]. Solo de
   entrenos que ya están en reloj_medicion de ESE deportista; lo demás se
   ignora. Lo repetido se reemplaza. */
create or replace function public.reloj_detalle_guardar_de(p_dep bigint, p_proveedor text, p_detalles jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
begin
  if p_detalles is null or jsonb_typeof(p_detalles) <> 'array' then
    return 0;
  end if;
  if jsonb_array_length(p_detalles) > 20 then
    raise exception 'Demasiados detalles de una vez';
  end if;

  insert into public.reloj_detalle (id_medicion, id_deportista, proveedor, vueltas, tramos, tramo_m,
                                    fc_segundos, segundos_con_fc, motivo, version, recibido_en)
  select m.id, m.id_deportista, m.proveedor,
         case when jsonb_typeof(x -> 'vueltas') = 'array' then x -> 'vueltas' else '[]'::jsonb end,
         case when jsonb_typeof(x -> 'tramos') = 'array' then x -> 'tramos' else '[]'::jsonb end,
         /* Un case dentro de otro: así no se convierte a número nada que no lo sea. */
         case when (x ->> 'tramo_m') ~ '^[0-9]{2,6}$'
              then case when (x ->> 'tramo_m')::int between 25 and 100000 then (x ->> 'tramo_m')::int end end,
         case when jsonb_typeof(x -> 'fc_segundos') = 'object' then x -> 'fc_segundos' else '{}'::jsonb end,
         case when (x ->> 'segundos_con_fc') ~ '^[0-9]{1,6}$'
              then least((x ->> 'segundos_con_fc')::int, 172800) else 0 end,
         left(nullif(btrim(x ->> 'motivo'), ''), 300),
         case when (x ->> 'version') ~ '^[0-9]{1,3}$' then (x ->> 'version')::smallint else 1 end,
         now()
    from jsonb_array_elements(p_detalles) as x
    join public.reloj_medicion m
      on m.id_deportista = p_dep
     and m.proveedor = p_proveedor
     and m.tipo = 'entreno'
     and m.id_externo = x ->> 'id_externo'
   where coalesce(x ->> 'id_externo', '') <> ''
     and pg_column_size(x) < 200000
     and jsonb_array_length(case when jsonb_typeof(x -> 'vueltas') = 'array' then x -> 'vueltas' else '[]'::jsonb end) <= 500
     and jsonb_array_length(case when jsonb_typeof(x -> 'tramos') = 'array' then x -> 'tramos' else '[]'::jsonb end) <= 1000
  on conflict (id_medicion) do update
    set vueltas = excluded.vueltas, tramos = excluded.tramos, tramo_m = excluded.tramo_m,
        fc_segundos = excluded.fc_segundos, segundos_con_fc = excluded.segundos_con_fc,
        motivo = excluded.motivo, version = excluded.version, recibido_en = now();

  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.reloj_detalle_guardar_de(bigint, text, jsonb) from public, anon, authenticated;


/* ========== Las del propio deportista (con su sesión) ========== */

create or replace function public.reloj_entrenos_sin_detalle(p_proveedor text, p_desde date)
returns table(id_externo text, fecha date, deporte_codigo text, disciplina text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dep bigint;
begin
  select d.id into v_dep
    from public.deportista d
    join public.reloj_conexion c on c.id_deportista = d.id and c.proveedor = p_proveedor
   where d.id_usuario = auth.uid()
   order by d.id
   limit 1;
  if v_dep is null then
    raise exception 'No tienes ese reloj conectado';
  end if;
  return query select * from public.reloj_detalle_faltan_de(v_dep, p_proveedor, p_desde);
end $$;
revoke all on function public.reloj_entrenos_sin_detalle(text, date) from public, anon, authenticated;
grant execute on function public.reloj_entrenos_sin_detalle(text, date) to authenticated;

create or replace function public.reloj_guardar_detalle(p_proveedor text, p_detalles jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep bigint;
begin
  select d.id into v_dep
    from public.deportista d
    join public.reloj_conexion c on c.id_deportista = d.id and c.proveedor = p_proveedor
   where d.id_usuario = auth.uid()
   order by d.id
   limit 1;
  if v_dep is null then
    raise exception 'No tienes ese reloj conectado';
  end if;
  return public.reloj_detalle_guardar_de(v_dep, p_proveedor, p_detalles);
end $$;
revoke all on function public.reloj_guardar_detalle(text, jsonb) from public, anon, authenticated;
grant execute on function public.reloj_guardar_detalle(text, jsonb) to authenticated;


/* ========== Las del servidor (sin sesión, con la llave) ========== */

create or replace function public.reloj_servidor_entrenos_sin_detalle(p_llave text, p_deportista bigint, p_proveedor text, p_desde date)
returns table(id_externo text, fecha date, deporte_codigo text, disciplina text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.reloj_llave_valida(p_llave) then
    raise exception 'Solo desde el servidor' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reloj_conexion c where c.id_deportista = p_deportista and c.proveedor = p_proveedor) then
    raise exception 'Ese deportista no tiene ese reloj conectado';
  end if;
  return query select * from public.reloj_detalle_faltan_de(p_deportista, p_proveedor, p_desde);
end $$;
revoke all on function public.reloj_servidor_entrenos_sin_detalle(text, bigint, text, date) from public, anon, authenticated;
grant execute on function public.reloj_servidor_entrenos_sin_detalle(text, bigint, text, date) to anon;

create or replace function public.reloj_servidor_guardar_detalle(p_llave text, p_deportista bigint, p_proveedor text, p_detalles jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.reloj_llave_valida(p_llave) then
    raise exception 'Solo desde el servidor' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reloj_conexion c where c.id_deportista = p_deportista and c.proveedor = p_proveedor) then
    raise exception 'Ese deportista no tiene ese reloj conectado';
  end if;
  return public.reloj_detalle_guardar_de(p_deportista, p_proveedor, p_detalles);
end $$;
revoke all on function public.reloj_servidor_guardar_detalle(text, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.reloj_servidor_guardar_detalle(text, bigint, text, jsonb) to anon;
