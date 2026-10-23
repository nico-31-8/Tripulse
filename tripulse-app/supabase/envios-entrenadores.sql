/* ============================================================
   TRIPULSE — Envíos entre entrenadores (fase 1)
   ============================================================

   Pedido del usuario el 23-10-2026: que un entrenador pueda mandar a otro
   una sesión (le llega como plantilla), un test propio o unas zonas propias
   con el test del que salen, y que al otro le llegue un aviso en su panel.
   Maqueta aprobada: https://claude.ai/artifact/RUwkGr4VEPYsXVDK93z3ni
   (la fase 2, traspasar deportistas, irá aparte).

   LO QUE SE MANDA ES UNA COPIA. Se guarda tal como estaba al enviarlo
   (`contenido`): si quien lo manda lo cambia o lo borra después, al otro le
   llega lo que se mandó. Al aceptar se crean las copias, ya suyas, y nada
   queda enlazado con el original.

   QUIÉN PUEDE QUÉ. La tabla solo se LEE (quien manda y quien recibe); todo lo
   demás va por funciones, y cada una hace su paso entero o no hace nada:
   · Buscar: un entrenador busca a otro por su correo EXACTO, como el
     director. Nadie puede recorrer la lista de entrenadores.
   · Enviar: solo lo SUYO.
       - La plantilla llega montada desde la pantalla (sale de una sesión o de
         sus plantillas) y aquí se limpia: zona, series, metros o segundos,
         descanso y nota, y nada más. Solo natación, ciclismo y carrera, como
         las plantillas de siempre: la fuerza no se guarda como plantilla.
       - El test y las zonas se leen de la base. Las zonas se llevan los tests
         de los que salen, y esos tests también tienen que ser suyos (no uno
         compartido en la dirección).
   · Contestar: solo quien lo recibe, y solo mientras está pendiente.
   · Cancelar: solo quien lo manda, y solo mientras está pendiente.

   LOS NOMBRES NO SE REPITEN. Si quien acepta ya tiene un test, unas zonas o
   una plantilla de esa disciplina con ese nombre, la copia se llama «Nombre
   (Ana)». Puede elegir otro, y si también está cogido se numera. En un test
   del laboratorio el nombre vive también dentro de su modelo, y es ese el que
   se enseña: se cambian los dos.

   UN TEST QUE YA TIENE NO SE DUPLICA: si el mismo entrenador se lo mandó antes,
   sigue sin archivar y no ha cambiado, se usa esa copia. Pasa, por ejemplo,
   con unas zonas que llegan con un test que ya aceptó.

   Las zonas de la copia se enganchan a SU copia del test: los hitos y los
   límites dicen «propia:<test>:<resultado>», y el número de test cambia. Las
   que salen de la app («app:vam», «app:ftp», «app:css») no cambian.

   No toca ninguna tabla que ya exista: es una tabla nueva y sus funciones.
   Para deshacerlo: borrar las funciones y la tabla.
   ============================================================ */

