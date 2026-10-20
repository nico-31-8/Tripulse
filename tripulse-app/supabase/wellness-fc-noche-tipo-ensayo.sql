/* ============================================================
   ENSAYO de wellness-fc-noche-tipo.sql, SIN APLICARLO
   ============================================================
   Se pega ENTERO en UNA sola llamada. Acaba en un error a propósito que trae
   el informe, y ese error deshace TODO: la columna y las filas de prueba.

   0. CONTROL: la columna no existe, y el deportista P puede apuntar su
      wellness con lo de hoy.
   1. La migración, tal cual.
   2. Lo de siempre no cambia: cuántas filas de wellness ve cada uno (P, su
      entrenador E y otro entrenador W) es lo mismo antes y después, y la app
      de ahora (sin la columna) sigue pudiendo guardar.
   3. La columna nueva: P guarda 'reposo' y 'nocturna'; otra cosa no entra; y
      sin FC del reloj se queda vacía.

   «Entrenador normal» = sin plataforma_admin. Sin ids escritos: el repositorio
   es público. Deja huecos en los contadores de id. Es inofensivo.
*/

begin isolation level repeatable read;
set local lock_timeout = '4s';

create temp table _informe (orden serial, linea text);
create temp table _actores (e uuid, p bigint, usr_p uuid, w uuid);
create temp table _antes (quien text, n int);

create function pg_temp.sesion(_quien uuid, _sql text) returns text language plpgsql as $f$
declare _res text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _quien, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute _sql into _res;
    raise exception '__deshacer__';
  exception when others then
    if sqlerrm <> '__deshacer__' then _res := 'ERR ' || sqlstate; end if;
  end;
  perform set_config('role', 'postgres', true);
  return coalesce(_res, '(nada)');
end $f$;

do $sel$
declare _e uuid; _p bigint; _usr_p uuid; _w uuid;
begin
  select x.id, x.id_usuario, x.id_entrenador into _p, _usr_p, _e
    from public.deportista x
    join public.perfiles pe on pe.id = x.id_entrenador and pe.rol = 'entrenador'
    join public.perfiles pu on pu.id = x.id_usuario and pu.rol = 'deportista'
   where x.id_usuario <> x.id_entrenador
     and x.id_entrenador not in (select id_perfil from public.plataforma_admin)
     and x.id_usuario not in (select id_perfil from public.plataforma_admin)
   order by x.id limit 1;
  select p.id into _w from public.perfiles p
   where p.rol = 'entrenador' and p.id <> _e and p.id not in (select id_perfil from public.plataforma_admin)
   order by p.id limit 1;
  if _e is null or _p is null or _w is null then
    raise exception 'ENSAYO: no hay datos (E %, P %, W %)', _e, _p, _w;
  end if;
  insert into _actores values (_e, _p, _usr_p, _w);
  insert into _antes
  select 'P', pg_temp.sesion(_usr_p, format('select count(*)::text from public.wellness where id_deportista = %s', _p))::int
  union all select 'E', pg_temp.sesion(_e, format('select count(*)::text from public.wellness where id_deportista = %s', _p))::int
  union all select 'W', pg_temp.sesion(_w, format('select count(*)::text from public.wellness where id_deportista = %s', _p))::int;
  insert into _informe (linea) values (format('Protagonistas: P = deportista %s (con cuenta, de un entrenador normal E); W = otro entrenador normal.', _p));
end $sel$;

