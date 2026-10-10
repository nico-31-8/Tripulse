/* ============================================================
   ENSAYO de test-medicion-solo-mis-deportistas.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: la regla nueva, las filas de prueba y las tablas temporales.

   1. Recuento, POR CADA CUENTA REAL (entrenadores y deportistas): cuántas
      mediciones ve, cuántos tests ve, y a cuántas mediciones llegaría un
      UPDATE y un DELETE suyos. Se hace pasar por cada uno igual que
      PostgREST: request.jwt.claims + role authenticated.
   2. CONTROL con la regla que haya: demuestra que el agujero existe y que
      este ensayo sabe verlo. Con la regla vieja tiene que decir ENTRA; si
      dijera 42501, las pruebas de después no demostrarían nada.
   3. La regla nueva, con las mismas sentencias que el fichero.
   4. El mismo recuento: tiene que salir IGUAL para todos.
   5. Las puertas, una a una y cada una deshecha: lo legítimo entra (atleta
      propio, evaluado, ficha de grupo, guardar dos veces el mismo día) y lo
      ajeno no. La 10 y la 11 montan un director con el acceso concedido y
      después negado (y lo deshacen).

   «Entrenador normal» = sin plataforma_admin. Los protagonistas se eligen
   solos con lo que haya en la base: no lleva ids escritos, porque el
   repositorio es público.

   Necesita director-1-base.sql aplicada (usa sus tablas y funciones).

   Deja huecos en los contadores de id (una secuencia no vuelve atrás).
   Es inofensivo.

   Ya aplicada la regla, sirve de comprobación: el CONTROL dirá 42501.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _gente as
  select p.id as uid, p.rol,
         exists (select 1 from public.plataforma_admin a where a.id_perfil = p.id) as admin
    from public.perfiles p;

create temp table _cuenta (fase text, uid uuid, ver_med int, ver_def int, cambiar_med int, borrar_med int);
create temp table _informe (orden serial, linea text);
create temp table _actores (a uuid, def_a bigint, propio_a bigint, def_otro bigint,
                            v bigint, ent_v uuid, usr_v uuid, b uuid, propio_b bigint, d uuid);

/* El recuento de una persona va dentro de un bloque que se deshace solo: el
   UPDATE y el DELETE solo cuentan a qué filas llegan. Con EXECUTE para que
   cada consulta se planifique de nuevo con la regla que haya en ese momento. */
create function pg_temp.contar(_fase text) returns void language plpgsql as $f$
declare
  _ids uuid[]; _u uuid;
  _vm int; _vd int; _cm int; _bm int;
begin
  select array_agg(uid order by uid) into _ids from _gente;
  foreach _u in array _ids loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      execute 'select count(*) from public.test_medicion' into _vm;
      execute 'select count(*) from public.test_definicion' into _vd;
      execute 'with x as (update public.test_medicion set datos = datos returning 1) select count(*) from x' into _cm;
      execute 'with x as (delete from public.test_medicion returning 1) select count(*) from x' into _bm;
      raise exception '__deshacer__';
    exception when others then
      if sqlerrm <> '__deshacer__' then raise; end if;
    end;
    perform set_config('role', 'postgres', true);
    insert into _cuenta values (_fase, _u, _vm, _vd, _cm, _bm);
  end loop;
end $f$;

/* Ejecuta una sentencia como esa persona y la deshace. Devuelve ENTRA o el
   código del error (42501 = la regla lo para). */
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

/* Los protagonistas */
do $sel$
declare
  _a uuid; _def_a bigint; _propio_a bigint; _def_otro bigint;
  _v bigint; _ent_v uuid; _usr_v uuid; _b uuid; _propio_b bigint; _d uuid;
