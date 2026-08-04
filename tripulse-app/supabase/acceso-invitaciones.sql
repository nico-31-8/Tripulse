/* ============================================================
   FASE 1 — El candado: quién puede entrar en TRIPULSE
   ============================================================

   PROBLEMA QUE RESUELVE

   Hasta ahora /registro estaba abierto y, peor, el ROL se lo ponía el propio
   usuario: el formulario mandaba rol='entrenador' a `perfiles` y la política
   `perfiles_own` (id = auth.uid() FOR ALL) lo aceptaba sin mirar. Cualquiera
   podía darse de alta como entrenador, y ser entrenador da escritura sobre la
   biblioteca de ejercicios compartida.

   Tapar la PÁGINA no sirve de nada: supabase.auth.signUp es un endpoint de
   Supabase que cualquiera puede llamar con la clave anónima, que viaja pública
   en el bundle del navegador. El candado tiene que estar aquí.

   POR QUÉ ESTO FUNCIONA

   Un usuario de auth.users SIN fila en `perfiles` es inerte: todas las
   políticas RLS de la app cuelgan de `perfiles` o de `deportista`. Así que lo
   que hay que proteger no es el alta, es la CREACIÓN DEL PERFIL. A partir de
   aquí solo se puede crear un perfil pasando por registrar_con_invitacion(),
   y esa función coge el rol de la INVITACIÓN, no de lo que diga el cliente.

   Se apoya en plataforma_admin / es_admin_plataforma(), que ya existían para
   el módulo Comunidad. No se inventa un segundo concepto de administrador.

   IDEMPOTENTE: se puede volver a ejecutar sin romper nada.
   ============================================================ */

begin;

/* ============================================================
   1. Cupo de deportistas por entrenador
   ============================================================
   Cuántos atletas puede llegar a tener. NULL = sin límite (para tu propia
   cuenta). Lo fijas tú al crear la invitación del entrenador. */
alter table perfiles add column if not exists cupo_deportistas int;

comment on column perfiles.cupo_deportistas is
  'Máximo de deportistas que puede tener este entrenador. NULL = sin límite.';

/* ============================================================
   2. Invitaciones
   ============================================================ */
create table if not exists invitacion (
  codigo           text primary key,
  rol              text not null check (rol in ('entrenador','deportista')),
  /* Si se fija, SOLO esa dirección puede canjearla. NULL = cualquiera que
     tenga el código. */
  email            text,
  /* Solo para rol='deportista': a qué entrenador queda vinculado al entrar. */
  id_entrenador    uuid references perfiles(id) on delete set null,
  /* Solo para rol='entrenador': el cupo que tendrá. */
  cupo_deportistas int,
  usos_max         int not null default 1 check (usos_max > 0),
  usos             int not null default 0,
  caduca           timestamptz,
  /* Para acordarte de a quién se la diste. */
  nota             text,
  creada_por       uuid references perfiles(id) on delete set null,
  creada_en        timestamptz not null default now(),
  revocada         boolean not null default false
);

create index if not exists idx_invitacion_creada on invitacion(creada_en desc);

/* RLS activado y SIN políticas, igual que plataforma_admin: nadie toca esta
   tabla desde la app. Solo la ven las funciones SECURITY DEFINER de abajo, que
   comprueban quién eres antes de dejarte hacer nada. Sin esto, cualquiera
   podría LEER los códigos y colarse con uno ajeno. */
alter table invitacion enable row level security;

comment on table invitacion is
  'Códigos de alta. Solo la plataforma los crea; el rol sale de aquí, no del formulario.';

/* ============================================================
   3. Nadie se asciende a sí mismo
   ============================================================
   Aunque el INSERT quede cerrado, con UPDATE abierto un deportista podría
   editarse su propia fila y ponerse rol='entrenador'. Es el mismo agujero por
   otra puerta. Este trigger lo cierra: rol y cupo solo los cambia la
   plataforma. */
create or replace function public.bloquear_ascenso_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.rol is distinct from old.rol
      or new.cupo_deportistas is distinct from old.cupo_deportistas)
     and not es_admin_plataforma(auth.uid()) then
    raise exception 'El rol y el cupo solo los cambia la plataforma';
  end if;
  return new;
end $$;

drop trigger if exists trg_bloquear_ascenso_perfil on perfiles;
create trigger trg_bloquear_ascenso_perfil
  before update on perfiles
  for each row execute function public.bloquear_ascenso_perfil();

