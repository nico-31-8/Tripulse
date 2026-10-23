/* ============================================================
   TRIPULSE — Envíos entre entrenadores, fase 2: pasar un deportista
   ============================================================

   Pedido del usuario el 23-10-2026 (maqueta aprobada:
   https://claude.ai/artifact/RUwkGr4VEPYsXVDK93z3ni). Un entrenador le pasa
   un deportista a otro: NO es una copia, es un TRASPASO. El deportista pasa a
   la lista del otro con todo su historial y el de antes deja de verlo.

   QUIÉN CONTESTA. El entrenador que lo recibe, siempre. Y si el deportista
   tiene cuenta, también él, porque son sus datos. Hasta que contestan los
   dos sigue con su entrenador de siempre; si cualquiera dice que no, no
   cambia nada. El que lo pidió puede cancelarlo mientras tanto.

   QUÉ PASA AL HACERSE (en un solo paso, como «Quitar deportista»):
   · Lo que cuelga de su ficha (plan, sesiones, tests, wellness, reloj,
     material, análisis…) pasa solo: el acceso va por la ficha.
   · Sale de los grupos de su entrenador de antes, se quitan los accesos de
     director que dio (si no, el director seguiría entrando) y se borran las
     invitaciones sin usar que había hecho para él.
   · Si el que lo pide marca «mandar también lo tuyo que usa», el otro
     recibe copias de los tests suyos que usa ese deportista (con mediciones
     suyas, en sus ajustes de zona o en sus días de test) y de las zonas que
     salen de ellos o en las que tiene ajustes. Lo del deportista pasa a las
     copias: sus mediciones se MUEVEN (copiarlas las enseñaría dos veces, y
     el de antes ya no las ve), y sus días de test y sus ajustes apuntan a
     las copias. Los tests y las zonas del de antes no se tocan.
   · Se mira el cupo de quien lo recibe (el cupo de siempre solo salta al
     crear un deportista, no al cambiarlo de entrenador).

   DOS COSAS QUE CAMBIAN DE LO QUE YA HABÍA, para que un traspaso no deje
   ver lo que no toca (lo prometido en la maqueta):
   · LOS COBROS pasan a guardar de qué entrenador son (id_entrenador). Antes
     los veía el entrenador que tuviera el deportista EN ESE MOMENTO: el
     nuevo habría visto los cobros del de antes, y el de antes los habría
     perdido. Ahora cada uno ve los suyos. Se rellenan con el entrenador
     actual de cada deportista (hoy todos tienen), así que hoy nadie ve ni
     más ni menos. La lista y la cuota del mes pasan a ser por entrenador.
   · EL CHAT: un entrenador ve solo SUS conversaciones (id_entrenador). Antes
     veía todos los mensajes de sus deportistas, también los que hubieran
     tenido con otro entrenador. El deportista sigue viendo todos los suyos.
     Hoy todos los mensajes son del entrenador actual de su deportista: nadie
     deja de ver nada.

   Las fichas de un grupo no se pasan (se quitan borrando el grupo).
   ============================================================ */


/* ············································
   Los cobros, con su dueño
   ············································ */
alter table public.cargo add column if not exists id_entrenador uuid references public.perfiles(id) on delete cascade;
alter table public.cobro add column if not exists id_entrenador uuid references public.perfiles(id) on delete cascade;
alter table public.tarifa add column if not exists id_entrenador uuid references public.perfiles(id) on delete cascade;
alter table public.cobros_lista add column if not exists id_entrenador uuid references public.perfiles(id) on delete cascade;

update public.cargo x set id_entrenador = d.id_entrenador from public.deportista d where d.id = x.id_deportista and x.id_entrenador is null;
update public.cobro x set id_entrenador = d.id_entrenador from public.deportista d where d.id = x.id_deportista and x.id_entrenador is null;
update public.tarifa x set id_entrenador = d.id_entrenador from public.deportista d where d.id = x.id_deportista and x.id_entrenador is null;
update public.cobros_lista x set id_entrenador = d.id_entrenador from public.deportista d where d.id = x.id_deportista and x.id_entrenador is null;

