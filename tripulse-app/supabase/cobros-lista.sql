/* ===============================================================
   A quien llevas en la libreta de cobros
   =============================================================== */

/* No todo el que entrenas te paga: familia, un amigo, alguien a quien llevas
   gratis, o simplemente gente cuyo dinero no quieres ver en esta pantalla. Sin
   esto, la libreta enseña a TODOS tus deportistas y hay que ignorar a la mitad.

   POR QUE UNA TABLA Y NO UNA COLUMNA EN `deportista`: esa tabla la lee tambien
   el propio deportista, y a quien cobras y a quien no es asunto del entrenador.
   Aqui la politica vuelve a mirar solo `id_entrenador`, como el resto de la
   libreta. */

create table if not exists public.cobros_lista (
  id_deportista integer primary key references public.deportista(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.cobros_lista is
  'Quien sale en la libreta de cobros. Quitar a alguien de aqui NO borra su historico: sus cargos y cobros siguen en su sitio por si vuelve.';

alter table public.cobros_lista enable row level security;

create policy cobros_lista_solo_su_entrenador on public.cobros_lista for all
  using (exists (select 1 from public.deportista d
                 where d.id = cobros_lista.id_deportista and d.id_entrenador = auth.uid()))
  with check (exists (select 1 from public.deportista d
                      where d.id = cobros_lista.id_deportista and d.id_entrenador = auth.uid()));
