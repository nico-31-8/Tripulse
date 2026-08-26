/* ============================================================
   Dos tablas con RLS y sin ninguna política
   ============================================================
   Salió de la auditoría. No era un agujero: era lo contrario. Con RLS activada
   y cero políticas, Postgres lo niega TODO. Las tablas estaban blindadas, y por
   eso dos funciones de la app llevaban tiempo sin hacer nada:

   valoracion_tecnica_mesociclo
     El entrenador rellena la valoración técnica del mesociclo, le da a guardar,
     el insert se rechaza en silencio -el código no mira el error- y la pantalla
     recarga vacía. Parece que se guardó. Nunca se guardó nada.

   puntuacion_eco
     La ficha del deportista pide sus puntuaciones ECO y recibe una lista vacía.
     El apartado sale en blanco como si el atleta no tuviera ninguna.

   Las dos tienen `id_deportista`, así que usan el mismo predicado que el resto
   de la app: `auth_dep_ids()`, que devuelve el propio atleta si eres deportista
   y todos los tuyos si eres entrenador. No se inventa nada nuevo.

   LAS OTRAS CUATRO SE QUEDAN CERRADAS
   `carga`, `indices_sesion`, `volumen_muscular` y `evento_app` también salieron
   sin políticas, pero la app no las consulta: cerradas están bien. Y
   `invitacion`, `invitacion_uso` y `plataforma_admin` lo están A PROPÓSITO: solo
   se tocan por funciones SECURITY DEFINER que comprueban quién eres antes.
   Abrirlas sería el fallo.
   ============================================================ */

/* ============================================================
   La valoración técnica del mesociclo
   ============================================================
   Lectura y escritura para quien llega a ese deportista. El entrenador la
   escribe; el atleta puede leer la suya, que es información sobre él. */
drop policy if exists vtm_dep on valoracion_tecnica_mesociclo;

create policy vtm_dep on valoracion_tecnica_mesociclo for all
  using      (id_deportista in (select auth_dep_ids()))
  with check (id_deportista in (select auth_dep_ids()));

/* ============================================================
   La puntuación ECO
   ============================================================
   Solo lectura. La calcula el propio sistema, no se escribe desde el navegador:
   dar permiso de escritura sería abrir una puerta que nadie usa. */
drop policy if exists eco_lee on puntuacion_eco;

create policy eco_lee on puntuacion_eco for select
  using (id_deportista in (select auth_dep_ids()));

notify pgrst, 'reload schema';
