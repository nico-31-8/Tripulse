/* ============================================================
   BLOQUES CON FORMATO (rondas, AMRAP, EMOM, for time, Tabata)
   ============================================================

   Un bloque es una tarea con varias líneas (sus filas de `ejercicios`) que se
   hacen juntas. Ver lib/bloque-formato.ts.

   tarea
     formato         'rondas' | 'amrap' | 'emom' | 'fortime' | 'tabata'.
                     NULL = una línea suelta, como todas las de hasta hoy.
     formato_config  rondas, descanso, minutos, esquema 21-15-9, límite…
     resultado       lo que apunta el atleta: tiempo, rondas + reps, minutos
                     completados… Es lo que se compara con la última vez.

   ejercicios
     medida          'reps' | 'seg' | 'm' | 'cal'. NULL = repeticiones, como
                     hasta hoy.
     cantidad        cuánto, en su medida (200 m, 45 s, 15 cal…).
     orden           el orden de las líneas dentro del bloque (en un EMOM que
                     alterna, qué toca en cada minuto).

   Solo añade columnas vacías: no toca ninguna fila existente. Para deshacerlo,
   borrar las columnas (se pierden los bloques que se hayan creado).
   ============================================================ */

alter table tarea add column if not exists formato text;
alter table tarea add column if not exists formato_config jsonb;
alter table tarea add column if not exists resultado jsonb;

alter table tarea drop constraint if exists tarea_formato_check;
alter table tarea add constraint tarea_formato_check check (
  formato is null or formato = any (array['rondas', 'amrap', 'emom', 'fortime', 'tabata']::text[])
);

alter table ejercicios add column if not exists medida text;
alter table ejercicios add column if not exists cantidad numeric;
alter table ejercicios add column if not exists orden integer;

alter table ejercicios drop constraint if exists ejercicios_medida_check;
alter table ejercicios add constraint ejercicios_medida_check check (
  medida is null or medida = any (array['reps', 'seg', 'm', 'cal']::text[])
);

comment on column tarea.formato is 'Bloque con formato: rondas, amrap, emom, fortime, tabata. NULL = línea suelta. Ver lib/bloque-formato.ts';
comment on column tarea.formato_config is 'Configuración del bloque (rondas, descanso, minutos, esquema, límite…)';
comment on column tarea.resultado is 'Resultado que apunta el atleta en un bloque (segundos, rondas, reps, minutos, peor…)';
comment on column ejercicios.medida is 'Medida de una línea de bloque: reps, seg, m, cal. NULL = repeticiones';
comment on column ejercicios.cantidad is 'Cantidad de una línea de bloque, en su medida';
comment on column ejercicios.orden is 'Orden de la línea dentro del bloque';

notify pgrst, 'reload schema';

/* ============================================================
   COMPROBACIÓN

     select column_name, data_type from information_schema.columns
      where (table_name = 'tarea' and column_name in ('formato', 'formato_config', 'resultado'))
         or (table_name = 'ejercicios' and column_name in ('medida', 'cantidad', 'orden'));
   ============================================================ */
