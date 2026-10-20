/* ============================================================
   ENSAYO de reloj-detalle.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: la tabla y las funciones nuevas, las conexiones y los entrenos de
   prueba (con su secreto del Vault) y lo que se guarde con ellos.

   NO TOCA NADA DE VERDAD: se montan conexiones de COROS INVENTADAS para P y V,
   dos deportistas sin ningún reloj ni nada recibido nunca, con entrenos
   inventados («ensayo-…»). El informe solo cuenta lo de P y V.

   LA LLAVE: como en el ensayo de relojes-servidor, la huella de verdad se
   cambia SOLO PARA ESTE ENSAYO por la de «llave-de-ensayo».

   0. CONTROL: la tabla y las funciones nuevas todavía no existen.
   1. La migración, con el fichero tal cual.
   2. Lo de siempre no cambia, y quién puede llamar a qué.
   3. Las puertas: qué falta (solo lo que cuenta y reciente), guardar (solo lo
      suyo), reemplazar, quién lo ve, nadie lo escribe a mano, las del
      servidor, lo mal formado y el borrado en cascada.

   «Entrenador normal» = sin plataforma_admin. Los protagonistas se eligen
   solos con lo que haya en la base: no lleva ids escritos, porque el
   repositorio es público. Deja huecos en los contadores de id. Es inofensivo.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (e uuid, p bigint, usr_p uuid, v bigint, usr_v uuid, w uuid);
create temp table _antes (firma text, huella text);

insert into _antes
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'reloj%';

/* Una consulta como el servidor (anon), DESHECHA: su primer valor, o ERR y el código. */
create function pg_temp.anon(_sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
    execute _sql into _res;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := 'ERR ' || sqlstate; end if;
  end;
  perform set_config('role', 'postgres', true);
  return coalesce(_res, '(nada)');
end $f$;

/* Lo mismo, pero lo que haga SE QUEDA (hasta el final del ensayo). */
create function pg_temp.anon_firme(_sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
    execute _sql into _res;
  exception when others then
    _res := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  return coalesce(_res, '(nada)');
end $f$;

/* Una consulta como una persona con sesión, DESHECHA. */
create function pg_temp.sesion(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql into _res;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := 'ERR ' || sqlstate; end if;
  end;
  perform set_config('role', 'postgres', true);
  return coalesce(_res, '(nada)');
end $f$;

/* Lo mismo, pero lo que haga SE QUEDA. */
create function pg_temp.sesion_firme(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql into _res;
  exception when others then
    _res := 'ERR ' || sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  return coalesce(_res, '(nada)');
end $f$;

/* Los protagonistas, y sus conexiones y entrenos de prueba */
do $sel$
declare _e uuid; _p bigint; _usr_p uuid; _v bigint; _usr_v uuid; _w uuid; _con bigint; _sec uuid;
begin
  /* P: deportista con cuenta, de un entrenador normal E, sin reloj y sin nada recibido nunca */
  select x.id, x.id_usuario, x.id_entrenador into _p, _usr_p, _e
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
    join public.perfiles pu on pu.id = x.id_usuario and pu.rol = 'deportista'
   where x.id_usuario <> x.id_entrenador
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and x.id_usuario not in (select id_perfil from public.plataforma_admin)
     and not exists (select 1 from public.reloj_conexion c where c.id_deportista = x.id)
     and not exists (select 1 from public.reloj_medicion m where m.id_deportista = x.id)
   order by x.id limit 1;

  /* V: deportista con cuenta de OTRO entrenador normal W, igual de limpio */
  select x.id, x.id_usuario, x.id_entrenador into _v, _usr_v, _w
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
    join public.perfiles pu on pu.id = x.id_usuario and pu.rol = 'deportista'
   where x.id <> _p and x.id_entrenador <> _e
     and x.id_usuario <> x.id_entrenador
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and x.id_usuario not in (select id_perfil from public.plataforma_admin)
     and not exists (select 1 from public.reloj_conexion c where c.id_deportista = x.id)
     and not exists (select 1 from public.reloj_medicion m where m.id_deportista = x.id)
   order by x.id limit 1;

  if _e is null or _p is null or _usr_p is null or _v is null or _usr_v is null or _w is null then
    raise exception 'ENSAYO: no hay datos para montar el escenario (E %, P %, V %, W %)', _e, _p, _v, _w;
  end if;
  insert into _actores values (_e, _p, _usr_p, _v, _usr_v, _w);

  insert into public.reloj_conexion (id_deportista, proveedor, id_externo, conectado_en, caduca_en)
  values (_p, 'coros', 'ensayo', now(), now() + interval '30 days') returning id into _con;
  _sec := vault.create_secret('{"access":"ensayo-access-P","refresh":"ensayo-refresh-P","extra":null}', null, 'ENSAYO reloj-detalle P', null);
  insert into public.reloj_token (id_conexion, id_secreto, actualizado_en) values (_con, _sec, now());

  insert into public.reloj_conexion (id_deportista, proveedor, id_externo, conectado_en, caduca_en)
  values (_v, 'coros', 'ensayo', now(), now() + interval '30 days') returning id into _con;
  _sec := vault.create_secret('{"access":"ensayo-access-V","refresh":"ensayo-refresh-V","extra":null}', null, 'ENSAYO reloj-detalle V', null);
  insert into public.reloj_token (id_conexion, id_secreto, actualizado_en) values (_con, _sec, now());

  /* De P: una carrera reciente, una caminata reciente y una carrera vieja. De V: una carrera. */
  insert into public.reloj_medicion (id_deportista, proveedor, tipo, fecha, id_externo, datos) values
    (_p, 'coros', 'entreno', current_date - 1,  'ensayo-carrera',  '{"disciplina":"Carrera","deporte_codigo":"100"}'),
    (_p, 'coros', 'entreno', current_date - 2,  'ensayo-caminata', '{"disciplina":null,"deporte_codigo":"900"}'),
    (_p, 'coros', 'entreno', current_date - 60, 'ensayo-vieja',    '{"disciplina":"Carrera","deporte_codigo":"100"}'),
    (_v, 'coros', 'entreno', current_date - 1,  'ensayo-de-v',     '{"disciplina":"Ciclismo","deporte_codigo":"200"}');

  insert into _informe (linea) values (format(
    'Protagonistas: P = deportista %s (de un entrenador normal E) y V = deportista %s (de otro entrenador normal W), los dos con cuenta, con un COROS inventado. P tiene una carrera de ayer, una caminata de anteayer y una carrera de hace 60 días; V, una salida en bici de ayer.',
    _p, _v));
end $sel$;

/* 0. CONTROL con lo de hoy */
do $ctl$
declare _x record; _r1 text;
begin
  select * into _x from _actores;
  _r1 := pg_temp.sesion(_x.usr_p, $q$select count(*)::text from public.reloj_entrenos_sin_detalle('coros', null)$q$);
  insert into _informe (linea) values
    (format('CONTROL 1. La tabla reloj_detalle antes de la migración: %s (se espera que no exista)%s',
      case when to_regclass('public.reloj_detalle') is null then 'no existe' else 'EXISTE' end,
      case when to_regclass('public.reloj_detalle') is not null then '   <<< CONTROL ROTO' else '' end)),
    (format('CONTROL 2. reloj_entrenos_sin_detalle antes de la migración: %s (se espera ERR 42883)%s',
      _r1, case when _r1 <> 'ERR 42883' then '   <<< CONTROL ROTO' else '' end));
end $ctl$;

/* 1. La migración: el fichero reloj-detalle.sql tal cual */
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

/* 2. Lo de siempre no cambia, y quién puede llamar a qué */
do $igual$
declare _cambiadas text; _malas text; _fallos int := 0; _t text;
begin
  select string_agg(a.firma, ', ') into _cambiadas
    from _antes a
    left join (
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as firma, md5(pg_get_functiondef(p.oid)) as huella
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'reloj%'
    ) d on d.firma = a.firma
   where d.huella is distinct from a.huella;
  insert into _informe (linea) values (format('2a. Funciones reloj_* que ya había y cambian o desaparecen: %s (se espera ninguna)%s',
    coalesce(_cambiadas, 'ninguna'), case when _cambiadas is not null then '   <<< FALLO' else '' end));
  if _cambiadas is not null then _fallos := _fallos + 1; end if;

  /* [función, anon puede, sesión puede] */
  select string_agg(f, ', ') into _malas
    from (values
      ('public.reloj_detalle_faltan_de(bigint,text,date)', false, false),
      ('public.reloj_detalle_guardar_de(bigint,text,jsonb)', false, false),
      ('public.reloj_entrenos_sin_detalle(text,date)', false, true),
      ('public.reloj_guardar_detalle(text,jsonb)', false, true),
      ('public.reloj_servidor_entrenos_sin_detalle(text,bigint,text,date)', true, false),
      ('public.reloj_servidor_guardar_detalle(text,bigint,text,jsonb)', true, false)
    ) as x(f, anon_si, sesion_si)
   where has_function_privilege('anon', f, 'execute') <> anon_si
      or has_function_privilege('authenticated', f, 'execute') <> sesion_si;
  insert into _informe (linea) values (format('2b. Funciones nuevas con permisos que no tocan: %s (se espera ninguna)%s',
    coalesce(_malas, 'ninguna'), case when _malas is not null then '   <<< FALLO' else '' end));
  if _malas is not null then _fallos := _fallos + 1; end if;

  _t := concat_ws(' ',
    case when has_table_privilege('anon', 'public.reloj_detalle', 'select') then 'anon-LEE' end,
    case when has_table_privilege('anon', 'public.reloj_detalle', 'insert') then 'anon-ESCRIBE' end,
    case when not has_table_privilege('authenticated', 'public.reloj_detalle', 'select') then 'sesion-NO-LEE' end,
    case when has_table_privilege('authenticated', 'public.reloj_detalle', 'insert') then 'sesion-INSERTA' end,
    case when has_table_privilege('authenticated', 'public.reloj_detalle', 'update') then 'sesion-CAMBIA' end,
    case when has_table_privilege('authenticated', 'public.reloj_detalle', 'delete') then 'sesion-BORRA' end,
    case when not (select relrowsecurity from pg_class where oid = 'public.reloj_detalle'::regclass) then 'SIN-RLS' end);
  insert into _informe (linea) values (format('2c. La tabla: %s (se espera «ok»: sin anon, la sesión solo lee, con RLS)%s',
    coalesce(nullif(_t, ''), 'ok'), case when coalesce(_t, '') <> '' then '   <<< FALLO' else '' end));
  if coalesce(_t, '') <> '' then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('2. Fallos en este bloque: %s', _fallos));
end $igual$;

/* 3. Las puertas */
do $fin$
declare _x record; _r text; _fallos int := 0; _ok boolean; _n int;
  _detalle text;
begin
  select * into _x from _actores;
  _detalle := '{"id_externo":"%s","vueltas":[{"metros":2000,"segundos":980,"fc_media":139},{"metros":4000,"segundos":1928,"fc_media":151}],"tramos":[{"metros":1000,"segundos":494}],"tramo_m":1000,"fc_segundos":{"139":60,"151":60},"segundos_con_fc":120,"version":1}';

  /* Qué falta: solo lo que cuenta y reciente */
  _r := pg_temp.sesion(_x.usr_p, $q$select coalesce(string_agg(id_externo || ' ' || coalesce(deporte_codigo, '?'), ', '), 'nada') from public.reloj_entrenos_sin_detalle('coros', null)$q$);
  _ok := _r = 'ensayo-carrera 100';
  insert into _informe (linea) values (format('3a. P pide qué entrenos suyos no tienen detalle: %s (se espera «ensayo-carrera 100»: ni la caminata ni la de hace 60 días)%s',
    _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  _r := pg_temp.sesion(_x.usr_p, format($q$select count(*)::text from public.reloj_entrenos_sin_detalle('coros', %L)$q$, current_date - 90));
  insert into _informe (linea) values (format('3b. Lo mismo desde hace 90 días: %s (se espera 2: entra la vieja; la caminata no)%s',
    _r, case when _r <> '2' then '   <<< FALLO' else '' end));
  if _r <> '2' then _fallos := _fallos + 1; end if;

  /* Guardar: solo lo suyo */
  _r := pg_temp.sesion_firme(_x.usr_p, format($q$select public.reloj_guardar_detalle('coros', jsonb_build_array(%L::jsonb, %L::jsonb, %L::jsonb))::text$q$,
          format(_detalle, 'ensayo-carrera'), format(_detalle, 'ensayo-de-v'), format(_detalle, 'no-existe')));
  select count(*) into _n from public.reloj_detalle d join public.reloj_medicion m on m.id = d.id_medicion
   where m.id_externo = 'ensayo-carrera' and d.id_deportista = _x.p and d.proveedor = 'coros' and jsonb_array_length(d.vueltas) = 2 and d.tramo_m = 1000 and d.segundos_con_fc = 120;
  _ok := _r = '1' and _n = 1 and not exists (select 1 from public.reloj_detalle d join public.reloj_medicion m on m.id = d.id_medicion where m.id_externo = 'ensayo-de-v');
  insert into _informe (linea) values (format('3c. P guarda el detalle de su carrera, el de la bici de V y el de uno que no existe: %s guardado; el suyo bien: %s; el de V: %s (se espera 1, sí, no)%s',
    _r, case when _n = 1 then 'sí' else 'NO' end,
    case when exists (select 1 from public.reloj_detalle d join public.reloj_medicion m on m.id = d.id_medicion where m.id_externo = 'ensayo-de-v') then 'SÍ' else 'no' end,
    case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  _r := pg_temp.sesion(_x.usr_p, $q$select count(*)::text from public.reloj_entrenos_sin_detalle('coros', null)$q$);
  insert into _informe (linea) values (format('3d. Después, qué le falta a P: %s (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  /* Repetir reemplaza, no duplica */
  _r := pg_temp.sesion_firme(_x.usr_p, $q$select public.reloj_guardar_detalle('coros', '[{"id_externo":"ensayo-carrera","vueltas":[{"metros":6620,"segundos":3240}],"fc_segundos":{},"segundos_con_fc":0,"motivo":"El fichero no trae FC."}]'::jsonb)::text$q$);
  select count(*) into _n from public.reloj_detalle d join public.reloj_medicion m on m.id = d.id_medicion where m.id_externo = 'ensayo-carrera';
  _ok := _r = '1' and _n = 1 and exists (select 1 from public.reloj_detalle d join public.reloj_medicion m on m.id = d.id_medicion
    where m.id_externo = 'ensayo-carrera' and jsonb_array_length(d.vueltas) = 1 and d.tramo_m is null and d.motivo = 'El fichero no trae FC.' and d.tramos = '[]'::jsonb);
  insert into _informe (linea) values (format('3e. Guardar otra vez el de su carrera: %s; filas %s; reemplazado con lo nuevo: %s (se espera 1, 1, sí)%s',
    _r, _n, case when _ok then 'sí' else 'NO' end, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Quién lo ve */
  _r := concat_ws(' / ',
    'P ' || pg_temp.sesion(_x.usr_p, format('select count(*)::text from public.reloj_detalle where id_deportista = %s', _x.p)),
    'E ' || pg_temp.sesion(_x.e, format('select count(*)::text from public.reloj_detalle where id_deportista = %s', _x.p)),
    'V ' || pg_temp.sesion(_x.usr_v, format('select count(*)::text from public.reloj_detalle where id_deportista = %s', _x.p)),
    'W ' || pg_temp.sesion(_x.w, format('select count(*)::text from public.reloj_detalle where id_deportista = %s', _x.p)),
    'anon ' || pg_temp.anon(format('select count(*)::text from public.reloj_detalle where id_deportista = %s', _x.p)));
  _ok := _r = 'P 1 / E 1 / V 0 / W 0 / anon ERR 42501';
  insert into _informe (linea) values (format('3f. Quién ve el detalle de P: %s (se espera «P 1 / E 1 / V 0 / W 0 / anon ERR 42501»)%s',
    _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Nadie lo escribe a mano */
  _r := concat_ws(' / ',
    pg_temp.sesion(_x.usr_p, format('insert into public.reloj_detalle (id_medicion, id_deportista, proveedor) select id, id_deportista, proveedor from public.reloj_medicion where id_externo = %L returning 1', 'ensayo-vieja')),
    pg_temp.sesion(_x.usr_p, format('update public.reloj_detalle set motivo = %L where id_deportista = %s returning 1', 'x', _x.p)),
    pg_temp.sesion(_x.e, format('delete from public.reloj_detalle where id_deportista = %s returning 1', _x.p)));
  _ok := _r = 'ERR 42501 / ERR 42501 / ERR 42501';
  insert into _informe (linea) values (format('3g. Escribir la tabla a mano (P inserta, P cambia, E borra): %s (se espera 42501 las tres)%s',
    _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Las del deportista, sin sesión: nada */
  _r := pg_temp.anon($q$select count(*)::text from public.reloj_entrenos_sin_detalle('coros', null)$q$)
     || ' / ' || pg_temp.anon($q$select public.reloj_guardar_detalle('coros', '[]'::jsonb)::text$q$);
  _ok := _r = 'ERR 42501 / ERR 42501';
  insert into _informe (linea) values (format('3h. Las del deportista sin sesión: %s (se espera 42501 las dos)%s', _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Las del servidor, con la huella de verdad: nadie entra */
  _r := pg_temp.anon(format($q$select count(*)::text from public.reloj_servidor_entrenos_sin_detalle('llave-de-ensayo', %s, 'coros', null)$q$, _x.v))
     || ' / ' || pg_temp.anon(format($q$select public.reloj_servidor_guardar_detalle(null, %s, 'coros', '[]'::jsonb)::text$q$, _x.v))
     || ' / ' || pg_temp.sesion(_x.usr_v, format($q$select count(*)::text from public.reloj_servidor_entrenos_sin_detalle('llave-de-ensayo', %s, 'coros', null)$q$, _x.v));
  _ok := _r = 'ERR 42501 / ERR 42501 / ERR 42501';
  insert into _informe (linea) values (format('3i. Las del servidor con la huella de verdad (otra llave, sin llave, y con sesión): %s (se espera 42501 las tres)%s', _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* SOLO PARA EL ENSAYO: la huella pasa a ser la de «llave-de-ensayo» */
  execute $q$
    create or replace function public.reloj_llave_valida(p_llave text)
    returns boolean language sql immutable set search_path = public, extensions as $b$
      select coalesce(encode(extensions.digest(p_llave, 'sha256'), 'hex')
        = encode(extensions.digest('llave-de-ensayo', 'sha256'), 'hex'), false)
    $b$
  $q$;

  _r := pg_temp.anon(format($q$select coalesce(string_agg(id_externo || ' ' || coalesce(deporte_codigo, '?'), ', '), 'nada') from public.reloj_servidor_entrenos_sin_detalle('llave-de-ensayo', %s, 'coros', null)$q$, _x.v));
  _ok := _r = 'ensayo-de-v 200';
  insert into _informe (linea) values (format('3j. El servidor pide qué le falta a V: %s (se espera «ensayo-de-v 200»)%s', _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  _r := pg_temp.anon_firme(format($q$select public.reloj_servidor_guardar_detalle('llave-de-ensayo', %s, 'coros', jsonb_build_array(%L::jsonb, %L::jsonb))::text$q$,
          _x.v, format(_detalle, 'ensayo-de-v'), format(_detalle, 'ensayo-carrera')));
  _ok := _r = '1' and exists (select 1 from public.reloj_detalle d join public.reloj_medicion m on m.id = d.id_medicion where m.id_externo = 'ensayo-de-v' and d.id_deportista = _x.v)
     and (select jsonb_array_length(d.vueltas) from public.reloj_detalle d join public.reloj_medicion m on m.id = d.id_medicion where m.id_externo = 'ensayo-carrera') = 1;
  insert into _informe (linea) values (format('3k. El servidor guarda el de V y, colado, el de P: %s guardado; el de V bien y el de P sin tocar: %s (se espera 1, sí)%s',
    _r, case when _ok then 'sí' else 'NO' end, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  _r := pg_temp.anon($q$select count(*)::text from public.reloj_servidor_entrenos_sin_detalle('llave-de-ensayo', -1, 'coros', null)$q$)
     || ' / ' || pg_temp.anon($q$select public.reloj_servidor_guardar_detalle('llave-de-ensayo', -1, 'coros', '[]'::jsonb)::text$q$);
  _ok := _r = 'ERR P0001 / ERR P0001';
  insert into _informe (linea) values (format('3l. El servidor con un deportista sin ese reloj: %s (se espera P0001 las dos)%s', _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Lo mal formado */
  _r := pg_temp.sesion_firme(_x.usr_p, $q$select public.reloj_guardar_detalle('coros', '[{"id_externo":"ensayo-vieja","vueltas":"no es una lista","tramos":{"x":1},"tramo_m":"5; drop","fc_segundos":[1,2],"segundos_con_fc":"mucho","version":"x"}]'::jsonb)::text$q$);
  _ok := _r = '1' and exists (select 1 from public.reloj_detalle d join public.reloj_medicion m on m.id = d.id_medicion
    where m.id_externo = 'ensayo-vieja' and d.vueltas = '[]'::jsonb and d.tramos = '[]'::jsonb and d.tramo_m is null
      and d.fc_segundos = '{}'::jsonb and d.segundos_con_fc = 0 and d.version = 1);
  insert into _informe (linea) values (format('3m. Un detalle mal formado: %s guardado, con todo vacío en vez de basura: %s (se espera 1, sí)%s',
    _r, case when _ok then 'sí' else 'NO' end, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  _r := pg_temp.sesion(_x.usr_p, $q$select public.reloj_guardar_detalle('coros', (select jsonb_agg(jsonb_build_object('id_externo', 'x' || g)) from generate_series(1, 21) g))::text$q$);
  insert into _informe (linea) values (format('3n. Veintiún detalles de una vez: %s (se espera ERR P0001)%s', _r, case when _r <> 'ERR P0001' then '   <<< FALLO' else '' end));
  if _r <> 'ERR P0001' then _fallos := _fallos + 1; end if;

  /* Se va con su entreno */
  delete from public.reloj_medicion where id_externo = 'ensayo-carrera' and id_deportista = _x.p;
  _ok := not exists (select 1 from public.reloj_detalle where id_deportista = _x.p and vueltas @> '[{"metros":6620}]');
  insert into _informe (linea) values (format('3o. Al borrar su entreno, su detalle se va con él: %s (se espera sí)%s',
    case when _ok then 'sí' else 'NO' end, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('3. Fallos en este bloque: %s', _fallos));
end $fin$;

do $informe$
declare _r text;
begin
  select string_agg(linea, E'\n' order by orden) into _r from _informe;
  raise exception 'INFORME:%', E'\n' || _r;
end $informe$;
