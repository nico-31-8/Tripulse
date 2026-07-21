create or replace function ultima_ejecucion_fuerza(_dep int, _nombre text, _antes date)
returns table (
  fecha date,
  numero_serie int,
  ejercicio_numero int,
  peso_real numeric,
  repeticiones_reales numeric,
  rir_real numeric
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not exists (
    select 1 from deportista d
    where d.id = _dep and (d.id_usuario = auth.uid() or d.id_entrenador = auth.uid())
  ) then
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
         sr.rir_real::numeric
  from ultima u
  join ses_ej se on se.id_sesion = u.id_sesion
  join series_realizadas sr on sr.id_ejercicio = se.id_ejercicio
  order by sr.ejercicio_numero, sr.numero_serie;
end;
$$;

grant execute on function ultima_ejecucion_fuerza(int, text, date) to authenticated;

notify pgrst, 'reload schema';
