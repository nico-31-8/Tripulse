/* ============================================================
   El catálogo común de tests de valoración: solo lo toca el administrador
   ============================================================

   EL AGUJERO. La regla de escritura `tv_write` decía «si eres entrenador,
   puedes hacer de todo» con cualquier fila: crear, cambiar y BORRAR. Con 12
   cuentas de entrenador, cualquiera podía renombrar o borrar cualquiera de los
   26 tests comunes y quitárselos a todos los demás.

   Lo único que lo "protegía" era una clave en la pantalla de /fuerza. Una
   clave en el JavaScript nunca es protección: cualquiera con cuenta de
   entrenador puede hablar con la base directamente, sin pasar por esa
   pantalla, porque la clave anónima de Supabase es pública. Y además esa
   clave está escrita en el código, y el repositorio de GitHub es público.

   Es EXACTAMENTE el mismo fallo que se cerró el 2026-10-04 en el catálogo de
   ejercicios (`ejercicios-propios.sql`). Allí cada entrenador pasó a tener sus
   propios ejercicios; aquí la tabla no tiene dueño por fila —es un catálogo
   común de verdad—, así que la regla correcta es más simple: lo lee todo el
   mundo y lo escribe solo el administrador de la plataforma.

   QUIÉN ES EL ADMINISTRADOR lo decide `es_admin_plataforma(uid)`, la misma
   función que ya protege el panel /admin. No se inventa otra forma de saberlo.

   LECTURA: no cambia. `tv_read` sigue dejando leer a cualquiera con sesión.

   DESHACER: volver a crear `tv_write` con la condición de antes (está en el
   historial: «perfiles.rol = 'entrenador'»). No se borra ni se cambia ningún
   dato.
*/

drop policy if exists tv_write on tests_valoracion;

create policy tv_write on tests_valoracion
  for all
  to authenticated
  using ( public.es_admin_plataforma((select auth.uid())) )
  with check ( public.es_admin_plataforma((select auth.uid())) );

/* ============================================================
   Comprobar
   ============================================================ */

select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'tests_valoracion'
order by cmd;
