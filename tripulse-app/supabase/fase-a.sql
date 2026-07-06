-- ============================================================
-- TRIPULSE — Seguridad RLS · FASE A (aditiva, no rompe nada)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- Qué hace:
--   1. Función helper auth_dep_ids() → deportistas accesibles por el usuario
--   2. Añade columna id_deportista a las 8 tablas de jerarquía que no la tienen
--   3. Backfill de esa columna desde la jerarquía existente
--   4. Triggers que la rellenan sola en cada INSERT futuro
--
-- Tras esta fase la app sigue funcionando IGUAL (nada de seguridad cambia
-- todavía). Solo añadimos columnas + triggers. 100% reversible.
-- ============================================================

-- ------------------------------------------------------------
-- 1. FUNCIÓN HELPER
-- Devuelve los deportista.id a los que el usuario actual puede acceder:
--   - Si es deportista: su propio registro (id_usuario = auth.uid())
--   - Si es entrenador: todos sus deportistas (id_entrenador = auth.uid())
-- STABLE + SECURITY DEFINER: se evalúa una vez por query (rápido) y salta RLS
-- de la tabla deportista para evitar recursión.
-- ------------------------------------------------------------
create or replace function public.auth_dep_ids()
returns setof integer
language sql
stable
security definer
set search_path = public
as $$
  select id from deportista
  where id_usuario = auth.uid()
     or id_entrenador = auth.uid()
$$;

-- ------------------------------------------------------------
-- 2. AÑADIR COLUMNA id_deportista (nullable de momento)
-- ADD COLUMN nullable es instantáneo en Postgres (no reescribe la tabla).
-- ------------------------------------------------------------
alter table mesociclo       add column if not exists id_deportista integer;
alter table microciclo      add column if not exists id_deportista integer;
alter table sesion          add column if not exists id_deportista integer;
alter table tarea           add column if not exists id_deportista integer;
alter table p_distancia     add column if not exists id_deportista integer;
alter table p_duracion      add column if not exists id_deportista integer;
alter table p_repeticiones  add column if not exists id_deportista integer;
alter table ejercicios      add column if not exists id_deportista integer;

-- ------------------------------------------------------------
-- 3. BACKFILL desde la jerarquía actual
-- Orden: de arriba abajo, cada nivel copia del padre ya rellenado.
-- ------------------------------------------------------------
-- mesociclo <- macrociclo (que ya tiene id_deportista)
update mesociclo me
set id_deportista = ma.id_deportista
from macrociclo ma
where ma.id = me.id_macrociclo
  and me.id_deportista is null;

-- microciclo <- mesociclo
update microciclo mi
set id_deportista = me.id_deportista
from mesociclo me
where me.id = mi.id_mesociclo
  and mi.id_deportista is null;

-- sesion <- microciclo
update sesion s
set id_deportista = mi.id_deportista
from microciclo mi
where mi.id = s.id_microciclo
  and s.id_deportista is null;

-- tarea <- sesion
update tarea t
set id_deportista = s.id_deportista
from sesion s
where s.id = t.id_sesion
  and t.id_deportista is null;

-- p_distancia / p_duracion / p_repeticiones / ejercicios <- tarea
update p_distancia p
set id_deportista = t.id_deportista
from tarea t
where t.id = p.id_tarea
  and p.id_deportista is null;

update p_duracion p
set id_deportista = t.id_deportista
from tarea t
where t.id = p.id_tarea
  and p.id_deportista is null;

update p_repeticiones p
set id_deportista = t.id_deportista
from tarea t
where t.id = p.id_tarea
  and p.id_deportista is null;

update ejercicios e
set id_deportista = t.id_deportista
from tarea t
where t.id = e.id_tarea
  and e.id_deportista is null;

-- ------------------------------------------------------------
-- 4. ÍNDICES en id_deportista (para que RLS sea rápido)
-- ------------------------------------------------------------
create index if not exists idx_mesociclo_dep      on mesociclo(id_deportista);
create index if not exists idx_microciclo_dep     on microciclo(id_deportista);
create index if not exists idx_sesion_dep         on sesion(id_deportista);
create index if not exists idx_tarea_dep          on tarea(id_deportista);
create index if not exists idx_p_distancia_dep    on p_distancia(id_deportista);
create index if not exists idx_p_duracion_dep     on p_duracion(id_deportista);
create index if not exists idx_p_repeticiones_dep on p_repeticiones(id_deportista);
create index if not exists idx_ejercicios_dep     on ejercicios(id_deportista);

