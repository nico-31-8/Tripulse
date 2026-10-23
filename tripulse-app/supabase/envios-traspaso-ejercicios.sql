/* ============================================================
   TRIPULSE — Pasar un deportista: también los ejercicios de tu biblioteca
   ============================================================

   Pedido del usuario el 23-10-2026 («mételos en la casilla»), sobre
   envios-traspaso.sql. Al pasar un deportista con «mandar también lo tuyo que
   usa», viajan también los ejercicios de TU biblioteca que tiene en sus
   sesiones: los de la fuerza (el ejercicio y su encadenado) y los de la
   técnica y los saltos (tecnica_id).

   POR QUÉ. La sesión guarda congelados el nombre, las series y los kilos de
   cada ejercicio, y eso pasa solo con él. Pero el vídeo y la técnica se buscan
   en vivo en la biblioteca (lib/video-ejercicio, lib/tecnica), y la biblioteca
   propia de quien lo pasa no la pueden leer ni el nuevo entrenador ni el
   deportista: los vídeos se perderían y las tareas de técnica se quedarían
   vacías. Medido el 23-10: 18 ejercicios de sesiones vienen de bibliotecas
   propias (los otros 531, del común) y 2 tareas de técnica.

   CÓMO. Como los tests y las zonas: al pedirlo se guarda una foto de cada
   ejercicio; al hacerse, quien lo recibe tiene copias SUYAS y las sesiones del
   deportista pasan a apuntar a ellas. Lo de quien lo pasa no se toca.
   · La copia es un ejercicio suyo nuevo, sin `origen_id`: con él, en su lista
     taparía al del común del que salió (lib/biblioteca-propia).
   · Si choca con un nombre que ya ve (los suyos y los del común), llega como
     «Nombre (Ana)». En las sesiones sigue el de siempre: va congelado.
   · Si ya le llegó ese mismo ejercicio en otro traspaso de esa persona y no ha
     cambiado, se usa esa copia y no se duplica.
   · Solo los tuyos: los del común y los del propio deportista ya los ve el
     nuevo entrenador.

   Solo cambian las dos funciones del traspaso y hay un ayudante nuevo,
   cerrado. Las tablas y sus reglas, igual.
   ============================================================ */


/* Las copias de los ejercicios de un traspaso, para quien lo recibe.
   Devuelve {id del original: id de su copia}. */
create or replace function public.envio_copiar_ejercicios(_yo uuid, _e envio_entrenador)
returns jsonb language plpgsql set search_path = public as $$
declare
  _mapa   jsonb := '{}'::jsonb;
  _x      jsonb;
  _usados text[];
  _nombre text;
  _previa bigint;
  _nuevo  bigint;
begin
  /* Los nombres que ya ve en su biblioteca: los suyos y los del común. */
  _usados := array(select b.nombre from ejercicios_biblioteca b
                    where b.id_deportista is null and (b.id_entrenador = _yo or b.id_entrenador is null));
  for _x in select value from jsonb_array_elements(coalesce(_e.contenido->'ejercicios', '[]'::jsonb)) loop
    /* La copia de un traspaso anterior de la misma persona, si sigue igual. */
    _previa := null;
    select b.id into _previa
      from envio_entrenador p
      join ejercicios_biblioteca b on b.id = (p.resultado->'ejercicios'->>(_x->>'id'))::bigint
     where p.para = _yo and p.de = _e.de and p.estado = 'aceptado' and p.id <> _e.id
       and b.id_entrenador = _yo and b.id_deportista is null
       and (to_jsonb(b) - 'id' - 'nombre' - 'created_at' - 'id_entrenador' - 'id_deportista' - 'origen_id')
           = (_x - 'id' - 'nombre')
     order by p.contestado_en desc nulls last
     limit 1;
    if _previa is not null then
      _nuevo := _previa;
    else
      _nombre := public.envio_nombre_libre(_x->>'nombre', _usados, _e.de_nombre);
      insert into ejercicios_biblioteca (nombre, grupo_muscular, url_video, descripcion, ejecucion,
                                         tipo, region, disciplina, lesion, momento,
                                         nivel_pliometria, parte_pliometria, id_entrenador)
      select _nombre, coalesce(r.grupo_muscular, 'Otros'), r.url_video, r.descripcion, r.ejecucion,
             coalesce(r.tipo, '{}'), coalesce(r.region, '{}'), coalesce(r.disciplina, '{}'),
             coalesce(r.lesion, '{}'), coalesce(r.momento, '{}'),
             r.nivel_pliometria, r.parte_pliometria, _yo
        from jsonb_populate_record(null::ejercicios_biblioteca, _x) r
      returning id into _nuevo;
      _usados := _usados || _nombre;
    end if;
    _mapa := _mapa || jsonb_build_object(_x->>'id', _nuevo);
  end loop;
  return _mapa;
end $$;


/* Pedir el traspaso. Lo mismo que en envios-traspaso.sql, y con «lo tuyo que
   usa» también los ejercicios de tu biblioteca que tiene en sus sesiones. */
