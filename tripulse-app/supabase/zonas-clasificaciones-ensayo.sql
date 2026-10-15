/* ============================================================
   ENSAYO de zonas-clasificaciones.sql, SIN APLICARLO
   ============================================================

   Se pega ENTERO en UNA sola llamada, con el contenido de
   zonas-clasificaciones.sql en el hueco marcado. Acaba en un error a
   propósito que trae el informe, y ese error deshace TODO: las tablas, las
   columnas, lo migrado y las filas de prueba.

   1. Lo migrado: cada clasificación creada, con sus zonas y sus límites.
   2. Las puertas, una a una y cada una deshecha, haciéndose pasar por un
      entrenador real igual que PostgREST (request.jwt.claims + role
      authenticated): lo suyo entra, lo de otro no, y lo mal formado tampoco.
   3. La app publicada: una zona guardada como la guarda hoy (sin
      clasificación y con sus porcentajes) tiene que seguir entrando.

   Los protagonistas se eligen solos: no lleva ids escritos, porque el
   repositorio es público. Deja huecos en los contadores de id. Es inofensivo. */

begin isolation level repeatable read;
set local lock_timeout = '4s';

/* == aquí va zonas-clasificaciones.sql, entero == */

create temp table _informe (orden serial, linea text);

/* Ejecuta una sentencia como esa persona y la deshace. Devuelve ENTRA o el
   código del error: 42501 la regla lo para, 23503 la clave ajena, 23505 el
   índice único, 23514 una comprobación. */
