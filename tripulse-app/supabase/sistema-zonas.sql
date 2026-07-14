-- ============================================================
-- TRIPULSE — Sistema de zonas por deportista
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- Campo que controla qué sistema de zonas usa cada deportista:
--   1 = clásico (Z1–Z7)
--   2 = Zonas 2 (sistema metabólico: AER…PALA + fuerza)
-- Por defecto 1 para no cambiar a los deportistas existentes.
-- ============================================================

alter table deportista add column if not exists sistema_zonas integer not null default 1;

-- Verificación
select sistema_zonas, count(*) from deportista group by sistema_zonas;
