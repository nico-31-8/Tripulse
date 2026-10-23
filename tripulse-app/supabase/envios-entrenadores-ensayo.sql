/* ============================================================
   ENSAYO de envios-entrenadores.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: la tabla nueva, sus funciones, los envíos y las copias de prueba.

   Los protagonistas se eligen solos con lo que hay en la base (no lleva ids
   escritos: el repositorio es público):
   · A, quien manda: un entrenador con unas zonas propias colgadas de un test
     suyo (así se prueba el reenganche con datos de verdad).
   · B, quien recibe: otro entrenador normal (sin plataforma_admin), que no
     trabaja con A en una dirección.
   · C, un tercer entrenador que no pinta nada, y D, un deportista.

   1. CONTROL: la tabla todavía no existe, y lo que cada uno ve hoy de tests,
      zonas y plantillas.
   2. La migración, con las mismas sentencias que el fichero.
   3. Lo que ven después (tiene que ser lo mismo) y las puertas una a una:
      buscar, enviar, lo que se guarda, lo que no se deja, quién ve qué,
      aceptar (las copias, enganchadas a los tests de B), nombres repetidos,
      el test que ya tenía, rechazar, cancelar y el «visto» de la respuesta.
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

/* Ejecuta como esa persona y lo DEJA hecho (dentro del ensayo): lo que
   devuelve, o ERROR con su código y su texto. */
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

/* Cuántas filas ve cada protagonista de las tablas que tocan las copias. */
create function pg_temp.contar(_cuando text) returns void language plpgsql as $f$
declare _p record; _t text;
begin
  for _p in select 'A' as q, a as u from _actores union all select 'B', b from _actores
            union all select 'C', c from _actores union all select 'D', d from _actores loop
    continue when _p.u is null;
    foreach _t in array array['test_definicion', 'test_medicion', 'zona_clasificacion', 'zona_entrenador', 'plantilla_sesion'] loop
      insert into _cuentas (cuando, quien, tabla, n)
      values (_cuando, _p.q, _t, pg_temp.ve(_p.u, 'select count(*)::int from ' || _t));
    end loop;
  end loop;
end $f$;

/* Los protagonistas. */
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
select pg_temp.dice('1. Antes: la tabla de envíos ' ||
  case when to_regclass('public.envio_entrenador') is null then 'no existe (bien)' else '¡YA EXISTE!' end);
select pg_temp.contar('antes');

/* 2. LA MIGRACIÓN, tal cual el fichero */
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

/* 3. DESPUÉS */
select pg_temp.contar('despues');

/* La respuesta como JSON, o null si es un error (para no reventar el informe). */
create function pg_temp.j(_r text) returns jsonb language plpgsql as $f$
begin
  return _r::jsonb;
exception when others then
  return null;
end $f$;

do $ensayo$
declare
  _a uuid; _b uuid; _c uuid; _d uuid; _clasif bigint; _test bigint; _correo_a text; _correo_b text;
  _r text; _res jsonb; _pl jsonb; _malo jsonb;
  _id_pl bigint; _id_t bigint; _id_z bigint; _id_pl2 bigint; _id_rech bigint; _id_canc bigint;
  _nueva bigint; _n_tests_b int; _base text; _copia record; _quien text;