begin
  /* A: entrenador normal con un test propio y un atleta propio */
  select t.id_entrenador, t.id into _a, _def_a
    from public.test_definicion t
   where t.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and exists (select 1 from public.perfiles p where p.id = t.id_entrenador and p.rol = 'entrenador')
     and exists (select 1 from public.deportista x
                  where x.id_entrenador = t.id_entrenador and not x.solo_test and x.id_grupo is null)
   order by t.id limit 1;

  select x.id into _propio_a from public.deportista x
   where x.id_entrenador = _a and not x.solo_test and x.id_grupo is null
   order by x.id limit 1;

  /* un test que NO es de A */
  select t.id into _def_otro from public.test_definicion t
   where t.id_entrenador <> _a order by t.id limit 1;

  /* V: atleta AJENO a A, con cuenta, de un entrenador normal */
  select x.id, x.id_entrenador, x.id_usuario into _v, _ent_v, _usr_v
    from public.deportista x
   where x.id_entrenador is not null and x.id_entrenador <> _a
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and x.id_usuario is not null and x.id_usuario <> x.id_entrenador and x.id_usuario <> _a
     and x.id_grupo is null and not x.solo_test
   order by x.id limit 1;

  /* B: una cuenta de DEPORTISTA con su ficha, que no es V ni lo entrena */
  select p.id, x.id into _b, _propio_b
    from public.perfiles p join public.deportista x on x.id_usuario = p.id
   where p.rol = 'deportista'
     and p.id not in (select id_perfil from public.plataforma_admin)
     and x.id_entrenador is distinct from p.id
     and p.id <> _usr_v and p.id <> _ent_v and x.id <> _v
   order by x.id limit 1;

  /* D: otro entrenador normal, que en la puerta 10 hará de director de V */
  select p.id into _d
    from public.perfiles p
   where p.rol = 'entrenador'
     and p.id not in (select id_perfil from public.plataforma_admin)
     and p.id <> _a and p.id <> _ent_v
     and not exists (select 1 from public.director r where r.id_perfil = p.id)
   order by p.id limit 1;

  if _a is null or _propio_a is null or _def_otro is null or _v is null or _b is null or _d is null then
    raise exception 'ENSAYO: no hay datos para montar el escenario (A %, propio %, otro test %, V %, B %, D %)',
      _a, _propio_a, _def_otro, _v, _b, _d;
  end if;

  insert into _actores values (_a, _def_a, _propio_a, _def_otro, _v, _ent_v, _usr_v, _b, _propio_b, _d);
  insert into _informe (linea) values (format(
    'Protagonistas: A = entrenador normal %s (test propio + atleta propio); atleta ajeno con cuenta, de %s; B = cuenta de deportista %s; D = entrenador normal %s',
    left(_a::text, 8), left(_ent_v::text, 8), left(_b::text, 8), left(_d::text, 8)));
end $sel$;

/* 1. Recuento con la regla de hoy */
select pg_temp.contar('antes');

/* 2. CONTROL: el agujero, con la regla de hoy */
do $ctl$
declare
  _a uuid; _def_a bigint; _v bigint; _ent_v uuid; _usr_v uuid; _b uuid;
  _r text; _n int; _n2 int; _def_b bigint; _nueva boolean;
