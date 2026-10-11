/* ============================================================
   Director de entrenadores · 1 · la base
   ============================================================
   Un DIRECTOR es un entrenador con una marca que pone la plataforma. Trabaja
   con otros entrenadores y, de los deportistas de esos entrenadores, solo ve
   los que cada entrenador le abre.

   TRES PUERTAS, Y LAS TRES SE ABREN CON CONSENTIMIENTO
   1. La marca de director la pone la plataforma (tabla director).
   2. Trabajar juntos lo acepta el entrenador (director_entrenador). Un
      entrenador tiene UN SOLO director: lo garantiza un índice único de la
      base, no la pantalla.
   3. Cada deportista lo abre su entrenador (director_acceso). Con solo la
      puerta 2 abierta, el director ve los nombres y nada más.

   El acceso de verdad exige las tres a la vez y se decide en UN sitio:
   dep_ids_director(). Si el entrenador corta, si la plataforma quita la
   marca o si el deportista se va con otro entrenador, el acceso desaparece
   solo, sin borrar nada a mano.

   LO QUE VE UN DIRECTOR CON EL DEPORTISTA ABIERTO
   Todo lo que cuelga de auth_dep_ids(): plan, sesiones, tests, zonas,
   wellness, anamnesis... MENOS EL CHAT: mensajes pasa a mirar
   auth_dep_ids_sin_director(). Los cobros no cuelgan de auth_dep_ids, así
   que tampoco los alcanza. De lo que es del entrenador ve su biblioteca de
   ejercicios (para leer las sesiones) y los objetivos de series del
   deportista abierto. Nada más.

   PARA TODOS LOS DEMÁS NO CAMBIA NADA
   auth_dep_ids() gana una rama que para quien no es director sale vacía, y
   las políticas nuevas solo dejan pasar a directores. Comprobado antes de
   aplicar con un ensayo dentro de una transacción que se deshace: las mismas
   filas, antes y después, para entrenadores y deportistas reales.

   LOS AVISOS LOS ESCRIBE LA BASE
   Cada cambio de un director en algo de un deportista deja un aviso a su
   entrenador y, si le afecta, al deportista. Lo escribe un disparador, así
   que ninguna pantalla se puede olvidar de avisar. Los cambios en una misma
   sesión se juntan en un solo aviso mientras no se lea, y la sesión queda
   marcada con quién la cambió (sesion.cambiada_por).

   Todo lo nuevo se lee y se escribe por funciones: las tablas nuevas tienen
   la RLS puesta y ninguna política, a propósito.
   ============================================================ */

/* Coge bloqueos exclusivos en tablas que la app está usando: si alguno no
   llega en 5 segundos, mejor que falle a que congele la app esperando. */
set local lock_timeout = '5s';


/* ============================================================
   1. Tablas nuevas
   ============================================================ */

create table if not exists public.director (
  id_perfil   uuid primary key references public.perfiles(id) on delete cascade,
  desde       timestamptz not null default now(),
  puesto_por  uuid references public.perfiles(id) on delete set null
);
comment on table public.director is
  'Entrenadores con la marca de director. La pone y la quita solo la plataforma.';

create table if not exists public.director_entrenador (
  id             bigint generated always as identity primary key,
  id_director    uuid not null references public.perfiles(id) on delete cascade,
  id_entrenador  uuid not null references public.perfiles(id) on delete cascade,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'activo', 'rechazado', 'terminado')),
  origen         text not null default 'solicitud' check (origen in ('solicitud', 'invitacion')),
  creado_en      timestamptz not null default now(),
  respondido_en  timestamptz,
  terminado_en   timestamptz,
  terminado_por  uuid references public.perfiles(id) on delete set null,
  check (id_director <> id_entrenador)
);
comment on table public.director_entrenador is
  'Quién dirige a quién. Las filas viejas se quedan (rechazado, terminado) como historial.';

/* UN SOLO DIRECTOR POR ENTRENADOR. Entre la solicitud pendiente y la activa
   solo puede haber una fila viva por entrenador: si otro director lo pide,
   choca aquí aunque la pantalla se equivoque. */
create unique index if not exists director_entrenador_un_director
  on public.director_entrenador (id_entrenador) where estado in ('pendiente', 'activo');
create index if not exists director_entrenador_por_director
  on public.director_entrenador (id_director) where estado in ('pendiente', 'activo');

create table if not exists public.director_acceso (
  id_director    uuid not null references public.perfiles(id) on delete cascade,
  id_deportista  bigint not null references public.deportista(id) on delete cascade,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'concedido', 'denegado')),
  mensaje        text check (mensaje is null or length(mensaje) <= 300),
  pedido_en      timestamptz not null default now(),
  respondido_en  timestamptz,
  primary key (id_director, id_deportista)
);
comment on table public.director_acceso is
  'El candado de cada deportista. Lo pide el director; lo abre, lo niega o lo quita su entrenador.';
create index if not exists director_acceso_por_deportista on public.director_acceso (id_deportista);

create table if not exists public.aviso_director (
  id              bigint generated always as identity primary key,
  para            uuid not null references public.perfiles(id) on delete cascade,
  de              uuid references public.perfiles(id) on delete set null,
  /* El tercero del que habla el aviso: «Laura ha dado acceso a <Pedro>». */
  sobre           uuid references public.perfiles(id) on delete set null,
  id_deportista   bigint references public.deportista(id) on delete cascade,
  tipo            text not null
                  check (tipo in ('sesion', 'plan', 'test', 'zonas', 'ficha', 'salud', 'acceso', 'vinculo')),
  clave           text not null,
  /* Sin clave ajena a propósito: si se borra la sesión, el aviso tiene que
     poder seguir diciendo que se borró. */
  id_sesion       bigint,
  fecha           date,
  cambios         text[] not null default '{}',
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  leido_en        timestamptz
);
comment on table public.aviso_director is
  'Avisos del sistema de directores. Los de cambios los escribe el disparador registrar_cambio_director.';

