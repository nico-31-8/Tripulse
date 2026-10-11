/* ============================================================
   Director de entrenadores · 1 · comprobación (NO CAMBIA NADA)
   ============================================================
   Re-hace el escenario del director contra la base real y lo deshace todo:
   va dentro de una transacción que termina con un error A PROPÓSITO, y ese
   error trae el informe. Se lanza entero, con director-1-base ya aplicada.

   Cómo se hace pasar por cada persona: set_config('role', 'authenticated')
   y set_config('request.jwt.claims', {sub: <uuid>}), que es exactamente lo
   que hace PostgREST con cada petición de la app. Las reglas (RLS) se aplican
   igual que en la app.

   OJO AL ELEGIR GENTE: las dos cuentas de plataforma pueden ponerse la marca
   de director. «Un entrenador normal» tiene que salir de fuera de
   plataforma_admin; en el primer ensayo salió una de ellas y la prueba dio un
   falso positivo («¡E SE PUSO LA MARCA!» siendo E de plataforma).

   Lo que tiene que salir (ensayo del 2026-10-09, antes de aplicar):
   [2] D ve todas las sesiones de X y 0 de Y; chat de X: 0; wellness y
   anamnesis de X enteros; ficha de Y: 0 filas; quedarse a X y escribir al
   chat: bloqueados. [3] un solo aviso a E y uno a X, con {datos,bloques};
   sesión marcada. [4] un cambio del propio entrenador: 0 avisos. [5] quitar,
   pedir y dar; sin la marca: 0. [6] terminar: 0 y sin accesos. [7] segundo
   director y entrenador sin marca: bloqueados.
   ============================================================ */

begin;
set local lock_timeout = '4s';

do $prueba$
declare
  _r text := '';
  _n bigint; _k bigint; _txt text; _cod text;
  _D uuid; _E uuid; _C uuid; _normal uuid; _X bigint; _Y bigint; _uX uuid;
  _totX bigint; _totMX bigint; _totE bigint; _ses bigint; _v bigint;
