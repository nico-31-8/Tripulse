/* ============================================================
   GRUPOS · Paso 2 — el grupo se planifica como se planifica una persona

   REQUISITO: grupos-1-esquema.sql aplicado.

   EL PROBLEMA: el calendario, el dibujo de periodizacion y los mesociclos estan
   escritos para un deportista. Y no es solo la pantalla: TODA la cadena de
   planificacion —mesociclo, microciclo, sesion, tarea, p_distancia, p_duracion,
   p_repeticiones, ejercicios, series_realizadas, semana_bloqueada,
   dibujo_borrador— lleva su propio id_deportista, puesto por un trigger desde su
   padre, y la RLS de las once pregunta lo mismo:

       id_deportista in (select auth_dep_ids())

   Colgar el plan de un id_grupo obligaria a duplicar ese andamiaje entero: once
   columnas, once triggers, once politicas. Es rehacer los cimientos en paralelo.

   LA SOLUCION: el grupo tiene su propia FICHA DE DEPORTISTA. Para el calendario,
   para el dibujo y para las once tablas, un grupo es un atleta mas, y todo funciona
   sin tocar una linea.

   Y la ficha no ensucia nada, por dos decisiones:

     1. id_entrenador = NULL. Las 20 consultas de la app que listan atletas filtran
        por entrenador (carga, indices, wellness, volumen, eco, comunicacion...), y
        el cupo tambien cuenta por entrenador. Con el entrenador vacio, la ficha
        desaparece de todas de golpe. No hay que ir sitio por sitio.

     2. auth_dep_ids() devuelve tambien las fichas de TUS grupos. Es la unica puerta
        por la que pasa la RLS de las once tablas: se cambia una funcion y la cadena
        entera reconoce al grupo.

   O sea: invisible donde estorba, visible donde hace falta, y cada cosa en un solo
   sitio.

   IDEMPOTENTE.
   ============================================================ */

begin;

/* ============================================================
   1. Romper el ciclo de RLS ANTES de crear nada

   La politica nueva de `deportista` va a preguntar "¿es la ficha de un grupo mio?",
   y eso lleva a grupo_entreno -> grupo_entreno_miembro -> y de ahi otra vez a
   `deportista`, porque su politica mira ahi para saber quien eres. Ciclo.

   Se corta igual que en el paso 1: la tabla de miembros guarda tambien el
   id_usuario, sellado por el mismo trigger, y asi su politica no pregunta a nadie.
   ============================================================ */
alter table grupo_entreno_miembro add column if not exists id_usuario uuid;

update grupo_entreno_miembro m set id_usuario = d.id_usuario
  from deportista d where d.id = m.id_deportista
   and m.id_usuario is distinct from d.id_usuario;

create or replace function public.sellar_miembro_de_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare _ent_grupo uuid; _ent_dep uuid; _usr uuid;
begin
  select id_entrenador into _ent_grupo from grupo_entreno where id = new.id_grupo;
  select id_entrenador, id_usuario into _ent_dep, _usr from deportista where id = new.id_deportista;
  if _ent_grupo is null then
    raise exception 'Ese grupo no existe';
  end if;
  if _ent_dep is null or _ent_grupo is distinct from _ent_dep then
    raise exception 'Ese deportista no es de este entrenador';
  end if;
  new.id_entrenador := _ent_grupo;
  new.id_usuario    := _usr;   /* puede ser null: un atleta dado de alta que aun no ha entrado */
  return new;
end $$;

/* Ya no mira `deportista`: ahi se rompe el ciclo. */
drop policy if exists grupo_entreno_miembro_lee_propio on grupo_entreno_miembro;
create policy grupo_entreno_miembro_lee_propio on grupo_entreno_miembro
  for select
  using (id_usuario = auth.uid());

/* ============================================================
   2. La ficha del grupo
   ============================================================ */
alter table deportista add column if not exists id_grupo uuid references grupo_entreno(id) on delete cascade;

comment on column deportista.id_grupo is
  'Si esta puesto, esta fila NO es una persona: es la ficha de planificacion de un grupo. Va siempre con id_entrenador NULL para no aparecer en ninguna lista de atletas ni gastar cupo. Filtra por id_grupo is null si escribes algo que recorra deportistas de verdad.';

create index if not exists idx_deportista_grupo on deportista(id_grupo) where id_grupo is not null;

/* Un grupo, una ficha. */
create unique index if not exists uq_deportista_grupo on deportista(id_grupo) where id_grupo is not null;

/* ============================================================
   3. La unica puerta: auth_dep_ids()

   Añade las fichas de los grupos del entrenador. Con esto, las once tablas de la
   cadena de planificacion aceptan al grupo sin cambiar ni una politica.
   ============================================================ */
create or replace function public.auth_dep_ids()
returns setof integer
language sql
stable
security definer
set search_path = public
as $$
  select id from deportista
  where id_usuario = auth.uid()
     or id_entrenador = auth.uid()
  union
  select d.id from deportista d
    join grupo_entreno g on g.id = d.id_grupo
   where g.id_entrenador = auth.uid()
$$;

