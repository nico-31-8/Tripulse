/* ============================================================
   ENSAYO de envios-traspaso.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: la migración, los traspasos y lo que se monta para probarlos.

   Los protagonistas se eligen solos con lo que hay en la base (no lleva ids
   escritos: el repositorio es público):
   · A, quien pasa el deportista: un entrenador normal (sin plataforma_admin)
     con un deportista CON cuenta (M) y un test suyo.
   · B, quien lo recibe: otro entrenador normal, con sitio en su cupo para
     dos más (M y la ficha), que no trabaja con A en una dirección. C, un
     tercero.
   Lo que falte para probar se monta DENTRO del ensayo (y se deshace): una
   ficha sin cuenta de A, un grupo de A con M dentro, un acceso de director a
   M, una invitación sin usar, cobros de A a M, un mensaje de A a M, una
   medición de M con el test de A y un ajuste de zona de M.

   1. CONTROL: lo que cada persona de la base ve hoy de mensajes, cobros,
      fichas, sesiones, mediciones, ajustes y envíos.
   2. La migración, con las mismas sentencias que el fichero.
   3. Lo mismo después: tiene que ser igual para TODOS (el chat y los cobros
      cambian de regla).
   4. El traspaso: lo que no se deja, pedirlo, contestar los dos en los dos
      órdenes, lo que pasa con el chat, los cobros, los grupos, el director,
      las invitaciones, los tests, las mediciones, los días de test y los
      ajustes de zona, rechazar, cancelar y el cupo (al pedirlo y al hacerse).
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (a uuid, b uuid, c uuid, m bigint, mu uuid, f bigint, test bigint, grupo uuid, correo_b text, ses bigint);
create temp table _cuentas (cuando text, quien uuid, tabla text, n int);

create function pg_temp.dice(_t text) returns void language sql as $f$
  insert into _informe (linea) values (coalesce(_t, '   (¡LÍNEA VACÍA: algo de esta comprobación dio null!)'))
$f$;

create function pg_temp.como(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    if _quien is null then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      perform set_config('role', 'anon', true);
    else
      perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
    end if;
    execute _sql;
    _res := 'ENTRA';
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := sqlstate || ' ' || sqlerrm; end if;
  end;
  perform set_config('role', 'postgres', true);
  return _res;
end $f$;

create function pg_temp.hacer(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _r text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql into _r;
    perform set_config('role', 'postgres', true);
    return coalesce(_r, 'ok');
  exception when others then
    perform set_config('role', 'postgres', true);
    return 'ERROR ' || sqlstate || ' ' || sqlerrm;
  end;
end $f$;

create function pg_temp.ve(_quien uuid, _sql text) returns int language plpgsql as $f$
declare _n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute _sql into _n;
  perform set_config('role', 'postgres', true);
  return _n;
end $f$;

create function pg_temp.j(_r text) returns jsonb language plpgsql as $f$
begin
  return _r::jsonb;
exception when others then
  return null;
end $f$;

/* Cambiar el cupo de alguien, como lo cambia la plataforma (el guardián de
   perfiles solo se lo deja a un administrador), sin romper el ensayo. */
create function pg_temp.cupo(_quien uuid, _n int) returns text language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select x.id_perfil from plataforma_admin x limit 1), 'role', 'authenticated')::text, true);
  update perfiles set cupo_deportistas = _n where id = _quien;
  return 'ok';
exception when others then
  return 'ERROR ' || sqlerrm;
end $f$;

/* Lo que ve CADA persona de la base (entrenadores y deportistas). */
create function pg_temp.contar(_cuando text) returns void language plpgsql as $f$
declare _p record; _t text;
begin
  for _p in select id from perfiles loop
    foreach _t in array array['mensajes', 'cargo', 'cobro', 'cobros_lista', 'tarifa', 'deportista', 'sesion', 'test_medicion', 'zona_ajuste', 'envio_entrenador'] loop
      insert into _cuentas (cuando, quien, tabla, n)
      values (_cuando, _p.id, _t, pg_temp.ve(_p.id, 'select count(*)::int from ' || _t));
    end loop;
  end loop;
end $f$;

/* Los protagonistas. */
insert into _actores (a, m, mu, test)
select d.id_entrenador, d.id, d.id_usuario,
       (select t.id from test_definicion t where t.id_entrenador = d.id_entrenador order by t.id limit 1)
  from deportista d
  join perfiles p on p.id = d.id_entrenador and p.rol = 'entrenador'
 where d.id_usuario is not null and d.id_grupo is null and not coalesce(d.solo_test, false)
   and not exists (select 1 from plataforma_admin x where x.id_perfil = d.id_entrenador)
   and exists (select 1 from test_definicion t where t.id_entrenador = d.id_entrenador)
 order by d.id
 limit 1;

update _actores set b = (
  select p.id from perfiles p
   where p.rol = 'entrenador' and p.id <> _actores.a and p.email is not null
     and not exists (select 1 from plataforma_admin x where x.id_perfil = p.id)
     and (p.cupo_deportistas is null
          or (select count(*) from deportista d where d.id_entrenador = p.id and not coalesce(d.solo_test, false)) + 2 <= p.cupo_deportistas)
     and not exists (select 1 from director_entrenador v
                      where v.estado = 'activo'
                        and ((v.id_director = _actores.a and v.id_entrenador = p.id)
                          or (v.id_director = p.id and v.id_entrenador = _actores.a)))
   order by p.created_at
   limit 1);
update _actores set c = (
  select p.id from perfiles p
   where p.rol = 'entrenador' and p.id <> _actores.a and p.id <> _actores.b
     and not exists (select 1 from plataforma_admin x where x.id_perfil = p.id)
   order by p.created_at
   limit 1);
update _actores set correo_b = (select email from perfiles where id = _actores.b);

