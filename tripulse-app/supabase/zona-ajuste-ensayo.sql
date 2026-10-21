/* ============================================================
   ENSAYO de zona-ajuste.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada: cada llamada es otra transacción.
   Acaba en un error a propósito que trae el informe, y ese error deshace
   TODO: la tabla nueva, el director de prueba, la zona de prueba y las filas.

   1. CONTROL: la tabla todavía no existe.
   2. La migración, con las mismas sentencias que el fichero.
   3. Las puertas, una a una y cada una deshecha. Ajustar: el entrenador del
      deportista con una zona suya, y su director con acceso. Ni el entrenador
      de otro, ni el propio deportista, ni sin sesión. Las reglas de la fila
      (algún límite, hitos bien escritos, % mayor que 0, una por zona y
      deportista). Lo ven su entrenador, su director y el propio deportista.
      Y si se borra la zona, sus ajustes se van con ella.

   «Entrenador normal» = sin plataforma_admin. Los protagonistas se eligen
   solos con lo que haya en la base: no lleva ids escritos, porque el
   repositorio es público. Deja huecos en los contadores de id. Es inofensivo.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (e uuid, p bigint, usr_p uuid, zona bigint, ref text, v bigint, ent_v uuid, d uuid);

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

/* Los protagonistas */
do $sel$
declare _e uuid; _p bigint; _usr_p uuid; _zona bigint; _ref text; _v bigint; _ent_v uuid; _d uuid;
begin
  /* E: entrenador normal, sin director, con una zona propia viva y algún deportista suyo */
  select z.id_entrenador, z.id, coalesce(z.hasta->>'ref', z.desde->>'ref') into _e, _zona, _ref
    from public.zona_entrenador z
    join public.perfiles pe on pe.id = z.id_entrenador and pe.rol = 'entrenador'
   where not z.archivada
     and z.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and coalesce(z.hasta->>'ref', z.desde->>'ref') is not null
     and exists (select 1 from public.deportista d where d.id_entrenador = z.id_entrenador and d.id_grupo is null and not d.solo_test)
     and not exists (select 1 from public.director_entrenador v where v.id_entrenador = z.id_entrenador and v.estado in ('pendiente', 'activo'))
   order by z.id limit 1;

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

  if _e is null or _zona is null or _p is null or _v is null or _d is null then
    raise exception 'ENSAYO: no hay datos para montar el escenario (E %, zona %, P %, V %, D %)', _e, _zona, _p, _v, _d;
  end if;

  insert into public.director (id_perfil) values (_d);
  insert into public.director_entrenador (id_director, id_entrenador, estado) values (_d, _e, 'activo');
  insert into public.director_acceso (id_director, id_deportista, estado) values (_d, _p, 'concedido');

  insert into _actores values (_e, _p, _usr_p, _zona, _ref, _v, _ent_v, _d);
  insert into _informe (linea) values (format(
    'Protagonistas: E = entrenador normal %s con una zona propia y su deportista P (%s); V = deportista de otro entrenador normal %s; D = entrenador normal %s, aquí director de E con acceso a P.',
    left(_e::text, 8), case when _usr_p is null then 'sin cuenta' else 'con cuenta ' || left(_usr_p::text, 8) end,
    left(_ent_v::text, 8), left(_d::text, 8)));
end $sel$;

/* 1. CONTROL: la tabla todavía no existe */
do $ctl$
declare _r text; _x record;
begin
  select * into _x from _actores;
  _r := pg_temp.como(_x.e, 'select count(*) from public.zona_ajuste');
  insert into _informe (linea) values (format('CONTROL. zona_ajuste antes de la migración: %s (se espera 42P01: todavía no existe)%s', _r, case when _r <> '42P01' then '   <<< CONTROL ROTO' else '' end));
end $ctl$;