/* Las filas nuevas son de quien las apunta: la pantalla no tiene que decirlo. */
alter table public.cargo alter column id_entrenador set default auth.uid();
alter table public.cobro alter column id_entrenador set default auth.uid();
alter table public.tarifa alter column id_entrenador set default auth.uid();
alter table public.cobros_lista alter column id_entrenador set default auth.uid();

/* Ninguna fila sin dueño: una así no la vería nadie. Hoy todas lo tienen. */
alter table public.cargo alter column id_entrenador set not null;
alter table public.cobro alter column id_entrenador set not null;
alter table public.tarifa alter column id_entrenador set not null;
alter table public.cobros_lista alter column id_entrenador set not null;

/* La lista y la cuota del mes, por entrenador: el nuevo puede apuntarle la
   suya aunque el de antes ya le hubiera cobrado ese mes. */
alter table public.cobros_lista drop constraint if exists cobros_lista_pkey;
alter table public.cobros_lista add constraint cobros_lista_pkey primary key (id_entrenador, id_deportista);
drop index if exists public.cargo_una_cuota_por_mes;
create unique index if not exists cargo_una_cuota_por_mes on public.cargo (id_entrenador, id_deportista, mes) where tipo = 'mensual';
create index if not exists cargo_id_entrenador_idx on public.cargo (id_entrenador);
create index if not exists cobro_id_entrenador_idx on public.cobro (id_entrenador);
create index if not exists tarifa_id_entrenador_idx on public.tarifa (id_entrenador);

/* Ver, cambiar y borrar: lo tuyo. Apuntar: solo a un deportista tuyo, como antes. */
drop policy if exists cargo_solo_su_entrenador on public.cargo;
create policy cargo_solo_su_entrenador on public.cargo for all to authenticated
  using (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid())
              and exists (select 1 from public.deportista d where d.id = cargo.id_deportista and d.id_entrenador = (select auth.uid())));
drop policy if exists cobro_solo_su_entrenador on public.cobro;
create policy cobro_solo_su_entrenador on public.cobro for all to authenticated
  using (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid())
              and exists (select 1 from public.deportista d where d.id = cobro.id_deportista and d.id_entrenador = (select auth.uid())));
drop policy if exists tarifa_solo_su_entrenador on public.tarifa;
create policy tarifa_solo_su_entrenador on public.tarifa for all to authenticated
  using (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid())
              and exists (select 1 from public.deportista d where d.id = tarifa.id_deportista and d.id_entrenador = (select auth.uid())));
drop policy if exists cobros_lista_solo_su_entrenador on public.cobros_lista;
create policy cobros_lista_solo_su_entrenador on public.cobros_lista for all to authenticated
  using (id_entrenador = (select auth.uid()))
  with check (id_entrenador = (select auth.uid())
              and exists (select 1 from public.deportista d where d.id = cobros_lista.id_deportista and d.id_entrenador = (select auth.uid())));


/* ············································
   El chat: cada entrenador, sus conversaciones
   ············································ */
drop policy if exists mensajes_rw on public.mensajes;
create policy mensajes_rw on public.mensajes for all to authenticated
  using ((id_entrenador = (select auth.uid()))
         or (id_deportista in (select d.id from public.deportista d where d.id_usuario = (select auth.uid()))))
  with check (id_deportista in (select auth_dep_ids_sin_director() as auth_dep_ids_sin_director));


/* ············································
   Los envíos de deportistas
   ············································ */
