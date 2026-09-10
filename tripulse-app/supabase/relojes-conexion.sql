/* ============================================================
   RELOJES: conectar Polar (y, sobre la misma base, COROS y Garmin)
   ============================================================
   TODO ADITIVO. Cuatro tablas nuevas, seis funciones y un disparador. Nada de
   lo que ya existe cambia. Para deshacerlo basta con borrar lo que se crea aquí.

   LOS TOKENS NO LOS LEE NINGÚN NAVEGADOR, Y VAN CIFRADOS.
   - Viven en el almacén cifrado de Supabase (Vault). En `reloj_token` solo
     queda la referencia al secreto, nunca el token.
   - Esa tabla tiene RLS activada y NINGUNA política: ni anon ni authenticated
     pueden leerla ni escribirla.
   - Solo se llega a un token a través de funciones SECURITY DEFINER que
     comprueban quién pregunta, y cada deportista solo puede sacar el suyo.
   - El entrenador ve SI su atleta está conectado y LO QUE HA LLEGADO, pero no
     puede sacar el token: con él tendría acceso a toda la cuenta de Polar del
     atleta, que es más de lo que le toca.

   LA APP NO USA LA CLAVE DE SERVICIO, y esto no la introduce. La vuelta de
   Polar llega sin sesión, así que su única puerta (`reloj_completar`) está
   abierta a anon, pero exige un estado aleatorio de un solo uso que caduca en
   15 minutos y que solo conoce el navegador de quien empezó la conexión.
*/

create table public.reloj_conexion (
  id bigint generated always as identity primary key,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  proveedor text not null check (proveedor in ('polar', 'coros', 'garmin')),
  id_externo text,
  conectado_en timestamptz not null default now(),
  caduca_en timestamptz,
  ultima_sincronizacion timestamptz,
  ultimo_error text,
  unique (id_deportista, proveedor)
);

create table public.reloj_token (
  id_conexion bigint primary key references public.reloj_conexion(id) on delete cascade,
  id_secreto uuid not null,
  actualizado_en timestamptz not null default now()
);

create table public.reloj_oauth_pendiente (
  estado text primary key,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  proveedor text not null check (proveedor in ('polar', 'coros', 'garmin')),
  caduca_en timestamptz not null
);

create table public.reloj_medicion (
  id bigint generated always as identity primary key,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  proveedor text not null check (proveedor in ('polar', 'coros', 'garmin')),
  tipo text not null check (tipo in ('sueno', 'recarga', 'entreno')),
  fecha date not null,
  id_externo text not null,
  datos jsonb not null default '{}'::jsonb,
  recibido_en timestamptz not null default now(),
  unique (id_deportista, proveedor, tipo, id_externo)
);

/* Índices para las claves ajenas que no quedan cubiertas por un unique. */
create index reloj_medicion_dep_fecha on public.reloj_medicion (id_deportista, fecha desc);
create index reloj_oauth_pendiente_dep on public.reloj_oauth_pendiente (id_deportista);

alter table public.reloj_conexion enable row level security;
alter table public.reloj_token enable row level security;
alter table public.reloj_oauth_pendiente enable row level security;
alter table public.reloj_medicion enable row level security;

/* Quién ve: el propio deportista y su entrenador (auth_dep_ids ya cubre al
   entrenador individual y al de grupo). Nadie escribe directamente. */
create policy reloj_conexion_ver on public.reloj_conexion
  for select to authenticated using (id_deportista in (select public.auth_dep_ids()));

create policy reloj_medicion_ver on public.reloj_medicion
  for select to authenticated using (id_deportista in (select public.auth_dep_ids()));

/* Además de RLS, sin permisos de tabla. Supabase los concede por defecto a
   anon y authenticated en todo lo que se crea en public. */
revoke all on public.reloj_token from anon, authenticated;
revoke all on public.reloj_oauth_pendiente from anon, authenticated;
revoke all on public.reloj_conexion from anon;
revoke all on public.reloj_medicion from anon;
revoke insert, update, delete, truncate, references, trigger on public.reloj_conexion from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.reloj_medicion from authenticated;


