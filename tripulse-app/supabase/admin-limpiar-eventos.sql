/* ============================================================
   Vaciar el registro de errores desde el panel
   ============================================================
   Hace falta una función porque `evento_app` tiene RLS y ninguna política:
   nadie la toca desde la app. Se lee por `admin_eventos`, que es SECURITY
   DEFINER, y ahora se limpia por esta, que comprueba lo mismo.

   BORRA HASTA UN ID, NO TODO
   Y esa es la única decisión de este fichero. Si borrara «todo», pasaría esto:
   miras la lista, te vas a por un café, llega un error nuevo, vuelves y le das
   a limpiar. Ese error —que no has leído— se va con los demás.

   Como el panel manda el id más alto que TENÍA A LA VISTA, lo que llegue
   después sobrevive. Es la diferencia entre «he leído esto y lo archivo» y
   «bórralo todo y que sea lo que Dios quiera».
   ============================================================ */

create or replace function public.admin_limpiar_eventos(_hasta_id bigint)
returns int language plpgsql security definer set search_path = public as $$
declare
  _n int;
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma limpia el registro';
  end if;

  if _hasta_id is null then
    raise exception 'Hace falta decir hasta que id se limpia';
  end if;

  delete from evento_app where id <= _hasta_id;
  get diagnostics _n = row_count;
  return _n;
end $$;

comment on function public.admin_limpiar_eventos is
  'Borra los eventos hasta ese id. Lo que llegue despues de mirar la lista se queda.';

notify pgrst, 'reload schema';