begin
  select a, def_a, v, ent_v, usr_v, b into _a, _def_a, _v, _ent_v, _usr_v, _b from _actores;
  select coalesce(with_check, '') like '%auth_dep_ids%' into _nueva
    from pg_policies where schemaname = 'public' and tablename = 'test_medicion' and policyname = 'test_medicion_suyo';
  _r := case when _nueva then 'CONTROL (la regla de hoy YA es la nueva): ' else 'CONTROL con la regla de HOY: ' end;
  begin
    perform set_config('role', 'authenticated', true);

    perform set_config('request.jwt.claims', json_build_object('sub', _ent_v, 'role', 'authenticated')::text, true);
    select count(*) into _n from public.test_definicion where id = _def_a;
    _r := _r || format('el entrenador del atleta ajeno ve el test de A: %s', _n);

    perform set_config('request.jwt.claims', json_build_object('sub', _a, 'role', 'authenticated')::text, true);
    begin
      insert into public.test_medicion (id_definicion, id_deportista, fecha, datos)
      values (_def_a, _v, date '1900-01-01', '{"ensayo": 1}');
      _r := _r || ' | A, con su test, a un atleta ajeno: ENTRA';
    exception when others then
      _r := _r || ' | A, con su test, a un atleta ajeno: ' || sqlstate;
    end;

    perform set_config('request.jwt.claims', json_build_object('sub', _ent_v, 'role', 'authenticated')::text, true);
    select count(*) into _n from public.test_medicion where id_definicion = _def_a and id_deportista = _v;
    select count(*) into _n2 from public.test_definicion where id = _def_a;
    _r := _r || format(' | su entrenador ve la medición: %s y el test de A: %s', _n, _n2);

    perform set_config('request.jwt.claims', json_build_object('sub', _usr_v, 'role', 'authenticated')::text, true);
    select count(*) into _n from public.test_medicion where id_definicion = _def_a and id_deportista = _v;
    select count(*) into _n2 from public.test_definicion where id = _def_a;
    _r := _r || format(' | el atleta ve la medición: %s y el test de A: %s', _n, _n2);

    perform set_config('request.jwt.claims', json_build_object('sub', _b, 'role', 'authenticated')::text, true);
    begin
      insert into public.test_definicion (id_entrenador, nombre) values (_b, 'ENSAYO-RLS') returning id into _def_b;
      _r := _r || ' | un deportista se crea un test: SÍ';
    exception when others then
      _r := _r || ' | un deportista se crea un test: ' || sqlstate;
    end;
    if _def_b is not null then
      begin
        insert into public.test_medicion (id_definicion, id_deportista, fecha) values (_def_b, _v, date '1900-01-01');
        _r := _r || ' | y se lo apunta a un atleta ajeno: ENTRA';
      exception when others then
        _r := _r || ' | y se lo apunta a un atleta ajeno: ' || sqlstate;
      end;
    end if;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _r := _r || ' | CONTROL ROTO: ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  perform set_config('role', 'postgres', true);
  insert into _informe (linea) values (_r);
end $ctl$;

/* 3. La regla nueva: MISMAS sentencias que test-medicion-solo-mis-deportistas.sql */
drop policy if exists test_medicion_suyo on public.test_medicion;

create policy test_medicion_suyo on public.test_medicion
  for all
  to authenticated
  using (
    exists (select 1 from public.test_definicion d
             where d.id = test_medicion.id_definicion
               and d.id_entrenador = (select auth.uid()))
    and id_deportista in (select public.auth_dep_ids())
  )
  with check (
    exists (select 1 from public.test_definicion d
             where d.id = test_medicion.id_definicion
               and d.id_entrenador = (select auth.uid()))
    and id_deportista in (select public.auth_dep_ids())
  );

/* 4. El mismo recuento */
select pg_temp.contar('despues');

/* 5. Las puertas, y el informe */
do $fin$
declare
  _x record; _p record; _res text; _fallos int := 0; _dif int; _personas int; _pol boolean; _r text;
  _tiene boolean; _mal boolean; _res2 text; _def_d bigint; _av0 int; _avisos int;
