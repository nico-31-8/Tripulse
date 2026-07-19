-- ============================================================
-- COMUNIDAD · Paso 1b — Gestión del club (crear + añadir miembros)
-- ============================================================
-- Funciones de apoyo para la UI del club:
--   · soy_plataforma()        → para mostrar el "Crear club" solo a la plataforma.
--   · agregar_miembro_club()  → un admin del club añade a alguien POR EMAIL, sin que
--     la app tenga que leer la tabla perfiles (que está cerrada). Idempotente por
--     (club, persona): si ya está, actualiza su rol y lo reactiva.
--
-- ⚠️ NO EJECUTAR TODAVÍA salvo que estemos montando el club. Idempotente.
-- ------------------------------------------------------------

create or replace function soy_plataforma()
returns boolean language sql security definer stable set search_path = public as $$
  select es_admin_plataforma(auth.uid());
$$;

-- Devuelve el NOMBRE de la persona añadida, para que la app confirme a quién metió
-- ("Añadido: Juan Pérez") y no haya dudas de que es la persona correcta.
drop function if exists agregar_miembro_club(uuid, text, text);
create or replace function agregar_miembro_club(_id_club uuid, _email text, _rol_club text default 'deportista')
returns text language plpgsql security definer set search_path = public as $$
declare _perfil uuid; _nombre text;
begin
  if not es_admin_club(_id_club, auth.uid()) then
    raise exception 'Solo un admin del club puede anadir miembros';
  end if;
  if _rol_club not in ('admin','entrenador','deportista') then
    raise exception 'Rol invalido';
  end if;
  select id, nombre into _perfil, _nombre from perfiles where lower(email) = lower(_email);
  if _perfil is null then
    raise exception 'No hay ningun usuario con ese email';
  end if;
  insert into club_miembro (id_club, id_perfil, rol_club, estado)
    values (_id_club, _perfil, _rol_club, 'activo')
    on conflict (id_club, id_perfil) do update set rol_club = excluded.rol_club, estado = 'activo';
  return _nombre;
end;
$$;

comment on function soy_plataforma is 'True si el usuario actual es admin de plataforma (para la UI de crear club).';
comment on function agregar_miembro_club is 'Un admin del club añade a alguien por email. No expone la tabla perfiles.';

notify pgrst, 'reload schema';