/* Lo que se monta para probar (todo se deshace al final). */
do $montar$
declare _x _actores%rowtype; _f bigint; _g uuid; _z bigint; _s bigint;
begin
  select * into _x from _actores;
  /* Una ficha sin cuenta de A. */
  insert into deportista (id_entrenador, nombre) values (_x.a, 'Ficha de ensayo') returning id into _f;
  update _actores set f = _f;
  /* Un grupo de A con M dentro. */
  begin
    insert into grupo_entreno (id_entrenador, nombre) values (_x.a, 'Grupo de ensayo') returning id into _g;
    insert into grupo_entreno_miembro (id_grupo, id_deportista, id_entrenador, id_usuario) values (_g, _x.m, _x.a, _x.mu);
    update _actores set grupo = _g;
  exception when others then
    perform pg_temp.dice('   (no se ha podido montar el grupo de prueba: ' || sqlerrm || ')');
  end;
  /* Un acceso de director a M (de C, que no es nada de A). */
  begin
    insert into director_acceso (id_director, id_deportista) values (_x.c, _x.m);
  exception when others then
    perform pg_temp.dice('   (no se ha podido montar el acceso de director: ' || sqlerrm || ')');
  end;
  /* Una invitación sin usar de A para M. */
  insert into invitacion_deportista (token, id_entrenador, id_deportista, nombre_deportista, usado)
  values ('ensayo-traspaso', _x.a, _x.m, 'M', false);
  /* Cobros de A a M y un mensaje de A a M (con las tablas de antes). */
  insert into tarifa (id_deportista, tipo, importe, desde) values (_x.m, 'mensual', 50, current_date);
  insert into cargo (id_deportista, fecha, concepto, importe, mes, tipo)
  values (_x.m, current_date, 'Ensayo', 50, to_char(current_date, 'YYYY-MM'), 'unico');
  insert into cobro (id_deportista, fecha, importe, medio) values (_x.m, current_date, 50, 'otro');
  insert into cobros_lista (id_deportista) values (_x.m) on conflict do nothing;
  insert into mensajes (id_entrenador, id_deportista, contenido, autor, leido) values (_x.a, _x.m, 'Ensayo', 'entrenador', false);
  /* Una medición de M con el test de A; un ajuste de M en una zona de A con
     su límite en ese test (como los de verdad); y su última sesión, día de
     ese test. */
  insert into test_medicion (id_definicion, id_deportista, fecha, datos) values (_x.test, _x.m, current_date - 1, '{}'::jsonb)
  on conflict do nothing;
  select z.id into _z from zona_entrenador z join zona_clasificacion c on c.id = z.id_clasificacion
   where z.id_entrenador = _x.a and not z.archivada and not c.archivada order by z.id limit 1;
  if _z is not null then
    insert into zona_ajuste (id_zona, id_deportista, hasta, ajustado_por)
    values (_z, _x.m, jsonb_build_object('ref', 'propia:' || _x.test || ':0', 'pct', 80), _x.a)
    on conflict (id_zona, id_deportista) do update set hasta = excluded.hasta;
  end if;
  update sesion set test = jsonb_build_object('origen', 'propio', 'id', _x.test)
   where id = (select s.id from sesion s where s.id_deportista = _x.m order by s.id desc limit 1)
  returning id into _s;
  update _actores set ses = _s;
end $montar$;

/* 1. CONTROL */
select pg_temp.dice('1. Antes: ' || (select count(*) from perfiles) || ' personas; los cobros '
  || case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cargo' and column_name = 'id_entrenador')
          then '¡YA TIENEN DUEÑO!' else 'todavía no tienen dueño (bien)' end);
select pg_temp.contar('antes');

/* 2. LA MIGRACIÓN, tal cual el fichero */
/* ============================================================
   TRIPULSE — Envíos entre entrenadores, fase 2: pasar un deportista
   ============================================================

   Pedido del usuario el 23-10-2026 (maqueta aprobada:
   https://claude.ai/artifact/RUwkGr4VEPYsXVDK93z3ni). Un entrenador le pasa
   un deportista a otro: NO es una copia, es un TRASPASO. El deportista pasa a
   la lista del otro con todo su historial y el de antes deja de verlo.

   QUIÉN CONTESTA. El entrenador que lo recibe, siempre. Y si el deportista
   tiene cuenta, también él, porque son sus datos. Hasta que contestan los
   dos sigue con su entrenador de siempre; si cualquiera dice que no, no
   cambia nada. El que lo pidió puede cancelarlo mientras tanto.

   QUÉ PASA AL HACERSE (en un solo paso, como «Quitar deportista»):
   · Lo que cuelga de su ficha (plan, sesiones, tests, wellness, reloj,
     material, análisis…) pasa solo: el acceso va por la ficha.
   · Sale de los grupos de su entrenador de antes, se quitan los accesos de
     director que dio (si no, el director seguiría entrando) y se borran las
     invitaciones sin usar que había hecho para él.
   · Si el que lo pide marca «mandar también lo tuyo que usa», el otro
     recibe copias de los tests suyos que usa ese deportista (con mediciones
     suyas, en sus ajustes de zona o en sus días de test) y de las zonas que
     salen de ellos o en las que tiene ajustes. Lo del deportista pasa a las
     copias: sus mediciones se MUEVEN (copiarlas las enseñaría dos veces, y
     el de antes ya no las ve), y sus días de test y sus ajustes apuntan a
     las copias. Los tests y las zonas del de antes no se tocan.
   · Se mira el cupo de quien lo recibe (el cupo de siempre solo salta al
     crear un deportista, no al cambiarlo de entrenador).

   DOS COSAS QUE CAMBIAN DE LO QUE YA HABÍA, para que un traspaso no deje
   ver lo que no toca (lo prometido en la maqueta):
   · LOS COBROS pasan a guardar de qué entrenador son (id_entrenador). Antes
     los veía el entrenador que tuviera el deportista EN ESE MOMENTO: el
     nuevo habría visto los cobros del de antes, y el de antes los habría
     perdido. Ahora cada uno ve los suyos. Se rellenan con el entrenador
     actual de cada deportista (hoy todos tienen), así que hoy nadie ve ni
     más ni menos. La lista y la cuota del mes pasan a ser por entrenador.
   · EL CHAT: un entrenador ve solo SUS conversaciones (id_entrenador). Antes
     veía todos los mensajes de sus deportistas, también los que hubieran
     tenido con otro entrenador. El deportista sigue viendo todos los suyos.
     Hoy todos los mensajes son del entrenador actual de su deportista: nadie
     deja de ver nada.

   Las fichas de un grupo no se pasan (se quitan borrando el grupo).
   ============================================================ */


/* ············································
   Los cobros, con su dueño
   ············································ */
alter table public.cargo add column if not exists id_entrenador uuid references public.perfiles(id) on delete cascade;
alter table public.cobro add column if not exists id_entrenador uuid references public.perfiles(id) on delete cascade;
alter table public.tarifa add column if not exists id_entrenador uuid references public.perfiles(id) on delete cascade;
alter table public.cobros_lista add column if not exists id_entrenador uuid references public.perfiles(id) on delete cascade;

update public.cargo x set id_entrenador = d.id_entrenador from public.deportista d where d.id = x.id_deportista and x.id_entrenador is null;
update public.cobro x set id_entrenador = d.id_entrenador from public.deportista d where d.id = x.id_deportista and x.id_entrenador is null;
update public.tarifa x set id_entrenador = d.id_entrenador from public.deportista d where d.id = x.id_deportista and x.id_entrenador is null;
update public.cobros_lista x set id_entrenador = d.id_entrenador from public.deportista d where d.id = x.id_deportista and x.id_entrenador is null;

