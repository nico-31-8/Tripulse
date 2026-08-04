/* ============================================================
   FASE 2 — Lo que ve el panel de plataforma
   ============================================================

   Todo lo de aquí son funciones SECURITY DEFINER que empiezan comprobando
   es_admin_plataforma(auth.uid()). Ese es el único sitio donde se decide quién
   puede mirar. Las tablas siguen cerradas por RLS: el panel no lee `perfiles`
   ni `invitacion` directamente, porque si pudiera hacerlo, también podría
   hacerlo cualquier otro con la clave anónima.

   Requiere haber aplicado antes acceso-invitaciones.sql.
   IDEMPOTENTE.
   ============================================================ */

begin;

/* ============================================================
   1. Quién usó cada código
   ============================================================
   La invitación solo llevaba un contador. Con esto se puede contestar la
   pregunta que de verdad se hace uno: "¿quién entró con el código que le di a
   Fulano?". Sirve igual para códigos de un uso y de varios. */
create table if not exists invitacion_uso (
  id        bigserial primary key,
  codigo    text not null references invitacion(codigo) on delete cascade,
  id_perfil uuid references perfiles(id) on delete set null,
  usada_en  timestamptz not null default now()
);
create index if not exists idx_invitacion_uso_codigo on invitacion_uso(codigo);
alter table invitacion_uso enable row level security;

/* Se reemplaza la función de la fase 1 para que además deje constancia del uso.
   El resto es idéntico. */
