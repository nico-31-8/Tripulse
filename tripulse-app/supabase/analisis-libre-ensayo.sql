/* ============================================================
   ENSAYO de analisis-libre.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: las tablas nuevas, la regla del almacén, las filas de prueba y las
   tablas temporales.

   1. Recuento, POR CADA CUENTA REAL: cuántos objetos del almacén
      «fotogramas» ve. Se hace pasar por cada una igual que PostgREST.
   2. CONTROL con la regla de hoy: el propio deportista lee un objeto de una
      carpeta «libre-…» de su ficha. Tiene que decir que lo ve: es lo que
      cierra la migración. Si no lo viera, el ensayo estaría mal montado.
   3. La migración, con las mismas sentencias que el fichero.
   4. El mismo recuento: tiene que salir IGUAL para todos.
   5. Las puertas, una a una y cada una deshecha: lo legítimo entra (su
      deportista, un evaluado, cambiar y borrar lo suyo, el director con el
      acceso concedido) y lo demás no (un deportista ajeno, el propio
      deportista, un fotograma de otro deportista o con la imagen fuera de su
      carpeta, el director sin acceso). Y lo que ve cada uno.

   «Entrenador normal» = sin plataforma_admin. Los protagonistas se eligen
   solos con lo que haya en la base: no lleva ids escritos, porque el
   repositorio es público.

   Deja huecos en los contadores de id (una secuencia no vuelve atrás).
   Es inofensivo.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _gente as
  select p.id as uid, p.rol,
         exists (select 1 from public.plataforma_admin a where a.id_perfil = p.id) as admin
    from public.perfiles p;

create temp table _cuenta (fase text, uid uuid, ver_obj int);
create temp table _informe (orden serial, linea text);
create temp table _actores (e uuid, p bigint, usr_p uuid, v bigint, ent_v uuid, d uuid, l uuid);

/* Lo que ve una persona del almacén, haciéndose pasar por ella. */
create function pg_temp.contar(_fase text) returns void language plpgsql as $f$
declare _ids uuid[]; _u uuid; _vo int;
begin
  select array_agg(uid order by uid) into _ids from _gente;
  foreach _u in array _ids loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      execute $q$select count(*) from storage.objects where bucket_id = 'fotogramas'$q$ into _vo;
      raise exception '__deshacer__';
    exception when others then
      if sqlerrm <> '__deshacer__' then raise; end if;
    end;
    perform set_config('role', 'postgres', true);
    insert into _cuenta values (_fase, _u, _vo);
  end loop;
end $f$;

/* Ejecuta una sentencia como esa persona y la deshace. Devuelve ENTRA o el
   código del error (42501 = la regla lo para; 23514 = lo para una comprobación). */
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

/* Lo que ve una persona de una consulta, y vuelta a postgres. */
create function pg_temp.ve(_quien uuid, _sql text) returns int language plpgsql as $f$
declare _n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute _sql into _n;
  perform set_config('role', 'postgres', true);
  return _n;
end $f$;

