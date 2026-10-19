/* ============================================================
   ENSAYO de relojes-servidor.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: las funciones nuevas, las conexiones de prueba (con su secreto del
   Vault) y lo que se guarde con ellas.

   NO TOCA NINGUNA CONEXIÓN DE VERDAD: se montan dos INVENTADAS, COROS para P
   y Polar para V, dos deportistas sin ningún reloj ni nada recibido nunca, con
   tokens falsos («ensayo-access-…»). El informe nunca enseña un token, ni
   nada de una conexión de verdad: solo cuenta lo de P y V.

   LA LLAVE: la huella de la base es la de la llave de verdad, que no está
   aquí. Se comprueba que no acepta una llave cualquiera ni ninguna, y
   después, SOLO PARA ESTE ENSAYO, la función se cambia por una que acepta
   «llave-de-ensayo» para poder probar las puertas.

   0. CONTROL: las funciones nuevas todavía no existen, y P lee su token de
      prueba con reloj_token_propio (si no, la conexión estaría mal montada).
   1. La migración, con el fichero tal cual.
   2. Lo de siempre no cambia: las funciones reloj_* que ya había tienen la
      misma definición que antes. Y quién puede llamar a las nuevas: sin
      sesión sí (el servidor), con sesión no.
   3. Las puertas, en orden y sobre las mismas conexiones de prueba: qué
      toca traer, el token, renovarlo, guardar lo traído y lo crudo, sin
      llave, con otra llave y a un deportista sin ese reloj.

   «Entrenador normal» = sin plataforma_admin. Los protagonistas se eligen
   solos con lo que haya en la base: no lleva ids escritos, porque el
   repositorio es público. Deja huecos en los contadores de id. Es inofensivo.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (e uuid, p bigint, usr_p uuid, v bigint);
create temp table _antes (firma text, huella text);

insert into _antes
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'reloj%';

/* Una consulta como el servidor (anon, sin sesión), DESHECHA: su primer valor, o ERR y el código. */
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

/* Lo mismo, pero lo que haga SE QUEDA (hasta el final del ensayo, que lo deshace todo). */
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

/* Los protagonistas, y sus conexiones de prueba */
do $sel$
declare _e uuid; _p bigint; _usr_p uuid; _v bigint; _con bigint; _sec uuid;
begin
  /* P: deportista con cuenta, de un entrenador normal, sin reloj y sin nada recibido nunca */
  select x.id, x.id_usuario, x.id_entrenador into _p, _usr_p, _e
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
    join public.perfiles pu on pu.id = x.id_usuario and pu.rol = 'deportista'
   where x.id_usuario <> x.id_entrenador
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and x.id_usuario not in (select id_perfil from public.plataforma_admin)
     and not exists (select 1 from public.reloj_conexion c where c.id_deportista = x.id)
     and not exists (select 1 from public.reloj_medicion m where m.id_deportista = x.id)
     and not exists (select 1 from public.reloj_crudo r where r.id_deportista = x.id)
   order by x.id limit 1;

  /* V: otro deportista, de un entrenador normal, igual de limpio */
  select x.id into _v
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
   where x.id <> _p
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and not exists (select 1 from public.reloj_conexion c where c.id_deportista = x.id)
     and not exists (select 1 from public.reloj_medicion m where m.id_deportista = x.id)
     and not exists (select 1 from public.reloj_crudo r where r.id_deportista = x.id)
   order by x.id limit 1;

  if _e is null or _p is null or _usr_p is null or _v is null then
    raise exception 'ENSAYO: no hay datos para montar el escenario (E %, P %, cuenta de P %, V %)', _e, _p, _usr_p, _v;
  end if;
  insert into _actores values (_e, _p, _usr_p, _v);

  /* P: COROS, nunca sincronizado y con un error de antes; el «extra» con su cliente */
  insert into public.reloj_conexion (id_deportista, proveedor, id_externo, conectado_en, caduca_en, ultima_sincronizacion, ultimo_error)
  values (_p, 'coros', 'ensayo', now(), now() + interval '1 hour', null, 'error de antes') returning id into _con;
  _sec := vault.create_secret('{"access":"ensayo-access-P","refresh":"ensayo-refresh-P","extra":{"cliente":"ensayo-cliente"}}', null, 'ENSAYO relojes-servidor P', null);
  insert into public.reloj_token (id_conexion, id_secreto, actualizado_en) values (_con, _sec, now());

  /* V: Polar, sincronizado hace una hora */
  insert into public.reloj_conexion (id_deportista, proveedor, id_externo, conectado_en, caduca_en, ultima_sincronizacion)
  values (_v, 'polar', 'ensayo', now(), now() + interval '300 days', now() - interval '1 hour') returning id into _con;
  _sec := vault.create_secret('{"access":"ensayo-access-V","refresh":null}', null, 'ENSAYO relojes-servidor V', null);
  insert into public.reloj_token (id_conexion, id_secreto, actualizado_en) values (_con, _sec, now());

  insert into _informe (linea) values (format(
    'Protagonistas: P = deportista %s (con cuenta, de un entrenador normal) con un COROS inventado, sin sincronizar nunca; V = deportista %s con un Polar inventado, sincronizado hace una hora. Ninguno tenía reloj ni nada recibido.',
    _p, _v));
