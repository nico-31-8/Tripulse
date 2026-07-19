-- ============================================================
-- COMUNIDAD · Paso 1 — Club y membresía
-- ============================================================
-- El cimiento del módulo Comunidad: la organización (club/federación) y quién
-- pertenece a ella y con qué rol. Es el tejado ORGANIZATIVO por encima de la
-- relación entrenador→deportista, que NO se toca.
--
-- ⚠️ NO EJECUTAR TODAVÍA. Está en revisión (ver docs/comunidad-arquitectura.md).
--    Se aplica cuando el cimiento esté cerrado.
--
-- Idempotente. `perfiles.id` = `auth.users.id` (uuid).
-- ------------------------------------------------------------

-- ---------- Tablas ----------

create table if not exists club (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  tipo        text not null default 'club',   -- 'club' | 'federacion' | 'escuela' | 'equipo'
  ciudad      text,
  logo_url    text,
  creado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists club_miembro (
  id         uuid primary key default gen_random_uuid(),
  id_club    uuid not null references club(id) on delete cascade,
  id_perfil  uuid not null references perfiles(id) on delete cascade,
  rol_club   text not null default 'deportista',  -- 'admin' | 'entrenador' | 'deportista'
  estado     text not null default 'activo',      -- 'invitado' | 'activo' | 'baja'
  created_at timestamptz not null default now(),
  unique (id_club, id_perfil)                      -- una persona, una membresía por club
);

create index if not exists idx_club_miembro_club   on club_miembro(id_club);
create index if not exists idx_club_miembro_perfil on club_miembro(id_perfil);

-- Administradores de la PLATAFORMA ("nosotros"). Un club no se crea solo: hay que
-- pasar por aquí. Estas son las cuentas que pueden dar de alta clubes y designar a su
-- admin. Los grupos de comunidad (paso 4), en cambio, los crea cualquiera.
create table if not exists plataforma_admin (
  id_perfil  uuid primary key references perfiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Helpers SECURITY DEFINER ----------
-- Sin esto, el RLS de club_miembro se autorreferencia (para ver un miembro hay que
-- consultar club_miembro → recursión infinita). Estas funciones saltan el RLS de
-- forma controlada y son la única vía por la que las políticas leen la membresía.

create or replace function es_miembro_club(_club uuid, _uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from club_miembro
    where id_club = _club and id_perfil = _uid and estado = 'activo'
  );
$$;

create or replace function es_admin_club(_club uuid, _uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from club_miembro
    where id_club = _club and id_perfil = _uid and rol_club = 'admin' and estado = 'activo'
  );
$$;

create or replace function es_admin_plataforma(_uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from plataforma_admin where id_perfil = _uid);
$$;

-- ---------- Alta de club (solo la plataforma) ----------
-- Un club NO se crea solo: lo damos de alta nosotros (B2B, es lo que se paga). Crea el
-- club y designa a su primer admin (el gestor del club) en una sola operación. Devuelve
-- el id del club nuevo. `_id_admin` = perfil de la persona que administrará el club.

create or replace function crear_club(_nombre text, _id_admin uuid, _tipo text default 'club', _ciudad text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _id uuid;
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma puede crear clubes';
  end if;
  insert into club (nombre, tipo, ciudad, creado_por)
    values (_nombre, coalesce(_tipo, 'club'), _ciudad, auth.uid())
    returning id into _id;
  insert into club_miembro (id_club, id_perfil, rol_club, estado)
    values (_id, _id_admin, 'admin', 'activo');
  return _id;
end;
$$;

-- ---------- RLS ----------

alter table club enable row level security;
alter table club_miembro enable row level security;

-- plataforma_admin: RLS activado y SIN políticas a propósito. Nadie la toca desde la
-- app (ni lee ni escribe): solo la ven las funciones SECURITY DEFINER y el editor SQL.
-- Es lo que impide que alguien se cuele como plataforma para crear clubes.
alter table plataforma_admin enable row level security;

-- CLUB: lo ven sus miembros (y quien lo creó). Solo un admin lo edita. Crear se hace
-- por crear_club(), así que no hace falta política de INSERT directa.
drop policy if exists club_select on club;
create policy club_select on club
  for select using (es_miembro_club(id, auth.uid()) or creado_por = auth.uid());

drop policy if exists club_update on club;
create policy club_update on club
  for update using (es_admin_club(id, auth.uid())) with check (es_admin_club(id, auth.uid()));

-- CLUB_MIEMBRO: ves los miembros de tus clubes, y tu propia membresía. Solo un admin
-- gestiona el roster (añadir, cambiar rol, dar de baja). La primera membresía (admin)
-- la crea crear_club(), que salta el RLS.
drop policy if exists club_miembro_select on club_miembro;
create policy club_miembro_select on club_miembro
  for select using (es_miembro_club(id_club, auth.uid()) or id_perfil = auth.uid());

drop policy if exists club_miembro_admin on club_miembro;
create policy club_miembro_admin on club_miembro
  for all
  using (es_admin_club(id_club, auth.uid()))
  with check (es_admin_club(id_club, auth.uid()));

-- ---------- Comentarios ----------
comment on table club is 'Organización del módulo Comunidad (club/federación). La damos de alta nosotros (B2B, se paga).';
comment on table club_miembro is 'Membresía persona↔club con rol. admin ⊃ entrenador ⊃ deportista.';
comment on table plataforma_admin is 'Cuentas de la plataforma ("nosotros"). Solo ellas crean clubes.';
comment on function crear_club is 'Solo la plataforma: crea un club y designa a su admin (gestor del club).';

-- Refresca la caché del esquema de PostgREST.
notify pgrst, 'reload schema';

-- Comprobación (tras aplicar):
--   insert into plataforma_admin (id_perfil) values ('<tu-uuid>');   -- darnos de alta
--   select crear_club('Club de prueba', '<uuid-del-gestor>', 'club', 'Madrid');
--   select * from club;
--   select * from club_miembro;
