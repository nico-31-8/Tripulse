/* ============================================================
   El cupo de deportistas no cuenta a los evaluados
   ============================================================
   La app lo promete desde que existen los evaluados («no entran en tu panel ni
   en tu cupo de deportistas», en Deportistas y en el tutorial), pero la base
   los contaba: el disparador del cupo, el registro con código y el panel
   /admin contaban TODAS las fichas del entrenador. Con las personas externas
   del analizador, que son evaluados, un entrenador con el cupo lleno no podría
   analizar a nadie de fuera. Decidido el 17-10-2026: no cuentan.

   Qué cambia:
   - comprobar_cupo_entrenador: un evaluado ni se comprueba ni se cuenta. Y como
     ya no cuentan, pasar un evaluado a su equipo (solo_test de true a false) se
     comprueba igual que dar de alta a alguien: si no, sería una puerta de atrás.
   - registrar_con_invitacion: sus dos comprobaciones previas (las que dan el
     mensaje legible) cuentan igual que el disparador.
   - num_deportistas (el directorio de Comunidad) y el panel /admin
     (admin_cuentas, admin_entrenadores y el aviso «por encima de su cupo» de
     admin_salud).

   Las cuatro funciones largas se reescriben a partir de su propia definición
   cambiando SOLO el recuento, después de comprobar que estaba una sola vez: el
   resto de cada una queda idéntico.

   Para quien no tiene evaluados no cambia nada.
   ============================================================ */

set local lock_timeout = '5s';

/* ---- El disparador del cupo ---- */
create or replace function public.comprobar_cupo_entrenador()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _cupo int;
  _n    int;
begin
  if new.id_entrenador is null or new.solo_test then return new; end if;
  /* En un cambio, solo cuando un evaluado pasa a su equipo. */
  if tg_op = 'UPDATE' and not old.solo_test then return new; end if;

  select cupo_deportistas into _cupo from perfiles where id = new.id_entrenador;
  if _cupo is null then return new; end if;

  select count(*) into _n from deportista
   where id_entrenador = new.id_entrenador and not solo_test and id is distinct from new.id;
  if _n >= _cupo then
    raise exception 'Ese entrenador ha llegado a su límite de % deportistas', _cupo;
  end if;
  return new;
end $$;

drop trigger if exists trg_cupo_entrenador on public.deportista;
create trigger trg_cupo_entrenador before insert or update of solo_test on public.deportista
  for each row execute function public.comprobar_cupo_entrenador();

/* ---- Cuántos atletas tiene un entrenador (el directorio de Comunidad) ---- */
create or replace function public.num_deportistas(_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from deportista where id_entrenador = _id and not solo_test;
$$;

/* ---- Las funciones largas: solo su recuento ---- */
do $parche$
declare
  _f record; _def text; _veces int;
begin
  for _f in
    select * from (values
      (1, 'public.registrar_con_invitacion(text,text,boolean)',
          'select count(*) into _n_atletas from deportista where id_entrenador = _id_ent;',
          'select count(*) into _n_atletas from deportista where id_entrenador = _id_ent and not solo_test;'),
      (2, 'public.registrar_con_invitacion(text,text,boolean)',
          'select count(*) into _n_atletas from deportista where id_entrenador = _inv.id_entrenador;',
          'select count(*) into _n_atletas from deportista where id_entrenador = _inv.id_entrenador and not solo_test;'),
      (3, 'public.admin_cuentas()',
          '(select count(*) from deportista d2 where d2.id_entrenador = p.id)::bigint',
          '(select count(*) from deportista d2 where d2.id_entrenador = p.id and not d2.solo_test)::bigint'),
      (4, 'public.admin_entrenadores()',
          '(select count(*) from deportista d where d.id_entrenador = p.id)',
          '(select count(*) from deportista d where d.id_entrenador = p.id and not d.solo_test)'),
      (5, 'public.admin_salud()',
          '(select count(*) from deportista d where d.id_entrenador = p.id) > p.cupo_deportistas',
          '(select count(*) from deportista d where d.id_entrenador = p.id and not d.solo_test) > p.cupo_deportistas')
    ) as t(n, firma, viejo, nuevo)
    order by n
  loop
    _def := pg_get_functiondef(_f.firma::regprocedure);
    _veces := (length(_def) - length(replace(_def, _f.viejo, ''))) / length(_f.viejo);
    if _veces <> 1 then
      raise exception 'cupo_sin_evaluados: en % ese recuento aparece % veces (se esperaba 1)', _f.firma, _veces;
    end if;
    execute replace(_def, _f.viejo, _f.nuevo);
  end loop;
end $parche$;

notify pgrst, 'reload schema';
