-- ============================================================
-- BRICKS — transiciones como paso entrenable de la sesión
-- ============================================================
-- Un brick es una sesión (formato, no disciplina) con bloques ordenados
-- (= tareas, cada una con su propia disciplina/zona) y transiciones entre ellos.
--
-- Las transiciones NO van en `tarea` a propósito: contarían como carga/volumen
-- de disciplina y ensuciarían todos los cálculos. Se guardan aquí, en la sesión.
--
-- Formato: [{ "despues_de": 1, "segundos": 90, "nota": "practicar T2" }, ...]
--   · despues_de = `orden` de la tarea (bloque) tras la que va la transición.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ------------------------------------------------------------

alter table sesion add column if not exists transiciones jsonb;

comment on column sesion.transiciones is
  'Bricks: transiciones entre bloques. [{despues_de:int(orden de tarea), segundos:int, nota:text}]';

-- Refresca la caché del esquema de PostgREST.
notify pgrst, 'reload schema';

-- Comprobación:
-- select id, disciplina, transiciones from sesion where transiciones is not null;
