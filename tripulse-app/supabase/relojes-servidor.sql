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
