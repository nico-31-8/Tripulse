/* ============================================================
   Un código de entrenador no puede nacer con cupo 0
   ============================================================
   Salió de un código real: BPS54AZC se creó con cupo 0. Quien lo hubiera
   canjeado se habría hecho entrenador y no habría podido dar de alta a NADIE.

   El porqué está en el trigger de `deportista`:

     if _n >= _cupo then raise exception ...

   Con cupo 0 la comparación es 0 >= 0, así que salta con el primer deportista.
   Y el trigger vive en el INSERT de la tabla, no en una pantalla, de modo que
   tapa las tres puertas a la vez: el código de alta, el enlace de invitación y
   el alta manual del entrenador. No es «poco cupo», es una cuenta inútil.

   El formulario del panel ya no deja poner 0, pero el formulario es cosmético:
   el candado va aquí, igual que el resto de las comprobaciones de este panel.

   OJO, ESTO NO TOCA admin_fijar_cupo.
   Poner 0 a un entrenador que YA existe es una acción legítima y distinta:
   congelarlo para que no meta más deportistas, conservando los que tiene. Eso
   se sigue pudiendo hacer desde su ficha.
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

  if _rol = 'entrenador' and _cupo_deportistas is not null and _cupo_deportistas < 1 then
    raise exception 'El cupo tiene que ser 1 o más. Con 0 el entrenador no podría dar de alta a nadie.';
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

comment on function public.crear_invitacion is
  'Crea un código de alta. El cupo de un código de entrenador ha de ser 1 o más.';
