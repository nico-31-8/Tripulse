/* ============================================================
   GRUPOS DE ENTRENAMIENTO · Paso 1 — el cimiento

   LA IDEA, Y DE ELLA SALE TODO LO DEMAS: el grupo NO es dueño de nada. No tiene
   sesiones. Cada deportista tiene su sesion de verdad, normal y corriente, y el
   grupo solo guarda quien esta dentro y de donde salio cada prescripcion.

   Por eso una sesion de grupo ES una sesion: carga, SICAT, calendario, ejecutar,
   briefing y atribucion de bricks siguen funcionando sin tocar una linea. Si el
   grupo fuera el dueño habria que enseñarle a media aplicacion que es un grupo.

   LA EMISION es la pieza que abre la puerta a periodizar por meses sin rehacer
   nada: mandar una sesion suelta es una emision de 1, y un bloque de 12 semanas
   es una emision de 96. Misma maquinaria.

   `sesion` guarda SOLO id_emision, no tambien id_grupo: el grupo se sabe por la
   emision. Dos columnas diciendo lo mismo es de donde salen los datos que se
   contradicen.

   NOMBRES: todo lleva el prefijo `grupo_entreno_`. La primera version uso
   `grupo_miembro` a secas y CHOCO con la tabla del modulo Comunidad, que ya existe
   en la base y tiene datos. El `create table if not exists` la dio por buena y el
   script intento añadirle una columna a la tabla de Comunidad. Fallo porque tenia
   filas; si hubiera estado vacia, le habria metido la columna, cambiado la clave
   primaria y aplicado encima estas politicas RLS. Los grupos de entrenamiento y
   los grupos sociales son cosas distintas y no pueden compartir nombre.

   IDEMPOTENTE.
   ============================================================ */

begin;

/* ========== Antes de nada: que ningun nombre este cogido ==========
   Lo que fallo la vez anterior. Si alguna de estas tablas existe pero no es la de
   este modulo, se para aqui con un mensaje claro en vez de modificar la tabla de
   otro. */
do $$
declare mala text;
begin
  select v.t into mala from (values
      ('grupo_entreno',         'id_entrenador'),
      ('grupo_entreno_miembro', 'id_grupo'),
      ('grupo_entreno_emision', 'id_grupo')
    ) as v(t, c)
   where to_regclass('public.' || v.t) is not null
     and not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v.t and column_name = v.c)
   limit 1;

  if mala is not null then
    raise exception 'La tabla % ya existe y no es la de este modulo. Parate y miralla antes de seguir.', mala;
  end if;
end $$;

/* ========== El grupo ========== */
create table if not exists grupo_entreno (
  id            uuid primary key default gen_random_uuid(),
  id_entrenador uuid not null references auth.users(id) on delete cascade,
  nombre        text not null,
  descripcion   text,
  archivado     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_grupo_entreno_ent on grupo_entreno(id_entrenador);

/* ========== Quien esta dentro ==========
   No se borran filas al sacar a alguien: se pone `hasta`. Lo que ya entreno sigue
   teniendo sentido, y se puede responder a "quien estaba en el grupo en marzo",
   que con un delete se pierde para siempre. */
create table if not exists grupo_entreno_miembro (
  id_grupo   uuid not null references grupo_entreno(id) on delete cascade,
  desde      date not null default current_date,
  hasta      date,
  created_at timestamptz not null default now()
);

/* El tipo de id_deportista se deduce del id al que apunta. El esquema completo no
   vive en este repo, asi que escribirlo a mano seria adivinar. */
do $$
declare tipo_id text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'grupo_entreno_miembro'
      and column_name = 'id_deportista'
  ) then
    select format_type(a.atttypid, a.atttypmod) into tipo_id
      from pg_attribute a
     where a.attrelid = 'public.deportista'::regclass
       and a.attname = 'id' and a.attnum > 0 and not a.attisdropped;

    if tipo_id is null then
      raise exception 'No encuentro deportista.id';
    end if;

    execute format(
      'alter table public.grupo_entreno_miembro add column id_deportista %s not null references public.deportista(id) on delete cascade',
      tipo_id);
    execute 'alter table public.grupo_entreno_miembro add primary key (id_grupo, id_deportista)';
    raise notice 'grupo_entreno_miembro.id_deportista creada como %', tipo_id;
  end if;
end $$;

create index if not exists idx_grupo_entreno_miembro_dep on grupo_entreno_miembro(id_deportista);

/* ========== La emision ==========
   Un "click" del entrenador: esta sesion (o este bloque) va a estos miembros. */