/* ============================================================
   4. Que el entrenador pueda tocar la ficha de su grupo

   `deportista_rw` mira id_entrenador o id_usuario, y la ficha del grupo no tiene ni
   uno ni otro. Se añade una politica aparte en vez de reescribir la que ya hay:
   asi lo de siempre sigue exactamente igual.

   NO se usa auth_dep_ids() aqui: esa funcion LEE deportista, asi que llamarla desde
   una politica de deportista seria el ciclo otra vez.
   ============================================================ */
drop policy if exists deportista_ficha_grupo on deportista;
create policy deportista_ficha_grupo on deportista
  for all
  using (id_grupo is not null and es_mi_grupo(id_grupo))
  with check (id_grupo is not null and es_mi_grupo(id_grupo));

/* ============================================================
   5. Crear la ficha de un grupo

   Va en una funcion y no desde la app para que la ficha no se pueda montar a mano
   con un id_entrenador puesto, que es justo lo que la haria aparecer en las listas.
   Devuelve la que ya haya si existe.
   ============================================================ */
create or replace function public.ficha_de_grupo(_id_grupo uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare _id integer; _nombre text;
begin
  if not exists (select 1 from grupo_entreno where id = _id_grupo and id_entrenador = auth.uid()) then
    raise exception 'Ese grupo no es tuyo';
  end if;

  select id into _id from deportista where id_grupo = _id_grupo;
  if _id is not null then return _id; end if;

  select nombre into _nombre from grupo_entreno where id = _id_grupo;

  insert into deportista (nombre, id_grupo, id_entrenador, id_usuario)
  values (_nombre, _id_grupo, null, null)
  returning id into _id;

  return _id;
end $$;

/* ============================================================
   6. Que el panel de admin no cuente las fichas como personas

   admin_salud() avisa de "deportistas sin entrenador vinculado", y las fichas de
   grupo van SIEMPRE sin entrenador: sin este arreglo, cada grupo nuevo saldria como
   un problema. Un panel que existe para encontrar fallos no puede inventarselos.

   Es la funcion original copiada tal cual; lo unico que cambia es el `and
   d.id_grupo is null` de la primera comprobacion.
   ============================================================ */
create or replace function public.admin_salud()
returns table (clave text, etiqueta text, n bigint, gravedad text)
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;

  return query
  select 'dep_sin_entrenador', 'Deportistas sin entrenador vinculado',
         (select count(*) from deportista d where d.id_entrenador is null and d.id_grupo is null), 'aviso';

  return query
  select 'perfil_sin_deportista', 'Perfiles con rol deportista pero sin ficha',
         (select count(*) from perfiles p where p.rol = 'deportista'
            and not exists (select 1 from deportista d where d.id_usuario = p.id)), 'error';

  return query
  select 'sin_anamnesis', 'Deportistas con entrenador y sin anamnesis enviada',
         (select count(*) from deportista d where d.id_entrenador is not null
            and not exists (select 1 from anamnesis a where a.id_deportista = d.id and a.estado = 'enviada')), 'aviso';

  return query
  select 'sesion_sin_carga', 'Sesiones realizadas sin duración NI tareas (valen 0 en la carga)',
         (select count(*) from sesion s where s.estado = 'Realizada'
            and coalesce(s.duracion_real, 0) = 0 and coalesce(s.duracion_minutos, 0) = 0
            and not exists (select 1 from tarea t where t.id_sesion = s.id)), 'error';

  return query
  select 'realizada_sin_rpe', 'Sesiones realizadas sin RPE reportado',
         (select count(*) from sesion s where s.estado = 'Realizada'
            and s.rpe_reportado is null), 'aviso';

  return query
  select 'cupo_excedido', 'Entrenadores por encima de su cupo',
         (select count(*) from perfiles p where p.rol = 'entrenador' and p.cupo_deportistas is not null
            and (select count(*) from deportista d where d.id_entrenador = p.id) > p.cupo_deportistas), 'aviso';

  return query
  select 'inv_caducada', 'Invitaciones caducadas sin usar',
         (select count(*) from invitacion i where i.usos = 0 and not i.revocada
            and i.caduca is not null and i.caduca < now()), 'info';

  return query
  select 'sin_volver', 'Cuentas que nunca han vuelto a entrar tras el alta',
         (select count(*) from perfiles p join auth.users u on u.id = p.id
           where u.last_sign_in_at is null
              or u.last_sign_in_at <= u.created_at + interval '5 minutes'), 'info';
end $$;

commit;

notify pgrst, 'reload schema';

/* ============================================================
   Comprobacion

   1) Las fichas de grupo que existan deben ir SIEMPRE sin entrenador. Si alguna
      tiene entrenador, esa si aparecera en las listas y gastara cupo.
   2) auth_dep_ids debe existir con la parte de grupos dentro.
   ============================================================ */
select d.id, d.nombre, g.nombre as grupo,
       case when d.id_entrenador is null then 'ok' else 'MAL: tiene entrenador' end as estado
  from deportista d join grupo_entreno g on g.id = d.id_grupo
 where d.id_grupo is not null;

select count(*) as fichas_de_grupo_mal_puestas
  from deportista where id_grupo is not null and id_entrenador is not null;
