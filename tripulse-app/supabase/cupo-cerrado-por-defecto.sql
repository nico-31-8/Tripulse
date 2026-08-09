/* ============================================================
   EL CUPO, CERRADO POR DEFECTO

   EL FALLO: `perfiles.cupo_deportistas` es nullable sin default, y NULL significa
   "sin límite". O sea que la AUSENCIA DE DECISION daba el permiso máximo. Un
   entrenador creado con una invitación sin cupo nacía ilimitado, y su código
   público admitía altas sin tope, para siempre y sin que nada avisara.

   Un control de acceso tiene que fallar hacia el lado cerrado. Si nadie ha dicho
   cuántos, la respuesta es ninguno, no todos.

   LO QUE CAMBIA:
     1. La columna pasa a tener default 0. Cualquier alta que no diga nada, cierra.
     2. Los entrenadores que HOY tienen NULL se congelan en su número actual de
        deportistas: no se le quita a nadie lo que ya tiene, pero se cierra la
        puerta abierta. Se suben desde /admin cuando haga falta.
     3. Los administradores de plataforma NO se tocan: su NULL es una decisión
        tomada, no un descuido.
     4. registrar_con_invitacion deja de escribir NULL: una invitación de
        entrenador sin cupo crea un entrenador con 0, no con infinito.

   POR QUE NULL SIGUE SIENDO "SIN LIMITE" Y NO SE INVENTA UN -1:
   se estudió cambiar la codificación a -1 = sin límite. Se descartó: admin_salud()
   compara `count > cupo` para avisar de entrenadores pasados de cupo, y con -1 esa
   comparación es siempre cierta, así que cada entrenador ilimitado saldría marcado
   como excedido. Habría obligado a reescribir tres funciones grandes para arreglar
   una que ya funciona. Con default 0 y sin caminos que escriban NULL, el unico
   modo de quedarse sin límite es que la plataforma lo ponga a mano.

   IDEMPOTENTE.
   ============================================================ */

begin;

/* ========== 1. Que no decir nada signifique cerrado ========== */
alter table perfiles alter column cupo_deportistas set default 0;

comment on column perfiles.cupo_deportistas is
  'Cuantos deportistas puede tener este entrenador. 0 = ninguno (es el default: nadie ha decidido todavia). NULL = sin limite, y eso solo lo pone la plataforma a mano. En un deportista no significa nada.';

/* ========== 2. Cerrar las puertas que ya estan abiertas ==========
   Se congela cada entrenador en los que ya tiene. No pierde ninguno y no puede
   sumar mas hasta que se le suba el cupo desde /admin.

   HAY QUE APAGAR EL TRIGGER PARA ESTO. trg_bloquear_ascenso_perfil impide cambiar
   el cupo a quien no sea admin de plataforma, y lo comprueba con auth.uid(). En el
   editor SQL de Supabase no hay sesion: auth.uid() es NULL, asi que el candado
   salta contra su propio dueno. Se apaga, se rellena y se vuelve a encender.

   Va todo dentro de la misma transaccion, y en Postgres el DDL tambien es
   transaccional: si el relleno falla, el trigger se vuelve a encender solo al
   deshacerse. No puede quedarse apagado. */
alter table perfiles disable trigger trg_bloquear_ascenso_perfil;

do $$
declare r record; n int := 0;
begin
  for r in
    select p.id, p.email,
           (select count(*) from deportista d where d.id_entrenador = p.id) as tiene
    from perfiles p
    where p.rol = 'entrenador'
      and p.cupo_deportistas is null
      and not es_admin_plataforma(p.id)
  loop
    update perfiles set cupo_deportistas = r.tiene where id = r.id;
    raise notice 'Cerrado: % queda con cupo %', coalesce(r.email, r.id::text), r.tiene;
    n := n + 1;
  end loop;
  raise notice '% entrenadores cerrados. Los admins de plataforma se han dejado sin limite.', n;
end $$;

alter table perfiles enable trigger trg_bloquear_ascenso_perfil;

/* ========== 3. Que el alta no vuelva a abrir la puerta ==========
   Copia exacta de la funcion viva (acceso-codigo-entrenador.sql). Lo unico que
   cambia son las dos ultimas lineas del insert de perfiles: donde escribia NULL
   ahora escribe 0. El resto, incluidas TODAS las comprobaciones, va igual. */
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
          /* AQUI ESTABA EL AGUJERO: una invitacion de entrenador sin cupo escribia
             NULL, y NULL es sin limite. Ahora sin cupo son 0 y se sube a mano.
             A los deportistas tambien se les pone 0 en vez de NULL: si algun dia
             se asciende a uno a entrenador, no puede heredar un "sin limite" que
             nadie decidio. */
          case when _inv.rol = 'entrenador' then coalesce(_inv.cupo_deportistas, 0) else 0 end);

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
   Comprobacion

   Despues de esto, la columna "sin_limite" solo debe decir "SI" en tus cuentas de
   plataforma. Si aparece cualquier otro entrenador, es una puerta abierta.
   ============================================================ */
/* Lo PRIMERO: que el candado haya vuelto a su sitio. Debe decir 'ENCENDIDO'. Si
   dijera apagado, cualquiera podria cambiarse el rol o el cupo, que es bastante
   peor que el agujero que venimos a tapar. */
select tgname as trigger,
       case tgenabled when 'D' then 'APAGADO — ENCIENDELO YA' else 'ENCENDIDO' end as estado
  from pg_trigger
 where tgrelid = 'public.perfiles'::regclass and tgname = 'trg_bloquear_ascenso_perfil';

select coalesce(p.email, p.id::text)                        as entrenador,
       es_admin_plataforma(p.id)                            as es_plataforma,
       (select count(*) from deportista d
         where d.id_entrenador = p.id)                      as tiene,
       p.cupo_deportistas                                   as cupo,
       case when p.cupo_deportistas is null then 'SI' else 'no' end as sin_limite
  from perfiles p
 where p.rol = 'entrenador'
 order by sin_limite desc, entrenador;