-- ------------------------------------------------------------
-- 5. TRIGGERS: rellenar id_deportista automáticamente en cada INSERT
-- Cada trigger deriva id_deportista del padre inmediato (que ya lo tiene).
-- Así el código de la app NO necesita cambios.
-- ------------------------------------------------------------

-- mesociclo <- macrociclo
create or replace function public.fill_dep_mesociclo()
returns trigger language plpgsql as $$
begin
  if new.id_deportista is null then
    select ma.id_deportista into new.id_deportista
    from macrociclo ma where ma.id = new.id_macrociclo;
  end if;
  return new;
end $$;
drop trigger if exists trg_fill_dep_mesociclo on mesociclo;
create trigger trg_fill_dep_mesociclo before insert on mesociclo
  for each row execute function public.fill_dep_mesociclo();

-- microciclo <- mesociclo
create or replace function public.fill_dep_microciclo()
returns trigger language plpgsql as $$
begin
  if new.id_deportista is null then
    select me.id_deportista into new.id_deportista
    from mesociclo me where me.id = new.id_mesociclo;
  end if;
  return new;
end $$;
drop trigger if exists trg_fill_dep_microciclo on microciclo;
create trigger trg_fill_dep_microciclo before insert on microciclo
  for each row execute function public.fill_dep_microciclo();

-- sesion <- microciclo
create or replace function public.fill_dep_sesion()
returns trigger language plpgsql as $$
begin
  if new.id_deportista is null then
    select mi.id_deportista into new.id_deportista
    from microciclo mi where mi.id = new.id_microciclo;
  end if;
  return new;
end $$;
drop trigger if exists trg_fill_dep_sesion on sesion;
create trigger trg_fill_dep_sesion before insert on sesion
  for each row execute function public.fill_dep_sesion();

-- tarea <- sesion
create or replace function public.fill_dep_tarea()
returns trigger language plpgsql as $$
begin
  if new.id_deportista is null then
    select s.id_deportista into new.id_deportista
    from sesion s where s.id = new.id_sesion;
  end if;
  return new;
end $$;
drop trigger if exists trg_fill_dep_tarea on tarea;
create trigger trg_fill_dep_tarea before insert on tarea
  for each row execute function public.fill_dep_tarea();

-- p_distancia / p_duracion / p_repeticiones / ejercicios <- tarea
create or replace function public.fill_dep_from_tarea()
returns trigger language plpgsql as $$
begin
  if new.id_deportista is null then
    select t.id_deportista into new.id_deportista
    from tarea t where t.id = new.id_tarea;
  end if;
  return new;
end $$;

drop trigger if exists trg_fill_dep_p_distancia on p_distancia;
create trigger trg_fill_dep_p_distancia before insert on p_distancia
  for each row execute function public.fill_dep_from_tarea();

drop trigger if exists trg_fill_dep_p_duracion on p_duracion;
create trigger trg_fill_dep_p_duracion before insert on p_duracion
  for each row execute function public.fill_dep_from_tarea();

drop trigger if exists trg_fill_dep_p_repeticiones on p_repeticiones;
create trigger trg_fill_dep_p_repeticiones before insert on p_repeticiones
  for each row execute function public.fill_dep_from_tarea();

drop trigger if exists trg_fill_dep_ejercicios on ejercicios;
create trigger trg_fill_dep_ejercicios before insert on ejercicios
  for each row execute function public.fill_dep_from_tarea();

-- ------------------------------------------------------------
-- 6. VERIFICACIÓN — ejecutar y revisar que no queda NULL
-- (todas deben dar 0 filas sin id_deportista)
-- ------------------------------------------------------------
select 'mesociclo'      as tabla, count(*) filter (where id_deportista is null) as sin_dep, count(*) as total from mesociclo
union all select 'microciclo',     count(*) filter (where id_deportista is null), count(*) from microciclo
union all select 'sesion',         count(*) filter (where id_deportista is null), count(*) from sesion
union all select 'tarea',          count(*) filter (where id_deportista is null), count(*) from tarea
union all select 'p_distancia',    count(*) filter (where id_deportista is null), count(*) from p_distancia
union all select 'p_duracion',     count(*) filter (where id_deportista is null), count(*) from p_duracion
union all select 'p_repeticiones', count(*) filter (where id_deportista is null), count(*) from p_repeticiones
union all select 'ejercicios',     count(*) filter (where id_deportista is null), count(*) from ejercicios;
