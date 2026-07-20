-- ============================================================
-- TRIPULSE — Biblioteca de Fuerza · FASE 1: esquema de etiquetas + tabla de tests
--
-- ADITIVO Y NO DESTRUCTIVO. No borra nada.
--   - Añade columnas de etiquetas (text[]) a ejercicios_biblioteca.
--   - NO toca ni elimina grupo_muscular (convive con las etiquetas
--     hasta la Fase 5, cuando la app ya no dependa de él).
--   - Crea la tabla tests_valoracion con su RLS espejo de
--     ejercicios_biblioteca (todos los autenticados leen; solo
--     entrenadores escriben).
--
-- Idempotente: 'if not exists' permite reejecutarlo sin error.
--
-- EJES DE ETIQUETAS (todas text[], un ejercicio puede llevar varias):
--   tipo       → Fuerza | Movilidad | Tecnica | Rehab
--   region     → grupo anatomico (Gluteos, Cuadriceps, Core...)
--   disciplina → Natacion | Ciclismo | Carrera
--   lesion     → protocolo de rehab (femoropatelar, cintilla, aquiles...)
--   momento    → dinamico | estatico   (solo movilidad)
-- ============================================================

-- ---------- 1. Etiquetas en ejercicios_biblioteca ----------
alter table ejercicios_biblioteca add column if not exists tipo       text[] default '{}';
alter table ejercicios_biblioteca add column if not exists region     text[] default '{}';
alter table ejercicios_biblioteca add column if not exists disciplina text[] default '{}';
alter table ejercicios_biblioteca add column if not exists lesion     text[] default '{}';
alter table ejercicios_biblioteca add column if not exists momento    text[] default '{}';

comment on column ejercicios_biblioteca.tipo       is 'Fuerza | Movilidad | Tecnica | Rehab (varias posibles)';
comment on column ejercicios_biblioteca.region     is 'Grupo anatomico. Sustituye a grupo_muscular a partir de Fase 5.';
comment on column ejercicios_biblioteca.disciplina is 'Natacion | Ciclismo | Carrera';
comment on column ejercicios_biblioteca.lesion     is 'Protocolo de rehab al que pertenece (slug)';
comment on column ejercicios_biblioteca.momento    is 'dinamico | estatico (solo movilidad)';

-- Indices GIN para filtrar por etiqueta con el operador @> (contiene)
create index if not exists eb_tipo_idx       on ejercicios_biblioteca using gin (tipo);
create index if not exists eb_region_idx     on ejercicios_biblioteca using gin (region);
create index if not exists eb_disciplina_idx on ejercicios_biblioteca using gin (disciplina);
create index if not exists eb_lesion_idx     on ejercicios_biblioteca using gin (lesion);

-- ---------- 2. Tabla tests_valoracion ----------
create table if not exists tests_valoracion (
  id               bigint generated always as identity primary key,
  nombre           text not null,
  descripcion      text,          -- que evalua / cuando usarlo (1-2 lineas)
  protocolo        text,          -- como se ejecuta, paso a paso
  valor_referencia text,          -- umbral (ej: "valgo <10 grados = correcto")
  interpretacion   text,          -- que significa un resultado fallido y que hacer
  url_video        text,          -- video del test (opcional)
  categoria        text[] default '{}',  -- clinico | movilidad | funcional
  region           text[] default '{}',
  disciplina       text[] default '{}',
  lesion           text[] default '{}',
  creado_en        timestamptz default now()
);

-- Nombre unico: hace la carga de la Fase 3 idempotente por nombre
create unique index if not exists tests_valoracion_nombre_key on tests_valoracion (nombre);

create index if not exists tv_categoria_idx on tests_valoracion using gin (categoria);
create index if not exists tv_lesion_idx    on tests_valoracion using gin (lesion);

-- RLS espejo de ejercicios_biblioteca
alter table tests_valoracion enable row level security;

drop policy if exists tv_read  on tests_valoracion;
drop policy if exists tv_write on tests_valoracion;

create policy tv_read on tests_valoracion for select
  using (auth.role() = 'authenticated');
create policy tv_write on tests_valoracion for all
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'entrenador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'entrenador'));

-- ============================================================
-- Verificacion (opcional): columnas nuevas y politicas de la tabla nueva
-- ============================================================
-- select column_name, data_type from information_schema.columns
--   where table_name = 'ejercicios_biblioteca' and column_name in
--   ('tipo','region','disciplina','lesion','momento');
-- select tablename, count(*) from pg_policies
--   where tablename = 'tests_valoracion' group by tablename;
