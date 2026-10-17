/* ============================================================
   ENSAYO de cupo-sin-evaluados.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada. Acaba en un error a propósito que trae
   el informe, y ese error lo deshace TODO.

   1. Lo que dice el panel /admin y el directorio, POR CADA ENTRENADOR, antes y
      después: solo puede cambiar en quien tiene evaluados (y debe bajar en
      cuántos tiene).
   2. CONTROL con la regla de hoy: un entrenador en su cupo no puede dar de
      alta a un evaluado (el fallo que se arregla), ni con un evaluado dentro y
      sitio para uno más puede dar de alta a uno de su equipo.
   3. La migración, con las mismas sentencias que el fichero.
   4. Las mismas puertas con la regla nueva, más la de atrás (pasar un evaluado
      a su equipo con el cupo lleno), y que en las funciones largas solo cambió
      el recuento: deshaciendo el cambio sobre la definición nueva sale la de hoy.

   «Entrenador normal» = sin plataforma_admin. No lleva ids escritos.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (e uuid, l uuid, adm uuid);
create temp table _panel (fase text, ent jsonb, cuentas jsonb, num jsonb, excedidos bigint);
create temp table _defs (firma text, def text);

create function pg_temp.como(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql;
    _res := 'ENTRA';
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := sqlstate; end if;
  end;
  perform set_config('role', 'postgres', true);
  return _res;
end $f$;

/* Lo que enseñan el panel /admin (visto por una cuenta de plataforma) y el directorio. */
create function pg_temp.panel(_fase text) returns void language plpgsql as $f$
declare _adm uuid; _ent jsonb; _cue jsonb; _num jsonb; _exc bigint;
begin
  select adm into _adm from _actores;
  perform set_config('request.jwt.claims', json_build_object('sub', _adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select jsonb_object_agg(x.id::text, x.n_deportistas) into _ent from public.admin_entrenadores() x;
  select jsonb_object_agg(x.id::text, x.n_deportistas) into _cue from public.admin_cuentas() x where x.rol = 'entrenador';
  select x.n into _exc from public.admin_salud() x where x.clave = 'cupo_excedido';
  perform set_config('role', 'postgres', true);
  select jsonb_object_agg(p.id::text, public.num_deportistas(p.id)) into _num from public.perfiles p where p.rol = 'entrenador';
  insert into _panel values (_fase, _ent, _cue, _num, _exc);
end $f$;

/* Las puertas, con la regla que haya. */
create function pg_temp.puertas(_fase text) returns void language plpgsql as $f$
declare _x record; _res text; _res4 text;
begin
  select * into _x from _actores;

  _res := pg_temp.como(_x.e, format($s$insert into public.deportista (id_entrenador, nombre, solo_test) values (%L, 'ENSAYO-CUPO evaluado', true)$s$, _x.e));
  insert into _informe (linea) values (format('%s · E (en su cupo) da de alta a un EVALUADO: %s', _fase, _res));

  _res := pg_temp.como(_x.e, format($s$insert into public.deportista (id_entrenador, nombre) values (%L, 'ENSAYO-CUPO equipo')$s$, _x.e));
  insert into _informe (linea) values (format('%s · E (en su cupo) da de alta a uno de su EQUIPO: %s', _fase, _res));

  _res := pg_temp.como(_x.e, format($s$do $t$ declare _ev bigint; begin
      insert into public.deportista (id_entrenador, nombre, solo_test) values (%L, 'ENSAYO-CUPO evaluado', true) returning id into _ev;
      update public.deportista set solo_test = false where id = _ev;
    end $t$$s$, _x.e));
  insert into _informe (linea) values (format('%s · E (en su cupo) da de alta a un evaluado y lo pasa a su equipo: %s', _fase, _res));

  /* L con sitio para UNO más (se le deja el cupo justo, como plataforma), y un evaluado dentro. */
  _res4 := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _x.adm, 'role', 'authenticated')::text, true);
    update public.perfiles set cupo_deportistas =
      (select count(*) from public.deportista where id_entrenador = _x.l and not solo_test) + 1 where id = _x.l;
    _res4 := pg_temp.como(_x.l, format($s$do $t$ begin
        insert into public.deportista (id_entrenador, nombre, solo_test) values (%L, 'ENSAYO-CUPO evaluado', true);
        insert into public.deportista (id_entrenador, nombre) values (%L, 'ENSAYO-CUPO equipo');
      end $t$$s$, _x.l, _x.l));
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res4 := 'MONTAJE ROTO ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  perform set_config('role', 'postgres', true);
  insert into _informe (linea) values (format('%s · L con sitio para uno más y un evaluado dentro da de alta a uno de su equipo: %s', _fase, _res4));
end $f$;

