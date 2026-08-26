/* ============================================================
   Auditoría de seguridad: qué está abierto de par en par
   ============================================================
   NO CAMBIA NADA. Solo lee y te dice dónde mirar.

   Por qué importa tanto en esta app: la clave que usa el navegador es la
   `anon`, que es PÚBLICA por diseño y viaja en cada build. Cualquiera puede
   sacarla del código del navegador en diez segundos. Lo único que impide que
   con ella se lean los datos de salud de todos tus atletas es la RLS. Si una
   tabla se queda sin política, esa tabla es pública.

   Tres cosas que se comprueban:

   1. TABLAS SIN RLS. Abiertas a cualquiera con la clave anon.

   2. TABLAS CON RLS PERO SIN NINGUNA POLÍTICA. Es el caso contrario y también
      es un fallo, aunque no de seguridad: nadie puede leerlas desde la app.
      Salvo que sea a propósito, como `invitacion`, que solo se toca por
      funciones SECURITY DEFINER.

   3. VISTAS QUE SE SALTAN LA RLS. La trampa menos conocida de Postgres: una
      vista se ejecuta con los permisos de QUIEN LA CREÓ, no de quien la
      consulta, así que puede devolver filas que la RLS de la tabla de debajo
      habría escondido. Desde Postgres 15 se arregla con
      `alter view X set (security_invoker = on)`.
   ============================================================ */

select
  'TABLA SIN RLS' as problema,
  c.relname       as objeto,
  'Cualquiera con la clave anon puede leerla y escribirla' as por_que
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity

union all

select
  'RLS SIN NINGUNA POLITICA',
  c.relname,
  'Nadie puede tocarla desde la app. A proposito solo si se usa por funciones'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)

union all

select
  'VISTA QUE SE SALTA LA RLS',
  c.relname,
  'Devuelve filas que la RLS de sus tablas habria escondido'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and not coalesce('security_invoker=on' = any(c.reloptions), false)

order by 1, 2;
