/* ============================================================
   ENSAYO de envios-traspaso-ejercicios.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: la migración, los traspasos y lo que se monta para probarlos.

   Los protagonistas se eligen solos con lo que hay en la base (no lleva ids
   escritos: el repositorio es público):
   · A, quien pasa el deportista: un entrenador normal (sin plataforma_admin)
     con un deportista CON cuenta (M) que tiene alguna tarea.
   · B, quien lo recibe: otro entrenador normal, con sitio en su cupo para
     dos más, que no trabaja con A en una dirección.
   Lo que falte para probar se monta DENTRO del ensayo (y se deshace): cuatro
   ejercicios de la biblioteca de A (uno en una sesión de fuerza de M, uno de
   técnica, uno encadenado y uno que M no usa), uno de B con el mismo nombre
   que el primero y una ficha sin cuenta de A (de solo tests).

   1. CONTROL: lo que cada persona de la base ve hoy de la biblioteca, los
      ejercicios de las sesiones, las tareas, las sesiones y los envíos.
   2. La migración, con las mismas sentencias que el fichero.
   3. Lo mismo después: tiene que ser igual para TODOS (solo cambian funciones).
   4. El traspaso con lo suyo: qué viaja, las copias, el «(Ana)», las sesiones
      de M apuntando a ellas, quién las lee, lo de A sin tocar, las copias que
      se reusan en otro traspaso y lo que pasa sin la casilla.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (a uuid, b uuid, m bigint, mu uuid, f bigint, tarea bigint,
                            e1 bigint, e2 bigint, e3 bigint, e4 bigint, ej bigint, de_b bigint);
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

/* Lo que ve CADA persona de la base (entrenadores y deportistas). */
create function pg_temp.contar(_cuando text) returns void language plpgsql as $f$
declare _p record; _t text;
begin
  for _p in select id from perfiles loop
    foreach _t in array array['ejercicios_biblioteca', 'ejercicios', 'tarea', 'sesion', 'envio_entrenador'] loop
      insert into _cuentas (cuando, quien, tabla, n)
      values (_cuando, _p.id, _t, pg_temp.ve(_p.id, 'select count(*)::int from ' || _t));
    end loop;
  end loop;
end $f$;

/* Los protagonistas. */
insert into _actores (a, m, mu, tarea)
select d.id_entrenador, d.id, d.id_usuario,
       (select t.id from tarea t where t.id_deportista = d.id order by t.id desc limit 1)
  from deportista d
  join perfiles p on p.id = d.id_entrenador and p.rol = 'entrenador'
 where d.id_usuario is not null and d.id_grupo is null and not coalesce(d.solo_test, false)
   and not exists (select 1 from plataforma_admin x where x.id_perfil = d.id_entrenador)
   and exists (select 1 from tarea t where t.id_deportista = d.id)
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

/* Lo que se monta para probar (todo se deshace al final). */
do $montar$
declare _x _actores%rowtype; _f bigint; _e1 bigint; _e2 bigint; _e3 bigint; _e4 bigint; _ej bigint; _b bigint;
begin
  select * into _x from _actores;
  insert into ejercicios_biblioteca (nombre, grupo_muscular, url_video, descripcion, tipo, id_entrenador)
  values ('Ensayo: sentadilla', 'Piernas', 'https://ejemplo.invalid/v1', 'De ensayo', '{fuerza}', _x.a) returning id into _e1;
  insert into ejercicios_biblioteca (nombre, grupo_muscular, url_video, tipo, disciplina, id_entrenador)
  values ('Ensayo: técnica', 'Técnica', 'https://ejemplo.invalid/v2', '{tecnica}', '{Carrera}', _x.a) returning id into _e2;
  insert into ejercicios_biblioteca (nombre, grupo_muscular, id_entrenador)
  values ('Ensayo: encadenado', 'Core', _x.a) returning id into _e3;
  insert into ejercicios_biblioteca (nombre, grupo_muscular, id_entrenador)
  values ('Ensayo: no lo usa', 'Brazos', _x.a) returning id into _e4;
  /* B ya tiene uno que se llama como el primero: el suyo llegará con «(…)». */
  insert into ejercicios_biblioteca (nombre, grupo_muscular, id_entrenador)
  values ('Ensayo: sentadilla', 'Piernas', _x.b) returning id into _b;
  /* En una tarea de M: un ejercicio de fuerza con su encadenado, y su técnica. */
  insert into ejercicios (id_tarea, id_deportista, nombre, grupo_muscular, series, repeticiones, ejercicio_id, ejercicio_encadenado_id)
  values (_x.tarea, _x.m, 'Ensayo: sentadilla', 'Piernas', 3, 10, _e1, _e3) returning id into _ej;
  update tarea set tecnica_id = _e2 where id = _x.tarea;
  /* Una ficha sin cuenta de A, para el segundo traspaso. De solo tests, que
     no cuenta para el cupo: A puede tenerlo lleno. */
  insert into deportista (id_entrenador, nombre, solo_test) values (_x.a, 'Ficha de ensayo', true) returning id into _f;
  update _actores set e1 = _e1, e2 = _e2, e3 = _e3, e4 = _e4, ej = _ej, de_b = _b, f = _f;