begin
  /* E: entrenador con al menos dos deportistas de verdad con sesiones. X: el
     de más sesiones con cuenta. Y: otro suyo. D y C: otros dos entrenadores.
     N: un entrenador que NO es de plataforma. */
  select d.id_entrenador into _E
    from deportista d join sesion s on s.id_deportista = d.id
   where d.id_entrenador is not null and d.id_grupo is null and not d.solo_test
   group by d.id_entrenador having count(distinct d.id) >= 2
   order by count(*) desc limit 1;
  select d.id, d.id_usuario into _X, _uX from deportista d
   where d.id_entrenador = _E and d.id_grupo is null and not d.solo_test and d.id_usuario is not null
   order by (select count(*) from sesion s where s.id_deportista = d.id) desc limit 1;
  select d.id into _Y from deportista d
   where d.id_entrenador = _E and d.id_grupo is null and not d.solo_test and d.id <> _X
   order by (select count(*) from sesion s where s.id_deportista = d.id) desc limit 1;
  select p.id into _D from perfiles p where p.rol = 'entrenador' and p.id <> _E order by p.created_at limit 1;
  select p.id into _C from perfiles p where p.rol = 'entrenador' and p.id not in (_E, _D) order by p.created_at limit 1;
  select p.id into _normal from perfiles p where p.rol = 'entrenador'
     and not exists (select 1 from plataforma_admin a where a.id_perfil = p.id) order by p.created_at limit 1;
  if _E is null or _X is null or _Y is null or _D is null or _C is null or _normal is null then
    raise exception 'COMPROBACION: faltan datos para el escenario';
  end if;
  if exists (select 1 from director_entrenador where id_entrenador = _E and estado in ('pendiente', 'activo')) then
    raise exception 'COMPROBACION: E ya tiene director de verdad; elige otro escenario';
  end if;

  select count(*) into _totX from sesion where id_deportista = _X;
  select count(*) into _totMX from mensajes where id_deportista = _X;
  select count(*) into _totE from deportista where id_entrenador = _E and id_grupo is null and not solo_test;

  insert into director (id_perfil) values (_D) on conflict do nothing;
  insert into director_entrenador (id_director, id_entrenador, estado) values (_D, _E, 'activo') returning id into _v;
  insert into director_acceso (id_director, id_deportista, estado) values (_D, _X, 'concedido');

  /* [2] El director dentro. */
  perform set_config('request.jwt.claims', json_build_object('sub', _D, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into _n from sesion where id_deportista = _X;    _r := _r || format(' [2] D ve sesiones de X: %s de %s;', _n, _totX);
  select count(*) into _n from sesion where id_deportista = _Y;    _r := _r || format(' de Y cerrado: %s;', _n);
  select count(*) into _n from mensajes where id_deportista = _X;  _r := _r || format(' chat de X: %s (hay %s);', _n, _totMX);
  select count(*) into _n from deportista where id in (_X, _Y);    _r := _r || format(' fichas X+Y: %s;', _n);
  select count(*) into _n from director_roster(_E);                _r := _r || format(' roster de E: %s de %s;', _n, _totE);
  select id into _ses from sesion where id_deportista = _X order by id limit 1;
  update sesion set notas_entrenador = coalesce(notas_entrenador, '') || ' ' where id = _ses;
  get diagnostics _k = row_count;                                   _r := _r || format(' D cambia sesión de X: %s;', _k);
  update tarea set comentario = coalesce(comentario, '') || '.' where id = (select id from tarea where id_sesion = _ses order by id limit 1);
  update deportista set nombre = nombre || '' where id = _Y;
  get diagnostics _k = row_count;                                   _r := _r || format(' D toca ficha de Y: %s;', _k);
  begin
    update deportista set id_entrenador = _D where id = _X;
    _r := _r || ' ¡D SE QUEDÓ A X!;';
  exception when others then _r := _r || ' quedarse a X: ' || sqlerrm || ';';
  end;
  begin
    insert into mensajes (id_entrenador, id_deportista, contenido, autor, leido) values (_D, _X, 'prueba', 'entrenador', false);
    _r := _r || ' ¡D ESCRIBIÓ AL CHAT DE X!;';
  exception when others then _r := _r || ' chat de X: bloqueado ' || sqlstate || ';';
  end;
  perform set_config('role', 'postgres', true);

  /* [3] Los avisos que ha dejado. */
  select count(*) into _n from aviso_director where para = _E and de = _D and tipo = 'sesion'; _r := _r || format(' [3] avisos a E: %s;', _n);
  select cambios::text into _txt from aviso_director where para = _E and de = _D and tipo = 'sesion' limit 1; _r := _r || format(' qué: %s;', _txt);
  select count(*) into _n from aviso_director where para = _uX and de = _D;                    _r := _r || format(' avisos a X: %s;', _n);
  select coalesce((cambiada_por = _D)::text, 'null') into _txt from sesion where id = _ses;    _r := _r || format(' sesión marcada: %s;', _txt);

  /* [4] El entrenador: sus cambios no avisan a nadie. */
  perform set_config('request.jwt.claims', json_build_object('sub', _E, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update sesion set notas_entrenador = coalesce(notas_entrenador, '') || '!' where id = _ses;
  select count(*) into _n from mis_avisos_director(true, 50);       _r := _r || format(' [4] E sin leer: %s;', _n);
  perform entrenador_quitar_acceso(_D, _X);
  perform set_config('role', 'postgres', true);
  select count(*) into _n from aviso_director where de = _E and para = _E;                     _r := _r || format(' avisos por cambios del propio E: %s;', _n);

  /* [5] Quitar, pedir, dar; y la marca. */
  perform set_config('request.jwt.claims', json_build_object('sub', _D, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into _n from sesion where id_deportista = _X;    _r := _r || format(' [5] quitado: %s;', _n);
  perform director_pedir_acceso(_X, 'prueba');
  perform set_config('request.jwt.claims', json_build_object('sub', _E, 'role', 'authenticated')::text, true);
  perform entrenador_dar_acceso(_D, _X);
  perform set_config('request.jwt.claims', json_build_object('sub', _D, 'role', 'authenticated')::text, true);
  select count(*) into _n from sesion where id_deportista = _X;    _r := _r || format(' pedido y dado: %s;', _n);
  perform set_config('role', 'postgres', true);
  delete from director where id_perfil = _D;
  perform set_config('role', 'authenticated', true);
  select count(*) into _n from sesion where id_deportista = _X;    _r := _r || format(' sin la marca: %s;', _n);
  perform set_config('role', 'postgres', true);
  insert into director (id_perfil) values (_D);

  /* [6] El entrenador termina. */
  perform set_config('request.jwt.claims', json_build_object('sub', _E, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform director_terminar(_v);
  perform set_config('request.jwt.claims', json_build_object('sub', _D, 'role', 'authenticated')::text, true);
  select count(*) into _n from sesion where id_deportista = _X;    _r := _r || format(' [6] terminado: %s;', _n);
  perform set_config('role', 'postgres', true);
  select count(*) into _n from director_acceso where id_director = _D; _r := _r || format(' accesos que quedan: %s;', _n);

  /* [7] Un solo director, y la marca solo la pone la plataforma. */
  insert into director_entrenador (id_director, id_entrenador, estado) values (_D, _E, 'activo');
  insert into director (id_perfil) values (_C) on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', _C, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform director_solicitar(_E);
    _r := _r || ' ¡E TIENE DOS DIRECTORES!;';
  exception when others then _r := _r || ' [7] segundo director: ' || sqlerrm || ';';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', _normal, 'role', 'authenticated')::text, true);
  begin
    perform admin_poner_director(_normal, true);
    _r := _r || ' ¡UN ENTRENADOR NORMAL SE PUSO LA MARCA!;';
  exception when others then _r := _r || ' entrenador normal: ' || sqlerrm || ';';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', _D, 'role', 'authenticated')::text, true);
  _cod := director_invitar_entrenador('Prueba', 'prueba@ejemplo.com');
  perform set_config('role', 'postgres', true);
  select count(*) into _n from invitacion where codigo = _cod and id_director = _D;
  _r := _r || format(' invitación de D: %s;', _n);

  raise exception 'COMPROBACION-INFORME:%', _r;
end $prueba$;
