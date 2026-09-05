/* ============================================================
   TRIPULSE - Con que nace cada fila nueva de tareas
   ============================================================

   La franja de "Por defecto en esta sesion" del editor: unidad, series,
   descanso, grupo muscular, tipo de serie, medida y control.

   UNA COLUMNA Y NO DIEZ. Diez columnas serian diez migraciones, y otra mas
   cada vez que se quiera predeterminar algo nuevo. Ninguna de ellas la lee
   nadie fuera del editor de sesion, que es justo el caso en que una columna
   por campo no aporta nada.

   LA ZONA NO ESTA AQUI. `sesion.zona_fuerza` y `sesion.zona_resistencia` ya
   existen y NO son valores por defecto: son datos de la sesion que leen el
   mesociclo, el calendario y la vista de semana. Guardar aqui otra zona seria
   el mismo concepto en dos sitios. La de aqui es respaldo y solo se mira en
   las sesiones "complejas", que no tienen zona propia.

   Forma de lo que guarda:

     {
       "resistencia": { "unidad": "m", "series": "4", "descanso": "1:30" },
       "fuerza":      { "grupoMuscular": "Pierna", "control": "rir" }
     }

   Se guarda NULL cuando no queda nada fijado, para que una sesion sin franja
   no ocupe ni se lea distinto de una anterior a esta columna.

   Es aditivo: no toca ninguna fila ni ninguna politica. Correrlo dos veces no
   hace nada la segunda.
   ============================================================ */

alter table sesion
  add column if not exists valores_por_defecto jsonb;

comment on column sesion.valores_por_defecto is
  'Con que nace cada fila nueva del editor de tareas. Solo lo fijado; NULL si no hay nada. La zona NO va aqui: vive en zona_fuerza / zona_resistencia.';

/* Comprobacion: debe devolver una fila con data_type = jsonb */
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'sesion' and column_name = 'valores_por_defecto';