end $montar$;

/* 1. CONTROL */
select pg_temp.dice('1. Antes: ' || (select count(*) from perfiles) || ' personas; la biblioteca '
  || case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'envio_copiar_ejercicios')
          then '¡YA TIENE EL AYUDANTE!' else 'sin el ayudante nuevo (bien)' end);
select pg_temp.contar('antes');

/* 2. LA MIGRACIÓN, tal cual el fichero */
/* ============================================================
   TRIPULSE — Pasar un deportista: también los ejercicios de tu biblioteca
   ============================================================

   Pedido del usuario el 23-10-2026 («mételos en la casilla»), sobre
   envios-traspaso.sql. Al pasar un deportista con «mandar también lo tuyo que
   usa», viajan también los ejercicios de TU biblioteca que tiene en sus
   sesiones: los de la fuerza (el ejercicio y su encadenado) y los de la
   técnica y los saltos (tecnica_id).

   POR QUÉ. La sesión guarda congelados el nombre, las series y los kilos de
   cada ejercicio, y eso pasa solo con él. Pero el vídeo y la técnica se buscan
   en vivo en la biblioteca (lib/video-ejercicio, lib/tecnica), y la biblioteca
   propia de quien lo pasa no la pueden leer ni el nuevo entrenador ni el
   deportista: los vídeos se perderían y las tareas de técnica se quedarían
   vacías. Medido el 23-10: 18 ejercicios de sesiones vienen de bibliotecas
   propias (los otros 531, del común) y 2 tareas de técnica.

   CÓMO. Como los tests y las zonas: al pedirlo se guarda una foto de cada
   ejercicio; al hacerse, quien lo recibe tiene copias SUYAS y las sesiones del
   deportista pasan a apuntar a ellas. Lo de quien lo pasa no se toca.
   · La copia es un ejercicio suyo nuevo, sin `origen_id`: con él, en su lista
     taparía al del común del que salió (lib/biblioteca-propia).
   · Si choca con un nombre que ya ve (los suyos y los del común), llega como
     «Nombre (Ana)». En las sesiones sigue el de siempre: va congelado.
   · Si ya le llegó ese mismo ejercicio en otro traspaso de esa persona y no ha
     cambiado, se usa esa copia y no se duplica.
   · Solo los tuyos: los del común y los del propio deportista ya los ve el
     nuevo entrenador.

   Solo cambian las dos funciones del traspaso y hay un ayudante nuevo,
   cerrado. Las tablas y sus reglas, igual.
   ============================================================ */


/* Las copias de los ejercicios de un traspaso, para quien lo recibe.
   Devuelve {id del original: id de su copia}. */
create or replace function public.envio_copiar_ejercicios(_yo uuid, _e envio_entrenador)
returns jsonb language plpgsql set search_path = public as $$
declare
  _mapa   jsonb := '{}'::jsonb;
  _x      jsonb;
  _usados text[];
  _nombre text;
  _previa bigint;
  _nuevo  bigint;
