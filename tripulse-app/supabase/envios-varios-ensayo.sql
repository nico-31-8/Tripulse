/* ============================================================
   ENSAYO de envios-varios.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: los cambios de la migración, los envíos y las copias de prueba.

   Los protagonistas se eligen solos con lo que hay en la base (no lleva ids
   escritos: el repositorio es público), como en envios-entrenadores-ensayo:
   A manda (con unas zonas propias colgadas de un test suyo), B recibe (un
   entrenador normal, sin plataforma_admin, que no trabaja con A en una
   dirección), C es un tercero y D un deportista.

   1. CONTROL: el tipo «varios» todavía no se admite, y lo que cada uno ve hoy.
   2. La migración, con las mismas sentencias que el fichero.
   3. Lo que ven después (tiene que ser lo mismo) y los ayudantes cerrados.
   4. Los envíos de un solo tipo, OTRA VEZ, porque aceptar se ha reescrito:
      zonas (con su test), plantilla (con nombre repetido) y el test suelto
      que ya tiene (no se duplica).
   5. «Varios»: lo que se guarda, aceptar todo junto (copias, nombres, el test
      que ya tenía, las zonas enganchadas a él), lo que no se deja, rechazar y
      cancelar, y quién ve qué.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (a uuid, b uuid, c uuid, d uuid, clasif bigint, test_suelto bigint, correo_a text, correo_b text);
create temp table _cuentas (cuando text, quien text, tabla text, n int);

create function pg_temp.dice(_t text) returns void language sql as $f$
  insert into _informe (linea) values (_t)
$f$;

/* Ejecuta como esa persona y lo DESHACE: ENTRA, o el código y el texto del error. */
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

/* Ejecuta como esa persona y lo DEJA hecho (dentro del ensayo). */
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

/* Lo que ve una persona de una consulta que cuenta. */
create function pg_temp.ve(_quien uuid, _sql text) returns int language plpgsql as $f$
declare _n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute _sql into _n;
  perform set_config('role', 'postgres', true);
  return _n;
end $f$;

/* La respuesta como JSON, o null si es un error. */
create function pg_temp.j(_r text) returns jsonb language plpgsql as $f$
begin
  return _r::jsonb;
exception when others then
  return null;
end $f$;

create function pg_temp.contar(_cuando text) returns void language plpgsql as $f$
declare _p record; _t text;
begin
  for _p in select 'A' as q, a as u from _actores union all select 'B', b from _actores
            union all select 'C', c from _actores union all select 'D', d from _actores loop
    continue when _p.u is null;
    foreach _t in array array['test_definicion', 'test_medicion', 'zona_clasificacion', 'zona_entrenador', 'plantilla_sesion', 'envio_entrenador'] loop
      insert into _cuentas (cuando, quien, tabla, n)
      values (_cuando, _p.q, _t, pg_temp.ve(_p.u, 'select count(*)::int from ' || _t));
    end loop;
  end loop;
end $f$;

insert into _actores (a, clasif)
select c.id_entrenador, c.id
  from zona_clasificacion c
  join perfiles p on p.id = c.id_entrenador and p.rol = 'entrenador'
 where not c.archivada
   and exists (select 1 from jsonb_array_elements_text(c.hitos) h where h ~ '^propia:[0-9]+:[0-9]+$')
   and exists (select 1 from zona_entrenador z where z.id_clasificacion = c.id and not z.archivada)
   and not exists (select 1 from jsonb_array_elements_text(c.hitos) h
                    where h ~ '^propia:[0-9]+:[0-9]+$'
                      and not exists (select 1 from test_definicion t
                                       where t.id = split_part(h, ':', 2)::bigint and t.id_entrenador = c.id_entrenador))
 order by c.id
 limit 1;

update _actores set test_suelto = (
  select split_part(h, ':', 2)::bigint
    from zona_clasificacion c, jsonb_array_elements_text(c.hitos) h
   where c.id = _actores.clasif and h ~ '^propia:[0-9]+:[0-9]+$'
   limit 1);

