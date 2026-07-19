-- ============================================================
-- COMUNIDAD · Paso 5 — Retos / competiciones
-- ============================================================
-- Retos con ranking. El ámbito puede ser abierto, de club o de grupo.
--
-- PRIVACIDAD (la clave):
--   El ranking NO expone el entrenamiento de nadie. Apuntarse = consentir compartir
--   UN número agregado (nº de sesiones / minutos / carga en el periodo).
--
--   Cómo se calcula sin servidor y sin trampas: cada participante llama a
--   `actualizar_mi_marcador()`, que calcula SU agregado DENTRO de la base de datos
--   (leyendo solo SUS sesiones, security definer) y lo escribe. Nadie puede escribir
--   una marca a mano (reto_marcador no tiene política de escritura) ni leer las
--   sesiones de otro.
--
-- ⚠️ NO EJECUTAR salvo que estemos montando esto. Idempotente.
-- ------------------------------------------------------------

create table if not exists reto (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  descripcion  text,
  metrica      text not null default 'sesiones' check (metrica in ('sesiones','tiempo','carga')),
  disciplina   text,
  ambito       text not null default 'abierto',
  id_club      uuid references club(id) on delete cascade,
  id_grupo     uuid references grupo(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin    date not null,
  creado_por   uuid references perfiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists reto_participante (
  id_reto    uuid not null references reto(id) on delete cascade,
  id_perfil  uuid not null references perfiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (id_reto, id_perfil)
);

create table if not exists reto_marcador (
  id_reto     uuid not null references reto(id) on delete cascade,
  id_perfil   uuid not null references perfiles(id) on delete cascade,
  valor       numeric not null default 0,
  actualizado timestamptz not null default now(),
  primary key (id_reto, id_perfil)
);

create index if not exists idx_reto_participante_perfil on reto_participante(id_perfil);
create index if not exists idx_reto_marcador_reto on reto_marcador(id_reto);

-- ---------- Helpers ----------

create or replace function es_participante_reto(_reto uuid, _uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from reto_participante where id_reto = _reto and id_perfil = _uid);
$$;

create or replace function puede_ver_reto(_reto uuid, _uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from reto r where r.id = _reto and (
      es_participante_reto(_reto, _uid)
      or (r.ambito = 'abierto' and es_social_activo(_uid))
      or (r.ambito = 'club'  and es_miembro_club(r.id_club, _uid))
      or (r.ambito = 'grupo' and es_miembro_grupo(r.id_grupo, _uid))
    )
  );
$$;

-- ---------- El cálculo de la marca (server-side, sin trampas) ----------
-- Calcula MI agregado a partir de MIS sesiones realizadas en el periodo del reto y lo
-- escribe en reto_marcador. Security definer: lee solo mis datos, pero salta el RLS de
-- reto_marcador (que nadie puede escribir a mano). Devuelve el valor calculado.
create or replace function actualizar_mi_marcador(_reto uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare _r reto; _dep int; _val numeric := 0;
begin
  select * into _r from reto where id = _reto;
  if _r.id is null then raise exception 'Reto no encontrado'; end if;
  if not es_participante_reto(_reto, auth.uid()) then raise exception 'No participas en este reto'; end if;

  select id into _dep from deportista where id_usuario = auth.uid() limit 1;

  if _dep is not null then
    with mis_ses as (
      select s.duracion_minutos, s.rpe_reportado, s.rpe_estimado
      from sesion s
      where s.estado = 'Realizada'
        and s.fecha_sesion::date between _r.fecha_inicio and _r.fecha_fin
        and (_r.disciplina is null or s.disciplina = _r.disciplina)
        and (
          s.id_deportista = _dep
          or s.id_microciclo in (
            select mi.id from microciclo mi
            join mesociclo me on me.id = mi.id_mesociclo
            join macrociclo ma on ma.id = me.id_macrociclo
            where ma.id_deportista = _dep
          )
        )
    )
    select case _r.metrica
      when 'sesiones' then count(*)
      when 'tiempo'   then coalesce(sum(duracion_minutos), 0)
      when 'carga'    then coalesce(sum(coalesce(rpe_reportado, rpe_estimado, 5) * coalesce(duracion_minutos, 0)), 0)
      else 0 end
    into _val from mis_ses;
  end if;

  insert into reto_marcador (id_reto, id_perfil, valor, actualizado)
    values (_reto, auth.uid(), _val, now())
    on conflict (id_reto, id_perfil) do update set valor = excluded.valor, actualizado = now();
  return _val;
end;
$$;

-- Ranking con nombre (sin email), para participantes del reto.
create or replace view reto_marcador_v
with (security_invoker = false) as
  select m.id_reto, m.id_perfil, m.valor, m.actualizado, p.nombre, p.avatar_url
  from reto_marcador m
  join perfiles p on p.id = m.id_perfil
  where es_participante_reto(m.id_reto, auth.uid());
grant select on reto_marcador_v to authenticated;

-- ---------- RLS ----------

alter table reto enable row level security;
alter table reto_participante enable row level security;
alter table reto_marcador enable row level security;

drop policy if exists reto_select on reto;
create policy reto_select on reto for select using (puede_ver_reto(id, auth.uid()));
drop policy if exists reto_crear on reto;
create policy reto_crear on reto for insert with check (
  creado_por = auth.uid() and (
    (ambito = 'abierto' and es_social_activo(auth.uid()))
    or (ambito = 'club'  and es_miembro_club(id_club, auth.uid()))
    or (ambito = 'grupo' and es_miembro_grupo(id_grupo, auth.uid()))
  )
);
drop policy if exists reto_editar on reto;
create policy reto_editar on reto for update using (creado_por = auth.uid()) with check (creado_por = auth.uid());
drop policy if exists reto_borrar on reto;
create policy reto_borrar on reto for delete using (creado_por = auth.uid());

drop policy if exists reto_participante_select on reto_participante;
create policy reto_participante_select on reto_participante for select using (puede_ver_reto(id_reto, auth.uid()));
drop policy if exists reto_participante_unirse on reto_participante;
create policy reto_participante_unirse on reto_participante for insert with check (id_perfil = auth.uid() and puede_ver_reto(id_reto, auth.uid()));
drop policy if exists reto_participante_salir on reto_participante;
create policy reto_participante_salir on reto_participante for delete using (id_perfil = auth.uid());

-- reto_marcador: SOLO lectura y solo participantes. Sin política de escritura → nadie
-- escribe marcas a mano; solo lo hace actualizar_mi_marcador (security definer).
drop policy if exists reto_marcador_select on reto_marcador;
create policy reto_marcador_select on reto_marcador for select using (es_participante_reto(id_reto, auth.uid()));

notify pgrst, 'reload schema';