/* Los protagonistas */
do $sel$
declare _e uuid; _p bigint; _usr_p uuid; _v bigint; _ent_v uuid; _d uuid; _l uuid;
begin
  /* P: ficha con cuenta de deportista, de un entrenador normal E que no es él mismo */
  select x.id, x.id_usuario, x.id_entrenador into _p, _usr_p, _e
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
    join public.perfiles pu on pu.id = x.id_usuario and pu.rol = 'deportista'
   where x.id_grupo is null and not x.solo_test
     and x.id_usuario <> x.id_entrenador
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and x.id_usuario not in (select id_perfil from public.plataforma_admin)
   order by x.id limit 1;

  /* V: ficha de OTRO entrenador normal */
  select x.id, x.id_entrenador into _v, _ent_v
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
   where x.id_entrenador <> _e and x.id_grupo is null and not x.solo_test
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and (x.id_usuario is null or x.id_usuario <> _e)
   order by x.id limit 1;

  /* D: otro entrenador normal, que en la puerta 12 hará de director del entrenador de V */
  select p.id into _d from public.perfiles p
   where p.rol = 'entrenador'
     and p.id not in (select id_perfil from public.plataforma_admin)
     and p.id <> _e and p.id <> _ent_v
     and not exists (select 1 from public.director r where r.id_perfil = p.id)
   order by p.id limit 1;

  /* L: entrenador normal con hueco para dos fichas en su cupo: las personas
     externas son evaluados, y un evaluado cuenta en el cupo (regla de antes). */
  select p.id into _l from public.perfiles p
   where p.rol = 'entrenador'
     and p.id not in (select id_perfil from public.plataforma_admin)
     and (p.cupo_deportistas is null
          or p.cupo_deportistas - (select count(*) from public.deportista x where x.id_entrenador = p.id) >= 2)
   order by p.id limit 1;

  if _e is null or _p is null or _v is null or _d is null or _l is null then
    raise exception 'ENSAYO: no hay datos para montar el escenario (E %, P %, V %, D %, L %)', _e, _p, _v, _d, _l;
  end if;

  insert into _actores values (_e, _p, _usr_p, _v, _ent_v, _d, _l);
  insert into _informe (linea) values (format(
    'Protagonistas: E = entrenador normal %s con su deportista P (con cuenta %s); V = deportista de otro entrenador normal %s; D = entrenador normal %s; L = entrenador normal %s con hueco en su cupo',
    left(_e::text, 8), left(_usr_p::text, 8), left(_ent_v::text, 8), left(_d::text, 8), left(_l::text, 8)));
end $sel$;

/* 1. Recuento con la regla de hoy */
select pg_temp.contar('antes');

/* 2. CONTROL: con la regla de hoy, el deportista lee las carpetas «libre-…» de su ficha */
do $ctl$
declare _x record; _np int; _ne int; _r text;
begin
  select * into _x from _actores;
  begin
    insert into storage.objects (bucket_id, name) values
      ('fotogramas', _x.p || '/0/ensayo-bateria.jpg'),
      ('fotogramas', _x.p || '/libre-0/ensayo-libre.jpg');
    _np := pg_temp.ve(_x.usr_p, format($q$select count(*) from storage.objects where bucket_id = 'fotogramas' and name like '%s/%%/ensayo-%%'$q$, _x.p));
    _ne := pg_temp.ve(_x.e, format($q$select count(*) from storage.objects where bucket_id = 'fotogramas' and name like '%s/%%/ensayo-%%'$q$, _x.p));
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _r := 'CONTROL ROTO: ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  perform set_config('role', 'postgres', true);
  insert into _informe (linea) values (coalesce(_r, format(
    'CONTROL con la regla de HOY: de los dos objetos de prueba de su carpeta (uno de batería y uno «libre-»), el deportista ve %s y su entrenador %s (se espera 2 y 2: hoy el deportista lo ve todo)%s',
    _np, _ne, case when _np is distinct from 2 or _ne is distinct from 2 then '   <<< CONTROL NO VE EL AGUJERO' else '' end)));
end $ctl$;