/* Los protagonistas */
do $sel$
declare _e uuid; _l uuid; _adm uuid;
begin
  /* E: entrenador normal justo en su cupo, solo con gente de su equipo */
  select p.id into _e from public.perfiles p
   where p.rol = 'entrenador' and p.cupo_deportistas >= 1
     and p.id not in (select id_perfil from public.plataforma_admin)
     and (select count(*) from public.deportista x where x.id_entrenador = p.id and not x.solo_test) = p.cupo_deportistas
   order by p.id limit 1;
  /* L: entrenador normal con alguien de su equipo y sitio en el cupo */
  select p.id into _l from public.perfiles p
   where p.rol = 'entrenador'
     and p.id not in (select id_perfil from public.plataforma_admin)
     and p.id is distinct from _e
     and exists (select 1 from public.deportista x where x.id_entrenador = p.id and not x.solo_test)
   order by p.id limit 1;
  /* Una cuenta de plataforma, para leer el panel y fijar el cupo como lo haría ella */
  select id_perfil into _adm from public.plataforma_admin order by id_perfil limit 1;

  if _e is null or _l is null or _adm is null then
    raise exception 'ENSAYO: no hay datos para montar el escenario (E %, L %, plataforma %)', _e, _l, _adm;
  end if;
  insert into _actores values (_e, _l, _adm);
  insert into _informe (linea) values (format('Protagonistas: E = entrenador normal %s justo en su cupo; L = entrenador normal %s con sitio',
    left(_e::text, 8), left(_l::text, 8)));

  insert into _defs
  select f, pg_get_functiondef(f::regprocedure) from unnest(array[
    'public.registrar_con_invitacion(text,text,boolean)', 'public.admin_cuentas()', 'public.admin_entrenadores()', 'public.admin_salud()']) f;
end $sel$;

/* 1 y 2. El panel y el CONTROL con la regla de hoy */
select pg_temp.panel('antes');
select pg_temp.puertas('HOY');

/* 3. La migración: MISMAS sentencias que cupo-sin-evaluados.sql */
create or replace function public.comprobar_cupo_entrenador()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _cupo int;
  _n    int;
begin
  if new.id_entrenador is null or new.solo_test then return new; end if;
  if tg_op = 'UPDATE' and not old.solo_test then return new; end if;

  select cupo_deportistas into _cupo from perfiles where id = new.id_entrenador;
  if _cupo is null then return new; end if;

  select count(*) into _n from deportista
   where id_entrenador = new.id_entrenador and not solo_test and id is distinct from new.id;
  if _n >= _cupo then
    raise exception 'Ese entrenador ha llegado a su límite de % deportistas', _cupo;
  end if;
  return new;
end $$;

drop trigger if exists trg_cupo_entrenador on public.deportista;
create trigger trg_cupo_entrenador before insert or update of solo_test on public.deportista
  for each row execute function public.comprobar_cupo_entrenador();

