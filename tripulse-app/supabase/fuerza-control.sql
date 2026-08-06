/* ============================================================
   Cómo se controla el esfuerzo de una serie de fuerza
   ============================================================

   EL PROBLEMA

   El RIR que prescribe el entrenador NO era un dato: se guardaba concatenado
   dentro de `notas_ejecucion`, así:

       notas_ejecucion = "RIR: 2 · lo que sea que escribiera el entrenador"

   O sea que no se podía filtrar, ni graficar, ni comparar con lo que el atleta
   registró después — porque él SÍ tiene columna (`rir_real`). Se podía medir
   algo que no se podía prescribir.

   Y encima el RIR no es la única forma de controlar una serie. Según el
   contexto se usa RPE, el % de pérdida de velocidad (VBT) o el % del 1RM.

   LA SOLUCIÓN: TIPO + VALOR

   Dos columnas en vez de una por cada escala. Añadir `rir`, `rpe`, `vel` y
   `pct1rm` como columnas separadas dejaría tres vacías en cada fila y obligaría
   a mirar cuál tiene algo para saber qué se prescribió.

   `control_valor` es TEXTO a propósito: en fuerza se prescribe en rangos
   («RIR 0-2», «RPE 7-8»), no solo en números sueltos.

   POR QUÉ EL TIPO SE REPITE EN LA SERIE

   `series_realizadas` lleva también `control_tipo`, duplicando el del
   ejercicio. Es deliberado: si el entrenador cambia mañana la prescripción de
   RIR a RPE, los registros de ayer seguirían diciendo la verdad sobre en qué
   escala se anotaron. Sin eso, un cambio de prescripción reinterpretaría el
   pasado en silencio.

   IDEMPOTENTE.
   ============================================================ */

begin;

/* ============================================================
   1. La prescripción (lo que pone el entrenador)
   ============================================================ */
alter table ejercicios add column if not exists control_tipo text
  check (control_tipo in ('rir','rpe','vel','pct1rm'));
alter table ejercicios add column if not exists control_valor text;

comment on column ejercicios.control_tipo is
  'Con qué se controla el esfuerzo: rir | rpe | vel (pérdida de velocidad %) | pct1rm (% del 1RM). NULL = histórico, tratar como rir.';
comment on column ejercicios.control_valor is
  'Valor prescrito, en texto porque se usan rangos: «2», «0-2», «7-8», «20».';

/* ============================================================
   2. El registro (lo que anota el atleta)
   ============================================================
   `control_real` sustituye a `rir_real`, que solo sabía hablar de RIR. Se
   rellena con lo que había para no perder el histórico. */
alter table series_realizadas add column if not exists control_real numeric;
alter table series_realizadas add column if not exists control_tipo text
  check (control_tipo in ('rir','rpe','vel','pct1rm'));

update series_realizadas
   set control_real = rir_real,
       control_tipo = 'rir'
 where rir_real is not null
   and control_real is null;

comment on column series_realizadas.control_real is
  'Lo que reportó el atleta en la escala de control_tipo. Sustituye a rir_real, que se conserva como histórico.';
comment on column series_realizadas.control_tipo is
  'En qué escala está control_real. Se guarda aquí y no solo en el ejercicio para que cambiar la prescripción no reinterprete lo ya registrado.';
comment on column series_realizadas.rir_real is
  'HISTÓRICO. Ya no se escribe: usar control_real + control_tipo.';

/* ============================================================
   3. El modo mejora: que devuelva también el tiempo y la escala
   ============================================================
   ultima_ejecucion_fuerza enseña lo que hizo la última vez para superarlo.
   Devolvía solo peso/reps/RIR, así que:
     · en un ejercicio por TIEMPO no tenía nada que enseñar;
     · si la serie se anotó en RPE, el número salía etiquetado como RIR.

   Cambia el RETURNS TABLE, y eso `create or replace` no lo admite: hay que
   tirar la función antes. Se conserva TAL CUAL la comprobación de permisos
   (solo el propio atleta o su entrenador) y el resto de la lógica. */
drop function if exists ultima_ejecucion_fuerza(int, text, date);

create or replace function ultima_ejecucion_fuerza(_dep int, _nombre text, _antes date)
returns table (
  fecha date,
  numero_serie int,
  ejercicio_numero int,
  peso_real numeric,
  repeticiones_reales numeric,
  tiempo_real int,
  control_real numeric,
  control_tipo text
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
         sr.tiempo_real::int,
         coalesce(sr.control_real, sr.rir_real)::numeric,
         coalesce(sr.control_tipo, 'rir')::text
  from ultima u
  join ses_ej se on se.id_sesion = u.id_sesion
  join series_realizadas sr on sr.id_ejercicio = se.id_ejercicio
  order by sr.ejercicio_numero, sr.numero_serie;
end;
$$;

grant execute on function ultima_ejecucion_fuerza(int, text, date) to authenticated;

commit;

notify pgrst, 'reload schema';

/* ============================================================
   COMPROBACIÓN

     select control_tipo, control_valor from ejercicios limit 5;
     select numero_serie, rir_real, control_real, control_tipo
       from series_realizadas limit 10;
   ============================================================ */
