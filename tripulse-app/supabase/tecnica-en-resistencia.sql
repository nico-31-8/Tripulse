/* ============================================================
   TECNICA DENTRO DE UNA SESION DE RESISTENCIA

   Hasta ahora la app EVALUABA tecnica (valoracion_tecnica_mesociclo) y
   PREGUNTABA por tecnica (tarea.sensacion_tecnica, 1-5, que alimenta el SICAT),
   pero no habia forma de PRESCRIBIRLA. Para mandar un A-skip habia que crear una
   sesion de fuerza, y entonces esos 3x20 m contaban como carga de fuerza dentro
   de una semana de carrera.

   Decision de diseno: la tecnica NO es una zona. Se elige como si lo fuera
   (esta en el mismo desplegable, que es donde va la mano), pero por debajo la
   tarea guarda su zona real - AER - para que carga, SICAT, calendario y
   mesociclo no cambien ni una linea.

   Lo que marca que una tarea es trabajo tecnico es UNA sola cosa: que
   tecnica_id no sea null. No hay un booleano `es_tecnica` al lado a proposito:
   dos sitios guardando el mismo concepto es de donde salen los fallos que no se
   ven, porque uno se actualiza y el otro no.
   ============================================================ */

/* El tipo de la columna se deduce del id al que apunta. El esquema completo no
   vive en este repo, asi que escribir `bigint` o `int` a mano seria adivinar, y
   equivocarse aqui es un error de FK en tu cara al pegarlo. */
do $$
declare tipo_id text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tarea' and column_name = 'tecnica_id'
  ) then
    raise notice 'tarea.tecnica_id ya existe, no se toca';
    return;
  end if;

  select format_type(a.atttypid, a.atttypmod) into tipo_id
    from pg_attribute a
   where a.attrelid = 'public.ejercicios_biblioteca'::regclass
     and a.attname = 'id' and a.attnum > 0 and not a.attisdropped;

  if tipo_id is null then
    raise exception 'No encuentro ejercicios_biblioteca.id';
  end if;

  execute format(
    'alter table public.tarea add column tecnica_id %s references public.ejercicios_biblioteca(id) on delete set null',
    tipo_id);

  raise notice 'tarea.tecnica_id creada como %', tipo_id;
end $$;

comment on column public.tarea.tecnica_id is
  'Ejercicio de tecnica de ejercicios_biblioteca. Si esta puesto, la tarea es trabajo tecnico. La zona sigue siendo AER a proposito, para que carga, SICAT y calendario la traten como lo que es: volumen suave.';

/* Parcial: la inmensa mayoria de tareas no son de tecnica y no hace falta
   indexarlas. */
create index if not exists tarea_tecnica_idx
  on public.tarea (tecnica_id) where tecnica_id is not null;

/* Comprobacion. Debe devolver una fila con la columna y su tipo. */
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'tarea' and column_name = 'tecnica_id';