alter table public.envio_entrenador add column if not exists id_deportista bigint references public.deportista(id) on delete cascade;
/* La cuenta del deportista al pedirlo (null = una ficha sin cuenta). */
alter table public.envio_entrenador add column if not exists deportista_usuario uuid;
alter table public.envio_entrenador add column if not exists acepta_entrenador_en timestamptz;
alter table public.envio_entrenador add column if not exists acepta_deportista_en timestamptz;
/* Quién dijo que no, si alguien lo dijo. */
alter table public.envio_entrenador add column if not exists rechaza text;
alter table public.envio_entrenador drop constraint if exists envio_entrenador_rechaza;
alter table public.envio_entrenador add constraint envio_entrenador_rechaza
  check (rechaza is null or rechaza in ('entrenador', 'deportista'));
alter table public.envio_entrenador drop constraint if exists envio_entrenador_tipo;
alter table public.envio_entrenador add constraint envio_entrenador_tipo
  check (tipo in ('plantilla', 'test', 'zonas', 'varios', 'deportista'));
alter table public.envio_entrenador drop constraint if exists envio_entrenador_deportista;
alter table public.envio_entrenador add constraint envio_entrenador_deportista
  check ((tipo = 'deportista') = (id_deportista is not null));
/* Un traspaso pendiente por deportista. */
create unique index if not exists envio_entrenador_un_traspaso
  on public.envio_entrenador (id_deportista) where tipo = 'deportista' and estado = 'pendiente';


/* Si quien lo recibe tiene sitio. Solo eso, sin cuántos tiene. */
create or replace function public.entrenador_tiene_sitio(_para uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from perfiles yo where yo.id = auth.uid() and yo.rol = 'entrenador') then null
    else coalesce((select p.cupo_deportistas is null
                          or (select count(*) from deportista d where d.id_entrenador = p.id and not coalesce(d.solo_test, false)) < p.cupo_deportistas
                     from perfiles p where p.id = _para and p.rol = 'entrenador'), false)
  end
$$;