/* ============================================================
   4. RLS de perfiles: se parte el FOR ALL
   ============================================================
   `perfiles_own` era FOR ALL, o sea que también permitía el INSERT directo con
   el rol que quisieras. Se cambia por select + update por separado y NINGUNA
   política de insert: crear un perfil pasa obligatoriamente por la función.

   El DELETE no necesita política: eliminar_mi_cuenta() es SECURITY DEFINER y
   se salta el RLS. */
drop policy if exists perfiles_own on perfiles;

drop policy if exists perfiles_select_own on perfiles;
create policy perfiles_select_own on perfiles for select
  using (id = auth.uid());

drop policy if exists perfiles_update_own on perfiles;
create policy perfiles_update_own on perfiles for update
  using (id = auth.uid()) with check (id = auth.uid());

/* ============================================================
   5. Generador de códigos
   ============================================================
   Sin 0/O ni 1/I/L: estos códigos se dictan por teléfono y se copian a mano. */
create or replace function public.gen_codigo_invitacion()
returns text language plpgsql security definer set search_path = public as $$
declare
  _alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  _cod text;
  _i int;
begin
  loop
    _cod := '';
    for _i in 1..8 loop
      _cod := _cod || substr(_alfabeto, 1 + floor(random() * length(_alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from invitacion where codigo = _cod);
  end loop;
  return _cod;
end $$;

/* ============================================================
   6. Crear invitación (solo la plataforma)
   ============================================================ */
create or replace function public.crear_invitacion(
  _rol              text,
  _nota             text default null,
  _email            text default null,
  _id_entrenador    uuid default null,
  _cupo_deportistas int  default null,
  _usos_max         int  default 1,
  _dias_validez     int  default 30
) returns text language plpgsql security definer set search_path = public as $$
declare
  _cod text;
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma crea invitaciones';
  end if;
  if _rol not in ('entrenador','deportista') then
    raise exception 'Rol no válido: %', _rol;
  end if;

  _cod := gen_codigo_invitacion();
  insert into invitacion (codigo, rol, email, id_entrenador, cupo_deportistas,
                          usos_max, caduca, nota, creada_por)
  values (_cod, _rol, nullif(trim(_email), ''),
          case when _rol = 'deportista' then _id_entrenador else null end,
          case when _rol = 'entrenador' then _cupo_deportistas else null end,
          greatest(coalesce(_usos_max, 1), 1),
          case when _dias_validez is null or _dias_validez <= 0
               then null else now() + (_dias_validez || ' days')::interval end,
          nullif(trim(_nota), ''), auth.uid());
  return _cod;
end $$;

create or replace function public.revocar_invitacion(_codigo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma revoca invitaciones';
  end if;
  update invitacion set revocada = true where codigo = upper(trim(_codigo));
end $$;

/* ============================================================
   7. Canjear la invitación: la única puerta de entrada
   ============================================================
   La llama el usuario recién registrado, que YA tiene sesión (signUp se la da).
   Todo se decide aquí dentro: el rol sale de la invitación y el email se lee de
   auth.users, no de lo que mande el cliente. Devuelve jsonb para poder dar un
   motivo legible en vez de reventar con un error de Postgres. */
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

  /* FOR UPDATE bloquea la fila mientras se comprueba y se incrementa. Sin esto,
     dos personas canjeando a la vez el mismo código de un solo uso pasarían las
     dos la comprobación. */
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

  /* Cupo del entrenador: se comprueba ANTES de crear nada. */
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

  return jsonb_build_object('ok', true, 'rol', _inv.rol);
end $$;

/* ============================================================
   8. ¿Soy plataforma? (para que el panel sepa si enseñarse)
   ============================================================ */
create or replace function public.soy_plataforma()
returns boolean language sql security definer stable set search_path = public as $$
  select es_admin_plataforma(auth.uid());
$$;

commit;

notify pgrst, 'reload schema';

/* ============================================================
   DESPUÉS DE APLICAR ESTO, HAZ ESTAS DOS COSAS

   1. Date de alta como plataforma (solo hace falta una vez).
      Primero busca tu uuid:

        select id, email, rol from perfiles order by id;

      y luego, con ese uuid:

        insert into plataforma_admin (id_perfil) values ('TU-UUID-AQUI')
        on conflict do nothing;

   2. Deja tu propia cuenta de entrenador sin límite de deportistas:

        update perfiles set cupo_deportistas = null where id = 'TU-UUID-AQUI';

   COMPROBACIÓN

        select soy_plataforma();
        select crear_invitacion('entrenador', 'Prueba', null, null, 20);
        select codigo, rol, usos, usos_max, caduca from invitacion;

   OJO: las cuentas que YA existen no se tocan. Este candado solo afecta a las
   altas nuevas.
   ============================================================ */