begin
  select * into _x from _actores;

  for _p in
    select * from (values
      (1, 'A, con su test, a un atleta AJENO', '42501', _x.a,
          format($s$insert into public.test_medicion (id_definicion, id_deportista, fecha) values (%s, %s, '1900-01-01')$s$,
                 _x.def_a, _x.v)),
      (2, 'A, con su test, a un atleta SUYO', 'ENTRA', _x.a,
          format($s$insert into public.test_medicion (id_definicion, id_deportista, fecha) values (%s, %s, '1900-01-01')$s$,
                 _x.def_a, _x.propio_a)),
      (3, 'A guarda dos veces el mismo día, como la app (upsert)', 'ENTRA', _x.a,
          format($s$do $t$ begin
             insert into public.test_medicion (id_definicion, id_deportista, fecha, datos) values (%s, %s, '1900-01-01', '{"v": 1}')
               on conflict (id_definicion, id_deportista, fecha) do update set id_definicion = excluded.id_definicion,
               id_deportista = excluded.id_deportista, fecha = excluded.fecha, datos = excluded.datos;
             insert into public.test_medicion (id_definicion, id_deportista, fecha, datos) values (%s, %s, '1900-01-01', '{"v": 2}')
               on conflict (id_definicion, id_deportista, fecha) do update set id_definicion = excluded.id_definicion,
               id_deportista = excluded.id_deportista, fecha = excluded.fecha, datos = excluded.datos;
           end $t$$s$, _x.def_a, _x.propio_a, _x.def_a, _x.propio_a)),
      (4, 'A pasa una medición suya a un atleta AJENO (update)', '42501', _x.a,
          format($s$do $t$ declare _id bigint; _n int; begin
             insert into public.test_medicion (id_definicion, id_deportista, fecha) values (%s, %s, '1900-01-02') returning id into _id;
             update public.test_medicion set id_deportista = %s where id = _id;
             get diagnostics _n = row_count;
             if _n = 0 then raise exception 'el update no llegó a la fila'; end if;
           end $t$$s$, _x.def_a, _x.propio_a, _x.v)),
      (5, 'A a un EVALUADO suyo (solo_test)', 'ENTRA', _x.a,
          format($s$do $t$ declare _e bigint; begin
             insert into public.deportista (id_entrenador, nombre, solo_test) values (%L, 'ENSAYO-RLS evaluado', true) returning id into _e;
             insert into public.test_medicion (id_definicion, id_deportista, fecha) values (%s, _e, '1900-01-01');
           end $t$$s$, _x.a, _x.def_a)),
      (6, 'A a la ficha de un GRUPO suyo', 'ENTRA', _x.a,
          format($s$do $t$ declare _g uuid; _f integer; begin
             insert into public.grupo_entreno (id_entrenador, nombre) values (%L, 'ENSAYO-RLS grupo') returning id into _g;
             _f := public.ficha_de_grupo(_g);
             insert into public.test_medicion (id_definicion, id_deportista, fecha) values (%s, _f, '1900-01-01');
           end $t$$s$, _x.a, _x.def_a)),
      (7, 'A, con un test que NO es suyo, a un atleta suyo', '42501', _x.a,
          format($s$insert into public.test_medicion (id_definicion, id_deportista, fecha) values (%s, %s, '1900-01-01')$s$,
                 _x.def_otro, _x.propio_a)),
      (8, 'Un deportista se crea un test y se lo apunta a un atleta AJENO', '42501', _x.b,
          format($s$do $t$ declare _d bigint; begin
             insert into public.test_definicion (id_entrenador, nombre) values (%L, 'ENSAYO-RLS') returning id into _d;
             insert into public.test_medicion (id_definicion, id_deportista, fecha) values (_d, %s, '1900-01-01');
           end $t$$s$, _x.b, _x.v)),
      (9, 'El mismo deportista, en SU PROPIA ficha (queda permitido)', 'ENTRA', _x.b,
          format($s$do $t$ declare _d bigint; begin
             insert into public.test_definicion (id_entrenador, nombre) values (%L, 'ENSAYO-RLS') returning id into _d;
             insert into public.test_medicion (id_definicion, id_deportista, fecha) values (_d, %s, '1900-01-01');
           end $t$$s$, _x.b, _x.propio_b))
    ) as t(n, que, esperado, quien, sentencia)
    order by n
  loop
    _res := pg_temp.como(_p.quien, _p.sentencia);
    if _res is distinct from _p.esperado then _fallos := _fallos + 1; end if;
    insert into _informe (linea) values (format('%s. %s: %s (se espera %s)%s',
      _p.n, _p.que, _res, _p.esperado,
      case when _res is distinct from _p.esperado then '   <<< FALLA' else '' end));
  end loop;

  /* 10 y 11. D hace de DIRECTOR del entrenador de V con el acceso a V
     concedido, y después el entrenador se lo niega. Se monta aquí y se
     deshace. Primero se comprueba que el montaje funciona (V está en su
     auth_dep_ids), para que el resultado no salga de un director mal montado. */
  _res := null; _res2 := null; _tiene := null; _avisos := null;
  begin
    insert into public.director (id_perfil) values (_x.d);
    insert into public.director_entrenador (id_director, id_entrenador, estado) values (_x.d, _x.ent_v, 'activo');
    insert into public.director_acceso (id_director, id_deportista, estado) values (_x.d, _x.v, 'concedido');
    select count(*) into _av0 from public.aviso_director;

    perform set_config('request.jwt.claims', json_build_object('sub', _x.d, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select _x.v in (select public.auth_dep_ids()) into _tiene;
    insert into public.test_definicion (id_entrenador, nombre) values (_x.d, 'ENSAYO-RLS director') returning id into _def_d;
    begin
      insert into public.test_medicion (id_definicion, id_deportista, fecha) values (_def_d, _x.v, date '1900-01-01');
      _res := 'ENTRA';
    exception when others then
      _res := sqlstate;
    end;
    perform set_config('role', 'postgres', true);
    select count(*) - _av0 into _avisos from public.aviso_director;

    update public.director_acceso set estado = 'denegado' where id_director = _x.d and id_deportista = _x.v;
    perform set_config('role', 'authenticated', true);
    begin
      insert into public.test_medicion (id_definicion, id_deportista, fecha) values (_def_d, _x.v, date '1900-01-02');
      _res2 := 'ENTRA';
    exception when others then
      _res2 := sqlstate;
    end;
    perform set_config('role', 'postgres', true);
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := 'MONTAJE ROTO ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  _mal := _tiene is distinct from true or _res is distinct from 'ENTRA' or _avisos is distinct from 2;
  if _mal then _fallos := _fallos + 1; end if;
  insert into _informe (linea) values (format(
    '10. Un DIRECTOR con el acceso concedido (lo tiene en auth_dep_ids: %s), con su test, a ese deportista: %s, y deja %s avisos (se espera ENTRA y 2: entrenador y deportista)%s',
    _tiene, _res, _avisos, case when _mal then '   <<< FALLA' else '' end));
  _mal := _res2 is distinct from '42501';
  if _mal then _fallos := _fallos + 1; end if;
  insert into _informe (linea) values (format(
    '11. El mismo director cuando el entrenador le niega el acceso: %s (se espera 42501)%s',
    _res2, case when _mal then '   <<< FALLA' else '' end));

  select count(distinct uid) into _personas from _cuenta;
  select count(*) into _dif
    from _cuenta a join _cuenta d on d.uid = a.uid and d.fase = 'despues'
   where a.fase = 'antes'
     and (a.ver_med, a.ver_def, a.cambiar_med, a.borrar_med)
         is distinct from (d.ver_med, d.ver_def, d.cambiar_med, d.borrar_med);
  if _dif > 0 then _fallos := _fallos + 1; end if;

  insert into _informe (linea)
  select format('%s, %s (%s cuentas): ven %s mediciones y %s tests; un UPDATE llegaría a %s y un DELETE a %s',
                upper(c.fase), g.rol, count(*), sum(c.ver_med), sum(c.ver_def), sum(c.cambiar_med), sum(c.borrar_med))
    from _cuenta c join _gente g on g.uid = c.uid
   group by c.fase, g.rol
   order by c.fase, g.rol;

  insert into _informe (linea) values (format('Personas comparadas: %s. Con alguna diferencia antes/después: %s', _personas, _dif));

  insert into _informe (linea)
  select format('  diferencia en %s: antes %s/%s/%s/%s, después %s/%s/%s/%s', left(a.uid::text, 8),
                a.ver_med, a.ver_def, a.cambiar_med, a.borrar_med, d.ver_med, d.ver_def, d.cambiar_med, d.borrar_med)
    from _cuenta a join _cuenta d on d.uid = a.uid and d.fase = 'despues'
   where a.fase = 'antes'
     and (a.ver_med, a.ver_def, a.cambiar_med, a.borrar_med)
         is distinct from (d.ver_med, d.ver_def, d.cambiar_med, d.borrar_med);

  select coalesce(qual, '') ~ 'auth_dep_ids\(\)'
     and coalesce(with_check, '') ~ 'auth_dep_ids\(\)' into _pol
    from pg_policies where schemaname = 'public' and tablename = 'test_medicion' and policyname = 'test_medicion_suyo';
  insert into _informe (linea) values (format('Durante el ensayo la regla mira el atleta (USING y CHECK): %s', coalesce(_pol, false)));
  if not coalesce(_pol, false) then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('FALLOS: %s', _fallos));

  select string_agg(linea, chr(10) order by orden) into _r from _informe;
  raise exception using message = 'INFORME' || chr(10) || _r;
end $fin$;