create or replace function public.pedir_traspaso(
  _para uuid, _id_deportista bigint, _con_lo_suyo boolean default true, _mensaje text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  _yo     uuid := auth.uid();
  _men    text := nullif(btrim(coalesce(_mensaje, '')), '');
  _d      jsonb;
  _dep    deportista%rowtype;
  _tests  bigint[] := '{}'::bigint[];
  _ejs    bigint[] := '{}'::bigint[];
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
    /* …tus zonas que salen de ellos o en las que tiene ajustes. Las que no
       se pueden mandar (sin zonas, o de un test que no es tuyo) se quedan… */
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
    /* …y los ejercicios de tu biblioteca que tiene en sus sesiones: en la
       fuerza (el ejercicio y su encadenado) y en la técnica y los saltos. */
    _ejs := array(
      select b.id from ejercicios_biblioteca b
       where b.id_entrenador = _yo and b.id_deportista is null
         and b.id in (select x.ejercicio_id from ejercicios x where x.id_deportista = _dep.id
                      union
                      select x.ejercicio_encadenado_id from ejercicios x where x.id_deportista = _dep.id
                      union
                      select t.tecnica_id from tarea t where t.id_deportista = _dep.id));
  end if;

  insert into envio_entrenador (de, para, tipo, titulo, contenido, mensaje, de_nombre, para_nombre, para_correo,
                                id_deportista, deportista_usuario)
  values (_yo, _para, 'deportista', left('Traspaso de ' || coalesce(_dep.nombre, 'un deportista'), 120),
          jsonb_build_object(
            'deportista', jsonb_build_object('id', _dep.id, 'nombre', _dep.nombre,
                                             'tiene_cuenta', _dep.id_usuario is not null, 'solo_test', coalesce(_dep.solo_test, false)),
            'con_lo_suyo', coalesce(_con_lo_suyo, false),
            'tests', public.envio_fotos_tests(_tests),
            'clasificaciones', _cls,
            'ejercicios', (select coalesce(jsonb_agg(to_jsonb(b) - 'id_entrenador' - 'id_deportista' - 'origen_id' - 'created_at'
                                                     order by b.nombre, b.id), '[]'::jsonb)
                             from ejercicios_biblioteca b where b.id = any(_ejs))),
          _men, _d->>'yo_nombre', _d->>'para_nombre', _d->>'para_correo',
          _dep.id, _dep.id_usuario)
  returning id into _nuevo;
  return _nuevo;
end $$;


/* Hacer el traspaso. Lo mismo que en envios-traspaso.sql, y con «lo tuyo que
   usa» también las copias de sus ejercicios y sus sesiones apuntando a ellas. */
create or replace function public.envio_hacer_traspaso(_id bigint)
returns jsonb language plpgsql set search_path = public as $$
declare
  _e     envio_entrenador%rowtype;
  _dep   deportista%rowtype;
  _t     jsonb;
  _mapa  jsonb := '{}'::jsonb;
  _clmap jsonb := '{}'::jsonb;
  _ej    jsonb := '{}'::jsonb;
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
    /* Sus ejercicios de tu biblioteca: copias para el nuevo, y sus sesiones
       (el ejercicio, su encadenado y la técnica), a ellas. */
    _ej := public.envio_copiar_ejercicios(_e.para, _e);
    if _ej <> '{}'::jsonb then
      update ejercicios x set ejercicio_id = (_ej->>x.ejercicio_id::text)::bigint
       where x.id_deportista = _dep.id and (_ej ? x.ejercicio_id::text);
      update ejercicios x set ejercicio_encadenado_id = (_ej->>x.ejercicio_encadenado_id::text)::integer
       where x.id_deportista = _dep.id and (_ej ? x.ejercicio_encadenado_id::text);
      update tarea t set tecnica_id = (_ej->>t.tecnica_id::text)::bigint
       where t.id_deportista = _dep.id and (_ej ? t.tecnica_id::text);
    end if;
  end if;

  update deportista set id_entrenador = _e.para where id = _dep.id;

  update envio_entrenador
     set estado = 'aceptado', contestado_en = now(),
         resultado = jsonb_build_object('deportista', _dep.id)
                     || case when _mapa <> '{}'::jsonb then jsonb_build_object('tests', _mapa) else '{}'::jsonb end
                     || case when jsonb_array_length(_ids) > 0 then jsonb_build_object('clasificaciones', _ids) else '{}'::jsonb end
                     || case when _ej <> '{}'::jsonb then jsonb_build_object('ejercicios', _ej) else '{}'::jsonb end
   where id = _id;
  return jsonb_build_object('estado', 'aceptado', 'deportista', _dep.id);
end $$;


revoke all on function public.envio_copiar_ejercicios(uuid, envio_entrenador) from public, anon, authenticated;
revoke all on function public.envio_hacer_traspaso(bigint) from public, anon, authenticated;

revoke all on function public.pedir_traspaso(uuid, bigint, boolean, text) from public;
revoke execute on function public.pedir_traspaso(uuid, bigint, boolean, text) from anon;
grant execute on function public.pedir_traspaso(uuid, bigint, boolean, text) to authenticated;