end $sel$;

/* 0. CONTROL con lo de hoy */
do $ctl$
declare _x record; _r1 text; _r2 text;
begin
  select * into _x from _actores;
  _r1 := pg_temp.sesion(_x.usr_p, $q$select case when access_token = 'ensayo-access-P' then 'el suyo' else 'OTRO' end from public.reloj_token_propio('coros')$q$);
  _r2 := pg_temp.anon($q$select count(*)::text from public.reloj_servidor_pendientes('x', 3)$q$);
  insert into _informe (linea) values
    (format('CONTROL 1. P lee su token de prueba con lo de HOY: %s (se espera «el suyo»)%s', _r1, case when _r1 <> 'el suyo' then '   <<< CONTROL ROTO' else '' end)),
    (format('CONTROL 2. reloj_servidor_pendientes antes de la migración: %s (se espera ERR 42883: todavía no existe)%s', _r2, case when _r2 <> 'ERR 42883' then '   <<< CONTROL ROTO' else '' end));
end $ctl$;

/* 1. La migración: el fichero relojes-servidor.sql tal cual */
/* ============================================================
   RELOJES: que lo del reloj llegue solo, sin que nadie abra la app
   ============================================================
   Hasta hoy lo del reloj solo llega cuando el propio deportista abre su
   perfil o su wellness: la ruta habla con Polar o COROS con SU sesión. Ahora
   el servidor lo trae también él solo, dos veces al día (Vercel Cron), sin
   nadie conectado.

   Sin sesión no hay auth.uid(), así que las funciones de siempre no sirven.
   Estas cinco hacen lo mismo que ellas, pero para un deportista dado, y piden
   la LLAVE DEL SERVIDOR (RELOJ_LLAVE_SERVIDOR: solo está en Vercel y en el
   .env.local; la base guarda su huella, en reloj_llave_valida):

     reloj_servidor_pendientes     las conexiones que llevan más de N horas sin
                                   traer nada, y si ya tienen noches y entrenos
                                   (para saber si pedir cuatro semanas o una).
     reloj_servidor_token          su token, como reloj_token_propio.
     reloj_servidor_renovar        guardar el renovado, como reloj_renovar.
     reloj_servidor_guardar        guardar lo traído, como reloj_guardar.
     reloj_servidor_guardar_crudo  y lo que contestó, como reloj_guardar_crudo.

   LO QUE CAMBIA EN LA SEGURIDAD, dicho claro: hasta hoy, para sacar el token
   de un deportista hacía falta su sesión, o la de su entrenador MÁS la llave.
   Con esto, la llave sola basta para los tokens de reloj de todos. Es lo que
   necesita cualquier sincronización sin nadie delante. La clave de servicio
   de Supabase, que la app sigue sin usar, daría mucho más: la base entera.
   Si la llave se filtrara, se genera otra y se pone su huella en
   reloj_llave_valida: con la vieja, estas cinco dejan de funcionar en el acto
   (y reloj_token_de y reloj_renovar_de también).

   Se abren a anon porque el servidor llama sin sesión, igual que
   reloj_completar, que exige el estado de un solo uso. Sin la llave no hacen
   nada. Una sesión de verdad (authenticated) no puede llamarlas: lo suyo son
   las de siempre.

   TODO ADITIVO: cinco funciones nuevas. Nada de lo que existe cambia.
   ============================================================ */

