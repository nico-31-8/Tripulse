-- ============================================================
-- COMUNIDAD · Paso 3 — Descubrir gente
-- ============================================================
-- Dos vías de descubrimiento, según la cara del módulo:
--   · Comunidad abierta → lee `perfil_publico` (paso 2): solo quien está social='activo'.
--   · Mi club           → lee `club_roster` (aquí): los compañeros de MIS clubes.
--
-- Diferencia clave de privacidad: estar en un club es una relación que aceptaste al
-- entrar en él, así que los compañeros de club se ven entre sí SIN depender del opt-in
-- de comunidad. Pero solo se expone el perfil básico, nunca el email ni el entrenamiento.
--
-- ⚠️ NO EJECUTAR TODAVÍA. En revisión.  Idempotente.
-- ------------------------------------------------------------

-- Roster de club: compañeros de los clubes a los que pertenece quien consulta.
-- security_invoker=false → salta el RLS de perfiles (que está cerrado a uno mismo) y
-- expone SOLO estas columnas. El WHERE con es_miembro_club acota a "mis clubes", así
-- que nadie ve el roster de un club ajeno.
create or replace view club_roster
with (security_invoker = false) as
  select
    cm.id_club,
    cm.id_perfil,
    cm.rol_club,
    cm.estado,
    p.nombre,
    p.avatar_url,
    p.ciudad
  from club_miembro cm
  join perfiles p on p.id = cm.id_perfil
  where es_miembro_club(cm.id_club, auth.uid());

grant select on club_roster to authenticated;

comment on view club_roster is 'Compañeros de los clubes del que consulta. Perfil básico, sin email ni entrenamiento.';

-- El directorio de COMUNIDAD abierta no necesita nada nuevo: usa `perfil_publico`
-- (paso 2). El filtrado/búsqueda (por ciudad, deporte, nombre) se resuelve en la app
-- sobre esas dos vistas.
--
-- NOTA de alcance: un sistema de "seguir / conexiones" (grafo social) se puede añadir
-- más adelante si hace falta; de momento la vía para conectar es unirse a un mismo
-- grupo (paso 4). No se mete ahora para no inflar el modelo.

notify pgrst, 'reload schema';

-- Comprobación (tras aplicar):
--   select * from club_roster;      -- los compañeros de tus clubes
--   select * from perfil_publico;   -- la gente de la comunidad abierta
