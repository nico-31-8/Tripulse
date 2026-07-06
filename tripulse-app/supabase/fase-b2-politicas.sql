-- ============================================================
-- TRIPULSE — Seguridad RLS · FASE B2 (EL INTERRUPTOR)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- Borra TODAS las políticas actuales (buenas, duplicadas y basura) de las
-- tablas de la app y crea un set único, limpio y rápido basado en la
-- columna id_deportista (desnormalizada en Fase A) y la función auth_dep_ids().
--
-- Requisitos previos: haber corrido fase-a.sql y fase-b1-funciones.sql,
-- y tener el código de la app actualizado (registro/perfil/invitacion usan rpc).
--
-- Se ejecuta dentro de una transacción: si algo falla, no se aplica nada.
-- Si tras aplicarlo algo va mal, usa rollback-emergencia.sql.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. BORRAR todas las políticas existentes de las tablas de la app
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'perfiles','deportista',
        'macrociclo','mesociclo','microciclo','sesion','tarea',
        'p_distancia','p_duracion','p_repeticiones','ejercicios','series_realizadas',
        'wellness','test1_carrera','test2_natacion','test3_ciclismo','test_fuerza','tests_libres',
        'anamnesis','disponibilidad','competicion','registro_peso','semana_bloqueada','dibujo_borrador',
        'mensajes','invitacion_deportista','ejercicios_biblioteca'
      )
  loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- Asegurar RLS activada en todas (idempotente)
alter table perfiles              enable row level security;
alter table deportista            enable row level security;
alter table macrociclo            enable row level security;
alter table mesociclo             enable row level security;
alter table microciclo            enable row level security;
alter table sesion                enable row level security;
alter table tarea                 enable row level security;
alter table p_distancia           enable row level security;
alter table p_duracion            enable row level security;
alter table p_repeticiones        enable row level security;
alter table ejercicios            enable row level security;
alter table series_realizadas     enable row level security;
alter table wellness              enable row level security;
alter table test1_carrera         enable row level security;
alter table test2_natacion        enable row level security;
alter table test3_ciclismo        enable row level security;
alter table test_fuerza           enable row level security;
alter table tests_libres          enable row level security;
alter table anamnesis             enable row level security;
alter table disponibilidad        enable row level security;
alter table competicion           enable row level security;
alter table registro_peso         enable row level security;
alter table semana_bloqueada      enable row level security;
alter table dibujo_borrador       enable row level security;
alter table mensajes              enable row level security;
alter table invitacion_deportista enable row level security;
alter table ejercicios_biblioteca enable row level security;

-- ------------------------------------------------------------
-- 2. PERFILES — solo el propio (búsqueda de entrenador va por función)
-- ------------------------------------------------------------
create policy perfiles_own on perfiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- ------------------------------------------------------------
-- 3. DEPORTISTA — entrenador dueño o el propio atleta
-- ------------------------------------------------------------
create policy deportista_rw on deportista for all
  using (id_entrenador = auth.uid() or id_usuario = auth.uid())
  with check (id_entrenador = auth.uid() or id_usuario = auth.uid());

-- ------------------------------------------------------------
-- 4. JERARQUÍA + DATOS POR DEPORTISTA
-- Patrón único: id_deportista IN (SELECT auth_dep_ids())
-- ------------------------------------------------------------
create policy macrociclo_dep     on macrociclo        for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy mesociclo_dep      on mesociclo         for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy microciclo_dep     on microciclo        for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy sesion_dep         on sesion            for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy tarea_dep          on tarea             for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy p_distancia_dep    on p_distancia       for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy p_duracion_dep     on p_duracion        for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy p_repeticiones_dep on p_repeticiones    for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy ejercicios_dep     on ejercicios        for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy series_real_dep    on series_realizadas for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy wellness_dep       on wellness          for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy test1_dep          on test1_carrera     for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy test2_dep          on test2_natacion    for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy test3_dep          on test3_ciclismo    for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy testf_dep          on test_fuerza       for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy testlibres_dep     on tests_libres      for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy anamnesis_dep      on anamnesis         for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy disponibilidad_dep on disponibilidad    for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy competicion_dep    on competicion       for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy peso_dep           on registro_peso     for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy semanabloq_dep     on semana_bloqueada  for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));
create policy dibujo_dep         on dibujo_borrador   for all using (id_deportista in (select auth_dep_ids())) with check (id_deportista in (select auth_dep_ids()));

-- ------------------------------------------------------------
-- 5. MENSAJES — entrenador o deportista de la conversación
-- ------------------------------------------------------------
create policy mensajes_rw on mensajes for all
  using (id_entrenador = auth.uid() or id_deportista in (select auth_dep_ids()))
  with check (id_entrenador = auth.uid() or id_deportista in (select auth_dep_ids()));

-- ------------------------------------------------------------
-- 6. INVITACION_DEPORTISTA
-- Lectura: por token sin usar (aceptación) o entrenador dueño
-- Escritura: entrenador dueño (la aceptación la hace la función definer)
-- ------------------------------------------------------------
create policy invitacion_select on invitacion_deportista for select
  using (usado = false or id_entrenador = auth.uid());
create policy invitacion_write on invitacion_deportista for all
  using (id_entrenador = auth.uid())
  with check (id_entrenador = auth.uid());

-- ------------------------------------------------------------
-- 7. EJERCICIOS_BIBLIOTECA — catálogo: todos leen, entrenadores escriben
-- ------------------------------------------------------------
create policy eb_read on ejercicios_biblioteca for select
  using (auth.role() = 'authenticated');
create policy eb_write on ejercicios_biblioteca for all
  using (exists (select 1 from perfiles where id = auth.uid() and rol = 'entrenador'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'entrenador'));

commit;

-- ------------------------------------------------------------
-- 8. VERIFICACIÓN — cuántas políticas quedan por tabla (debe ser 1-2)
-- ------------------------------------------------------------
select tablename, count(*) as politicas
from pg_policies where schemaname = 'public'
group by tablename order by tablename;
