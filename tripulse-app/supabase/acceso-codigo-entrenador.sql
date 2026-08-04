/* ============================================================
   El código del entrenador vuelve a servir para registrarse
   ============================================================

   REGRESIÓN QUE CORRIGE

   Al cerrar el alta, /registro dejó de aceptar el `codigo_entrenador` (el código
   público del entrenador, tipo NICO27). Desde entonces, si un entrenador le dice
   a alguien "regístrate con mi código", no funcionaba: ese código solo servía ya
   para vincularse desde /perfil una vez tenías cuenta.

   POR QUÉ ESTO NO REABRE LA PUERTA

   El código de un entrenador es público —lo comparte con quien quiere— así que
   aceptarlo sin más sería volver al registro abierto. La diferencia está en que
   ahora **cada alta por esa vía consume una plaza del cupo del entrenador**. El
   acceso lo sigues controlando tú: no por quién tenga el código, sino por
   cuántas plazas le has dado a cada uno.

   OJO: un entrenador con `cupo_deportistas` NULL es ilimitado, así que su código
   sí es una puerta abierta. Se ve en /admin como "n / ∞". Si le pones un número,
   deja de serlo.

   Se busca PRIMERO en `invitacion` y solo si no aparece se prueba como código de
   entrenador: si algún día un código de invitación coincidiera con el de un
   entrenador, manda la invitación, que es lo más específico.

   IDEMPOTENTE.
   ============================================================ */

begin;

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
  _id_ent    uuid;
  _cod       text := upper(trim(_codigo));
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

  select * into _inv from invitacion where codigo = _cod for update;

  /* ===== Vía B: es el código público de un entrenador ===== */
  if not found then
    select p.id, p.cupo_deportistas into _id_ent, _cupo
    from perfiles p
    where p.rol = 'entrenador' and upper(p.codigo_entrenador) = _cod
    limit 1;

    if _id_ent is null then
      return jsonb_build_object('ok', false, 'error', 'Ese código no existe.');
    end if;

    if _cupo is not null then
      select count(*) into _n_atletas from deportista where id_entrenador = _id_ent;
      if _n_atletas >= _cupo then
        return jsonb_build_object('ok', false, 'error', 'Tu entrenador ha llegado a su límite de deportistas. Dile que hable con nosotros.');
      end if;
    end if;

    insert into perfiles (id, rol, nombre, email, acepto_terminos,
                          fecha_consentimiento, version_consentimiento)
    values (_uid, 'deportista', trim(_nombre), _email, true, now(), 'v1-2026-07');

    /* El trigger trg_cupo_entrenador vuelve a comprobar el cupo aquí. Es a
       propósito: la comprobación de arriba da un mensaje legible, y el trigger
       es la red que atrapa cualquier otra puerta. */
    insert into deportista (id_usuario, nombre, id_entrenador)
    values (_uid, trim(_nombre), _id_ent);

    return jsonb_build_object('ok', true, 'rol', 'deportista');
  end if;

  /* ===== Vía A: invitación de la plataforma ===== */
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

commit;

notify pgrst, 'reload schema';

/* ============================================================
   COMPROBACIÓN

   Mira qué entrenadores tienen la puerta abierta (cupo sin fijar):

     select nombre, email, codigo_entrenador, cupo_deportistas
     from perfiles where rol = 'entrenador' and codigo_entrenador is not null
     order by cupo_deportistas nulls first;

   Los que salgan con cupo NULL aceptan altas ilimitadas con su código.
   Se les pone número desde /admin → Cuentas → "cambiar cupo".
   ============================================================ */
