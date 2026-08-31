/* ============================================================
   LA INTENSIDAD, TAMBIÉN EN LOS BLOQUES POR TIEMPO

   QUÉ PASABA. En el editor de la sesión hay un campo «@» donde el entrenador
   escribe la intensidad del bloque: «4:30 /km», «95–105% VAM», «180–220 W».
   Se guardaba en `p_distancia.ritmo_objetivo`, o sea SOLO en los bloques
   medidos en metros. Un bloque medido en tiempo va a `p_duracion`, que no
   tiene esa columna, así que el código calculaba la intensidad y acto seguido
   la tiraba:

       else if (_tabla === 'p_duracion')
         await supabase.from('p_duracion').insert({ id_tarea, tiempo_planeado })

   No fallaba nada. Simplemente «30 min a 4:30/km» llegaba al deportista como
   «30 min», y el ritmo que le habían mandado no existía en ninguna parte.
   En carrera, prescribir por tiempo es lo normal.

   Comprobado con supabase/comprobar-ritmo-objetivo.sql antes de escribir esto:
   la columna existía únicamente en p_distancia (text).

   TEXT Y NO NUMERIC, A PROPÓSITO. Lo que se guarda lleva la unidad dentro
   («180–220 W», «< 65% VAM»), porque el entrenador prescribe en el lenguaje que
   quiere y la app no lo interpreta, lo enseña. `p_distancia.ritmo_objetivo`
   nació `numeric` y hubo que migrarla (supabase/ritmo-objetivo-a-texto.sql);
   esta nace ya bien para no repetir el viaje.
   ============================================================ */

alter table p_duracion add column if not exists ritmo_objetivo text;

comment on column p_duracion.ritmo_objetivo is
  'Intensidad que prescribe el entrenador, con su unidad dentro. Texto libre: 4:30 /km, 95-105% VAM, 180-220 W. Solo lo que el escribe; lo que calcula la app no se guarda.';

notify pgrst, 'reload schema';

/* ============================================================
   COMPROBACIÓN

   Deben salir DOS filas, p_distancia y p_duracion, las dos text.
   ============================================================ */
select table_name, column_name, data_type
  from information_schema.columns
 where table_name in ('p_distancia', 'p_duracion')
   and column_name = 'ritmo_objetivo'
 order by table_name;