/* Mientras un aviso no se lee, los cambios nuevos con la misma clave (la
   misma sesión, el mismo plan) se suman a él en vez de abrir otro. */
create unique index if not exists aviso_director_sin_leer
  on public.aviso_director (para, clave) where leido_en is null;
create index if not exists aviso_director_por_destinatario
  on public.aviso_director (para, actualizado_en desc);

alter table public.director            enable row level security;
alter table public.director_entrenador enable row level security;
alter table public.director_acceso     enable row level security;
alter table public.aviso_director      enable row level security;
/* Sin políticas: solo por funciones. Y sin privilegios de tabla, por si
   algún día alguien añade una política sin pensar. */
revoke all on public.director, public.director_entrenador, public.director_acceso, public.aviso_director
  from anon, authenticated;


/* ============================================================
   2. Columnas nuevas en tablas que ya existen (las dos admiten vacío:
      no cambian nada de lo que ya hay)
   ============================================================ */

/* Quién cambió por última vez la sesión siendo director. Lo pone solo el
   disparador; un entrenador o un deportista no lo tocan nunca. */
alter table public.sesion add column if not exists cambiada_por uuid;
alter table public.sesion add column if not exists cambiada_en  timestamptz;
create index if not exists sesion_cambiada_por on public.sesion (cambiada_por) where cambiada_por is not null;

/* La invitación que crea un director para un entrenador nuevo. */
alter table public.invitacion add column if not exists id_director uuid references public.perfiles(id) on delete cascade;


/* ============================================================
   3. Quién es director y qué deportistas tiene abiertos
   ============================================================ */

create or replace function public.es_director(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from director where id_perfil = _uid);
$$;

create or replace function public.soy_director()
returns boolean language sql stable security definer set search_path = public as $$
  select es_director(auth.uid());
$$;

/* EL ÚNICO SITIO QUE DECIDE el acceso de un director: las tres puertas a la
   vez. Fuera los grupos y los evaluados: un director solo entra en
   deportistas de verdad. */
create or replace function public.dep_ids_director()
returns setof bigint language sql stable security definer set search_path = public as $$
  select a.id_deportista
    from director_acceso a
    join director r            on r.id_perfil = a.id_director
    join deportista d          on d.id = a.id_deportista
    join director_entrenador v on v.id_director = a.id_director
                              and v.id_entrenador = d.id_entrenador
                              and v.estado = 'activo'
   where a.id_director = auth.uid()
     and a.estado = 'concedido'
     and d.id_grupo is null
     and d.solo_test = false
$$;

create or replace function public.entrenadores_de_director()
returns setof uuid language sql stable security definer set search_path = public as $$
  select v.id_entrenador
    from director_entrenador v
    join director r on r.id_perfil = v.id_director
   where v.id_director = auth.uid() and v.estado = 'activo'
$$;

/* Lo de siempre, sin la rama de director. Es exactamente el cuerpo que tenía
   auth_dep_ids() hasta hoy; el chat cuelga de esta y no de la otra. */
create or replace function public.auth_dep_ids_sin_director()
returns setof integer language sql stable security definer set search_path = public as $$
  select id from deportista
   where id_usuario = auth.uid()
      or id_entrenador = auth.uid()
  union
  select d.id from deportista d
    join grupo_entreno g on g.id = d.id_grupo
   where g.id_entrenador = auth.uid()
$$;

/* La regla de las 31 tablas: lo de siempre MÁS lo abierto a un director.
   Para quien no es director, dep_ids_director() sale vacía. */
create or replace function public.auth_dep_ids()
returns setof integer language sql stable security definer set search_path = public as $$
  select auth_dep_ids_sin_director()
  union
  select dep_ids_director()::integer
$$;


/* ============================================================
   4. Las reglas que cambian
   ============================================================ */

/* EL CHAT, FUERA DEL DIRECTOR. Leer: lo mismo que antes, sin la rama nueva.
   Escribir: además, el mensaje tiene que ir a un deportista propio. Antes
   bastaba con poner tu id de entrenador en la fila, y cualquier entrenador
   podía escribirle a un deportista ajeno (un director también, que es justo
   lo que no queremos). Las cuatro escrituras de la app (chat del entrenador,
   chat del deportista, mensaje al grupo y marcar como leído) ya cumplen esto. */
drop policy if exists mensajes_rw on public.mensajes;
create policy mensajes_rw on public.mensajes as permissive for all to authenticated
  using ((id_entrenador = (select auth.uid())) or (id_deportista in (select auth_dep_ids_sin_director())))
  with check (id_deportista in (select auth_dep_ids_sin_director()));

/* La ficha del deportista abierto: la lee y la edita. De quién es (su
   entrenador, su cuenta, su grupo, si es evaluado) no lo puede cambiar: lo
   para el disparador de abajo. */
drop policy if exists deportista_director_lee on public.deportista;
create policy deportista_director_lee on public.deportista for select to authenticated
  using (id in (select dep_ids_director()));
drop policy if exists deportista_director_edita on public.deportista;
create policy deportista_director_edita on public.deportista for update to authenticated
  using (id in (select dep_ids_director()))
  with check (id in (select dep_ids_director()));

/* La biblioteca de los entrenadores que dirige, para que las sesiones se lean
   con sus ejercicios y sus vídeos. Solo lectura. */
drop policy if exists eb_lee_director on public.ejercicios_biblioteca;
create policy eb_lee_director on public.ejercicios_biblioteca for select to authenticated
  using (id_entrenador in (select entrenadores_de_director())
         or id_deportista in (select dep_ids_director()));

/* Los objetivos de series del deportista abierto: es planificación. */
drop policy if exists os_director on public.objetivo_series;
create policy os_director on public.objetivo_series for all to authenticated
  using (id_deportista in (select dep_ids_director()))
  with check (id_deportista in (select dep_ids_director()));