create table if not exists public.envio_entrenador (
  id                  bigint generated always as identity primary key,
  de                  uuid not null references public.perfiles(id) on delete cascade,
  para                uuid not null references public.perfiles(id) on delete cascade,
  tipo                text not null,
  titulo              text not null,
  contenido           jsonb not null,
  mensaje             text,
  /* Los nombres y el correo, como estaban al enviarlo: así cada uno ve los
     del otro sin poder leer su perfil. */
  de_nombre           text,
  para_nombre         text,
  para_correo         text,
  estado              text not null default 'pendiente',
  /* Lo que se creó al aceptar: {plantilla: id} / {clasificacion: id} y
     {tests: {"<id del original>": id de la copia}}. */
  resultado           jsonb,
  creado_en           timestamptz not null default now(),
  contestado_en       timestamptz,
  /* Cuándo vio quien lo mandó que le habían contestado (su aviso del panel). */
  respuesta_vista_en  timestamptz,
  constraint envio_entrenador_tipo check (tipo in ('plantilla', 'test', 'zonas')),
  constraint envio_entrenador_estado check (estado in ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
  constraint envio_entrenador_otro check (de <> para),
  constraint envio_entrenador_titulo check (char_length(btrim(titulo)) between 1 and 120),
  constraint envio_entrenador_mensaje check (mensaje is null or char_length(mensaje) <= 500),
  constraint envio_entrenador_contenido check (jsonb_typeof(contenido) = 'object')
);

create index if not exists envio_entrenador_para_idx on public.envio_entrenador (para, creado_en desc);
create index if not exists envio_entrenador_de_idx on public.envio_entrenador (de, creado_en desc);

alter table public.envio_entrenador enable row level security;

drop policy if exists envio_entrenador_lee on public.envio_entrenador;
create policy envio_entrenador_lee on public.envio_entrenador
  for select to authenticated
  using (de = (select auth.uid()) or para = (select auth.uid()));

/* Nadie escribe en la tabla a mano: solo las funciones de abajo. */
revoke all on public.envio_entrenador from anon;
revoke insert, update, delete, truncate on public.envio_entrenador from authenticated;


/* ············································
   Ayudantes (solo los usan las funciones de aquí)
   ············································ */

/* Un número de la plantilla: o no está, o es un número dentro del rango. */
create or replace function public.envio_num(_v jsonb, _min numeric, _max numeric, _que text)
returns numeric language plpgsql immutable set search_path = public as $$
begin
  if _v is null or jsonb_typeof(_v) = 'null' then return null; end if;
  if jsonb_typeof(_v) <> 'number' or (_v #>> '{}')::numeric < _min or (_v #>> '{}')::numeric > _max then
    raise exception 'La plantilla tiene % que no vale', _que;
  end if;
  return (_v #>> '{}')::numeric;
end $$;

/* La plantilla tal como llega de la pantalla, limpia: solo lo que sabe guardar
   una plantilla. Lo que no encaja para el envío con un error que se entiende. */
create or replace function public.envio_plantilla_limpia(_p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  _b       jsonb;
  _bloques jsonb := '[]'::jsonb;
  _nombre  text;
  _disc    text;
  _zona    text;
  _obj     text;
  _series  numeric;
  _metros  numeric;
  _seg     numeric;
  _nota    text;
begin
  if _p is null or jsonb_typeof(_p) <> 'object' then
    raise exception 'Falta la plantilla';
  end if;
  _nombre := btrim(coalesce(_p->>'nombre', ''));
  if char_length(_nombre) < 1 or char_length(_nombre) > 80 then
    raise exception 'La plantilla necesita un nombre, de 80 letras como mucho';
  end if;
  _disc := _p->>'disciplina';
  if _disc is null or _disc not in ('Natacion', 'Ciclismo', 'Carrera') then
    raise exception 'Solo se mandan plantillas de natación, ciclismo o carrera';
  end if;
  _obj := nullif(btrim(coalesce(_p->>'objetivo', '')), '');
  if _obj is not null and char_length(_obj) > 1000 then
    raise exception 'El objetivo de la plantilla es demasiado largo';
  end if;
  if jsonb_typeof(_p->'bloques') is distinct from 'array'
     or jsonb_array_length(_p->'bloques') = 0 or jsonb_array_length(_p->'bloques') > 60 then
    raise exception 'La sesión no tiene bloques con zona y volumen que mandar';
  end if;

  for _b in select value from jsonb_array_elements(_p->'bloques') loop
    if jsonb_typeof(_b) <> 'object' then
      raise exception 'La plantilla tiene un bloque que no se entiende';
    end if;
    if jsonb_typeof(_b->'zona') is distinct from 'string' or char_length(btrim(_b->>'zona')) not between 1 and 16 then
      raise exception 'Un bloque de la plantilla no tiene zona';
    end if;
    _series := public.envio_num(_b->'series', 1, 200, 'un número de series');
    if _series is not null and _series <> trunc(_series) then
      raise exception 'La plantilla tiene un número de series que no vale';
    end if;
    _metros := public.envio_num(_b->'metros', 1, 1000000, 'una distancia');
    _seg := public.envio_num(_b->'segundos', 1, 86400, 'una duración');
    if _metros is null and _seg is null then
      raise exception 'Un bloque de la plantilla no tiene volumen';
    end if;
    _nota := nullif(btrim(coalesce(_b->>'nota', '')), '');
    if jsonb_typeof(_b->'nota') is not null and jsonb_typeof(_b->'nota') not in ('string', 'null') then
      raise exception 'La plantilla tiene una nota que no se entiende';
    end if;
    _bloques := _bloques || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'zona', btrim(_b->>'zona'),
      'series', _series::int,
      'metros', _metros,
      'segundos', _seg,
      'descansoSeg', public.envio_num(_b->'descansoSeg', 0, 86400, 'un descanso'),
      'nota', left(_nota, 300))));
  end loop;

  _zona := btrim(coalesce(_p->>'zona', ''));
  if char_length(_zona) not between 1 and 16 then
    _zona := _bloques->0->>'zona';
  end if;

  return jsonb_build_object('nombre', _nombre, 'disciplina', _disc, 'zona', _zona,
                            'objetivo', _obj, 'bloques', _bloques);
end $$;

/* Una referencia a un resultado de test propio, apuntando a la copia del test.
   Las de la app no cambian. Si falta la copia, error: nunca se deja una zona
   colgando del test de otro entrenador. */
create or replace function public.envio_ref(_ref text, _mapa jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare _m text[];
begin
  if _ref is null then return null; end if;
  _m := regexp_match(_ref, '^propia:([0-9]+):([0-9]+)$');
  if _m is null then return _ref; end if;
  if (_mapa ->> _m[1]) is null then
    raise exception 'Falta el test del que salen estas zonas';
  end if;
  return 'propia:' || (_mapa ->> _m[1]) || ':' || _m[2];
end $$;

/* Un límite de zona ({ref, pct}) apuntando a la copia del test. El null de
   JSON vuelve como null de verdad: la comprobación de la tabla no lo acepta. */
create or replace function public.envio_limite(_l jsonb, _mapa jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case
    when _l is null or jsonb_typeof(_l) = 'null' then null
    when jsonb_typeof(_l) <> 'object' then _l
    else jsonb_set(_l, '{ref}', to_jsonb(public.envio_ref(_l->>'ref', _mapa)))
  end
$$;

/* Un nombre que no tenga ya: el suyo; si está cogido, «Nombre (Ana)»; si
   también, «Nombre (Ana 2)», y así. Sin mirar mayúsculas. Nunca pasa de 80
   letras (las zonas no admiten más): se recorta solo lo necesario para que
   quepa lo de entre paréntesis. */
create or replace function public.envio_nombre_libre(_base text, _usados text[], _de text)
returns text language plpgsql immutable set search_path = public as $$
declare
  _b     text := left(btrim(coalesce(_base, '')), 80);
  _quien text := nullif(split_part(btrim(coalesce(_de, '')), ' ', 1), '');
  _cola  text;
  _cand  text;
  _n     int := 1;
begin
  if _b = '' then _b := 'Sin nombre'; end if;
  _quien := coalesce(left(_quien, 12), 'copia');
  _cand := _b;
  while exists (select 1 from unnest(coalesce(_usados, '{}'::text[])) u where lower(btrim(u)) = lower(_cand)) loop
    _n := _n + 1;
    _cola := ' (' || _quien || case when _n > 2 then ' ' || (_n - 1) else '' end || ')';
    _cand := left(_b, 80 - char_length(_cola)) || _cola;
    exit when _n > 99;
  end loop;
  return _cand;
end $$;

revoke all on function public.envio_num(jsonb, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.envio_plantilla_limpia(jsonb) from public, anon, authenticated;
revoke all on function public.envio_ref(text, jsonb) from public, anon, authenticated;
revoke all on function public.envio_limite(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.envio_nombre_libre(text, text[], text) from public, anon, authenticated;


/* ············································
   Buscar a otro entrenador por su correo exacto
   ············································ */
create or replace function public.envio_buscar_entrenador(_email text)
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre
    from perfiles p
   where exists (select 1 from perfiles yo where yo.id = auth.uid() and yo.rol = 'entrenador')
     and p.rol = 'entrenador'
     and p.id <> auth.uid()
     and length(trim(coalesce(_email, ''))) > 3
     and lower(p.email) = lower(trim(_email))
   limit 1;
$$;


/* ············································
   Enviar
   ············································ */
create or replace function public.enviar_a_entrenador(
  _para uuid, _tipo text, _id bigint default null, _plantilla jsonb default null, _mensaje text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  _yo          uuid := auth.uid();
  _yo_nombre   text;
  _para_nombre text;
  _para_correo text;
  _men         text := nullif(btrim(coalesce(_mensaje, '')), '');
  _contenido   jsonb;
  _titulo      text;
  _c           zona_clasificacion%rowtype;
  _zonas       jsonb;
  _tests       bigint[];
  _nuevo       bigint;
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

  if _tipo = 'plantilla' then
    _contenido := public.envio_plantilla_limpia(_plantilla);
    _titulo := _contenido->>'nombre';

  elsif _tipo = 'test' then
    if not exists (select 1 from test_definicion where id = _id and id_entrenador = _yo and not archivado) then
      raise exception 'Ese test no es tuyo, o está archivado';
    end if;
    select jsonb_build_object('tests', jsonb_build_array(jsonb_build_object(
             'id', t.id, 'nombre', t.nombre, 'deporte', t.deporte,
             'campos', t.campos, 'resultados', t.resultados, 'modelo', t.modelo))), t.nombre
      into _contenido, _titulo
      from test_definicion t where t.id = _id;

  elsif _tipo = 'zonas' then
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
      raise exception 'Esa clasificación todavía no tiene zonas';
    end if;
    /* Los tests de los que salen: sus hitos, los límites de cada zona y las
       columnas de antes (ref_definicion), que aún usan las zonas de un hito. */
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
      raise exception 'Estas zonas salen de un test que no es tuyo: solo se mandan las que salen de tus tests o de los de la app';
    end if;
    _contenido := jsonb_build_object(
      'clasificacion', jsonb_build_object('nombre', _c.nombre, 'deporte', _c.deporte, 'hitos', _c.hitos),
      'zonas', _zonas,
      'tests', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', t.id, 'nombre', t.nombre, 'deporte', t.deporte,
                  'campos', t.campos, 'resultados', t.resultados, 'modelo', t.modelo) order by t.id), '[]'::jsonb)
                  from test_definicion t where t.id = any(_tests)));
    _titulo := _c.nombre;

  else
    raise exception 'Eso no se puede enviar';
  end if;

  insert into envio_entrenador (de, para, tipo, titulo, contenido, mensaje, de_nombre, para_nombre, para_correo)
  values (_yo, _para, _tipo, left(btrim(_titulo), 120), _contenido, _men, _yo_nombre, _para_nombre, _para_correo)
  returning id into _nuevo;
  return _nuevo;
end $$;


/* ············································
   Contestar: aceptar (crea las copias) o rechazar
   ············································
   `_nombres`, si quien acepta los cambia:
     {"plantilla": "...", "clasificacion": "...", "tests": {"<id del original>": "..."}}
   Devuelve {estado} y, si acepta, lo creado (ver la columna `resultado`) y
   {reusados: [ids]}, los tests que ya tenía. */
create or replace function public.contestar_envio(_id bigint, _aceptar boolean, _nombres jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _yo       uuid := auth.uid();
  _e        envio_entrenador%rowtype;
  _n        jsonb := case when jsonb_typeof(_nombres) = 'object' then _nombres else '{}'::jsonb end;
  _mapa     jsonb := '{}'::jsonb;
  _reusados jsonb := '[]'::jsonb;
  _res      jsonb := '{}'::jsonb;
  _t        jsonb;
  _z        jsonb;
  _c        jsonb;
  _modelo   jsonb;
  _nombre   text;
  _previa   bigint;
  _nuevo    bigint;
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

  /* Los tests: el de un test suelto y los de unas zonas. */
  for _t in select value from jsonb_array_elements(coalesce(_e.contenido->'tests', '[]'::jsonb)) loop
    _modelo := case when jsonb_typeof(_t->'modelo') = 'object' then _t->'modelo' else null end;
    /* ¿Ya lo tiene, de otro envío del mismo entrenador, sin archivar y sin
       cambios? Se compara sin el nombre, que pudo cambiarlo al aceptarlo. */
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
        coalesce(nullif(btrim(_n->'tests'->>(_t->>'id')), ''), _t->>'nombre'),
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

  if _e.tipo = 'plantilla' then
    _c := _e.contenido;
    insert into plantilla_sesion (id_entrenador, nombre, disciplina, zona, objetivo, bloques)
    values (_yo,
            public.envio_nombre_libre(
              coalesce(nullif(btrim(_n->>'plantilla'), ''), _c->>'nombre'),
              array(select nombre from plantilla_sesion where id_entrenador = _yo and disciplina = _c->>'disciplina'),
              _e.de_nombre),
            _c->>'disciplina', _c->>'zona', _c->>'objetivo', _c->'bloques')
    returning id into _nuevo;
    _res := jsonb_build_object('plantilla', _nuevo);

  elsif _e.tipo = 'zonas' then
    _c := _e.contenido->'clasificacion';
    if exists (select 1 from jsonb_array_elements(_e.contenido->'zonas') z
                where z->>'ref_definicion' is not null and (_mapa ->> (z->>'ref_definicion')) is null) then
      raise exception 'Falta el test del que salen estas zonas';
    end if;
    insert into zona_clasificacion (id_entrenador, nombre, deporte, hitos, orden)
    values (_yo,
            public.envio_nombre_libre(
              coalesce(nullif(btrim(_n->>'clasificacion'), ''), _c->>'nombre'),
              array(select nombre from zona_clasificacion where id_entrenador = _yo and not archivada),
              _e.de_nombre),
            coalesce(_c->>'deporte', 'Carrera'),
            (select coalesce(jsonb_agg(to_jsonb(public.envio_ref(h, _mapa)) order by o), '[]'::jsonb)
               from jsonb_array_elements_text(coalesce(_c->'hitos', '[]'::jsonb)) with ordinality as x(h, o)),
            (select coalesce(max(orden), -1) + 1 from zona_clasificacion where id_entrenador = _yo))
    returning id into _nuevo;

    for _z in select value from jsonb_array_elements(_e.contenido->'zonas') loop
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
    _res := jsonb_build_object('clasificacion', _nuevo);
  end if;

  if _mapa <> '{}'::jsonb then
    _res := _res || jsonb_build_object('tests', _mapa);
  end if;
  update envio_entrenador
     set estado = 'aceptado', contestado_en = now(), resultado = _res
   where id = _id;
  return jsonb_build_object('estado', 'aceptado') || _res
         || case when jsonb_array_length(_reusados) > 0 then jsonb_build_object('reusados', _reusados) else '{}'::jsonb end;
end $$;


/* ············································
   Cancelar (quien lo manda, mientras nadie ha contestado)
   ············································ */
create or replace function public.cancelar_envio(_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update envio_entrenador
     set estado = 'cancelado', contestado_en = now()
   where id = _id and de = auth.uid() and estado = 'pendiente';
  if not found then
    raise exception 'Ese envío ya no se puede cancelar';
  end if;
end $$;


/* ············································
   Quien lo mandó ya ha visto la respuesta (se va su aviso del panel)
   ············································ */
create or replace function public.envio_respuesta_vista(_ids bigint[])
returns void language sql security definer set search_path = public as $$
  update envio_entrenador
     set respuesta_vista_en = now()
   where id = any(coalesce(_ids, '{}'::bigint[])) and de = auth.uid()
     and estado in ('aceptado', 'rechazado') and respuesta_vista_en is null;
$$;


revoke all on function public.envio_buscar_entrenador(text) from public;
revoke all on function public.enviar_a_entrenador(uuid, text, bigint, jsonb, text) from public;
revoke all on function public.contestar_envio(bigint, boolean, jsonb) from public;
revoke all on function public.cancelar_envio(bigint) from public;
revoke all on function public.envio_respuesta_vista(bigint[]) from public;

revoke execute on function public.envio_buscar_entrenador(text) from anon;
revoke execute on function public.enviar_a_entrenador(uuid, text, bigint, jsonb, text) from anon;
revoke execute on function public.contestar_envio(bigint, boolean, jsonb) from anon;
revoke execute on function public.cancelar_envio(bigint) from anon;
revoke execute on function public.envio_respuesta_vista(bigint[]) from anon;

grant execute on function public.envio_buscar_entrenador(text) to authenticated;
grant execute on function public.enviar_a_entrenador(uuid, text, bigint, jsonb, text) to authenticated;
grant execute on function public.contestar_envio(bigint, boolean, jsonb) to authenticated;
grant execute on function public.cancelar_envio(bigint) to authenticated;
grant execute on function public.envio_respuesta_vista(bigint[]) to authenticated;