set local lock_timeout = '5s';

/* 1. Qué toca traer */
create or replace function public.reloj_servidor_pendientes(p_llave text, p_horas integer)
returns table(id_deportista bigint, proveedor text, hay_noches boolean, hay_entrenos boolean)
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
  select c.id_deportista,
         c.proveedor,
         exists (select 1 from public.reloj_medicion m
                  where m.id_deportista = c.id_deportista and m.proveedor = c.proveedor and m.tipo = 'sueno'),
         exists (select 1 from public.reloj_medicion m
                  where m.id_deportista = c.id_deportista and m.proveedor = c.proveedor and m.tipo = 'entreno')
    from public.reloj_conexion c
    join public.reloj_token t on t.id_conexion = c.id
   where c.proveedor in ('polar', 'coros')
     and (c.ultima_sincronizacion is null
          or c.ultima_sincronizacion < now() - make_interval(hours => greatest(coalesce(p_horas, 3), 1)))
   order by c.ultima_sincronizacion nulls first, c.id
   limit 500;
end $$;
revoke all on function public.reloj_servidor_pendientes(text, integer) from public, anon, authenticated;
grant execute on function public.reloj_servidor_pendientes(text, integer) to anon;

/* 2. Su token */
create or replace function public.reloj_servidor_token(p_llave text, p_deportista bigint, p_proveedor text)
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
    join public.reloj_token t on t.id_conexion = c.id
    join vault.decrypted_secrets s on s.id = t.id_secreto
   where c.id_deportista = p_deportista
     and c.proveedor = p_proveedor;
end $$;
revoke all on function public.reloj_servidor_token(text, bigint, text) from public, anon, authenticated;
grant execute on function public.reloj_servidor_token(text, bigint, text) to anon;

/* 3. Guardar el token renovado. Conserva el «extra» (el cliente de COROS): si
   se perdiera, el siguiente ya no se podría renovar. */
