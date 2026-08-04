/* ============================================================
   Arreglo: el enlace de invitación del entrenador
   ============================================================

   REGRESIÓN QUE CORRIGE

   acceso-invitaciones.sql quitó la política de INSERT de `perfiles` para que un
   perfil solo se pudiera crear desde registrar_con_invitacion(). Pero había OTRA
   puerta legítima que también creaba perfiles y se me pasó:
   /invitacion/[token], el enlace con el que un entrenador da de alta a su
   deportista. Esa página hacía un insert directo en `perfiles`, así que desde
   entonces fallaba con "new row violates row level security policy".

   El arreglo va donde tenía que estar desde el principio: aceptar_invitacion()
   ya era SECURITY DEFINER y estaba protegida por el token, o sea que ya era la
   puerta buena. Solo le faltaba crear el perfil. Ahora hace las tres cosas en
   una sola transacción: perfil, vínculo y marcar el token como usado.

   La firma NO cambia, así que el cliente solo tiene que dejar de hacer el
   insert por su cuenta.

   Y DE PASO: el cupo del entrenador solo lo comprobaba mi camino nuevo. Un
   entrenador podía crear deportistas sin límite desde /deportistas y saltárselo.
   Un trigger lo hace valer venga por donde venga. NULL = sin límite, que es lo
   que tienen todas las cuentas actuales, así que hoy no le afecta a nadie.

   IDEMPOTENTE.
   ============================================================ */

begin;

create or replace function public.aceptar_invitacion(p_token text)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_dep    integer;
  v_nombre text;
  v_uid    uuid := auth.uid();
  v_email  text;
begin
  if v_uid is null then
    raise exception 'No hay sesión';
  end if;

  select id_deportista, nombre_deportista into v_dep, v_nombre
  from invitacion_deportista
  where token = p_token and usado = false;

  if v_dep is null then
    raise exception 'Invitación no válida o ya usada';
  end if;

  /* El perfil se crea AQUÍ. Antes lo hacía la página con un insert directo, y
     eso ya no se puede: `perfiles` no tiene política de INSERT a propósito. */
  select email into v_email from auth.users where id = v_uid;

  insert into perfiles (id, rol, nombre, email, acepto_terminos,
                        fecha_consentimiento, version_consentimiento)
  values (v_uid, 'deportista', coalesce(nullif(trim(v_nombre), ''), 'Deportista'),
          v_email, true, now(), 'v1-2026-07')
  on conflict (id) do nothing;

  update deportista set id_usuario = v_uid where id = v_dep;
  update invitacion_deportista set usado = true where token = p_token;

  return v_dep;
end $$;

/* ============================================================
   El cupo, venga por donde venga
   ============================================================ */
create or replace function public.comprobar_cupo_entrenador()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _cupo int;
  _n    int;
begin
  if new.id_entrenador is null then return new; end if;

  select cupo_deportistas into _cupo from perfiles where id = new.id_entrenador;
  if _cupo is null then return new; end if;

  select count(*) into _n from deportista where id_entrenador = new.id_entrenador;
  if _n >= _cupo then
    raise exception 'Ese entrenador ha llegado a su límite de % deportistas', _cupo;
  end if;
  return new;
end $$;

drop trigger if exists trg_cupo_entrenador on deportista;
create trigger trg_cupo_entrenador
  before insert on deportista
  for each row execute function public.comprobar_cupo_entrenador();

commit;

notify pgrst, 'reload schema';
