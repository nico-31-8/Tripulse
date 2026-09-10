/* ============================================================
   TRIPULSE: la tabla de invitaciones deja de verse sin sesión
   ============================================================
   SE APLICA DESPUÉS de publicar la página /invitacion/[token] que lee por
   invitacion_por_token() (supabase/seguridad-cerrar-funciones.sql). Si se
   aplica antes, los enlaces pendientes dejan de abrir hasta que se publique.

   Qué se cierra: la política invitacion_select dejaba leer, a cualquiera y sin
   sesión, todas las filas con usado = false, token incluido. Con la clave
   pública del navegador se podía pedir la lista entera y abrir el enlace de
   otro atleta: al crear la cuenta, aceptar_invitacion ata esa ficha a quien
   la crea.

   Después de esto:
     · el entrenador sigue viendo y creando las suyas (invitacion_write);
     · la página de la invitación lee por la función, que solo contesta a
       quien trae el token;
     · aceptar_invitacion no cambia: es SECURITY DEFINER y lee la tabla igual. */

drop policy if exists invitacion_select on public.invitacion_deportista;

alter policy invitacion_write on public.invitacion_deportista to authenticated;

revoke all on public.invitacion_deportista from anon;
