/* ============================================================
   ENSAYO de reloj-union.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: la tabla nueva, los entrenos de prueba y las filas de prueba.

   Los entrenos del reloj de prueba son INVENTADOS (id_externo «ensayo-union-…»)
   y se ponen a deportistas sin reloj: no toca ningún dato de verdad.

   1. CONTROL: la tabla todavía no existe.
   2. La migración, con las mismas sentencias que el fichero.
   3. Las puertas, una a una y cada una deshecha. Unir: el propio deportista y
      su entrenador, a su nombre, con un entreno y una sesión de ese
      deportista. Ni otro entrenador, ni un director con acceso, ni sin sesión.
      Las reglas de la fila (una por entreno, una por parte, «no_cuenta» sin
      sesión). Lo ven él, su entrenador y el director con acceso; nadie más.

   «Entrenador normal» = sin plataforma_admin. Los protagonistas se eligen
   solos con lo que haya en la base: no lleva ids escritos, porque el
   repositorio es público. Deja huecos en los contadores de id. Es inofensivo.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (
  e uuid, p bigint, usr_p uuid, ses_p bigint, ses_p2 bigint, med_p bigint, med_p2 bigint,
  v bigint, ent_v uuid, ses_v bigint, med_v bigint, d uuid);

/* Ejecuta una sentencia como esa persona y la deshace. ENTRA o el código del error. */
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
    if sqlerrm <> '__deshacer__' then _res := sqlstate; end if;
  end;
  perform set_config('role', 'postgres', true);
  return _res;
end $f$;

