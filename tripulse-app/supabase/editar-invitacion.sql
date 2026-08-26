/* ============================================================
   Cambiar un código ya enviado
   ============================================================
   Hasta ahora un código nacía y no se tocaba más: si te quedabas corto de usos
   o el plazo se echaba encima, había que anularlo y mandar otro. Y mandar otro
   código a alguien que ya tiene el primero es la mejor forma de que use el que
   no toca.

   Esto deja cambiar tres cosas de un código que ya está por ahí:
     · cuántas personas pueden usarlo   (usos_max)
     · hasta cuándo vale                (caduca)
     · el cupo del entrenador que salga (cupo_deportistas)
   y desanular uno que se anuló sin querer.

   NULL EN UN PARÁMETRO SIGNIFICA "NO TOQUES ESO".
   Es lo contrario de lo que hacía el cupo antes de arreglarlo: allí un campo
   vacío se interpretaba como "sin límite" y un resbalón le quitaba el tope a un
   entrenador sin que nada lo dijera. Aquí no decir nada nunca cambia nada; para
   quitar la caducidad o el cupo hay que pedirlo con su bandera.

   OJO CON EL CUPO SI EL CÓDIGO YA SE USÓ.
   `invitacion.cupo_deportistas` solo se lee EN EL MOMENTO de canjear el código:
   de ahí se copia a `perfiles.cupo_deportistas` y ya no vuelve a mirarse. A
   quien ya entró, cambiarlo aquí no le hace nada. Por eso la función devuelve
   un aviso en ese caso, para que el panel mande a la ficha del entrenador, que
   es donde de verdad se le cambia el cupo (admin_fijar_cupo).
   ============================================================ */

create or replace function public.editar_invitacion(
  _codigo            text,
  _usos_max          int     default null,
  _dias_validez      int     default null,
  _sin_caducidad     boolean default false,
  _cupo_deportistas  int     default null,
  _cupo_sin_limite   boolean default false,
  _nota              text    default null,
  _reactivar         boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _cod   text := upper(trim(_codigo));
  _inv   invitacion%rowtype;
  _aviso text;
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma cambia invitaciones';
  end if;

  select * into _inv from invitacion where codigo = _cod for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese código no existe.');
  end if;

  /* Bajar el tope por debajo de lo ya gastado dejaría el código en un estado
     que no puede volver a ser cierto: 3 de 2 usos. */
  if _usos_max is not null then
    if _usos_max < 1 then
      return jsonb_build_object('ok', false, 'error', 'El código tiene que valer al menos para una persona.');
    end if;
    if _usos_max < _inv.usos then
      return jsonb_build_object('ok', false, 'error',
        'Ya lo han usado ' || _inv.usos || ' personas. No puedes dejarlo por debajo de eso.');
    end if;
  end if;

  if _dias_validez is not null and _dias_validez < 0 then
    return jsonb_build_object('ok', false, 'error', 'Los días no pueden ser negativos.');
  end if;
  /* Cero no es «poco cupo»: el trigger de `deportista` compara
     n_deportistas >= cupo, así que con cero salta desde el primero. El
     entrenador que saliera de este código entraría a una app donde no puede
     dar de alta a nadie por ninguna de las tres puertas. Congelar a un
     entrenador que YA existe es otra cosa y se hace con admin_fijar_cupo. */
  if _cupo_deportistas is not null and _cupo_deportistas < 1 then
    return jsonb_build_object('ok', false, 'error',
      'El cupo tiene que ser 1 o más. Con 0 el entrenador no podría dar de alta a nadie.');
  end if;

  /* El cupo solo existe en los códigos de entrenador: en uno de deportista la
     columna es siempre NULL y ponerle un número no haría nada, que es peor que
     avisar. */
  if (_cupo_deportistas is not null or _cupo_sin_limite) and _inv.rol <> 'entrenador' then
    return jsonb_build_object('ok', false, 'error', 'El cupo de deportistas solo lo tienen los códigos de entrenador.');
  end if;

  if (_cupo_deportistas is not null or _cupo_sin_limite) and _inv.usos > 0 then
    _aviso := 'Quien ya entró con este código conserva el cupo que tenía. Cámbiaselo en su ficha, en «cambiar cupo».';
  end if;

  update invitacion set
    usos_max = coalesce(_usos_max, usos_max),

    /* Los días se cuentan desde HOY, no desde la fecha que tuviera. Si el
       código ya caducó, sumar sobre una fecha pasada podría dejarlo caducado
       igual, y «dale 15 días» tiene que dar 15 días siempre. */
    caduca = case
      when _sin_caducidad then null
      when _dias_validez is null then caduca
      when _dias_validez = 0 then null
      else now() + (_dias_validez || ' days')::interval
    end,

    cupo_deportistas = case
      when _cupo_sin_limite then null
      when _cupo_deportistas is not null then _cupo_deportistas
      else cupo_deportistas
    end,

    nota = coalesce(nullif(trim(_nota), ''), nota),
    revocada = case when _reactivar then false else revocada end
  where codigo = _cod
  returning * into _inv;

  return jsonb_build_object(
    'ok', true,
    'codigo', _inv.codigo,
    'usos', _inv.usos,
    'usos_max', _inv.usos_max,
    'caduca', _inv.caduca,
    'cupo_deportistas', _inv.cupo_deportistas,
    'revocada', _inv.revocada,
    'aviso', _aviso
  );
end $$;

comment on function public.editar_invitacion is
  'Cambia usos, caducidad, cupo y nota de un código ya emitido. NULL = no tocar.';
