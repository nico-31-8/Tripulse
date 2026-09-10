/* ============================================================
   TRIPULSE: cerrar lo que se podía llamar sin sesión (2026-09-10)
   ============================================================
   Sigue a «cerrar_funciones_a_quien_no_tiene_sesion» y «cerrar_el_oraculo_de_
   pertenencia» (09-09), que cerraron las auxiliares de las políticas. Quedaban
   32 funciones SECURITY DEFINER abiertas al rol `anon`, o sea a cualquiera con
   la clave pública que viaja en cada build.

   La mayoría ya comprobaba auth.uid() por dentro y sin sesión no hacía nada.
   Pero eso es una defensa por función, que basta con olvidar una vez: la regla
   tiene que ponerla la base, no cada función.

   Se comprobó dónde llama la app a cada una: todas se llaman CON sesión
   (el alta y la invitación llaman después de signUp o de entrar). Las dos que
   de verdad tienen que quedar abiertas son:
     · reloj_completar: la vuelta de Polar y COROS llega sin sesión.
     · invitacion_por_token (nueva, abajo): la página de la invitación la abre
       alguien que todavía no tiene cuenta.

   Nada de esto borra datos ni cambia qué ve cada usuario con sesión. */


/* ========== 1. Las de los disparadores: no las llama nadie ==========
   Una función de disparador se ejecuta sin mirar el permiso EXECUTE
   (comprobado aquí mismo antes de aplicar, con una tabla de prueba). Llamarla
   por la API no sirve para nada, así que se cierra a todos. */
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prosecdef
       and p.prorettype = 'trigger'::regtype
  loop
    execute 'revoke execute on function ' || f.sig || ' from public, anon, authenticated';
    n := n + 1;
  end loop;
  raise notice 'disparadores cerrados: %', n;
end $$;


/* ========== 2. Las que necesitan sesión ==========
   Se quitan a PUBLIC y a anon (Supabase concede a los dos, y quitarlo solo a
   anon no hace nada: lo hereda de PUBLIC) y se devuelven a authenticated. */
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prosecdef
       and p.proname in (
         'aceptar_invitacion', 'registrar_con_invitacion',
         'admin_cuentas', 'admin_entrenadores', 'admin_eventos', 'admin_fijar_cupo',
         'admin_invitaciones', 'admin_limpiar_eventos', 'admin_resumen', 'admin_salud',
         'crear_invitacion', 'editar_invitacion', 'revocar_invitacion',
         'crear_club', 'crear_grupo', 'invitar_a_club', 'responder_invitacion',
         'actualizar_perfil_publico', 'actualizar_mi_marcador', 'set_estado_social',
         'consumir_cuota', 'registrar_evento', 'desplazar_ciclo', 'ultima_ejecucion_fuerza',
         'eliminar_mi_cuenta')
  loop
    execute 'revoke execute on function ' || f.sig || ' from public, anon';
    execute 'grant execute on function ' || f.sig || ' to authenticated';
    n := n + 1;
  end loop;
  raise notice 'funciones cerradas a quien no tiene sesión: %', n;
end $$;


/* ========== 3. es_admin_plataforma ==========
   Se quedó abierta el 09-09 porque la usa la política de escritura del aviso
   de mantenimiento, que era TO public: anon la evaluaba al LEER el aviso. Pero
   quien escribe el aviso es el admin, con sesión. Acotando esa política a
   authenticated, anon solo pasa por aviso_lee (que sigue abierta: el aviso se
   tiene que ver aunque no se pueda entrar) y la función se puede cerrar.
   Lo que se cierra es otro oráculo: «¿es este uuid admin de la plataforma?». */
alter policy aviso_escribe on public.aviso_app to authenticated;

revoke execute on function public.es_admin_plataforma(uuid) from public, anon;
grant execute on function public.es_admin_plataforma(uuid) to authenticated;


/* ========== 4. Las vistas de comunidad, solo con sesión ==========
   Siguen saltándose la RLS a propósito (son directorios). Pero perfil_publico
   se podía listar entero sin cuenta: nombre, ciudad y bio de quien activó su
   perfil social. Eso es para los usuarios de TRIPULSE, no para internet. Las
   otras cuatro ya daban error sin sesión; así queda explícito. */
revoke select on public.perfil_publico, public.club_roster, public.grupo_roster,
  public.evento_asistentes_v, public.reto_marcador_v from anon;


/* ========== 5. La invitación, por su token y solo por él ==========
   La página /invitacion/[token] leía la tabla invitacion_deportista sin sesión,
   y para eso su política dejaba ver TODAS las invitaciones sin usar, con su
   token. Con la clave pública se podía pedir la lista entera y usar el enlace
   de otro para quedarse con la ficha de ese atleta.

   Esta función devuelve solo el nombre, y solo a quien ya sabe el token. La
   política se cierra en supabase/invitaciones-cerrar-lista.sql, DESPUÉS de
   publicar la página que la usa: al revés, los enlaces pendientes dejarían de
   abrir entre medias. */
create or replace function public.invitacion_por_token(p_token text)
returns table (nombre_deportista text)
language sql stable security definer set search_path = public as $$
  select i.nombre_deportista
    from public.invitacion_deportista i
   where i.token = p_token and i.usado = false
     and length(coalesce(p_token, '')) >= 16
   limit 1;
$$;

revoke execute on function public.invitacion_por_token(text) from public;
grant execute on function public.invitacion_por_token(text) to anon, authenticated;