/* Cuántas filas toca una sentencia como esa persona (deshecha), o el código del error. */
create function pg_temp.filas(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text; _n int;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql;
    get diagnostics _n = row_count;
    _res := _n::text;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := sqlstate; end if;
  end;
  perform set_config('role', 'postgres', true);
  return _res;
end $f$;

/* Lo que ve una persona de una consulta que cuenta, y vuelta a postgres. */
create function pg_temp.ve(_quien uuid, _sql text) returns int language plpgsql as $f$
declare _n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute _sql into _n;
  perform set_config('role', 'postgres', true);
  return _n;
end $f$;

/* Los protagonistas, y sus entrenos de prueba */
do $sel$
declare _e uuid; _p bigint; _usr_p uuid; _ses_p bigint; _ses_p2 bigint; _v bigint; _ent_v uuid; _ses_v bigint; _d uuid;
        _med_p bigint; _med_p2 bigint; _med_v bigint;
begin
  /* P: deportista con cuenta, sin ningún reloj y con dos sesiones, de un entrenador normal E */
  select x.id, x.id_usuario, x.id_entrenador into _p, _usr_p, _e
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
    join public.perfiles pu on pu.id = x.id_usuario and pu.rol = 'deportista'
   where x.id_grupo is null and not x.solo_test
     and x.id_usuario <> x.id_entrenador
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and x.id_usuario not in (select id_perfil from public.plataforma_admin)
     and (select count(*) from public.sesion s where s.id_deportista = x.id) >= 2
     and not exists (select 1 from public.reloj_conexion c where c.id_deportista = x.id)
   order by x.id limit 1;
  select min(s.id), max(s.id) into _ses_p, _ses_p2 from public.sesion s where s.id_deportista = _p;

  /* V: deportista sin reloj y con sesiones, de OTRO entrenador normal */
  select x.id, x.id_entrenador into _v, _ent_v
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
   where x.id_entrenador <> _e and x.id_grupo is null and not x.solo_test
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and (x.id_usuario is null or x.id_usuario <> _e)
     and exists (select 1 from public.sesion s where s.id_deportista = x.id)
     and not exists (select 1 from public.reloj_conexion c where c.id_deportista = x.id)
   order by x.id limit 1;
  select s.id into _ses_v from public.sesion s where s.id_deportista = _v order by s.id limit 1;

  /* D: otro entrenador normal, que hará de director de E con acceso a P */
  select p.id into _d from public.perfiles p
   where p.rol = 'entrenador'
     and p.id not in (select id_perfil from public.plataforma_admin)
     and p.id <> _e and p.id <> _ent_v
     and not exists (select 1 from public.director r where r.id_perfil = p.id)
   order by p.id limit 1;

  if _e is null or _p is null or _ses_p is null or _ses_p2 = _ses_p or _v is null or _ses_v is null or _d is null then
    raise exception 'ENSAYO: no hay datos para montar el escenario (E %, P %, sesiones de P % y %, V %, sesión de V %, D %)', _e, _p, _ses_p, _ses_p2, _v, _ses_v, _d;
  end if;

  /* Entrenos del reloj INVENTADOS: dos de P y uno de V */
  insert into public.reloj_medicion (id_deportista, proveedor, tipo, fecha, id_externo, datos)
  values (_p, 'coros', 'entreno', current_date, 'ensayo-union-p1', '{"disciplina":"Carrera"}') returning id into _med_p;
  insert into public.reloj_medicion (id_deportista, proveedor, tipo, fecha, id_externo, datos)
  values (_p, 'coros', 'entreno', current_date, 'ensayo-union-p2', '{"disciplina":"Ciclismo"}') returning id into _med_p2;
  insert into public.reloj_medicion (id_deportista, proveedor, tipo, fecha, id_externo, datos)
  values (_v, 'coros', 'entreno', current_date, 'ensayo-union-v1', '{"disciplina":"Carrera"}') returning id into _med_v;

  /* D, director de E con el acceso a P concedido */
  insert into public.director (id_perfil) values (_d);
  insert into public.director_entrenador (id_director, id_entrenador, estado) values (_d, _e, 'activo');
  insert into public.director_acceso (id_director, id_deportista, estado) values (_d, _p, 'concedido');

  insert into _actores values (_e, _p, _usr_p, _ses_p, _ses_p2, _med_p, _med_p2, _v, _ent_v, _ses_v, _med_v, _d);
  insert into _informe (linea) values (format(
    'Protagonistas: E = entrenador normal %s con su deportista P (con cuenta %s); V = deportista de otro entrenador normal %s; D = entrenador normal %s, aquí director de E con acceso a P. P lleva dos entrenos del reloj inventados y V uno.',
    left(_e::text, 8), left(_usr_p::text, 8), left(_ent_v::text, 8), left(_d::text, 8)));
end $sel$;

/* 1. CONTROL: la tabla todavía no existe */
do $ctl$
declare _r text; _x record;
begin
  select * into _x from _actores;
  _r := pg_temp.como(_x.usr_p, 'select count(*) from public.reloj_union');
  insert into _informe (linea) values (format('CONTROL. reloj_union antes de la migración: %s (se espera 42P01: todavía no existe)%s', _r, case when _r <> '42P01' then '   <<< CONTROL ROTO' else '' end));
end $ctl$;

/* 2. La migración: MISMAS sentencias que reloj-union.sql */
create table if not exists public.reloj_union (
  id bigint generated by default as identity primary key,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  id_medicion bigint not null references public.reloj_medicion(id) on delete cascade,
  id_sesion bigint references public.sesion(id) on delete cascade,
  parte smallint not null default 1 check (parte between 1 and 3),
  decision text not null check (decision in ('unida', 'rechazada', 'no_cuenta')),
  antes jsonb,
  decidido_por uuid default auth.uid(),
  decidido_en timestamptz not null default now(),
  constraint reloj_union_una_por_entreno unique (id_medicion),
  constraint reloj_union_sesion_segun_decision check ((decision = 'no_cuenta') = (id_sesion is null))
);
create unique index if not exists reloj_union_parte_unica on public.reloj_union (id_sesion, parte) where decision = 'unida';
create index if not exists reloj_union_dep on public.reloj_union (id_deportista);
create index if not exists reloj_union_sesion on public.reloj_union (id_sesion);

create or replace function public.reloj_union_mismo_deportista()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id_deportista is distinct from
     (select m.id_deportista from reloj_medicion m where m.id = new.id_medicion) then
    raise exception 'Ese entreno no es de ese deportista' using errcode = '23514';
  end if;
  if new.id_sesion is not null and new.id_deportista is distinct from
     (select s.id_deportista from sesion s where s.id = new.id_sesion) then
    raise exception 'La sesión no es de ese deportista' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_reloj_union_mismo_deportista on public.reloj_union;
create trigger trg_reloj_union_mismo_deportista before insert or update on public.reloj_union
  for each row execute function public.reloj_union_mismo_deportista();

alter table public.reloj_union enable row level security;
revoke all on table public.reloj_union from anon;

drop policy if exists reloj_union_ver on public.reloj_union;
create policy reloj_union_ver on public.reloj_union for select to authenticated
  using (id_deportista in (select public.auth_dep_ids()));

drop policy if exists reloj_union_alta on public.reloj_union;
create policy reloj_union_alta on public.reloj_union for insert to authenticated
  with check (
    decidido_por = (select auth.uid())
    and exists (select 1 from public.deportista d
                 where d.id = id_deportista
                   and (d.id_usuario = (select auth.uid()) or d.id_entrenador = (select auth.uid())))
  );

drop policy if exists reloj_union_cambio on public.reloj_union;
create policy reloj_union_cambio on public.reloj_union for update to authenticated
  using (exists (select 1 from public.deportista d
                  where d.id = id_deportista
                    and (d.id_usuario = (select auth.uid()) or d.id_entrenador = (select auth.uid()))))
  with check (
    decidido_por = (select auth.uid())
    and exists (select 1 from public.deportista d
                 where d.id = id_deportista
                   and (d.id_usuario = (select auth.uid()) or d.id_entrenador = (select auth.uid())))
  );

drop policy if exists reloj_union_baja on public.reloj_union;
create policy reloj_union_baja on public.reloj_union for delete to authenticated
  using (exists (select 1 from public.deportista d
                  where d.id = id_deportista
                    and (d.id_usuario = (select auth.uid()) or d.id_entrenador = (select auth.uid()))));

/* 3. Las puertas */
do $fin$
declare _x record; _r text; _fallos int := 0; _n int; _ses_tmp bigint;
begin
  select * into _x from _actores;

  /* Unir: quién */
  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'unida')$q$, _x.p, _x.med_p, _x.ses_p));
  insert into _informe (linea) values (format('1. El deportista P une su entreno a su sesión: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.e, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'unida')$q$, _x.p, _x.med_p, _x.ses_p));
  insert into _informe (linea) values (format('2. Su entrenador E lo une: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.d, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'unida')$q$, _x.p, _x.med_p, _x.ses_p));
  insert into _informe (linea) values (format('3. El director D, con acceso a P, lo une: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.ent_v, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'unida')$q$, _x.p, _x.med_p, _x.ses_p));
  insert into _informe (linea) values (format('4. El entrenador de V une uno de P: %s (se espera 23514: no ve ni el entreno ni la sesión)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision, decidido_por) values (%s, %s, %s, 'unida', %L)$q$, _x.p, _x.med_p, _x.ses_p, _x.e));
  insert into _informe (linea) values (format('5. P lo une a nombre de su entrenador: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(null, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'unida')$q$, _x.p, _x.med_p, _x.ses_p));
  insert into _informe (linea) values (format('6. Sin sesión iniciada: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  /* Unir: con qué */
  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'unida')$q$, _x.p, _x.med_v, _x.ses_p));
  insert into _informe (linea) values (format('7. P une el entreno de V a su sesión: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'unida')$q$, _x.p, _x.med_p, _x.ses_v));
  insert into _informe (linea) values (format('8. P une su entreno a una sesión de V: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  /* Las reglas de la fila (con lo suyo, para que solo pueda saltar la regla) */
  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'no_cuenta')$q$, _x.p, _x.med_p, _x.ses_p));
  insert into _informe (linea) values (format('9. «No cuenta» con sesión: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, null, 'unida')$q$, _x.p, _x.med_p));
  insert into _informe (linea) values (format('10. «Unida» sin sesión: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, parte, decision) values (%s, %s, %s, 4, 'unida')$q$, _x.p, _x.med_p, _x.ses_p));
  insert into _informe (linea) values (format('11. Una «parte 4»: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'rechazada')$q$, _x.p, _x.med_p, _x.ses_p));
  insert into _informe (linea) values (format('12. P dice «no es esa»: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, null, 'no_cuenta')$q$, _x.p, _x.med_p));
  insert into _informe (linea) values (format('13. P dice «no contarla»: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  /* Una fila que se queda durante el resto del ensayo (se deshace al final) */
  insert into public.reloj_union (id_deportista, id_medicion, id_sesion, parte, decision, decidido_por)
  values (_x.p, _x.med_p, _x.ses_p, 1, 'unida', _x.usr_p);

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, parte, decision) values (%s, %s, %s, 1, 'unida')$q$, _x.p, _x.med_p2, _x.ses_p));
  insert into _informe (linea) values (format('14. Otro entreno a la MISMA parte de esa sesión: %s (se espera 23505)%s', _r, case when _r <> '23505' then '   <<< FALLO' else '' end));
  if _r <> '23505' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, parte, decision) values (%s, %s, %s, 2, 'unida')$q$, _x.p, _x.med_p2, _x.ses_p));
  insert into _informe (linea) values (format('15. Ese otro entreno a la parte 2 (un brick): %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, %s, 'unida')$q$, _x.p, _x.med_p, _x.ses_p2));
  insert into _informe (linea) values (format('16. El mismo entreno, otra fila: %s (se espera 23505)%s', _r, case when _r <> '23505' then '   <<< FALLO' else '' end));
  if _r <> '23505' then _fallos := _fallos + 1; end if;

  _r := pg_temp.como(_x.usr_p, format($q$insert into public.reloj_union (id_deportista, id_medicion, id_sesion, decision) values (%s, %s, null, 'no_cuenta') on conflict (id_medicion) do update set decision = excluded.decision, id_sesion = excluded.id_sesion, decidido_por = excluded.decidido_por$q$, _x.p, _x.med_p));
  insert into _informe (linea) values (format('17. P cambia de opinión (insertar o cambiar la suya): %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  /* Quién la ve */
  _n := pg_temp.ve(_x.usr_p, format('select count(*) from public.reloj_union where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('18. P ve las suyas: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
  if _n <> 1 then _fallos := _fallos + 1; end if;
  _n := pg_temp.ve(_x.e, format('select count(*) from public.reloj_union where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('19. Su entrenador E las ve: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
  if _n <> 1 then _fallos := _fallos + 1; end if;
  _n := pg_temp.ve(_x.d, format('select count(*) from public.reloj_union where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('20. El director D, con acceso, las ve: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
  if _n <> 1 then _fallos := _fallos + 1; end if;
  _n := pg_temp.ve(_x.ent_v, format('select count(*) from public.reloj_union where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('21. El entrenador de V: %s (se espera 0)%s', _n, case when _n <> 0 then '   <<< FALLO' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;
  _r := pg_temp.como(null, 'select count(*) from public.reloj_union');
  insert into _informe (linea) values (format('22. Sin sesión iniciada: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  /* Cambiarla y borrarla */
  _r := pg_temp.filas(_x.usr_p, format($q$update public.reloj_union set decision = 'rechazada', decidido_por = %L where id_medicion = %s$q$, _x.usr_p, _x.med_p));
  insert into _informe (linea) values (format('23. P cambia la suya: %s filas (se espera 1)%s', _r, case when _r <> '1' then '   <<< FALLO' else '' end));
  if _r <> '1' then _fallos := _fallos + 1; end if;
  _r := pg_temp.filas(_x.d, format($q$update public.reloj_union set decision = 'rechazada', decidido_por = %L where id_medicion = %s$q$, _x.d, _x.med_p));
  insert into _informe (linea) values (format('24. El director D la cambia: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;
  _r := pg_temp.filas(_x.ent_v, format($q$update public.reloj_union set decision = 'rechazada', decidido_por = %L where id_medicion = %s$q$, _x.ent_v, _x.med_p));
  insert into _informe (linea) values (format('25. El entrenador de V la cambia: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;
  _r := pg_temp.filas(_x.usr_p, format($q$update public.reloj_union set id_deportista = %s, decidido_por = %L where id_medicion = %s$q$, _x.v, _x.usr_p, _x.med_p));
  insert into _informe (linea) values (format('26. P se la pasa a V: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;
  _r := pg_temp.filas(_x.d, format('delete from public.reloj_union where id_medicion = %s', _x.med_p));
  insert into _informe (linea) values (format('27. El director D la borra: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;
  _r := pg_temp.filas(_x.ent_v, format('delete from public.reloj_union where id_medicion = %s', _x.med_p));
  insert into _informe (linea) values (format('28. El entrenador de V la borra: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;
  _r := pg_temp.filas(_x.e, format('delete from public.reloj_union where id_medicion = %s', _x.med_p));
  insert into _informe (linea) values (format('29. Su entrenador E la borra (desunir): %s filas (se espera 1)%s', _r, case when _r <> '1' then '   <<< FALLO' else '' end));
  if _r <> '1' then _fallos := _fallos + 1; end if;

  /* Si se borra la sesión o el entreno, la fila se va con ellos */
  insert into public.sesion (id_deportista, fecha_sesion, disciplina, estado, origen)
  values (_x.p, current_date, 'Carrera', 'Planificada', 'deportista') returning id into _ses_tmp;
  insert into public.reloj_union (id_deportista, id_medicion, id_sesion, parte, decision, decidido_por)
  values (_x.p, _x.med_p2, _ses_tmp, 2, 'unida', _x.usr_p)
  on conflict (id_medicion) do update set id_sesion = excluded.id_sesion, parte = excluded.parte, decision = excluded.decision;
  delete from public.sesion where id = _ses_tmp;
  select count(*) into _n from public.reloj_union where id_medicion = _x.med_p2;
  insert into _informe (linea) values (format('30. Se borra la sesión: quedan %s filas suyas (se espera 0)%s', _n, case when _n <> 0 then '   <<< FALLO' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  /* La fila fija de P (la de su primer entreno) sigue ahí. */
  delete from public.reloj_medicion where id = _x.med_p;
  select count(*) into _n from public.reloj_union where id_medicion = _x.med_p;
  insert into _informe (linea) values (format('31. Se borra el entreno: quedan %s filas suyas (se espera 0)%s', _n, case when _n <> 0 then '   <<< FALLO' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('RESULTADO: %s fallos en 31 puertas.', _fallos));
end $fin$;

/* El informe sale en el error, y el error lo deshace todo */
do $inf$
begin
  raise exception 'INFORME DEL ENSAYO (todo deshecho):%', (select string_agg(E'\n' || linea, '' order by orden) from _informe);
end $inf$;