/* ------------------------------------------------------------
   El secreto se borra del almacén cuando se borra su fila.
   ------------------------------------------------------------
   Por el camino que sea: desconectar, o borrar al deportista en cascada.
   Sin esto, cada desconexión dejaría un token vivo huérfano en el Vault. */
create or replace function public.reloj_borrar_secreto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from vault.secrets where id = old.id_secreto;
  return old;
end $$;

create trigger reloj_token_borra_secreto
  after delete on public.reloj_token
  for each row execute function public.reloj_borrar_secreto();


/* ------------------------------------------------------------
   1. Empezar: el deportista pide conectar
   ------------------------------------------------------------
   Solo el propio atleta: el permiso lo da el dueño de la cuenta de Polar, y
   el entrenador no la tiene. Devuelve un estado aleatorio de un solo uso. */
create or replace function public.reloj_iniciar(p_proveedor text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_dep bigint;
  v_estado text;
begin
  if p_proveedor is null or p_proveedor not in ('polar', 'coros', 'garmin') then
    raise exception 'Proveedor desconocido';
  end if;

  select id into v_dep from public.deportista where id_usuario = auth.uid() order by id limit 1;
  if v_dep is null then
    raise exception 'Solo el deportista puede conectar su reloj';
  end if;

  delete from public.reloj_oauth_pendiente
   where caduca_en < now() or (id_deportista = v_dep and proveedor = p_proveedor);

  /* 244 bits de azar criptográfico (gen_random_uuid usa pg_strong_random). */
  v_estado := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.reloj_oauth_pendiente (estado, id_deportista, proveedor, caduca_en)
  values (v_estado, v_dep, p_proveedor, now() + interval '15 minutes');

  return v_estado;
end $$;


/* ------------------------------------------------------------
   2. Completar: vuelve Polar con el token
   ------------------------------------------------------------
   La llama la ruta de vuelta, que no tiene sesión. El estado se CONSUME aquí:
   si no existe, ha caducado o ya se usó, no se guarda nada. */
create or replace function public.reloj_completar(
  p_estado text,
  p_proveedor text,
  p_id_externo text,
  p_access_token text,
  p_refresh_token text,
  p_caduca_en timestamptz
)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_dep bigint;
  v_con bigint;
  v_secreto uuid;
  v_carga text;
begin
  if p_estado is null or length(p_estado) < 32 or coalesce(p_access_token, '') = '' then
    raise exception 'Conexión no válida';
  end if;

  delete from public.reloj_oauth_pendiente
   where estado = p_estado and proveedor = p_proveedor and caduca_en > now()
  returning id_deportista into v_dep;

  if v_dep is null then
    raise exception 'La conexión ha caducado o ya se usó. Vuelve a pulsar Conectar.';
  end if;

  insert into public.reloj_conexion (id_deportista, proveedor, id_externo, conectado_en, caduca_en, ultimo_error)
  values (v_dep, p_proveedor, p_id_externo, now(), p_caduca_en, null)
  on conflict (id_deportista, proveedor) do update
    set id_externo = excluded.id_externo,
        conectado_en = now(),
        caduca_en = excluded.caduca_en,
        ultimo_error = null
  returning id into v_con;

  v_carga := jsonb_build_object('access', p_access_token, 'refresh', p_refresh_token)::text;

  select id_secreto into v_secreto from public.reloj_token where id_conexion = v_con;
  if v_secreto is null then
    v_secreto := vault.create_secret(v_carga, null, 'TRIPULSE reloj ' || p_proveedor, null);
    insert into public.reloj_token (id_conexion, id_secreto, actualizado_en) values (v_con, v_secreto, now());
  else
    perform vault.update_secret(v_secreto, v_carga, null, null, null);
    update public.reloj_token set actualizado_en = now() where id_conexion = v_con;
  end if;
end $$;


/* ------------------------------------------------------------
   3. Leer el token propio, para sincronizar
   ------------------------------------------------------------
   Solo el del propio deportista. El entrenador no llega aquí. */
create or replace function public.reloj_token_propio(p_proveedor text)
returns table (id_externo text, access_token text, caduca_en timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id_externo,
         (s.decrypted_secret::jsonb ->> 'access') as access_token,
         c.caduca_en
    from public.reloj_conexion c
    join public.deportista d on d.id = c.id_deportista
    join public.reloj_token t on t.id_conexion = c.id
    join vault.decrypted_secrets s on s.id = t.id_secreto
   where d.id_usuario = auth.uid() and c.proveedor = p_proveedor
   order by d.id
   limit 1
$$;


/* ------------------------------------------------------------
   4. Guardar lo que ha llegado
   ------------------------------------------------------------
   Sobre el deportista de quien llama, nunca sobre uno que venga en los datos.
   Lo repetido se actualiza en vez de duplicarse. */
create or replace function public.reloj_guardar(p_proveedor text, p_mediciones jsonb, p_error text)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_dep bigint;
  v_n integer := 0;
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

  if p_mediciones is not null and jsonb_typeof(p_mediciones) = 'array' then
    if jsonb_array_length(p_mediciones) > 500 then
      raise exception 'Demasiadas mediciones de una vez';
    end if;

    insert into public.reloj_medicion (id_deportista, proveedor, tipo, fecha, id_externo, datos, recibido_en)
    select v_dep, p_proveedor, m ->> 'tipo', (m ->> 'fecha')::date, m ->> 'id_externo',
           coalesce(m -> 'datos', '{}'::jsonb), now()
      from jsonb_array_elements(p_mediciones) as m
     where m ->> 'tipo' in ('sueno', 'recarga', 'entreno')
       and (m ->> 'fecha') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       and coalesce(m ->> 'id_externo', '') <> ''
    on conflict (id_deportista, proveedor, tipo, id_externo) do update
      set fecha = excluded.fecha, datos = excluded.datos, recibido_en = now();

    get diagnostics v_n = row_count;
  end if;

  update public.reloj_conexion
     set ultima_sincronizacion = case when p_error is null then now() else ultima_sincronizacion end,
         ultimo_error = p_error
   where id_deportista = v_dep and proveedor = p_proveedor;

  return v_n;
end $$;


/* ------------------------------------------------------------
   5. Desconectar
   ------------------------------------------------------------
   Borra la conexión; el token cae en cascada y el disparador borra su
   secreto del almacén. Lo ya recibido se queda: es parte de su historial,
   igual que el wellness que escribió a mano. */
create or replace function public.reloj_desconectar(p_proveedor text)
returns void language sql volatile security definer set search_path = public as $$
  delete from public.reloj_conexion c
   using public.deportista d
   where d.id = c.id_deportista and d.id_usuario = auth.uid() and c.proveedor = p_proveedor
$$;


/* ------------------------------------------------------------
   Quién puede llamar a qué
   ------------------------------------------------------------
   Se quita a PUBLIC Y a anon/authenticated por separado: Postgres da EXECUTE
   a PUBLIC, y Supabase además se lo da directamente a los dos roles. */
revoke execute on function public.reloj_borrar_secreto() from public, anon, authenticated;

revoke execute on function public.reloj_iniciar(text) from public, anon, authenticated;
grant execute on function public.reloj_iniciar(text) to authenticated;

revoke execute on function public.reloj_completar(text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reloj_completar(text, text, text, text, text, timestamptz) to anon;

revoke execute on function public.reloj_token_propio(text) from public, anon, authenticated;
grant execute on function public.reloj_token_propio(text) to authenticated;

revoke execute on function public.reloj_guardar(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.reloj_guardar(text, jsonb, text) to authenticated;

revoke execute on function public.reloj_desconectar(text) from public, anon, authenticated;
grant execute on function public.reloj_desconectar(text) to authenticated;
