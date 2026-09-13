/* ============================================================
   TRIPULSE: el RPE del atleta, en la sesión Y en sus tareas (2026-09-11)
   ============================================================
   El RPE que el atleta da al cerrar una sesión se guardaba solo en sus tareas
   (tarea.rpe_reportado), pero la carga real, la forma (CTL/ATL/TSB), el ACWR,
   la monotonía, el resumen semanal y el asistente lo leen de la sesión
   (sesion.rpe_reportado). Sin él, calculaban con el RPE PLANIFICADO. Al revés
   pasaba con lo que el atleta apunta por su cuenta y el modo entrenador: solo en
   la sesión, y el SICAT y los índices, que leen de las tareas, no lo veían.

   El código ya escribe los dos (lib/rpe-sesion.ts). Esto rellena lo anterior.
   SOLO RELLENA HUECOS: nunca pisa un RPE que ya esté puesto.

   Comprobado antes de aplicar: en esas sesiones todas las tareas tienen el
   mismo RPE, así que la media es ese número y no se inventa nada.

   Filas que cambia (para poder deshacerlo, dejando esas columnas en null):
     sesion.rpe_reportado  ids 2,4,11,13,79,80,81,121,122,131,168,169,170,173,
                           310,321,323,326,327,333,335,337,338,345,348,411,432,
                           471,477,478,479  (31)
     tarea.rpe_reportado   ids 497,499,502,720  (4) */

/* 1. La sesión, con el de sus tareas. */
update public.sesion s
   set rpe_reportado = x.rpe
  from (select t.id_sesion, round(avg(t.rpe_reportado)::numeric, 1) as rpe
          from public.tarea t
         where t.rpe_reportado is not null
         group by t.id_sesion) x
 where x.id_sesion = s.id
   and s.rpe_reportado is null
   and s.estado = 'Realizada';

/* 2. Las tareas sin RPE, con el de su sesión. Los bricks no: cada bloque puede
   haber costado distinto y no hay de dónde sacarlo. */
update public.tarea t
   set rpe_reportado = s.rpe_reportado
  from public.sesion s
 where s.id = t.id_sesion
   and t.rpe_reportado is null
   and s.rpe_reportado is not null
   and s.estado = 'Realizada'
   and s.disciplina <> 'Brick';
