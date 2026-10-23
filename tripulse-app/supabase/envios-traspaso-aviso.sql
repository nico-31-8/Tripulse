/* ============================================================
   TRIPULSE — Pasar un deportista: el aviso a quien lo recibe
   ============================================================

   Pedido del usuario el 23-10-2026 («haz lo del aviso al entrenador»), sobre
   envios-traspaso.sql y envios-traspaso-ejercicios.sql.

   EL HUECO. Luis acepta el traspaso de Marta y le queda «Falta que conteste
   Marta». Si Marta acepta días después, Luis no se entera: se la encuentra en
   su lista. Si dice que no, o Ana lo cancela, tampoco. A Ana sí le llega
   («Luis lo ha aceptado»): eso va por `respuesta_vista_en`, que es suyo.

   LO QUE HACE. Un aviso para quien lo recibe, con su propia columna
   (`aviso_para_visto_en`), que la base deja ya como visto cuando lo cerró él
   mismo: si acepta el último o lo rechaza, lo ve en el momento y no hace falta
   avisarle. Queda pendiente cuando lo cierra otro:
   · el deportista, aceptando el último o diciendo que no;
   · quien lo pidió, cancelándolo después de que él lo aceptara;
   · o la base, al cancelarlo porque el deportista ya no es de quien lo pidió.
   Lo quita «Entendido» en su panel, o abrir Recibidos en Envíos
   (envio_aviso_visto, como envio_respuesta_vista para quien lo envía).

   Solo cambian las funciones que cierran un traspaso, y una columna nueva que
   nadie más lee. Lo que ve cada uno, igual.
   ============================================================ */


alter table public.envio_entrenador add column if not exists aviso_para_visto_en timestamptz;

/* Los traspasos que ya estaban cerrados: visto, si lo cerró quien lo recibe. */
update public.envio_entrenador
   set aviso_para_visto_en = coalesce(contestado_en, now())
 where tipo = 'deportista' and estado <> 'pendiente' and aviso_para_visto_en is null
   and ((estado = 'rechazado' and rechaza = 'entrenador')
        or (estado = 'aceptado' and (acepta_deportista_en is null or acepta_entrenador_en >= acepta_deportista_en))
        or (estado = 'cancelado' and acepta_entrenador_en is null));


/* Quien lo recibe ya ha visto en qué quedó. */
create or replace function public.envio_aviso_visto(_ids bigint[])
returns void language sql security definer set search_path = public as $$
  update envio_entrenador
     set aviso_para_visto_en = now()
   where id = any(coalesce(_ids, '{}'::bigint[])) and para = auth.uid()
     and tipo = 'deportista' and estado <> 'pendiente' and aviso_para_visto_en is null;
$$;


/* Hacer el traspaso: lo mismo que en envios-traspaso-ejercicios.sql, y el
   aviso. Lo llama el último que acepta: si es quien lo recibe, ya lo ve. */
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

  /* Si ya no es de quien lo pidió (lo quitó, o es de otro), no se hace. Si
     quien lo cierra es quien lo recibe, ya lo ve: sin aviso. */
  if not found or _dep.id_entrenador is distinct from _e.de or _dep.id_grupo is not null then
    update envio_entrenador
       set estado = 'cancelado', contestado_en = now(),
           aviso_para_visto_en = case when auth.uid() = _e.para then now() end
     where id = _id;
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
         aviso_para_visto_en = case when auth.uid() = _e.para then now() end,
         resultado = jsonb_build_object('deportista', _dep.id)
                     || case when _mapa <> '{}'::jsonb then jsonb_build_object('tests', _mapa) else '{}'::jsonb end
                     || case when jsonb_array_length(_ids) > 0 then jsonb_build_object('clasificaciones', _ids) else '{}'::jsonb end
                     || case when _ej <> '{}'::jsonb then jsonb_build_object('ejercicios', _ej) else '{}'::jsonb end
   where id = _id;
  return jsonb_build_object('estado', 'aceptado', 'deportista', _dep.id);
end $$;


/* Contestar como entrenador: lo mismo que en envios-traspaso.sql. Si rechaza
   un traspaso, ya lo sabe: no hace falta avisarle. */
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
           rechaza = case when tipo = 'deportista' then 'entrenador' else rechaza end,
           aviso_para_visto_en = case when tipo = 'deportista' then now() else aviso_para_visto_en end
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


/* Cancelarlo, quien lo mandó y mientras nadie ha cerrado el envío. Si era un
   traspaso que quien lo recibe ya había aceptado, le queda el aviso. */
create or replace function public.cancelar_envio(_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update envio_entrenador
     set estado = 'cancelado', contestado_en = now(),
         aviso_para_visto_en = case when tipo = 'deportista' and acepta_entrenador_en is null then now() else aviso_para_visto_en end
   where id = _id and de = auth.uid() and estado = 'pendiente';
  if not found then
    raise exception 'Ese envío ya no se puede cancelar';
  end if;
end $$;


revoke all on function public.envio_hacer_traspaso(bigint) from public, anon, authenticated;

revoke all on function public.envio_aviso_visto(bigint[]) from public;
revoke all on function public.contestar_envio(bigint, boolean, jsonb) from public;
revoke all on function public.cancelar_envio(bigint) from public;

revoke execute on function public.envio_aviso_visto(bigint[]) from anon;
revoke execute on function public.contestar_envio(bigint, boolean, jsonb) from anon;
revoke execute on function public.cancelar_envio(bigint) from anon;

grant execute on function public.envio_aviso_visto(bigint[]) to authenticated;
grant execute on function public.contestar_envio(bigint, boolean, jsonb) to authenticated;
grant execute on function public.cancelar_envio(bigint) to authenticated;