create or replace function public.proteger_dueno_deportista()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.id_entrenador is distinct from old.id_entrenador
      or new.id_usuario is distinct from old.id_usuario
      or new.id_grupo is distinct from old.id_grupo
      or new.solo_test is distinct from old.solo_test)
     and auth.uid() is not null
     and auth.uid() is distinct from old.id_entrenador
     and auth.uid() is distinct from old.id_usuario
     and exists (select 1 from director_acceso a where a.id_director = auth.uid() and a.id_deportista = old.id) then
    raise exception 'Un director no puede cambiar de quién es un deportista';
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_dueno_deportista on public.deportista;
create trigger trg_proteger_dueno_deportista
  before update on public.deportista
  for each row execute function public.proteger_dueno_deportista();


/* ============================================================
   5. Los avisos
   ============================================================ */

/* Un hecho suelto (dar acceso, terminar...): cada uno es su propio aviso. */
create or replace function public._aviso_director_evento(
  _para uuid, _de uuid, _sobre uuid, _dep bigint, _tipo text, _que text)
returns void language sql security definer set search_path = public as $$
  insert into aviso_director (para, de, sobre, id_deportista, tipo, clave, cambios)
  select _para, _de, _sobre, _dep, _tipo, _tipo || ':' || gen_random_uuid(), array[_que]
   where _para is not null and exists (select 1 from perfiles where id = _para);
$$;

/* Un cambio: se suma al aviso sin leer de la misma clave, si lo hay. */
create or replace function public._aviso_director_cambio(
  _para uuid, _de uuid, _dep bigint, _tipo text, _clave text, _sesion bigint, _fecha date, _que text)
returns void language sql security definer set search_path = public as $$
  insert into aviso_director as a (para, de, id_deportista, tipo, clave, id_sesion, fecha, cambios)
  select _para, _de, _dep, _tipo, _clave, _sesion, _fecha, array[_que]
   where _para is not null and exists (select 1 from perfiles where id = _para)
  on conflict (para, clave) where leido_en is null do update
     set cambios        = case when excluded.cambios[1] = any(a.cambios) then a.cambios
                               else a.cambios || excluded.cambios end,
         fecha          = coalesce(excluded.fecha, a.fecha),
         actualizado_en = now();
$$;

/* El disparador de los cambios. Va en cada tabla que un director puede tocar
   (ver la sección 6) con dos argumentos: el tipo de aviso y si le llega
   también al deportista.

   PARA QUIEN NO ES DIRECTOR CUESTA UNA CONSULTA POR ÍNDICE y se va: un
   entrenador volcando un grupo o un deportista apuntando series pasan por
   aquí y salen en la tercera línea. */
create or replace function public.registrar_cambio_director()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _yo      uuid := auth.uid();
  _tipo    text := tg_argv[0];
  _al_dep  boolean := coalesce(tg_argv[1], 'false')::boolean;
  _nueva   jsonb;
  _vieja   jsonb;
  _fila    jsonb;
  _dep     bigint;
  _coach   uuid;
  _usuario uuid;
  _sesion  bigint;
  _fecha   date;
  _que     text;
  _clave   text;
begin
  /* Lo que escribe este mismo disparador (marcar la sesión) no es otro cambio. */
  if pg_trigger_depth() > 1 then return null; end if;
  /* Sin usuario (servicio, sincronización de relojes): no es un director. */
  if _yo is null then return null; end if;
  if not exists (select 1 from director_acceso where id_director = _yo and estado = 'concedido') then
    return null;
  end if;

  if tg_op <> 'DELETE' then _nueva := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then _vieja := to_jsonb(old); end if;
  if tg_op = 'UPDATE' and _nueva = _vieja then return null; end if;
  _fila := coalesce(_nueva, _vieja);

  _dep := case when tg_table_name = 'deportista' then (_fila->>'id')::bigint
               else (_fila->>'id_deportista')::bigint end;
  if _dep is null or _dep not in (select dep_ids_director()) then return null; end if;

  select d.id_entrenador, d.id_usuario into _coach, _usuario from deportista d where d.id = _dep;
  if _coach is null or _coach = _yo or coalesce(_usuario = _yo, false) then return null; end if;

  if _tipo = 'sesion' then
    if tg_table_name = 'sesion' then
      _sesion := (_fila->>'id')::bigint;
      _fecha  := (_fila->>'fecha_sesion')::date;
      _que := case
        when tg_op = 'INSERT' then 'nueva'
        when tg_op = 'DELETE' then 'borrada'
        when coalesce((_nueva->>'eliminada')::boolean, false)
             and not coalesce((_vieja->>'eliminada')::boolean, false) then 'borrada'
        when coalesce((_vieja->>'eliminada')::boolean, false)
             and not coalesce((_nueva->>'eliminada')::boolean, false) then 'recuperada'
        when (_nueva->>'fecha_sesion') is distinct from (_vieja->>'fecha_sesion') then 'movida'
        when (_nueva->>'estado') is distinct from (_vieja->>'estado') then 'estado'
        else 'datos' end;
    else
      if tg_table_name = 'tarea' then
        _sesion := (_fila->>'id_sesion')::bigint;
      elsif tg_table_name = 'series_realizadas' then
        select t.id_sesion into _sesion from tarea t
         where t.id = coalesce((_fila->>'id_tarea')::bigint,
                               (select e.id_tarea from ejercicios e where e.id = (_fila->>'id_ejercicio')::bigint));
      else
        select t.id_sesion into _sesion from tarea t where t.id = (_fila->>'id_tarea')::bigint;
      end if;
      select s.fecha_sesion into _fecha from sesion s where s.id = _sesion;
      _que := case tg_table_name
        when 'ejercicios' then 'ejercicios'
        when 'series_realizadas' then 'lo_que_hizo'
        else 'bloques' end;
    end if;
    _clave := 'sesion:' || coalesce(_sesion::text, 'sin') || ':' || _yo;
  elsif _tipo = 'test' then
    _fecha := (_fila->>'fecha')::date;
    _que := case tg_op when 'INSERT' then 'nuevo' when 'DELETE' then 'borrado' else 'corregido' end;
    _clave := 'test:' || tg_table_name || ':' || coalesce(_fila->>'id', 'sin') || ':' || _yo;
  else
    _fecha := coalesce((_fila->>'fecha')::date, (_fila->>'fecha_inicio')::date);
    _que := tg_table_name;
    _clave := _tipo || ':' || _dep || ':' || _yo;
  end if;

  perform _aviso_director_cambio(_coach, _yo, _dep, _tipo, _clave, _sesion, _fecha, _que);
  if _al_dep and _usuario is not null then
    perform _aviso_director_cambio(_usuario, _yo, _dep, _tipo, _clave, _sesion, _fecha, _que);
  end if;

  /* La sesión queda marcada con quién la cambió. Una vez por transacción: una
     sesión guardada con veinte filas hijas no se reescribe veinte veces. */
  if _sesion is not null and not (tg_table_name = 'sesion' and tg_op = 'DELETE') then
    update sesion set cambiada_por = _yo, cambiada_en = now()
     where id = _sesion
       and (cambiada_por is distinct from _yo or cambiada_en is null or cambiada_en < now());
  end if;
  return null;