begin
  select a, b, c, d, clasif, test_suelto, correo_a, correo_b
    into _a, _b, _c, _d, _clasif, _test, _correo_a, _correo_b from _actores;
  perform pg_temp.dice('   Protagonistas: A ' || (_a is not null) || ', B ' || (_b is not null) || ', C ' || (_c is not null)
    || ', D ' || (_d is not null) || ', zonas de A con test ' || (_clasif is not null) || ', test suelto ' || (_test is not null));

  perform pg_temp.dice('3. Para los demás no cambia nada: ' || (
    select case when count(*) = 0 then 'lo mismo en las 5 tablas para A, B, C y D'
                else count(*) || ' DIFERENCIAS' end
      from _cuentas x join _cuentas y on y.quien = x.quien and y.tabla = x.tabla and y.cuando = 'despues'
     where x.cuando = 'antes' and x.n <> y.n));

  /* ── Los ayudantes ── */
  perform pg_temp.dice('3a. Nombres libres: ' || concat_ws(' | ',
    public.envio_nombre_libre('X', array['x'], 'Ana Rivas'),
    public.envio_nombre_libre('X', array['X', 'x (ana)'], 'Ana Rivas'),
    public.envio_nombre_libre('', null, 'Ana'),
    public.envio_nombre_libre('X', array['X'], null),
    char_length(public.envio_nombre_libre(repeat('n', 80), array[repeat('n', 80)], 'Ana'))::text,
    right(public.envio_nombre_libre(repeat('n', 80), array[repeat('n', 80)], 'Ana'), 6)));
  perform pg_temp.dice('3a. Referencias: ' || concat_ws(' | ',
    public.envio_ref('app:vam', '{}'),
    public.envio_ref('propia:5:1', '{"5": 9}'),
    coalesce(public.envio_limite('null'::jsonb, '{}')::text, 'null de verdad'),
    public.envio_limite('{"ref": "propia:5:0", "pct": 95}', '{"5": 9}')::text));
  begin
    perform public.envio_ref('propia:5:1', '{}');
    perform pg_temp.dice('3a. Sin la copia del test: ¡NO FALLA!');
  exception when others then
    perform pg_temp.dice('3a. Sin la copia del test: ' || sqlerrm);
  end;

  /* ── Buscar ── */
  perform pg_temp.dice('3b. A busca el correo de B: ' || pg_temp.hacer(_a, format('select count(*)::text from envio_buscar_entrenador(%L)', _correo_b)));
  perform pg_temp.dice('3b. … en mayúsculas y con espacios: ' || pg_temp.hacer(_a, format('select count(*)::text from envio_buscar_entrenador(%L)', '  ' || upper(_correo_b) || ' ')));
  perform pg_temp.dice('3b. … la mitad del correo: ' || pg_temp.hacer(_a, format('select count(*)::text from envio_buscar_entrenador(%L)', split_part(_correo_b, '@', 1))));
  perform pg_temp.dice('3b. … el suyo propio: ' || pg_temp.hacer(_a, format('select count(*)::text from envio_buscar_entrenador(%L)', _correo_a)));
  perform pg_temp.dice('3b. Un deportista busca a B: ' || pg_temp.hacer(_d, format('select count(*)::text from envio_buscar_entrenador(%L)', _correo_b)));
  perform pg_temp.dice('3b. Sin entrar (anon): ' || pg_temp.como(null, format('select * from envio_buscar_entrenador(%L)', _correo_b)));

  /* ── Enviar ── */
  _pl := jsonb_build_object('nombre', 'Ensayo 6 x 1000', 'disciplina', 'Carrera', 'zona', 'PAE', 'objetivo', 'Series largas',
    'basura', 'no tiene que llegar',
    'bloques', jsonb_build_array(
      jsonb_build_object('zona', 'AEL', 'segundos', 900, 'nota', 'Calentamiento', 'hack', 'tampoco'),
      jsonb_build_object('zona', 'PAE', 'series', 6, 'metros', 1000, 'descansoSeg', 120),
      jsonb_build_object('zona', 'AER', 'segundos', 600)));
  _r := pg_temp.hacer(_a, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb, %L)::text', _b, 'plantilla', _pl, 'Te paso la sesión'));
  perform pg_temp.dice('3c. A manda una plantilla a B: ' || case when _r ~ '^[0-9]+$' then 'ENTRA' else _r end);
  if _r ~ '^[0-9]+$' then _id_pl := _r::bigint; end if;
  perform pg_temp.dice('3c. … guardada limpia: ' || coalesce((
    select (not (contenido ? 'basura')) and (not (contenido->'bloques'->0 ? 'hack'))
           and jsonb_array_length(contenido->'bloques') = 3
           and contenido->'bloques'->1 = '{"zona": "PAE", "series": 6, "metros": 1000, "descansoSeg": 120}'::jsonb
           and estado = 'pendiente' and mensaje = 'Te paso la sesión' and titulo = 'Ensayo 6 x 1000'
           and para_correo = lower(_correo_b)
      from envio_entrenador where id = _id_pl)::text, 'no hay fila'));

  _r := pg_temp.hacer(_a, format('select enviar_a_entrenador(%L, %L, %s)::text', _b, 'test', _test));
  perform pg_temp.dice('3c. A manda un test suyo a B: ' || case when _r ~ '^[0-9]+$' then 'ENTRA' else _r end);
  if _r ~ '^[0-9]+$' then _id_t := _r::bigint; end if;

  _r := pg_temp.hacer(_a, format('select enviar_a_entrenador(%L, %L, %s)::text', _b, 'zonas', _clasif));
  perform pg_temp.dice('3c. A manda sus zonas a B: ' || case when _r ~ '^[0-9]+$' then 'ENTRA' else _r end);
  if _r ~ '^[0-9]+$' then _id_z := _r::bigint; end if;
  perform pg_temp.dice('3c. … llevan ' || coalesce((
    select jsonb_array_length(contenido->'zonas') || ' zonas (de ' ||
           (select count(*) from zona_entrenador where id_clasificacion = _clasif and not archivada) || ') y ' ||
           jsonb_array_length(contenido->'tests') || ' test(s), con el suelto dentro: ' ||
           exists (select 1 from jsonb_array_elements(contenido->'tests') t where (t->>'id')::bigint = _test)
      from envio_entrenador where id = _id_z), 'no hay fila'));

  /* ── Lo que no se deja (cada intento se deshace solo) ── */
  perform pg_temp.dice('3d. A manda un test que no es suyo: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, %s)',
    _b, 'test', coalesce((select id from test_definicion where id_entrenador <> _a order by id limit 1), -1))));
  perform pg_temp.dice('3d. A manda unas zonas que no son suyas: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, %s)',
    _b, 'zonas', coalesce((select id from zona_clasificacion where id_entrenador <> _a order by id limit 1), -1))));
  perform pg_temp.dice('3d. A se lo manda a un deportista: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, %s)', _d, 'test', _test)));
  perform pg_temp.dice('3d. A se lo manda a sí mismo: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, %s)', _a, 'test', _test)));
  perform pg_temp.dice('3d. Un deportista manda algo: ' || pg_temp.como(_d, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb)', _b, 'plantilla', _pl)));
  perform pg_temp.dice('3d. Sin entrar (anon): ' || pg_temp.como(null, format('select enviar_a_entrenador(%L, %L, %s)', _b, 'test', _test)));
  perform pg_temp.dice('3d. Un tipo que no existe: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, %s)', _b, 'deportista', 1)));
  _malo := jsonb_set(_pl, '{disciplina}', '"Fuerza"');
  perform pg_temp.dice('3d. Plantilla de fuerza: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb)', _b, 'plantilla', _malo)));
  _malo := jsonb_set(_pl, '{bloques,2}', '{"zona": "AER"}');
  perform pg_temp.dice('3d. Un bloque sin volumen: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb)', _b, 'plantilla', _malo)));
  _malo := jsonb_set(_pl, '{bloques,1,series}', '2.5');
  perform pg_temp.dice('3d. Series con decimales: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb)', _b, 'plantilla', _malo)));
  _malo := jsonb_set(_pl, '{bloques,1,metros}', '"mil"');
  perform pg_temp.dice('3d. Metros con letras: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb)', _b, 'plantilla', _malo)));
  _malo := jsonb_set(_pl, '{nombre}', '"  "');
  perform pg_temp.dice('3d. Sin nombre: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb)', _b, 'plantilla', _malo)));
  _malo := jsonb_set(_pl, '{bloques}', '[]');
  perform pg_temp.dice('3d. Sin bloques: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb)', _b, 'plantilla', _malo)));
  perform pg_temp.dice('3d. Un mensaje de 600 letras: ' || pg_temp.como(_a, format('select enviar_a_entrenador(%L, %L, %s, null, %L)', _b, 'test', _test, repeat('a', 600))));
  perform pg_temp.dice('3d. A escribe en la tabla a mano: ' || pg_temp.como(_a, format(
    'insert into envio_entrenador (de, para, tipo, titulo, contenido) values (%L, %L, %L, %L, %L::jsonb)', _a, _b, 'test', 'x', '{}')));
  perform pg_temp.dice('3d. B se lo da por aceptado a mano: ' || pg_temp.como(_b, format('update envio_entrenador set estado = %L where id = %s', 'aceptado', _id_pl)));
  perform pg_temp.dice('3d. A lo borra a mano: ' || pg_temp.como(_a, format('delete from envio_entrenador where id = %s', _id_pl)));

  /* ── Quién ve qué ── */
  perform pg_temp.dice('3e. Ven los envíos: A ' || pg_temp.ve(_a, 'select count(*)::int from envio_entrenador')
    || ', B ' || pg_temp.ve(_b, 'select count(*)::int from envio_entrenador')
    || ', C ' || pg_temp.ve(_c, 'select count(*)::int from envio_entrenador')
    || ', D ' || pg_temp.ve(_d, 'select count(*)::int from envio_entrenador'));
  perform pg_temp.dice('3e. Sin entrar (anon) lee la tabla: ' || pg_temp.como(null, 'select count(*) from envio_entrenador'));
  perform pg_temp.dice('3e. C acepta lo de B: ' || pg_temp.como(_c, format('select contestar_envio(%s, true)', _id_pl)));
  perform pg_temp.dice('3e. A acepta lo que mandó ella: ' || pg_temp.como(_a, format('select contestar_envio(%s, true)', _id_pl)));
  perform pg_temp.dice('3e. B cancela lo que no mandó: ' || pg_temp.como(_b, format('select cancelar_envio(%s)', _id_pl)));
  perform pg_temp.dice('3e. Sin entrar (anon) acepta: ' || pg_temp.como(null, format('select contestar_envio(%s, true)', _id_pl)));

  /* ── Aceptar las zonas, con un nombre de test repetido ── */
  select nombre into _base from test_definicion where id = _test;
  perform pg_temp.hacer(_b, format('insert into test_definicion (id_entrenador, nombre, deporte) values (%L, %L, %L) returning 1::text',
    _b, _base, 'Carrera'));
  _n_tests_b := (select count(*) from test_definicion where id_entrenador = _b);
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, true)::text', _id_z));
  perform pg_temp.dice('4a. B acepta las zonas: ' || coalesce(pg_temp.j(_r)->>'estado', _r));
  select resultado into _res from envio_entrenador where id = _id_z;
  _nueva := (_res->>'clasificacion')::bigint;
  perform pg_temp.dice('4a. … crea ' || (select count(*) from test_definicion where id_entrenador = _b) - _n_tests_b
    || ' test(s) y la clasificación es de B: ' || coalesce((select (id_entrenador = _b)::text from zona_clasificacion where id = _nueva), 'NO HAY'));
  perform pg_temp.dice('4a. … mismas zonas: ' || (select count(*) from zona_entrenador where id_clasificacion = _nueva)
    || ' de ' || (select count(*) from zona_entrenador where id_clasificacion = _clasif and not archivada)
    || '; iguales en sigla, nombre, %, RPE, color y orden: ' || (
      select count(*) = 0 from (
        (select sigla, nombre, pct_min, pct_max, rpe_min, rpe_max, color, orden, deporte, ref_indice,
                desde->'pct' as dp, hasta->'pct' as hp
           from zona_entrenador where id_clasificacion = _clasif and not archivada
         except
         select sigla, nombre, pct_min, pct_max, rpe_min, rpe_max, color, orden, deporte, ref_indice,
                desde->'pct', hasta->'pct'
           from zona_entrenador where id_clasificacion = _nueva)
        union all
        (select sigla, nombre, pct_min, pct_max, rpe_min, rpe_max, color, orden, deporte, ref_indice,
                desde->'pct', hasta->'pct'
           from zona_entrenador where id_clasificacion = _nueva
         except
         select sigla, nombre, pct_min, pct_max, rpe_min, rpe_max, color, orden, deporte, ref_indice,
                desde->'pct', hasta->'pct'
           from zona_entrenador where id_clasificacion = _clasif and not archivada)) dif));
  perform pg_temp.dice('4a. … sus hitos: ' || (select jsonb_array_length(hitos) from zona_clasificacion where id = _nueva)
    || ' (los mismos que el original: ' || (select jsonb_array_length(hitos) from zona_clasificacion where id = _clasif)
    || '); los propios apuntan a tests de B: ' || coalesce((
      select bool_and(exists (select 1 from test_definicion t where t.id = split_part(h, ':', 2)::bigint and t.id_entrenador = _b))
        from zona_clasificacion c, jsonb_array_elements_text(c.hitos) h
       where c.id = _nueva and h ~ '^propia:')::text, 'no tiene')
    || '; los de la app, iguales: ' || coalesce((
      select (array_agg(h order by h) = (select array_agg(h2 order by h2) from zona_clasificacion c2, jsonb_array_elements_text(c2.hitos) h2
                                          where c2.id = _clasif and h2 !~ '^propia:'))::text
        from zona_clasificacion c, jsonb_array_elements_text(c.hitos) h where c.id = _nueva and h !~ '^propia:'), 'no tiene'));
  perform pg_temp.dice('4a. … límites o columnas de antes que apunten a un test que no es de B: ' || (
    select count(*) from zona_entrenador z
     where z.id_clasificacion = _nueva and (
       (z.desde->>'ref' ~ '^propia:' and not exists (select 1 from test_definicion t where t.id = split_part(z.desde->>'ref', ':', 2)::bigint and t.id_entrenador = _b))
    or (z.hasta->>'ref' ~ '^propia:' and not exists (select 1 from test_definicion t where t.id = split_part(z.hasta->>'ref', ':', 2)::bigint and t.id_entrenador = _b))
    or (z.ref_definicion is not null and not exists (select 1 from test_definicion t where t.id = z.ref_definicion and t.id_entrenador = _b))))
    || ' (zonas con la columna de antes: ' || (select count(*) from zona_entrenador where id_clasificacion = _nueva and ref_definicion is not null) || ')');
  select t.nombre, t.modelo, t.campos, t.resultados into _copia
    from test_definicion t where t.id = (_res->'tests'->>_test::text)::bigint;
  _quien := coalesce(left(nullif(split_part(btrim(coalesce((select nombre from perfiles where id = _a), '')), ' ', 1), ''), 12), 'copia');
  perform pg_temp.dice('4a. … el test con el nombre que B ya tenía se llama «nombre (A)»: ' || (_copia.nombre = _base || ' (' || _quien || ')')
    || '; y dentro del modelo del laboratorio: ' || case when _copia.modelo is null then 'no es del laboratorio'
                                                      else ((_copia.modelo->>'nombre') = _copia.nombre)::text end
    || '; mismos campos y resultados: ' || ((_copia.campos, _copia.resultados) = (select campos, resultados from test_definicion where id = _test)));
  perform pg_temp.dice('4a. … B ve su clasificación y sus zonas: ' || pg_temp.ve(_b, format('select count(*)::int from zona_entrenador where id_clasificacion = %s', _nueva))
    || '; A no las ve: ' || pg_temp.ve(_a, format('select count(*)::int from zona_entrenador where id_clasificacion = %s', _nueva))
    || '; C tampoco: ' || pg_temp.ve(_c, format('select count(*)::int from zona_entrenador where id_clasificacion = %s', _nueva)));
  perform pg_temp.dice('4a. … y otra vez: ' || pg_temp.hacer(_b, format('select contestar_envio(%s, true)::text', _id_z)));

  /* ── El test que ya tiene: no se duplica ── */
  _n_tests_b := (select count(*) from test_definicion where id_entrenador = _b);
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, true)::text', _id_t));
  perform pg_temp.dice('4b. B acepta el test suelto, que ya le llegó con las zonas: ' || coalesce((pg_temp.j(_r)->>'estado')
    || ', reusado ' || (pg_temp.j(_r) ? 'reusados') || ', tests nuevos ' || ((select count(*) from test_definicion where id_entrenador = _b) - _n_tests_b), _r));

  /* ── La plantilla, con nombre repetido y con nombre elegido ── */
  perform pg_temp.hacer(_b, format('insert into plantilla_sesion (id_entrenador, nombre, disciplina, zona, bloques) values (%L, %L, %L, %L, %L::jsonb) returning 1::text',
    _b, 'ensayo 6 X 1000', 'Carrera', 'PAE', '[{"zona": "PAE", "metros": 1000}]'));
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, true)::text', _id_pl));
  perform pg_temp.dice('4c. B acepta la plantilla: ' || coalesce(pg_temp.j(_r)->>'estado', _r)
    || '; se llama «Ensayo 6 x 1000 (A)»: ' || coalesce((select (nombre = 'Ensayo 6 x 1000 (' || _quien || ')')::text from plantilla_sesion where id = (pg_temp.j(_r)->>'plantilla')::bigint), 'NO HAY')
    || '; con sus 3 bloques limpios, zona PAE y el objetivo: ' || coalesce((select (bloques = (select contenido->'bloques' from envio_entrenador where id = _id_pl) and zona = 'PAE' and objetivo = 'Series largas' and id_entrenador = _b)::text from plantilla_sesion where id = (pg_temp.j(_r)->>'plantilla')::bigint), 'NO HAY'));
  _r := pg_temp.hacer(_a, format('select enviar_a_entrenador(%L, %L, null, %L::jsonb)::text', _b, 'plantilla', _pl));
  if _r ~ '^[0-9]+$' then _id_pl2 := _r::bigint; end if;
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, true, %L::jsonb)::text', _id_pl2, '{"plantilla": "  Mis series  "}'));
  perform pg_temp.dice('4c. … y otra con el nombre que elige B: ' || coalesce((select '«' || nombre || '»' from plantilla_sesion where id = (pg_temp.j(_r)->>'plantilla')::bigint), _r));

  /* ── Rechazar y cancelar ── */
  _r := pg_temp.hacer(_a, format('select enviar_a_entrenador(%L, %L, %s)::text', _b, 'test', _test));
  if _r ~ '^[0-9]+$' then _id_rech := _r::bigint; end if;
  _r := pg_temp.hacer(_b, format('select contestar_envio(%s, false)::text', _id_rech));
  perform pg_temp.dice('4d. B rechaza: ' || coalesce(pg_temp.j(_r)->>'estado', _r) || '; no crea nada: ' || ((select resultado from envio_entrenador where id = _id_rech) is null)
    || '; y luego lo acepta: ' || pg_temp.como(_b, format('select contestar_envio(%s, true)', _id_rech)));
  _r := pg_temp.hacer(_a, format('select enviar_a_entrenador(%L, %L, %s)::text', _b, 'test', _test));
  if _r ~ '^[0-9]+$' then _id_canc := _r::bigint; end if;
  perform pg_temp.dice('4e. A cancela: ' || pg_temp.hacer(_a, format('select %L from (select cancelar_envio(%s)) x', 'ok', _id_canc))
    || ' → ' || (select estado from envio_entrenador where id = _id_canc)
    || '; B lo acepta después: ' || pg_temp.como(_b, format('select contestar_envio(%s, true)', _id_canc))
    || '; A cancela uno ya aceptado: ' || pg_temp.como(_a, format('select cancelar_envio(%s)', _id_z)));

  /* ── El «visto» de la respuesta ── */
  perform pg_temp.hacer(_b, format('select %L from (select envio_respuesta_vista(array[%s, %s]::bigint[])) x', 'ok', _id_z, _id_rech));
  perform pg_temp.dice('4f. B marca como vistas las respuestas de A: ' || (select count(*) from envio_entrenador where id in (_id_z, _id_rech) and respuesta_vista_en is not null) || ' marcadas');
  perform pg_temp.hacer(_a, format('select %L from (select envio_respuesta_vista(array[%s, %s, %s]::bigint[])) x', 'ok', _id_z, _id_rech, _id_canc));
  perform pg_temp.dice('4f. A las marca: ' || (select count(*) from envio_entrenador where id in (_id_z, _id_rech, _id_canc) and respuesta_vista_en is not null)
    || ' marcadas (la cancelada no cuenta)');
end $ensayo$;

/* El informe: un error a propósito que lo trae y deshace todo. */
do $fin$
begin
  raise exception 'INFORME:%', (select E'\n' || string_agg(linea, E'\n' order by orden) from _informe);
end $fin$;