create or replace function public.num_deportistas(_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from deportista where id_entrenador = _id and not solo_test;
$$;

do $parche$
declare
  _f record; _def text; _veces int;
begin
  for _f in
    select * from (values
      (1, 'public.registrar_con_invitacion(text,text,boolean)',
          'select count(*) into _n_atletas from deportista where id_entrenador = _id_ent;',
          'select count(*) into _n_atletas from deportista where id_entrenador = _id_ent and not solo_test;'),
      (2, 'public.registrar_con_invitacion(text,text,boolean)',
          'select count(*) into _n_atletas from deportista where id_entrenador = _inv.id_entrenador;',
          'select count(*) into _n_atletas from deportista where id_entrenador = _inv.id_entrenador and not solo_test;'),
      (3, 'public.admin_cuentas()',
          '(select count(*) from deportista d2 where d2.id_entrenador = p.id)::bigint',
          '(select count(*) from deportista d2 where d2.id_entrenador = p.id and not d2.solo_test)::bigint'),
      (4, 'public.admin_entrenadores()',
          '(select count(*) from deportista d where d.id_entrenador = p.id)',
          '(select count(*) from deportista d where d.id_entrenador = p.id and not d.solo_test)'),
      (5, 'public.admin_salud()',
          '(select count(*) from deportista d where d.id_entrenador = p.id) > p.cupo_deportistas',
          '(select count(*) from deportista d where d.id_entrenador = p.id and not d.solo_test) > p.cupo_deportistas')
    ) as t(n, firma, viejo, nuevo)
    order by n
  loop
    _def := pg_get_functiondef(_f.firma::regprocedure);
    _veces := (length(_def) - length(replace(_def, _f.viejo, ''))) / length(_f.viejo);
    if _veces <> 1 then
      raise exception 'cupo_sin_evaluados: en % ese recuento aparece % veces (se esperaba 1)', _f.firma, _veces;
    end if;
    execute replace(_def, _f.viejo, _f.nuevo);
  end loop;
end $parche$;

/* 4. Las mismas puertas, el panel y el informe */
select pg_temp.panel('despues');
select pg_temp.puertas('NUEVA');

do $fin$
declare
  _r text; _fallos int := 0; _a record; _d record; _k text; _ev int; _mal boolean; _x record;
  _n int; _iguales boolean; _defs_ok int := 0; _num_e int; _equipo_e int;
begin
  select * into _x from _actores;

  /* Lo esperado de las puertas */
  for _a in
    select * from (values
      ('HOY · E (en su cupo) da de alta a un EVALUADO', 'P0001'),
      ('HOY · E (en su cupo) da de alta a uno de su EQUIPO', 'P0001'),
      ('HOY · L con sitio para uno más y un evaluado dentro da de alta a uno de su equipo', 'P0001'),
      ('NUEVA · E (en su cupo) da de alta a un EVALUADO', 'ENTRA'),
      ('NUEVA · E (en su cupo) da de alta a uno de su EQUIPO', 'P0001'),
      ('NUEVA · E (en su cupo) da de alta a un evaluado y lo pasa a su equipo', 'P0001'),
      ('NUEVA · L con sitio para uno más y un evaluado dentro da de alta a uno de su equipo', 'ENTRA')
    ) as t(que, esperado)
  loop
    select linea into _k from _informe where linea like _a.que || ':%';
    _mal := _k is null or _k not like '%: ' || _a.esperado;
    if _mal then
      _fallos := _fallos + 1;
      update _informe set linea = linea || format(' (se espera %s)   <<< FALLA', _a.esperado) where linea like _a.que || ':%';
    else
      update _informe set linea = linea || format(' (se espera %s)', _a.esperado) where linea like _a.que || ':%';
    end if;
  end loop;

  /* El directorio: E con un evaluado más sigue contando a los de su equipo */
  begin
    insert into public.deportista (id_entrenador, nombre, solo_test) values (_x.e, 'ENSAYO-CUPO evaluado', true);
    select public.num_deportistas(_x.e) into _num_e;
    select count(*) into _equipo_e from public.deportista where id_entrenador = _x.e and not solo_test;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _num_e := -1; end if;
  end;
  _mal := _num_e is distinct from _equipo_e;
  if _mal then _fallos := _fallos + 1; end if;
  insert into _informe (linea) values (format('Directorio: con un evaluado más, num_deportistas de E da %s y su equipo son %s%s',
    _num_e, _equipo_e, case when _mal then '   <<< FALLA' else '' end));

  /* Las funciones largas: deshaciendo el cambio sale la definición de hoy */
  for _a in select * from _defs loop
    _r := pg_get_functiondef(_a.firma::regprocedure);
    _r := replace(_r, 'where id_entrenador = _id_ent and not solo_test;', 'where id_entrenador = _id_ent;');
    _r := replace(_r, 'where id_entrenador = _inv.id_entrenador and not solo_test;', 'where id_entrenador = _inv.id_entrenador;');
    _r := replace(_r, 'd2.id_entrenador = p.id and not d2.solo_test)', 'd2.id_entrenador = p.id)');
    _r := replace(_r, 'd.id_entrenador = p.id and not d.solo_test)', 'd.id_entrenador = p.id)');
    _iguales := _r = _a.def and pg_get_functiondef(_a.firma::regprocedure) <> _a.def;
    if _iguales then _defs_ok := _defs_ok + 1; else _fallos := _fallos + 1; end if;
    insert into _informe (linea) values (format('Función %s: cambiada y, deshecho el recuento, idéntica a la de hoy: %s%s',
      _a.firma, _iguales, case when _iguales then '' else '   <<< FALLA' end));
  end loop;

  /* El panel: solo cambia en quien tiene evaluados, y baja en cuántos tiene */
  select * into _a from _panel where fase = 'antes';
  select * into _d from _panel where fase = 'despues';
  _n := 0;
  for _k in select jsonb_object_keys(_a.ent) loop
    select count(*) into _ev from public.deportista where id_entrenador = _k::uuid and solo_test;
    if (_a.ent->>_k)::int - (_d.ent->>_k)::int is distinct from _ev
       or (_a.num->>_k)::int - (_d.num->>_k)::int is distinct from _ev
       or (_a.cuentas->>_k)::int - (_d.cuentas->>_k)::int is distinct from _ev then
      _n := _n + 1;
      insert into _informe (linea) values (format('  panel de %s: antes %s/%s/%s, después %s/%s/%s, evaluados %s   <<< FALLA',
        left(_k, 8), _a.ent->>_k, _a.cuentas->>_k, _a.num->>_k, _d.ent->>_k, _d.cuentas->>_k, _d.num->>_k, _ev));
    elsif _ev > 0 then
      insert into _informe (linea) values (format('  panel de %s (tiene %s evaluados): pasa de %s a %s deportistas',
        left(_k, 8), _ev, _a.ent->>_k, _d.ent->>_k));
    end if;
  end loop;
  if _n > 0 then _fallos := _fallos + 1; end if;
  insert into _informe (linea) values (format('Panel y directorio: %s entrenadores comparados; los que no tienen evaluados dan lo mismo antes y después; con cambio inesperado: %s',
    (select count(*) from jsonb_object_keys(_a.ent)), _n));
  insert into _informe (linea) values (format('Aviso «por encima de su cupo»: antes %s, después %s', _a.excedidos, _d.excedidos));

  insert into _informe (linea) values (format('FALLOS: %s', _fallos));
  select string_agg(linea, chr(10) order by orden) into _r from _informe;
  raise exception using message = 'INFORME' || chr(10) || _r;
end $fin$;
