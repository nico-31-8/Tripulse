/* ============================================================
   Vaciar el registro de errores de lo que nunca fue un error
   ============================================================
   El registro llevaba desde el 4 de agosto guardando los fallos de DESARROLLO.
   Al guardar un fichero a medias, Fast Refresh recarga el módulo en un estado
   roto y salta un «X is not defined» que no le ha pasado a ningún usuario.

   Resultado: la pantalla de errores de /admin estaba al cien por cien de ruido.
   Un registro donde no se distingue lo real de lo de casa no es un registro, es
   un archivador — y el día que a alguien le falle algo de verdad, va a quedar
   sepultado entre estos.

   La app ya no los manda (ver lib/eventos-filtros): en local se enseñan en la
   consola, que es donde quien programa ya está mirando. Esto limpia lo de atrás.

   MIRA ANTES DE BORRAR
   La primera consulta no borra nada: cuenta lo que se iría y lo que quedaría.
   Córrela sola, mira los números, y solo entonces descomenta el DELETE.
   ============================================================ */

/* ============================================================
   1. Qué hay ahí dentro
   ============================================================ */
select
  case
    when detalle::text like '%localhost%' or detalle::text like '%127.0.0.1%'
      then 'de desarrollo (se iria)'
    else 'del mundo real (se queda)'
  end as procedencia,
  count(*)      as cuantos,
  min(ts)         as el_mas_viejo,
  max(ts)         as el_mas_nuevo
from evento_app
group by 1
order by 1;

/* ============================================================
   2. El borrado
   ============================================================
   Descomenta este bloque cuando los números de arriba te cuadren.

   Se borra por el CONTENIDO —la pila y el fichero apuntan a localhost—, no por
   la fecha: borrar por fecha se llevaría por delante cualquier fallo real que
   hubiera caído el mismo dia.

delete from evento_app
where detalle::text like '%localhost%'
   or detalle::text like '%127.0.0.1%';

*/