create or replace function public.reloj_servidor_renovar(
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
    join public.reloj_token t on t.id_conexion = c.id
   where c.id_deportista = p_deportista
     and c.proveedor = p_proveedor;

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
  update public.reloj_conexion set caduca_en = p_caduca_en, ultimo_error = null where id = v_con;
end $$;
revoke all on function public.reloj_servidor_renovar(text, bigint, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reloj_servidor_renovar(text, bigint, text, text, text, timestamptz) to anon;

/* 4. Guardar lo traído. Lo repetido se actualiza en vez de duplicarse. */
create or replace function public.reloj_servidor_guardar(
  p_llave text, p_deportista bigint, p_proveedor text, p_mediciones jsonb, p_error text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep bigint;
  v_n integer := 0;
begin
  if not public.reloj_llave_valida(p_llave) then
    raise exception 'Solo desde el servidor' using errcode = '42501';
  end if;

  select c.id_deportista into v_dep
    from public.reloj_conexion c
   where c.id_deportista = p_deportista
     and c.proveedor = p_proveedor;

  if v_dep is null then
    raise exception 'Ese deportista no tiene ese reloj conectado';
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
revoke all on function public.reloj_servidor_guardar(text, bigint, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.reloj_servidor_guardar(text, bigint, text, jsonb, text) to anon;

/* 5. Lo que contestó, tal cual: solo la última respuesta de cada herramienta. */
create or replace function public.reloj_servidor_guardar_crudo(
  p_llave text, p_deportista bigint, p_proveedor text, p_filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep bigint;
  v_n integer := 0;
begin
  if not public.reloj_llave_valida(p_llave) then
    raise exception 'Solo desde el servidor' using errcode = '42501';
  end if;

  select c.id_deportista into v_dep
    from public.reloj_conexion c
   where c.id_deportista = p_deportista
     and c.proveedor = p_proveedor;

  if v_dep is null then
    raise exception 'Ese deportista no tiene ese reloj conectado';
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
revoke all on function public.reloj_servidor_guardar_crudo(text, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.reloj_servidor_guardar_crudo(text, bigint, text, jsonb) to anon;

/* 2. Lo de siempre no cambia, y quién puede llamar a las nuevas */
do $igual$
declare _cambiadas text; _faltan text; _n int; _malas text; _sin_definer text; _fallos int := 0;
begin
  select string_agg(a.firma, ', '), count(*) filter (where d.firma is null)
    into _cambiadas, _n
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

  /* Las cinco nuevas: anon sí; con sesión no; PUBLIC no. */
  select string_agg(f, ', ') into _malas
    from unnest(array[
      'public.reloj_servidor_pendientes(text,integer)',
      'public.reloj_servidor_token(text,bigint,text)',
      'public.reloj_servidor_renovar(text,bigint,text,text,text,timestamp with time zone)',
      'public.reloj_servidor_guardar(text,bigint,text,jsonb,text)',
      'public.reloj_servidor_guardar_crudo(text,bigint,text,jsonb)'
    ]) as f
   where not has_function_privilege('anon', f, 'execute')
      or has_function_privilege('authenticated', f, 'execute');
  insert into _informe (linea) values (format('2b. Nuevas que no pueda llamar el servidor (anon) o que pueda llamar una sesión: %s (se espera ninguna)%s',
    coalesce(_malas, 'ninguna'), case when _malas is not null then '   <<< FALLO' else '' end));
  if _malas is not null then _fallos := _fallos + 1; end if;

  select string_agg(p.proname, ', ') into _sin_definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'reloj_servidor_%'
     and (not p.prosecdef or p.proconfig is null or not ('search_path=public' = any(p.proconfig)));
  select count(*) into _n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'reloj_servidor_%';
  insert into _informe (linea) values (format('2c. Nuevas: %s; sin SECURITY DEFINER o sin search_path fijo: %s (se esperan 5 y ninguna)%s',
    _n, coalesce(_sin_definer, 'ninguna'), case when _n <> 5 or _sin_definer is not null then '   <<< FALLO' else '' end));
  if _n <> 5 or _sin_definer is not null then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('2. Fallos en este bloque: %s', _fallos));
end $igual$;

/* 3. Las puertas */
do $fin$
declare _x record; _r text; _fallos int := 0; _ok boolean;
  _llave_mala boolean; _llave_nula boolean;
  _sync timestamptz; _err text; _cad timestamptz; _n int;
  _sqls text[]; _s text;
begin
  select * into _x from _actores;

  /* La huella de verdad no acepta cualquier cosa */
  select public.reloj_llave_valida('llave-de-ensayo'), public.reloj_llave_valida(null) into _llave_mala, _llave_nula;
  _ok := not _llave_mala and not _llave_nula;
  insert into _informe (linea) values (format('3a. La huella de verdad con una llave cualquiera: %s; sin llave: %s (se espera no y no)%s',
    case when _llave_mala then 'sí' else 'no' end, case when _llave_nula then 'sí' else 'no' end, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Sin llave y con otra llave, las cinco se niegan (antes de cambiar la huella: vale la de verdad) */
  _sqls := array[
    'select count(*)::text from public.reloj_servidor_pendientes(%L, 3)',
    format('select count(*)::text from public.reloj_servidor_token(%%L, %s, ''coros'')', _x.p),
    format('select ''hecho'' from (select public.reloj_servidor_renovar(%%L, %s, ''coros'', ''a'', null, now())) x', _x.p),
    format('select public.reloj_servidor_guardar(%%L, %s, ''coros'', ''[]''::jsonb, null)::text', _x.p),
    format('select public.reloj_servidor_guardar_crudo(%%L, %s, ''coros'', ''[]''::jsonb)::text', _x.p)
  ];
  _n := 0;
  foreach _s in array _sqls loop
    if pg_temp.anon(format(_s, 'otra')) = 'ERR 42501' then _n := _n + 1; end if;
    if pg_temp.anon(format(_s, null)) = 'ERR 42501' then _n := _n + 1; end if;
    if pg_temp.anon(format(_s, 'llave-de-ensayo')) = 'ERR 42501' then _n := _n + 1; end if;
  end loop;
  insert into _informe (linea) values (format('3b. Las cinco, sin servidor de verdad (otra llave, sin llave, la de ensayo con la huella real): %s de 15 se niegan con 42501 (se esperan 15)%s',
    _n, case when _n <> 15 then '   <<< FALLO' else '' end));
  if _n <> 15 then _fallos := _fallos + 1; end if;

  /* SOLO PARA EL ENSAYO: la huella pasa a ser la de «llave-de-ensayo» */
  execute $q$
    create or replace function public.reloj_llave_valida(p_llave text)
    returns boolean language sql immutable set search_path = public, extensions as $b$
      select coalesce(encode(extensions.digest(p_llave, 'sha256'), 'hex')
        = encode(extensions.digest('llave-de-ensayo', 'sha256'), 'hex'), false)
    $b$
  $q$;

  /* Con sesión (la de P), y ya con una llave que vale: solo puede pararla el permiso */
  _r := pg_temp.sesion(_x.usr_p, format($q$select count(*)::text from public.reloj_servidor_token('llave-de-ensayo', %s, 'coros')$q$, _x.p));
  insert into _informe (linea) values (format('3c. P con su sesión, por la puerta del servidor: %s (se espera ERR 42501)%s',
    _r, case when _r <> 'ERR 42501' then '   <<< FALLO' else '' end));
  if _r <> 'ERR 42501' then _fallos := _fallos + 1; end if;

  /* Qué toca traer */
  _r := pg_temp.anon(format($q$select string_agg(proveedor || ' noches:' || hay_noches || ' entrenos:' || hay_entrenos, '; ') from public.reloj_servidor_pendientes('llave-de-ensayo', 3) where id_deportista = %s$q$, _x.p));
  insert into _informe (linea) values (format('4. Qué toca traer de P (nunca sincronizado): %s (se espera «coros noches:false entrenos:false»)%s',
    _r, case when _r <> 'coros noches:false entrenos:false' then '   <<< FALLO' else '' end));
  if _r <> 'coros noches:false entrenos:false' then _fallos := _fallos + 1; end if;

  _r := pg_temp.anon(format($q$select count(*)::text from public.reloj_servidor_pendientes('llave-de-ensayo', 3) where id_deportista = %s$q$, _x.v));
  insert into _informe (linea) values (format('5. V, sincronizado hace una hora, con 3 horas de margen: %s (se espera 0)%s',
    _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  update public.reloj_conexion set ultima_sincronizacion = now() - interval '5 hours' where id_deportista = _x.v and proveedor = 'polar';
  _r := pg_temp.anon(format($q$select string_agg(proveedor, ', ') from public.reloj_servidor_pendientes('llave-de-ensayo', 3) where id_deportista = %s$q$, _x.v));
  insert into _informe (linea) values (format('6. V, sincronizado hace cinco horas: %s (se espera polar)%s',
    _r, case when _r <> 'polar' then '   <<< FALLO' else '' end));
  if _r <> 'polar' then _fallos := _fallos + 1; end if;

  _r := pg_temp.anon(format($q$select count(*)::text from public.reloj_servidor_pendientes('llave-de-ensayo', 0) where id_deportista = %s$q$, _x.v));
  insert into _informe (linea) values (format('6b. Con 0 horas de margen cuenta como 1 (V, de hace cinco, sí sale): %s (se espera 1)%s',
    _r, case when _r <> '1' then '   <<< FALLO' else '' end));
  if _r <> '1' then _fallos := _fallos + 1; end if;

  /* El token */
  _r := pg_temp.anon(format($q$select count(*)::text || case when max(access_token) = 'ensayo-access-P' then ' (el suyo)' when max(access_token) is null then '' else ' (OTRO)' end from public.reloj_servidor_token('llave-de-ensayo', %s, 'coros')$q$, _x.p));
  insert into _informe (linea) values (format('7. El servidor pide el token del COROS de P: %s (se espera «1 (el suyo)»)%s',
    _r, case when _r <> '1 (el suyo)' then '   <<< FALLO' else '' end));
  if _r <> '1 (el suyo)' then _fallos := _fallos + 1; end if;

  _r := pg_temp.anon(format($q$select count(*)::text || case when max(access_token) = 'ensayo-access-V' then ' (el suyo)' when max(access_token) is null then '' else ' (OTRO)' end from public.reloj_servidor_token('llave-de-ensayo', %s, 'polar')$q$, _x.v));
  insert into _informe (linea) values (format('8. El del Polar de V: %s (se espera «1 (el suyo)»)%s',
    _r, case when _r <> '1 (el suyo)' then '   <<< FALLO' else '' end));
  if _r <> '1 (el suyo)' then _fallos := _fallos + 1; end if;

  _r := pg_temp.anon(format($q$select count(*)::text from public.reloj_servidor_token('llave-de-ensayo', %s, 'polar')$q$, _x.p));
  insert into _informe (linea) values (format('9. Un Polar de P, que no tiene: %s (se espera 0)%s',
    _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  /* Renovar: el nuevo access; el refresh y el «extra» se conservan si no llega otro; caducidad nueva; el error se borra */
  _r := pg_temp.anon_firme(format($q$select 'hecho' from (select public.reloj_servidor_renovar('llave-de-ensayo', %s, 'coros', 'ensayo-access-P2', null, now() + interval '2 hours')) x$q$, _x.p));
  select c.caduca_en, c.ultimo_error into _cad, _err from public.reloj_conexion c where c.id_deportista = _x.p and c.proveedor = 'coros';
  _r := _r || ' / ' || pg_temp.anon(format($q$select concat_ws(' ', case when access_token = 'ensayo-access-P2' then 'access nuevo' else 'access VIEJO' end, case when refresh_token = 'ensayo-refresh-P' then 'refresh conservado' else 'refresh PERDIDO' end, case when extra ->> 'cliente' = 'ensayo-cliente' then 'extra conservado' else 'extra PERDIDO' end) from public.reloj_servidor_token('llave-de-ensayo', %s, 'coros')$q$, _x.p))
        || ' / caducidad ' || case when _cad > now() + interval '110 minutes' then 'nueva' else 'VIEJA' end
        || ' / error ' || case when _err is null then 'borrado' else 'SIGUE' end;
  _ok := _r = 'hecho / access nuevo refresh conservado extra conservado / caducidad nueva / error borrado';
  insert into _informe (linea) values (format('10. Renovar el de P: %s%s', _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Guardar lo traído: dos mediciones; repetido, se actualizan sin duplicarse */
  _r := pg_temp.anon_firme(format($q$select public.reloj_servidor_guardar('llave-de-ensayo', %s, 'coros', '[{"tipo":"sueno","fecha":"2026-10-18","id_externo":"ensayo-noche","datos":{"dormido_min":420}},{"tipo":"entreno","fecha":"2026-10-18","id_externo":"ensayo-entreno","datos":{"duracion_min":45}}]'::jsonb, null)::text$q$, _x.p));
  _r := _r || ', repetido ' || pg_temp.anon_firme(format($q$select public.reloj_servidor_guardar('llave-de-ensayo', %s, 'coros', '[{"tipo":"sueno","fecha":"2026-10-18","id_externo":"ensayo-noche","datos":{"dormido_min":430}},{"tipo":"entreno","fecha":"2026-10-18","id_externo":"ensayo-entreno","datos":{"duracion_min":45}}]'::jsonb, null)::text$q$, _x.p));
  select count(*) into _n from public.reloj_medicion m where m.id_deportista = _x.p and m.proveedor = 'coros';
  select c.ultima_sincronizacion, c.ultimo_error into _sync, _err from public.reloj_conexion c where c.id_deportista = _x.p and c.proveedor = 'coros';
  _ok := _r = '2, repetido 2' and _n = 2 and _sync > now() - interval '1 minute' and _err is null
         and (select (datos ->> 'dormido_min')::int from public.reloj_medicion where id_deportista = _x.p and id_externo = 'ensayo-noche') = 430;
  insert into _informe (linea) values (format('11. Guardar dos mediciones de P y repetirlas: %s; quedan %s filas, la noche con el dato nuevo, sincronización %s, error %s (se espera «2, repetido 2», 2, ahora, ninguno)%s',
    _r, _n, case when _sync > now() - interval '1 minute' then 'ahora' else coalesce(_sync::text, 'NUNCA') end, coalesce(_err, 'ninguno'), case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Recién sincronizado ya no toca; hace cinco horas, sí, y ahora con noches y entrenos */
  _r := pg_temp.anon(format($q$select count(*)::text from public.reloj_servidor_pendientes('llave-de-ensayo', 3) where id_deportista = %s$q$, _x.p));
  update public.reloj_conexion set ultima_sincronizacion = now() - interval '5 hours' where id_deportista = _x.p and proveedor = 'coros';
  _r := _r || ' / ' || pg_temp.anon(format($q$select string_agg(proveedor || ' noches:' || hay_noches || ' entrenos:' || hay_entrenos, '; ') from public.reloj_servidor_pendientes('llave-de-ensayo', 3) where id_deportista = %s$q$, _x.p));
  _ok := _r = '0 / coros noches:true entrenos:true';
  insert into _informe (linea) values (format('12. P recién sincronizado / y de hace cinco horas: %s (se espera «0 / coros noches:true entrenos:true»)%s',
    _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Un fallo: se apunta el error y la hora de la última buena no se mueve */
  _r := pg_temp.anon_firme(format($q$select public.reloj_servidor_guardar('llave-de-ensayo', %s, 'coros', '[]'::jsonb, 'fallo de ensayo')::text$q$, _x.p));
  select c.ultima_sincronizacion, c.ultimo_error into _sync, _err from public.reloj_conexion c where c.id_deportista = _x.p and c.proveedor = 'coros';
  _ok := _r = '0' and _err = 'fallo de ensayo' and _sync < now() - interval '4 hours';
  insert into _informe (linea) values (format('13. Guardar un fallo: %s; error «%s»; la hora de la última buena %s (se espera 0, «fallo de ensayo», sin mover)%s',
    _r, coalesce(_err, ''), case when _sync < now() - interval '4 hours' then 'sin mover' else 'MOVIDA' end, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* Lo crudo */
  _r := pg_temp.anon_firme(format($q$select public.reloj_servidor_guardar_crudo('llave-de-ensayo', %s, 'coros', '[{"herramienta":"querySleepOverview","datos":{"resultado":"ensayo"}}]'::jsonb)::text$q$, _x.p));
  select count(*) into _n from public.reloj_crudo r where r.id_deportista = _x.p and r.proveedor = 'coros';
  _ok := _r = '1' and _n = 1;
  insert into _informe (linea) values (format('14. Guardar lo crudo de P: %s; filas %s (se espera 1 y 1)%s',
    _r, _n, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  /* A un deportista sin ese reloj: nada */
  _r := pg_temp.anon(format($q$select 'hecho' from (select public.reloj_servidor_renovar('llave-de-ensayo', %s, 'coros', 'a', null, now())) x$q$, _x.v))
     || ' / ' || pg_temp.anon(format($q$select public.reloj_servidor_guardar('llave-de-ensayo', %s, 'coros', '[]'::jsonb, null)::text$q$, _x.v))
     || ' / ' || pg_temp.anon(format($q$select public.reloj_servidor_guardar_crudo('llave-de-ensayo', %s, 'coros', '[]'::jsonb)::text$q$, _x.v));
  _ok := _r = 'ERR P0001 / ERR P0001 / ERR P0001';
  insert into _informe (linea) values (format('15. Renovar, guardar y lo crudo de un COROS que V no tiene: %s (se espera «ERR P0001» las tres)%s',
    _r, case when not _ok then '   <<< FALLO' else '' end));
  if not _ok then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('3. Fallos en este bloque: %s', _fallos));
end $fin$;

do $informe$
declare _r text;
begin
  select string_agg(linea, E'\n' order by orden) into _r from _informe;
  raise exception 'INFORME:%', E'\n' || _r;
end $informe$;
