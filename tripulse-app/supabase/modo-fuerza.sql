-- ============================================================
-- TRIPULSE — Modo de sesión de fuerza
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--   modo_fuerza: 'simple' (una cualidad para toda la sesión)
--                'compleja' (cada tarea elige su cualidad)
--   zona_fuerza: sigla de la zona de fuerza cuando la sesión es simple
--                (AFG, FMI, FMH, FEC, FEA, RFMIX1, RFLA, RFMIX2, RFAE, FLEX)
-- ============================================================

alter table sesion add column if not exists modo_fuerza text;
alter table sesion add column if not exists zona_fuerza text;

-- Verificación
select modo_fuerza, count(*) from sesion where disciplina = 'Fuerza' group by modo_fuerza;
