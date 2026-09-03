/* ============================================================
   POR QUÉ HAY SEMANAS CON CHIPS Y SIN BARRA
   Ejecutar en: Supabase Dashboard > SQL Editor
   ============================================================

   LO QUE SE VE. En el dibujo de Bruno, las semanas S1 y S2 tienen barra de
   volumen y de S3 en adelante no, aunque abajo se vean los chips.

   LO QUE SON DOS COSAS DISTINTAS. Los chips de la fila ZONAS son el DIBUJO del
   entrenador: viven en `dibujo_borrador.sesiones_zonas` y existen aunque no se
   haya bajado nada al calendario. La barra sale de las SESIONES DE VERDAD, de
   la tabla `sesion`. Una semana puede tener chips dibujados y ninguna sesión
   creada, y entonces la barra vale cero con razon.

   PERO HAY UN SEGUNDO MOTIVO, Y ES EL MALO. La barra es RPE x minutos, y los
   minutos salen, por este orden, de:

       duracion_real  ->  duracion_minutos  ->  estimacion desde las tareas

   La estimacion necesita que las tareas tengan metros o tiempo planeados. Una
   sesion creada desde un chip, con su tarea puesta pero sin metros ni tiempo,
   NO SE PUEDE ESTIMAR: vale cero minutos y por tanto cero de carga. La semana
   sale vacia en la grafica teniendo sesiones dentro, y nada avisa.

   Estas consultas dicen cual de los dos casos es.
   ============================================================ */


/* ============================================================
   1. QUIEN ES BRUNO

   Si salen varios, quedate con el id que toque y usalo abajo.
   ============================================================ */
select id, nombre, id_entrenador
  from deportista
 where nombre ilike '%bruno%'
 order by id;


/* ============================================================
   2. SESIONES POR SEMANA

   Cuantas hay de verdad en cada semana y cuantas de ellas tienen con que
   calcular su carga. `sin_minutos` es el numero que explica una barra a cero.
   ============================================================ */
with b as (select id from deportista where nombre ilike '%bruno%' limit 1)
select date_trunc('week', s.fecha_sesion)::date as semana,
       count(*) as sesiones,
       count(*) filter (where coalesce(s.duracion_real, 0) > 0)     as con_duracion_real,
       count(*) filter (where coalesce(s.duracion_minutos, 0) > 0)  as con_duracion_manual,
       count(*) filter (where coalesce(s.duracion_real, 0) = 0
                          and coalesce(s.duracion_minutos, 0) = 0)  as sin_minutos,
       count(*) filter (where s.rpe_estimado is null)               as sin_rpe
  from sesion s, b
 where s.id_deportista = b.id
   and coalesce(s.eliminada, false) = false
 group by 1
 order by 1;


/* ============================================================
   3. LAS TAREAS DE ESAS SESIONES

   Si una sesion no tiene minutos propios, la carga depende de poder estimarla
   desde sus tareas. Aqui se ve si sus tareas traen metros o tiempo planeados.

   Una fila con tareas > 0 pero con_metros = 0 y con_tiempo = 0 es EL CASO MALO:
   la sesion existe, tiene contenido, y aun asi vale cero en la grafica.
   ============================================================ */
with b as (select id from deportista where nombre ilike '%bruno%' limit 1)
select date_trunc('week', s.fecha_sesion)::date as semana,
       s.id as id_sesion,
       s.fecha_sesion,
       s.disciplina,
       s.duracion_minutos,
       s.duracion_real,
       s.rpe_estimado,
       count(t.id)                                        as tareas,
       count(pd.id_tarea)                                 as con_metros,
       count(pt.id_tarea)                                 as con_tiempo,
       count(e.id_tarea)                                  as con_ejercicios
  from sesion s
  join b on true
  left join tarea t       on t.id_sesion = s.id
  left join p_distancia pd on pd.id_tarea = t.id and pd.metros_planeados is not null
  left join p_duracion  pt on pt.id_tarea = t.id and pt.tiempo_planeado  is not null
  left join ejercicios  e  on e.id_tarea  = t.id
 where s.id_deportista = b.id
   and coalesce(s.eliminada, false) = false
 group by 1, 2, 3, 4, 5, 6, 7
 order by s.fecha_sesion, s.id;


/* ============================================================
   4. EL RESUMEN, QUE ES LO QUE HAY QUE MIRAR

   Por semana: cuantas sesiones NO tienen forma de dar carga. Si en las semanas
   sin barra este numero es igual al de sesiones, ya esta explicado.
   ============================================================ */
with b as (select id from deportista where nombre ilike '%bruno%' limit 1),
sess as (
  select s.id, s.fecha_sesion,
         coalesce(s.duracion_real, 0) > 0 or coalesce(s.duracion_minutos, 0) > 0 as tiene_minutos
    from sesion s, b
   where s.id_deportista = b.id
     and coalesce(s.eliminada, false) = false
),
estim as (
  select t.id_sesion,
         count(pd.id_tarea) + count(pt.id_tarea) + count(e.id_tarea) as datos_para_estimar
    from tarea t
    left join p_distancia pd on pd.id_tarea = t.id and pd.metros_planeados is not null
    left join p_duracion  pt on pt.id_tarea = t.id and pt.tiempo_planeado  is not null
    left join ejercicios  e  on e.id_tarea  = t.id
   where t.id_sesion in (select id from sess)
   group by t.id_sesion
)
select date_trunc('week', sess.fecha_sesion)::date as semana,
       count(*) as sesiones,
       count(*) filter (
         where not sess.tiene_minutos
           and coalesce(estim.datos_para_estimar, 0) = 0
       ) as no_pueden_dar_carga
  from sess
  left join estim on estim.id_sesion = sess.id
 group by 1
 order by 1;
