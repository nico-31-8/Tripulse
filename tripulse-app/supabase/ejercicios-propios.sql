/* ============================================================
   EJERCICIOS PROPIOS DEL ENTRENADOR
   ============================================================

   QUÉ ARREGLA, ADEMÁS DE LO QUE SE PIDIÓ.

   La regla de escritura de la biblioteca decía «si eres entrenador, puedes
   escribir cualquier fila». Sin límite. Con doce cuentas de entrenador en la
   app, eso significa que cualquiera puede renombrar o BORRAR cualquiera de los
   256 ejercicios del catálogo común y cambiárselo a todos los demás.

   No se ha notado porque hasta ahora lo usaba uno solo.

   LA FORMA ES LA MISMA que en `test_definicion` y `zona_entrenador`: una
   columna `id_entrenador`, y la regla `id_entrenador = auth.uid()`.

   CÓMO QUEDA CADA FILA:

     id_entrenador NULL + id_deportista NULL  →  el catálogo común (256)
     id_entrenador puesto                      →  de ese entrenador y solo suyo
     id_deportista puesto                      →  del atleta (ya existía)

   AL EDITAR UNO COMÚN NO SE TOCA EL COMÚN: se crea una copia del entrenador
   con `origen_id` apuntando al original, y en su lista la copia sustituye al
   de origen. Así cada uno lo llama como quiera sin estropearle el catálogo a
   nadie.
   ============================================================ */

begin;

/* ===  1. De quién es cada ejercicio  === */

alter table ejercicios_biblioteca
  add column if not exists id_entrenador uuid references perfiles(id) on delete cascade;

/* De cuál del común es copia. Con `set null` al borrarse el de origen la copia
   sobrevive: es del entrenador, y perder el enlace no es perder su ejercicio. */
alter table ejercicios_biblioteca
  add column if not exists origen_id bigint references ejercicios_biblioteca(id) on delete set null;

create index if not exists idx_eb_entrenador on ejercicios_biblioteca (id_entrenador);
create index if not exists idx_eb_origen     on ejercicios_biblioteca (origen_id);

/* ===  2. Los que cada entrenador no quiere ver  === */

/* Esconder NO es borrar: la fila del común no se toca, solo deja de salirle a
   quien la escondió. Por eso vive en su propia tabla y no en una columna. */
create table if not exists ejercicio_oculto (
  id_entrenador uuid   not null references perfiles(id) on delete cascade,
  id_ejercicio  bigint not null references ejercicios_biblioteca(id) on delete cascade,
  creado_en     timestamptz not null default now(),
  primary key (id_entrenador, id_ejercicio)
);

alter table ejercicio_oculto enable row level security;

drop policy if exists ejercicio_oculto_suyo on ejercicio_oculto;
create policy ejercicio_oculto_suyo on ejercicio_oculto
  for all
  using      (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid()));

/* ===  3. Quién puede leer qué  === */

drop policy if exists eb_read on ejercicios_biblioteca;
create policy eb_read on ejercicios_biblioteca
  for select
  using (
    /* El catálogo común lo ve todo el mundo. */
    (id_entrenador is null and id_deportista is null)

    /* Lo mío, si soy el entrenador. */
    or id_entrenador = (select auth.uid())

    /* EL DE MI ENTRENADOR, si soy el deportista. Sin esto, al ejecutar una
       sesión el atleta vería el nombre del ejercicio (que va copiado en la
       prescripción) pero NO el vídeo, que se resuelve en vivo contra esta
       tabla. Un ejercicio propio se quedaría mudo justo donde hace falta. */
    or exists (
      select 1 from deportista d
      where d.id_usuario = (select auth.uid())
        and d.id_entrenador = ejercicios_biblioteca.id_entrenador
    )

    /* Lo del atleta: suyo y de su entrenador. Esto ya estaba. */
    or exists (
      select 1 from deportista d
      where d.id = ejercicios_biblioteca.id_deportista
        and (d.id_usuario = (select auth.uid()) or d.id_entrenador = (select auth.uid()))
    )
  );

/* ===  4. Quién puede escribir qué  === */

/* AQUÍ ESTABA EL AGUJERO. La regla de antes era «existe un perfil mío con rol
   entrenador», que es verdad para los doce y no mira la fila: con ella,
   cualquiera escribía en cualquier ejercicio, incluidos los 256 comunes. */
drop policy if exists eb_write on ejercicios_biblioteca;
create policy eb_write on ejercicios_biblioteca
  for all
  using      (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid()));

/* La del atleta se queda como estaba: solo sobre los suyos. */

commit;

/* ============================================================
   DESPUÉS DE ESTO

   El catálogo común queda de SOLO LECTURA desde la app, para todos. Para
   cambiarlo hace falta entrar por aquí, que es lo que se quería: lo comparten
   doce cuentas.

   Lo ya prescrito NO se toca. Las sesiones copian el nombre y el grupo
   muscular del ejercicio, así que nada de esto mueve un histórico.
   ============================================================ */
