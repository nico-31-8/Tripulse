/* ============================================================
   ritmo_objetivo: DE numeric A text

   QUÉ PASA. La columna está declarada `numeric` y toda la app le escribe TEXTO:
   lo que devuelve `prescripcion()`, que trae la unidad y el rango dentro
   («180–220 W», «4:12–4:30 /km», «> 2:05 /100m», «Por APR (sprint)»). Ninguna de
   esas cuatro cosas cabe en un número, así que la escritura falla SIEMPRE. Por
   eso la columna tiene 0 filas rellenas: no es que no se use, es que no entra.

   Y falla en silencio. Hasta ahora, en el editor de sesión el ritmo iba DENTRO
   del insert de la fila, así que al caerse la escritura se caía la fila entera y
   la tarea se quedaba SIN DISTANCIA. Solo les pasaba a los atletas con el test
   hecho: sin test no hay ritmo sugerido, el insert va con null y todo cuadra.
   Ya está separado en dos pasos, así que el dato importante no se pierde, pero
   el ritmo sigue sin poder guardarse hasta que la columna cambie de tipo.

   La alternativa era guardar un número de segundos, y no sirve: no hay forma de
   meter «180–220 W» ni un rango en un numeric. La prescripción ES texto.

   El bloque 1 SOLO LEE. El bloque 2 modifica el esquema.
   ============================================================ */

/* ===== 1. ¿Cuántas tareas se quedaron sin medición? =====
   Candidatas al fallo: tareas de resistencia sin fila en NINGUNA de las tres
   tablas de medición. No todas serán por esto (se puede crear una tarea sin
   medición a mano), pero si el número es alto y se concentra en atletas con
   test hecho, es este. Se excluyen las de fuerza: esas miden con `ejercicios`.

   `dep_con_test` cruza con los tests para poder mirarlo. */
with sin_medicion as (
  select t.id, t.disciplina, t.zona_entrenamiento, s.id_deportista, s.fecha_sesion
    from tarea t
    join sesion s on s.id = t.id_sesion
   where not exists (select 1 from ejercicios     e where e.id_tarea = t.id)
     and not exists (select 1 from p_distancia    d where d.id_tarea = t.id)
     and not exists (select 1 from p_duracion     u where u.id_tarea = t.id)
     and not exists (select 1 from p_repeticiones r where r.id_tarea = t.id)
),
dep_con_test as (
  select id_deportista from test1_carrera where vam is not null
  union select id_deportista from test3_ciclismo where ftp is not null
  union select id_deportista from test2_natacion where css is not null
)
select
  (select count(*) from sin_medicion) as tareas_sin_medicion,
  (select count(*) from sin_medicion sm
     where sm.id_deportista in (select id_deportista from dep_con_test)) as de_atletas_con_test,
  (select count(*) from sin_medicion sm
     where sm.zona_entrenamiento is not null) as con_zona_puesta;

/* ===== 2. El cambio de tipo =====
   La columna tiene 0 filas rellenas, así que no hay nada que convertir: el
   `using` está por corrección, no porque vaya a transformar datos.

   Es reversible mientras siga vacía. En cuanto se guarde el primer texto con
   unidad, volver a numeric ya no se podrá sin perderlo. */
alter table p_distancia
  alter column ritmo_objetivo type text using ritmo_objetivo::text;

/* ===== 3. Comprobar =====
   Debe decir `text`. */
select column_name, data_type
  from information_schema.columns
 where table_name = 'p_distancia' and column_name = 'ritmo_objetivo';

/* ============================================================
   DESPUÉS DE ESTO

   La casilla del «@» del entrenador empieza a guardarse de verdad, y con ella la
   caja naranja «Ritmo objetivo» del atleta aparece por primera vez. Se pinta con
   `ritmoObjetivoTexto` (lib/referencia-zona), que devuelve el texto tal cual.

   NO hace falta rellenar nada hacia atrás: las tareas viejas no tienen ritmo
   guardado, y la pantalla de ejecución ya calcula el de la zona en vivo cuando
   no hay guardado. Lo viejo sigue enseñando lo mismo que hasta hoy.
   ============================================================ */