/* 2. La migración: MISMAS sentencias que zona-ajuste.sql */
create table if not exists public.zona_ajuste (
  id            bigint generated by default as identity primary key,
  id_zona       bigint not null references public.zona_entrenador(id) on delete cascade,
  id_deportista bigint not null references public.deportista(id) on delete cascade,
  desde         jsonb,
  hasta         jsonb,
  ajustado_por  uuid default auth.uid(),
  ajustado_en   timestamptz not null default now(),
  constraint zona_ajuste_uno_por_deportista unique (id_zona, id_deportista),
  constraint zona_ajuste_algun_limite check (desde is not null or hasta is not null),
  constraint zona_ajuste_desde_valido check (
    case
      when desde is null then true
      when jsonb_typeof(desde) <> 'object' then false
      when jsonb_typeof(desde->'ref') <> 'string' or jsonb_typeof(desde->'pct') <> 'number' then false
      else (desde->>'ref') ~ '^(app:(vam|ftp|css)|propia:[0-9]+:[0-9]+)$' and (desde->>'pct')::numeric > 0
    end
  ),
  constraint zona_ajuste_hasta_valido check (
    case
      when hasta is null then true
      when jsonb_typeof(hasta) <> 'object' then false
      when jsonb_typeof(hasta->'ref') <> 'string' or jsonb_typeof(hasta->'pct') <> 'number' then false
      else (hasta->>'ref') ~ '^(app:(vam|ftp|css)|propia:[0-9]+:[0-9]+)$' and (hasta->>'pct')::numeric > 0
    end
  )
);

create index if not exists zona_ajuste_deportista_idx on public.zona_ajuste (id_deportista);

alter table public.zona_ajuste enable row level security;
revoke all on table public.zona_ajuste from anon;
grant select, insert, update, delete on table public.zona_ajuste to authenticated;

drop policy if exists zona_ajuste_entrenador on public.zona_ajuste;
create policy zona_ajuste_entrenador on public.zona_ajuste for all to authenticated
  using (
    id_deportista in (select public.auth_dep_ids())
    and exists (select 1 from public.zona_entrenador z
                 where z.id = zona_ajuste.id_zona
                   and (z.id_entrenador = (select auth.uid())
                        or z.id_entrenador in (select public.socios_de_direccion())))
  )
  with check (
    id_deportista in (select public.auth_dep_ids())
    and exists (select 1 from public.zona_entrenador z
                 where z.id = zona_ajuste.id_zona
                   and (z.id_entrenador = (select auth.uid())
                        or z.id_entrenador in (select public.socios_de_direccion())))
  );

drop policy if exists zona_ajuste_deportista_lee on public.zona_ajuste;
create policy zona_ajuste_deportista_lee on public.zona_ajuste for select to authenticated
  using (id_deportista in (select public.auth_dep_ids()));

