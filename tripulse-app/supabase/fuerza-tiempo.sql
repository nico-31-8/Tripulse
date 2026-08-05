/* ============================================================
   Fuerza por tiempo: el atleta registra segundos, no repeticiones
   ============================================================

   El entrenador ya puede prescribir un ejercicio de fuerza por TIEMPO en vez de
   por repeticiones (plancha, paseo del granjero, remo, un bloque de core). Eso
   se guarda en `p_duracion`, que ya existía.

   Lo que faltaba es el otro lado: `series_realizadas` solo tiene
   `repeticiones_reales`, así que al atleta se le preguntaba cuántas
   repeticiones había hecho en una plancha de minuto y medio.

   La tentación era meter los segundos en `repeticiones_reales`. No: es
   exactamente el fallo que llevamos toda la sesión corrigiendo — un campo que
   significa dos cosas distintas según el contexto. Nadie que lea la tabla
   después sabría cuál es cuál, y cualquier media, suma o gráfica mezclaría
   repeticiones con segundos sin avisar.

   Columna nueva, entonces. Nullable: las series por repeticiones la dejan
   vacía, como debe ser.

   IDEMPOTENTE.
   ============================================================ */

begin;

alter table series_realizadas add column if not exists tiempo_real int;

comment on column series_realizadas.tiempo_real is
  'Segundos que aguantó esa serie, cuando el ejercicio se prescribe por tiempo. NULL si va por repeticiones.';

commit;

notify pgrst, 'reload schema';

/* ============================================================
   COMPROBACIÓN

     select column_name, data_type
     from information_schema.columns
     where table_name = 'series_realizadas'
     order by ordinal_position;
   ============================================================ */
