/* ============================================================
   Serie a serie · cuando las series de un ejercicio no son iguales
   ============================================================
   Una prescripción de fuerza era UNA fila: unas repeticiones, un peso y un
   control para todas las series. Una pirámide (12/10/8 a 40/45/50 kg) no se
   podía escribir más que en las notas, donde no la lee nadie.

   Dos columnas nuevas en `ejercicios`, una por cada ejercicio de la fila (el
   principal y el encadenado de una superserie): la lista de sus series, una
   entrada por serie, con lo que la distingue:
       { "reps": 12, "reps_max": null, "seg": null, "kg": 40, "control": "3" }
   «seg» va en lugar de «reps» cuando el ejercicio se prescribe por tiempo, y
   «control» se lee en la escala de la fila (control_tipo).

   VACÍA (null) CUANDO TODAS SON IGUALES, que es lo de siempre: entonces mandan
   las columnas de la fila, como hasta hoy. Con series distintas las columnas de
   la fila guardan el resumen (repeticiones = el mínimo, repeticiones_max = el
   máximo, control «1-3», el peso vacío si cambia), así que lo que no sepa de la
   lista sigue leyendo algo cierto. Las cuentas viven en lib/series-detalle.ts.

   PARA TODOS LOS DEMÁS NO CAMBIA NADA: dos columnas que nacen vacías. La RLS de
   `ejercicios` es por fila (ejercicios_dep), así que las columnas la heredan.
   ============================================================ */

set local lock_timeout = '5s';

alter table public.ejercicios
  add column if not exists series_detalle jsonb,
  add column if not exists encadenado_series_detalle jsonb;

/* Una lista y de tamaño razonable: nada de objetos sueltos ni de mil series. */
alter table public.ejercicios drop constraint if exists ejercicios_series_detalle_lista;
alter table public.ejercicios add constraint ejercicios_series_detalle_lista check (
  series_detalle is null
  or (jsonb_typeof(series_detalle) = 'array' and jsonb_array_length(series_detalle) <= 50)
);

alter table public.ejercicios drop constraint if exists ejercicios_encadenado_series_detalle_lista;
alter table public.ejercicios add constraint ejercicios_encadenado_series_detalle_lista check (
  encadenado_series_detalle is null
  or (jsonb_typeof(encadenado_series_detalle) = 'array' and jsonb_array_length(encadenado_series_detalle) <= 50)
);

comment on column public.ejercicios.series_detalle is
  'Serie a serie del ejercicio principal: [{reps, reps_max, seg, kg, control}] por serie. Null = todas iguales (mandan las columnas de la fila).';
comment on column public.ejercicios.encadenado_series_detalle is
  'Serie a serie del ejercicio encadenado de una superserie. Mismo formato que series_detalle.';

notify pgrst, 'reload schema';
