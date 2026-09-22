/* ============================================================
   HÍBRIDO + DISCIPLINAS POR DEPORTISTA
   ============================================================

   1. La disciplina «Hibrido» (fuerza con cardio, tipo HYROX). La tabla
      `sesion` solo admitía una lista fija de disciplinas: sin esto, crear una
      sesión híbrida fallaría al guardar. Las tareas (`tarea.disciplina`) no
      tienen restricción.

   2. `deportista.disciplinas`: las que el entrenador le programa. NULL = todas,
      que es lo que tiene cualquier deportista que ya existía: no cambia nada
      para nadie hasta que el entrenador lo toque en la ficha.

   Solo añade: no borra ni modifica ninguna fila. Para deshacerlo, volver a
   poner la restricción sin 'Hibrido' (si no hay sesiones híbridas) y borrar
   la columna.

   Ver lib/disciplinas.ts.
   ============================================================ */

alter table sesion drop constraint if exists sesion_disciplina_check;
alter table sesion add constraint sesion_disciplina_check check (
  disciplina = any (array['Natación', 'Natacion', 'Ciclismo', 'Carrera', 'Fuerza', 'Brick', 'Hibrido']::text[])
);

alter table deportista add column if not exists disciplinas text[];

comment on column deportista.disciplinas is
  'Disciplinas que el entrenador le programa (menús de crear sesión). NULL = todas. Ver lib/disciplinas.ts';

notify pgrst, 'reload schema';

/* ============================================================
   COMPROBACIÓN

     select pg_get_constraintdef(oid) from pg_constraint
      where conname = 'sesion_disciplina_check';
     select column_name, data_type from information_schema.columns
      where table_name = 'deportista' and column_name = 'disciplinas';
   ============================================================ */
