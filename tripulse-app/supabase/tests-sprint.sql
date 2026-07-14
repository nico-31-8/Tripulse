-- ============================================================
-- TRIPULSE — Tests de sprint (ASR/APR) para Zonas 2
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- Métricas de velocidad/potencia máxima para las zonas anaeróbicas:
--   MSS (carrera)  = velocidad máxima sprint (km/h)  → ASR = MSS − VAM
--   MPP (ciclismo) = potencia pico máxima (W)        → APR = MPP − FTP
--   V25/V50 (nat.) = velocidades de sprint (m/s)      → reserva anaeróbica
-- Son columnas nuevas en las tablas de test existentes (aditivo).
-- ============================================================

alter table test1_carrera  add column if not exists mss numeric;   -- km/h
alter table test3_ciclismo add column if not exists mpp numeric;    -- vatios
alter table test2_natacion add column if not exists v25 numeric;    -- m/s
alter table test2_natacion add column if not exists v50 numeric;    -- m/s

-- Verificación
select 'test1_carrera' as tabla, count(*) filter (where mss is not null) as con_mss from test1_carrera
union all select 'test3_ciclismo', count(*) filter (where mpp is not null) from test3_ciclismo
union all select 'test2_natacion', count(*) filter (where v25 is not null) from test2_natacion;
