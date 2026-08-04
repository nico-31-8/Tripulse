/* ============================================================
   Arreglo 1 del panel — tipos de admin_cuentas()
   ============================================================

   Fallaba con:
     42804 structure of query does not match function result type
     Returned type bigint does not match expected type integer in column 7

   La columna 7 es id_deportista: `deportista.id` es bigint y yo lo había
   declarado int. Postgres avisa solo de la PRIMERA columna que no cuadra, así
   que puede haber más detrás; por eso ahora todo va con cast explícito en la
   consulta, y así el tipo declarado y el devuelto no pueden discrepar.

   RETURNS TABLE cambia, y eso `create or replace` no lo permite: hay que tirar
   la función antes.
   ============================================================ */

begin;

drop function if exists public.admin_cuentas();

create or replace function public.admin_cuentas()
returns table (
  id uuid, nombre text, email text, rol text,
  cupo_deportistas int, n_deportistas bigint,
  id_deportista bigint, entrenador text,
  n_sesiones bigint, n_realizadas bigint, n_wellness bigint,
  ultima_sesion date, ultimo_wellness date,
  ultimo_acceso timestamptz, alta timestamptz
) language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;
  return query
  select
    p.id::uuid,
    p.nombre::text,
    p.email::text,
    p.rol::text,
    p.cupo_deportistas::int,
    (select count(*) from deportista d2 where d2.id_entrenador = p.id)::bigint,
    d.id::bigint,
    (select p2.nombre from perfiles p2 where p2.id = d.id_entrenador)::text,
    (select count(*) from sesion s where s.id_deportista = d.id)::bigint,
    (select count(*) from sesion s where s.id_deportista = d.id and s.estado = 'Realizada')::bigint,
    (select count(*) from wellness w where w.id_deportista = d.id)::bigint,
    (select max(s.fecha_sesion) from sesion s where s.id_deportista = d.id and s.estado = 'Realizada')::date,
    (select max(w.fecha) from wellness w where w.id_deportista = d.id)::date,
    u.last_sign_in_at::timestamptz,
    coalesce(p.fecha_consentimiento, u.created_at)::timestamptz
  from perfiles p
  left join deportista d on d.id_usuario = p.id
  left join auth.users u on u.id = p.id
  order by u.last_sign_in_at desc nulls last;
end $$;

commit;

notify pgrst, 'reload schema';