do $ctl$
declare _x record; _r1 text; _r2 text;
begin
  select * into _x from _actores;
  _r1 := pg_temp.sesion(_x.usr_p, format($q$insert into public.wellness (id_deportista, fecha, fatiga, fc_noche) values (%s, current_date + 400, 3, 52) returning 'ENTRA'$q$, _x.p));
  insert into _informe (linea) values
    (format('CONTROL 1. La columna antes de la migración: %s (se espera que no exista)%s',
      case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wellness' and column_name = 'fc_noche_tipo') then 'EXISTE' else 'no existe' end,
      case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wellness' and column_name = 'fc_noche_tipo') then '   <<< CONTROL ROTO' else '' end)),
    (format('CONTROL 2. P apunta su wellness con FC del reloj, con lo de hoy: %s (se espera ENTRA)%s', _r1, case when _r1 <> 'ENTRA' then '   <<< CONTROL ROTO' else '' end));
end $ctl$;

/* 1. La migración: el fichero wellness-fc-noche-tipo.sql tal cual */
/* ============================================================
   WELLNESS: de qué tipo es la FC del reloj (`wellness_fc_noche_tipo`)
   ============================================================
   `wellness.fc_noche` guarda la FC que da cada reloj, y no es la misma medida:
     · Polar: la FC MEDIA de cuatro horas de sueño («FC nocturna»);
     · COROS: su FC EN REPOSO de ese día (no da la media de la noche).
   La de Polar suele salir unas pulsaciones más baja. Mientras un deportista
   lleva una marca su serie no se mezcla, pero el análisis lo llamaba todo «FC
   nocturna», y si cambia de marca las dos medidas entrarían en la misma línea
   base: saldría «fuera de su normal» sin que nada hubiera cambiado.

   Esta columna dice cuál es cada una: 'nocturna' o 'reposo'. El análisis
   (lib/wellness-analisis) las lleva en series separadas, como ya hace con las
   horas de sueño del reloj (`sueno_del_reloj`).

   ADITIVO: una columna nueva, sin valor por defecto. Ninguna fila tenía
   todavía FC del reloj (0 el 2026-10-20), así que no hay nada que rellenar
   hacia atrás. No obliga a ponerla: la app publicada antes que esto guarda
   fc_noche sin ella, y no debe fallar. Sin marca, el análisis la trata como
   hasta ahora (nocturna).
   ============================================================ */

set local lock_timeout = '5s';

alter table public.wellness add column if not exists fc_noche_tipo text
  check (fc_noche_tipo is null or fc_noche_tipo in ('nocturna', 'reposo'));

/* 2 y 3. Lo de siempre no cambia, y la columna nueva */
do $fin$
declare _x record; _r text; _fallos int := 0; _desp text; _nula text;
begin
  select * into _x from _actores;

  select string_agg(a.quien || ' ' || a.n || ' → ' || d.n, ', ') into _desp
    from _antes a join (
      select 'P' as quien, pg_temp.sesion(_x.usr_p, format('select count(*)::text from public.wellness where id_deportista = %s', _x.p))::int as n
      union all select 'E', pg_temp.sesion(_x.e, format('select count(*)::text from public.wellness where id_deportista = %s', _x.p))::int
      union all select 'W', pg_temp.sesion(_x.w, format('select count(*)::text from public.wellness where id_deportista = %s', _x.p))::int
    ) d using (quien)
   where a.n <> d.n;
  insert into _informe (linea) values (format('2a. Cuántas filas del wellness de P ven P, E y W, antes y después: %s (se espera «sin cambios»)%s',
    coalesce(_desp, 'sin cambios'), case when _desp is not null then '   <<< FALLO' else '' end));
  if _desp is not null then _fallos := _fallos + 1; end if;

  _r := pg_temp.sesion(_x.usr_p, format($q$insert into public.wellness (id_deportista, fecha, fatiga, fc_noche) values (%s, current_date + 400, 3, 52) returning coalesce(fc_noche_tipo, 'sin marca')$q$, _x.p));
  insert into _informe (linea) values (format('2b. La app de ahora (FC del reloj sin la marca) sigue guardando: %s (se espera «sin marca»)%s',
    _r, case when _r <> 'sin marca' then '   <<< FALLO' else '' end));
  if _r <> 'sin marca' then _fallos := _fallos + 1; end if;

  _r := pg_temp.sesion(_x.usr_p, format($q$insert into public.wellness (id_deportista, fecha, fatiga, fc_noche, fc_noche_tipo) values (%s, current_date + 400, 3, 55, 'reposo') returning fc_noche_tipo$q$, _x.p))
     || ' / ' || pg_temp.sesion(_x.usr_p, format($q$insert into public.wellness (id_deportista, fecha, fatiga, fc_noche, fc_noche_tipo) values (%s, current_date + 400, 3, 49, 'nocturna') returning fc_noche_tipo$q$, _x.p));
  insert into _informe (linea) values (format('3a. P guarda su FC del reloj con su marca: %s (se espera «reposo / nocturna»)%s',
    _r, case when _r <> 'reposo / nocturna' then '   <<< FALLO' else '' end));
  if _r <> 'reposo / nocturna' then _fallos := _fallos + 1; end if;

  _r := pg_temp.sesion(_x.usr_p, format($q$insert into public.wellness (id_deportista, fecha, fatiga, fc_noche, fc_noche_tipo) values (%s, current_date + 400, 3, 55, 'otra') returning 'ENTRA'$q$, _x.p));
  insert into _informe (linea) values (format('3b. Una marca que no existe: %s (se espera ERR 23514)%s', _r, case when _r <> 'ERR 23514' then '   <<< FALLO' else '' end));
  if _r <> 'ERR 23514' then _fallos := _fallos + 1; end if;

  _r := pg_temp.sesion(_x.e, format($q$insert into public.wellness (id_deportista, fecha, fatiga, fc_noche, fc_noche_tipo) values (%s, current_date + 400, 3, 55, 'reposo') returning 'ENTRA'$q$, _x.p))
     || ' / ' || pg_temp.sesion(_x.w, format($q$insert into public.wellness (id_deportista, fecha, fatiga, fc_noche, fc_noche_tipo) values (%s, current_date + 400, 3, 55, 'reposo') returning 'ENTRA'$q$, _x.p));
  insert into _informe (linea) values (format('3c. Su entrenador E y otro entrenador W, con la marca nueva: %s (se espera «ENTRA / ERR 42501»: lo de siempre)%s',
    _r, case when _r <> 'ENTRA / ERR 42501' then '   <<< FALLO' else '' end));
  if _r <> 'ENTRA / ERR 42501' then _fallos := _fallos + 1; end if;

  select string_agg(column_name || ' ' || is_nullable || ' ' || coalesce(column_default, 'sin defecto'), '') into _nula
    from information_schema.columns where table_schema = 'public' and table_name = 'wellness' and column_name = 'fc_noche_tipo';
  insert into _informe (linea) values (format('3d. La columna: %s (se espera «fc_noche_tipo YES sin defecto»)%s',
    coalesce(_nula, 'NO EXISTE'), case when _nula is distinct from 'fc_noche_tipo YES sin defecto' then '   <<< FALLO' else '' end));
  if _nula is distinct from 'fc_noche_tipo YES sin defecto' then _fallos := _fallos + 1; end if;

  insert into _informe (linea) values (format('Fallos: %s', _fallos));
end $fin$;

do $informe$
declare _r text;
begin
  select string_agg(linea, E'\n' order by orden) into _r from _informe;
  raise exception 'INFORME:%', E'\n' || _r;
end $informe$;