/* 3. La migración: MISMAS sentencias que analisis-libre.sql */
create table if not exists public.analisis_libre (
  id bigint generated by default as identity primary key,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  vista text not null default 'perfil' check (vista in ('perfil', 'frente', 'espalda', 'atras', 'arriba')),
  notas text check (notas is null or length(notas) <= 4000),
  fecha date not null default current_date,
  creado_por uuid default auth.uid(),
  actualizada_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists analisis_libre_dep on public.analisis_libre (id_deportista, fecha desc);

create table if not exists public.analisis_libre_fotograma (
  id bigint generated by default as identity primary key,
  id_analisis bigint not null references public.analisis_libre(id) on delete cascade,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  segundo numeric check (segundo is null or segundo >= 0),
  medidas jsonb check (medidas is null or jsonb_typeof(medidas) = 'array'),
  dibujo jsonb check (dibujo is null or jsonb_typeof(dibujo) = 'array'),
  imagen text check (imagen is null or imagen like (id_deportista::text || '/libre-' || id_analisis::text || '/%')),
  created_at timestamptz not null default now()
);
create index if not exists analisis_libre_fotograma_analisis on public.analisis_libre_fotograma (id_analisis);
create index if not exists analisis_libre_fotograma_dep on public.analisis_libre_fotograma (id_deportista);

create or replace function public.analisis_libre_fotograma_mismo_deportista()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.id_deportista is distinct from
     (select a.id_deportista from analisis_libre a where a.id = new.id_analisis) then
    raise exception 'El fotograma no es del mismo deportista que su análisis' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists analisis_libre_fotograma_mismo_deportista on public.analisis_libre_fotograma;
create trigger analisis_libre_fotograma_mismo_deportista before insert or update on public.analisis_libre_fotograma
  for each row execute function public.analisis_libre_fotograma_mismo_deportista();

alter table public.analisis_libre enable row level security;
alter table public.analisis_libre_fotograma enable row level security;

drop policy if exists analisis_libre_quien_valora on public.analisis_libre;
create policy analisis_libre_quien_valora on public.analisis_libre for all to authenticated
  using (id_deportista in (select auth_dep_ids())
         and id_deportista not in (select d.id from deportista d where d.id_usuario = (select auth.uid()) and d.id_entrenador is distinct from (select auth.uid())))
  with check (id_deportista in (select auth_dep_ids())
         and id_deportista not in (select d.id from deportista d where d.id_usuario = (select auth.uid()) and d.id_entrenador is distinct from (select auth.uid())));

drop policy if exists analisis_libre_fotograma_quien_valora on public.analisis_libre_fotograma;
create policy analisis_libre_fotograma_quien_valora on public.analisis_libre_fotograma for all to authenticated
  using (id_deportista in (select auth_dep_ids())
         and id_deportista not in (select d.id from deportista d where d.id_usuario = (select auth.uid()) and d.id_entrenador is distinct from (select auth.uid())))
  with check (id_deportista in (select auth_dep_ids())
         and id_deportista not in (select d.id from deportista d where d.id_usuario = (select auth.uid()) and d.id_entrenador is distinct from (select auth.uid())));

revoke all on public.analisis_libre, public.analisis_libre_fotograma from anon;
grant select, insert, update, delete on public.analisis_libre, public.analisis_libre_fotograma to authenticated;

drop trigger if exists trg_cambio_director on public.analisis_libre;
create trigger trg_cambio_director after insert or delete or update on public.analisis_libre
  for each row execute function registrar_cambio_director('test', 'false');

drop policy if exists fotogramas_ver on storage.objects;
create policy fotogramas_ver on storage.objects for select to authenticated
  using (bucket_id = 'fotogramas'
         and (storage.foldername(name))[1] in (select a::text from auth_dep_ids() a)
         and not (coalesce((storage.foldername(name))[2], '') like 'libre-%'
                  and (storage.foldername(name))[1] in (select d.id::text from public.deportista d
                                                          where d.id_usuario = (select auth.uid())
                                                            and d.id_entrenador is distinct from (select auth.uid()))));

/* 4. El mismo recuento */
select pg_temp.contar('despues');

/* 5. Las puertas, y el informe */
do $fin$
declare
  _x record; _p record; _res text; _fallos int := 0; _dif int; _personas int; _r text; _mal boolean;
  _a1 bigint; _va int; _vf int; _cambia int; _ea int; _ef int; _res2 text; _np int; _ne int;
  _tiene boolean; _avisos int; _av0 int;
begin
  select * into _x from _actores;

  for _p in
    select * from (values
      (1, 'E crea un análisis de su deportista P', 'ENTRA', _x.e,
          format($s$insert into public.analisis_libre (id_deportista, titulo) values (%s, 'ENSAYO')$s$, _x.p)),
      (2, 'E guarda un fotograma con la imagen en la carpeta de su análisis', 'ENTRA', _x.e,
          format($s$do $t$ declare _a bigint; begin
             insert into public.analisis_libre (id_deportista, titulo) values (%s, 'ENSAYO') returning id into _a;
             insert into public.analisis_libre_fotograma (id_analisis, id_deportista, segundo, medidas, imagen)
               values (_a, %s, 1.5, '[]', %s || '/libre-' || _a || '/1.jpg');
           end $t$$s$, _x.p, _x.p, _x.p)),
      (3, 'E cambia las notas de su análisis y lo borra', 'ENTRA', _x.e,
          format($s$do $t$ declare _a bigint; _n int; begin
             insert into public.analisis_libre (id_deportista, titulo) values (%s, 'ENSAYO') returning id into _a;
             update public.analisis_libre set notas = 'ensayo' where id = _a;
             get diagnostics _n = row_count; if _n = 0 then raise exception 'el update no llegó a la fila'; end if;
             delete from public.analisis_libre where id = _a;
             get diagnostics _n = row_count; if _n = 0 then raise exception 'el delete no llegó a la fila'; end if;
           end $t$$s$, _x.p)),
      (4, 'E crea un análisis de un deportista AJENO (V)', '42501', _x.e,
          format($s$insert into public.analisis_libre (id_deportista, titulo) values (%s, 'ENSAYO')$s$, _x.v)),
      (5, 'L crea un EVALUADO (persona externa) y su análisis', 'ENTRA', _x.l,
          format($s$do $t$ declare _ev bigint; begin
             insert into public.deportista (id_entrenador, nombre, solo_test) values (%L, 'ENSAYO-RLS externo', true) returning id into _ev;
             insert into public.analisis_libre (id_deportista, titulo) values (_ev, 'ENSAYO');
           end $t$$s$, _x.l)),
      (6, 'L cuelga un fotograma del análisis de un evaluado diciendo que es de OTRO evaluado suyo', '23514', _x.l,
          format($s$do $t$ declare _a bigint; _e1 bigint; _e2 bigint; begin
             insert into public.deportista (id_entrenador, nombre, solo_test) values (%L, 'ENSAYO-RLS externo 1', true) returning id into _e1;
             insert into public.deportista (id_entrenador, nombre, solo_test) values (%L, 'ENSAYO-RLS externo 2', true) returning id into _e2;
             insert into public.analisis_libre (id_deportista, titulo) values (_e1, 'ENSAYO') returning id into _a;
             insert into public.analisis_libre_fotograma (id_analisis, id_deportista) values (_a, _e2);
           end $t$$s$, _x.l, _x.l)),
      (7, 'E guarda un fotograma con la imagen FUERA de la carpeta de su análisis', '23514', _x.e,
          format($s$do $t$ declare _a bigint; begin
             insert into public.analisis_libre (id_deportista, titulo) values (%s, 'ENSAYO') returning id into _a;
             insert into public.analisis_libre_fotograma (id_analisis, id_deportista, imagen) values (_a, %s, %s || '/0/1.jpg');
           end $t$$s$, _x.p, _x.p, _x.p)),
      (8, 'El propio deportista P se crea un análisis', '42501', _x.usr_p,
          format($s$insert into public.analisis_libre (id_deportista, titulo) values (%s, 'ENSAYO')$s$, _x.p))
    ) as t(n, que, esperado, quien, sentencia)
    order by n
  loop
    _res := pg_temp.como(_p.quien, _p.sentencia);
    if _res is distinct from _p.esperado then _fallos := _fallos + 1; end if;
    insert into _informe (linea) values (format('%s. %s: %s (se espera %s)%s',
      _p.n, _p.que, _res, _p.esperado,
      case when _res is distinct from _p.esperado then '   <<< FALLA' else '' end));
  end loop;

  /* 9 y 10. Lo que ve cada uno de un análisis de P con su fotograma (los crea
     postgres), y si el propio deportista puede tocarlo. */
  _va := null; _vf := null; _cambia := null; _res2 := null; _ea := null; _ef := null;
  begin
    insert into public.analisis_libre (id_deportista, titulo) values (_x.p, 'ENSAYO') returning id into _a1;
    insert into public.analisis_libre_fotograma (id_analisis, id_deportista, medidas) values (_a1, _x.p, '[]');
    _va := pg_temp.ve(_x.usr_p, format('select count(*) from public.analisis_libre where id = %s', _a1));
    _vf := pg_temp.ve(_x.usr_p, format('select count(*) from public.analisis_libre_fotograma where id_analisis = %s', _a1));
    _cambia := pg_temp.ve(_x.usr_p, format($q$with c as (update public.analisis_libre set notas = 'deportista' where id = %s returning 1) select count(*) from c$q$, _a1));
    _res2 := pg_temp.como(_x.usr_p, format('insert into public.analisis_libre_fotograma (id_analisis, id_deportista) values (%s, %s)', _a1, _x.p));
    _ea := pg_temp.ve(_x.e, format('select count(*) from public.analisis_libre where id = %s', _a1));
    _ef := pg_temp.ve(_x.e, format('select count(*) from public.analisis_libre_fotograma where id_analisis = %s', _a1));
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res2 := 'MONTAJE ROTO ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  perform set_config('role', 'postgres', true);
  _mal := _va is distinct from 0 or _vf is distinct from 0 or _cambia is distinct from 0 or _res2 not in ('42501', '23514');
  if _mal then _fallos := _fallos + 1; end if;
  insert into _informe (linea) values (format(
    '9. El propio deportista, de un análisis de su ficha: ve %s análisis y %s fotogramas, su UPDATE llega a %s filas y colgarle un fotograma da %s (se espera 0, 0, 0 y bloqueado)%s',
    _va, _vf, _cambia, _res2, case when _mal then '   <<< FALLA' else '' end));
  _mal := _ea is distinct from 1 or _ef is distinct from 1;
  if _mal then _fallos := _fallos + 1; end if;
  insert into _informe (linea) values (format(
    '10. Su entrenador, del mismo análisis: ve %s análisis y %s fotogramas (se espera 1 y 1)%s',
    _ea, _ef, case when _mal then '   <<< FALLA' else '' end));

  /* 11. El almacén con la regla nueva: el deportista ya no ve la carpeta «libre-…», sí la de la batería */
  _np := null; _ne := null; _r := null;
  begin
    insert into storage.objects (bucket_id, name) values
      ('fotogramas', _x.p || '/0/ensayo-bateria.jpg'),
      ('fotogramas', _x.p || '/libre-0/ensayo-libre.jpg');
    _np := pg_temp.ve(_x.usr_p, format($q$select count(*) from storage.objects where bucket_id = 'fotogramas' and name like '%s/%%/ensayo-%%'$q$, _x.p));
    _ne := pg_temp.ve(_x.e, format($q$select count(*) from storage.objects where bucket_id = 'fotogramas' and name like '%s/%%/ensayo-%%'$q$, _x.p));
    _res := pg_temp.ve(_x.usr_p, format($q$select count(*) from storage.objects where bucket_id = 'fotogramas' and name = '%s/0/ensayo-bateria.jpg'$q$, _x.p))::text;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _r := 'MONTAJE ROTO ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  perform set_config('role', 'postgres', true);
  _mal := _r is not null or _np is distinct from 1 or _ne is distinct from 2 or _res is distinct from '1';
  if _mal then _fallos := _fallos + 1; end if;
  insert into _informe (linea) values (coalesce(_r, '') || format(
    '11. Almacén con la regla NUEVA: de los dos objetos de prueba, el deportista ve %s (el de la batería: %s) y su entrenador %s (se espera 1, sí, y 2)%s',
    _np, _res, _ne, case when _mal then '   <<< FALLA' else '' end));

  /* 12 y 13. D hace de DIRECTOR del entrenador de V con el acceso a V concedido,
     y después se le niega. Primero se comprueba el montaje (V en su auth_dep_ids). */
  _res := null; _res2 := null; _tiene := null; _avisos := null;
  begin
    insert into public.director (id_perfil) values (_x.d);
    insert into public.director_entrenador (id_director, id_entrenador, estado) values (_x.d, _x.ent_v, 'activo');
    insert into public.director_acceso (id_director, id_deportista, estado) values (_x.d, _x.v, 'concedido');
    select count(*) into _av0 from public.aviso_director;

    perform set_config('request.jwt.claims', json_build_object('sub', _x.d, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select _x.v in (select public.auth_dep_ids()) into _tiene;
    begin
      insert into public.analisis_libre (id_deportista, titulo) values (_x.v, 'ENSAYO director');
      _res := 'ENTRA';
    exception when others then
      _res := sqlstate;
    end;
    perform set_config('role', 'postgres', true);
    select count(*) - _av0 into _avisos from public.aviso_director;

    update public.director_acceso set estado = 'denegado' where id_director = _x.d and id_deportista = _x.v;
    perform set_config('role', 'authenticated', true);
    begin
      insert into public.analisis_libre (id_deportista, titulo) values (_x.v, 'ENSAYO director 2');
      _res2 := 'ENTRA';
    exception when others then
      _res2 := sqlstate;
    end;
    perform set_config('role', 'postgres', true);
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := 'MONTAJE ROTO ' || sqlstate || ' ' || sqlerrm; end if;
  end;
  perform set_config('role', 'postgres', true);
  _mal := _tiene is distinct from true or _res is distinct from 'ENTRA' or _avisos is distinct from 1;
  if _mal then _fallos := _fallos + 1; end if;
  insert into _informe (linea) values (format(
    '12. Un DIRECTOR con el acceso concedido (lo tiene en auth_dep_ids: %s) crea un análisis de ese deportista: %s, y deja %s avisos (se espera ENTRA y 1: solo al entrenador)%s',
    _tiene, _res, _avisos, case when _mal then '   <<< FALLA' else '' end));
  _mal := _res2 is distinct from '42501';
  if _mal then _fallos := _fallos + 1; end if;
  insert into _informe (linea) values (format(
    '13. El mismo director cuando le niegan el acceso: %s (se espera 42501)%s',
    _res2, case when _mal then '   <<< FALLA' else '' end));

  /* El recuento de antes y después */
  select count(distinct uid) into _personas from _cuenta;
  select count(*) into _dif
    from _cuenta a join _cuenta d on d.uid = a.uid and d.fase = 'despues'
   where a.fase = 'antes' and a.ver_obj is distinct from d.ver_obj;
  if _dif > 0 then _fallos := _fallos + 1; end if;

  insert into _informe (linea)
  select format('%s, %s (%s cuentas): ven %s objetos del almacén «fotogramas»', upper(c.fase), g.rol, count(*), sum(c.ver_obj))
    from _cuenta c join _gente g on g.uid = c.uid
   group by c.fase, g.rol
   order by c.fase, g.rol;
  insert into _informe (linea) values (format('Personas comparadas: %s. Con alguna diferencia antes/después: %s', _personas, _dif));

  insert into _informe (linea) values (format('FALLOS: %s', _fallos));

  select string_agg(linea, chr(10) order by orden) into _r from _informe;
  raise exception using message = 'INFORME' || chr(10) || _r;
end $fin$;
