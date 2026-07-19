-- ============================================================
-- COMUNIDAD · Paso 2 — Ser social es OPCIONAL + perfil público
-- ============================================================
-- Ser social es decisión de cada persona. Al entrar por primera vez al módulo se
-- pregunta: unirse o quedarse ajeno. Reversible siempre.
--
-- Estados (`perfiles.social`):
--   'pendiente' → nunca decidió. La app muestra la pregunta al entrar. (default)
--   'activo'    → se unió: aparece en la comunidad, ve a otros, grupos, retos.
--   'inactivo'  → ajeno: el módulo queda apagado, con un botón por si cambia de idea.
--
-- Privacidad: aunque estés 'activo', tus datos de entrenamiento SIGUEN privados. Lo
-- único que se expone es el perfil público ligero (nombre, ciudad, deportes, foto,
-- bio) — vía la vista `perfil_publico`, NUNCA la tabla perfiles entera (que tiene el
-- email). Ver docs/comunidad-arquitectura.md.
--
-- ⚠️ NO EJECUTAR TODAVÍA. En revisión.  Idempotente.  perfiles.id = auth.users.id.
-- ------------------------------------------------------------

-- ---------- Estado social + campos del perfil público ----------

alter table perfiles add column if not exists social      text not null default 'pendiente';  -- 'pendiente'|'activo'|'inactivo'
alter table perfiles add column if not exists ciudad      text;
alter table perfiles add column if not exists deportes    text[];   -- ['triatlon','ciclismo',...]
alter table perfiles add column if not exists bio         text;
alter table perfiles add column if not exists avatar_url  text;

comment on column perfiles.social is 'Módulo social opt-in: pendiente (preguntar) | activo (dentro) | inactivo (ajeno).';

-- El usuario cambia su decisión social y su perfil público SOLO por estas funciones,
-- NO por una política de UPDATE sobre perfiles. Motivo: una política "actualiza tu
-- propia fila" dejaría cambiar también `rol` (un deportista se haría entrenador solo).
-- Estas funciones tocan únicamente las columnas permitidas.

create or replace function set_estado_social(_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if _estado not in ('activo', 'inactivo') then raise exception 'Estado social inválido: %', _estado; end if;
  update perfiles set social = _estado where id = auth.uid();
end;
$$;

create or replace function actualizar_perfil_publico(_ciudad text, _deportes text[], _bio text, _avatar_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  update perfiles set ciudad = _ciudad, deportes = _deportes, bio = _bio, avatar_url = _avatar_url
  where id = auth.uid();
end;
$$;

comment on function set_estado_social is 'Unirse (activo) o salir (inactivo) de la comunidad. Solo toca perfiles.social del propio usuario.';
comment on function actualizar_perfil_publico is 'Edita el perfil público del propio usuario. Nunca rol ni email.';

-- ---------- Vista del perfil público ----------
-- El directorio de la comunidad lee de AQUÍ, no de `perfiles`. Expone solo las
-- columnas públicas y solo de quienes están 'activo'. Así nunca se filtra el email
-- ni nada privado, y quien es 'inactivo'/'pendiente' no aparece.
create or replace view perfil_publico
with (security_invoker = false) as
  select id, nombre, rol, ciudad, deportes, bio, avatar_url
  from perfiles
  where social = 'activo';
-- `rol` (entrenador|deportista) se muestra a propósito: ayuda a que los sueltos
-- encuentren entrenador y a que los entrenadores capten clientes (embudo B2C→B2B).
-- No es dato privado. El email NUNCA sale de aquí.

grant select on perfil_publico to anon, authenticated;

comment on view perfil_publico is 'Perfil público ligero de quienes se unieron a la comunidad (social=activo). Sin email ni datos privados.';

-- Refresca la caché del esquema de PostgREST.
notify pgrst, 'reload schema';

-- Comprobación (tras aplicar; desde la app, con sesión iniciada):
--   select set_estado_social('activo');
--   select actualizar_perfil_publico('Madrid', '{triatlon}', 'hola', null);
--   select * from perfil_publico;   -- debería verse tu perfil público
