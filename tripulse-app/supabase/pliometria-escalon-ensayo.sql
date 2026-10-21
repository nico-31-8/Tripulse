/* ============================================================
   ENSAYO de pliometria-escalon.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: las dos tablas, el director de prueba y las filas.

   1. CONTROL: las tablas todavía no existen.
   2. La migración, con las mismas sentencias que el fichero.
   3. Las puertas, una a una y cada una deshecha. Poner el escalón: su
      entrenador y su director con acceso, sí; el entrenador de otro, el
      propio deportista y sin sesión, no. Las reglas de la fila. Quién y
      cuándo los pone la base aunque la app diga otra cosa. El historial no
      se cambia ni se borra. Quién lo ve. Lo mismo con la evaluación. Y si se
      borra el deportista, lo suyo se va con él.

   «Entrenador normal» = sin plataforma_admin. Los protagonistas se eligen
   solos con lo que haya en la base: no lleva ids escritos, porque el
   repositorio es público. Deja huecos en los contadores de id. Es inofensivo.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (e uuid, p bigint, usr_p uuid, v bigint, ent_v uuid, d uuid);

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

/* El valor que devuelve una sentencia como esa persona (deshecha), o el código del error. */
create function pg_temp.valor(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text; _v text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql into _v;
    _res := coalesce(_v, 'nada');
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

/* Los protagonistas */
do $sel$
declare _e uuid; _p bigint; _usr_p uuid; _v bigint; _ent_v uuid; _d uuid;
begin
  /* E: entrenador normal, sin dirección, con algún deportista suyo suelto */
  select pe.id into _e
    from public.perfiles pe
   where pe.rol = 'entrenador'
     and pe.id not in (select id_perfil from public.plataforma_admin)
     and exists (select 1 from public.deportista d where d.id_entrenador = pe.id and d.id_grupo is null and not d.solo_test)
     and not exists (select 1 from public.director_entrenador v where v.id_entrenador = pe.id and v.estado in ('pendiente', 'activo'))
     and not exists (select 1 from public.director r where r.id_perfil = pe.id)
   order by pe.id limit 1;

  /* P: un deportista de E, mejor con cuenta (para ver que lee lo suyo y no lo escribe) */
  select d.id, d.id_usuario into _p, _usr_p
    from public.deportista d
   where d.id_entrenador = _e and d.id_grupo is null and not d.solo_test
     and (d.id_usuario is null or (d.id_usuario <> _e and d.id_usuario not in (select id_perfil from public.plataforma_admin)))
   order by (d.id_usuario is null), d.id limit 1;

  /* V: deportista de OTRO entrenador normal */
  select x.id, x.id_entrenador into _v, _ent_v
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
   where x.id_entrenador <> _e and x.id_grupo is null and not x.solo_test
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and (x.id_usuario is null or x.id_usuario <> _e)
   order by x.id limit 1;

  /* D: otro entrenador normal, que aquí hará de director de E con acceso a P */
  select p.id into _d from public.perfiles p
   where p.rol = 'entrenador'
     and p.id not in (select id_perfil from public.plataforma_admin)
     and p.id <> _e and p.id <> _ent_v
     and not exists (select 1 from public.director r where r.id_perfil = p.id)
     and not exists (select 1 from public.director_entrenador v where v.id_director = p.id or v.id_entrenador = p.id)
   order by p.id limit 1;

  if _e is null or _p is null or _v is null or _d is null then
    raise exception 'ENSAYO: no hay datos para montar el escenario (E %, P %, V %, D %)', _e, _p, _v, _d;
  end if;

  insert into public.director (id_perfil) values (_d);
  insert into public.director_entrenador (id_director, id_entrenador, estado) values (_d, _e, 'activo');
  insert into public.director_acceso (id_director, id_deportista, estado) values (_d, _p, 'concedido');

  insert into _actores values (_e, _p, _usr_p, _v, _ent_v, _d);
  insert into _informe (linea) values (format(
    'Protagonistas: E = entrenador normal %s y su deportista P (%s); V = deportista de otro entrenador normal %s; D = entrenador normal %s, aquí director de E con acceso a P.',
    left(_e::text, 8), case when _usr_p is null then 'sin cuenta' else 'con cuenta ' || left(_usr_p::text, 8) end,
    left(_ent_v::text, 8), left(_d::text, 8)));
end $sel$;

/* 1. CONTROL: las tablas todavía no existen */
do $ctl$
declare _r text; _s text; _x record;
begin
  select * into _x from _actores;
  _r := pg_temp.como(_x.e, 'select count(*) from public.pliometria_escalon');
  _s := pg_temp.como(_x.e, 'select count(*) from public.pliometria_evaluacion');
  insert into _informe (linea) values (format('CONTROL. Antes de la migración: escalón %s, evaluación %s (se espera 42P01 en las dos: todavía no existen)%s',
    _r, _s, case when _r <> '42P01' or _s <> '42P01' then '   <<< CONTROL ROTO' else '' end));
end $ctl$;

/* 2. La migración: MISMAS sentencias que pliometria-escalon.sql */
create table if not exists public.pliometria_escalon (
  id            bigint generated by default as identity primary key,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  parte         text not null,
  escalon       text,
  recomendado   text,
  nota          text,
  puesto_por    uuid,
  puesto_en     timestamptz not null default now(),
  constraint pliometria_escalon_parte check (parte in ('inferior', 'superior', 'tronco')),
  constraint pliometria_escalon_escalon check (escalon is null or escalon in ('a', 'b', 'c', 'd', 'e')),
  /* Lo que recomendaba la app al cambiarlo: un escalón, «aterrizajes» (antes
     del a), «no-salta», o nada si no tenía con qué. */
  constraint pliometria_escalon_recomendado check (recomendado is null or recomendado in ('a', 'b', 'c', 'd', 'e', 'aterrizajes', 'no-salta')),
  constraint pliometria_escalon_nota check (nota is null or char_length(nota) <= 500)
);

/* El de hoy es la última fila de cada parte. */
create index if not exists pliometria_escalon_deportista_idx
  on public.pliometria_escalon (id_deportista, parte, puesto_en desc);

create table if not exists public.pliometria_evaluacion (
  id_deportista   bigint primary key references public.deportista(id) on delete cascade,
  comprobaciones  jsonb not null default '{}'::jsonb,
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  constraint pliometria_evaluacion_objeto check (jsonb_typeof(comprobaciones) = 'object')
);

/* Quién y cuándo, siempre de la sesión y del reloj de la base. */
create or replace function public.pliometria_escalon_quien() returns trigger
language plpgsql set search_path = public as $$
begin
  new.puesto_por := auth.uid();
  new.puesto_en := now();
  return new;
end $$;

create or replace function public.pliometria_evaluacion_quien() returns trigger
language plpgsql set search_path = public as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists pliometria_escalon_quien on public.pliometria_escalon;
create trigger pliometria_escalon_quien before insert on public.pliometria_escalon
  for each row execute function public.pliometria_escalon_quien();

drop trigger if exists pliometria_evaluacion_quien on public.pliometria_evaluacion;
create trigger pliometria_evaluacion_quien before insert or update on public.pliometria_evaluacion
  for each row execute function public.pliometria_evaluacion_quien();

alter table public.pliometria_escalon enable row level security;
alter table public.pliometria_evaluacion enable row level security;
/* Se quita todo y se da lo justo: Supabase da todos los permisos por defecto a
   las tablas nuevas. El historial solo se lee y se añade; la evaluación se lee,
   se crea y se cambia (volver a empezar es dejarla vacía). */
revoke all on table public.pliometria_escalon, public.pliometria_evaluacion from anon, authenticated;
grant select, insert on table public.pliometria_escalon to authenticated;
grant select, insert, update on table public.pliometria_evaluacion to authenticated;

/* Escribir: quien lleva al deportista, no el propio deportista. */
drop policy if exists pliometria_escalon_quien_lleva on public.pliometria_escalon;
create policy pliometria_escalon_quien_lleva on public.pliometria_escalon for insert to authenticated
  with check (
    id_deportista in (select public.auth_dep_ids())
    and id_deportista not in (select d.id from public.deportista d
                               where d.id_usuario = (select auth.uid())
                                 and d.id_entrenador is distinct from (select auth.uid()))
  );

/* Leer: quien lo lleva y el propio deportista. */
drop policy if exists pliometria_escalon_lee on public.pliometria_escalon;
create policy pliometria_escalon_lee on public.pliometria_escalon for select to authenticated
  using (id_deportista in (select public.auth_dep_ids()));

drop policy if exists pliometria_evaluacion_quien_lleva on public.pliometria_evaluacion;
create policy pliometria_evaluacion_quien_lleva on public.pliometria_evaluacion for all to authenticated
  using (
    id_deportista in (select public.auth_dep_ids())
    and id_deportista not in (select d.id from public.deportista d
                               where d.id_usuario = (select auth.uid())
                                 and d.id_entrenador is distinct from (select auth.uid()))
  )
  with check (
    id_deportista in (select public.auth_dep_ids())
    and id_deportista not in (select d.id from public.deportista d
                               where d.id_usuario = (select auth.uid())
                                 and d.id_entrenador is distinct from (select auth.uid()))
  );

drop policy if exists pliometria_evaluacion_lee on public.pliometria_evaluacion;
create policy pliometria_evaluacion_lee on public.pliometria_evaluacion for select to authenticated
  using (id_deportista in (select public.auth_dep_ids()));

notify pgrst, 'reload schema';

/* 3. Las puertas */
do $fin$
declare _x record; _r text; _fallos int := 0; _n int; _puertas int := 0; _ins text;
begin
  select * into _x from _actores;
  _ins := 'insert into public.pliometria_escalon (id_deportista, parte, escalon, recomendado) values (%s, %L, %L, %L)';

  /* El escalón: quién lo pone */
  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format(_ins, _x.p, 'inferior', 'b', 'b'));
  insert into _informe (linea) values (format('1. E pone el escalón de su deportista P: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format(_ins, _x.v, 'inferior', 'b', null));
  insert into _informe (linea) values (format('2. E se lo pone a V, que no es suyo: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.ent_v, format(_ins, _x.p, 'inferior', 'c', null));
  insert into _informe (linea) values (format('3. El entrenador de V se lo pone a P: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.d, format(_ins, _x.p, 'superior', 'a', null));
  insert into _informe (linea) values (format('4. El director D, con acceso a P, se lo pone: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.d, format(_ins, _x.v, 'inferior', 'b', null));
  insert into _informe (linea) values (format('5. El director D se lo pone a V: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  if _x.usr_p is not null then
    _puertas := _puertas + 1;
    _r := pg_temp.como(_x.usr_p, format(_ins, _x.p, 'inferior', 'e', null));
    insert into _informe (linea) values (format('6. El propio P se lo pone: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
    if _r <> '42501' then _fallos := _fallos + 1; end if;
  else
    insert into _informe (linea) values ('6. (P no tiene cuenta: no se prueba que no se lo pueda poner)');
  end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(null, format(_ins, _x.p, 'inferior', 'b', null));
  insert into _informe (linea) values (format('7. Sin sesión iniciada: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  /* Las reglas de la fila (con lo suyo, para que solo pueda saltar la regla) */
  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format(_ins, _x.p, 'pierna', 'b', null));
  insert into _informe (linea) values (format('8. Una parte que no existe: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format(_ins, _x.p, 'inferior', 'f', null));
  insert into _informe (linea) values (format('9. Un escalón que no existe: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format(_ins, _x.p, 'inferior', 'b', 'z'));
  insert into _informe (linea) values (format('10. Una recomendación que no existe: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format('insert into public.pliometria_escalon (id_deportista, parte, escalon, nota) values (%s, %L, %L, %L)', _x.p, 'inferior', 'b', repeat('x', 501)));
  insert into _informe (linea) values (format('11. Una nota de 501 caracteres: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format(_ins, _x.p, 'inferior', null, 'aterrizajes'));
  insert into _informe (linea) values (format('12. Sin poner, con la app recomendando aterrizajes: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  /* Quién y cuándo los pone la base, aunque la app diga otra cosa */
  _puertas := _puertas + 1;
  _r := pg_temp.valor(_x.e, format($q$insert into public.pliometria_escalon (id_deportista, parte, escalon, puesto_por, puesto_en) values (%s, 'inferior', 'c', %L, now() - interval '1 year') returning (puesto_por = %L::uuid and puesto_en > now() - interval '1 minute')::text$q$, _x.p, _x.ent_v, _x.e));
  insert into _informe (linea) values (format('13. E dice que lo puso otro y hace un año: queda a nombre de E y con fecha de hoy: %s (se espera true)%s', _r, case when _r <> 'true' then '   <<< FALLO' else '' end));
  if _r <> 'true' then _fallos := _fallos + 1; end if;

  /* Una fila que se queda durante el resto del ensayo (se deshace al final) */
  insert into public.pliometria_escalon (id_deportista, parte, escalon, recomendado) values (_x.p, 'inferior', 'b', 'b');

  /* El historial no se cambia ni se borra */
  _puertas := _puertas + 1;
  _r := pg_temp.filas(_x.e, format($q$update public.pliometria_escalon set escalon = 'e' where id_deportista = %s$q$, _x.p));
  insert into _informe (linea) values (format('14. E cambia una fila del historial: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.filas(_x.e, format('delete from public.pliometria_escalon where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('15. E borra el historial: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  /* Quién lo ve */
  _puertas := _puertas + 1;
  _n := pg_temp.ve(_x.e, format('select count(*) from public.pliometria_escalon where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('16. Su entrenador E lo ve: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
  if _n <> 1 then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _n := pg_temp.ve(_x.d, format('select count(*) from public.pliometria_escalon where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('17. El director D, con acceso, lo ve: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
  if _n <> 1 then _fallos := _fallos + 1; end if;

  if _x.usr_p is not null then
    _puertas := _puertas + 1;
    _n := pg_temp.ve(_x.usr_p, format('select count(*) from public.pliometria_escalon where id_deportista = %s', _x.p));
    insert into _informe (linea) values (format('18. El propio P ve el suyo: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
    if _n <> 1 then _fallos := _fallos + 1; end if;
  else
    insert into _informe (linea) values ('18. (P no tiene cuenta: no se prueba que vea el suyo)');
  end if;

  _puertas := _puertas + 1;
  _n := pg_temp.ve(_x.ent_v, format('select count(*) from public.pliometria_escalon where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('19. El entrenador de V: %s (se espera 0)%s', _n, case when _n <> 0 then '   <<< FALLO' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(null, 'select count(*) from public.pliometria_escalon');
  insert into _informe (linea) values (format('20. Sin sesión iniciada: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  /* La evaluación */
  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.pliometria_evaluacion (id_deportista, comprobaciones) values (%s, '{"eqPie": true, "silencio": false, "asimetria": 6}'::jsonb) on conflict (id_deportista) do update set comprobaciones = excluded.comprobaciones$q$, _x.p));
  insert into _informe (linea) values (format('21. E guarda la evaluación de P: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  if _x.usr_p is not null then
    _puertas := _puertas + 1;
    _r := pg_temp.como(_x.usr_p, format($q$insert into public.pliometria_evaluacion (id_deportista, comprobaciones) values (%s, '{"eqPie": true}'::jsonb)$q$, _x.p));
    insert into _informe (linea) values (format('22. El propio P se la escribe: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
    if _r <> '42501' then _fallos := _fallos + 1; end if;
  else
    insert into _informe (linea) values ('22. (P no tiene cuenta: no se prueba que no se la pueda escribir)');
  end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.ent_v, format($q$insert into public.pliometria_evaluacion (id_deportista, comprobaciones) values (%s, '{"eqPie": true}'::jsonb)$q$, _x.p));
  insert into _informe (linea) values (format('23. El entrenador de V se la escribe a P: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.pliometria_evaluacion (id_deportista, comprobaciones) values (%s, '[true, false]'::jsonb)$q$, _x.p));
  insert into _informe (linea) values (format('24. Las comprobaciones como lista y no como objeto: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  /* Una evaluación que se queda durante el resto del ensayo */
  insert into public.pliometria_evaluacion (id_deportista, comprobaciones) values (_x.p, '{"eqPie": true}'::jsonb);

  _puertas := _puertas + 1;
  _r := pg_temp.valor(_x.d, format($q$update public.pliometria_evaluacion set comprobaciones = '{"eqPie": false}'::jsonb where id_deportista = %s returning (actualizado_por = %L::uuid)::text$q$, _x.p, _x.d));
  insert into _informe (linea) values (format('25. El director D la cambia y queda a su nombre: %s (se espera true)%s', _r, case when _r <> 'true' then '   <<< FALLO' else '' end));
  if _r <> 'true' then _fallos := _fallos + 1; end if;

  if _x.usr_p is not null then
    _puertas := _puertas + 1;
    _r := pg_temp.filas(_x.usr_p, format($q$update public.pliometria_evaluacion set comprobaciones = '{}'::jsonb where id_deportista = %s$q$, _x.p));
    insert into _informe (linea) values (format('26. El propio P la cambia: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
    if _r <> '0' then _fallos := _fallos + 1; end if;

    _puertas := _puertas + 1;
    _n := pg_temp.ve(_x.usr_p, format('select count(*) from public.pliometria_evaluacion where id_deportista = %s', _x.p));
    insert into _informe (linea) values (format('27. El propio P la ve: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
    if _n <> 1 then _fallos := _fallos + 1; end if;
  else
    insert into _informe (linea) values ('26-27. (P no tiene cuenta: no se prueba que la vea y no la cambie)');
  end if;

  _puertas := _puertas + 1;
  _n := pg_temp.ve(_x.ent_v, format('select count(*) from public.pliometria_evaluacion where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('28. El entrenador de V la ve: %s (se espera 0)%s', _n, case when _n <> 0 then '   <<< FALLO' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.filas(_x.e, format('delete from public.pliometria_evaluacion where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('29. E la borra (no se borra: se deja vacía): %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  /* Si se borra el deportista, lo suyo se va con él */
  _puertas := _puertas + 1;
  select count(*) into _n from pg_constraint
   where contype = 'f' and confdeltype = 'c' and confrelid = 'public.deportista'::regclass
     and conrelid in ('public.pliometria_escalon'::regclass, 'public.pliometria_evaluacion'::regclass);
  insert into _informe (linea) values (format('30. Las dos tablas se borran con el deportista: %s (se espera 2)%s', _n, case when _n <> 2 then '   <<< FALLO' else '' end));
  if _n <> 2 then _fallos := _fallos + 1; end if;

  /* Permisos de las tablas */
  _puertas := _puertas + 1;
  select count(*) into _n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relname in ('pliometria_escalon', 'pliometria_evaluacion') and c.relrowsecurity
     and not has_table_privilege('anon', c.oid, 'select') and not has_table_privilege('anon', c.oid, 'insert')
     and has_table_privilege('authenticated', c.oid, 'select') and has_table_privilege('authenticated', c.oid, 'insert')
     and not has_table_privilege('authenticated', c.oid, 'delete')
     and has_table_privilege('authenticated', c.oid, 'update') = (c.relname = 'pliometria_evaluacion');
  insert into _informe (linea) values (format('31. RLS activa, cerradas a anon, sin borrar, y solo la evaluación se cambia: %s (se esperan 2)%s', _n, case when _n <> 2 then '   <<< FALLO' else '' end));
  if _n <> 2 then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('RESULTADO: %s fallos en %s puertas.', _fallos, _puertas));
end $fin$;

/* El informe sale en el error, y el error lo deshace todo */
do $inf$
begin
  raise exception 'INFORME DEL ENSAYO (todo deshecho):%', (select string_agg(E'\n' || linea, '' order by orden) from _informe);
end $inf$;
