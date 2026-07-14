-- ============================================================
-- TRIPULSE — Sugerencia de nutrición por sesión
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--   nutricion_carbo_gh:      g/h de carbohidrato objetivo durante la sesión
--   nutricion_agua_mlh:      ml/h de agua
--   nutricion_sodio_mgh:     mg/h de sodio
--   nutricion_cafeina_mg:    dosis única de cafeína en mg (pre-sesión)
--   nutricion_cafeina_timing: cuándo tomarla (texto libre corto)
--   nutricion_ayuno:         si se recomienda hacer la sesión en ayunas
--   nutricion_notas:         notas/ajustes del entrenador
-- Todas nulas por defecto — se rellenan solo si el entrenador abre
-- "Sugerir nutrición" y guarda.
-- ============================================================

alter table sesion add column if not exists nutricion_carbo_gh numeric;
alter table sesion add column if not exists nutricion_agua_mlh numeric;
alter table sesion add column if not exists nutricion_sodio_mgh numeric;
alter table sesion add column if not exists nutricion_cafeina_mg numeric;
alter table sesion add column if not exists nutricion_cafeina_timing text;
alter table sesion add column if not exists nutricion_ayuno boolean;
alter table sesion add column if not exists nutricion_notas text;

-- Verificación
select nutricion_carbo_gh, nutricion_cafeina_mg, nutricion_ayuno, count(*)
from sesion
group by nutricion_carbo_gh, nutricion_cafeina_mg, nutricion_ayuno;