begin
  /* Los nombres que ya ve en su biblioteca: los suyos y los del común. */
  _usados := array(select b.nombre from ejercicios_biblioteca b
                    where b.id_deportista is null and (b.id_entrenador = _yo or b.id_entrenador is null));
  for _x in select value from jsonb_array_elements(coalesce(_e.contenido->'ejercicios', '[]'::jsonb)) loop
    /* La copia de un traspaso anterior de la misma persona, si sigue igual. */
    _previa := null;
    select b.id into _previa
      from envio_entrenador p
      join ejercicios_biblioteca b on b.id = (p.resultado->'ejercicios'->>(_x->>'id'))::bigint
     where p.para = _yo and p.de = _e.de and p.estado = 'aceptado' and p.id <> _e.id
       and b.id_entrenador = _yo and b.id_deportista is null
       and (to_jsonb(b) - 'id' - 'nombre' - 'created_at' - 'id_entrenador' - 'id_deportista' - 'origen_id')
           = (_x - 'id' - 'nombre')
     order by p.contestado_en desc nulls last
     limit 1;
    if _previa is not null then
      _nuevo := _previa;
    else
      _nombre := public.envio_nombre_libre(_x->>'nombre', _usados, _e.de_nombre);
      insert into ejercicios_biblioteca (nombre, grupo_muscular, url_video, descripcion, ejecucion,
                                         tipo, region, disciplina, lesion, momento,
                                         nivel_pliometria, parte_pliometria, id_entrenador)
      select _nombre, coalesce(r.grupo_muscular, 'Otros'), r.url_video, r.descripcion, r.ejecucion,
             coalesce(r.tipo, '{}'), coalesce(r.region, '{}'), coalesce(r.disciplina, '{}'),
             coalesce(r.lesion, '{}'), coalesce(r.momento, '{}'),
             r.nivel_pliometria, r.parte_pliometria, _yo
        from jsonb_populate_record(null::ejercicios_biblioteca, _x) r
      returning id into _nuevo;
      _usados := _usados || _nombre;
    end if;
    _mapa := _mapa || jsonb_build_object(_x->>'id', _nuevo);
  end loop;
  return _mapa;
end $$;


/* Pedir el traspaso. Lo mismo que en envios-traspaso.sql, y con «lo tuyo que
   usa» también los ejercicios de tu biblioteca que tiene en sus sesiones. */
