/* ============================================================
   GRUPOS · La ficha del grupo tiene que hablar el idioma de sus miembros

   SINTOMA: al crear una sesion en el calendario del grupo salia el modal corto, sin
   el tipo de sesion. La app decide eso con
       zonas2 = (deportista.sistema_zonas || 1) === 2
   y la ficha del grupo se creaba sin ese campo, asi que caia en el sistema 1.

   Pero lo de menos es el modal. Lo importante es que el sistema de zonas cambia QUE
   ZONAS EXISTEN: el 1 son Z1..Z7 y el 2 son siglas (AER, AEL, AEM, PAE...). Si el
   grupo planifica en Z1..Z7 y sus miembros trabajan con siglas, lo que se vuelca
   llega escrito en un idioma que sus referencias no entienden. No falla nada: las
   sesiones se crean y las zonas no significan lo mismo.

   REGLA: la ficha del grupo usa el sistema que usa LA MAYORIA de sus miembros. No
   hay un valor "correcto" en abstracto: el correcto es el de la gente a la que se
   le va a mandar.

   IDEMPOTENTE.
   ============================================================ */

begin;

/* El sistema que usan la mayoria de los miembros de un grupo. Si no hay nadie
   todavia, 2: es el que usan las funciones nuevas de la app. */
create or replace function public.sistema_zonas_del_grupo(_id_grupo uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(d.sistema_zonas, 1) as s
       from grupo_entreno_miembro gm
       join deportista d on d.id = gm.id_deportista
      where gm.id_grupo = _id_grupo and gm.hasta is null
      group by coalesce(d.sistema_zonas, 1)
      order by count(*) desc, 1 desc
      limit 1),
    2);
$$;

/* La ficha nueva nace ya con el sistema de sus miembros. Se respeta el resto de la
   funcion tal cual estaba: solo cambia el insert. */
create or replace function public.ficha_de_grupo(_id_grupo uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare _id integer; _nombre text;
begin
  if not exists (select 1 from grupo_entreno where id = _id_grupo and id_entrenador = auth.uid()) then
    raise exception 'Ese grupo no es tuyo';
  end if;

  select id into _id from deportista where id_grupo = _id_grupo;
  if _id is not null then
    return _id;
  end if;

  select nombre into _nombre from grupo_entreno where id = _id_grupo;

  insert into deportista (nombre, id_grupo, id_entrenador, id_usuario, sistema_zonas)
  values (_nombre, _id_grupo, null, null, sistema_zonas_del_grupo(_id_grupo))
  returning id into _id;

  return _id;
end $$;

/* Las fichas que ya existen, alineadas con sus miembros. */
update deportista d
   set sistema_zonas = sistema_zonas_del_grupo(d.id_grupo)
 where d.id_grupo is not null
   and coalesce(d.sistema_zonas, 1) is distinct from sistema_zonas_del_grupo(d.id_grupo);

commit;

notify pgrst, 'reload schema';

/* ============================================================
   Comprobacion: cada ficha de grupo y el sistema de los suyos. Las dos columnas
   deben coincidir.
   ============================================================ */
select g.nombre                                    as grupo,
       coalesce(d.sistema_zonas, 1)                as usa_la_ficha,
       sistema_zonas_del_grupo(g.id)               as usan_los_miembros,
       (select count(*) from grupo_entreno_miembro m
         where m.id_grupo = g.id and m.hasta is null) as miembros
  from grupo_entreno g
  left join deportista d on d.id_grupo = g.id
 order by 1;
