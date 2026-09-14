/* ============================================================
   TRIPULSE — Los tests de la batería, con sus números de verdad
   ============================================================

   EL PROBLEMA QUE ARREGLA. Los diecisiete tests de campo escribían en
   `tests_libres`, que es la tabla de las notas sueltas: nombre, fecha y un
   `resultado` de tipo TEXTO. O sea que un RSI de 1,42 quedaba guardado como la
   palabra «1,42», al lado de un «Cooper - 2800 m» tecleado a mano, y con el
   nombre del test pegado delante del de la salida («Drop Jump - RSI»).

   Consecuencias: ni gráfica de evolución, ni récords, ni comparar dos fechas,
   ni distinguir lo medido de lo calculado. Y una fila por cada número, así que
   un Bosco dejaba cinco filas sueltas sin nada que dijera que eran el mismo
   test.

   CÓMO QUEDA. Una fila por TEST HECHO:
     · `brutos`      lo que se midio, tal cual se tecleo
     · `resultados`  lo que se calculo, una clave por salida
     · `principal`   el numero que encabeza, en numeric, para graficar sin
                     abrir el jsonb
     · `protocolo`   con que ajustes se hizo (escalon inicial, incremento,
                     duracion del escalon). Sin esto, dos Montreal que
                     empezaron en 8 y en 10 km/h no se pueden comparar y nadie
                     sabria por que.
     · `modo`        'campo' si se dirigio con cronometro, 'mano' si se metio
                     despues. Cambia lo que vale el numero.

   `tests_libres` se queda donde esta y con lo suyo: los tests que el entrenador
   apunta a mano y que no son de la bateria. Cada tabla, un significado.

   REVERSIBLE: tabla nueva, no toca ninguna existente. Para deshacer,
   `drop table public.test_campo`.
   ============================================================ */

create table if not exists public.test_campo (
  id bigint generated always as identity primary key,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  /* La clave del catalogo: '6min', 't30', 'bosco'... */
  clave text not null,
  fecha date not null,
  brutos jsonb not null default '{}'::jsonb,
  resultados jsonb not null default '{}'::jsonb,
  principal numeric,
  principal_clave text,
  unidad text,
  modo text check (modo in ('campo', 'mano')),
  protocolo jsonb not null default '{}'::jsonb,
  notas text,
  created_at timestamptz not null default now()
);

/* Lo que se pregunta siempre: la evolucion de UN test de UN atleta por fecha. */
create index if not exists test_campo_dep_clave_fecha
  on public.test_campo (id_deportista, clave, fecha desc);

alter table public.test_campo enable row level security;

/* Mismo candado que el resto de tests: el atleta ve lo suyo y su entrenador
   tambien, y eso lo resuelve `auth_dep_ids()` en un solo sitio. */
drop policy if exists test_campo_dep on public.test_campo;
create policy test_campo_dep on public.test_campo
  for all
  using (id_deportista in (select auth_dep_ids()))
  with check (id_deportista in (select auth_dep_ids()));