create or replace function public.pedir_traspaso(
  _para uuid, _id_deportista bigint, _con_lo_suyo boolean default true, _mensaje text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  _yo     uuid := auth.uid();
  _men    text := nullif(btrim(coalesce(_mensaje, '')), '');
  _d      jsonb;
  _dep    deportista%rowtype;
  _tests  bigint[] := '{}'::bigint[];
  _ejs    bigint[] := '{}'::bigint[];
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
    /* …tus zonas que salen de ellos o en las que tiene ajustes. Las que no
       se pueden mandar (sin zonas, o de un test que no es tuyo) se quedan… */
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
    /* …y los ejercicios de tu biblioteca que tiene en sus sesiones: en la
       fuerza (el ejercicio y su encadenado) y en la técnica y los saltos. */
    _ejs := array(
      select b.id from ejercicios_biblioteca b
       where b.id_entrenador = _yo and b.id_deportista is null
         and b.id in (select x.ejercicio_id from ejercicios x where x.id_deportista = _dep.id
                      union
                      select x.ejercicio_encadenado_id from ejercicios x where x.id_deportista = _dep.id
                      union
                      select t.tecnica_id from tarea t where t.id_deportista = _dep.id));
  end if;

  insert into envio_entrenador (de, para, tipo, titulo, contenido, mensaje, de_nombre, para_nombre, para_correo,
                                id_deportista, deportista_usuario)
  values (_yo, _para, 'deportista', left('Traspaso de ' || coalesce(_dep.nombre, 'un deportista'), 120),
          jsonb_build_object(
            'deportista', jsonb_build_object('id', _dep.id, 'nombre', _dep.nombre,
                                             'tiene_cuenta', _dep.id_usuario is not null, 'solo_test', coalesce(_dep.solo_test, false)),
            'con_lo_suyo', coalesce(_con_lo_suyo, false),
            'tests', public.envio_fotos_tests(_tests),
            'clasificaciones', _cls,
            'ejercicios', (select coalesce(jsonb_agg(to_jsonb(b) - 'id_entrenador' - 'id_deportista' - 'origen_id' - 'created_at'
                                                     order by b.nombre, b.id), '[]'::jsonb)
                             from ejercicios_biblioteca b where b.id = any(_ejs))),
          _men, _d->>'yo_nombre', _d->>'para_nombre', _d->>'para_correo',
          _dep.id, _dep.id_usuario)
  returning id into _nuevo;
  return _nuevo;
end $$;


/* Hacer el traspaso. Lo mismo que en envios-traspaso.sql, y con «lo tuyo que
   usa» también las copias de sus ejercicios y sus sesiones apuntando a ellas. */
create or replace function public.envio_hacer_traspaso(_id bigint)
returns jsonb language plpgsql set search_path = public as $$
declare
  _e     envio_entrenador%rowtype;
  _dep   deportista%rowtype;
  _t     jsonb;
  _mapa  jsonb := '{}'::jsonb;
  _clmap jsonb := '{}'::jsonb;
  _ej    jsonb := '{}'::jsonb;
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
    /* Sus ejercicios de tu biblioteca: copias para el nuevo, y sus sesiones
       (el ejercicio, su encadenado y la técnica), a ellas. */
    _ej := public.envio_copiar_ejercicios(_e.para, _e);
    if _ej <> '{}'::jsonb then
      update ejercicios x set ejercicio_id = (_ej->>x.ejercicio_id::text)::bigint
       where x.id_deportista = _dep.id and (_ej ? x.ejercicio_id::text);
      update ejercicios x set ejercicio_encadenado_id = (_ej->>x.ejercicio_encadenado_id::text)::integer
       where x.id_deportista = _dep.id and (_ej ? x.ejercicio_encadenado_id::text);
      update tarea t set tecnica_id = (_ej->>t.tecnica_id::text)::bigint
       where t.id_deportista = _dep.id and (_ej ? t.tecnica_id::text);
    end if;
  end if;

  update deportista set id_entrenador = _e.para where id = _dep.id;

  update envio_entrenador
     set estado = 'aceptado', contestado_en = now(),
         resultado = jsonb_build_object('deportista', _dep.id)
                     || case when _mapa <> '{}'::jsonb then jsonb_build_object('tests', _mapa) else '{}'::jsonb end
                     || case when jsonb_array_length(_ids) > 0 then jsonb_build_object('clasificaciones', _ids) else '{}'::jsonb end
                     || case when _ej <> '{}'::jsonb then jsonb_build_object('ejercicios', _ej) else '{}'::jsonb end
   where id = _id;
  return jsonb_build_object('estado', 'aceptado', 'deportista', _dep.id);
end $$;


revoke all on function public.envio_copiar_ejercicios(uuid, envio_entrenador) from public, anon, authenticated;
revoke all on function public.envio_hacer_traspaso(bigint) from public, anon, authenticated;

revoke all on function public.pedir_traspaso(uuid, bigint, boolean, text) from public;
revoke execute on function public.pedir_traspaso(uuid, bigint, boolean, text) from anon;
grant execute on function public.pedir_traspaso(uuid, bigint, boolean, text) to authenticated;

/* 3. DESPUÉS */
select pg_temp.contar('despues');

do $ensayo$
declare
  _x _actores%rowtype;
  _r text; _id bigint; _id_f bigint; _id_v bigint; _mapa jsonb; _c1 bigint; _c2 bigint; _c3 bigint; _nb int; _nb2 int;
begin
  select * into _x from _actores;
  perform pg_temp.dice('   Protagonistas: A ' || (_x.a is not null) || ', B ' || (_x.b is not null) || ', M con cuenta ' || (_x.mu is not null)
    || ', tarea de M ' || (_x.tarea is not null) || ', ejercicios montados ' || (_x.e1 is not null and _x.e2 is not null and _x.e3 is not null and _x.e4 is not null)
    || ', ficha F ' || (_x.f is not null));

  perform pg_temp.dice('3. Para todos igual: ' || (
    select case when count(*) = 0 then 'lo mismo en las 5 tablas para las ' || (select count(*) from perfiles) || ' personas'
                else count(*) || ' DIFERENCIAS: ' || string_agg(distinct x.tabla, ', ') end
      from _cuentas x join _cuentas y on y.quien = x.quien and y.tabla = x.tabla and y.cuando = 'despues'
     where x.cuando = 'antes' and x.n <> y.n));
  perform pg_temp.dice('3. Antes de pasarlo, B lee los ejercicios de A: ' || pg_temp.ve(_x.b, format('select count(*)::int from ejercicios_biblioteca where id in (%s, %s, %s)', _x.e1, _x.e2, _x.e3))
    || ' de 3 (los lee M, que es de A: ' || pg_temp.ve(_x.mu, format('select count(*)::int from ejercicios_biblioteca where id in (%s, %s, %s)', _x.e1, _x.e2, _x.e3)) || ')');

  /* ── Pedirlo con lo suyo ── */
  _r := pg_temp.hacer(_x.a, format('select pedir_traspaso(%L, %s, true)::text', _x.b, _x.m));
  if _r ~ '^[0-9]+$' then _id := _r::bigint; end if;
  perform pg_temp.dice('4a. A pide pasar a M a B, con lo suyo: ' || case when _id is null then _r else 'ENTRA' end);
  perform pg_temp.dice('4a. … lleva ' || coalesce((select jsonb_array_length(contenido->'ejercicios') from envio_entrenador where id = _id), -1)
    || ' ejercicios (3 esperados): el de fuerza ' || coalesce((select exists (select 1 from jsonb_array_elements(contenido->'ejercicios') e where (e->>'id')::bigint = _x.e1) from envio_entrenador where id = _id)::text, '?')
    || ', la técnica ' || coalesce((select exists (select 1 from jsonb_array_elements(contenido->'ejercicios') e where (e->>'id')::bigint = _x.e2) from envio_entrenador where id = _id)::text, '?')
    || ', el encadenado ' || coalesce((select exists (select 1 from jsonb_array_elements(contenido->'ejercicios') e where (e->>'id')::bigint = _x.e3) from envio_entrenador where id = _id)::text, '?')
    || ', el que no usa ' || coalesce((select exists (select 1 from jsonb_array_elements(contenido->'ejercicios') e where (e->>'id')::bigint = _x.e4) from envio_entrenador where id = _id)::text, '?')
    || '; con su vídeo ' || coalesce((select (e->>'url_video') = 'https://ejemplo.invalid/v1' from envio_entrenador, jsonb_array_elements(contenido->'ejercicios') e where id = _id and (e->>'id')::bigint = _x.e1)::text, '?')
    || '; sin dueño en la foto ' || coalesce((select bool_and(not (e ? 'id_entrenador') and not (e ? 'origen_id')) from envio_entrenador, jsonb_array_elements(contenido->'ejercicios') e where id = _id)::text, '?'));

  /* ── Contestan los dos ── */
  perform pg_temp.hacer(_x.mu, format('select contestar_traspaso_deportista(%s, true)::text', coalesce(_id, -1)));
  _nb := (select count(*) from ejercicios_biblioteca where id_entrenador = _x.b);
  _r := pg_temp.hacer(_x.b, format('select contestar_envio(%s, true)::text', coalesce(_id, -1)));
  perform pg_temp.dice('4b. M acepta y luego B: ' || coalesce(pg_temp.j(_r)->>'estado', _r) || '; M es de B: ' || ((select id_entrenador from deportista where id = _x.m) = _x.b));

  _mapa := (select resultado->'ejercicios' from envio_entrenador where id = _id);
  _c1 := (_mapa->>_x.e1::text)::bigint; _c2 := (_mapa->>_x.e2::text)::bigint; _c3 := (_mapa->>_x.e3::text)::bigint;
  perform pg_temp.dice('4c. Las copias: ' || coalesce((select count(*) from jsonb_object_keys(coalesce(_mapa, '{}'::jsonb)))::text, '0')
    || ' en el resultado, ' || ((select count(*) from ejercicios_biblioteca where id_entrenador = _x.b) - _nb) || ' nuevas en la biblioteca de B'
    || '; todas de B y sin origen: ' || coalesce((select bool_and(id_entrenador = _x.b and id_deportista is null and origen_id is null) from ejercicios_biblioteca where id in (_c1, _c2, _c3))::text, '?')
    || '; la de fuerza se llama «' || coalesce((select nombre from ejercicios_biblioteca where id = _c1), '?') || '»'
    || ', la técnica «' || coalesce((select nombre from ejercicios_biblioteca where id = _c2), '?') || '»'
    || '; con su vídeo y sus etiquetas: ' || coalesce((select url_video = 'https://ejemplo.invalid/v1' and descripcion = 'De ensayo' and tipo = '{fuerza}' from ejercicios_biblioteca where id = _c1)::text, '?')
    || ' / ' || coalesce((select url_video = 'https://ejemplo.invalid/v2' and disciplina = '{Carrera}' from ejercicios_biblioteca where id = _c2)::text, '?'));
  perform pg_temp.dice('4d. Las sesiones de M, a las copias: el ejercicio ' || coalesce(((select ejercicio_id from ejercicios where id = _x.ej) = _c1)::text, '?')
    || ', su encadenado ' || coalesce(((select ejercicio_encadenado_id from ejercicios where id = _x.ej) = _c3)::text, '?')
    || ', la técnica ' || coalesce(((select tecnica_id from tarea where id = _x.tarea) = _c2)::text, '?')
    || '; el nombre congelado sigue: ' || ((select nombre from ejercicios where id = _x.ej) = 'Ensayo: sentadilla'));
  perform pg_temp.dice('4e. Quién las lee: B ' || pg_temp.ve(_x.b, format('select count(*)::int from ejercicios_biblioteca where id in (%s, %s, %s)', coalesce(_c1, -1), coalesce(_c2, -1), coalesce(_c3, -1)))
    || ' de 3, M ' || pg_temp.ve(_x.mu, format('select count(*)::int from ejercicios_biblioteca where id in (%s, %s, %s)', coalesce(_c1, -1), coalesce(_c2, -1), coalesce(_c3, -1)))
    || ' de 3, A ' || pg_temp.ve(_x.a, format('select count(*)::int from ejercicios_biblioteca where id in (%s, %s, %s)', coalesce(_c1, -1), coalesce(_c2, -1), coalesce(_c3, -1)))
    || '; B ve la sesión de M con su ejercicio: ' || pg_temp.ve(_x.b, format('select count(*)::int from ejercicios where id = %s', _x.ej))
    || '; lo de A, sin tocar: ' || ((select count(*) from ejercicios_biblioteca where id in (_x.e1, _x.e2, _x.e3, _x.e4) and id_entrenador = _x.a) = 4)
    || ' y el vídeo de A, el mismo: ' || ((select url_video from ejercicios_biblioteca where id = _x.e1) = 'https://ejemplo.invalid/v1'));

  /* ── Otro traspaso de A a B con los mismos ejercicios: se reusan ── */
  _r := pg_temp.hacer(_x.a, format('select pedir_traspaso(%L, %s, true)::text', _x.b, _x.f));
  if _r ~ '^[0-9]+$' then _id_f := _r::bigint; end if;
  /* La ficha no usa nada: se le pone la foto del primero, como si los usara. */
  update envio_entrenador e set contenido = jsonb_set(e.contenido, '{ejercicios}', (select contenido->'ejercicios' from envio_entrenador where id = _id))
   where e.id = _id_f;
  _nb2 := (select count(*) from ejercicios_biblioteca where id_entrenador = _x.b);
  _r := pg_temp.hacer(_x.b, format('select contestar_envio(%s, true)::text', coalesce(_id_f, -1)));
  perform pg_temp.dice('4f. Otro traspaso de A a B con los mismos: ' || coalesce(pg_temp.j(_r)->>'estado', _r)
    || '; se reusan las copias: ' || coalesce(((select resultado->'ejercicios' from envio_entrenador where id = _id_f) = _mapa)::text, '?')
    || '; nuevas en la biblioteca de B: ' || ((select count(*) from ejercicios_biblioteca where id_entrenador = _x.b) - _nb2));

  /* ── Sin la casilla no viaja nada ── */
  _r := pg_temp.hacer(_x.b, format('select pedir_traspaso(%L, %s, false)::text', _x.a, _x.m));
  if _r ~ '^[0-9]+$' then _id_v := _r::bigint; end if;
  perform pg_temp.hacer(_x.a, format('select contestar_envio(%s, true)::text', coalesce(_id_v, -1)));
  _r := pg_temp.hacer(_x.mu, format('select contestar_traspaso_deportista(%s, true)::text', coalesce(_id_v, -1)));
  perform pg_temp.dice('4g. B se lo devuelve a A sin la casilla: ' || coalesce(pg_temp.j(_r)->>'estado', _r)
    || '; la foto no lleva ejercicios: ' || coalesce(((select contenido->'ejercicios' from envio_entrenador where id = _id_v) = '[]'::jsonb)::text, '?')
    || '; ni el resultado: ' || coalesce((not ((select resultado from envio_entrenador where id = _id_v) ? 'ejercicios'))::text, '?')
    || '; la sesión sigue en la copia de B: ' || coalesce(((select ejercicio_id from ejercicios where id = _x.ej) = _c1)::text, '?'));

  /* ── Las puertas de siempre ── */
  perform pg_temp.dice('4h. Sin entrar (anon): ' || pg_temp.como(null, format('select pedir_traspaso(%L, %s)', _x.b, _x.m))
    || '; el ayudante, desde fuera: ' || pg_temp.como(_x.b, format('select envio_copiar_ejercicios(%L, e) from envio_entrenador e where id = %s', _x.b, coalesce(_id, -1))));
end $ensayo$;

/* El informe: un error a propósito que lo trae y deshace todo. */
do $fin$
begin
  raise exception 'INFORME:%', (select E'\n' || string_agg(linea, E'\n' order by orden) from _informe);
end $fin$;
