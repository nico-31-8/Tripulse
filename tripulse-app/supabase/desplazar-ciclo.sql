/* ============================================================
   TRIPULSE — Desplazar un ciclo (y todo lo que cuelga de él)
   ============================================================

   Mover una sesión suelta es un UPDATE y no necesita esto. Lo que necesita
   una función es mover un CICLO: el microciclo arrastra sus sesiones, el
   mesociclo arrastra sus microciclos, y el macrociclo lo arrastra todo.

   POR QUÉ EN LA BASE Y NO EN EL CLIENTE
   Una temporada son ~20 microciclos y ~200 sesiones. Hacerlo desde el
   navegador son 200 peticiones que pueden fallar a la mitad, y un plan
   desplazado a medias es peor que uno sin desplazar: la mitad de las
   sesiones quedan fuera de su semana y nada avisa. Aquí es una transacción.

   LO QUE NO SE MUEVE, A PROPÓSITO
   · Las competiciones. La fecha de una carrera no la decide el entrenador.
     Es justo el punto: si desplazas el plan cuatro días, tienes cuatro días
     MENOS de preparación, y eso tiene que verse.
   · Las semanas bloqueadas. Un viaje es un viaje, esté el plan donde esté.
   · Las sesiones ya realizadas. El atleta entrenó ese día; eso es un hecho.
     Se quedan, y quien mueva el plan tiene que saber que quedarán fuera de
     su microciclo.
   · Las sesiones libres (sin microciclo). No son parte del plan.
   ============================================================ */

create or replace function desplazar_ciclo(_nivel text, _id int, _dias int)
returns table (mesos int, micros int, sesiones int, hechas int)
language plpgsql security definer set search_path = public as $$
declare
  _dep int;
  _micro_ids int[];
  _n_mesos int := 0;
  _n_micros int := 0;
  _n_ses int := 0;
  _n_hechas int := 0;
begin
  if _nivel not in ('macrociclo', 'mesociclo', 'microciclo') then
    raise exception 'Nivel no válido: %', _nivel;
  end if;

  /* De quién es el plan. La comprobación de permiso va contra el deportista,
     igual que el resto de funciones: el dueño o su entrenador. */
  if _nivel = 'macrociclo' then
    select ma.id_deportista into _dep from macrociclo ma where ma.id = _id;
  elsif _nivel = 'mesociclo' then
    select ma.id_deportista into _dep
      from mesociclo me join macrociclo ma on ma.id = me.id_macrociclo
     where me.id = _id;
  else
    select ma.id_deportista into _dep
      from microciclo mi
      join mesociclo me on me.id = mi.id_mesociclo
      join macrociclo ma on ma.id = me.id_macrociclo
     where mi.id = _id;
  end if;

  if _dep is null then
    raise exception 'No existe ese %', _nivel;
  end if;

  if not exists (
    select 1 from deportista d
     where d.id = _dep and (d.id_usuario = auth.uid() or d.id_entrenador = auth.uid())
  ) then
    raise exception 'Sin permiso sobre ese plan';
  end if;

  if _dias = 0 then
    return query select 0, 0, 0, 0;
    return;
  end if;

  /* Los microciclos afectados, que son los que llevan las sesiones. */
  if _nivel = 'macrociclo' then
    select array_agg(mi.id) into _micro_ids
      from microciclo mi
      join mesociclo me on me.id = mi.id_mesociclo
     where me.id_macrociclo = _id;
  elsif _nivel = 'mesociclo' then
    select array_agg(mi.id) into _micro_ids
      from microciclo mi where mi.id_mesociclo = _id;
  else
    _micro_ids := array[_id];
  end if;

  _micro_ids := coalesce(_micro_ids, array[]::int[]);

  /* Las realizadas se cuentan antes de mover, para poder contarlas. */
  select count(*) into _n_hechas
    from sesion s
   where s.id_microciclo = any(_micro_ids)
     and s.estado = 'Realizada';

  with movidas as (
    update sesion s
       set fecha_sesion = (s.fecha_sesion::date + _dias)
     where s.id_microciclo = any(_micro_ids)
       and coalesce(s.estado, '') <> 'Realizada'
       and coalesce(s.eliminada, false) = false
    returning 1
  )
  select count(*) into _n_ses from movidas;

  with movidos as (
    update microciclo mi
       set fecha_inicio = (mi.fecha_inicio::date + _dias)
     where mi.id = any(_micro_ids)
    returning 1
  )
  select count(*) into _n_micros from movidos;

  if _nivel in ('macrociclo', 'mesociclo') then
    with movidos as (
      update mesociclo me
         set fecha_inicio = (me.fecha_inicio::date + _dias)
       where (_nivel = 'mesociclo' and me.id = _id)
          or (_nivel = 'macrociclo' and me.id_macrociclo = _id)
      returning 1
    )
    select count(*) into _n_mesos from movidos;
  end if;

  if _nivel = 'macrociclo' then
    update macrociclo ma
       set fecha_inicio = (ma.fecha_inicio::date + _dias)
     where ma.id = _id;
  end if;

  return query select _n_mesos, _n_micros, _n_ses, _n_hechas;
end $$;

revoke all on function desplazar_ciclo(text, int, int) from public;
grant execute on function desplazar_ciclo(text, int, int) to authenticated;
