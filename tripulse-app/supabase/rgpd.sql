-- ============================================================
-- TRIPULSE — RGPD / Protección de datos
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- 1. Arreglo: el deportista debe poder ver el perfil de SU entrenador
-- 2. Columnas de consentimiento en perfiles
-- 3. Función eliminar_mi_cuenta() (derecho al olvido)
-- ============================================================

-- ------------------------------------------------------------
-- 1. FIX: deportista puede leer el perfil de su entrenador
-- (la política "solo el propio" de la Fase B2 lo impedía)
-- ------------------------------------------------------------
create or replace function public.mi_entrenador_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id_entrenador from deportista where id_usuario = auth.uid() limit 1
$$;

drop policy if exists perfiles_mi_entrenador on perfiles;
create policy perfiles_mi_entrenador on perfiles for select
  using (id = public.mi_entrenador_id());

-- ------------------------------------------------------------
-- 2. CONSENTIMIENTO — columnas en perfiles
-- ------------------------------------------------------------
alter table perfiles add column if not exists acepto_terminos boolean not null default false;
alter table perfiles add column if not exists fecha_consentimiento timestamptz;
alter table perfiles add column if not exists version_consentimiento text;

-- ------------------------------------------------------------
-- 3. DERECHO AL OLVIDO — eliminar_mi_cuenta()
-- Deportista: borra TODOS sus datos (erasure completo).
-- Entrenador: desvincula sus atletas (no borra los datos de ellos,
--   son sujetos de datos independientes) y borra lo suyo.
-- Finalmente borra el perfil y la cuenta de auth.
-- ------------------------------------------------------------
create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_dep integer;
  v_rol text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select rol into v_rol from perfiles where id = v_uid;

  -- --- Si es DEPORTISTA: borrar todos sus datos ---
  select id into v_dep from deportista where id_usuario = v_uid;
  if v_dep is not null then
    delete from series_realizadas   where id_deportista = v_dep;
    delete from p_distancia         where id_deportista = v_dep;
    delete from p_duracion          where id_deportista = v_dep;
    delete from p_repeticiones      where id_deportista = v_dep;
    delete from ejercicios          where id_deportista = v_dep;
    delete from tarea               where id_deportista = v_dep;
    delete from sesion              where id_deportista = v_dep;
    delete from microciclo          where id_deportista = v_dep;
    delete from mesociclo           where id_deportista = v_dep;
    delete from macrociclo          where id_deportista = v_dep;
    delete from wellness            where id_deportista = v_dep;
    delete from test1_carrera       where id_deportista = v_dep;
    delete from test2_natacion      where id_deportista = v_dep;
    delete from test3_ciclismo      where id_deportista = v_dep;
    delete from test_fuerza         where id_deportista = v_dep;
    delete from tests_libres        where id_deportista = v_dep;
    delete from anamnesis           where id_deportista = v_dep;
    delete from disponibilidad      where id_deportista = v_dep;
    delete from competicion         where id_deportista = v_dep;
    delete from registro_peso       where id_deportista = v_dep;
    delete from semana_bloqueada    where id_deportista = v_dep;
    delete from dibujo_borrador     where id_deportista = v_dep;
    delete from zonas_entrenamiento where id_deportista = v_dep;
    delete from mensajes            where id_deportista = v_dep;
    delete from invitacion_deportista where id_deportista = v_dep;
    delete from deportista          where id = v_dep;
  end if;

  -- --- Si es ENTRENADOR: desvincular atletas, borrar lo suyo ---
  if v_rol = 'entrenador' then
    update deportista set id_entrenador = null where id_entrenador = v_uid;
    delete from mensajes where id_entrenador = v_uid;
    delete from invitacion_deportista where id_entrenador = v_uid;
  end if;

  -- --- Perfil y cuenta de auth ---
  delete from perfiles where id = v_uid;
  delete from auth.users where id = v_uid;
end $$;
