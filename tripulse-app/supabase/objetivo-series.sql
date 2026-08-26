/* ============================================================
   Cuántas series semanales debería llevar cada grupo
   ============================================================
   Las bandas (mantenimiento, desarrollo, carga alta, sobrevolumen) son una
   referencia genérica: valen para saber si un número es razonable, no para
   decir qué necesita ESTE atleta. Un triatleta con un valgo de rodilla
   necesita más glúteo del que le tocaría por tabla, y eso no lo sabe una banda.

   Esto guarda el número que pone el entrenador para cada grupo. Es opcional:
   sin objetivo, la pantalla sigue funcionando con las bandas de siempre.

   POR QUÉ UNA TABLA Y NO UNA COLUMNA JSON EN `deportista`
   Porque se consulta por grupo y se edita grupo a grupo. Con un JSON, cambiar
   el objetivo de glúteos obliga a leer, modificar y reescribir el objeto
   entero, y dos pestañas abiertas a la vez se pisarían la una a la otra.

   EL TIPO DE id_deportista LO DICE LA BASE
   Igual que en ejercicios-del-deportista.sql: el esquema real no está entero
   en el repo y una clave ajena con el tipo que no es falla al crearse.
   ============================================================ */

do $$
declare
  _tipo text;
begin
  if to_regclass('public.objetivo_series') is not null then
    raise notice 'La tabla objetivo_series ya existe. No se toca.';
    return;
  end if;

  select data_type into _tipo
    from information_schema.columns
   where table_name = 'deportista' and column_name = 'id';

  if _tipo is null then
    raise exception 'No encuentro deportista.id.';
  end if;

  execute format($f$
    create table objetivo_series (
      id_deportista   %s not null references deportista(id) on delete cascade,
      grupo_muscular  text not null,
      series_semana   numeric not null check (series_semana >= 0 and series_semana <= 100),
      actualizado_en  timestamptz not null default now(),
      primary key (id_deportista, grupo_muscular)
    )
  $f$, _tipo);
end $$;

comment on table objetivo_series is
  'Series semanales que debería llevar cada grupo muscular. Lo pone el entrenador; es opcional.';

alter table objetivo_series enable row level security;

/* ============================================================
   El entrenador de ese atleta escribe. El atleta lee lo suyo.
   ============================================================
   El atleta NO escribe: es una prescripción, no una preferencia. Si pudiera
   cambiarse el objetivo, la pantalla dejaría de decirle si va corto y pasaría
   a decirle lo que él mismo se puso. */
drop policy if exists os_lee on objetivo_series;
drop policy if exists os_escribe on objetivo_series;

create policy os_lee on objetivo_series for select using (
  exists (
    select 1 from deportista d
     where d.id = objetivo_series.id_deportista
       and (d.id_usuario = auth.uid() or d.id_entrenador = auth.uid())
  )
);

create policy os_escribe on objetivo_series for all
  using (
    exists (select 1 from deportista d
             where d.id = objetivo_series.id_deportista
               and d.id_entrenador = auth.uid())
  )
  with check (
    exists (select 1 from deportista d
             where d.id = objetivo_series.id_deportista
               and d.id_entrenador = auth.uid())
  );
