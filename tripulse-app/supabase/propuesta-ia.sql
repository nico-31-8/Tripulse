/* ============================================================
   TRIPULSE — De dónde salió una sesión creada por el asistente
   Ejecutar en: Supabase Dashboard > SQL Editor

   POR QUÉ
     Sin esto no hay forma de saber si el asistente propone bien. Con la columna
     puesta se puede responder a la única pregunta que importa: ¿cuántas
     propuestas se aceptan tal cual y cuántas hay que retocar? Si casi todas se
     editan, el problema está en el prompt, no en el entrenador.

   QUÉ GUARDA
     La propuesta TAL Y COMO SE ACEPTÓ, no un simple booleano. Así, comparándola
     con las tareas que tiene hoy la sesión, se ve si se tocó y en qué.
     Nulo = la sesión no vino del asistente.

   Es una columna nueva y nada más: no cambia ninguna sesión existente.
   ============================================================ */

alter table sesion add column if not exists propuesta_ia jsonb;

comment on column sesion.propuesta_ia is
  'Propuesta del asistente tal y como se aceptó. Nulo si la sesión no vino de una propuesta.';

/* ============================================================
   Verificación
   ============================================================ */
select
  count(*) filter (where propuesta_ia is not null) as desde_el_asistente,
  count(*) as sesiones_totales
from sesion;

/* ============================================================
   La medida que interesa: cuántas se aceptan sin tocar
   ============================================================
   Compara los bloques propuestos con las tareas que tiene la sesión ahora.
   Ejecutar de vez en cuando; con pocas sesiones no dice gran cosa todavía.

select
  s.id,
  s.fecha_sesion,
  s.disciplina,
  s.propuesta_ia->>'nombre'                     as propuesta,
  jsonb_array_length(s.propuesta_ia->'bloques') as bloques_propuestos,
  count(t.id)                                   as tareas_ahora,
  case
    when count(t.id) = jsonb_array_length(s.propuesta_ia->'bloques') then 'sin tocar'
    else 'editada'
  end as estado
from sesion s
left join tarea t on t.id_sesion = s.id
where s.propuesta_ia is not null
group by s.id, s.fecha_sesion, s.disciplina, s.propuesta_ia
order by s.fecha_sesion desc;

   ============================================================ */