create function pg_temp.como(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    if _quien is null then
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
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

/* Un número contado como esa persona (cuántas filas ve, o a cuántas llega). */
create function pg_temp.cuenta(_quien uuid, _sql text) returns int language plpgsql as $f$
declare _n int;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql into _n;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  return _n;
end $f$;

do $fin$
declare
  _a uuid; _b uuid; _ca bigint; _cb bigint;
  _res text; _n int; _esperado int; _fallos int := 0; _r text;
  _socios boolean;
begin
  /* 1. Lo migrado */
  insert into _informe (linea)
  select format('CLASIFICACIÓN %s · %s · %s · hitos %s%s · %s zonas',
                c.id, c.nombre, c.deporte, c.hitos::text,
                case when c.archivada then ' · archivada' else '' end,
                (select count(*) from public.zona_entrenador z where z.id_clasificacion = c.id))
    from public.zona_clasificacion c order by c.id;

  insert into _informe (linea)
  select format('  zona %s (%s) · desde %s · hasta %s · columnas de antes %s–%s',
                z.sigla, z.deporte, coalesce(z.desde::text, '—'), coalesce(z.hasta::text, '—'),
                z.pct_min, z.pct_max)
    from public.zona_entrenador z order by z.id_clasificacion, z.orden;

  select count(*) into _n from public.zona_entrenador where id_clasificacion is null;
  insert into _informe (linea) values (format('Zonas sin clasificación después de migrar: %s (se espera 0)%s',
    _n, case when _n <> 0 then '   <<< FALLA' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  /* Los desde/hasta tienen que decir lo mismo que las columnas de antes. */
  select count(*) into _n from public.zona_entrenador z
   where (z.desde->>'pct')::numeric is distinct from z.pct_min
      or (z.hasta->>'pct')::numeric is distinct from z.pct_max
      or z.desde->>'ref' is distinct from z.hasta->>'ref';
  insert into _informe (linea) values (format('Zonas cuyo desde/hasta no cuadra con su %% de antes: %s (se espera 0)%s',
    _n, case when _n <> 0 then '   <<< FALLA' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  /* Los protagonistas: A, un entrenador con alguna clasificación; B, otro
     entrenador que no es de su dirección. */
  select c.id_entrenador, c.id into _a, _ca
    from public.zona_clasificacion c order by c.id limit 1;
  select p.id into _b from public.perfiles p
   where p.rol = 'entrenador' and p.id <> _a
     and p.id not in (select id_perfil from public.plataforma_admin)
     and not exists (select 1 from public.director_entrenador v
                      where (v.id_director = _a and v.id_entrenador = p.id)
                         or (v.id_director = p.id and v.id_entrenador = _a))
   order by p.id limit 1;
  if _a is null or _b is null then
    raise exception 'No hay protagonistas: A=% B=%', _a, _b;
  end if;

  /* Una clasificación de B para las pruebas, como postgres: se deshace al final. */
  insert into public.zona_clasificacion (id_entrenador, nombre, deporte, hitos)
  values (_b, 'Prueba de B', 'Carrera', '["app:vam"]') returning id into _cb;

  /* 2. Ver */
  select count(*) into _esperado from public.zona_clasificacion where id_entrenador = _a;
  _n := pg_temp.cuenta(_a, 'select count(*) from public.zona_clasificacion');
  insert into _informe (linea) values (format('2.1 A ve %s clasificaciones (las suyas son %s)%s',
    _n, _esperado, case when _n < _esperado then '   <<< FALLA' else '' end));
  if _n < _esperado then _fallos := _fallos + 1; end if;

  _n := pg_temp.cuenta(_b, format('select count(*) from public.zona_clasificacion where id_entrenador = %L', _a));
  insert into _informe (linea) values (format('2.2 B ve %s clasificaciones de A (se espera 0)%s',
    _n, case when _n <> 0 then '   <<< FALLA' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  _n := pg_temp.cuenta(_b, format(
    'with x as (update public.zona_clasificacion set nombre = nombre where id = %s returning 1) select count(*) from x', _ca));
  insert into _informe (linea) values (format('2.3 Un UPDATE de B llega a %s clasificaciones de A (se espera 0)%s',
    _n, case when _n <> 0 then '   <<< FALLA' else '' end));
  if _n <> 0 then _fallos := _fallos + 1; end if;

  _n := pg_temp.cuenta(_a, format(
    'with x as (update public.zona_clasificacion set nombre = nombre || '' bis'' where id = %s returning 1) select count(*) from x', _ca));
  insert into _informe (linea) values (format('2.4 A cambia el nombre de la suya: %s fila (se espera 1)%s',
    _n, case when _n <> 1 then '   <<< FALLA' else '' end));
  if _n <> 1 then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(null, 'select count(*) from public.zona_clasificacion');
  insert into _informe (linea) values (format('2.5 Sin sesión (anon) leer clasificaciones: %s (se espera 42501)%s',
    _res, case when _res <> '42501' then '   <<< FALLA' else '' end));
  if _res <> '42501' then _fallos := _fallos + 1; end if;

  /* 3. Escribir lo de otro */
  _res := pg_temp.como(_a, format(
    'insert into public.zona_clasificacion (id_entrenador, nombre, deporte) values (%L, ''x'', ''Carrera'')', _b));
  insert into _informe (linea) values (format('3.1 A crea una clasificación a nombre de B: %s (se espera 42501)%s',
    _res, case when _res <> '42501' then '   <<< FALLA' else '' end));
  if _res <> '42501' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id_entrenador, id_clasificacion, deporte, sigla, nombre, rpe_min, desde, hasta)
     values (%L, %s, ''Carrera'', ''INTRUSA'', ''x'', 5, ''{"ref":"app:vam","pct":80}'', ''{"ref":"app:vam","pct":90}'')',
    _a, _cb));
  insert into _informe (linea) values (format('3.2 A cuelga una zona suya de la clasificación de B: %s (se espera 23503)%s',
    _res, case when _res <> '23503' then '   <<< FALLA' else '' end));
  if _res <> '23503' then _fallos := _fallos + 1; end if;

  /* 4. Lo mal formado */
  _res := pg_temp.como(_a, format(
    'insert into public.zona_clasificacion (id_entrenador, nombre, deporte, hitos) values (%L, ''x'', ''Carrera'', ''["foo"]'')', _a));
  insert into _informe (linea) values (format('4.1 Un hito que no es un hito: %s (se espera 23514)%s',
    _res, case when _res <> '23514' then '   <<< FALLA' else '' end));
  if _res <> '23514' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_clasificacion (id_entrenador, nombre, deporte, hitos) values (%L, ''x'', ''Carrera'', ''[7]'')', _a));
  insert into _informe (linea) values (format('4.2 Un hito que es un número: %s (se espera 23514)%s',
    _res, case when _res <> '23514' then '   <<< FALLA' else '' end));
  if _res <> '23514' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_clasificacion (id_entrenador, nombre, deporte, hitos) values (%L, ''x'', ''Carrera'', ''["app:vam","propia:2:0"]'')', _a));
  insert into _informe (linea) values (format('4.3 Dos hitos bien escritos: %s (se espera ENTRA)%s',
    _res, case when _res <> 'ENTRA' then '   <<< FALLA' else '' end));
  if _res <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_clasificacion (id_entrenador, nombre, deporte) values (%L, ''   '', ''Carrera'')', _a));
  insert into _informe (linea) values (format('4.4 Una clasificación sin nombre: %s (se espera 23514)%s',
    _res, case when _res <> '23514' then '   <<< FALLA' else '' end));
  if _res <> '23514' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id_entrenador, id_clasificacion, deporte, sigla, nombre, rpe_min, desde)
     values (%L, %s, ''Carrera'', ''CERO'', ''x'', 5, ''{"ref":"app:vam","pct":0}'')', _a, _ca));
  insert into _informe (linea) values (format('4.5 Un límite al 0 %%: %s (se espera 23514)%s',
    _res, case when _res <> '23514' then '   <<< FALLA' else '' end));
  if _res <> '23514' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id_entrenador, id_clasificacion, deporte, sigla, nombre, rpe_min, desde)
     values (%L, %s, ''Carrera'', ''RARA'', ''x'', 5, ''{"ref":"app:xyz","pct":90}'')', _a, _ca));
  insert into _informe (linea) values (format('4.6 Un límite con un hito inventado: %s (se espera 23514)%s',
    _res, case when _res <> '23514' then '   <<< FALLA' else '' end));
  if _res <> '23514' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id_entrenador, id_clasificacion, deporte, sigla, nombre, rpe_min, desde)
     values (%L, %s, ''Carrera'', ''TEXTO'', ''x'', 5, ''{"ref":"app:vam","pct":"90"}'')', _a, _ca));
  insert into _informe (linea) values (format('4.7 Un %% escrito como texto: %s (se espera 23514)%s',
    _res, case when _res <> '23514' then '   <<< FALLA' else '' end));
  if _res <> '23514' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id_entrenador, id_clasificacion, deporte, sigla, nombre, rpe_min)
     values (%L, %s, ''Carrera'', ''TODO'', ''x'', 5)', _a, _ca));
  insert into _informe (linea) values (format('4.8 Una zona sin ningún límite: %s (se espera 23514)%s',
    _res, case when _res <> '23514' then '   <<< FALLA' else '' end));
  if _res <> '23514' then _fallos := _fallos + 1; end if;

  /* 5. La sigla */
  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id_entrenador, id_clasificacion, deporte, sigla, nombre, rpe_min, hasta)
     values (%L, %s, ''Carrera'', ''DOBLE'', ''x'', 5, ''{"ref":"app:vam","pct":80}''),
            (%L, %s, ''Carrera'', ''doble'', ''y'', 5, ''{"ref":"app:vam","pct":80}'')', _a, _ca, _a, _ca));
  insert into _informe (linea) values (format('5.1 La misma sigla dos veces en una clasificación: %s (se espera 23505)%s',
    _res, case when _res <> '23505' then '   <<< FALLA' else '' end));
  if _res <> '23505' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'with c as (insert into public.zona_clasificacion (id_entrenador, nombre, deporte, hitos)
                values (%L, ''Otra'', ''Carrera'', ''["app:vam"]'') returning id)
     insert into public.zona_entrenador (id_entrenador, id_clasificacion, deporte, sigla, nombre, rpe_min, hasta)
     select %L::uuid, %s::bigint, ''Carrera'', ''GEMELA'', ''x'', 5, ''{"ref":"app:vam","pct":80}''::jsonb
     union all
     select %L::uuid, c.id, ''Carrera'', ''GEMELA'', ''y'', 5, ''{"ref":"app:vam","pct":80}''::jsonb from c', _a, _a, _ca, _a));
  insert into _informe (linea) values (format('5.2 La misma sigla en dos clasificaciones del mismo deporte: %s (se espera ENTRA)%s',
    _res, case when _res <> 'ENTRA' then '   <<< FALLA' else '' end));
  if _res <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id_entrenador, id_clasificacion, deporte, sigla, nombre, rpe_min, hasta, archivada)
     values (%L, %s, ''Carrera'', ''VIEJA'', ''x'', 5, ''{"ref":"app:vam","pct":80}'', true),
            (%L, %s, ''Carrera'', ''VIEJA'', ''y'', 5, ''{"ref":"app:vam","pct":80}'', false)', _a, _ca, _a, _ca));
  insert into _informe (linea) values (format('5.3 Una sigla archivada no bloquea crearla otra vez: %s (se espera ENTRA)%s',
    _res, case when _res <> 'ENTRA' then '   <<< FALLA' else '' end));
  if _res <> 'ENTRA' then _fallos := _fallos + 1; end if;

  /* 6. La app publicada, tal como guarda hoy */
  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id_entrenador, deporte, sigla, nombre, pct_min, pct_max, rpe_min, color, orden)
     values (%L, ''Ciclismo'', ''SUELTA'', ''x'', 80, 90, 5, ''#a78bfa'', 9)', _a));
  insert into _informe (linea) values (format('6.1 Una zona nueva guardada como hoy (sin clasificación): %s (se espera ENTRA)%s',
    _res, case when _res <> 'ENTRA' then '   <<< FALLA' else '' end));
  if _res <> 'ENTRA' then _fallos := _fallos + 1; end if;

  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id_entrenador, deporte, sigla, nombre, pct_min, pct_max, rpe_min)
     values (%L, ''Ciclismo'', ''SUELTA2'', ''x'', 80, 90, 5), (%L, ''Ciclismo'', ''suelta2'', ''y'', 80, 90, 5)', _a, _a));
  insert into _informe (linea) values (format('6.2 Dos sueltas con la misma sigla: %s (se espera 23505)%s',
    _res, case when _res <> '23505' then '   <<< FALLA' else '' end));
  if _res <> '23505' then _fallos := _fallos + 1; end if;

  select z.id into _n from public.zona_entrenador z where z.id_entrenador = _a order by z.id limit 1;
  _res := pg_temp.como(_a, format(
    'insert into public.zona_entrenador (id, id_entrenador, deporte, sigla, nombre, pct_min, pct_max, rpe_min, rpe_max, color, orden, ref_definicion, ref_indice)
     select id, id_entrenador, deporte, sigla, nombre, pct_min + 1, pct_max, rpe_min, rpe_max, color, orden, ref_definicion, ref_indice
       from public.zona_entrenador where id = %s
     on conflict (id) do update set pct_min = excluded.pct_min', _n));
  insert into _informe (linea) values (format('6.3 El «Guardar» de hoy sobre una zona ya migrada (upsert por id): %s (se espera ENTRA)%s',
    _res, case when _res <> 'ENTRA' then '   <<< FALLA' else '' end));
  if _res <> 'ENTRA' then _fallos := _fallos + 1; end if;

  /* 7. La regla vieja del índice ya no está y las nuevas sí */
  select count(*) into _n from pg_indexes
   where schemaname = 'public' and tablename = 'zona_entrenador'
     and indexname in ('idx_zona_entrenador_sigla_clasif', 'idx_zona_entrenador_sigla_suelta');
  insert into _informe (linea) values (format('7.1 Índices de sigla nuevos: %s de 2%s',
    _n, case when _n <> 2 then '   <<< FALLA' else '' end));
  if _n <> 2 then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('FALLOS: %s', _fallos));

  select string_agg(linea, chr(10) order by orden) into _r from _informe;
  raise exception using message = 'INFORME' || chr(10) || _r;
end $fin$;
