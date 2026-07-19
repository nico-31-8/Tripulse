-- ============================================================
-- COMUNIDAD · Paso 1c — Invitaciones al club (con consentimiento)
-- ============================================================
-- El admin NO añade a nadie directamente: INVITA, y la persona acepta o rechaza.
-- Sirve igual para quien ya tiene cuenta (le llega la invitación) que para quien no
-- (se registra con ese email y la ve). Reemplaza al viejo `agregar_miembro_club`,
-- que metía a cualquiera sin su permiso — ese se borra al final.
--
-- ⚠️ NO EJECUTAR salvo que estemos montando esto. Idempotente.
-- ------------------------------------------------------------

create table if not exists invitacion_club (
  id           uuid primary key default gen_random_uuid(),
  id_club      uuid not null references club(id) on delete cascade,
  email        text not null,
  rol_club     text not null default 'deportista',
  estado       text not null default 'pendiente',   -- 'pendiente' | 'aceptada' | 'rechazada'
  invitado_por uuid references perfiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (id_club, email)
);

alter table invitacion_club enable row level security;

-- Email del usuario actual, para casar sus invitaciones sin exponer la tabla perfiles.
create or replace function mi_email()
returns text language sql security definer stable set search_path = public as $$
  select lower(email) from perfiles where id = auth.uid();
$$;

-- Ve sus invitaciones el invitado (por email) y el admin del club (para el estado).
drop policy if exists invitacion_select on invitacion_club;
create policy invitacion_select on invitacion_club for select using (
  lower(email) = mi_email() or es_admin_club(id_club, auth.uid())
);

-- Crear/reenviar invitación (solo admin del club). Upsert por (club, email).
create or replace function invitar_a_club(_id_club uuid, _email text, _rol_club text default 'deportista')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_club(_id_club, auth.uid()) then raise exception 'Solo un admin del club puede invitar'; end if;
  if _rol_club not in ('admin','entrenador','deportista') then raise exception 'Rol invalido'; end if;
  insert into invitacion_club (id_club, email, rol_club, invitado_por)
    values (_id_club, lower(_email), _rol_club, auth.uid())
    on conflict (id_club, email) do update set rol_club = excluded.rol_club, estado = 'pendiente', invitado_por = auth.uid();
end;
$$;

-- Aceptar (se une al club) o rechazar. Solo el propio invitado, comprobando su email.
create or replace function responder_invitacion(_id_invitacion uuid, _aceptar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _inv invitacion_club;
begin
  select * into _inv from invitacion_club where id = _id_invitacion;
  if _inv.id is null then raise exception 'Invitacion no encontrada'; end if;
  if lower(_inv.email) <> mi_email() then raise exception 'Esta invitacion no es para ti'; end if;
  if _inv.estado <> 'pendiente' then raise exception 'Esta invitacion ya fue respondida'; end if;
  if _aceptar then
    insert into club_miembro (id_club, id_perfil, rol_club, estado)
      values (_inv.id_club, auth.uid(), _inv.rol_club, 'activo')
      on conflict (id_club, id_perfil) do update set rol_club = excluded.rol_club, estado = 'activo';
    update invitacion_club set estado = 'aceptada' where id = _id_invitacion;
  else
    update invitacion_club set estado = 'rechazada' where id = _id_invitacion;
  end if;
end;
$$;

-- Invitaciones pendientes del usuario CON el nombre del club (que aún no puede leer
-- porque no es miembro). Security definer para exponer solo eso.
create or replace function mis_invitaciones()
returns table (id uuid, id_club uuid, nombre_club text, rol_club text)
language sql security definer stable set search_path = public as $$
  select i.id, i.id_club, c.nombre, i.rol_club
  from invitacion_club i join club c on c.id = i.id_club
  where lower(i.email) = mi_email() and i.estado = 'pendiente';
$$;

comment on table invitacion_club is 'Invitaciones a un club. El admin invita; la persona acepta/rechaza (consentimiento).';

-- Fuera el "añadir directo": ahora todo pasa por invitación con consentimiento.
drop function if exists agregar_miembro_club(uuid, text, text);
drop function if exists agregar_miembro_club(uuid, text);

notify pgrst, 'reload schema';