/* Las filas nuevas son de quien las apunta: la pantalla no tiene que decirlo. */
alter table public.cargo alter column id_entrenador set default auth.uid();
alter table public.cobro alter column id_entrenador set default auth.uid();
alter table public.tarifa alter column id_entrenador set default auth.uid();
alter table public.cobros_lista alter column id_entrenador set default auth.uid();

/* Ninguna fila sin dueño: una así no la vería nadie. Hoy todas lo tienen. */
alter table public.cargo alter column id_entrenador set not null;
alter table public.cobro alter column id_entrenador set not null;
alter table public.tarifa alter column id_entrenador set not null;
alter table public.cobros_lista alter column id_entrenador set not null;

/* La lista y la cuota del mes, por entrenador: el nuevo puede apuntarle la
   suya aunque el de antes ya le hubiera cobrado ese mes. */
alter table public.cobros_lista drop constraint if exists cobros_lista_pkey;
alter table public.cobros_lista add constraint cobros_lista_pkey primary key (id_entrenador, id_deportista);
drop index if exists public.cargo_una_cuota_por_mes;
create unique index if not exists cargo_una_cuota_por_mes on public.cargo (id_entrenador, id_deportista, mes) where tipo = 'mensual';
create index if not exists cargo_id_entrenador_idx on public.cargo (id_entrenador);
create index if not exists cobro_id_entrenador_idx on public.cobro (id_entrenador);
create index if not exists tarifa_id_entrenador_idx on public.tarifa (id_entrenador);

/* Ver, cambiar y borrar: lo tuyo. Apuntar: solo a un deportista tuyo, como antes. */
drop policy if exists cargo_solo_su_entrenador on public.cargo;
create policy cargo_solo_su_entrenador on public.cargo for all to authenticated
  using (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid())
              and exists (select 1 from public.deportista d where d.id = cargo.id_deportista and d.id_entrenador = (select auth.uid())));
drop policy if exists cobro_solo_su_entrenador on public.cobro;
create policy cobro_solo_su_entrenador on public.cobro for all to authenticated
  using (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid())
              and exists (select 1 from public.deportista d where d.id = cobro.id_deportista and d.id_entrenador = (select auth.uid())));
drop policy if exists tarifa_solo_su_entrenador on public.tarifa;
create policy tarifa_solo_su_entrenador on public.tarifa for all to authenticated
  using (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid())
              and exists (select 1 from public.deportista d where d.id = tarifa.id_deportista and d.id_entrenador = (select auth.uid())));
drop policy if exists cobros_lista_solo_su_entrenador on public.cobros_lista;
create policy cobros_lista_solo_su_entrenador on public.cobros_lista for all to authenticated
  using (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid())
              and exists (select 1 from public.deportista d where d.id = cobros_lista.id_deportista and d.id_entrenador = (select auth.uid())));


/* ············································
   El chat: cada entrenador, sus conversaciones
   ············································ */
drop policy if exists mensajes_rw on public.mensajes;
create policy mensajes_rw on public.mensajes for all to authenticated
  using ((id_entrenador = (select auth.uid()))
         or (id_deportista in (select d.id from public.deportista d where d.id_usuario = (select auth.uid()))))
  with check (id_deportista in (select auth_dep_ids_sin_director() as auth_dep_ids_sin_director));


/* ············································
   Los envíos de deportistas
   ············································ */
alter table public.envio_entrenador add column if not exists id_deportista bigint references public.deportista(id) on delete cascade;
/* La cuenta del deportista al pedirlo (null = una ficha sin cuenta). */
alter table public.envio_entrenador add column if not exists deportista_usuario uuid;
alter table public.envio_entrenador add column if not exists acepta_entrenador_en timestamptz;
alter table public.envio_entrenador add column if not exists acepta_deportista_en timestamptz;
/* Quién dijo que no, si alguien lo dijo. */
alter table public.envio_entrenador add column if not exists rechaza text;
alter table public.envio_entrenador drop constraint if exists envio_entrenador_rechaza;
alter table public.envio_entrenador add constraint envio_entrenador_rechaza
  check (rechaza is null or rechaza in ('entrenador', 'deportista'));
alter table public.envio_entrenador drop constraint if exists envio_entrenador_tipo;
alter table public.envio_entrenador add constraint envio_entrenador_tipo
  check (tipo in ('plantilla', 'test', 'zonas', 'varios', 'deportista'));
alter table public.envio_entrenador drop constraint if exists envio_entrenador_deportista;
alter table public.envio_entrenador add constraint envio_entrenador_deportista
  check ((tipo = 'deportista') = (id_deportista is not null));
/* Un traspaso pendiente por deportista. */
create unique index if not exists envio_entrenador_un_traspaso
  on public.envio_entrenador (id_deportista) where tipo = 'deportista' and estado = 'pendiente';


/* Si quien lo recibe tiene sitio. Solo eso, sin cuántos tiene. */
create or replace function public.entrenador_tiene_sitio(_para uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from perfiles yo where yo.id = auth.uid() and yo.rol = 'entrenador') then null
    else coalesce((select p.cupo_deportistas is null
                          or (select count(*) from deportista d where d.id_entrenador = p.id and not coalesce(d.solo_test, false)) < p.cupo_deportistas
                     from perfiles p where p.id = _para and p.rol = 'entrenador'), false)
  end
$$;