/* Pedir el traspaso. Solo de un deportista tuyo, y uno pendiente por deportista. */
create or replace function public.pedir_traspaso(
  _para uuid, _id_deportista bigint, _con_lo_suyo boolean default true, _mensaje text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  _yo     uuid := auth.uid();
  _men    text := nullif(btrim(coalesce(_mensaje, '')), '');
  _d      jsonb;
  _dep    deportista%rowtype;
  _tests  bigint[] := '{}'::bigint[];
  _cls    jsonb := '[]'::jsonb;
  _foto   jsonb;
  _c      bigint;
  _nuevo  bigint;
begin
  _d := public.envio_destino(_yo, _para, _men);
  select * into _dep from deportista where id = _id_deportista for update;
  if not found or _dep.id_entrenador is distinct from _yo then
    raise exception 'Ese deportista no es tuyo';
  end if;
  if _dep.id_grupo is not null then
    raise exception 'La ficha de un grupo no se pasa: se quita borrando el grupo';
  end if;
  if exists (select 1 from envio_entrenador where id_deportista = _dep.id and tipo = 'deportista' and estado = 'pendiente') then
    raise exception 'Ya has pedido pasar a % a otro entrenador: espera a que contesten o cancélalo', _dep.nombre;
  end if;
  if not coalesce(_dep.solo_test, false) and not public.entrenador_tiene_sitio(_para) then
    raise exception 'Ese entrenador no tiene sitio para más deportistas';
  end if;

  if coalesce(_con_lo_suyo, false) then
    /* Tus tests que usa: con mediciones suyas, en sus ajustes de zona o en
       sus días de test… */
    _tests := array(
      select t.id from test_definicion t
       where t.id_entrenador = _yo
         and t.id in (select m.id_definicion from test_medicion m where m.id_deportista = _dep.id
                      union
                      select (regexp_match(l->>'ref', '^propia:([0-9]+):[0-9]+$'))[1]::bigint
                        from zona_ajuste a, lateral (values (a.desde), (a.hasta)) v(l)
                       where a.id_deportista = _dep.id
                      union
                      select (s.test->>'id')::bigint from sesion s
                       where s.id_deportista = _dep.id and s.test->>'origen' = 'propio' and (s.test->>'id') ~ '^[0-9]+$'));
    /* …y tus zonas que salen de ellos o en las que tiene ajustes. Las que no
       se pueden mandar (sin zonas, o de un test que no es tuyo) se quedan. */
    for _c in
      select c.id from zona_clasificacion c
       where c.id_entrenador = _yo and not c.archivada
         and (exists (select 1 from jsonb_array_elements_text(c.hitos) h
                       where (regexp_match(h, '^propia:([0-9]+):[0-9]+$'))[1]::bigint = any(_tests))
              or exists (select 1 from zona_entrenador z
                          where z.id_clasificacion = c.id and not z.archivada
                            and (z.ref_definicion = any(_tests)
                                 or (regexp_match(z.desde->>'ref', '^propia:([0-9]+):[0-9]+$'))[1]::bigint = any(_tests)
                                 or (regexp_match(z.hasta->>'ref', '^propia:([0-9]+):[0-9]+$'))[1]::bigint = any(_tests)))
              or exists (select 1 from zona_ajuste a join zona_entrenador z on z.id = a.id_zona
                          where a.id_deportista = _dep.id and z.id_clasificacion = c.id))
       order by c.orden, c.id
    loop
      begin
        _foto := public.envio_foto_clasificacion(_yo, _c);
        _cls := _cls || jsonb_build_array(jsonb_build_object('origen', _c, 'clasificacion', _foto->'clasificacion', 'zonas', _foto->'zonas'));
        _tests := _tests || array(select jsonb_array_elements_text(_foto->'tests')::bigint);
      exception when others then
        null;
      end;
    end loop;
    _tests := array(select distinct x from unnest(_tests) x order by 1);
  end if;

  insert into envio_entrenador (de, para, tipo, titulo, contenido, mensaje, de_nombre, para_nombre, para_correo,
                                id_deportista, deportista_usuario)
  values (_yo, _para, 'deportista', left('Traspaso de ' || coalesce(_dep.nombre, 'un deportista'), 120),
          jsonb_build_object(
            'deportista', jsonb_build_object('id', _dep.id, 'nombre', _dep.nombre,
                                             'tiene_cuenta', _dep.id_usuario is not null, 'solo_test', coalesce(_dep.solo_test, false)),
            'con_lo_suyo', coalesce(_con_lo_suyo, false),
            'tests', public.envio_fotos_tests(_tests),
            'clasificaciones', _cls),
          _men, _d->>'yo_nombre', _d->>'para_nombre', _d->>'para_correo',
          _dep.id, _dep.id_usuario)
  returning id into _nuevo;
  return _nuevo;
end $$;


/* Hacer el traspaso, cuando ya han dicho que sí los que tienen que decirlo.
   Lo llaman contestar_envio (el entrenador) y contestar_traspaso_deportista
   (el deportista): el último que acepta. */
create or replace function public.envio_hacer_traspaso(_id bigint)
returns jsonb language plpgsql set search_path = public as $$
declare
  _e     envio_entrenador%rowtype;
  _dep   deportista%rowtype;
  _t     jsonb;
  _mapa  jsonb := '{}'::jsonb;
  _clmap jsonb := '{}'::jsonb;
  _ids   jsonb := '[]'::jsonb;
  _r     record;
  _nueva bigint;
  _k     text;
begin
  select * into _e from envio_entrenador where id = _id for update;
  select * into _dep from deportista where id = _e.id_deportista for update;

  /* Si ya no es de quien lo pidió (lo quitó, o es de otro), no se hace. */
  if not found or _dep.id_entrenador is distinct from _e.de or _dep.id_grupo is not null then
    update envio_entrenador set estado = 'cancelado', contestado_en = now() where id = _id;
    return jsonb_build_object('estado', 'cancelado', 'motivo', 'Ese deportista ya no es de quien te lo pasaba');
  end if;

  /* Si se hizo una cuenta después de pedirlo, ahora también contesta él. */
  if _dep.id_usuario is not null and _e.acepta_deportista_en is null then
    update envio_entrenador set deportista_usuario = _dep.id_usuario where id = _id;
    return jsonb_build_object('estado', 'pendiente', 'falta', 'deportista');
  end if;

  if not coalesce(_dep.solo_test, false)
     and exists (select 1 from perfiles p where p.id = _e.para and p.cupo_deportistas is not null
                   and (select count(*) from deportista d where d.id_entrenador = p.id and not coalesce(d.solo_test, false)) >= p.cupo_deportistas) then
    raise exception 'Quien lo recibe no tiene sitio para más deportistas';
  end if;

  /* Lo que se cierra con el entrenador de antes, como al quitarlo. Los
     grupos ANTES de cambiarlo (el sello de la pertenencia exige que el
     deportista sea del entrenador del grupo), y los accesos de director
     también antes (si no, el guardián del dueño no dejaría cambiarlo). */
  update grupo_entreno_miembro set hasta = current_date
   where id_deportista = _dep.id and hasta is null
     and id_grupo in (select g.id from grupo_entreno g where g.id_entrenador = _e.de);
  delete from director_acceso where id_deportista = _dep.id;
  delete from invitacion_deportista where id_deportista = _dep.id and not coalesce(usado, false);

  /* Lo suyo que usaba: copias para el nuevo, y lo del deportista, a ellas. */
  if coalesce((_e.contenido->>'con_lo_suyo')::boolean, false) then
    _t := public.envio_copiar_tests(_e.para, _e, '{}'::jsonb);
    _mapa := _t->'mapa';
    for _r in select value as v from jsonb_array_elements(coalesce(_e.contenido->'clasificaciones', '[]'::jsonb)) loop
      _nueva := public.envio_copiar_clasificacion(_e.para, _r.v->'clasificacion', _r.v->'zonas', _mapa, null, _e.de_nombre);
      _clmap := _clmap || jsonb_build_object(_r.v->>'origen', _nueva);
      _ids := _ids || to_jsonb(_nueva);
    end loop;
    /* Sus mediciones se MUEVEN a las copias: copiarlas las enseñaría dos
       veces, y el de antes ya no las ve. Si la copia ya tiene una ese mismo
       día (un test reusado de otro envío), esa se queda donde estaba. */
    for _k in select jsonb_object_keys(_mapa) loop
      update test_medicion m set id_definicion = (_mapa->>_k)::bigint
       where m.id_deportista = _dep.id and m.id_definicion = _k::bigint
         and not exists (select 1 from test_medicion o
                          where o.id_definicion = (_mapa->>_k)::bigint and o.id_deportista = m.id_deportista and o.fecha = m.fecha);
    end loop;
    /* Sus días de test, a la copia. */
    update sesion s
       set test = jsonb_build_object('origen', 'propio', 'id', (_mapa->>(s.test->>'id'))::bigint)
     where s.id_deportista = _dep.id and s.test->>'origen' = 'propio'
       and (_mapa->>(s.test->>'id')) is not null;
    /* Sus ajustes, a las zonas copiadas y con los límites en las copias de
       los tests. Si un límite no se puede reenlazar, se queda como estaba. */
    for _r in select a.id, n.id as zona, a.desde, a.hasta
                from zona_ajuste a
                join zona_entrenador v on v.id = a.id_zona
                join zona_entrenador n on n.id_clasificacion = (_clmap->>v.id_clasificacion::text)::bigint
                                      and upper(n.sigla) = upper(v.sigla) and not n.archivada
               where a.id_deportista = _dep.id and (_clmap->>v.id_clasificacion::text) is not null loop
      begin
        update zona_ajuste
           set id_zona = _r.zona, desde = public.envio_limite(_r.desde, _mapa), hasta = public.envio_limite(_r.hasta, _mapa)
         where id = _r.id;
      exception when others then
        update zona_ajuste set id_zona = _r.zona where id = _r.id;
      end;
    end loop;
  end if;

  update deportista set id_entrenador = _e.para where id = _dep.id;

  update envio_entrenador
     set estado = 'aceptado', contestado_en = now(),
         resultado = jsonb_build_object('deportista', _dep.id)
                     || case when _mapa <> '{}'::jsonb then jsonb_build_object('tests', _mapa) else '{}'::jsonb end
                     || case when jsonb_array_length(_ids) > 0 then jsonb_build_object('clasificaciones', _ids) else '{}'::jsonb end
   where id = _id;
  return jsonb_build_object('estado', 'aceptado', 'deportista', _dep.id);
end $$;


/* Contestar como entrenador: ahora también los traspasos. */
create or replace function public.contestar_envio(_id bigint, _aceptar boolean, _nombres jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _yo   uuid := auth.uid();
  _e    envio_entrenador%rowtype;
  _n    jsonb := case when jsonb_typeof(_nombres) = 'object' then _nombres else '{}'::jsonb end;
  _t    jsonb;
  _mapa jsonb;
  _res  jsonb := '{}'::jsonb;
  _ids  jsonb;
  _r    record;
begin
  select * into _e from envio_entrenador where id = _id for update;
  if not found or _yo is null or _e.para <> _yo then
    raise exception 'No encontrado';
  end if;
  if _e.estado <> 'pendiente' then
    raise exception 'Ese envío ya no está pendiente';
  end if;

  if not coalesce(_aceptar, false) then
    update envio_entrenador
       set estado = 'rechazado', contestado_en = now(),
           rechaza = case when tipo = 'deportista' then 'entrenador' else rechaza end
     where id = _id;
    return jsonb_build_object('estado', 'rechazado');
  end if;

  if not exists (select 1 from perfiles where id = _yo and rol = 'entrenador') then
    raise exception 'Solo un entrenador puede aceptarlo';
  end if;

  /* Un traspaso: lo hace el último que acepta. */
  if _e.tipo = 'deportista' then
    if _e.acepta_entrenador_en is not null then
      raise exception 'Ya lo aceptaste: falta que conteste el deportista';
    end if;
    update envio_entrenador set acepta_entrenador_en = now() where id = _id;
    if _e.deportista_usuario is null or _e.acepta_deportista_en is not null then
      return public.envio_hacer_traspaso(_id);
    end if;
    return jsonb_build_object('estado', 'pendiente', 'falta', 'deportista');
  end if;

  /* Primero los tests: las zonas se enganchan a sus copias. */
  _t := public.envio_copiar_tests(_yo, _e, _n->'tests');
  _mapa := _t->'mapa';

  if _e.tipo = 'plantilla' then
    _res := jsonb_build_object('plantilla',
      public.envio_copiar_plantilla(_yo, _e.contenido, _n->>'plantilla', _e.de_nombre));

  elsif _e.tipo = 'zonas' then
    _res := jsonb_build_object('clasificacion',
      public.envio_copiar_clasificacion(_yo, _e.contenido->'clasificacion', _e.contenido->'zonas', _mapa,
                                        _n->>'clasificacion', _e.de_nombre));

  elsif _e.tipo = 'varios' then
    _ids := '[]'::jsonb;
    for _r in select value as v, (ordinality - 1)::int as i
                from jsonb_array_elements(coalesce(_e.contenido->'plantillas', '[]'::jsonb)) with ordinality loop
      _ids := _ids || to_jsonb(public.envio_copiar_plantilla(_yo, _r.v, _n->'plantillas'->>(_r.i::text), _e.de_nombre));
    end loop;
    _res := jsonb_build_object('plantillas', _ids);
    _ids := '[]'::jsonb;
    for _r in select value as v, (ordinality - 1)::int as i
                from jsonb_array_elements(coalesce(_e.contenido->'clasificaciones', '[]'::jsonb)) with ordinality loop
      _ids := _ids || to_jsonb(public.envio_copiar_clasificacion(_yo, _r.v->'clasificacion', _r.v->'zonas', _mapa,
                                                                 _n->'clasificaciones'->>(_r.i::text), _e.de_nombre));
    end loop;
    _res := _res || jsonb_build_object('clasificaciones', _ids);
  end if;

  if _mapa <> '{}'::jsonb then
    _res := _res || jsonb_build_object('tests', _mapa);
  end if;
  update envio_entrenador
     set estado = 'aceptado', contestado_en = now(), resultado = _res
   where id = _id;
  return jsonb_build_object('estado', 'aceptado') || _res
         || case when jsonb_array_length(_t->'reusados') > 0 then jsonb_build_object('reusados', _t->'reusados') else '{}'::jsonb end;
end $$;


/* Contestar como deportista: solo el suyo, y solo mientras está pendiente. */
create or replace function public.contestar_traspaso_deportista(_id bigint, _aceptar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _yo uuid := auth.uid();
  _e  envio_entrenador%rowtype;
begin
  select * into _e from envio_entrenador where id = _id for update;
  if not found or _yo is null or _e.tipo <> 'deportista' or _e.deportista_usuario is distinct from _yo then
    raise exception 'No encontrado';
  end if;
  if _e.estado <> 'pendiente' then
    raise exception 'Eso ya no está pendiente';
  end if;
  if not coalesce(_aceptar, false) then
    update envio_entrenador set estado = 'rechazado', contestado_en = now(), rechaza = 'deportista' where id = _id;
    return jsonb_build_object('estado', 'rechazado');
  end if;
  if _e.acepta_deportista_en is not null then
    raise exception 'Ya lo aceptaste: falta que conteste el otro entrenador';
  end if;
  update envio_entrenador set acepta_deportista_en = now() where id = _id;
  if _e.acepta_entrenador_en is not null then
    return public.envio_hacer_traspaso(_id);
  end if;
  return jsonb_build_object('estado', 'pendiente', 'falta', 'entrenador');
end $$;


/* Lo que tiene que contestar el deportista: solo lo que necesita ver. */
create or replace function public.mis_traspasos_pendientes()
returns table (id bigint, de_nombre text, para_nombre text, mensaje text, creado_en timestamptz, ya_acepte boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.de_nombre, e.para_nombre, e.mensaje, e.creado_en, e.acepta_deportista_en is not null
    from envio_entrenador e
   where e.tipo = 'deportista' and e.estado = 'pendiente' and e.deportista_usuario = auth.uid()
   order by e.creado_en desc;
$$;


revoke all on function public.envio_hacer_traspaso(bigint) from public, anon, authenticated;

revoke all on function public.entrenador_tiene_sitio(uuid) from public;
revoke all on function public.pedir_traspaso(uuid, bigint, boolean, text) from public;
revoke all on function public.contestar_traspaso_deportista(bigint, boolean) from public;
revoke all on function public.mis_traspasos_pendientes() from public;
revoke all on function public.contestar_envio(bigint, boolean, jsonb) from public;

revoke execute on function public.entrenador_tiene_sitio(uuid) from anon;
revoke execute on function public.pedir_traspaso(uuid, bigint, boolean, text) from anon;
revoke execute on function public.contestar_traspaso_deportista(bigint, boolean) from anon;
revoke execute on function public.mis_traspasos_pendientes() from anon;
revoke execute on function public.contestar_envio(bigint, boolean, jsonb) from anon;

grant execute on function public.entrenador_tiene_sitio(uuid) to authenticated;
grant execute on function public.pedir_traspaso(uuid, bigint, boolean, text) to authenticated;
grant execute on function public.contestar_traspaso_deportista(bigint, boolean) to authenticated;
grant execute on function public.mis_traspasos_pendientes() to authenticated;
grant execute on function public.contestar_envio(bigint, boolean, jsonb) to authenticated;
