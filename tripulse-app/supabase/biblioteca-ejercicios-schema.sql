-- ============================================================
-- TRIPULSE — Biblioteca de Fuerza: columna `ejecucion`
--
-- EJECUTAR ESTE ARCHIVO ANTES QUE biblioteca-ejercicios.sql
--
-- Cambio aditivo y nullable: las filas existentes no se tocan y
-- nada que hoy funcione deja de funcionar. Las politicas RLS de
-- ejercicios_biblioteca son de tabla, no de columna, asi que
-- siguen aplicando igual sin cambios.
--
-- Idempotente: `if not exists` permite reejecutarlo sin error.
--
-- Reparto de campos:
--   descripcion → para que sirve en triatlon (1 linea, se ve en la lista)
--   ejecucion   → tecnica paso a paso (se ve en el modal de detalle)
-- ============================================================

alter table ejercicios_biblioteca
  add column if not exists ejecucion text;

comment on column ejercicios_biblioteca.descripcion is
  'Para que sirve el ejercicio en triatlon. Una linea; se muestra en la lista.';

comment on column ejercicios_biblioteca.ejecucion is
  'Tecnica paso a paso, pasos numerados separados por salto de linea. Se muestra en el modal de detalle.';
