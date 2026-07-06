-- ============================================================
-- TRIPULSE — Seguridad RLS · FASE B1 (funciones, aditivo y seguro)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- Crea funciones SECURITY DEFINER para los flujos que legítimamente
-- cruzan propiedad (buscar entrenador por código, aceptar invitación),
-- para poder cerrar RLS sin romperlos. También prepara series_realizadas.
--
-- Es aditivo: NO cambia ninguna política todavía. La app sigue igual.
-- ============================================================

-- ------------------------------------------------------------
-- 1. buscar_entrenador(codigo) → devuelve id + nombre del entrenador
-- Reemplaza el SELECT directo sobre perfiles por código (que exponía
-- email de todos los entrenadores). Solo devuelve id y nombre.
-- ------------------------------------------------------------
create or replace function public.buscar_entrenador(p_codigo text)
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre
  from perfiles p
  where p.rol = 'entrenador'
    and upper(p.codigo_entrenador) = upper(p_codigo)
  limit 1
$$;

-- ------------------------------------------------------------
-- 2. aceptar_invitacion(token) → vincula al usuario actual con el
-- deportista de la invitación y marca la invitación como usada.
-- Gated por token (secreto). Corre como definer para poder tocar la
-- fila deportista que aún no pertenece al atleta.
-- ------------------------------------------------------------
create or replace function public.aceptar_invitacion(p_token text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep integer;
begin
  -- Buscar invitación válida y sin usar
  select id_deportista into v_dep
  from invitacion_deportista
  where token = p_token and usado = false;

  if v_dep is null then
    raise exception 'Invitación no válida o ya usada';
  end if;

  -- Vincular el usuario autenticado al deportista
  update deportista
  set id_usuario = auth.uid()
  where id = v_dep;

  -- Marcar invitación como usada
  update invitacion_deportista
  set usado = true
  where token = p_token;

  return v_dep;
end $$;

-- ------------------------------------------------------------
-- 3. Preparar series_realizadas (cuelga de ejercicios).
-- Le damos id_deportista + trigger para poder aplicar RLS uniforme.
-- Está vacía, así que no hay backfill.
-- ------------------------------------------------------------
alter table series_realizadas add column if not exists id_deportista integer;
create index if not exists idx_series_realizadas_dep on series_realizadas(id_deportista);

create or replace function public.fill_dep_series_realizadas()
returns trigger language plpgsql as $$
begin
  if new.id_deportista is null then
    select e.id_deportista into new.id_deportista
    from ejercicios e where e.id = new.id_ejercicio;
  end if;
  return new;
end $$;
drop trigger if exists trg_fill_dep_series_realizadas on series_realizadas;
create trigger trg_fill_dep_series_realizadas before insert on series_realizadas
  for each row execute function public.fill_dep_series_realizadas();

-- ------------------------------------------------------------
-- Verificación rápida (deben existir las 2 funciones)
-- ------------------------------------------------------------
select proname from pg_proc
where proname in ('buscar_entrenador','aceptar_invitacion','auth_dep_ids')
order by proname;
