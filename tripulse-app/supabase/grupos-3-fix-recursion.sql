/* ============================================================
   GRUPOS · Arreglo: soy_miembro_del_grupo() cerraba el ciclo

   SINTOMA: "stack depth limit exceeded" al crear un grupo. Es recursion, pero tan
   profunda que revienta la pila antes de que Postgres la reconozca como tal, asi
   que ni siquiera sale el 42P17 de las otras veces. Y solo pasa con sesion de
   verdad: sin usuario, `auth.uid()` es null y las comprobaciones cortan antes de
   entrar en el bucle, asi que una consulta anonima devuelve 200 tan tranquila.

   EL CICLO:
     politica de deportista  -> es_mi_grupo()
                             -> lee grupo_entreno
                             -> su politica llama a soy_miembro_del_grupo()
                             -> que hacia JOIN DEPORTISTA
                             -> politica de deportista otra vez...

   Al denormalizar id_usuario en grupo_entreno_miembro se arreglo la POLITICA de esa
   tabla, pero se quedo sin tocar la FUNCION, que seguia yendo a deportista a
   traducir auth.uid() a un id. La columna ya estaba puesta; solo faltaba usarla.

   LA REGLA, para no repetirlo: una funcion que se usa dentro de una politica no
   puede leer una tabla cuyas politicas lleven de vuelta al punto de partida. Aqui
   las unicas tablas que pueden tocarse desde estas politicas son las tres de grupos,
   y solo por columnas propias.

   IDEMPOTENTE.
   ============================================================ */

begin;

create or replace function public.soy_miembro_del_grupo(_id_grupo uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from grupo_entreno_miembro gm
     where gm.id_grupo = _id_grupo
       and gm.id_usuario = auth.uid()
       and gm.hasta is null
  );
$$;

/* Por si alguna fila quedo sin sellar de antes de que existiera la columna: el
   trigger solo actua al insertar o actualizar. */
update grupo_entreno_miembro m
   set id_usuario = d.id_usuario
  from deportista d
 where d.id = m.id_deportista
   and m.id_usuario is distinct from d.id_usuario;

commit;

notify pgrst, 'reload schema';

/* ============================================================
   Comprobacion: ninguna funcion de estas politicas puede nombrar a `deportista`.
   Las dos filas deben decir 'limpia'.
   ============================================================ */
select p.proname,
       case when pg_get_functiondef(p.oid) ilike '%deportista%'
            then 'MIRA DEPORTISTA — VUELVE A MIRARLO'
            else 'limpia' end as estado
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('soy_miembro_del_grupo', 'es_mi_grupo')
 order by 1;
