-- ============================================================
-- Plantillas de sesión PROPIAS del entrenador
-- ============================================================
-- Las plantillas del SISTEMA (las 28 sacadas de la base de Obsidian) viven en
-- código, en lib/plantillas.ts — no en esta tabla. Aquí solo van las que el
-- entrenador se guarda desde una sesión que ya ha montado.
--
-- Son del ENTRENADOR, no de un deportista: crea "Potencia láctica a mi manera"
-- una vez y la usa con cualquiera de sus atletas. Por eso no hay id_deportista.
--
-- Una plantilla guarda ZONAS, no ritmos: al aplicarla, el ritmo de cada bloque
-- lo pone el atleta a partir de sus tests (lib/zonas.ts).
--
-- `bloques` es un array plano (una sola versión), a diferencia de las del sistema
-- que traen 3 niveles: esta sale de una sesión real, que tiene un único volumen.
--   [{ "zona": "PLA", "series": 6, "metros": 200, "descansoSeg": 180, "nota": null }]
--   · metros   → natación y carrera
--   · segundos → ciclismo (lib/duracion.ts no estima la bici por distancia)
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ------------------------------------------------------------

create table if not exists plantilla_sesion (
  id            bigint generated always as identity primary key,
  id_entrenador uuid    not null references auth.users(id) on delete cascade,
  nombre        text    not null,
  disciplina    text    not null,
  zona          text    not null,   -- zona pico: por la que se ordena y se pinta
  objetivo      text,
  bloques       jsonb   not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_plantilla_sesion_ent on plantilla_sesion(id_entrenador);
create index if not exists idx_plantilla_sesion_disc on plantilla_sesion(disciplina);

alter table plantilla_sesion enable row level security;

-- Cada entrenador solo ve y gestiona las suyas.
drop policy if exists plantilla_sesion_own on plantilla_sesion;
create policy plantilla_sesion_own on plantilla_sesion
  for all
  using (id_entrenador = auth.uid())
  with check (id_entrenador = auth.uid());

comment on table plantilla_sesion is
  'Plantillas de sesión propias del entrenador. Las del sistema están en lib/plantillas.ts.';
comment on column plantilla_sesion.bloques is
  'Bloques de la sesión: [{zona, series, metros|segundos, descansoSeg, nota}]. Zonas, no ritmos.';

-- Refresca la caché del esquema de PostgREST.
notify pgrst, 'reload schema';

-- Comprobación:
-- select id, nombre, disciplina, zona, jsonb_array_length(bloques) as n_bloques from plantilla_sesion;
