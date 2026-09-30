/* ============================================================
   TRIPULSE. El deportista ve el test que tiene PLANIFICADO
   ============================================================

   APLICADO EN PRODUCCION el 2026-09-30.

   POR QUE. Un dia de test de los tuyos (test_definicion) le salia al
   deportista como "Hoy hay test", sin nombre. La politica que ya habia
   —test_definicion_dep_lee, via auth_def_ids()— solo le deja leer los tests
   de los que YA tiene mediciones, y uno planificado todavia no lo es.

   POR QUE NO SE MUERDE LA COLA, que es lo que hay que comprobar cada vez que
   se toca RLS aqui: la funcion es SECURITY DEFINER y su dueno es postgres,
   que es el dueno de la tabla sesion, y sesion NO tiene FORCE ROW LEVEL
   SECURITY. Dentro de la funcion no se aplican politicas, asi que leer sesion
   desde una politica de test_definicion no vuelve al punto de partida. Es el
   mismo mecanismo por el que auth_def_ids() puede leer test_medicion, cuya
   politica menciona test_definicion.

   QUE SE ABRE, dicho claro: la fila ENTERA de ese test —nombre, deporte y su
   modelo con las formulas—, no solo el nombre. Es exactamente lo que ya ve de
   un test que ha hecho; lo unico que cambia es que lo ve antes.

   COMO SE VERIFICO (no basta con que la migracion diga "success"), simulando
   al atleta con set role + request.jwt.claims y deshaciendo con rollback:

     1. Antes, el atleta 28 solo veia el test 2, del que tiene mediciones.
     2. Con el test 3 planificado en una sesion suya, pasa a ver los dos.
     3. Con el test 2 planificado en la sesion del 28, el atleta 29 NO lo ve.
     4. Una sesion ELIMINADA no da acceso (se descubrio probando: la primera
        sesion que elegi para la prueba estaba eliminada y no dejo pasar nada).
     5. Con basura en sesion.test ('{"origen":"propio","id":"todos"}' y
        '"basura"') la consulta NO revienta y no deja pasar nada de mas. Eso
        importa: un error aqui romperia la lectura de tests de toda la app.
     6. Despues de los rollback: 398 sesiones, 0 con test. Nada quedo escrito.

   DESHACER:
     drop policy if exists test_definicion_dep_planificado on test_definicion;
     drop function if exists public.auth_def_planificados();
   ============================================================ */

create or replace function public.auth_def_planificados()
returns setof bigint
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct (s.test ->> 'id')::bigint
    from sesion s
   where s.id_deportista in (select auth_dep_ids())
     and s.test ->> 'origen' = 'propio'
     /* El filtro va ANTES que el cast, que es lo que evita que un id escrito
        a mano tumbe la consulta entera. */
     and s.test ->> 'id' ~ '^[0-9]+$'
     and (s.eliminada is null or s.eliminada = false)
$$;

comment on function public.auth_def_planificados() is
  'Los tests propios que alguien tiene PLANIFICADOS en sus sesiones (sesion.test). Para que el deportista vea el nombre antes de haberlo hecho.';

drop policy if exists test_definicion_dep_planificado on test_definicion;

create policy test_definicion_dep_planificado on test_definicion
  for select to authenticated
  using (id in (select auth_def_planificados()));
