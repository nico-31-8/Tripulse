/* ============================================================
   RELOJES: COROS, y lo que hace falta para varios relojes
   ============================================================
   Aplicada el 10/09/2026 como `relojes_coros`. Aditiva salvo tres funciones
   que se amplían (reloj_completar, reloj_token_propio, reloj_iniciar); las
   llamadas que ya hacía Polar siguen valiendo tal cual.

   Lo que añade:
   1. COROS necesita guardar, además del token, su identificador de cliente
      (se da de alta sola, uno por conexión) y el token de renovación: sus
      tokens duran una hora. Va todo en el mismo secreto cifrado del Vault.
   2. Renovar el token del propio deportista sin volver a pedir permiso.
   3. `reloj_crudo`: lo que COROS devuelve la primera vez, tal cual. COROS no
      publica la forma de sus respuestas; la app la aprende de la primera
      cuenta conectada y así la traducción se escribe con datos reales, no
      adivinando nombres de campos.
   4. Un reloj a la vez. Dos relojes a la vez darían dos noches distintas
      para el mismo día, y el wellness no sabría cuál es la buena.
*/

/* ========== 1. Completar la conexión, ahora con «extra» ========== */
drop function if exists public.reloj_completar(text, text, text, text, text, timestamptz);

create function public.reloj_completar(
  p_estado text,
  p_proveedor text,
  p_id_externo text,
  p_access_token text,
  p_refresh_token text,
  p_caduca_en timestamptz,
  p_extra jsonb default null
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

  v_carga := jsonb_build_object('access', p_access_token, 'refresh', p_refresh_token, 'extra', p_extra)::text;

  select id_secreto into v_secreto from public.reloj_token where id_conexion = v_con;
  if v_secreto is null then
    v_secreto := vault.create_secret(v_carga, null, 'TRIPULSE reloj ' || p_proveedor, null);
    insert into public.reloj_token (id_conexion, id_secreto, actualizado_en) values (v_con, v_secreto, now());
  else
    perform vault.update_secret(v_secreto, v_carga, null, null, null);
    update public.reloj_token set actualizado_en = now() where id_conexion = v_con;
  end if;
end $$;

revoke execute on function public.reloj_completar(text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.reloj_completar(text, text, text, text, text, timestamptz, jsonb) to anon;


/* ========== 1b. Leer el token propio, con la renovación y el extra ========== */
drop function if exists public.reloj_token_propio(text);

create function public.reloj_token_propio(p_proveedor text)
returns table (id_externo text, access_token text, refresh_token text, extra jsonb, caduca_en timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id_externo,
         (s.decrypted_secret::jsonb ->> 'access') as access_token,
         (s.decrypted_secret::jsonb ->> 'refresh') as refresh_token,
         (s.decrypted_secret::jsonb -> 'extra') as extra,
         c.caduca_en
    from public.reloj_conexion c
    join public.deportista d on d.id = c.id_deportista
    join public.reloj_token t on t.id_conexion = c.id
    join vault.decrypted_secrets s on s.id = t.id_secreto
   where d.id_usuario = auth.uid() and c.proveedor = p_proveedor
   order by d.id
   limit 1
$$;

revoke execute on function public.reloj_token_propio(text) from public, anon, authenticated;
grant execute on function public.reloj_token_propio(text) to authenticated;


/* ========== 2. Renovar el token propio ========== */
/* Solo el del propio deportista. Conserva el «extra» (el cliente de COROS):
   si se perdiera, el siguiente token ya no se podría renovar. */
create or replace function public.reloj_renovar(
  p_proveedor text,
  p_access_token text,
  p_refresh_token text,
  p_caduca_en timestamptz
)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_con bigint;
  v_secreto uuid;
  v_actual jsonb;
begin
  if coalesce(p_access_token, '') = '' then
    raise exception 'Token no válido';
  end if;

  select c.id, t.id_secreto into v_con, v_secreto
    from public.reloj_conexion c
    join public.deportista d on d.id = c.id_deportista
    join public.reloj_token t on t.id_conexion = c.id
   where d.id_usuario = auth.uid() and c.proveedor = p_proveedor
   order by d.id
   limit 1;

  if v_con is null then
    raise exception 'No tienes ese reloj conectado';
  end if;

  select decrypted_secret::jsonb into v_actual from vault.decrypted_secrets where id = v_secreto;

  perform vault.update_secret(
    v_secreto,
    jsonb_build_object(
      'access', p_access_token,
      /* Si el proveedor no manda uno nuevo, se conserva el de antes. */
      'refresh', coalesce(p_refresh_token, v_actual ->> 'refresh'),
      'extra', v_actual -> 'extra'
    )::text,
    null, null, null);

  update public.reloj_token set actualizado_en = now() where id_conexion = v_con;
  update public.reloj_conexion set caduca_en = p_caduca_en, ultimo_error = null where id = v_con;
end $$;

revoke execute on function public.reloj_renovar(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reloj_renovar(text, text, text, timestamptz) to authenticated;


/* ========== 3. Lo que devuelve un proveedor, tal cual ========== */
create table public.reloj_crudo (
  id bigint generated always as identity primary key,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  proveedor text not null check (proveedor in ('polar', 'coros', 'garmin')),
  herramienta text not null,
  datos jsonb not null,
  recibido_en timestamptz not null default now(),
  unique (id_deportista, proveedor, herramienta)
);

alter table public.reloj_crudo enable row level security;

/* Son datos de salud del propio atleta: los ve él y su entrenador, como las
   mediciones. Y salen en «Descargar todos mis datos». */
create policy reloj_crudo_ver on public.reloj_crudo
  for select to authenticated using (id_deportista in (select public.auth_dep_ids()));

revoke all on public.reloj_crudo from anon;
revoke insert, update, delete, truncate, references, trigger on public.reloj_crudo from authenticated;

/* Guarda solo la última respuesta de cada herramienta: sirve para aprender su
   forma, no para acumular un histórico en bruto. */
create or replace function public.reloj_guardar_crudo(p_proveedor text, p_filas jsonb)
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

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    return 0;
  end if;
  if jsonb_array_length(p_filas) > 40 then
    raise exception 'Demasiadas respuestas de una vez';
  end if;

  insert into public.reloj_crudo (id_deportista, proveedor, herramienta, datos, recibido_en)
  select v_dep, p_proveedor, f ->> 'herramienta', f -> 'datos', now()
    from jsonb_array_elements(p_filas) as f
   where coalesce(f ->> 'herramienta', '') <> ''
     and f -> 'datos' is not null
     and pg_column_size(f -> 'datos') < 400000
  on conflict (id_deportista, proveedor, herramienta) do update
    set datos = excluded.datos, recibido_en = now();

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.reloj_guardar_crudo(text, jsonb) from public, anon, authenticated;
grant execute on function public.reloj_guardar_crudo(text, jsonb) to authenticated;


/* ========== 4. Un reloj a la vez ========== */
create or replace function public.reloj_iniciar(p_proveedor text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_dep bigint;
  v_estado text;
  v_otro text;
begin
  if p_proveedor is null or p_proveedor not in ('polar', 'coros', 'garmin') then
    raise exception 'Proveedor desconocido';
  end if;

  select id into v_dep from public.deportista where id_usuario = auth.uid() order by id limit 1;
  if v_dep is null then
    raise exception 'Solo el deportista puede conectar su reloj';
  end if;

  /* Dos relojes darían dos noches distintas para el mismo día. */
  select proveedor into v_otro from public.reloj_conexion
   where id_deportista = v_dep and proveedor <> p_proveedor limit 1;
  if v_otro is not null then
    raise exception 'Ya tienes conectado otro reloj (%). Desconéctalo antes de conectar este.',
      case v_otro when 'coros' then 'COROS' else initcap(v_otro) end;
  end if;

  delete from public.reloj_oauth_pendiente
   where caduca_en < now() or (id_deportista = v_dep and proveedor = p_proveedor);

  v_estado := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.reloj_oauth_pendiente (estado, id_deportista, proveedor, caduca_en)
  values (v_estado, v_dep, p_proveedor, now() + interval '15 minutes');

  return v_estado;
end $$;
