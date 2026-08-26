/* ============================================================
   Un tope a las llamadas que cuestan dinero
   ============================================================
   Las cuatro rutas de /api/ comprueban bien QUIÉN llama: sin token, 401; token
   inválido, 401; rol que no toca, 403. Lo que no había era ningún tope a
   CUÁNTAS veces. Un entrenador con cuenta válida puede disparar
   /api/plan/generar en bucle, y cada llamada genera una semana entera con el
   modelo, la juzga y reintenta si no pasa. No es un robo de datos: es tu
   factura de Anthropic.

   POR QUÉ LA CUENTA VA EN LA BASE Y NO EN EL SERVIDOR
   Vercel arranca y apaga funciones sin avisar, así que un contador en memoria
   se pierde entre llamada y llamada y encima cada instancia llevaría el suyo.
   Un contador que se reinicia solo no es un tope, es un adorno.

   POR QUÉ UNA FUNCIÓN Y NO UN INSERT DESDE LA APP
   Porque contar y comprobar tienen que pasar a la vez. Si se leyera el
   contador, se decidiera y luego se escribiera, dos llamadas simultáneas leen
   el mismo número y pasan las dos. El `on conflict do update` de aquí dentro
   incrementa y devuelve el valor nuevo en una sola operación.

   LA VENTANA ES LA HORA EN CURSO, NO LAS ÚLTIMAS 60 MINUTOS
   Una ventana deslizante obliga a guardar cada llamada por separado. Con la
   hora en curso basta una fila por usuario, ruta y hora. Se paga con que justo
   al cambiar de hora se puede gastar el doble en dos minutos; para lo que esto
   protege, sobra.
   ============================================================ */

create table if not exists cuota_api (
  id_perfil uuid        not null references perfiles(id) on delete cascade,
  ruta      text        not null,
  hora      timestamptz not null,
  usos      int         not null default 0,
  primary key (id_perfil, ruta, hora)
);

comment on table cuota_api is
  'Cuántas veces ha llamado cada usuario a cada ruta de API en la hora en curso.';

/* RLS activada y sin políticas: nadie la toca desde la app. Solo la función de
   abajo, que es SECURITY DEFINER. Si el propio usuario pudiera escribir aquí,
   podría ponerse el contador a cero y el tope no valdría nada. */
alter table cuota_api enable row level security;

/* Las filas de horas pasadas no sirven para nada. El índice permite barrerlas
   de vez en cuando sin recorrer la tabla entera. */
create index if not exists cuota_api_hora_idx on cuota_api (hora);

/* ============================================================
   Consumir una llamada
   ============================================================
   Devuelve jsonb en vez de un booleano para que la ruta pueda decirle a la
   persona cuánto le queda y cuándo se le renueva, en lugar de un «no» a secas. */
create or replace function public.consumir_cuota(_ruta text, _max int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _uid   uuid := auth.uid();
  _hora  timestamptz := date_trunc('hour', now());
  _usos  int;
begin
  if _uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin sesion');
  end if;

  insert into cuota_api (id_perfil, ruta, hora, usos)
  values (_uid, _ruta, _hora, 1)
  on conflict (id_perfil, ruta, hora)
    do update set usos = cuota_api.usos + 1
  returning usos into _usos;

  return jsonb_build_object(
    'ok',      _usos <= _max,
    'usos',    _usos,
    'max',     _max,
    'renueva', _hora + interval '1 hour'
  );
end $$;

comment on function public.consumir_cuota is
  'Suma una llamada del usuario actual a esa ruta en la hora en curso y dice si se paso del tope.';

/* ============================================================
   Barrido de lo viejo
   ============================================================
   Sin esto la tabla crece para siempre. Se puede llamar desde un cron de
   Supabase una vez al día, o dejarlo y borrar a mano de vez en cuando: son
   filas diminutas. */
create or replace function public.limpiar_cuota_api()
returns int language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  delete from cuota_api where hora < now() - interval '2 days';
  get diagnostics _n = row_count;
  return _n;
end $$;

notify pgrst, 'reload schema';