/* 3. Las puertas */
do $fin$
declare _x record; _r text; _fallos int := 0; _n int; _puertas int := 0; _lim text; _zona_tmp bigint;
begin
  select * into _x from _actores;
  _lim := json_build_object('ref', _x.ref, 'pct', 92.5)::text;

  /* Ajustar: quién */
  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.p, _lim));
  insert into _informe (linea) values (format('1. E ajusta su zona para su deportista P: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.v, _lim));
  insert into _informe (linea) values (format('2. E la ajusta para V, que no es suyo: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.ent_v, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.p, _lim));
  insert into _informe (linea) values (format('3. El entrenador de V ajusta la zona de E para P: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.ent_v, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.v, _lim));
  insert into _informe (linea) values (format('4. El entrenador de V usa la zona de E para su V: %s (se espera 42501: la zona no es suya)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.d, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.p, _lim));
  insert into _informe (linea) values (format('5. El director D, con acceso a P, la ajusta: %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.d, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.v, _lim));
  insert into _informe (linea) values (format('6. El director D la ajusta para V: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  if _x.usr_p is not null then
    _puertas := _puertas + 1;
    _r := pg_temp.como(_x.usr_p, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.p, _lim));
    insert into _informe (linea) values (format('7. El propio P se la ajusta: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
    if _r <> '42501' then _fallos := _fallos + 1; end if;
  else
    insert into _informe (linea) values ('7. (P no tiene cuenta: no se prueba que no se la pueda ajustar)');
  end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(null, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.p, _lim));
  insert into _informe (linea) values (format('8. Sin sesión iniciada: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  /* Las reglas de la fila (con lo suyo, para que solo pueda saltar la regla) */
  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.zona_ajuste (id_zona, id_deportista) values (%s, %s)$q$, _x.zona, _x.p));
  insert into _informe (linea) values (format('9. Sin ningún límite: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.zona_ajuste (id_zona, id_deportista, desde) values (%s, %s, '{"ref":"vt1","pct":92}'::jsonb)$q$, _x.zona, _x.p));
  insert into _informe (linea) values (format('10. Un hito mal escrito: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.p, json_build_object('ref', _x.ref, 'pct', 0)::text));
  insert into _informe (linea) values (format('11. Un %% de 0: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.p, json_build_object('ref', _x.ref, 'pct', '92')::text));
  insert into _informe (linea) values (format('12. Un %% escrito como texto: %s (se espera 23514)%s', _r, case when _r <> '23514' then '   <<< FALLO' else '' end));
  if _r <> '23514' then _fallos := _fallos + 1; end if;

  /* Una fila que se queda durante el resto del ensayo (se deshace al final) */
  insert into public.zona_ajuste (id_zona, id_deportista, hasta, ajustado_por) values (_x.zona, _x.p, _lim::jsonb, _x.e);

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb)$q$, _x.zona, _x.p, _lim));
  insert into _informe (linea) values (format('13. Otra fila para la misma zona y deportista: %s (se espera 23505)%s', _r, case when _r <> '23505' then '   <<< FALLO' else '' end));
  if _r <> '23505' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(_x.e, format($q$insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (%s, %s, %L::jsonb) on conflict (id_zona, id_deportista) do update set hasta = excluded.hasta, ajustado_en = now()$q$, _x.zona, _x.p, json_build_object('ref', _x.ref, 'pct', 94)::text));
  insert into _informe (linea) values (format('14. E guarda otra vez (insertar o cambiar la suya): %s (se espera ENTRA)%s', _r, case when _r <> 'ENTRA' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA' then _fallos := _fallos + 1; end if;

  /* Quién la ve */
  _puertas := _puertas + 1;
  _n := pg_temp.ve(_x.e, format('select count(*) from public.zona_ajuste where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('15. Su entrenador E la ve: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
  if _n <> 1 then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _n := pg_temp.ve(_x.d, format('select count(*) from public.zona_ajuste where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('16. El director D, con acceso, la ve: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
  if _n <> 1 then _fallos := _fallos + 1; end if;

  if _x.usr_p is not null then
    _puertas := _puertas + 1;
    _n := pg_temp.ve(_x.usr_p, format('select count(*) from public.zona_ajuste where id_deportista = %s', _x.p));
    insert into _informe (linea) values (format('17. El propio P ve la suya: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
    if _n <> 1 then _fallos := _fallos + 1; end if;
  else
    insert into _informe (linea) values ('17. (P no tiene cuenta: no se prueba que vea la suya)');
  end if;

  _puertas := _puertas + 1;
  _n := pg_temp.ve(_x.ent_v, format('select count(*) from public.zona_ajuste where id_deportista = %s', _x.p));
  insert into _informe (linea) values (format('18. El entrenador de V: %s (se espera 0)%s', _n, case when _n <> 0 then '   <<< FALLO' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.como(null, 'select count(*) from public.zona_ajuste');
  insert into _informe (linea) values (format('19. Sin sesión iniciada: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  /* Cambiarla y borrarla */
  _puertas := _puertas + 1;
  _r := pg_temp.filas(_x.ent_v, format($q$update public.zona_ajuste set hasta = %L::jsonb where id_zona = %s and id_deportista = %s$q$, _lim, _x.zona, _x.p));
  insert into _informe (linea) values (format('20. El entrenador de V la cambia: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  if _x.usr_p is not null then
    _puertas := _puertas + 1;
    _r := pg_temp.filas(_x.usr_p, format($q$update public.zona_ajuste set hasta = %L::jsonb where id_zona = %s and id_deportista = %s$q$, _lim, _x.zona, _x.p));
    insert into _informe (linea) values (format('21. El propio P la cambia: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
    if _r <> '0' then _fallos := _fallos + 1; end if;
  else
    insert into _informe (linea) values ('21. (P no tiene cuenta: no se prueba que no la pueda cambiar)');
  end if;

  _puertas := _puertas + 1;
  _r := pg_temp.filas(_x.d, format($q$update public.zona_ajuste set hasta = %L::jsonb where id_zona = %s and id_deportista = %s$q$, _lim, _x.zona, _x.p));
  insert into _informe (linea) values (format('22. El director D la cambia: %s filas (se espera 1)%s', _r, case when _r <> '1' then '   <<< FALLO' else '' end));
  if _r <> '1' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.filas(_x.e, format($q$update public.zona_ajuste set id_deportista = %s where id_zona = %s and id_deportista = %s$q$, _x.v, _x.zona, _x.p));
  insert into _informe (linea) values (format('23. E se la pasa a V: %s (se espera 42501)%s', _r, case when _r <> '42501' then '   <<< FALLO' else '' end));
  if _r <> '42501' then _fallos := _fallos + 1; end if;

  _puertas := _puertas + 1;
  _r := pg_temp.filas(_x.ent_v, format('delete from public.zona_ajuste where id_zona = %s and id_deportista = %s', _x.zona, _x.p));
  insert into _informe (linea) values (format('24. El entrenador de V la borra: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
  if _r <> '0' then _fallos := _fallos + 1; end if;

  if _x.usr_p is not null then
    _puertas := _puertas + 1;
    _r := pg_temp.filas(_x.usr_p, format('delete from public.zona_ajuste where id_zona = %s and id_deportista = %s', _x.zona, _x.p));
    insert into _informe (linea) values (format('25. El propio P la borra: %s filas (se espera 0)%s', _r, case when _r <> '0' then '   <<< FALLO' else '' end));
    if _r <> '0' then _fallos := _fallos + 1; end if;
  else
    insert into _informe (linea) values ('25. (P no tiene cuenta: no se prueba que no la pueda borrar)');
  end if;

  _puertas := _puertas + 1;
  _r := pg_temp.filas(_x.e, format('delete from public.zona_ajuste where id_zona = %s and id_deportista = %s', _x.zona, _x.p));
  insert into _informe (linea) values (format('26. E la borra (volver a la plantilla): %s filas (se espera 1)%s', _r, case when _r <> '1' then '   <<< FALLO' else '' end));
  if _r <> '1' then _fallos := _fallos + 1; end if;

  /* Si se borra la zona, sus ajustes se van con ella (con una zona de prueba) */
  _puertas := _puertas + 1;
  insert into public.zona_entrenador (id_entrenador, deporte, sigla, nombre, hasta, rpe_min, color, orden)
  values (_x.e, 'Carrera', 'ZZENS', 'Ensayo', '{"ref":"app:vam","pct":80}'::jsonb, 5, '#a78bfa', 99)
  returning id into _zona_tmp;
  insert into public.zona_ajuste (id_zona, id_deportista, hasta) values (_zona_tmp, _x.p, '{"ref":"app:vam","pct":78}'::jsonb);
  delete from public.zona_entrenador where id = _zona_tmp;
  select count(*) into _n from public.zona_ajuste where id_zona = _zona_tmp;
  insert into _informe (linea) values (format('27. Se borra la zona: quedan %s ajustes suyos (se espera 0)%s', _n, case when _n <> 0 then '   <<< FALLO' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  /* Permisos de la tabla */
  _puertas := _puertas + 1;
  select count(*) into _n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relname = 'zona_ajuste' and c.relrowsecurity
     and not has_table_privilege('anon', c.oid, 'select') and not has_table_privilege('anon', c.oid, 'insert')
     and has_table_privilege('authenticated', c.oid, 'select') and has_table_privilege('authenticated', c.oid, 'insert');
  insert into _informe (linea) values (format('28. RLS activa, cerrada a anon y abierta a quien tiene sesión: %s (se espera 1)%s', _n, case when _n <> 1 then '   <<< FALLO' else '' end));
  if _n <> 1 then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('RESULTADO: %s fallos en %s puertas.', _fallos, _puertas));
end $fin$;

/* El informe sale en el error, y el error lo deshace todo */
do $inf$
begin
  raise exception 'INFORME DEL ENSAYO (todo deshecho):%', (select string_agg(E'\n' || linea, '' order by orden) from _informe);
end $inf$;
