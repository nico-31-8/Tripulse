/* ============================================================
   TRIPULSE — Quitar un deportista
   ============================================================

   El entrenador podía añadir deportistas pero no quitarlos. Y no era solo que
   faltara el botón: la base tampoco le dejaba soltarlo (la política de la
   ficha exige que siga siendo suyo después del cambio), y borrar la ficha a
   lo bruto fallaba con la mitad de los deportistas (los que entraron con una
   invitación) y dejaba huérfanas sus sesiones libres, que no cuelgan de la
   ficha por ninguna clave.

   QUÉ HACE, SEGÚN TENGA CUENTA O NO (decidido por el usuario el 15-10-2026):

   · CON CUENTA PROPIA se DESVINCULA. Sus datos son suyos, no del entrenador:
     sale de su lista y de su cupo, y conserva su cuenta, su plan y su
     historial. Puede volver con un código. Es lo mismo que ya podía hacer él
     desde su perfil, y por eso esta función también la usa el propio
     deportista: así las dos puertas limpian lo mismo.
       - Primero se cierran sus grupos con ese entrenador (el sello de la
         pertenencia exige que el deportista sea del entrenador del grupo:
         después de soltarlo ya no se podría).
       - Se quitan los accesos de director a él. Los dio su entrenador, y si
         se quedaran, al entrar con otro entrenador que trabajara con el mismo
         director ese permiso viejo volvería a valer sin que nadie lo diera.

   · SIN CUENTA (una ficha que creó el entrenador) se BORRA con todo, y solo
     su entrenador, escribiendo su nombre: la base lo comprueba también, no
     solo la pantalla. Antes de la ficha se borra a mano lo que no cuelga de
     ella por una clave: las series (las de fuerza cuelgan del ejercicio y
     pararían el borrado), sus sesiones, competiciones, disponibilidad,
     semanas bloqueadas, mensajes, valoraciones, invitaciones y pesos. El
     resto se va en cascada con la ficha.

   · La ficha de un GRUPO no se quita aquí: se quita borrando el grupo.

   Todo en una función: o se hace entero o no se hace nada.
   ============================================================ */

create or replace function quitar_deportista(_id bigint, _nombre text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  _yo uuid := auth.uid();
  _d record;
begin
  select id, nombre, id_entrenador, id_usuario, id_grupo into _d from deportista where id = _id;
  if _d.id is null then
    raise exception 'No existe ese deportista';
  end if;
  if _d.id_grupo is not null then
    raise exception 'La ficha de un grupo se quita borrando el grupo';
  end if;
  if _yo is null or (_yo is distinct from _d.id_entrenador and _yo is distinct from _d.id_usuario) then
    raise exception 'Solo su entrenador, o el propio deportista, pueden hacer esto';
  end if;

  /* Con cuenta: se desvincula, y nunca se borra (aunque se escriba su nombre). */
  if _d.id_usuario is not null then
    if _d.id_entrenador is null then
      return 'sin_entrenador';
    end if;
    update grupo_entreno_miembro set hasta = current_date
     where id_deportista = _id and hasta is null
       and id_grupo in (select g.id from grupo_entreno g where g.id_entrenador = _d.id_entrenador);
    delete from director_acceso where id_deportista = _id;
    update deportista set id_entrenador = null where id = _id;
    return 'desvinculado';
  end if;

  /* Sin cuenta: se borra, solo su entrenador y con su nombre. */
  if _yo is distinct from _d.id_entrenador then
    raise exception 'Solo su entrenador puede borrar esta ficha';
  end if;
  if lower(btrim(coalesce(_nombre, ''))) <> lower(btrim(coalesce(_d.nombre, ''))) then
    raise exception 'Para borrarla hay que escribir su nombre tal cual';
  end if;

  delete from series_realizadas sr
   where sr.id_deportista = _id
      or sr.id_tarea in (select t.id from tarea t join sesion s on s.id = t.id_sesion where s.id_deportista = _id)
      or sr.id_ejercicio in (select e.id from ejercicios e join tarea t on t.id = e.id_tarea join sesion s on s.id = t.id_sesion where s.id_deportista = _id);
  delete from sesion where id_deportista = _id;
  delete from tarea where id_deportista = _id;
  delete from competicion where id_deportista = _id;
  delete from disponibilidad where id_deportista = _id;
  delete from semana_bloqueada where id_deportista = _id;
  delete from mensajes where id_deportista = _id;
  delete from valoracion_tecnica_mesociclo where id_deportista = _id;
  delete from invitacion_deportista where id_deportista = _id;
  delete from registro_peso where id_deportista = _id;
  delete from deportista where id = _id;
  return 'borrado';
end $$;

revoke all on function quitar_deportista(bigint, text) from public;
/* Y de anon por su nombre: los privilegios por defecto de Supabase se la dan. */
revoke execute on function quitar_deportista(bigint, text) from anon;
grant execute on function quitar_deportista(bigint, text) to authenticated;
