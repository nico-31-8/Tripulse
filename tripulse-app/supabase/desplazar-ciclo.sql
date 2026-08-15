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


/* ============================================================
   Cambiar la duración de un mesociclo
   ============================================================

   No es editar un número. Acortar un mesociclo de 4 a 3 semanas plantea dos
   preguntas que la app tiene que hacer en voz alta:

   1. QUÉ PASA CON LA SEMANA QUE SOBRA. Puede tener sesiones dentro. O se
      mandan a la papelera, o se sueltan del plan y se quedan en el calendario
      como sesiones libres. Nunca se borran de verdad y nunca se decide aquí:
      lo elige el entrenador antes de confirmar.

   2. QUÉ PASA CON LO QUE VIENE DETRÁS. Si nadie se mueve, queda un agujero de
      siete días en mitad de la temporada. Con `_arrastrar`, los mesociclos
      posteriores suben (o bajan) esa misma cantidad reutilizando
      `desplazar_ciclo`, que ya sabe llevarse microciclos y sesiones consigo.

   Alargar es lo simétrico: se crean los microciclos que faltan, vacíos, y lo
   posterior se desplaza hacia adelante.
   ============================================================ */

create or replace function redimensionar_mesociclo(
  _id int, _semanas int, _arrastrar boolean, _sobrante text
)
returns table (
  semanas_antes int, semanas_ahora int,
  micros_fuera int, sesiones_afectadas int, mesos_movidos int
)
language plpgsql security definer set search_path = public as $$
declare
  _dep int;
  _macro int;
  _ini date;
  _antes int;
  _delta int;
  _fin_nuevo date;
  _ids_fuera int[];
  _n_ses int := 0;
  _n_mesos int := 0;
  _f date;
  _otro record;
begin
  if _semanas < 1 then
    raise exception 'Un mesociclo no puede durar menos de una semana';
  end if;
  if _sobrante not in ('liberar', 'papelera') then
    raise exception 'Qué hacer con lo que sobra: liberar o papelera';
  end if;

  select ma.id_deportista, ma.id, me.fecha_inicio::date, coalesce(me.duracion_semanas, 4)
    into _dep, _macro, _ini, _antes
    from mesociclo me join macrociclo ma on ma.id = me.id_macrociclo
   where me.id = _id;

  if _dep is null then
    raise exception 'No existe ese mesociclo';
  end if;

  if not exists (
    select 1 from deportista d
     where d.id = _dep and (d.id_usuario = auth.uid() or d.id_entrenador = auth.uid())
  ) then
    raise exception 'Sin permiso sobre ese plan';
  end if;

  _delta := _semanas - _antes;
  if _delta = 0 then
    return query select _antes, _antes, 0, 0, 0;
    return;
  end if;

  _fin_nuevo := _ini + (_semanas * 7);

  /* Las semanas que ya no caben dentro. Al alargar no hay ninguna. */
  select array_agg(mi.id) into _ids_fuera
    from microciclo mi
   where mi.id_mesociclo = _id and mi.fecha_inicio::date >= _fin_nuevo;
  _ids_fuera := coalesce(_ids_fuera, array[]::int[]);

  if array_length(_ids_fuera, 1) > 0 then
    /* SIEMPRE se despegan del microciclo, en las dos opciones. Si no, al
       borrar el microciclo de abajo se irían con él por la clave ajena: la
       "papelera" habría borrado las sesiones de verdad, que es justo lo que
       esta función promete no hacer. `id_deportista` es obligatorio para que
       sigan existiendo para alguien — las sesiones sin microciclo se buscan
       por ahí. */
    with t as (
      update sesion s
         set id_microciclo = null,
             id_deportista = _dep,
             eliminada = case when _sobrante = 'papelera' then true else s.eliminada end
       where s.id_microciclo = any(_ids_fuera)
      returning 1
    ) select count(*) into _n_ses from t;

    delete from microciclo where id = any(_ids_fuera);
  end if;

  /* Al alargar, las semanas nuevas nacen vacías. */
  if _delta > 0 then
    _f := _ini + (_antes * 7);
    while _f < _fin_nuevo loop
      if not exists (select 1 from microciclo mi where mi.id_mesociclo = _id and mi.fecha_inicio::date = _f) then
        insert into microciclo (id_mesociclo, objetivo, tipo, fecha_inicio, duracion_dias)
        values (_id, 'Semana ' || (((_f - _ini) / 7) + 1), 'Carga', _f, 7);
      end if;
      _f := _f + 7;
    end loop;
  end if;

  update mesociclo set duracion_semanas = _semanas where id = _id;

  /* Y lo que viene detrás, para no dejar un agujero. */
  if _arrastrar then
    for _otro in
      select me.id from mesociclo me
       where me.id_macrociclo = _macro
         and me.id <> _id
         and me.fecha_inicio::date > _ini
       order by me.fecha_inicio
    loop
      perform * from desplazar_ciclo('mesociclo', _otro.id, _delta * 7);
      _n_mesos := _n_mesos + 1;
    end loop;

    update macrociclo
       set duracion_semanas = greatest(1, coalesce(duracion_semanas, 0) + _delta)
     where id = _macro;
  end if;

  return query select _antes, _semanas, coalesce(array_length(_ids_fuera, 1), 0), _n_ses, _n_mesos;
end $$;

revoke all on function redimensionar_mesociclo(int, int, boolean, text) from public;
grant execute on function redimensionar_mesociclo(int, int, boolean, text) to authenticated;
