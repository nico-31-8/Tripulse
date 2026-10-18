/* ============================================================
   Mandar entrenos al COROS del deportista, desde su entrenador
   ============================================================
   El entrenador pulsa «⌚ Su COROS» en el calendario y el servidor pone las
   sesiones en el calendario de COROS del deportista. Para eso el servidor tiene
   que usar la conexión del DEPORTISTA estando la sesión abierta por su
   ENTRENADOR, y apuntar qué ha mandado. Son dos piezas:

   1. LA CONEXIÓN, SOLO DESDE EL SERVIDOR. reloj_token_de y reloj_renovar_de son
      reloj_token_propio y reloj_renovar para el entrenador del deportista
      (deportista.id_entrenador = quien llama). El director NO: su acceso pasa
      por director_acceso, no por id_entrenador, y mandar al reloj no entra.
      Además piden la LLAVE DEL SERVIDOR (la variable RELOJ_LLAVE_SERVIDOR de
      Vercel): con la sesión del entrenador abierta en el navegador se podría
      llamar a una función de la base, y entonces el token del deportista
      saldría del servidor. La base no guarda la llave, solo su huella SHA-256
      (reloj_llave_valida), que no sirve para sacarla. Cambiar la llave es
      cambiar esa huella.

   2. LO QUE SE MANDÓ: reloj_envio, una fila por entreno puesto en su COROS (un
      brick son dos: parte 1, la bici; parte 2, la carrera). Con el día, el id
      que le dio COROS (para cambiarlo después) y la HUELLA del entreno mandado:
      si la sesión ya no daría el mismo entreno, ha cambiado desde que se mandó.
      Una fila cuyo día ya no es el de su sesión, o sin sesión, es un entreno que
      SIGUE en su COROS: COROS no deja moverlo ni borrarlo desde fuera.
      La ven quienes ven al deportista (como reloj_medicion); la escribe solo su
      entrenador, y la sesión tiene que ser de ese deportista.

   PARA TODO LO DEMÁS NO CAMBIA NADA: tres funciones y una tabla nuevas; nada
   de lo que existe cambia.
   ============================================================ */

set local lock_timeout = '5s';

/* 1. La llave del servidor */
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

/* 2. Lo que se mandó */
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
