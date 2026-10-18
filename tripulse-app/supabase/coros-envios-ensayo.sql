/* ============================================================
   ENSAYO de coros-envios.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: las funciones y la tabla nuevas, las conexiones de prueba (con su
   secreto del Vault) y las filas de prueba.

   NO TOCA NINGUNA CONEXIÓN DE VERDAD: para probar las funciones del token se
   monta una conexión de COROS INVENTADA a dos deportistas que no tienen
   ninguna, con un token falso («ensayo-access-…»). El informe nunca enseña un
   token: solo si lo que devolvió es el del deportista que tocaba.

   LA LLAVE: la huella del fichero es la de la llave de verdad, que no está
   aquí. Se comprueba que esa huella NO acepta una llave cualquiera ni la
   vacía, y después, SOLO PARA ESTE ENSAYO, la función se cambia por una que
   acepta «llave-de-ensayo» para poder probar las puertas.

   1. CONTROL: con lo de hoy, el deportista P lee SU token de prueba con
      reloj_token_propio (si no, la conexión de prueba estaría mal montada), y
      la función nueva todavía no existe.
   2. La migración, con las mismas sentencias que el fichero.
   3. Las puertas, una a una y cada una deshecha. El token: solo su entrenador
      y solo con la llave; ni otro entrenador, ni el propio deportista, ni un
      director con acceso a él. Renovarlo: igual. Lo mandado: lo apunta solo
      su entrenador, a su nombre y con una sesión de ese deportista; lo ven él,
      el deportista y el director con acceso, y nadie más.

   «Entrenador normal» = sin plataforma_admin. Los protagonistas se eligen
   solos con lo que haya en la base: no lleva ids escritos, porque el
   repositorio es público. Deja huecos en los contadores de id. Es inofensivo.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (e uuid, p bigint, usr_p uuid, ses_p bigint, v bigint, ent_v uuid, ses_v bigint, d uuid);

/* Ejecuta una sentencia como esa persona y la deshace. ENTRA o el código del error. */
create function pg_temp.como(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql;
    _res := 'ENTRA';
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := sqlstate; end if;
  end;
  perform set_config('role', 'postgres', true);
  return _res;
end $f$;

/* Cuántas filas toca una sentencia como esa persona (deshecha), o el código del error. */
create function pg_temp.filas(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text; _n int;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql;
    get diagnostics _n = row_count;
    _res := _n::text;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := sqlstate; end if;
  end;
  perform set_config('role', 'postgres', true);
  return _res;
end $f$;

/* Lo que ve una persona de una consulta que cuenta, y vuelta a postgres. */
create function pg_temp.ve(_quien uuid, _sql text) returns int language plpgsql as $f$
declare _n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute _sql into _n;
  perform set_config('role', 'postgres', true);
  return _n;
end $f$;

/* Qué devuelve una función de token como esa persona: cuántas filas y de quién
   es el token. Nunca el token. */
create function pg_temp.token(_quien uuid, _sql text, _esperado text) returns text language plpgsql as $f$
declare _res text; _n int; _acc text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute 'select count(*), max(access_token) from (' || _sql || ') x' into _n, _acc;
    _res := _n || case when _acc is null then '' when _acc = _esperado then ' (el suyo)' else ' (OTRO)' end;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := 'ERR ' || sqlstate; end if;
  end;
  perform set_config('role', 'postgres', true);
  return _res;
end $f$;

/* Los protagonistas, y sus conexiones de prueba */
do $sel$
declare _e uuid; _p bigint; _usr_p uuid; _ses_p bigint; _v bigint; _ent_v uuid; _ses_v bigint; _d uuid;
        _con bigint; _sec uuid;
begin
  /* P: deportista con cuenta, sin ningún reloj y con sesiones, de un entrenador normal E */
  select x.id, x.id_usuario, x.id_entrenador into _p, _usr_p, _e
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
    join public.perfiles pu on pu.id = x.id_usuario and pu.rol = 'deportista'
   where x.id_grupo is null and not x.solo_test
     and x.id_usuario <> x.id_entrenador
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and x.id_usuario not in (select id_perfil from public.plataforma_admin)
     and exists (select 1 from public.sesion s where s.id_deportista = x.id)
     and not exists (select 1 from public.reloj_conexion c where c.id_deportista = x.id)
   order by x.id limit 1;
  select s.id into _ses_p from public.sesion s where s.id_deportista = _p order by s.id limit 1;

  /* V: deportista sin reloj y con sesiones, de OTRO entrenador normal */
  select x.id, x.id_entrenador into _v, _ent_v
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
   where x.id_entrenador <> _e and x.id_grupo is null and not x.solo_test
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and (x.id_usuario is null or x.id_usuario <> _e)
     and exists (select 1 from public.sesion s where s.id_deportista = x.id)
     and not exists (select 1 from public.reloj_conexion c where c.id_deportista = x.id)
   order by x.id limit 1;
  select s.id into _ses_v from public.sesion s where s.id_deportista = _v order by s.id limit 1;

  /* D: otro entrenador normal, que hará de director de E con acceso a P */
  select p.id into _d from public.perfiles p
   where p.rol = 'entrenador'
     and p.id not in (select id_perfil from public.plataforma_admin)
     and p.id <> _e and p.id <> _ent_v
     and not exists (select 1 from public.director r where r.id_perfil = p.id)
   order by p.id limit 1;

  if _e is null or _p is null or _ses_p is null or _v is null or _ses_v is null or _d is null then
    raise exception 'ENSAYO: no hay datos para montar el escenario (E %, P %, sesión de P %, V %, sesión de V %, D %)', _e, _p, _ses_p, _v, _ses_v, _d;
  end if;
  insert into _actores values (_e, _p, _usr_p, _ses_p, _v, _ent_v, _ses_v, _d);

  /* Conexiones de COROS INVENTADAS para P y V, con token falso */
  insert into public.reloj_conexion (id_deportista, proveedor, id_externo, conectado_en, caduca_en)
  values (_p, 'coros', 'ensayo', now(), now() + interval '1 hour') returning id into _con;
  _sec := vault.create_secret('{"access":"ensayo-access-P","refresh":"ensayo-refresh-P","extra":null}', null, 'ENSAYO coros-envios P', null);
  insert into public.reloj_token (id_conexion, id_secreto, actualizado_en) values (_con, _sec, now());

  insert into public.reloj_conexion (id_deportista, proveedor, id_externo, conectado_en, caduca_en)
  values (_v, 'coros', 'ensayo', now(), now() + interval '1 hour') returning id into _con;
  _sec := vault.create_secret('{"access":"ensayo-access-V","refresh":"ensayo-refresh-V","extra":null}', null, 'ENSAYO coros-envios V', null);
  insert into public.reloj_token (id_conexion, id_secreto, actualizado_en) values (_con, _sec, now());

  /* D, director de E con el acceso a P concedido */
  insert into public.director (id_perfil) values (_d);
  insert into public.director_entrenador (id_director, id_entrenador, estado) values (_d, _e, 'activo');
  insert into public.director_acceso (id_director, id_deportista, estado) values (_d, _p, 'concedido');

  insert into _informe (linea) values (format(
    'Protagonistas: E = entrenador normal %s con su deportista P (con cuenta %s); V = deportista de otro entrenador normal %s; D = entrenador normal %s, aquí director de E con acceso a P. P y V llevan una conexión de COROS inventada.',
    left(_e::text, 8), left(_usr_p::text, 8), left(_ent_v::text, 8), left(_d::text, 8)));
end $sel$;

/* 1. CONTROL con lo de hoy */
do $ctl$
declare _x record; _r1 text; _r2 text; _ok_d boolean;
begin
  select * into _x from _actores;
  _r1 := pg_temp.token(_x.usr_p, $q$select access_token from public.reloj_token_propio('coros')$q$, 'ensayo-access-P');
  _r2 := pg_temp.como(_x.e, format($q$select * from public.reloj_token_de('x', %s, 'coros')$q$, _x.p));
  perform set_config('request.jwt.claims', json_build_object('sub', _x.d, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select _x.p in (select public.auth_dep_ids()) into _ok_d;
  perform set_config('role', 'postgres', true);
  insert into _informe (linea) values
    (format('CONTROL 1. El deportista P lee su token de prueba con lo de HOY: %s (se espera «1 (el suyo)»)%s', _r1, case when _r1 <> '1 (el suyo)' then '   <<< CONTROL ROTO' else '' end)),
    (format('CONTROL 2. reloj_token_de antes de la migración: %s (se espera 42883: todavía no existe)%s', _r2, case when _r2 <> '42883' then '   <<< CONTROL ROTO' else '' end)),
    (format('CONTROL 3. El director D tiene a P entre los que ve: %s (se espera sí)%s', case when _ok_d then 'sí' else 'no' end, case when not _ok_d then '   <<< CONTROL ROTO' else '' end));
end $ctl$;

/* 2. La migración: MISMAS sentencias que coros-envios.sql */
create or replace function public.reloj_llave_valida(p_llave text)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select coalesce(
    encode(extensions.digest(p_llave, 'sha256'), 'hex')
      = '9a8f8bb5a26e82274d9797db5b4d378c34e12f75630f0ddf624632cf2eccd2a3',
    false)
$$;
revoke all on function public.reloj_llave_valida(text) from public, anon, authenticated;

create or replace function public.reloj_token_de(p_llave text, p_deportista bigint, p_proveedor text)
returns table(id_externo text, access_token text, refresh_token text, extra jsonb, caduca_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.reloj_llave_valida(p_llave) then
    raise exception 'Solo desde el servidor' using errcode = '42501';
  end if;

  return query
  select c.id_externo,
         (s.decrypted_secret::jsonb ->> 'access'),
         (s.decrypted_secret::jsonb ->> 'refresh'),
         (s.decrypted_secret::jsonb -> 'extra'),
         c.caduca_en
    from public.reloj_conexion c
    join public.deportista d on d.id = c.id_deportista
    join public.reloj_token t on t.id_conexion = c.id
    join vault.decrypted_secrets s on s.id = t.id_secreto
   where c.id_deportista = p_deportista
     and c.proveedor = p_proveedor
     and d.id_entrenador = auth.uid();
end $$;
revoke all on function public.reloj_token_de(text, bigint, text) from public, anon;
grant execute on function public.reloj_token_de(text, bigint, text) to authenticated;

create or replace function public.reloj_renovar_de(
  p_llave text, p_deportista bigint, p_proveedor text,
  p_access_token text, p_refresh_token text, p_caduca_en timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_con bigint;
  v_secreto uuid;
  v_actual jsonb;
begin
  if not public.reloj_llave_valida(p_llave) then
    raise exception 'Solo desde el servidor' using errcode = '42501';
  end if;
  if coalesce(p_access_token, '') = '' then
    raise exception 'Token no válido';
  end if;

  select c.id, t.id_secreto into v_con, v_secreto
    from public.reloj_conexion c
    join public.deportista d on d.id = c.id_deportista
    join public.reloj_token t on t.id_conexion = c.id
   where c.id_deportista = p_deportista
     and c.proveedor = p_proveedor
     and d.id_entrenador = auth.uid();

  if v_con is null then
    raise exception 'Ese deportista no tiene ese reloj conectado';
  end if;

  select decrypted_secret::jsonb into v_actual from vault.decrypted_secrets where id = v_secreto;

  perform vault.update_secret(
    v_secreto,
    jsonb_build_object(
      'access', p_access_token,
      'refresh', coalesce(p_refresh_token, v_actual ->> 'refresh'),
      'extra', v_actual -> 'extra'
    )::text,
    null, null, null);

  update public.reloj_token set actualizado_en = now() where id_conexion = v_con;
  update public.reloj_conexion set caduca_en = p_caduca_en where id = v_con;
end $$;
revoke all on function public.reloj_renovar_de(text, bigint, text, text, text, timestamptz) from public, anon;
grant execute on function public.reloj_renovar_de(text, bigint, text, text, text, timestamptz) to authenticated;

create table if not exists public.reloj_envio (
  id bigint generated by default as identity primary key,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  proveedor text not null check (proveedor in ('coros')),
  id_sesion bigint references public.sesion(id) on delete set null,
  parte smallint not null default 1 check (parte in (1, 2)),
  fecha date not null,
  id_externo text not null check (length(id_externo) between 1 and 200),
  huella text not null check (length(huella) between 8 and 128),
  nombre text not null check (length(btrim(nombre)) between 1 and 200),
  enviado_en timestamptz not null default now(),
  enviado_por uuid default auth.uid(),
  unique (id_deportista, proveedor, id_externo)
);
create index if not exists reloj_envio_sesion on public.reloj_envio (id_sesion);
create index if not exists reloj_envio_dep_fecha on public.reloj_envio (id_deportista, fecha);

create or replace function public.reloj_envio_misma_sesion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id_sesion is not null and new.id_deportista is distinct from
     (select s.id_deportista from sesion s where s.id = new.id_sesion) then
    raise exception 'La sesión no es de ese deportista' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_reloj_envio_misma_sesion on public.reloj_envio;
create trigger trg_reloj_envio_misma_sesion before insert or update on public.reloj_envio
  for each row execute function public.reloj_envio_misma_sesion();

alter table public.reloj_envio enable row level security;

drop policy if exists reloj_envio_ver on public.reloj_envio;
create policy reloj_envio_ver on public.reloj_envio for select to authenticated
  using (id_deportista in (select public.auth_dep_ids()));

drop policy if exists reloj_envio_alta on public.reloj_envio;
create policy reloj_envio_alta on public.reloj_envio for insert to authenticated
  with check (
    enviado_por = (select auth.uid())
    and exists (select 1 from public.deportista d
                 where d.id = id_deportista and d.id_entrenador = (select auth.uid()))
  );

drop policy if exists reloj_envio_cambio on public.reloj_envio;
create policy reloj_envio_cambio on public.reloj_envio for update to authenticated
  using (exists (select 1 from public.deportista d
                  where d.id = id_deportista and d.id_entrenador = (select auth.uid())))
  with check (
    enviado_por = (select auth.uid())
    and exists (select 1 from public.deportista d
                 where d.id = id_deportista and d.id_entrenador = (select auth.uid()))
  );

drop policy if exists reloj_envio_baja on public.reloj_envio;
create policy reloj_envio_baja on public.reloj_envio for delete to authenticated
  using (exists (select 1 from public.deportista d
                  where d.id = id_deportista and d.id_entrenador = (select auth.uid())));

/* 3. Las puertas */
do $fin$
declare _x record; _r text; _fallos int := 0;
  _llave_mala boolean; _llave_nula boolean; _priv_anon boolean; _priv_auth boolean; _priv_llave boolean;
begin
  select * into _x from _actores;

  /* La huella de verdad no acepta cualquier cosa */
  select public.reloj_llave_valida('llave-de-ensayo'), public.reloj_llave_valida(null) into _llave_mala, _llave_nula;
  select has_function_privilege('anon', 'public.reloj_token_de(text,bigint,text)', 'execute'),
         has_function_privilege('authenticated', 'public.reloj_token_de(text,bigint,text)', 'execute'),
         has_function_privilege('authenticated', 'public.reloj_llave_valida(text)', 'execute')
    into _priv_anon, _priv_auth, _priv_llave;
  insert into _informe (linea) values
    (format('0a. La huella de verdad con una llave cualquiera: %s; sin llave: %s (se espera no y no)', case when _llave_mala then 'sí' else 'no' end, case when _llave_nula then 'sí' else 'no' end)),
    (format('0b. Quién puede llamar a reloj_token_de: sin sesión %s, con sesión %s; y a la de la huella, con sesión %s (se espera no, sí, no)',
      case when _priv_anon then 'sí' else 'no' end, case when _priv_auth then 'sí' else 'no' end, case when _priv_llave then 'sí' else 'no' end));
  if _llave_mala or _llave_nula then _fallos := _fallos + 1; end if;
  if _priv_anon or not _priv_auth or _priv_llave then _fallos := _fallos + 1; end if;

  /* SOLO PARA EL ENSAYO: la huella pasa a ser la de «llave-de-ensayo» */
  execute $q$
    create or replace function public.reloj_llave_valida(p_llave text)
    returns boolean language sql immutable set search_path = public, extensions as $b$
      select coalesce(encode(extensions.digest(p_llave, 'sha256'), 'hex')
        = encode(extensions.digest('llave-de-ensayo', 'sha256'), 'hex'), false)
    $b$
  $q$;

  /* El token */
  _r := pg_temp.token(_x.e, format($q$select access_token from public.reloj_token_de('llave-de-ensayo', %s, 'coros')$q$, _x.p), 'ensayo-access-P');
  insert into _informe (linea) values (format('1. Su entrenador E, con la llave, pide el token de P: %s (se espera «1 (el suyo)»)%s', _r, case when _r <> '1 (el suyo)' then '   <<< FALLO' else '' end));
  if _r <> '1 (el suyo)' then _fallos := _fallos + 1; end if;

  _r := pg_temp.token(_x.e, format($q$select access_token from public.reloj_token_de('otra', %s, 'coros')$q$, _x.p), 'ensayo-access-P');
  insert into _informe (linea) values (format('2. E con otra llave: %s (se espera ERR 42501)%s', _r, case when _r <> 'ERR 42501' then '   <<< FALLO' else '' end));
  if _r <> 'ERR 42501' then _fallos := _fallos + 1; end if;

  _r := pg_temp.token(_x.e, format($q$select access_token from public.reloj_token_de(null, %s, 'coros')$q$, _x.p), 'ensayo-access-P');
  insert into _informe (linea) values (format('3. E sin llave (como desde el navegador): %s (se espera ERR 42501)%s', _r, case when _r <> 'ERR 42501' then '   <<< FALLO' else '' end));
  if _r <> 'ERR 42501' then _fallos := _fallos + 1; end if;

  _r := pg_temp.token(_x.e, format($q$select access_token from public.reloj_token_de('llave-de-ensayo', %s, 'coros')$q$, _x.v), 'ensayo-access-V');
  insert into _informe (linea) values (format('4. E, con la llave, pide el token de V (de otro entrenador): %s (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  _r := pg_temp.token(_x.ent_v, format($q$select access_token from public.reloj_token_de('llave-de-ensayo', %s, 'coros')$q$, _x.p), 'ensayo-access-P');
  insert into _informe (linea) values (format('5. El entrenador de V, con la llave, pide el de P: %s (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  _r := pg_temp.token(_x.usr_p, format($q$select access_token from public.reloj_token_de('llave-de-ensayo', %s, 'coros')$q$, _x.p), 'ensayo-access-P');
  insert into _informe (linea) values (format('6. El propio deportista P por esta puerta: %s (se espera 0: la suya es reloj_token_propio)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  _r := pg_temp.token(_x.d, format($q$select access_token from public.reloj_token_de('llave-de-ensayo', %s, 'coros')$q$, _x.p), 'ensayo-access-P');
  insert into _informe (linea) values (format('7. El director D, con acceso a P y con la llave: %s (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  /* Renovarlo */
  _r := pg_temp.como(_x.e, format($q$select public.reloj_renovar_de('llave-de-ensayo', %s, 'coros', 'ensayo-nuevo', 'ensayo-nuevo-r', now() + interval '1 hour')$q$, _x.p));
  insert into _informe (linea) values (format('8. E renueva el token de P con la llave: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.e, format($q$select public.reloj_renovar_de(null, %s, 'coros', 'ensayo-nuevo', null, now())$q$, _x.p));
  insert into _informe (linea) values (format('9. E lo renueva sin llave: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.ent_v, format($q$select public.reloj_renovar_de('llave-de-ensayo', %s, 'coros', 'ensayo-nuevo', null, now())$q$, _x.p));
  insert into _informe (linea) values (format('10. El entrenador de V renueva el de P con la llave: %s (se espera P0001: «no tiene ese reloj»)%s', _r, case when _r <> 'P0001' then '   <<< FALLO' else '' end));
  if _r <> 'P0001' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.d, format($q$select public.reloj_renovar_de('llave-de-ensayo', %s, 'coros', 'ensayo-nuevo', null, now())$q$, _x.p));
  insert into _informe (linea) values (format('11. El director D lo renueva con la llave: %s (se espera P0001)%s', _r, case when _r <> 'P0001' then '   <<< FALLO' else '' end));
  if _r <> 'P0001' then _fallos := _fallos + 1; end if;

  /* Lo mandado: apuntarlo */
  _r := pg_temp.como(_x.e, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre) values (%s, 'coros', %s, current_date, 'ensayo-1', 'ensayo-huella', 'ENSAYO')$q$, _x.p, _x.ses_p));
  insert into _informe (linea) values (format('12. E apunta un envío a P con una sesión de P: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.e, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre) values (%s, 'coros', null, current_date, 'ensayo-2', 'ensayo-huella', 'ENSAYO')$q$, _x.p));
  insert into _informe (linea) values (format('13. E apunta un envío a P sin sesión (la sesión se borró): %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  /* Sin sesión, para que lo pare la regla y no la comprobación de la sesión
     (que salta antes: E no ve las sesiones de V). */
  _r := pg_temp.como(_x.e, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre) values (%s, 'coros', null, current_date, 'ensayo-3', 'ensayo-huella', 'ENSAYO')$q$, _x.v));
  insert into _informe (linea) values (format('14. E apunta uno a V, de otro entrenador: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.e, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre) values (%s, 'coros', %s, current_date, 'ensayo-3b', 'ensayo-huella', 'ENSAYO')$q$, _x.v, _x.ses_v));
  insert into _informe (linea) values (format('14b. Lo mismo con una sesión de V: %s (se espera 23514: lo para antes la comprobación de la sesión)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre) values (%s, 'coros', %s, current_date, 'ensayo-4', 'ensayo-huella', 'ENSAYO')$q$, _x.p, _x.ses_p));
  insert into _informe (linea) values (format('15. El propio deportista P se apunta uno: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.d, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre) values (%s, 'coros', %s, current_date, 'ensayo-5', 'ensayo-huella', 'ENSAYO')$q$, _x.p, _x.ses_p));
  insert into _informe (linea) values (format('16. El director D apunta uno a P: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.e, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre, enviado_por) values (%s, 'coros', %s, current_date, 'ensayo-6', 'ensayo-huella', 'ENSAYO', %L)$q$, _x.p, _x.ses_p, _x.ent_v));
  insert into _informe (linea) values (format('17. E apunta uno a P a nombre de otro: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.e, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre) values (%s, 'coros', %s, current_date, 'ensayo-7', 'ensayo-huella', 'ENSAYO')$q$, _x.p, _x.ses_v));
  insert into _informe (linea) values (format('18. E apunta uno a P con una sesión de V: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.e, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, parte, fecha, id_externo, huella, nombre) values (%s, 'coros', %s, 3, current_date, 'ensayo-8', 'ensayo-huella', 'ENSAYO')$q$, _x.p, _x.ses_p));
  insert into _informe (linea) values (format('19. E apunta una «parte 3» (un brick son dos): %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  /* Una fila que se queda durante el resto del ensayo (se deshace al final) */
  insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre, enviado_por)
  values (_x.p, 'coros', _x.ses_p, current_date, 'ensayo-fijo', 'ensayo-huella', 'ENSAYO', _x.e);

  _r := pg_temp.como(_x.e, format($q$insert into public.reloj_envio (id_deportista, proveedor, id_sesion, fecha, id_externo, huella, nombre) values (%s, 'coros', %s, current_date, 'ensayo-fijo', 'ensayo-huella', 'ENSAYO')$q$, _x.p, _x.ses_p));
  insert into _informe (linea) values (format('20. E apunta otra vez el mismo entreno de COROS: %s (se espera 23505)%s', _r, case when _r <> '23505' then '   <<< FALLO' else '' end));
  if _r <> '23505' then _fallos := _fallos + 1; end if;

  /* Quién lo ve */
  insert into _informe (linea) values (format('21. Ven el envío de P: E %s, P %s, el director D %s, el entrenador de V %s (se espera 1, 1, 1, 0)',
    pg_temp.ve(_x.e, $q$select count(*) from public.reloj_envio where id_externo = 'ensayo-fijo'$q$),
    pg_temp.ve(_x.usr_p, $q$select count(*) from public.reloj_envio where id_externo = 'ensayo-fijo'$q$),
    pg_temp.ve(_x.d, $q$select count(*) from public.reloj_envio where id_externo = 'ensayo-fijo'$q$),
    pg_temp.ve(_x.ent_v, $q$select count(*) from public.reloj_envio where id_externo = 'ensayo-fijo'$q$)));
  if pg_temp.ve(_x.e, $q$select count(*) from public.reloj_envio where id_externo = 'ensayo-fijo'$q$) <> 1
     or pg_temp.ve(_x.usr_p, $q$select count(*) from public.reloj_envio where id_externo = 'ensayo-fijo'$q$) <> 1
     or pg_temp.ve(_x.d, $q$select count(*) from public.reloj_envio where id_externo = 'ensayo-fijo'$q$) <> 1
     or pg_temp.ve(_x.ent_v, $q$select count(*) from public.reloj_envio where id_externo = 'ensayo-fijo'$q$) <> 0 then
    _fallos := _fallos + 1;
  end if;

  /* Cambiarlo y quitarlo */
  _r := pg_temp.filas(_x.e, $q$update public.reloj_envio set huella = 'ensayo-otra', enviado_en = now() where id_externo = 'ensayo-fijo'$q$);
  insert into _informe (linea) values (format('22. E lo cambia: %s fila (se espera 1)%s', _r, case when _r <> '1' then '   <<< FALLO' else '' end));
  if _r <> '1' then _fallos := _fallos + 1; end if;

  _r := pg_temp.filas(_x.usr_p, $q$update public.reloj_envio set huella = 'ensayo-otra' where id_externo = 'ensayo-fijo'$q$);
  insert into _informe (linea) values (format('23. P lo cambia: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  _r := pg_temp.filas(_x.d, $q$delete from public.reloj_envio where id_externo = 'ensayo-fijo'$q$);
  insert into _informe (linea) values (format('24. El director D lo quita: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  _r := pg_temp.filas(_x.ent_v, $q$delete from public.reloj_envio where id_externo = 'ensayo-fijo'$q$);
  insert into _informe (linea) values (format('25. El entrenador de V lo quita: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  _r := pg_temp.filas(_x.e, $q$delete from public.reloj_envio where id_externo = 'ensayo-fijo'$q$);
  insert into _informe (linea) values (format('26. E lo quita (cuando ya no está en su COROS): %s fila (se espera 1)%s', _r, case when _r <> '1' then '   <<< FALLO' else '' end));
  if _r <> '1' then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('FALLOS: %s', _fallos));

  select string_agg(linea, chr(10) order by orden) into _r from _informe;
  raise exception using message = 'INFORME' || chr(10) || _r;
end $fin$;