/* Pedir el traspaso. Solo de un deportista tuyo, y uno pendiente por deportista. */
create or replace function public.pedir_traspaso(
  _para uuid, _id_deportista bigint, _con_lo_suyo boolean default true, _mensaje text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  _yo     uuid := auth.uid();
  _men    text := nullif(btrim(coalesce(_mensaje, '')), '');
  _d      jsonb;
  _dep    deportista%rowtype;
  _tests  bigint[] := '{}'::bigint[];
  _cls    jsonb := '[]'::jsonb;
  _foto   jsonb;
  _c      bigint;
  _nuevo  bigint;
begin
  _d := public.envio_destino(_yo, _para, _men);
  select * into _dep from deportista where id = _id_deportista for update;
  if not found or _dep.id_entrenador is distinct from _yo then
    raise exception 'Ese deportista no es tuyo';
  end if;
  if _dep.id_grupo is not null then
    raise exception 'La ficha de un grupo no se pasa: se quita borrando el grupo';
  end if;
  if exists (select 1 from envio_entrenador where id_deportista = _dep.id and tipo = 'deportista' and estado = 'pendiente') then
    raise exception 'Ya has pedido pasar a % a otro entrenador: espera a que contesten o cancélalo', _dep.nombre;
  end if;
  if not coalesce(_dep.solo_test, false) and not public.entrenador_tiene_sitio(_para) then
    raise exception 'Ese entrenador no tiene sitio para más deportistas';
  end if;

  if coalesce(_con_lo_suyo, false) then
    /* Tus tests que usa: con mediciones suyas, en sus ajustes de zona o en
       sus días de test… */
    _tests := array(
      select t.id from test_definicion t
       where t.id_entrenador = _yo
         and t.id in (select m.id_definicion from test_medicion m where m.id_deportista = _dep.id
                      union
                      select (regexp_match(l->>'ref', '^propia:([0-9]+):[0-9]+$'))[1]::bigint
                        from zona_ajuste a, lateral (values (a.desde), (a.hasta)) v(l)
                       where a.id_deportista = _dep.id
                      union
                      select (s.test->>'id')::bigint from sesion s
                       where s.id_deportista = _dep.id and s.test->>'origen' = 'propio' and (s.test->>'id') ~ '^[0-9]+$'));
    /* …y tus zonas que salen de ellos o en las que tiene ajustes. Las que no
       se pueden mandar (sin zonas, o de un test que no es tuyo) se quedan. */
    for _c in
      select c.id from zona_clasificacion c
       where c.id_entrenador = _yo and not c.archivada
         and (exists (select 1 from jsonb_array_elements_text(c.hitos) h
                       where (regexp_match(h, '^propia:([0-9]+):[0-9]+$'))[1]::bigint = any(_tests))
              or exists (select 1 from zona_entrenador z
                          where z.id_clasificacion = c.id and not z.archivada
                            and (z.ref_definicion = any(_tests)
                                 or (regexp_match(z.desde->>'ref', '^propia:([0-9]+):[0-9]+$'))[1]::bigint = any(_tests)
                                 or (regexp_match(z.hasta->>'ref', '^propia:([0-9]+):[0-9]+$'))[1]::bigint = any(_tests)))
              or exists (select 1 from zona_ajuste a join zona_entrenador z on z.id = a.id_zona
                          where a.id_deportista = _dep.id and z.id_clasificacion = c.id))
       order by c.orden, c.id
    loop
      begin
        _foto := public.envio_foto_clasificacion(_yo, _c);
        _cls := _cls || jsonb_build_array(jsonb_build_object('origen', _c, 'clasificacion', _foto->'clasificacion', 'zonas', _foto->'zonas'));
        _tests := _tests || array(select jsonb_array_elements_text(_foto->'tests')::bigint);
      exception when others then
        null;
      end;
    end loop;
    _tests := array(select distinct x from unnest(_tests) x order by 1);
  end if;

  insert into envio_entrenador (de, para, tipo, titulo, contenido, mensaje, de_nombre, para_nombre, para_correo,
                                id_deportista, deportista_usuario)
  values (_yo, _para, 'deportista', left('Traspaso de ' || coalesce(_dep.nombre, 'un deportista'), 120),
          jsonb_build_object(
            'deportista', jsonb_build_object('id', _dep.id, 'nombre', _dep.nombre,
                                             'tiene_cuenta', _dep.id_usuario is not null, 'solo_test', coalesce(_dep.solo_test, false)),
            'con_lo_suyo', coalesce(_con_lo_suyo, false),
            'tests', public.envio_fotos_tests(_tests),
            'clasificaciones', _cls),
          _men, _d->>'yo_nombre', _d->>'para_nombre', _d->>'para_correo',
          _dep.id, _dep.id_usuario)
  returning id into _nuevo;
  return _nuevo;
end $$;


/* Hacer el traspaso, cuando ya han dicho que sí los que tienen que decirlo.
   Lo llaman contestar_envio (el entrenador) y contestar_traspaso_deportista
   (el deportista): el último que acepta. */
create or replace function public.envio_hacer_traspaso(_id bigint)
returns jsonb language plpgsql set search_path = public as $$
declare
  _e     envio_entrenador%rowtype;
  _dep   deportista%rowtype;
  _t     jsonb;
  _mapa  jsonb := '{}'::jsonb;
  _clmap jsonb := '{}'::jsonb;
  _ids   jsonb := '[]'::jsonb;
  _r     record;
  _nueva bigint;
  _k     text;
begin
  select * into _e from envio_entrenador where id = _id for update;
  select * into _dep from deportista where id = _e.id_deportista for update;

  /* Si ya no es de quien lo pidió (lo quitó, o es de otro), no se hace. */
  if not found or _dep.id_entrenador is distinct from _e.de or _dep.id_grupo is not null then
    update envio_entrenador set estado = 'cancelado', contestado_en = now() where id = _id;
    return jsonb_build_object('estado', 'cancelado', 'motivo', 'Ese deportista ya no es de quien te lo pasaba');
  end if;

  /* Si se hizo una cuenta después de pedirlo, ahora también contesta él. */
  if _dep.id_usuario is not null and _e.acepta_deportista_en is null then
    update envio_entrenador set deportista_usuario = _dep.id_usuario where id = _id;
    return jsonb_build_object('estado', 'pendiente', 'falta', 'deportista');
  end if;

  if not coalesce(_dep.solo_test, false)
     and exists (select 1 from perfiles p where p.id = _e.para and p.cupo_deportistas is not null
                   and (select count(*) from deportista d where d.id_entrenador = p.id and not coalesce(d.solo_test, false)) >= p.cupo_deportistas) then
    raise exception 'Quien lo recibe no tiene sitio para más deportistas';
  end if;

  /* Lo que se cierra con el entrenador de antes, como al quitarlo. Los
     grupos ANTES de cambiarlo (el sello de la pertenencia exige que el
     deportista sea del entrenador del grupo), y los accesos de director
     también antes (si no, el guardián del dueño no dejaría cambiarlo). */
  update grupo_entreno_miembro set hasta = current_date
   where id_deportista = _dep.id and hasta is null
     and id_grupo in (select g.id from grupo_entreno g where g.id_entrenador = _e.de);
  delete from director_acceso where id_deportista = _dep.id;
  delete from invitacion_deportista where id_deportista = _dep.id and not coalesce(usado, false);

  /* Lo suyo que usaba: copias para el nuevo, y lo del deportista, a ellas. */
  if coalesce((_e.contenido->>'con_lo_suyo')::boolean, false) then
    _t := public.envio_copiar_tests(_e.para, _e, '{}'::jsonb);
    _mapa := _t->'mapa';
    for _r in select value as v from jsonb_array_elements(coalesce(_e.contenido->'clasificaciones', '[]'::jsonb)) loop
      _nueva := public.envio_copiar_clasificacion(_e.para, _r.v->'clasificacion', _r.v->'zonas', _mapa, null, _e.de_nombre);
      _clmap := _clmap || jsonb_build_object(_r.v->>'origen', _nueva);
      _ids := _ids || to_jsonb(_nueva);
    end loop;
    /* Sus mediciones se MUEVEN a las copias: copiarlas las enseñaría dos
       veces, y el de antes ya no las ve. Si la copia ya tiene una ese mismo
       día (un test reusado de otro envío), esa se queda donde estaba. */
    for _k in select jsonb_object_keys(_mapa) loop
      update test_medicion m set id_definicion = (_mapa->>_k)::bigint
       where m.id_deportista = _dep.id and m.id_definicion = _k::bigint
         and not exists (select 1 from test_medicion o
                          where o.id_definicion = (_mapa->>_k)::bigint and o.id_deportista = m.id_deportista and o.fecha = m.fecha);
    end loop;
    /* Sus días de test, a la copia. */
    update sesion s
       set test = jsonb_build_object('origen', 'propio', 'id', (_mapa->>(s.test->>'id'))::bigint)
     where s.id_deportista = _dep.id and s.test->>'origen' = 'propio'
       and (_mapa->>(s.test->>'id')) is not null;
    /* Sus ajustes, a las zonas copiadas y con los límites en las copias de
       los tests. Si un límite no se puede reenlazar, se queda como estaba. */
    for _r in select a.id, n.id as zona, a.desde, a.hasta
                from zona_ajuste a
                join zona_entrenador v on v.id = a.id_zona
                join zona_entrenador n on n.id_clasificacion = (_clmap->>v.id_clasificacion::text)::bigint
                                      and upper(n.sigla) = upper(v.sigla) and not n.archivada
               where a.id_deportista = _dep.id and (_clmap->>v.id_clasificacion::text) is not null loop
      begin
        update zona_ajuste
           set id_zona = _r.zona, desde = public.envio_limite(_r.desde, _mapa), hasta = public.envio_limite(_r.hasta, _mapa)
         where id = _r.id;
      exception when others then
        update zona_ajuste set id_zona = _r.zona where id = _r.id;
      end;
    end loop;
  end if;

  update deportista set id_entrenador = _e.para where id = _dep.id;

  update envio_entrenador
     set estado = 'aceptado', contestado_en = now(),
         resultado = jsonb_build_object('deportista', _dep.id)
                     || case when _mapa <> '{}'::jsonb then jsonb_build_object('tests', _mapa) else '{}'::jsonb end
                     || case when jsonb_array_length(_ids) > 0 then jsonb_build_object('clasificaciones', _ids) else '{}'::jsonb end
   where id = _id;
  return jsonb_build_object('estado', 'aceptado', 'deportista', _dep.id);
end $$;


/* Contestar como entrenador: ahora también los traspasos. */
create or replace function public.contestar_envio(_id bigint, _aceptar boolean, _nombres jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _yo   uuid := auth.uid();
  _e    envio_entrenador%rowtype;
  _n    jsonb := case when jsonb_typeof(_nombres) = 'object' then _nombres else '{}'::jsonb end;
  _t    jsonb;
  _mapa jsonb;
  _res  jsonb := '{}'::jsonb;
  _ids  jsonb;
  _r    record;
begin
  select * into _e from envio_entrenador where id = _id for update;
  if not found or _yo is null or _e.para <> _yo then
    raise exception 'No encontrado';
  end if;
  if _e.estado <> 'pendiente' then
    raise exception 'Ese envío ya no está pendiente';
  end if;

  if not coalesce(_aceptar, false) then
    update envio_entrenador
       set estado = 'rechazado', contestado_en = now(),
           rechaza = case when tipo = 'deportista' then 'entrenador' else rechaza end
     where id = _id;
    return jsonb_build_object('estado', 'rechazado');
  end if;

  if not exists (select 1 from perfiles where id = _yo and rol = 'entrenador') then
    raise exception 'Solo un entrenador puede aceptarlo';
  end if;

  /* Un traspaso: lo hace el último que acepta. */
  if _e.tipo = 'deportista' then
    if _e.acepta_entrenador_en is not null then
      raise exception 'Ya lo aceptaste: falta que conteste el deportista';
    end if;
    update envio_entrenador set acepta_entrenador_en = now() where id = _id;
    if _e.deportista_usuario is null or _e.acepta_deportista_en is not null then
      return public.envio_hacer_traspaso(_id);
    end if;
    return jsonb_build_object('estado', 'pendiente', 'falta', 'deportista');
  end if;

  /* Primero los tests: las zonas se enganchan a sus copias. */
  _t := public.envio_copiar_tests(_yo, _e, _n->'tests');
  _mapa := _t->'mapa';

  if _e.tipo = 'plantilla' then
    _res := jsonb_build_object('plantilla',
      public.envio_copiar_plantilla(_yo, _e.contenido, _n->>'plantilla', _e.de_nombre));

  elsif _e.tipo = 'zonas' then
    _res := jsonb_build_object('clasificacion',
      public.envio_copiar_clasificacion(_yo, _e.contenido->'clasificacion', _e.contenido->'zonas', _mapa,
                                        _n->>'clasificacion', _e.de_nombre));

  elsif _e.tipo = 'varios' then
    _ids := '[]'::jsonb;
    for _r in select value as v, (ordinality - 1)::int as i
                from jsonb_array_elements(coalesce(_e.contenido->'plantillas', '[]'::jsonb)) with ordinality loop
      _ids := _ids || to_jsonb(public.envio_copiar_plantilla(_yo, _r.v, _n->'plantillas'->>(_r.i::text), _e.de_nombre));
    end loop;
    _res := jsonb_build_object('plantillas', _ids);
    _ids := '[]'::jsonb;
    for _r in select value as v, (ordinality - 1)::int as i
                from jsonb_array_elements(coalesce(_e.contenido->'clasificaciones', '[]'::jsonb)) with ordinality loop
      _ids := _ids || to_jsonb(public.envio_copiar_clasificacion(_yo, _r.v->'clasificacion', _r.v->'zonas', _mapa,
                                                                 _n->'clasificaciones'->>(_r.i::text), _e.de_nombre));
    end loop;
    _res := _res || jsonb_build_object('clasificaciones', _ids);
  end if;

  if _mapa <> '{}'::jsonb then
    _res := _res || jsonb_build_object('tests', _mapa);
  end if;
  update envio_entrenador
     set estado = 'aceptado', contestado_en = now(), resultado = _res
   where id = _id;
  return jsonb_build_object('estado', 'aceptado') || _res
         || case when jsonb_array_length(_t->'reusados') > 0 then jsonb_build_object('reusados', _t->'reusados') else '{}'::jsonb end;
end $$;


/* Contestar como deportista: solo el suyo, y solo mientras está pendiente. */
create or replace function public.contestar_traspaso_deportista(_id bigint, _aceptar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _yo uuid := auth.uid();
  _e  envio_entrenador%rowtype;
begin
  select * into _e from envio_entrenador where id = _id for update;
  if not found or _yo is null or _e.tipo <> 'deportista' or _e.deportista_usuario is distinct from _yo then
    raise exception 'No encontrado';
  end if;
  if _e.estado <> 'pendiente' then
    raise exception 'Eso ya no está pendiente';
  end if;
  if not coalesce(_aceptar, false) then
    update envio_entrenador set estado = 'rechazado', contestado_en = now(), rechaza = 'deportista' where id = _id;
    return jsonb_build_object('estado', 'rechazado');
  end if;
  if _e.acepta_deportista_en is not null then
    raise exception 'Ya lo aceptaste: falta que conteste el otro entrenador';
  end if;
  update envio_entrenador set acepta_deportista_en = now() where id = _id;
  if _e.acepta_entrenador_en is not null then
    return public.envio_hacer_traspaso(_id);
  end if;
  return jsonb_build_object('estado', 'pendiente', 'falta', 'entrenador');
end $$;


/* Lo que tiene que contestar el deportista: solo lo que necesita ver. */
create or replace function public.mis_traspasos_pendientes()
returns table (id bigint, de_nombre text, para_nombre text, mensaje text, creado_en timestamptz, ya_acepte boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.de_nombre, e.para_nombre, e.mensaje, e.creado_en, e.acepta_deportista_en is not null
    from envio_entrenador e
   where e.tipo = 'deportista' and e.estado = 'pendiente' and e.deportista_usuario = auth.uid()
   order by e.creado_en desc;
$$;


revoke all on function public.envio_hacer_traspaso(bigint) from public, anon, authenticated;

revoke all on function public.entrenador_tiene_sitio(uuid) from public;
revoke all on function public.pedir_traspaso(uuid, bigint, boolean, text) from public;
revoke all on function public.contestar_traspaso_deportista(bigint, boolean) from public;
revoke all on function public.mis_traspasos_pendientes() from public;
revoke all on function public.contestar_envio(bigint, boolean, jsonb) from public;

revoke execute on function public.entrenador_tiene_sitio(uuid) from anon;
revoke execute on function public.pedir_traspaso(uuid, bigint, boolean, text) from anon;
revoke execute on function public.contestar_traspaso_deportista(bigint, boolean) from anon;
revoke execute on function public.mis_traspasos_pendientes() from anon;
revoke execute on function public.contestar_envio(bigint, boolean, jsonb) from anon;

grant execute on function public.entrenador_tiene_sitio(uuid) to authenticated;
grant execute on function public.pedir_traspaso(uuid, bigint, boolean, text) to authenticated;
grant execute on function public.contestar_traspaso_deportista(bigint, boolean) to authenticated;
grant execute on function public.mis_traspasos_pendientes() to authenticated;
grant execute on function public.contestar_envio(bigint, boolean, jsonb) to authenticated;

/* 3. DESPUÉS */
select pg_temp.contar('despues');

do $ensayo$
declare
  _x _actores%rowtype;
  _r text; _j jsonb; _id bigint; _id_f bigint; _id_v bigint; _id_c bigint;
  _ses_a int; _men_mu int; _cargo_a int; _copia bigint; _cupo int; _med int;
begin
  select * into _x from _actores;
  perform pg_temp.dice('   Protagonistas: A ' || (_x.a is not null) || ', B ' || (_x.b is not null) || ', C ' || (_x.c is not null)
    || ', M con cuenta ' || (_x.mu is not null) || ', ficha F ' || (_x.f is not null) || ', test de A ' || (_x.test is not null)
    || ', grupo ' || (_x.grupo is not null));

  perform pg_temp.dice('3. Para todos igual: ' || (
    select case when count(*) = 0 then 'lo mismo en las 10 tablas para las ' || (select count(*) from perfiles) || ' personas'
                else count(*) || ' DIFERENCIAS: ' || string_agg(distinct x.tabla, ', ') end
      from _cuentas x join _cuentas y on y.quien = x.quien and y.tabla = x.tabla and y.cuando = 'despues'
     where x.cuando = 'antes' and x.n <> y.n));
  perform pg_temp.dice('3. Cobros con dueño: ' || (
      (select count(*) from cargo where id_entrenador is null) + (select count(*) from cobro where id_entrenador is null)
    + (select count(*) from tarifa where id_entrenador is null) + (select count(*) from cobros_lista where id_entrenador is null))
    || ' filas sin dueño; y el dueño es el entrenador de su deportista: ' || (
      select count(*) = 0 from (
        select id_deportista, id_entrenador from cargo union all select id_deportista, id_entrenador from cobro
        union all select id_deportista, id_entrenador from tarifa union all select id_deportista, id_entrenador from cobros_lista) q
       join deportista d on d.id = q.id_deportista where q.id_entrenador is distinct from d.id_entrenador));

  /* ── Lo que no se deja ── */
  perform pg_temp.dice('4a. B pide pasar a M, que no es suyo: ' || pg_temp.como(_x.b, format('select pedir_traspaso(%L, %s)', _x.c, _x.m)));
  perform pg_temp.dice('4a. A se lo pasa a un deportista: ' || pg_temp.como(_x.a, format('select pedir_traspaso(%L, %s)', _x.mu, _x.m)));
  perform pg_temp.dice('4a. A se lo pasa a sí mismo: ' || pg_temp.como(_x.a, format('select pedir_traspaso(%L, %s)', _x.a, _x.m)));
  perform pg_temp.dice('4a. Sin entrar (anon): ' || pg_temp.como(null, format('select pedir_traspaso(%L, %s)', _x.b, _x.m)));
  perform pg_temp.dice('4a. Una ficha de grupo: ' || coalesce((
    select pg_temp.como(_x.a, format('select pedir_traspaso(%L, %s)', _x.b, d.id)) from deportista d
     where d.id_grupo is not null and d.id_entrenador = _x.a limit 1), 'A no tiene fichas de grupo'));
  perform pg_temp.dice('4a. El deportista (M) llama a contestar como entrenador: ' || pg_temp.como(_x.mu, 'select contestar_envio(1, true)'));

  /* ── Pedirlo ── */
  _ses_a := pg_temp.ve(_x.a, format('select count(*)::int from sesion where id_deportista = %s', _x.m));
  _men_mu := pg_temp.ve(_x.mu, format('select count(*)::int from mensajes where id_deportista = %s', _x.m));
  _cargo_a := pg_temp.ve(_x.a, format('select count(*)::int from cargo where id_deportista = %s', _x.m));
  _med := (select count(*) from test_medicion where id_definicion = _x.test and id_deportista = _x.m);
  _r := pg_temp.hacer(_x.a, format('select pedir_traspaso(%L, %s, true, %L)::text', _x.b, _x.m, 'Se muda a tu ciudad'));
  perform pg_temp.dice('4b. A pide pasar a M a B, con lo suyo: ' || case when _r ~ '^[0-9]+$' then 'ENTRA' else _r end);
  if _r ~ '^[0-9]+$' then _id := _r::bigint; end if;
  perform pg_temp.dice('4b. … guardado: ' || coalesce((
    select 'tipo ' || tipo || ', tests ' || jsonb_array_length(contenido->'tests') || ', zonas ' || jsonb_array_length(contenido->'clasificaciones')
        || ', con cuenta ' || (contenido->'deportista'->>'tiene_cuenta') || ', su cuenta guardada ' || (deportista_usuario = _x.mu)
        || ', lleva el test de A ' || exists (select 1 from jsonb_array_elements(contenido->'tests') t where (t->>'id')::bigint = _x.test)
      from envio_entrenador where id = _id), 'no hay fila'));
  perform pg_temp.dice('4b. Otra vez el mismo: ' || pg_temp.como(_x.a, format('select pedir_traspaso(%L, %s)', _x.c, _x.m)));
  perform pg_temp.dice('4b. Lo ven en la tabla: A ' || pg_temp.ve(_x.a, format('select count(*)::int from envio_entrenador where id = %s', coalesce(_id, -1)))
    || ', B ' || pg_temp.ve(_x.b, format('select count(*)::int from envio_entrenador where id = %s', coalesce(_id, -1)))
    || ', C ' || pg_temp.ve(_x.c, format('select count(*)::int from envio_entrenador where id = %s', coalesce(_id, -1)))
    || ', M ' || pg_temp.ve(_x.mu, format('select count(*)::int from envio_entrenador where id = %s', coalesce(_id, -1)))
    || '; en «lo que tengo que contestar»: M ' || pg_temp.ve(_x.mu, 'select count(*)::int from mis_traspasos_pendientes()')
    || ', B ' || pg_temp.ve(_x.b, 'select count(*)::int from mis_traspasos_pendientes()'));

  /* ── Contestan: primero M, luego B ── */
  _r := pg_temp.hacer(_x.mu, format('select contestar_traspaso_deportista(%s, true)::text', coalesce(_id, -1)));
  perform pg_temp.dice('4c. M acepta primero: ' || coalesce(pg_temp.j(_r)::text, _r)
    || '; M sigue con A: ' || ((select id_entrenador from deportista where id = _x.m) = _x.a)
    || '; y otra vez: ' || pg_temp.como(_x.mu, format('select contestar_traspaso_deportista(%s, true)', coalesce(_id, -1))));
  perform pg_temp.dice('4c. C contesta lo de M: ' || pg_temp.como(_x.c, format('select contestar_traspaso_deportista(%s, true)', coalesce(_id, -1))));
  _r := pg_temp.hacer(_x.b, format('select contestar_envio(%s, true)::text', coalesce(_id, -1)));
  perform pg_temp.dice('4d. B acepta: ' || coalesce(pg_temp.j(_r)::text, _r)
    || '; M es de B: ' || ((select id_entrenador from deportista where id = _x.m) = _x.b)
    || '; el envío: ' || (select estado from envio_entrenador where id = _id));

  /* ── Lo que ve cada uno después ── */
  perform pg_temp.dice('4e. Sesiones de M: B ve ' || pg_temp.ve(_x.b, format('select count(*)::int from sesion where id_deportista = %s', _x.m))
    || ' (A veía ' || _ses_a || '), A ve ' || pg_temp.ve(_x.a, format('select count(*)::int from sesion where id_deportista = %s', _x.m)));
  perform pg_temp.dice('4e. Chat: B ve ' || pg_temp.ve(_x.b, format('select count(*)::int from mensajes where id_deportista = %s', _x.m))
    || ' mensajes de M (los de A no), A ve ' || pg_temp.ve(_x.a, format('select count(*)::int from mensajes where id_deportista = %s', _x.m))
    || ' (los suyos), M ve ' || pg_temp.ve(_x.mu, format('select count(*)::int from mensajes where id_deportista = %s', _x.m))
    || ' (veía ' || _men_mu || ')');
  perform pg_temp.dice('4e. Cobros de M: A ve ' || pg_temp.ve(_x.a, format('select count(*)::int from cargo where id_deportista = %s', _x.m))
    || ' cargos (veía ' || _cargo_a || '), B ve ' || pg_temp.ve(_x.b, format('select count(*)::int from cargo where id_deportista = %s', _x.m))
    || '; tarifas: A ' || pg_temp.ve(_x.a, format('select count(*)::int from tarifa where id_deportista = %s', _x.m))
    || ', B ' || pg_temp.ve(_x.b, format('select count(*)::int from tarifa where id_deportista = %s', _x.m)));
  perform pg_temp.dice('4e. B le apunta a M su lista y su cuota de este mes: '
    || pg_temp.hacer(_x.b, format('insert into cobros_lista (id_deportista) values (%s) returning %L', _x.m, 'ok'))
    || ' / ' || pg_temp.hacer(_x.b, format('insert into cargo (id_deportista, fecha, concepto, importe, mes, tipo) values (%s, current_date, %L, 40, to_char(current_date, %L), %L) returning %L',
                                            _x.m, 'Cuota', 'YYYY-MM', 'mensual', 'ok'))
    || '; A ya no puede apuntarle nada: ' || pg_temp.como(_x.a, format('insert into cobro (id_deportista, fecha, importe, medio) values (%s, current_date, 10, %L)', _x.m, 'otro')));
  perform pg_temp.dice('4e. Lo que se cerró con A: grupos abiertos ' || (select count(*) from grupo_entreno_miembro where id_deportista = _x.m and hasta is null and id_grupo = _x.grupo)
    || ', accesos de director ' || (select count(*) from director_acceso where id_deportista = _x.m)
    || ', invitaciones sin usar ' || (select count(*) from invitacion_deportista where id_deportista = _x.m and not coalesce(usado, false)));
  _copia := (select (resultado->'tests'->>_x.test::text)::bigint from envio_entrenador where id = _id);
  perform pg_temp.dice('4e. Sus tests: la copia es de B ' || coalesce((select (id_entrenador = _x.b)::text from test_definicion where id = _copia), 'NO HAY COPIA')
    || '; mediciones de M en la copia ' || (select count(*) from test_medicion where id_definicion = _copia and id_deportista = _x.m)
    || ' de ' || _med || ', y en el test de A quedan ' || (select count(*) from test_medicion where id_definicion = _x.test and id_deportista = _x.m)
    || ' (se mueven, no se duplican); B las ve ' || pg_temp.ve(_x.b, format('select count(*)::int from test_medicion where id_definicion = %s and id_deportista = %s', coalesce(_copia, -1), _x.m))
    || ', M las ve ' || pg_temp.ve(_x.mu, format('select count(*)::int from test_medicion where id_definicion = %s', coalesce(_copia, -1)))
    || ' y M lee la copia ' || pg_temp.ve(_x.mu, format('select count(*)::int from test_definicion where id = %s', coalesce(_copia, -1))));
  perform pg_temp.dice('4e. Sus ajustes: en zonas de B ' || (select count(*) from zona_ajuste a join zona_entrenador z on z.id = a.id_zona where a.id_deportista = _x.m and z.id_entrenador = _x.b)
    || ', en zonas de A ' || (select count(*) from zona_ajuste a join zona_entrenador z on z.id = a.id_zona where a.id_deportista = _x.m and z.id_entrenador = _x.a)
    || '; el de prueba, con su límite en la copia: ' || exists (select 1 from zona_ajuste a join zona_entrenador z on z.id = a.id_zona
                                                                where a.id_deportista = _x.m and z.id_entrenador = _x.b
                                                                  and a.hasta->>'ref' = 'propia:' || coalesce(_copia, -1) || ':0')
    || '; B puede cambiar ' || pg_temp.ve(_x.b, format('with u as (update zona_ajuste set hasta = jsonb_set(hasta, %L, %L) where id_deportista = %s and id_zona in (select id from zona_entrenador where id_entrenador = %L) returning 1) select count(*)::int from u', '{pct}', '81', _x.m, _x.b))
    || '; su día de test: ' || coalesce((select case when (test->>'id')::bigint = _copia then 'en la copia' else 'SIGUE EN EL TEST DE A' end from sesion where id = _x.ses), 'M no tiene sesiones'));

  /* ── La ficha sin cuenta: basta con B ── */
  _r := pg_temp.hacer(_x.a, format('select pedir_traspaso(%L, %s, false)::text', _x.b, _x.f));
  if _r ~ '^[0-9]+$' then _id_f := _r::bigint; end if;
  _r := pg_temp.hacer(_x.b, format('select contestar_envio(%s, true)::text', coalesce(_id_f, -1)));
  perform pg_temp.dice('4f. Ficha sin cuenta: B acepta → ' || coalesce(pg_temp.j(_r)->>'estado', _r)
    || '; la ficha es de B: ' || ((select id_entrenador from deportista where id = _x.f) = _x.b)
    || '; sin lo suyo, no se copia nada: ' || ((select resultado from envio_entrenador where id = _id_f) = jsonb_build_object('deportista', _x.f)));

  /* ── Rechazar: B se lo devuelve a A, y M dice que no ── */
  _r := pg_temp.hacer(_x.b, format('select pedir_traspaso(%L, %s, false)::text', _x.a, _x.m));
  if _r ~ '^[0-9]+$' then _id_v := _r::bigint; end if;
  perform pg_temp.hacer(_x.a, format('select contestar_envio(%s, true)::text', coalesce(_id_v, -1)));
  _r := pg_temp.hacer(_x.mu, format('select contestar_traspaso_deportista(%s, false)::text', coalesce(_id_v, -1)));
  perform pg_temp.dice('4g. A acepta y M dice que no: ' || coalesce(pg_temp.j(_r)->>'estado', _r)
    || ', rechaza ' || coalesce((select rechaza from envio_entrenador where id = _id_v), '?')
    || '; M sigue con B: ' || ((select id_entrenador from deportista where id = _x.m) = _x.b));

  /* ── Cancelar (a A, que ya tiene sitio) ── */
  _r := pg_temp.hacer(_x.b, format('select pedir_traspaso(%L, %s, false)::text', _x.a, _x.m));
  if _r ~ '^[0-9]+$' then _id_c := _r::bigint; end if;
  perform pg_temp.dice('4h. B lo pide otra vez y cancela: ' || case when _id_c is null then _r else pg_temp.hacer(_x.b, format('select %L from (select cancelar_envio(%s)) x', 'ok', _id_c)) end
    || '; A lo acepta después: ' || pg_temp.como(_x.a, format('select contestar_envio(%s, true)', coalesce(_id_c, -1)))
    || '; M lo acepta después: ' || pg_temp.como(_x.mu, format('select contestar_traspaso_deportista(%s, true)', coalesce(_id_c, -1))));

  /* ── El cupo, al pedirlo ── */
  _cupo := (select count(*) from deportista where id_entrenador = _x.c and not coalesce(solo_test, false));
  perform pg_temp.dice('4i. C con el cupo lleno (' || pg_temp.cupo(_x.c, _cupo) || '): ¿tiene sitio? ' || coalesce(pg_temp.hacer(_x.b, format('select entrenador_tiene_sitio(%L)::text', _x.c)), '?')
    || '; B le pide pasar a M: ' || pg_temp.como(_x.b, format('select pedir_traspaso(%L, %s)', _x.c, _x.m))
    || '; un deportista pregunta si tiene sitio: ' || pg_temp.hacer(_x.mu, format('select coalesce(entrenador_tiene_sitio(%L)::text, %L)', _x.c, 'sin respuesta')));

  /* ── El cupo, al hacerse: C tenía sitio al pedirlo y se llena antes de
        que acepte M, que contesta el último ── */
  _j := jsonb_build_object('abrir', pg_temp.cupo(_x.c, _cupo + 1));
  _id_c := null;
  _r := pg_temp.hacer(_x.b, format('select pedir_traspaso(%L, %s, false)::text', _x.c, _x.m));
  if _r ~ '^[0-9]+$' then _id_c := _r::bigint; end if;
  perform pg_temp.dice('4j. B se lo pide a C con sitio (cupo ' || _j::text || '): ' || case when _id_c is null then 'NO ENTRA: ' || _r else 'ENTRA' end);
  _j := jsonb_build_object('llenar', pg_temp.cupo(_x.c, _cupo));
  _r := pg_temp.hacer(_x.c, format('select contestar_envio(%s, true)::text', coalesce(_id_c, -1)));
  perform pg_temp.dice('4j. C se llena (cupo ' || _j::text || ') y acepta primero: ' || coalesce(pg_temp.j(_r)::text, _r)
    || '; M acepta: ' || pg_temp.hacer(_x.mu, format('select contestar_traspaso_deportista(%s, true)::text', coalesce(_id_c, -1)))
    || '; M sigue con B: ' || ((select id_entrenador from deportista where id = _x.m) = _x.b)
    || '; el envío sigue ' || coalesce((select estado from envio_entrenador where id = _id_c), '?'));

  /* ── El deportista, el último: con sitio, su sí lo hace ── */
  _j := jsonb_build_object('sin_tope', pg_temp.cupo(_x.c, null));
  _r := pg_temp.hacer(_x.mu, format('select contestar_traspaso_deportista(%s, true)::text', coalesce(_id_c, -1)));
  perform pg_temp.dice('4k. C con sitio (cupo ' || _j::text || ') y M acepta el último: ' || coalesce(pg_temp.j(_r)::text, _r)
    || '; M es de C: ' || ((select id_entrenador from deportista where id = _x.m) = _x.c)
    || '; B ya no ve sus sesiones: ' || (pg_temp.ve(_x.b, format('select count(*)::int from sesion where id_deportista = %s', _x.m)) = 0));
end $ensayo$;

/* El informe: un error a propósito que lo trae y deshace todo. */
do $fin$
begin
  raise exception 'INFORME:%', (select E'\n' || string_agg(linea, E'\n' order by orden) from _informe);
end $fin$;
