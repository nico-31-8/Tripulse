/*
  COMUNIDAD · Paso 6 — Perfiles ricos (prueba social)
  - palmares: carreras/resultados del deportista (estructurado). Lectura para la comunidad
    (perfiles social=activo) y para el propio dueño; escritura solo del dueño.
  - num_deportistas(entrenador): nº de atletas de un entrenador, seguro (security definer),
    para lucirlo en su perfil sin exponer la tabla deportista.
  La bio ya la edita actualizar_perfil_publico (paso 2); aquí no hace falta tocarla.
  Idempotente. perfiles.id = auth.users.id.
*/

create table if not exists palmares (
  id uuid primary key default gen_random_uuid(),
  id_perfil uuid not null references perfiles(id) on delete cascade,
  nombre text not null,
  fecha date,
  tipo_prueba text,
  tiempo text,
  posicion text,
  destacada boolean not null default false,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_palmares_perfil on palmares(id_perfil);

alter table palmares enable row level security;

drop policy if exists palmares_select on palmares;
create policy palmares_select on palmares for select using (
  id_perfil = (select auth.uid())
  or exists (select 1 from perfiles p where p.id = palmares.id_perfil and p.social = 'activo')
);
drop policy if exists palmares_insert on palmares;
create policy palmares_insert on palmares for insert with check (id_perfil = (select auth.uid()));
drop policy if exists palmares_update on palmares;
create policy palmares_update on palmares for update using (id_perfil = (select auth.uid())) with check (id_perfil = (select auth.uid()));
drop policy if exists palmares_delete on palmares;
create policy palmares_delete on palmares for delete using (id_perfil = (select auth.uid()));

create or replace function num_deportistas(_id uuid)
returns int language sql security definer stable set search_path = public as $$
  select count(*)::int from deportista where id_entrenador = _id;
$$;

grant execute on function num_deportistas(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
