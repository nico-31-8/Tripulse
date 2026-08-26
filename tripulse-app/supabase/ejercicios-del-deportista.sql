/* ============================================================
   Ejercicios que se crea el propio deportista
   ============================================================
   Hasta ahora la biblioteca la escribía solo el entrenador: la política era
   «todos los autenticados leen, solo rol=entrenador escribe». Si un atleta hace
   algo que no está en el catálogo —una máquina rara de su gimnasio, un
   ejercicio que le dio el fisio— no tenía dónde apuntarlo.

   Se abre SIN abrir el catálogo común. Cada ejercicio nuevo nace con dueño:

     id_deportista IS NULL  → el catálogo de siempre, lo escribe el entrenador
     id_deportista = 42     → privado de ese atleta

   Un atleta solo puede escribir filas con SU id. La comprobación va en el
   `with check`, así que no es que la app no le deje: es que la base lo rechaza.
   Sin eso, cualquiera podría meter cosas en el catálogo que ven todos.

   QUIÉN LO VE
   El dueño y su entrenador. El entrenador sí, a propósito: es quien mira el
   reparto de series por grupo muscular de la semana, y un ejercicio invisible
   ahí sería un hueco sin explicación en su propia pantalla.

   EL TIPO DE LA COLUMNA LO DICE LA BASE
   No se escribe `bigint` a mano. El esquema real de esta base no está entero en
   el repo, y una columna declarada con el tipo que no es haría fallar la clave
   ajena. Se lee de information_schema y se usa ese.
   ============================================================ */

do $$
declare
  _tipo text;
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'ejercicios_biblioteca' and column_name = 'id_deportista') then
    raise notice 'La columna id_deportista ya existe. No se toca.';
    return;
  end if;

  select data_type into _tipo
    from information_schema.columns
   where table_name = 'deportista' and column_name = 'id';

  if _tipo is null then
    raise exception 'No encuentro deportista.id. ¿Se llama de otra forma la tabla?';
  end if;

  execute format(
    'alter table ejercicios_biblioteca add column id_deportista %s references deportista(id) on delete cascade',
    _tipo);
end $$;

comment on column ejercicios_biblioteca.id_deportista is
  'NULL = catálogo común. Con valor = ejercicio privado de ese deportista.';

create index if not exists eb_deportista_idx
  on ejercicios_biblioteca (id_deportista) where id_deportista is not null;

/* ------------------------------------------------------------
   Quién lee qué
   ------------------------------------------------------------
   La política de antes era `auth.role() = 'authenticated'`: todo el mundo veía
   todo. Con filas privadas por medio eso significaría que el atleta A ve los
   ejercicios que se inventó el atleta B.

   Las filas de siempre tienen id_deportista NULL, así que nada de lo que hoy se
   ve deja de verse. */
drop policy if exists eb_read on ejercicios_biblioteca;

create policy eb_read on ejercicios_biblioteca for select using (
  id_deportista is null
  or exists (
    select 1 from deportista d
     where d.id = ejercicios_biblioteca.id_deportista
       and (d.id_usuario = auth.uid() or d.id_entrenador = auth.uid())
  )
);

/* ------------------------------------------------------------
   Quién escribe qué
   ------------------------------------------------------------
   El entrenador sigue con el catálogo entero, como hasta hoy. El atleta gana
   una política propia que le ata a sus propias filas por los dos lados:
   `using` para no poder tocar las ajenas, `with check` para no poder crear una
   sin dueño ni ponerle el id de otro. */
drop policy if exists eb_write_deportista on ejercicios_biblioteca;

create policy eb_write_deportista on ejercicios_biblioteca for all
  using (
    id_deportista is not null
    and exists (select 1 from deportista d
                 where d.id = ejercicios_biblioteca.id_deportista
                   and d.id_usuario = auth.uid())
  )
  with check (
    id_deportista is not null
    and exists (select 1 from deportista d
                 where d.id = ejercicios_biblioteca.id_deportista
                   and d.id_usuario = auth.uid())
  );