create table if not exists grupo_entreno_emision (
  id         uuid primary key default gen_random_uuid(),
  id_grupo   uuid not null references grupo_entreno(id) on delete cascade,
  nombre     text,
  created_at timestamptz not null default now()
);

create index if not exists idx_grupo_entreno_emision_grupo on grupo_entreno_emision(id_grupo);

/* ========== La marca en la sesion ==========
   on delete set null a proposito: si se borra el grupo, las sesiones que la gente
   ya tiene en su calendario NO desaparecen. Son suyas. Solo pierden la etiqueta de
   donde vinieron. */
alter table sesion add column if not exists id_emision uuid references grupo_entreno_emision(id) on delete set null;

comment on column sesion.id_emision is
  'De que emision de grupo salio esta sesion. NULL = sesion individual. El grupo se averigua por la emision; la sesion no lo guarda por duplicado.';

create index if not exists idx_sesion_emision on sesion(id_emision) where id_emision is not null;

/* ============================================================
   RLS

   El entrenador manda sobre sus grupos. El deportista SOLO LEE, y solo los grupos
   en los que esta: le hace falta para que su calendario pueda poner "viene del
   grupo Escuela de triatlon" en vez de una sesion que aparece sin explicacion.

   EL BUCLE, Y COMO SE ROMPE DE VERDAD.

   La primera version pregunto "¿es mio este grupo?" leyendo grupo_entreno desde la
   politica de grupo_entreno_miembro. Y la politica de grupo_entreno preguntaba
   "¿es miembro?" leyendo grupo_entreno_miembro. Cada una necesitaba a la otra:
   Postgres lo detecta y aborta con 42P17 "infinite recursion detected in policy".
   No falla al crear las politicas — falla la primera vez que alguien lee la tabla.

   El segundo intento metio esas preguntas en funciones `security definer` creyendo
   que asi se saltaba la RLS. NO ES ASI: `security definer` cambia el USUARIO con el
   que corre la funcion, pero las politicas se le siguen aplicando salvo que ese
   usuario sea el dueño de la tabla. Aqui no lo es, asi que el bucle seguia intacto.

   La solucion no es de privilegios, es de estructura: las tablas hijas GUARDAN su
   id_entrenador, asi que su politica es `id_entrenador = auth.uid()` y no tienen
   que mirar a la madre. Sin esa mirada no hay ciclo posible.

   Y no es "dos sitios diciendo lo mismo": el entrenador de un miembro NO se escribe
   desde fuera. Lo sella un trigger copiandolo del grupo, asi que no se puede falsear
   ni quedarse desfasado. Es una copia mantenida, no una segunda verdad.
   ============================================================ */

/* Sella el entrenador y, de paso, comprueba que el deportista es de ese entrenador.
   Sin la comprobacion, con el id de otro atleta se podria colar en un grupo propio a
   alguien ajeno y a partir de ahi mandarle sesiones. */
create or replace function public.sellar_miembro_de_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare _ent_grupo uuid; _ent_dep uuid;
begin
  select id_entrenador into _ent_grupo from grupo_entreno where id = new.id_grupo;
  select id_entrenador into _ent_dep   from deportista    where id = new.id_deportista;
  if _ent_grupo is null then
    raise exception 'Ese grupo no existe';
  end if;
  if _ent_dep is null or _ent_grupo is distinct from _ent_dep then
    raise exception 'Ese deportista no es de este entrenador';
  end if;
  new.id_entrenador := _ent_grupo;   /* se pone solo: no se acepta lo que venga de fuera */
  return new;
end $$;

create or replace function public.sellar_emision_de_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare _ent uuid;
begin
  select id_entrenador into _ent from grupo_entreno where id = new.id_grupo;
  if _ent is null then
    raise exception 'Ese grupo no existe';
  end if;
  new.id_entrenador := _ent;
  return new;
end $$;

alter table grupo_entreno_miembro add column if not exists id_entrenador uuid;
alter table grupo_entreno_emision add column if not exists id_entrenador uuid;

update grupo_entreno_miembro m set id_entrenador = g.id_entrenador
  from grupo_entreno g where g.id = m.id_grupo and m.id_entrenador is distinct from g.id_entrenador;
update grupo_entreno_emision e set id_entrenador = g.id_entrenador
  from grupo_entreno g where g.id = e.id_grupo and e.id_entrenador is distinct from g.id_entrenador;

drop trigger if exists trg_miembro_es_mio on grupo_entreno_miembro;
drop trigger if exists trg_sellar_miembro on grupo_entreno_miembro;
create trigger trg_sellar_miembro
  before insert or update on grupo_entreno_miembro
  for each row execute function public.sellar_miembro_de_grupo();

