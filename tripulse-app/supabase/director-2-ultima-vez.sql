/* ============================================================
   Director de entrenadores · 2 · «la última vez» también para el director
   ============================================================
   ultima_ejecucion_fuerza() y ultima_ejecucion_encadenado() dan el botón
   «↺ última vez» del editor de fuerza y el «La última vez» de la ejecución.
   Comprobaban el acceso a mano: «es mi deportista o soy yo». Con eso:

   1. Un DIRECTOR con el deportista abierto no veía la última vez, aunque ve
      todas sus sesiones por las tablas. Ahora miran auth_dep_ids(), la misma
      regla de las 31 tablas, que ya incluye al director con acceso (y, de paso,
      al entrenador de un grupo con la ficha de su grupo, que tampoco entraba).

   2. ultima_ejecucion_encadenado se podía LLAMAR SIN SESIÓN (la creé el
      2026-10-09 sin cerrarla a anon). No devolvía nada, porque sin usuario la
      comprobación fallaba, pero una función nueva se cierra al crearla. Se
      cierran las dos a public y anon.

   El resto de cada función queda exactamente como estaba.
   ============================================================ */

set local lock_timeout = '5s';

create or replace function public.ultima_ejecucion_fuerza(_dep integer, _nombre text, _antes date)
returns table(fecha date, numero_serie integer, ejercicio_numero integer, peso_real numeric,
              repeticiones_reales numeric, tiempo_real integer, control_real numeric, control_tipo text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  /* La misma regla que las tablas: el deportista, su entrenador, el entrenador
     de su grupo o un director al que se lo han abierto. */
  if _dep is null or _dep not in (select auth_dep_ids()) then
    return;
  end if;

  return query
  with ses_ej as (
    select s.id as id_sesion, s.fecha_sesion::date as fecha_sesion, e.id as id_ejercicio
    from ejercicios e
    join tarea ta on ta.id = e.id_tarea
    join sesion s on s.id = ta.id_sesion
    where e.nombre = _nombre
      and s.estado = 'Realizada'
      and s.fecha_sesion::date < _antes
      and (
        s.id_deportista = _dep
        or s.id_microciclo in (
          select mi.id from microciclo mi
          join mesociclo me on me.id = mi.id_mesociclo
          join macrociclo ma on ma.id = me.id_macrociclo
          where ma.id_deportista = _dep
        )
      )
  ),
  ultima as (
    select se.id_sesion, se.fecha_sesion
    from ses_ej se
    order by se.fecha_sesion desc
    limit 1
  )
  select u.fecha_sesion,
         sr.numero_serie::int,
         sr.ejercicio_numero::int,
         sr.peso_real::numeric,
         sr.repeticiones_reales::numeric,
         sr.tiempo_real::int,
         coalesce(sr.control_real, sr.rir_real)::numeric,
         coalesce(sr.control_tipo, 'rir')::text
  from ultima u
  join ses_ej se on se.id_sesion = u.id_sesion
  join series_realizadas sr on sr.id_ejercicio = se.id_ejercicio
  order by sr.ejercicio_numero, sr.numero_serie;
end;
$function$;

create or replace function public.ultima_ejecucion_encadenado(_dep integer, _nombre text, _antes date)
returns table(fecha date, numero_serie integer, ejercicio_numero integer, peso_real numeric,
              repeticiones_reales numeric, tiempo_real integer, control_real numeric, control_tipo text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if _dep is null or _dep not in (select auth_dep_ids()) then
    return;
  end if;

  return query
  with ses_ej as (
    select s.id as id_sesion, s.fecha_sesion::date as fecha_sesion, e.id as id_ejercicio,
           case when e.nombre = _nombre then 1 else 2 end as lado
    from ejercicios e
    join tarea ta on ta.id = e.id_tarea
    join sesion s on s.id = ta.id_sesion
    where (e.nombre = _nombre or e.ejercicio_encadenado_nombre = _nombre)
      and s.estado = 'Realizada'
      and s.fecha_sesion::date < _antes
      and (
        s.id_deportista = _dep
        or s.id_microciclo in (
          select mi.id from microciclo mi
          join mesociclo me on me.id = mi.id_mesociclo
          join macrociclo ma on ma.id = me.id_macrociclo
          where ma.id_deportista = _dep
        )
      )
  ),
  ultima as (
    select se.id_sesion, se.fecha_sesion
    from ses_ej se
    order by se.fecha_sesion desc
    limit 1
  )
  select u.fecha_sesion,
         sr.numero_serie::int,
         1,
         sr.peso_real::numeric,
         sr.repeticiones_reales::numeric,
         sr.tiempo_real::int,
         coalesce(sr.control_real, sr.rir_real)::numeric,
         coalesce(sr.control_tipo, 'rir')::text
  from ultima u
  join ses_ej se on se.id_sesion = u.id_sesion
  join series_realizadas sr on sr.id_ejercicio = se.id_ejercicio
       and coalesce(sr.ejercicio_numero, 1) = se.lado
  order by sr.numero_serie;
end;
$function$;

revoke all on function public.ultima_ejecucion_fuerza(integer, text, date) from public, anon;
revoke all on function public.ultima_ejecucion_encadenado(integer, text, date) from public, anon;
grant execute on function public.ultima_ejecucion_fuerza(integer, text, date) to authenticated;
grant execute on function public.ultima_ejecucion_encadenado(integer, text, date) to authenticated;
