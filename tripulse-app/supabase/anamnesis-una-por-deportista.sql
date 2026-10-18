/* ============================================================
   TRIPULSE — Una anamnesis por deportista
   ============================================================

   APLICADO el 18-10-2026 (migración `anamnesis_una_por_deportista`).

   La deportista 20 llegó a tener cinco filas en `anamnesis`. Todos los que la
   leían usaban maybeSingle(), que con dos filas no devuelve la primera:
   devuelve un error y `data` a null. Para la app no tenía anamnesis (el
   planificador le ponía 8 h / 5 días por defecto) y /alta, al no ver ninguna,
   insertaba otra. El código ya no lo hace —lib/anamnesis-vigente.ts lee la
   vigente y guarda sobre ella—; este índice hace que la base tampoco lo
   permita: una segunda fila da error en vez de quedarse.

   ANTES se dejó una fila por deportista (solo la 20 tenía repetidas), con
   permiso del usuario y en un bloque que se paraba si algo no cuadraba:
     · se quedó la 12, la que envió completa el 15-10, con lo más nuevo del
       alta del 18-10: años en triatlón, horas a la semana y disciplina floja;
     · se borraron la 10 y la 11 (borradores anteriores de la 12) y la 13 y la
       14 (el alta repetida).
   Eso no se reejecuta: dependía de esas filas concretas.

   idx_anamnesis_dep (el mismo campo, sin único) queda redundante. Se puede
   quitar; no estorba.

   Marcha atrás: drop index public.anamnesis_un_deportista;
   ============================================================ */

create unique index if not exists anamnesis_un_deportista on public.anamnesis (id_deportista);