drop trigger if exists trg_sellar_emision on grupo_entreno_emision;
create trigger trg_sellar_emision
  before insert or update on grupo_entreno_emision
  for each row execute function public.sellar_emision_de_grupo();

/* Esta si puede leer grupo_entreno sin montar un ciclo: las politicas de
   grupo_entreno ya no vuelven a mirar a las hijas para el caso del entrenador. */
create or replace function public.es_mi_grupo(_id_grupo uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from grupo_entreno g
     where g.id = _id_grupo and g.id_entrenador = auth.uid()
  );
$$;

/* NO puede tocar `deportista`. Si va ahi a traducir auth.uid() a un id, la politica
   de deportista vuelve a llamar a es_mi_grupo() y se cierra el ciclo: revienta con
   "stack depth limit exceeded", y solo con sesion de verdad, asi que una consulta
   anonima parece decir que todo va bien. Por eso el id_usuario se guarda sellado en
   la propia tabla de miembros. */
create or replace function public.soy_miembro_del_grupo(_id_grupo uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from grupo_entreno_miembro gm
     where gm.id_grupo = _id_grupo
       and gm.id_usuario = auth.uid()
       and gm.hasta is null
  );
$$;

alter table grupo_entreno enable row level security;
alter table grupo_entreno_miembro enable row level security;
alter table grupo_entreno_emision enable row level security;

/* Esta no consulta ninguna otra tabla, asi que no entra en el bucle. */
drop policy if exists grupo_entreno_ent on grupo_entreno;
create policy grupo_entreno_ent on grupo_entreno
  for all
  using (id_entrenador = auth.uid())
  with check (id_entrenador = auth.uid());

drop policy if exists grupo_entreno_lee_miembro on grupo_entreno;
create policy grupo_entreno_lee_miembro on grupo_entreno
  for select
  using (soy_miembro_del_grupo(id));

/* USING no mira ninguna otra tabla: ahi se rompe el ciclo.
   WITH CHECK si consulta el grupo, y a proposito: al insertar, la columna
   id_entrenador todavia la esta poniendo el trigger, asi que comprobar el grupo es
   lo unico que no depende del orden en que corren las cosas. */
drop policy if exists grupo_entreno_miembro_ent on grupo_entreno_miembro;
create policy grupo_entreno_miembro_ent on grupo_entreno_miembro
  for all
  using (id_entrenador = auth.uid())
  with check (es_mi_grupo(id_grupo));

/* Esta mira `deportista`, cuyas politicas no miran ninguna tabla de grupos: no hay
   ciclo, asi que puede quedarse como subconsulta. */
drop policy if exists grupo_entreno_miembro_lee_propio on grupo_entreno_miembro;
create policy grupo_entreno_miembro_lee_propio on grupo_entreno_miembro
  for select
  using (exists (select 1 from deportista d
                  where d.id = grupo_entreno_miembro.id_deportista and d.id_usuario = auth.uid()));

drop policy if exists grupo_entreno_emision_ent on grupo_entreno_emision;
create policy grupo_entreno_emision_ent on grupo_entreno_emision
  for all
  using (id_entrenador = auth.uid())
  with check (es_mi_grupo(id_grupo));

drop policy if exists grupo_entreno_emision_lee_miembro on grupo_entreno_emision;
create policy grupo_entreno_emision_lee_miembro on grupo_entreno_emision
  for select
  using (soy_miembro_del_grupo(id_grupo));

/* La comprobacion de "ese deportista es tuyo" ya no vive aqui: se hizo parte de
   sellar_miembro_de_grupo(), arriba, porque las dos cosas necesitan lo mismo (el
   entrenador del grupo) y separarlas eran dos consultas para una sola respuesta. */
drop function if exists public.comprobar_miembro_es_mio() cascade;

commit;

notify pgrst, 'reload schema';

/* ============================================================
   Comprobacion

   1) Deben salir las TRES tablas nuevas, con el prefijo grupo_entreno_.
   2) grupo_miembro y grupo (las de Comunidad) deben seguir como estaban: si
      aparecen aqui es solo informativo, este script no las toca.
   ============================================================ */
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('grupo_entreno', 'grupo_entreno_miembro', 'grupo_entreno_emision',
                      'grupo', 'grupo_miembro')
 order by 1;

select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'sesion' and column_name = 'id_emision';

/* Que la tabla de Comunidad sigue intacta: no debe tener id_deportista. */
select count(*) as columnas_mias_en_la_de_comunidad
  from information_schema.columns
 where table_schema = 'public' and table_name = 'grupo_miembro' and column_name = 'id_deportista';