end $$;


/* ============================================================
   6. Dónde va el disparador (tabla, tipo de aviso, ¿al deportista?)
   ============================================================
   Fuera a propósito: mensajes (el director no llega), dibujo_borrador (se
   autoguarda; lo que ve el deportista son las sesiones que salen de él),
   disponibilidad y los relojes (los escribe el deportista o el servicio). */

drop trigger if exists trg_cambio_director on public.sesion;
create trigger trg_cambio_director after insert or update or delete on public.sesion
  for each row execute function public.registrar_cambio_director('sesion', 'true');
drop trigger if exists trg_cambio_director on public.tarea;
create trigger trg_cambio_director after insert or update or delete on public.tarea
  for each row execute function public.registrar_cambio_director('sesion', 'true');
drop trigger if exists trg_cambio_director on public.p_distancia;
create trigger trg_cambio_director after insert or update or delete on public.p_distancia
  for each row execute function public.registrar_cambio_director('sesion', 'true');
drop trigger if exists trg_cambio_director on public.p_duracion;
create trigger trg_cambio_director after insert or update or delete on public.p_duracion
  for each row execute function public.registrar_cambio_director('sesion', 'true');
drop trigger if exists trg_cambio_director on public.p_repeticiones;
create trigger trg_cambio_director after insert or update or delete on public.p_repeticiones
  for each row execute function public.registrar_cambio_director('sesion', 'true');
drop trigger if exists trg_cambio_director on public.ejercicios;
create trigger trg_cambio_director after insert or update or delete on public.ejercicios
  for each row execute function public.registrar_cambio_director('sesion', 'true');
drop trigger if exists trg_cambio_director on public.series_realizadas;
create trigger trg_cambio_director after insert or update or delete on public.series_realizadas
  for each row execute function public.registrar_cambio_director('sesion', 'true');

drop trigger if exists trg_cambio_director on public.macrociclo;
create trigger trg_cambio_director after insert or update or delete on public.macrociclo
  for each row execute function public.registrar_cambio_director('plan', 'false');
drop trigger if exists trg_cambio_director on public.mesociclo;
create trigger trg_cambio_director after insert or update or delete on public.mesociclo
  for each row execute function public.registrar_cambio_director('plan', 'false');
drop trigger if exists trg_cambio_director on public.microciclo;
create trigger trg_cambio_director after insert or update or delete on public.microciclo
  for each row execute function public.registrar_cambio_director('plan', 'false');
drop trigger if exists trg_cambio_director on public.semana_bloqueada;
create trigger trg_cambio_director after insert or update or delete on public.semana_bloqueada
  for each row execute function public.registrar_cambio_director('plan', 'false');
drop trigger if exists trg_cambio_director on public.objetivo_series;
create trigger trg_cambio_director after insert or update or delete on public.objetivo_series
  for each row execute function public.registrar_cambio_director('plan', 'false');
drop trigger if exists trg_cambio_director on public.competicion;
create trigger trg_cambio_director after insert or update or delete on public.competicion
  for each row execute function public.registrar_cambio_director('plan', 'true');

drop trigger if exists trg_cambio_director on public.test1_carrera;
create trigger trg_cambio_director after insert or update or delete on public.test1_carrera
  for each row execute function public.registrar_cambio_director('test', 'true');
drop trigger if exists trg_cambio_director on public.test2_natacion;
create trigger trg_cambio_director after insert or update or delete on public.test2_natacion
  for each row execute function public.registrar_cambio_director('test', 'true');
drop trigger if exists trg_cambio_director on public.test3_ciclismo;
create trigger trg_cambio_director after insert or update or delete on public.test3_ciclismo
  for each row execute function public.registrar_cambio_director('test', 'true');
drop trigger if exists trg_cambio_director on public.test_campo;
create trigger trg_cambio_director after insert or update or delete on public.test_campo
  for each row execute function public.registrar_cambio_director('test', 'true');
drop trigger if exists trg_cambio_director on public.test_fuerza;
create trigger trg_cambio_director after insert or update or delete on public.test_fuerza
  for each row execute function public.registrar_cambio_director('test', 'true');
drop trigger if exists trg_cambio_director on public.tests_libres;
create trigger trg_cambio_director after insert or update or delete on public.tests_libres
  for each row execute function public.registrar_cambio_director('test', 'true');
drop trigger if exists trg_cambio_director on public.test_medicion;
create trigger trg_cambio_director after insert or update or delete on public.test_medicion
  for each row execute function public.registrar_cambio_director('test', 'true');

drop trigger if exists trg_cambio_director on public.zonas_entrenamiento;
create trigger trg_cambio_director after insert or update or delete on public.zonas_entrenamiento
  for each row execute function public.registrar_cambio_director('zonas', 'true');

drop trigger if exists trg_cambio_director on public.deportista;
create trigger trg_cambio_director after update on public.deportista
  for each row execute function public.registrar_cambio_director('ficha', 'true');