create or replace function public.registrar_con_invitacion(
  _codigo text,
  _nombre text,
  _acepto_terminos boolean default false
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  _uid       uuid := auth.uid();
  _email     text;
  _inv       invitacion%rowtype;
  _n_atletas int;
  _cupo      int;
begin
  if _uid is null then
    return jsonb_build_object('ok', false, 'error', 'No hay sesión. Vuelve a empezar el registro.');
  end if;
  if not _acepto_terminos then
    return jsonb_build_object('ok', false, 'error', 'Hay que aceptar la política de privacidad y los términos.');
  end if;
  if coalesce(trim(_nombre), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre.');
  end if;
  if exists (select 1 from perfiles where id = _uid) then
    return jsonb_build_object('ok', false, 'error', 'Esta cuenta ya está registrada.');
  end if;

  select email into _email from auth.users where id = _uid;

  select * into _inv from invitacion where codigo = upper(trim(_codigo)) for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese código no existe.');
  end if;
  if _inv.revocada then
    return jsonb_build_object('ok', false, 'error', 'Ese código ha sido anulado.');
  end if;
  if _inv.caduca is not null and _inv.caduca < now() then
    return jsonb_build_object('ok', false, 'error', 'Ese código ha caducado.');
  end if;
  if _inv.usos >= _inv.usos_max then
    return jsonb_build_object('ok', false, 'error', 'Ese código ya se ha usado.');
  end if;
  if _inv.email is not null and lower(_inv.email) is distinct from lower(_email) then
    return jsonb_build_object('ok', false, 'error', 'Ese código es para otra dirección de correo.');
  end if;

  if _inv.rol = 'deportista' and _inv.id_entrenador is not null then
    select cupo_deportistas into _cupo from perfiles where id = _inv.id_entrenador;
    if _cupo is not null then
      select count(*) into _n_atletas from deportista where id_entrenador = _inv.id_entrenador;
      if _n_atletas >= _cupo then
        return jsonb_build_object('ok', false, 'error', 'Tu entrenador ha llegado a su límite de deportistas. Dile que hable con nosotros.');
      end if;
    end if;
  end if;

  insert into perfiles (id, rol, nombre, email, acepto_terminos,
                        fecha_consentimiento, version_consentimiento, cupo_deportistas)
  values (_uid, _inv.rol, trim(_nombre), _email, true,
          now(), 'v1-2026-07',
          case when _inv.rol = 'entrenador' then _inv.cupo_deportistas else null end);

  if _inv.rol = 'deportista' then
    insert into deportista (id_usuario, nombre, id_entrenador)
    values (_uid, trim(_nombre), _inv.id_entrenador);
  end if;

  update invitacion set usos = usos + 1 where codigo = _inv.codigo;
  insert into invitacion_uso (codigo, id_perfil) values (_inv.codigo, _uid);

  return jsonb_build_object('ok', true, 'rol', _inv.rol);
end $$;

/* ============================================================
   2. Registro de eventos de la app
   ============================================================
   Hasta ahora los errores del cliente se los quedaba la consola del navegador
   de quien los sufría, o sea nadie. Esta tabla es para enterarse. */
create table if not exists evento_app (
  id        bigserial primary key,
  ts        timestamptz not null default now(),
  nivel     text not null check (nivel in ('error','aviso','info')),
  origen    text,
  mensaje   text not null,
  detalle   jsonb,
  id_perfil uuid references perfiles(id) on delete set null,
  agente    text
);
create index if not exists idx_evento_app_ts on evento_app(ts desc);
create index if not exists idx_evento_app_nivel on evento_app(nivel, ts desc);
alter table evento_app enable row level security;

/* Cualquiera con sesión puede ESCRIBIR un evento (es el propio cliente
   contando lo que le ha pasado), pero nadie puede leerlos: la tabla no tiene
   políticas y la lectura va por admin_eventos(). Un usuario no tiene por qué
   ver los fallos de los demás. */
create or replace function public.registrar_evento(
  _nivel text, _mensaje text, _origen text default null,
  _detalle jsonb default null, _agente text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if _nivel not in ('error','aviso','info') then _nivel := 'error'; end if;
  insert into evento_app (nivel, mensaje, origen, detalle, id_perfil, agente)
  values (_nivel, left(coalesce(_mensaje, ''), 2000), left(coalesce(_origen, ''), 300),
          _detalle, auth.uid(), left(coalesce(_agente, ''), 300));
end $$;

/* ============================================================
   3. Cuentas y actividad
   ============================================================
   La pregunta útil no es "cuántos hay" sino "quién se dio de alta y no ha
   vuelto". Por eso va el último acceso (de auth.users) y el último rastro de
   actividad real. */
create or replace function public.admin_cuentas()
returns table (
  id uuid, nombre text, email text, rol text,
  cupo_deportistas int, n_deportistas bigint,
  id_deportista int, entrenador text,
  n_sesiones bigint, n_realizadas bigint, n_wellness bigint,
  ultima_sesion date, ultimo_wellness date,
  ultimo_acceso timestamptz, alta timestamptz
) language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;
  return query
  select
    p.id, p.nombre, p.email, p.rol,
    p.cupo_deportistas,
    (select count(*) from deportista d2 where d2.id_entrenador = p.id) as n_deportistas,
    d.id as id_deportista,
    (select p2.nombre from perfiles p2 where p2.id = d.id_entrenador) as entrenador,
    (select count(*) from sesion s where s.id_deportista = d.id) as n_sesiones,
    (select count(*) from sesion s where s.id_deportista = d.id and s.estado = 'Realizada') as n_realizadas,
    (select count(*) from wellness w where w.id_deportista = d.id) as n_wellness,
    (select max(s.fecha_sesion) from sesion s where s.id_deportista = d.id and s.estado = 'Realizada') as ultima_sesion,
    (select max(w.fecha) from wellness w where w.id_deportista = d.id) as ultimo_wellness,
    u.last_sign_in_at as ultimo_acceso,
    coalesce(p.fecha_consentimiento, u.created_at) as alta
  from perfiles p
  left join deportista d on d.id_usuario = p.id
  left join auth.users u on u.id = p.id
  order by u.last_sign_in_at desc nulls last;
end $$;

/* ============================================================
   4. Invitaciones
   ============================================================ */
create or replace function public.admin_invitaciones()
returns table (
  codigo text, rol text, nota text, email text,
  entrenador text, cupo_deportistas int,
  usos int, usos_max int, caduca timestamptz,
  revocada boolean, creada_en timestamptz, usada_por text
) language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;
  return query
  select i.codigo, i.rol, i.nota, i.email,
    (select p.nombre from perfiles p where p.id = i.id_entrenador) as entrenador,
    i.cupo_deportistas, i.usos, i.usos_max, i.caduca, i.revocada, i.creada_en,
    (select string_agg(coalesce(p3.nombre, p3.email), ', ')
       from invitacion_uso iu left join perfiles p3 on p3.id = iu.id_perfil
      where iu.codigo = i.codigo) as usada_por
  from invitacion i
  order by i.creada_en desc;
end $$;

/* Lista de entrenadores, para el desplegable al crear una invitación de
   deportista. Va con su cupo y cuántos lleva, que es lo que hay que mirar
   antes de mandarle a otro. */
create or replace function public.admin_entrenadores()
returns table (id uuid, nombre text, email text, cupo_deportistas int, n_deportistas bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;
  return query
  select p.id, p.nombre, p.email, p.cupo_deportistas,
    (select count(*) from deportista d where d.id_entrenador = p.id)
  from perfiles p where p.rol = 'entrenador'
  order by p.nombre;
end $$;

/* Cambiar el cupo de un entrenador ya dado de alta. El trigger
   bloquear_ascenso_perfil deja pasar esto porque quien lo ejecuta es
   plataforma. */
create or replace function public.admin_fijar_cupo(_id_entrenador uuid, _cupo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;
  update perfiles set cupo_deportistas = _cupo where id = _id_entrenador and rol = 'entrenador';
end $$;

/* ============================================================
   5. Salud de los datos
   ============================================================
   Las incoherencias que hemos ido cazando a mano, ahora en una lista. Devuelve
   una fila por comprobación: clave, qué significa y cuántos hay. */
create or replace function public.admin_salud()
returns table (clave text, etiqueta text, n bigint, gravedad text)
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;

  return query
  select 'dep_sin_entrenador', 'Deportistas sin entrenador vinculado',
         (select count(*) from deportista where id_entrenador is null), 'aviso';

  return query
  select 'perfil_sin_deportista', 'Perfiles con rol deportista pero sin ficha',
         (select count(*) from perfiles p where p.rol = 'deportista'
            and not exists (select 1 from deportista d where d.id_usuario = p.id)), 'error';

  return query
  select 'sin_anamnesis', 'Deportistas con entrenador y sin anamnesis enviada',
         (select count(*) from deportista d where d.id_entrenador is not null
            and not exists (select 1 from anamnesis a where a.id_deportista = d.id and a.estado = 'enviada')), 'aviso';

  return query
  select 'sesion_sin_carga', 'Sesiones realizadas sin duración NI tareas (valen 0 en la carga)',
         (select count(*) from sesion s where s.estado = 'Realizada'
            and coalesce(s.duracion_real, 0) = 0 and coalesce(s.duracion_minutos, 0) = 0
            and not exists (select 1 from tarea t where t.id_sesion = s.id)), 'error';

  return query
  select 'realizada_sin_rpe', 'Sesiones realizadas sin RPE reportado',
         (select count(*) from sesion s where s.estado = 'Realizada'
            and s.rpe_reportado is null), 'aviso';

  return query
  select 'cupo_excedido', 'Entrenadores por encima de su cupo',
         (select count(*) from perfiles p where p.rol = 'entrenador' and p.cupo_deportistas is not null
            and (select count(*) from deportista d where d.id_entrenador = p.id) > p.cupo_deportistas), 'aviso';

  return query
  select 'inv_caducada', 'Invitaciones caducadas sin usar',
         (select count(*) from invitacion i where i.usos = 0 and not i.revocada
            and i.caduca is not null and i.caduca < now()), 'info';

  return query
  select 'sin_volver', 'Cuentas que nunca han vuelto a entrar tras el alta',
         (select count(*) from perfiles p join auth.users u on u.id = p.id
           where u.last_sign_in_at is null
              or u.last_sign_in_at <= u.created_at + interval '5 minutes'), 'info';
end $$;

/* ============================================================
   6. Errores y avisos
   ============================================================ */
create or replace function public.admin_eventos(_limite int default 100, _nivel text default null)
returns table (id bigint, ts timestamptz, nivel text, origen text, mensaje text,
               detalle jsonb, quien text, agente text)
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;
  return query
  select e.id, e.ts, e.nivel, e.origen, e.mensaje, e.detalle,
         coalesce(p.nombre, p.email) as quien, e.agente
  from evento_app e left join perfiles p on p.id = e.id_perfil
  where (_nivel is null or e.nivel = _nivel)
  order by e.ts desc
  limit greatest(coalesce(_limite, 100), 1);
end $$;

create or replace function public.admin_limpiar_eventos(_dias int default 30)
returns bigint language plpgsql security definer set search_path = public as $$
declare _n bigint;
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;
  delete from evento_app where ts < now() - (greatest(coalesce(_dias,30),1) || ' days')::interval;
  get diagnostics _n = row_count;
  return _n;
end $$;

/* ============================================================
   7. Resumen de cabecera
   ============================================================ */
create or replace function public.admin_resumen()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;
  return jsonb_build_object(
    'entrenadores', (select count(*) from perfiles where rol = 'entrenador'),
    'deportistas',  (select count(*) from perfiles where rol = 'deportista'),
    'activos_7d',   (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'sesiones_7d',  (select count(*) from sesion where fecha_sesion > (now() - interval '7 days')::date),
    'inv_abiertas', (select count(*) from invitacion where usos < usos_max and not revocada
                       and (caduca is null or caduca > now())),
    'errores_24h',  (select count(*) from evento_app where nivel = 'error' and ts > now() - interval '24 hours')
  );
end $$;

commit;

notify pgrst, 'reload schema';

/* ============================================================
   COMPROBACIÓN (con tu uuid, porque el editor SQL no tiene auth.uid())

     select es_admin_plataforma('TU-UUID-AQUI');

   El resto de funciones solo responden desde la app, con tu sesión. Si quieres
   probarlas aquí, mira las tablas a pelo:

     select * from invitacion;
     select * from evento_app order by ts desc limit 20;
   ============================================================ */
