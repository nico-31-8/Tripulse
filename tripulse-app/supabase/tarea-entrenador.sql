-- ============================================================
-- Tareas del ENTRENADOR por deportista (to-do del hub del dashboard)
-- ============================================================
-- Checklist que el entrenador se apunta para cada deportista en el dashboard.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ------------------------------------------------------------

create table if not exists tarea_entrenador (
  id            bigint generated always as identity primary key,
  id_entrenador uuid    not null references auth.users(id) on delete cascade,
  id_deportista integer not null references deportista(id) on delete cascade,
  texto         text    not null,
  hecho         boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tarea_entrenador_dep on tarea_entrenador(id_deportista);
create index if not exists idx_tarea_entrenador_ent on tarea_entrenador(id_entrenador);

alter table tarea_entrenador enable row level security;

-- El entrenador solo ve/gestiona sus propias tareas.
drop policy if exists tarea_entrenador_own on tarea_entrenador;
create policy tarea_entrenador_own on tarea_entrenador
  for all
  using (id_entrenador = auth.uid())
  with check (id_entrenador = auth.uid());

-- Refresca la caché del esquema de PostgREST.
notify pgrst, 'reload schema';