drop trigger if exists trg_cambio_director on public.valoracion_tecnica_mesociclo;
create trigger trg_cambio_director after insert or update or delete on public.valoracion_tecnica_mesociclo
  for each row execute function public.registrar_cambio_director('ficha', 'false');

drop trigger if exists trg_cambio_director on public.anamnesis;
create trigger trg_cambio_director after insert or update or delete on public.anamnesis
  for each row execute function public.registrar_cambio_director('salud', 'true');
drop trigger if exists trg_cambio_director on public.wellness;
create trigger trg_cambio_director after insert or update or delete on public.wellness
  for each row execute function public.registrar_cambio_director('salud', 'true');
drop trigger if exists trg_cambio_director on public.registro_peso;
create trigger trg_cambio_director after insert or update or delete on public.registro_peso
  for each row execute function public.registrar_cambio_director('salud', 'true');


/* ============================================================
   7. Lo que usa el DIRECTOR
   ============================================================ */

/* Sus entrenadores: la última relación con cada uno, viva o no, para poder
   enseñar «ya no trabajáis juntos». Las cifras solo con la relación activa. */
create or replace function public.director_mis_entrenadores()
returns table (id_vinculo bigint, id_entrenador uuid, nombre text, estado text, origen text,
               creado_en timestamptz, n_deportistas int, n_con_acceso int, n_pedidos int)
language sql stable security definer set search_path = public as $$
  select v.id, v.id_entrenador, p.nombre, v.estado, v.origen, v.creado_en,
         case when v.estado = 'activo' then
           (select count(*)::int from deportista d
             where d.id_entrenador = v.id_entrenador and d.id_grupo is null and d.solo_test = false) end,
         case when v.estado = 'activo' then
           (select count(*)::int from director_acceso a join deportista d on d.id = a.id_deportista
             where a.id_director = v.id_director and d.id_entrenador = v.id_entrenador and a.estado = 'concedido') end,
         case when v.estado = 'activo' then
           (select count(*)::int from director_acceso a join deportista d on d.id = a.id_deportista
             where a.id_director = v.id_director and d.id_entrenador = v.id_entrenador and a.estado = 'pendiente') end
    from (select distinct on (x.id_entrenador) x.*
            from director_entrenador x
           where x.id_director = auth.uid()
           order by x.id_entrenador, x.id desc) v
    join perfiles p on p.id = v.id_entrenador
   where es_director(auth.uid())
   order by (v.estado = 'activo') desc, p.nombre;
$$;

create or replace function public.director_mis_invitaciones()
returns table (codigo text, nombre text, email text, creada_en timestamptz, caduca timestamptz)
language sql stable security definer set search_path = public as $$
  select i.codigo, i.nota, i.email, i.creada_en, i.caduca
    from invitacion i
   where i.id_director = auth.uid()
     and es_director(auth.uid())
     and not i.revocada and i.usos < i.usos_max
     and (i.caduca is null or i.caduca > now())
   order by i.creada_en desc;
$$;

/* Invitación para un entrenador NUEVO. Entra con cupo 0, como cualquier
   entrenador sin cupo: se lo pone la plataforma desde Cuentas. */
