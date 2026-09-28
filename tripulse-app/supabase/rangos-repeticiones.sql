/* APLICADA EN PRODUCCION el 2026-09-28. Comprobado con un insert de prueba
   que el check rechaza un rango al reves (12-10) y un tope sin minimo. */

/* ===============================================================
   Rangos de repeticiones: el tope, al lado del minimo
   =============================================================== */

/* El minimo se queda donde estaba (`repeticiones`, `repeticiones_planteadas`).
   El tope va en una columna nueva, NULL cuando las repeticiones son exactas.
   Asi todo lo que ya leia las repeticiones sigue leyendo un numero y no se
   rompe: no hay nada que migrar y ninguna sesion existente cambia. */

alter table public.ejercicios
  add column if not exists repeticiones_max integer,
  add column if not exists encadenado_repeticiones_max integer;

alter table public.p_repeticiones
  add column if not exists repeticiones_planteadas_max integer;

comment on column public.ejercicios.repeticiones_max is
  'Tope del rango de repeticiones. NULL = repeticiones exactas. Siempre mayor que repeticiones. Se escribe desde lib/repeticiones.ts.';
comment on column public.ejercicios.encadenado_repeticiones_max is
  'Lo mismo para el segundo ejercicio de una superserie.';
comment on column public.p_repeticiones.repeticiones_planteadas_max is
  'Tope del rango. NULL = exactas. Siempre mayor que repeticiones_planteadas.';

/* ===============================================================
   Y que la base impida un rango al reves
   =============================================================== */

/* No hay tope sin minimo, y el tope es mayor que el minimo. Si un dia alguien
   escribe el minimo y se olvida del tope, esto lo para aqui en vez de dejar
   «12-10» en la ficha del atleta. */

alter table public.ejercicios
  add constraint ejercicios_reps_rango_valido
  check (repeticiones_max is null
         or (repeticiones is not null and repeticiones_max > repeticiones));

alter table public.ejercicios
  add constraint ejercicios_encadenado_reps_rango_valido
  check (encadenado_repeticiones_max is null
         or (encadenado_repeticiones is not null
             and encadenado_repeticiones_max > encadenado_repeticiones));

alter table public.p_repeticiones
  add constraint p_repeticiones_rango_valido
  check (repeticiones_planteadas_max is null
         or (repeticiones_planteadas is not null
             and repeticiones_planteadas_max > repeticiones_planteadas));
