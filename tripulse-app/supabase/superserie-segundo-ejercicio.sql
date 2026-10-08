/* ============================================================
   El segundo ejercicio de una superserie, con lo suyo propio
   ============================================================

   QUÉ PASA HOY. Una superserie se guarda en UNA fila de `ejercicios`: el
   segundo ejercicio no tiene fila propia, son columnas `encadenado_*` colgadas
   del primero. Y esas columnas se quedaron a medias: hay nombre, series,
   repeticiones e intensidad, pero NO grupo muscular, NI control del esfuerzo,
   NI notas.

   Consecuencias, las cuatro de golpe:
     1. Sus series no se cuentan en el volumen por grupo, porque no hay grupo
        al que sumarlas. Hoy son 89 series invisibles.
     2. No se le puede prescribir RIR ni RPE. La pantalla de ejecución le
        presta el control del PRIMER ejercicio, que puede no tener ninguno.
     3. No se le pueden poner notas.
     4. No se puede saber "la última vez" de ese ejercicio.

   El 4 se arregla en el código (se busca por `ejercicio_encadenado_id`). Los
   otros tres necesitan sitio donde guardar, y eso es esto.

   POR QUÉ EL GRUPO SE COPIA Y NO SE RESUELVE EN VIVO. El grupo del ejercicio
   PRINCIPAL se copia a `ejercicios.grupo_muscular` al prescribir. Si el del
   encadenado se leyera de la biblioteca cada vez, cambiar un ejercicio de
   grupo mañana reescribiría el volumen de todos los meses pasados. Se copia,
   como el otro.

   DESHACER: `alter table ejercicios drop column ...` por las cuatro. No se
   borra ni se cambia ningún dato que ya exista.
*/

alter table ejercicios
  add column if not exists encadenado_grupo_muscular   text,
  add column if not exists encadenado_control_tipo     text,
  add column if not exists encadenado_control_valor    text,
  add column if not exists encadenado_notas_ejecucion  text;

/* ============================================================
   Rellenar el grupo de lo que ya existe
   ============================================================

   Las 31 superseries que hay tienen enlace a la biblioteca y las 31 tienen
   grupo recuperable, así que no queda ninguna a mano.

   Solo se rellena lo que esté vacío: si alguien lo escribe a mano después,
   volver a pasar esto no se lo pisa.
*/

update ejercicios e
set encadenado_grupo_muscular = b.grupo_muscular
from ejercicios_biblioteca b
where b.id = e.ejercicio_encadenado_id
  and e.encadenado_grupo_muscular is null
  and b.grupo_muscular is not null;

/* ============================================================
   Comprobar
   ============================================================ */

select count(*) as superseries,
       count(encadenado_grupo_muscular) as con_grupo,
       count(*) - count(encadenado_grupo_muscular) as sin_grupo
from ejercicios
where ejercicio_encadenado_id is not null;