create or replace function public.director_invitar_entrenador(_nombre text, _email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  _cod    text;
  _correo text := lower(trim(coalesce(_email, '')));
begin
  if not es_director(auth.uid()) then
    raise exception 'Solo un director puede invitar entrenadores';
  end if;
  if coalesce(trim(_nombre), '') = '' then
    raise exception 'Falta el nombre';
  end if;
  if _correo !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Ese correo no parece un correo';
  end if;
  _cod := gen_codigo_invitacion();
  insert into invitacion (codigo, rol, email, id_entrenador, cupo_deportistas,
                          usos_max, caduca, nota, creada_por, id_director)
  values (_cod, 'entrenador', _correo, null, null,
          1, now() + interval '30 days', left(trim(_nombre), 80), auth.uid(), auth.uid());
  return _cod;
end $$;

/* Buscar a un entrenador que YA usa TRIPULSE, por su correo exacto. Por
   correo y no por nombre: un director no tiene por qué poder recorrer la
   lista de entrenadores de la plataforma. No dice con QUIÉN trabaja si ya
   tiene director, solo que lo tiene. */
create or replace function public.director_buscar_entrenador(_email text)
returns table (id uuid, nombre text, estado text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre,
         case
           when exists (select 1 from director_entrenador v
                         where v.id_entrenador = p.id and v.id_director = auth.uid() and v.estado = 'activo') then 'contigo'
           when exists (select 1 from director_entrenador v
                         where v.id_entrenador = p.id and v.id_director = auth.uid() and v.estado = 'pendiente') then 'pendiente'
           when exists (select 1 from director_entrenador v
                         where v.id_entrenador = p.id and v.estado in ('pendiente', 'activo')) then 'ocupado'
           else 'libre' end
    from perfiles p
   where es_director(auth.uid())
     and p.rol = 'entrenador'
     and p.id <> auth.uid()
     and length(trim(coalesce(_email, ''))) > 3
     and lower(p.email) = lower(trim(_email))
   limit 1;
$$;

create or replace function public.director_solicitar(_id_entrenador uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare _id bigint;
begin
  if not es_director(auth.uid()) then
    raise exception 'Solo un director puede pedir trabajar con un entrenador';
  end if;
  if _id_entrenador = auth.uid() then
    raise exception 'No puedes ser tu propio director';
  end if;
  if not exists (select 1 from perfiles where id = _id_entrenador and rol = 'entrenador') then
    raise exception 'Esa cuenta no es de un entrenador';
  end if;
  if exists (select 1 from director_entrenador
              where id_entrenador = _id_entrenador and estado in ('pendiente', 'activo')) then
    if exists (select 1 from director_entrenador
                where id_entrenador = _id_entrenador and id_director = auth.uid()
                  and estado in ('pendiente', 'activo')) then
      raise exception 'Ya trabajáis juntos, o la solicitud ya está enviada';
    end if;
    raise exception 'Ese entrenador ya trabaja con otro director';
  end if;
  insert into director_entrenador (id_director, id_entrenador)
  values (auth.uid(), _id_entrenador) returning id into _id;
  return _id;
end $$;

/* Terminar la relación, desde cualquiera de los dos lados. Si estaba
   activa, se borran los accesos (si un día vuelven, cada deportista se abre
   de nuevo) y se avisa a los deportistas que estaban abiertos. */
create or replace function public.director_terminar(_id_vinculo bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  _v   director_entrenador%rowtype;
  _yo  uuid := auth.uid();
  _r   record;
  _que text;
begin
  select * into _v from director_entrenador where id = _id_vinculo for update;
  if not found or _yo is null or _yo not in (_v.id_director, _v.id_entrenador) then
    raise exception 'No encontrado';
  end if;
  if _v.estado not in ('pendiente', 'activo') then return; end if;

  _que := case when _v.estado = 'activo' then 'terminado'
               when _yo = _v.id_entrenador then 'rechazado'
               else 'retirado' end;

  update director_entrenador
     set estado = case when _que = 'rechazado' then 'rechazado' else 'terminado' end,
         terminado_en = now(), terminado_por = _yo,
         respondido_en = coalesce(respondido_en, now())
   where id = _id_vinculo;

  if _v.estado = 'activo' then
    for _r in select a.id_deportista, a.estado, d.id_usuario
                from director_acceso a join deportista d on d.id = a.id_deportista
               where a.id_director = _v.id_director and d.id_entrenador = _v.id_entrenador loop
      if _r.estado = 'concedido' then
        perform _aviso_director_evento(_r.id_usuario, _yo, _v.id_director, _r.id_deportista, 'acceso', 'quitado');
      end if;
    end loop;
    delete from director_acceso a using deportista d
     where d.id = a.id_deportista and a.id_director = _v.id_director and d.id_entrenador = _v.id_entrenador;
  end if;

  perform _aviso_director_evento(
    case when _yo = _v.id_director then _v.id_entrenador else _v.id_director end,
    _yo, null, null, 'vinculo', _que);
end $$;

/* Los deportistas de un entrenador que dirige: SOLO el nombre y el estado del
   candado. Lo demás se ve, con el acceso dado, por las tablas de siempre. */
create or replace function public.director_roster(_id_entrenador uuid)
returns table (id_deportista bigint, nombre text, estado text, mensaje text)
language sql stable security definer set search_path = public as $$
  select d.id, d.nombre, coalesce(a.estado, 'sin_acceso'), a.mensaje
    from deportista d
    left join director_acceso a on a.id_deportista = d.id and a.id_director = auth.uid()
   where d.id_entrenador = _id_entrenador
     and d.id_grupo is null and d.solo_test = false
     and es_director(auth.uid())
     and exists (select 1 from director_entrenador v
                  where v.id_director = auth.uid() and v.id_entrenador = _id_entrenador and v.estado = 'activo')
   order by d.nombre;
$$;

create or replace function public.director_pedir_acceso(_id_deportista bigint, _mensaje text default null)
returns void language plpgsql security definer set search_path = public as $$
declare _coach uuid;
begin
  select id_entrenador into _coach from deportista
   where id = _id_deportista and id_grupo is null and solo_test = false;
  if _coach is null or not es_director(auth.uid())
     or not exists (select 1 from director_entrenador v
                     where v.id_director = auth.uid() and v.id_entrenador = _coach and v.estado = 'activo') then
    raise exception 'No trabajas con el entrenador de ese deportista';
  end if;
  insert into director_acceso as a (id_director, id_deportista, estado, mensaje, pedido_en)
  values (auth.uid(), _id_deportista, 'pendiente', nullif(left(trim(coalesce(_mensaje, '')), 300), ''), now())
  on conflict (id_director, id_deportista) do update
     set estado = 'pendiente', mensaje = excluded.mensaje, pedido_en = now(), respondido_en = null
   where a.estado <> 'concedido';
end $$;

create or replace function public.director_anular_peticion(_id_deportista bigint)
returns void language sql security definer set search_path = public as $$
  delete from director_acceso
   where id_director = auth.uid() and id_deportista = _id_deportista and estado = 'pendiente';
$$;


/* ============================================================
   8. Lo que usa el ENTRENADOR
   ============================================================ */

/* Su director (o la solicitud de uno). Una solicitud de alguien que ya no es
   director no se enseña. */
create or replace function public.entrenador_mis_directores()
returns table (id_vinculo bigint, id_director uuid, nombre text, estado text, origen text,
               creado_en timestamptz, con_marca boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.id_director, p.nombre, v.estado, v.origen, v.creado_en, es_director(v.id_director)
    from director_entrenador v
    join perfiles p on p.id = v.id_director
   where v.id_entrenador = auth.uid()
     and v.estado in ('pendiente', 'activo')
     and (v.estado = 'activo' or es_director(v.id_director))
   order by v.creado_en desc;
$$;

create or replace function public.entrenador_responder_vinculo(_id_vinculo bigint, _aceptar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _dir uuid;
begin
  update director_entrenador
     set estado = case when _aceptar then 'activo' else 'rechazado' end,
         respondido_en = now()
   where id = _id_vinculo and id_entrenador = auth.uid() and estado = 'pendiente'
  returning id_director into _dir;
  if _dir is null then
    raise exception 'Esa solicitud ya no está pendiente';
  end if;
  perform _aviso_director_evento(_dir, auth.uid(), null, null, 'vinculo',
                                 case when _aceptar then 'aceptado' else 'rechazado' end);
end $$;

create or replace function public.entrenador_accesos()
returns table (id_director uuid, nombre_director text, id_deportista bigint, nombre_deportista text,
               estado text, mensaje text, pedido_en timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id_director, p.nombre, a.id_deportista, d.nombre, a.estado, a.mensaje, a.pedido_en
    from director_acceso a
    join deportista d          on d.id = a.id_deportista
    join director_entrenador v on v.id_director = a.id_director
                              and v.id_entrenador = d.id_entrenador
                              and v.estado = 'activo'
    join perfiles p            on p.id = a.id_director
   where d.id_entrenador = auth.uid()
   order by d.nombre;
$$;

create or replace function public.entrenador_dar_acceso(_id_director uuid, _id_deportista bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  _usuario uuid;
  _antes   text;
begin
  select id_usuario into _usuario from deportista
   where id = _id_deportista and id_entrenador = auth.uid() and id_grupo is null and solo_test = false;
  if not found then
    raise exception 'Ese deportista no es tuyo';
  end if;
  if not exists (select 1 from director_entrenador
                  where id_director = _id_director and id_entrenador = auth.uid() and estado = 'activo') then
    raise exception 'No trabajas con ese director';
  end if;
  select estado into _antes from director_acceso
   where id_director = _id_director and id_deportista = _id_deportista;
  if _antes = 'concedido' then return; end if;

  insert into director_acceso as a (id_director, id_deportista, estado, pedido_en, respondido_en)
  values (_id_director, _id_deportista, 'concedido', now(), now())
  on conflict (id_director, id_deportista) do update set estado = 'concedido', respondido_en = now();

  perform _aviso_director_evento(_id_director, auth.uid(), null, _id_deportista, 'acceso', 'concedido');
  perform _aviso_director_evento(_usuario, auth.uid(), _id_director, _id_deportista, 'acceso', 'concedido');
end $$;

create or replace function public.entrenador_negar_acceso(_id_director uuid, _id_deportista bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update director_acceso a
     set estado = 'denegado', respondido_en = now()
    from deportista d
   where d.id = a.id_deportista and d.id_entrenador = auth.uid()
     and a.id_director = _id_director and a.id_deportista = _id_deportista and a.estado = 'pendiente';
  if found then
    perform _aviso_director_evento(_id_director, auth.uid(), null, _id_deportista, 'acceso', 'denegado');
  end if;
end $$;

create or replace function public.entrenador_quitar_acceso(_id_director uuid, _id_deportista bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  _antes   text;
  _usuario uuid;
begin
  select a.estado, d.id_usuario into _antes, _usuario
    from director_acceso a join deportista d on d.id = a.id_deportista
   where a.id_director = _id_director and a.id_deportista = _id_deportista and d.id_entrenador = auth.uid();
  if not found then return; end if;
  delete from director_acceso where id_director = _id_director and id_deportista = _id_deportista;
  if _antes = 'concedido' then
    perform _aviso_director_evento(_id_director, auth.uid(), null, _id_deportista, 'acceso', 'quitado');
    perform _aviso_director_evento(_usuario, auth.uid(), _id_director, _id_deportista, 'acceso', 'quitado');
  end if;
end $$;


/* ============================================================
   9. Lo que usa el DEPORTISTA, los avisos y los nombres
   ============================================================ */

/* «Quién puede ver tu plan»: su entrenador y los directores con acceso. */
create or replace function public.quien_ve_mi_plan()
returns table (id_perfil uuid, nombre text, papel text, desde timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, 'entrenador'::text, null::timestamptz
    from deportista d join perfiles p on p.id = d.id_entrenador
   where d.id_usuario = auth.uid()
  union all
  select p.id, p.nombre, 'director'::text, a.respondido_en
    from deportista d
    join director_acceso a     on a.id_deportista = d.id and a.estado = 'concedido'
    join director r            on r.id_perfil = a.id_director
    join director_entrenador v on v.id_director = a.id_director
                              and v.id_entrenador = d.id_entrenador
                              and v.estado = 'activo'
    join perfiles p            on p.id = a.id_director
   where d.id_usuario = auth.uid()
     and d.id_grupo is null and d.solo_test = false;
$$;

/* El nombre de quien cambió una sesión, para la etiqueta «cambiada por».
   Solo de sesiones que quien pregunta puede ver. */
create or replace function public.nombres_cambiada_por(_ids uuid[])
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre
    from perfiles p
   where p.id = any(_ids)
     and exists (select 1 from sesion s
                  where s.cambiada_por = p.id
                    and s.id_deportista in (select auth_dep_ids()));
$$;

create or replace function public.mis_avisos_director(_solo_sin_leer boolean default false, _limite int default 50)
returns table (id bigint, tipo text, de uuid, de_nombre text, sobre uuid, sobre_nombre text,
               id_deportista bigint, deportista_nombre text, id_sesion bigint, fecha date,
               cambios text[], creado_en timestamptz, actualizado_en timestamptz, leido_en timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.tipo, a.de, pd.nombre, a.sobre, ps.nombre, a.id_deportista, d.nombre,
         a.id_sesion, a.fecha, a.cambios, a.creado_en, a.actualizado_en, a.leido_en
    from aviso_director a
    left join perfiles pd  on pd.id = a.de
    left join perfiles ps  on ps.id = a.sobre
    left join deportista d on d.id = a.id_deportista
   where a.para = auth.uid()
     and (not coalesce(_solo_sin_leer, false) or a.leido_en is null)
   order by a.actualizado_en desc
   limit greatest(1, least(coalesce(_limite, 50), 200));
$$;

/* Sin lista: todos los suyos sin leer (el botón «Entendido»). */
create or replace function public.marcar_avisos_director_leidos(_ids bigint[] default null)
returns int language sql security definer set search_path = public as $$
  with hechos as (
    update aviso_director set leido_en = now()
     where para = auth.uid() and leido_en is null and (_ids is null or id = any(_ids))
    returning 1)
  select count(*)::int from hechos;
$$;


/* ============================================================
   10. Lo que usa la PLATAFORMA
   ============================================================ */

create or replace function public.admin_directores()
returns table (id_perfil uuid, desde timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma';
  end if;
  return query select d.id_perfil, d.desde from director d;
end $$;

/* Quitar la marca no borra las relaciones: se quedan en pausa (el acceso
   exige la marca) por si se vuelve a poner. */
create or replace function public.admin_poner_director(_id uuid, _si boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_plataforma(auth.uid()) then
    raise exception 'Solo la plataforma pone o quita directores';
  end if;
  if _si then
    if not exists (select 1 from perfiles where id = _id and rol = 'entrenador') then
      raise exception 'Solo un entrenador puede ser director';
    end if;
    insert into director (id_perfil, puesto_por) values (_id, auth.uid())
    on conflict (id_perfil) do nothing;
  else
    delete from director where id_perfil = _id;
  end if;
end $$;


/* ============================================================
   11. El alta con la invitación de un director
   ============================================================
   registrar_con_invitacion() queda IGUAL que estaba salvo un bloque, marcado
   abajo: si la invitación de entrenador la creó un director que sigue
   siéndolo, el nuevo entrenador queda trabajando con él. Registrarse con su
   código es aceptarlo: la invitación lo dice. */
create or replace function public.registrar_con_invitacion(_codigo text, _nombre text, _acepto_terminos boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth' as $function$
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

  /* ===== NUEVO (director-1-base): la invitación de un director ===== */
  if _inv.rol = 'entrenador' and _inv.id_director is not null and es_director(_inv.id_director) then
    insert into director_entrenador (id_director, id_entrenador, estado, origen, respondido_en)
    values (_inv.id_director, _uid, 'activo', 'invitacion', now());
    perform _aviso_director_evento(_inv.id_director, _uid, null, null, 'vinculo', 'alta');
  end if;
  /* ===== fin de lo nuevo ===== */

  update invitacion set usos = usos + 1 where codigo = _inv.codigo;
  insert into invitacion_uso (codigo, id_perfil) values (_inv.codigo, _uid);

  return jsonb_build_object('ok', true, 'rol', _inv.rol);
end $function$;


/* ============================================================
   12. Permisos de las funciones
   ============================================================
   Una función nueva nace abierta a anon: se cierra al crearla. Las internas
   y los disparadores, a nadie (un disparador se ejecuta sin mirar EXECUTE).
   auth_dep_ids y registrar_con_invitacion conservan los permisos que tenían:
   create or replace no los toca. */

revoke all on function public.es_director(uuid) from public, anon, authenticated;
revoke all on function public._aviso_director_evento(uuid, uuid, uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public._aviso_director_cambio(uuid, uuid, bigint, text, text, bigint, date, text) from public, anon, authenticated;
revoke all on function public.registrar_cambio_director() from public, anon, authenticated;
revoke all on function public.proteger_dueno_deportista() from public, anon, authenticated;

revoke all on function public.soy_director() from public, anon;
revoke all on function public.dep_ids_director() from public, anon;
revoke all on function public.entrenadores_de_director() from public, anon;
revoke all on function public.auth_dep_ids_sin_director() from public, anon;
revoke all on function public.director_mis_entrenadores() from public, anon;
revoke all on function public.director_mis_invitaciones() from public, anon;
revoke all on function public.director_invitar_entrenador(text, text) from public, anon;
revoke all on function public.director_buscar_entrenador(text) from public, anon;
revoke all on function public.director_solicitar(uuid) from public, anon;
revoke all on function public.director_terminar(bigint) from public, anon;
revoke all on function public.director_roster(uuid) from public, anon;
revoke all on function public.director_pedir_acceso(bigint, text) from public, anon;
revoke all on function public.director_anular_peticion(bigint) from public, anon;
revoke all on function public.entrenador_mis_directores() from public, anon;
revoke all on function public.entrenador_responder_vinculo(bigint, boolean) from public, anon;
revoke all on function public.entrenador_accesos() from public, anon;
revoke all on function public.entrenador_dar_acceso(uuid, bigint) from public, anon;
revoke all on function public.entrenador_negar_acceso(uuid, bigint) from public, anon;
revoke all on function public.entrenador_quitar_acceso(uuid, bigint) from public, anon;
revoke all on function public.quien_ve_mi_plan() from public, anon;
revoke all on function public.nombres_cambiada_por(uuid[]) from public, anon;
revoke all on function public.mis_avisos_director(boolean, int) from public, anon;
revoke all on function public.marcar_avisos_director_leidos(bigint[]) from public, anon;
revoke all on function public.admin_directores() from public, anon;
revoke all on function public.admin_poner_director(uuid, boolean) from public, anon;

grant execute on function public.soy_director() to authenticated;
grant execute on function public.dep_ids_director() to authenticated;
grant execute on function public.entrenadores_de_director() to authenticated;
grant execute on function public.auth_dep_ids_sin_director() to authenticated;
grant execute on function public.director_mis_entrenadores() to authenticated;
grant execute on function public.director_mis_invitaciones() to authenticated;
grant execute on function public.director_invitar_entrenador(text, text) to authenticated;
grant execute on function public.director_buscar_entrenador(text) to authenticated;
grant execute on function public.director_solicitar(uuid) to authenticated;
grant execute on function public.director_terminar(bigint) to authenticated;
grant execute on function public.director_roster(uuid) to authenticated;
grant execute on function public.director_pedir_acceso(bigint, text) to authenticated;
grant execute on function public.director_anular_peticion(bigint) to authenticated;
grant execute on function public.entrenador_mis_directores() to authenticated;
grant execute on function public.entrenador_responder_vinculo(bigint, boolean) to authenticated;
grant execute on function public.entrenador_accesos() to authenticated;
grant execute on function public.entrenador_dar_acceso(uuid, bigint) to authenticated;
grant execute on function public.entrenador_negar_acceso(uuid, bigint) to authenticated;
grant execute on function public.entrenador_quitar_acceso(uuid, bigint) to authenticated;
grant execute on function public.quien_ve_mi_plan() to authenticated;
grant execute on function public.nombres_cambiada_por(uuid[]) to authenticated;
grant execute on function public.mis_avisos_director(boolean, int) to authenticated;
grant execute on function public.marcar_avisos_director_leidos(bigint[]) to authenticated;
grant execute on function public.admin_directores() to authenticated;
grant execute on function public.admin_poner_director(uuid, boolean) to authenticated;
