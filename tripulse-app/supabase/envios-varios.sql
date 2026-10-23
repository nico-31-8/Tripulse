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
