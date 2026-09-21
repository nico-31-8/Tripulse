/* ============================================================
   Una tarea que se repite en bloques: 3 x (2 x 400)
   ============================================================

   EL PROBLEMA

   Una tarea era un solo nivel: series x un valor, y UN descanso. Asi que un
   3x2x400 no tenia donde ir. Los dos apanos fallaban por sitios distintos:

     . Tres tareas de 2x400: el «3» no era un numero en ningun sitio, y al
       reordenar o editar se descuadraba.
     . Una tarea de 6x400: se perdia la estructura y, sobre todo, solo habia
       un descanso. No se podia decir 1:00 entre los dos 400 y 3:00 entre
       bloques, y esa diferencia ES la sesion.

   LA SOLUCION

   Dos columnas en `tarea`, que el entrenador enciende con un boton por tarea
   solo cuando le hacen falta:

       bloques                    cuantas veces se repite el bloque. Nulo o 1
                                  = tarea normal, sin bloques.
       descanso_bloques_segundos  el descanso LARGO, entre bloques. El corto,
                                  entre series, sigue en `descanso_segundos`.

   QUE CUENTA

   3 x (2 x 400) son seis 400: 2.400 m, no 800. El volumen, la duracion y la
   carga multiplican por series x bloques, y la duracion suma los descansos
   largos. Esa cuenta vive en un solo sitio: lib/bloques-tarea.ts.

   DESHACERLO

   Aditivo: dos columnas nullable. Quitarlas es el `drop column` del final.

   ============================================================ */

alter table tarea add column if not exists bloques integer;
alter table tarea add column if not exists descanso_bloques_segundos integer;

comment on column tarea.bloques is
  'Cuantas veces se repite el bloque (3 en un 3x2x400). Nulo o 1 = sin bloques. La cuenta vive en lib/bloques-tarea.ts';
comment on column tarea.descanso_bloques_segundos is
  'Descanso largo entre bloques, en segundos. El corto entre series sigue en descanso_segundos';

/* ============================================================
   COMPROBAR QUE HA ENTRADO
   ============================================================ */

select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'tarea' and column_name in ('bloques', 'descanso_bloques_segundos')
order by column_name;

/* ============================================================
   DESHACER (no ejecutar salvo que se quiera quitar la funcion)
   ============================================================

   alter table tarea drop column if exists bloques;
   alter table tarea drop column if exists descanso_bloques_segundos;

   ============================================================ */