update _actores set b = (
  select p.id from perfiles p
   where p.rol = 'entrenador' and p.id <> _actores.a and p.email is not null
     and not exists (select 1 from plataforma_admin x where x.id_perfil = p.id)
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

update _actores set d = (select p.id from perfiles p where p.rol = 'deportista' order by p.created_at limit 1);
update _actores set correo_a = (select email from perfiles where id = _actores.a),
                    correo_b = (select email from perfiles where id = _actores.b);

/* 1. CONTROL */
select pg_temp.dice('1. Antes: el tipo «varios» ' ||
  case when pg_get_constraintdef((select oid from pg_constraint where conname = 'envio_entrenador_tipo')) like '%varios%'
       then '¡YA SE ADMITE!' else 'no se admite todavía (bien)' end
  || '; envíos guardados: ' || (select count(*) from envio_entrenador));
select pg_temp.contar('antes');

/* 2. LA MIGRACIÓN, tal cual el fichero */
/* ============================================================
   TRIPULSE — Envíos entre entrenadores: varias cosas a la vez
   ============================================================

   Pedido del usuario el 23-10-2026, después de subir la fase 1
   (envios-entrenadores.sql): poder mandar más de una cosa en un mismo envío,
   por ejemplo un test y las zonas que salen de él. Decidido con él: a quien
   lo recibe le llega UN envío con todo, y aceptarlo crea todas las copias
   juntas, en un solo paso (o todo o nada). No se eligen partes: unas zonas
   sin su test no funcionarían.

   · Un tipo de envío nuevo, «varios». Su contenido lleva tres listas:
     plantillas, tests y clasificaciones (cada una con sus zonas). Los tests
     de los que salen unas zonas se añaden solos, como en un envío de zonas,
     y un test que va por las dos vías viaja una sola vez.
   · enviar_varios_a_entrenador lo arma, con las mismas reglas que
     enviar_a_entrenador: solo lo tuyo, la plantilla se limpia, como mucho 30
     cosas.
   · contestar_envio se reescribe para aceptar también los «varios». Copiar
     los tests, una plantilla y unas zonas pasan a ayudantes que usan los dos
     caminos, para que un envío suelto y uno de varios copien exactamente
     igual. enviar_a_entrenador se reescribe por lo mismo: la foto de unas
     zonas y las comprobaciones del destino viven en un solo sitio.
   · Los nombres al aceptar unos «varios», si quien acepta los cambia:
       {"plantillas": {"<posición>": "..."}, "clasificaciones": {"<posición>": "..."},
        "tests": {"<id del original>": "..."}}
     (la posición empieza en 0, en el orden en que vienen).

   No cambia nada de lo que ya funciona: los envíos de un solo tipo siguen
   igual (el ensayo los vuelve a probar) y no se toca ninguna otra tabla.
   ============================================================ */

alter table public.envio_entrenador drop constraint if exists envio_entrenador_tipo;
alter table public.envio_entrenador add constraint envio_entrenador_tipo
  check (tipo in ('plantilla', 'test', 'zonas', 'varios'));


/* ············································
   Ayudantes nuevos (solo los usan las funciones de los envíos)
   ············································ */

/* Quien manda y a quién: las comprobaciones de los dos caminos de enviar. */
create or replace function public.envio_destino(_yo uuid, _para uuid, _men text)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  _yo_nombre   text;
  _para_nombre text;
  _para_correo text;
begin
  select nombre into _yo_nombre from perfiles where id = _yo and rol = 'entrenador';
  if not found then
    raise exception 'Solo un entrenador puede enviar';
  end if;
  if _para is null or _para = _yo then
    raise exception 'Elige a otro entrenador';
  end if;
  select nombre, lower(email) into _para_nombre, _para_correo
    from perfiles where id = _para and rol = 'entrenador';
  if not found then
    raise exception 'Esa cuenta no es de un entrenador';
  end if;
  if _men is not null and char_length(_men) > 500 then
    raise exception 'El mensaje es demasiado largo: 500 letras como mucho';
  end if;
  /* Un tope por día, para que nadie pueda llenarle la bandeja a otro. */
  if (select count(*) from envio_entrenador where de = _yo and creado_en > now() - interval '1 day') >= 100 then
    raise exception 'Hoy ya has hecho muchos envíos. Prueba mañana.';
  end if;
  return jsonb_build_object('yo_nombre', _yo_nombre, 'para_nombre', _para_nombre, 'para_correo', _para_correo);
end $$;

/* La foto de unos tests, tal como viajan (sin su dueño). */
create or replace function public.envio_fotos_tests(_ids bigint[])
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'nombre', t.nombre, 'deporte', t.deporte,
           'campos', t.campos, 'resultados', t.resultados, 'modelo', t.modelo) order by t.id), '[]'::jsonb)
    from test_definicion t
   where t.id = any(coalesce(_ids, '{}'::bigint[]))
$$;

/* La foto de una clasificación tuya con sus zonas, y los tests de los que
   salen (sus hitos, los límites de cada zona y las columnas de antes, que
   aún usan las zonas de un hito). Esos tests también tienen que ser tuyos. */
create or replace function public.envio_foto_clasificacion(_yo uuid, _id bigint)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  _c     zona_clasificacion%rowtype;
  _zonas jsonb;
  _tests bigint[];
begin
  select * into _c from zona_clasificacion where id = _id and id_entrenador = _yo and not archivada;
  if not found then
    raise exception 'Esas zonas no son tuyas, o están archivadas';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'sigla', z.sigla, 'nombre', z.nombre, 'pct_min', z.pct_min, 'pct_max', z.pct_max,
           'rpe_min', z.rpe_min, 'rpe_max', z.rpe_max, 'color', z.color, 'orden', z.orden,
           'deporte', z.deporte, 'ref_definicion', z.ref_definicion, 'ref_indice', z.ref_indice,
           'desde', z.desde, 'hasta', z.hasta) order by z.orden, z.id), '[]'::jsonb)
    into _zonas
    from zona_entrenador z
   where z.id_clasificacion = _c.id and z.id_entrenador = _yo and not z.archivada;
  if jsonb_array_length(_zonas) = 0 then
    raise exception 'Las zonas «%» todavía no tienen ninguna zona', _c.nombre;
  end if;
  select coalesce(array_agg(distinct x), '{}'::bigint[]) into _tests from (
    select (regexp_match(h, '^propia:([0-9]+):[0-9]+$'))[1]::bigint as x
      from jsonb_array_elements_text(_c.hitos) h
    union all
    select (regexp_match(z->'desde'->>'ref', '^propia:([0-9]+):[0-9]+$'))[1]::bigint
      from jsonb_array_elements(_zonas) z
    union all
    select (regexp_match(z->'hasta'->>'ref', '^propia:([0-9]+):[0-9]+$'))[1]::bigint
      from jsonb_array_elements(_zonas) z
    union all
    select (z->>'ref_definicion')::bigint
      from jsonb_array_elements(_zonas) z
  ) s where x is not null;
  if exists (select 1 from unnest(_tests) i
              where not exists (select 1 from test_definicion t where t.id = i and t.id_entrenador = _yo)) then
    raise exception 'Las zonas «%» salen de un test que no es tuyo: solo se mandan las que salen de tus tests o de los de la app', _c.nombre;
  end if;
  return jsonb_build_object(
    'clasificacion', jsonb_build_object('nombre', _c.nombre, 'deporte', _c.deporte, 'hitos', _c.hitos),
    'zonas', _zonas,
    'tests', to_jsonb(_tests));
