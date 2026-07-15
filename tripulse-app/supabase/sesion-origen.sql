-- ============================================================
-- Sesiones añadidas por el DEPORTISTA (no programadas / "libres")
-- ============================================================
-- Permite que el atleta registre sesiones que va a hacer (o ya hizo) aunque no
-- estén planificadas, en CUALQUIER fecha (tenga o no plan ahí).
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ------------------------------------------------------------

-- 1) Quién creó la sesión: 'entrenador' (por defecto) o 'deportista'.
alter table sesion add column if not exists origen text default 'entrenador';

-- 2) Permitir sesiones "libres" sin microciclo (fuera de un plan).
--    id_deportista ya identifica al dueño, así que el microciclo puede ser nulo.
alter table sesion alter column id_microciclo drop not null;

-- 3) Re-backfill de id_deportista por si alguna sesión quedó sin dueño
--    (p. ej. creada tras la fase-a). Idempotente.
update sesion s
set id_deportista = mi.id_deportista
from microciclo mi
where mi.id = s.id_microciclo
  and s.id_deportista is null;

-- Refresca la caché del esquema de PostgREST.
notify pgrst, 'reload schema';

-- Comprobación:
-- select origen, count(*) from sesion group by origen;
-- select count(*) from sesion where id_deportista is null;  -- debería ser 0
