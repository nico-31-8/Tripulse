-- ============================================================
-- COMUNIDAD · Paso 4 — Grupos y quedadas
-- ============================================================
-- Los GRUPOS los crea cualquiera que esté en la comunidad (social='activo'). Es la vía
-- B2C, gratis — a diferencia del club, que lo crea la plataforma. Un grupo puede ser
-- 'abierto' (comunidad) o 'club' (interno de un club). Cada grupo puede tener quedadas
-- (eventos) con confirmación de asistencia.
--
-- ⚠️ NO EJECUTAR TODAVÍA. En revisión.  Idempotente.
-- ------------------------------------------------------------

-- ---------- Tablas ----------

create table if not exists grupo (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  ambito      text not null default 'abierto',   -- 'abierto' | 'club'
  id_club     uuid references club(id) on delete cascade,   -- solo si ambito='club'
  disciplina  text,                                          -- deporte principal (opcional)
  creado_por  uuid references perfiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists grupo_miembro (
  id_grupo   uuid not null references grupo(id) on delete cascade,
  id_perfil  uuid not null references perfiles(id) on delete cascade,
  rol        text not null default 'miembro',   -- 'admin' | 'miembro'
  created_at timestamptz not null default now(),
  primary key (id_grupo, id_perfil)
);

create table if not exists evento (
  id          uuid primary key default gen_random_uuid(),
  id_grupo    uuid references grupo(id) on delete cascade,   -- null = quedada suelta
  titulo      text not null,
  descripcion text,
  fecha       timestamptz not null,
  lugar       text,
  disciplina  text,
  creado_por  uuid references perfiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists evento_asistente (
  id_evento  uuid not null references evento(id) on delete cascade,
  id_perfil  uuid not null references perfiles(id) on delete cascade,
  estado     text not null default 'voy',   -- 'voy' | 'quiza' | 'no'
  created_at timestamptz not null default now(),
  primary key (id_evento, id_perfil)
);

create index if not exists idx_grupo_miembro_perfil on grupo_miembro(id_perfil);
create index if not exists idx_evento_grupo on evento(id_grupo);
create index if not exists idx_evento_fecha on evento(fecha);

-- ---------- Helpers ----------

create or replace function es_social_activo(_uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from perfiles where id = _uid and social = 'activo');
$$;

create or replace function es_miembro_grupo(_grupo uuid, _uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from grupo_miembro where id_grupo = _grupo and id_perfil = _uid);
$$;

create or replace function es_admin_grupo(_grupo uuid, _uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from grupo_miembro where id_grupo = _grupo and id_perfil = _uid and rol = 'admin');
$$;

-- Crear grupo + hacer admin al creador (bootstrapping del RLS admin-only, igual que el club).
create or replace function crear_grupo(_nombre text, _ambito text default 'abierto', _id_club uuid default null, _disciplina text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not es_social_activo(auth.uid()) then
    raise exception 'Hay que estar en la comunidad para crear un grupo';
  end if;
  if _ambito = 'club' and not es_miembro_club(_id_club, auth.uid()) then
    raise exception 'Solo un miembro del club puede crear un grupo interno';
  end if;
  insert into grupo (nombre, ambito, id_club, disciplina, creado_por)
    values (_nombre, coalesce(_ambito,'abierto'), _id_club, _disciplina, auth.uid())
    returning id into _id;
  insert into grupo_miembro (id_grupo, id_perfil, rol) values (_id, auth.uid(), 'admin');
  return _id;
end;
$$;

-- ---------- RLS ----------

alter table grupo enable row level security;
alter table grupo_miembro enable row level security;
alter table evento enable row level security;
alter table evento_asistente enable row level security;

-- GRUPO: los abiertos los ve quien está en la comunidad; los de club, sus miembros;
-- y siempre, quien ya es del grupo. Crear/editar por crear_grupo() y admins.
drop policy if exists grupo_select on grupo;
create policy grupo_select on grupo for select using (
  es_miembro_grupo(id, auth.uid())
  or (ambito = 'abierto' and es_social_activo(auth.uid()))
  or (ambito = 'club' and es_miembro_club(id_club, auth.uid()))
);
drop policy if exists grupo_admin on grupo;
create policy grupo_admin on grupo for update using (es_admin_grupo(id, auth.uid())) with check (es_admin_grupo(id, auth.uid()));
drop policy if exists grupo_borrar on grupo;
create policy grupo_borrar on grupo for delete using (es_admin_grupo(id, auth.uid()));

-- GRUPO_MIEMBRO: ves los miembros de tus grupos y tu propia fila. Unirse a un grupo
-- ABIERTO es autoservicio (tu propia fila); a uno de club/privado lo mete un admin.
drop policy if exists grupo_miembro_select on grupo_miembro;
create policy grupo_miembro_select on grupo_miembro for select using (
  es_miembro_grupo(id_grupo, auth.uid()) or id_perfil = auth.uid()
);
drop policy if exists grupo_miembro_unirse on grupo_miembro;
create policy grupo_miembro_unirse on grupo_miembro for insert with check (
  (id_perfil = auth.uid() and exists (select 1 from grupo g where g.id = id_grupo and g.ambito = 'abierto'))
  or es_admin_grupo(id_grupo, auth.uid())
);
drop policy if exists grupo_miembro_salir on grupo_miembro;
create policy grupo_miembro_salir on grupo_miembro for delete using (
  id_perfil = auth.uid() or es_admin_grupo(id_grupo, auth.uid())
);

-- Ver un evento = poder ver su grupo (o, si es suelto, estar en la comunidad).
create or replace function puede_ver_evento(_evento uuid, _uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from evento e
    where e.id = _evento and (
      (e.id_grupo is null and es_social_activo(_uid))
      or es_miembro_grupo(e.id_grupo, _uid)
    )
  );
$$;

-- EVENTO: lo ve quien puede ver su grupo. Lo crea un miembro del grupo (o cualquiera
-- de la comunidad si es suelto). Lo edita/borra su creador o un admin del grupo.
drop policy if exists evento_select on evento;
create policy evento_select on evento for select using (
  (id_grupo is null and es_social_activo(auth.uid())) or es_miembro_grupo(id_grupo, auth.uid())
);
drop policy if exists evento_crear on evento;
create policy evento_crear on evento for insert with check (
  creado_por = auth.uid() and (
    (id_grupo is null and es_social_activo(auth.uid())) or es_miembro_grupo(id_grupo, auth.uid())
  )
);
drop policy if exists evento_editar on evento;
create policy evento_editar on evento for update using (
  creado_por = auth.uid() or (id_grupo is not null and es_admin_grupo(id_grupo, auth.uid()))
);
drop policy if exists evento_borrar on evento;
create policy evento_borrar on evento for delete using (
  creado_por = auth.uid() or (id_grupo is not null and es_admin_grupo(id_grupo, auth.uid()))
);

-- ASISTENCIA: confirmas por ti (tu propia fila) a eventos que puedes ver; la lista de
-- asistentes la ve todo el que puede ver el evento.
drop policy if exists evento_asistente_select on evento_asistente;
create policy evento_asistente_select on evento_asistente for select using (puede_ver_evento(id_evento, auth.uid()));
drop policy if exists evento_asistente_rsvp on evento_asistente;
create policy evento_asistente_rsvp on evento_asistente for all
  using (id_perfil = auth.uid())
  with check (id_perfil = auth.uid() and puede_ver_evento(id_evento, auth.uid()));

-- Asistentes a una quedada, con nombre (sin email), para eventos que puedo ver.
create or replace view evento_asistentes_v
with (security_invoker = false) as
  select ea.id_evento, ea.id_perfil, ea.estado, p.nombre, p.avatar_url
  from evento_asistente ea
  join perfiles p on p.id = ea.id_perfil
  where puede_ver_evento(ea.id_evento, auth.uid());
grant select on evento_asistentes_v to authenticated;

-- Roster del grupo: miembros de los grupos a los que pertenece quien consulta, con su
-- perfil básico (sin email). Mismo patrón que club_roster.
create or replace view grupo_roster
with (security_invoker = false) as
  select gm.id_grupo, gm.id_perfil, gm.rol, p.nombre, p.avatar_url, p.ciudad
  from grupo_miembro gm
  join perfiles p on p.id = gm.id_perfil
  where es_miembro_grupo(gm.id_grupo, auth.uid());
grant select on grupo_roster to authenticated;

comment on table grupo is 'Grupo de comunidad (abierto) o interno de club. Lo crea cualquiera social=activo (B2C).';
comment on table evento is 'Quedada de entrenamiento. Puede colgar de un grupo o ser suelta.';

notify pgrst, 'reload schema';