end $$;

/* Copia los tests de un envío para quien acepta. Uno que ya le llegó en otro
   envío del mismo entrenador, sin archivar y sin cambios, no se duplica: se
   usa esa copia (se compara sin el nombre, que pudo cambiarlo al aceptarlo).
   En un test del laboratorio el nombre vive también dentro de su modelo, y es
   el que se enseña: se cambian los dos. `_nombres`: {"<id original>": "..."}.
   Devuelve {mapa: {"<id original>": id de la copia}, reusados: [ids]}. */
create or replace function public.envio_copiar_tests(_yo uuid, _e public.envio_entrenador, _nombres jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  _mapa     jsonb := '{}'::jsonb;
  _reusados jsonb := '[]'::jsonb;
  _n        jsonb := case when jsonb_typeof(_nombres) = 'object' then _nombres else '{}'::jsonb end;
  _t        jsonb;
  _modelo   jsonb;
  _nombre   text;
  _previa   bigint;
  _nuevo    bigint;
begin
  for _t in select value from jsonb_array_elements(coalesce(_e.contenido->'tests', '[]'::jsonb)) loop
    _modelo := case when jsonb_typeof(_t->'modelo') = 'object' then _t->'modelo' else null end;
    _previa := null;
    select t.id into _previa
      from envio_entrenador p
      join test_definicion t on t.id = (p.resultado->'tests'->>(_t->>'id'))::bigint
     where p.para = _yo and p.de = _e.de and p.estado = 'aceptado' and p.id <> _e.id
       and t.id_entrenador = _yo and not t.archivado
       and t.deporte = _t->>'deporte'
       and t.campos = coalesce(_t->'campos', '[]'::jsonb)
       and t.resultados = coalesce(_t->'resultados', '[]'::jsonb)
       and (t.modelo - 'nombre') is not distinct from (_modelo - 'nombre')
     order by p.contestado_en desc nulls last
     limit 1;

    if _previa is not null then
      _nuevo := _previa;
      _reusados := _reusados || to_jsonb(_previa);
    else
      _nombre := public.envio_nombre_libre(
        coalesce(nullif(btrim(_n->>(_t->>'id')), ''), _t->>'nombre'),
        array(select nombre from test_definicion where id_entrenador = _yo and not archivado),
        _e.de_nombre);
      insert into test_definicion (id_entrenador, nombre, deporte, campos, resultados, modelo)
      values (_yo, _nombre, coalesce(_t->>'deporte', 'Carrera'),
              coalesce(_t->'campos', '[]'::jsonb), coalesce(_t->'resultados', '[]'::jsonb),
              case when _modelo is not null and _modelo ? 'nombre'
                   then jsonb_set(_modelo, '{nombre}', to_jsonb(_nombre)) else _modelo end)
      returning id into _nuevo;
    end if;
    _mapa := _mapa || jsonb_build_object(_t->>'id', _nuevo);
  end loop;
  return jsonb_build_object('mapa', _mapa, 'reusados', _reusados);
end $$;

/* Copia una plantilla para quien acepta, con un nombre que no tenga ya en esa
   disciplina. */
create or replace function public.envio_copiar_plantilla(_yo uuid, _p jsonb, _nombre text, _de text)
returns bigint language plpgsql set search_path = public as $$
declare _nuevo bigint;
begin
  insert into plantilla_sesion (id_entrenador, nombre, disciplina, zona, objetivo, bloques)
  values (_yo,
          public.envio_nombre_libre(
            coalesce(nullif(btrim(_nombre), ''), _p->>'nombre'),
            array(select nombre from plantilla_sesion where id_entrenador = _yo and disciplina = _p->>'disciplina'),
            _de),
          _p->>'disciplina', _p->>'zona', _p->>'objetivo', _p->'bloques')
  returning id into _nuevo;
  return _nuevo;
end $$;

/* Copia unas zonas (su clasificación y sus zonas) para quien acepta,
   enganchadas a SUS copias de los tests (_mapa: id original → id copia). */
create or replace function public.envio_copiar_clasificacion(_yo uuid, _c jsonb, _zonas jsonb, _mapa jsonb, _nombre text, _de text)
returns bigint language plpgsql set search_path = public as $$
declare
  _nuevo bigint;
  _z     jsonb;
begin
  if exists (select 1 from jsonb_array_elements(coalesce(_zonas, '[]'::jsonb)) z
              where z->>'ref_definicion' is not null and (_mapa ->> (z->>'ref_definicion')) is null) then
    raise exception 'Falta el test del que salen estas zonas';
  end if;
  insert into zona_clasificacion (id_entrenador, nombre, deporte, hitos, orden)
  values (_yo,
          public.envio_nombre_libre(
            coalesce(nullif(btrim(_nombre), ''), _c->>'nombre'),
            array(select nombre from zona_clasificacion where id_entrenador = _yo and not archivada),
            _de),
          coalesce(_c->>'deporte', 'Carrera'),
          (select coalesce(jsonb_agg(to_jsonb(public.envio_ref(h, _mapa)) order by o), '[]'::jsonb)
             from jsonb_array_elements_text(coalesce(_c->'hitos', '[]'::jsonb)) with ordinality as x(h, o)),
          (select coalesce(max(orden), -1) + 1 from zona_clasificacion where id_entrenador = _yo))
  returning id into _nuevo;

  for _z in select value from jsonb_array_elements(coalesce(_zonas, '[]'::jsonb)) loop
    insert into zona_entrenador (id_entrenador, id_clasificacion, sigla, nombre, pct_min, pct_max,
                                 rpe_min, rpe_max, color, orden, deporte, ref_definicion, ref_indice,
                                 desde, hasta)
    values (_yo, _nuevo, _z->>'sigla', _z->>'nombre',
            (_z->>'pct_min')::numeric, (_z->>'pct_max')::numeric,
            (_z->>'rpe_min')::numeric, (_z->>'rpe_max')::numeric,
            coalesce(_z->>'color', '#a78bfa'), coalesce((_z->>'orden')::int, 0),
            coalesce(_z->>'deporte', _c->>'deporte', 'Carrera'),
            (_mapa ->> (_z->>'ref_definicion'))::bigint, (_z->>'ref_indice')::int,
            public.envio_limite(_z->'desde', _mapa), public.envio_limite(_z->'hasta', _mapa));
  end loop;
  return _nuevo;
end $$;

revoke all on function public.envio_destino(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.envio_fotos_tests(bigint[]) from public, anon, authenticated;
revoke all on function public.envio_foto_clasificacion(uuid, bigint) from public, anon, authenticated;
revoke all on function public.envio_copiar_tests(uuid, public.envio_entrenador, jsonb) from public, anon, authenticated;
revoke all on function public.envio_copiar_plantilla(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.envio_copiar_clasificacion(uuid, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;


/* ············································
   Enviar una cosa (la de la fase 1, con los ayudantes)
   ············································ */
create or replace function public.enviar_a_entrenador(
  _para uuid, _tipo text, _id bigint default null, _plantilla jsonb default null, _mensaje text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  _yo        uuid := auth.uid();
  _men       text := nullif(btrim(coalesce(_mensaje, '')), '');
  _d         jsonb;
  _contenido jsonb;
  _titulo    text;
  _foto      jsonb;
  _nuevo     bigint;
begin
  _d := public.envio_destino(_yo, _para, _men);

  if _tipo = 'plantilla' then
    _contenido := public.envio_plantilla_limpia(_plantilla);
    _titulo := _contenido->>'nombre';

  elsif _tipo = 'test' then
    if not exists (select 1 from test_definicion where id = _id and id_entrenador = _yo and not archivado) then
      raise exception 'Ese test no es tuyo, o está archivado';
    end if;
    _contenido := jsonb_build_object('tests', public.envio_fotos_tests(array[_id]));
    _titulo := _contenido->'tests'->0->>'nombre';

  elsif _tipo = 'zonas' then
    _foto := public.envio_foto_clasificacion(_yo, _id);
    _contenido := jsonb_build_object(
      'clasificacion', _foto->'clasificacion',
      'zonas', _foto->'zonas',
      'tests', public.envio_fotos_tests(array(select jsonb_array_elements_text(_foto->'tests')::bigint)));
    _titulo := _foto->'clasificacion'->>'nombre';

  else
    raise exception 'Eso no se puede enviar';
  end if;

  insert into envio_entrenador (de, para, tipo, titulo, contenido, mensaje, de_nombre, para_nombre, para_correo)
  values (_yo, _para, _tipo, left(btrim(_titulo), 120), _contenido, _men,
          _d->>'yo_nombre', _d->>'para_nombre', _d->>'para_correo')
  returning id into _nuevo;
  return _nuevo;
end $$;


/* ············································
   Enviar varias cosas en un solo envío
   ············································ */
create or replace function public.enviar_varios_a_entrenador(
  _para uuid,
  _plantillas jsonb default '[]'::jsonb,
  _tests bigint[] default '{}'::bigint[],
  _clasificaciones bigint[] default '{}'::bigint[],
  _mensaje text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  _yo      uuid := auth.uid();
  _men     text := nullif(btrim(coalesce(_mensaje, '')), '');
  _pls_in  jsonb := coalesce(_plantillas, '[]'::jsonb);
  _d       jsonb;
  _pls     jsonb := '[]'::jsonb;
  _cls     jsonb := '[]'::jsonb;
  _ts      bigint[] := '{}'::bigint[];
  _p       jsonb;
  _foto    jsonb;
  _id      bigint;
  _total   int;
  _titulo  text;
  _nuevo   bigint;
begin
  _d := public.envio_destino(_yo, _para, _men);
  if jsonb_typeof(_pls_in) <> 'array' then
    raise exception 'Las plantillas no se entienden';
  end if;
  _total := jsonb_array_length(_pls_in) + coalesce(cardinality(_tests), 0) + coalesce(cardinality(_clasificaciones), 0);
  if _total = 0 then
    raise exception 'Elige al menos una cosa que mandar';
  end if;
  if _total > 30 then
    raise exception 'Como mucho 30 cosas en un mismo envío';
  end if;

  /* Los tests elegidos: tuyos y sin archivar. */
  for _id in select distinct x from unnest(coalesce(_tests, '{}'::bigint[])) x loop
    if not exists (select 1 from test_definicion where id = _id and id_entrenador = _yo and not archivado) then
      raise exception 'Uno de los tests no es tuyo, o está archivado';
    end if;
    _ts := _ts || _id;
  end loop;

  /* Las zonas, cada una con su foto; los tests de los que salen se suman. */
  for _id in select distinct x from unnest(coalesce(_clasificaciones, '{}'::bigint[])) x loop
    _foto := public.envio_foto_clasificacion(_yo, _id);
    _cls := _cls || jsonb_build_array(jsonb_build_object('clasificacion', _foto->'clasificacion', 'zonas', _foto->'zonas'));
    _ts := _ts || array(select jsonb_array_elements_text(_foto->'tests')::bigint);
  end loop;

  /* Las plantillas, limpias como las de un envío suelto. */
  for _p in select value from jsonb_array_elements(_pls_in) loop
    _pls := _pls || jsonb_build_array(public.envio_plantilla_limpia(_p));
  end loop;

  /* Un test que va por las dos vías (elegido y del que salen unas zonas), una vez. */
  _ts := array(select distinct x from unnest(_ts) x order by 1);

  /* El título: los nombres, en el orden en que se aceptan. */
  _titulo := array_to_string(
    array(select nombre from test_definicion where id = any(_ts) order by id)
    || array(select c->'clasificacion'->>'nombre' from jsonb_array_elements(_cls) c)
    || array(select p->>'nombre' from jsonb_array_elements(_pls) p),
    ' · ');
  if char_length(_titulo) > 120 then
    _titulo := left(_titulo, 119) || '…';
  end if;

  insert into envio_entrenador (de, para, tipo, titulo, contenido, mensaje, de_nombre, para_nombre, para_correo)
  values (_yo, _para, 'varios', _titulo,
          jsonb_build_object('tests', public.envio_fotos_tests(_ts), 'clasificaciones', _cls, 'plantillas', _pls),
          _men, _d->>'yo_nombre', _d->>'para_nombre', _d->>'para_correo')
  returning id into _nuevo;
  return _nuevo;
end $$;


/* ············································
   Contestar: aceptar (crea las copias) o rechazar. Ahora también «varios».
   ············································
   Devuelve {estado} y, si acepta, lo creado: {plantilla} / {clasificacion}
   en uno suelto, {plantillas: [...], clasificaciones: [...]} en unos varios,
   {tests: {original: copia}} y {reusados: [ids]}, los tests que ya tenía. */
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
    update envio_entrenador set estado = 'rechazado', contestado_en = now() where id = _id;
    return jsonb_build_object('estado', 'rechazado');
  end if;

  if not exists (select 1 from perfiles where id = _yo and rol = 'entrenador') then
    raise exception 'Solo un entrenador puede aceptarlo';
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


revoke all on function public.enviar_varios_a_entrenador(uuid, jsonb, bigint[], bigint[], text) from public;
revoke execute on function public.enviar_varios_a_entrenador(uuid, jsonb, bigint[], bigint[], text) from anon;
grant execute on function public.enviar_varios_a_entrenador(uuid, jsonb, bigint[], bigint[], text) to authenticated;

/* Las dos que se reescriben conservan sus permisos (create or replace no los
   toca), pero se repiten por si acaso: cerradas a anon, abiertas a quien ha
   entrado. */
revoke all on function public.enviar_a_entrenador(uuid, text, bigint, jsonb, text) from public;
revoke execute on function public.enviar_a_entrenador(uuid, text, bigint, jsonb, text) from anon;
grant execute on function public.enviar_a_entrenador(uuid, text, bigint, jsonb, text) to authenticated;
revoke all on function public.contestar_envio(bigint, boolean, jsonb) from public;
revoke execute on function public.contestar_envio(bigint, boolean, jsonb) from anon;
grant execute on function public.contestar_envio(bigint, boolean, jsonb) to authenticated;

/* 3. DESPUÉS */
select pg_temp.contar('despues');

do $ensayo$
declare
  _a uuid; _b uuid; _c uuid; _d uuid; _clasif bigint; _test bigint; _correo_b text;
  _r text; _j jsonb; _res jsonb; _pl jsonb; _malo jsonb; _quien text; _base text;
  _id_z bigint; _id_pl bigint; _id_t bigint; _id_v bigint; _id_rech bigint; _id_canc bigint;
  _copia_test bigint; _clas1 bigint; _clas2 bigint; _n_tests_b int; _n_pl_b int;
begin
  select a, b, c, d, clasif, test_suelto, correo_b into _a, _b, _c, _d, _clasif, _test, _correo_b from _actores;
  _quien := coalesce(left(nullif(split_part(btrim(coalesce((select nombre from perfiles where id = _a), '')), ' ', 1), ''), 12), 'copia');
  perform pg_temp.dice('   Protagonistas: A ' || (_a is not null) || ', B ' || (_b is not null) || ', C ' || (_c is not null)
    || ', D ' || (_d is not null) || ', zonas de A con test ' || (_clasif is not null) || ', test ' || (_test is not null));

  perform pg_temp.dice('3. Para los demás no cambia nada: ' || (
    select case when count(*) = 0 then 'lo mismo en las 6 tablas para A, B, C y D'
                else count(*) || ' DIFERENCIAS' end
      from _cuentas x join _cuentas y on y.quien = x.quien and y.tabla = x.tabla and y.cuando = 'despues'
     where x.cuando = 'antes' and x.n <> y.n));
  perform pg_temp.dice('3. «varios» se admite: ' || (pg_get_constraintdef((select oid from pg_constraint where conname = 'envio_entrenador_tipo')) like '%varios%'));
  perform pg_temp.dice('3. Quien ha entrado ejecuta algún ayudante nuevo: ' || (
       has_function_privilege('authenticated', 'public.envio_destino(uuid,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.envio_fotos_tests(bigint[])', 'execute')
    or has_function_privilege('authenticated', 'public.envio_foto_clasificacion(uuid,bigint)', 'execute')
    or has_function_privilege('authenticated', 'public.envio_copiar_tests(uuid,public.envio_entrenador,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.envio_copiar_plantilla(uuid,jsonb,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.envio_copiar_clasificacion(uuid,jsonb,jsonb,jsonb,text,text)', 'execute'))
    || '; anon ejecuta enviar varios: ' || has_function_privilege('anon', 'public.enviar_varios_a_entrenador(uuid,jsonb,bigint[],bigint[],text)', 'execute')
    || '; quien ha entrado: ' || has_function_privilege('authenticated', 'public.enviar_varios_a_entrenador(uuid,jsonb,bigint[],bigint[],text)', 'execute')
    || '; anon ejecuta enviar/contestar: ' || (has_function_privilege('anon', 'public.enviar_a_entrenador(uuid,text,bigint,jsonb,text)', 'execute')
                                              or has_function_privilege('anon', 'public.contestar_envio(bigint,boolean,jsonb)', 'execute')));

  /* ── 4. Los de un solo tipo, otra vez ── */
  _r := pg_temp.hacer(_a, format('select enviar_a_entrenador(%L, %L, %s)::text', _b, 'zonas', _clasif));
  if _r ~ '^[0-9]+$' then _id_z := _r::bigint; end if;
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, true)::text', _id_z));
  _j := pg_temp.j(_r);
  _clas1 := (_j->>'clasificacion')::bigint;
  _copia_test := (_j->'tests'->>_test::text)::bigint;
  perform pg_temp.dice('4a. Zonas sueltas: ' || coalesce(_j->>'estado', _r)
    || '; clasificación de B con ' || (select count(*) from zona_entrenador where id_clasificacion = _clas1)
    || ' de ' || (select count(*) from zona_entrenador where id_clasificacion = _clasif and not archivada) || ' zonas'
    || '; todo enganchado a tests de B: ' || coalesce((
      select count(*) = 0 from zona_entrenador z where z.id_clasificacion = _clas1 and (
           (z.desde->>'ref' ~ '^propia:' and not exists (select 1 from test_definicion t where t.id = split_part(z.desde->>'ref', ':', 2)::bigint and t.id_entrenador = _b))
        or (z.hasta->>'ref' ~ '^propia:' and not exists (select 1 from test_definicion t where t.id = split_part(z.hasta->>'ref', ':', 2)::bigint and t.id_entrenador = _b))
        or (z.ref_definicion is not null and not exists (select 1 from test_definicion t where t.id = z.ref_definicion and t.id_entrenador = _b))))::text, '?')
    || ', y los hitos: ' || coalesce((select bool_and(exists (select 1 from test_definicion t where t.id = split_part(h, ':', 2)::bigint and t.id_entrenador = _b))
         from zona_clasificacion c, jsonb_array_elements_text(c.hitos) h where c.id = _clas1 and h ~ '^propia:')::text, 'no tiene'));

  _pl := jsonb_build_object('nombre', 'Ensayo 6 x 1000', 'disciplina', 'Carrera', 'zona', 'PAE', 'objetivo', 'Series largas',
    'bloques', jsonb_build_array(
      jsonb_build_object('zona', 'AEL', 'segundos', 900, 'hack', 'no llega'),
      jsonb_build_object('zona', 'PAE', 'series', 6, 'metros', 1000, 'descansoSeg', 120)));
  perform pg_temp.hacer(_b, format('insert into plantilla_sesion (id_entrenador, nombre, disciplina, zona, bloques) values (%L, %L, %L, %L, %L::jsonb) returning 1::text',
    _b, 'ensayo 6 X 1000', 'Carrera', 'PAE', '[{"zona": "PAE", "metros": 1000}]'));
  _r := pg_temp.hacer(_a, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb)::text', _b, 'plantilla', _pl));
  if _r ~ '^[0-9]+$' then _id_pl := _r::bigint; end if;
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, true)::text', _id_pl));
  _j := pg_temp.j(_r);
  perform pg_temp.dice('4b. Plantilla suelta: ' || coalesce(_j->>'estado', _r) || '; se llama «Ensayo 6 x 1000 (A)»: '
    || coalesce((select (nombre = 'Ensayo 6 x 1000 (' || _quien || ')')::text from plantilla_sesion where id = (_j->>'plantilla')::bigint), 'NO HAY')
    || '; sin la clave de más: ' || coalesce((select (not (bloques->0 ? 'hack'))::text from plantilla_sesion where id = (_j->>'plantilla')::bigint), 'NO HAY'));

  _n_tests_b := (select count(*) from test_definicion where id_entrenador = _b);
  _r := pg_temp.hacer(_a, format('select enviar_a_entrenador(%L, %L, %s)::text', _b, 'test', _test));
  if _r ~ '^[0-9]+$' then _id_t := _r::bigint; end if;
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, true)::text', _id_t));
  _j := pg_temp.j(_r);
  perform pg_temp.dice('4c. Test suelto que ya tenía: ' || coalesce(_j->>'estado', _r) || '; reusado: ' || coalesce((_j ? 'reusados')::text, '?')
    || ' (la misma copia: ' || coalesce(((_j->'tests'->>_test::text)::bigint = _copia_test)::text, '?')
    || '); tests nuevos: ' || ((select count(*) from test_definicion where id_entrenador = _b) - _n_tests_b));

  /* ── 5. Varios ── */
  _n_tests_b := (select count(*) from test_definicion where id_entrenador = _b);
  _n_pl_b := (select count(*) from plantilla_sesion where id_entrenador = _b);
  _r := pg_temp.hacer(_a, format('select enviar_varios_a_entrenador(%L, %L::jsonb, %L::bigint[], %L::bigint[], %L)::text',
    _b, jsonb_build_array(_pl, _pl), array[_test], array[_clasif], 'El test, sus zonas y dos plantillas'));
  perform pg_temp.dice('5a. A manda varios a B: ' || case when _r ~ '^[0-9]+$' then 'ENTRA' else _r end);
  if _r ~ '^[0-9]+$' then _id_v := _r::bigint; end if;
  perform pg_temp.dice('5a. … guardado: ' || coalesce((
    select 'tipo ' || tipo || ', ' || jsonb_array_length(contenido->'tests') || ' test (elegido y del que salen las zonas, una vez), '
        || jsonb_array_length(contenido->'clasificaciones') || ' clasificación con ' || jsonb_array_length(contenido->'clasificaciones'->0->'zonas') || ' zonas, '
        || jsonb_array_length(contenido->'plantillas') || ' plantillas limpias: ' || (not (contenido->'plantillas'->0->'bloques'->0 ? 'hack'))
        || '; el título lleva los nombres: ' || (titulo like '%' || (select nombre from test_definicion where id = _test) || '%'
                                             and titulo like '%' || (select nombre from zona_clasificacion where id = _clasif) || '%'
                                             and titulo like '%Ensayo 6 x 1000%')
      from envio_entrenador where id = _id_v), 'no hay fila'));
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, true, %L::jsonb)::text', _id_v, '{"plantillas": {"1": "  Mis series B  "}}'));
  _j := pg_temp.j(_r);
  _clas2 := (_j->'clasificaciones'->>0)::bigint;
  perform pg_temp.dice('5b. B acepta todo junto: ' || coalesce(_j->>'estado', _r)
    || '; plantillas nuevas: ' || ((select count(*) from plantilla_sesion where id_entrenador = _b) - _n_pl_b)
    || ' («' || coalesce((select nombre from plantilla_sesion where id = (_j->'plantillas'->>0)::bigint), '?')
    || '» y «' || coalesce((select nombre from plantilla_sesion where id = (_j->'plantillas'->>1)::bigint), '?') || '»)'
    || '; tests nuevos: ' || ((select count(*) from test_definicion where id_entrenador = _b) - _n_tests_b)
    || ', reusado el que ya tenía: ' || coalesce(((_j->'tests'->>_test::text)::bigint = _copia_test)::text, '?'));
  perform pg_temp.dice('5b. … las zonas nuevas: ' || (select count(*) from zona_entrenador where id_clasificacion = _clas2)
    || ', se llaman «nombre (A)» porque ya tenía las de 4a: '
    || coalesce((select (nombre = (select nombre from zona_clasificacion where id = _clasif) || ' (' || _quien || ')')::text from zona_clasificacion where id = _clas2), 'NO HAY')
    || '; enganchadas al test que ya tenía: ' || coalesce((
      select bool_and(split_part(h, ':', 2)::bigint = _copia_test) from zona_clasificacion c, jsonb_array_elements_text(c.hitos) h
       where c.id = _clas2 and h ~ '^propia:')::text, 'no tiene')
    || ' y ' || coalesce((select bool_and(coalesce(z.ref_definicion, _copia_test) = _copia_test
                                          and coalesce(split_part(z.desde->>'ref', ':', 2), _copia_test::text) in (_copia_test::text, 'vam', 'ftp', 'css')
                                          and coalesce(split_part(z.hasta->>'ref', ':', 2), _copia_test::text) in (_copia_test::text, 'vam', 'ftp', 'css'))
                         from zona_entrenador z where z.id_clasificacion = _clas2)::text, '?')
    || '; B las ve: ' || pg_temp.ve(_b, format('select count(*)::int from zona_entrenador where id_clasificacion = %s', _clas2))
    || ', A no: ' || pg_temp.ve(_a, format('select count(*)::int from zona_entrenador where id_clasificacion = %s', _clas2)));
  perform pg_temp.dice('5b. … y otra vez: ' || pg_temp.como(_b, format('select contestar_envio(%s, true)', _id_v)));

  /* Lo que no se deja (cada intento se deshace solo). */
  perform pg_temp.dice('5c. Varios vacío: ' || pg_temp.como(_a, format('select enviar_varios_a_entrenador(%L)', _b)));
  perform pg_temp.dice('5c. Con un test que no es suyo: ' || pg_temp.como(_a, format('select enviar_varios_a_entrenador(%L, %L::jsonb, %L::bigint[])',
    _b, '[]', array[coalesce((select id from test_definicion where id_entrenador <> _a order by id limit 1), -1)])));
  perform pg_temp.dice('5c. Con unas zonas que no son suyas: ' || pg_temp.como(_a, format('select enviar_varios_a_entrenador(%L, %L::jsonb, %L::bigint[], %L::bigint[])',
    _b, '[]', '{}', array[coalesce((select id from zona_clasificacion where id_entrenador <> _a order by id limit 1), -1)])));
  _malo := jsonb_build_array(jsonb_set(_pl, '{disciplina}', '"Fuerza"'));
  perform pg_temp.dice('5c. Con una plantilla de fuerza dentro: ' || pg_temp.como(_a, format('select enviar_varios_a_entrenador(%L, %L::jsonb, %L::bigint[])',
    _b, _malo, array[_test])));
  perform pg_temp.dice('5c. 31 cosas: ' || pg_temp.como(_a, format('select enviar_varios_a_entrenador(%L, %L::jsonb)',
    _b, (select jsonb_agg(_pl) from generate_series(1, 31)))));
  perform pg_temp.dice('5c. A sí misma: ' || pg_temp.como(_a, format('select enviar_varios_a_entrenador(%L, %L::jsonb, %L::bigint[])', _a, '[]', array[_test])));
  perform pg_temp.dice('5c. Un deportista: ' || pg_temp.como(_d, format('select enviar_varios_a_entrenador(%L, %L::jsonb, %L::bigint[])', _b, '[]', array[_test])));
  perform pg_temp.dice('5c. Sin entrar (anon): ' || pg_temp.como(null, format('select enviar_varios_a_entrenador(%L, %L::jsonb, %L::bigint[])', _b, '[]', array[_test])));
  perform pg_temp.dice('5c. Un ayudante, llamado a mano por B: ' || pg_temp.como(_b, format('select envio_copiar_plantilla(%L, %L::jsonb, null, null)', _b, _pl)));

  /* Rechazar y cancelar unos varios. */
  _n_tests_b := (select count(*) from test_definicion where id_entrenador = _b);
  _r := pg_temp.hacer(_a, format('select enviar_varios_a_entrenador(%L, %L::jsonb, %L::bigint[], %L::bigint[])::text', _b, jsonb_build_array(_pl), array[_test], array[_clasif]));
  if _r ~ '^[0-9]+$' then _id_rech := _r::bigint; end if;
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, false)::text', _id_rech));
  perform pg_temp.dice('5d. B rechaza unos varios: ' || coalesce(pg_temp.j(_r)->>'estado', _r)
    || '; no crea nada: ' || ((select resultado from envio_entrenador where id = _id_rech) is null
                              and (select count(*) from test_definicion where id_entrenador = _b) = _n_tests_b));
  _r := pg_temp.hacer(_a, format('select enviar_varios_a_entrenador(%L, %L::jsonb, %L::bigint[])::text', _b, '[]', array[_test]));
  if _r ~ '^[0-9]+$' then _id_canc := _r::bigint; end if;
  perform pg_temp.dice('5e. A cancela unos varios: ' || pg_temp.hacer(_a, format('select %L from (select cancelar_envio(%s)) x', 'ok', _id_canc))
    || '; B lo acepta después: ' || pg_temp.como(_b, format('select contestar_envio(%s, true)', _id_canc)));

  perform pg_temp.dice('5f. Ven los envíos: A ' || pg_temp.ve(_a, 'select count(*)::int from envio_entrenador')
    || ', B ' || pg_temp.ve(_b, 'select count(*)::int from envio_entrenador')
    || ', C ' || pg_temp.ve(_c, 'select count(*)::int from envio_entrenador')
    || ', D ' || pg_temp.ve(_d, 'select count(*)::int from envio_entrenador')
    || '; C acepta unos varios de B: ' || pg_temp.como(_c, format('select contestar_envio(%s, true)', _id_rech)));
end $ensayo$;

/* El informe: un error a propósito que lo trae y deshace todo. */
do $fin$
begin
  raise exception 'INFORME:%', (select E'\n' || string_agg(linea, E'\n' order by orden) from _informe);
end $fin$;
