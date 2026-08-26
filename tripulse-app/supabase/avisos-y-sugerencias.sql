/* ============================================================
   Dos cosas para hablar con quien usa la app
   ============================================================
   1. SUGERENCIAS Y ERRORES. Un sitio donde la gente cuenta lo que falla o lo
      que echa de menos, sin salir de la app ni buscarte el WhatsApp.

   2. AVISO DE MANTENIMIENTO. Un mensaje programado para decir «el jueves de
      23:00 a 23:30 esto estará caído», visible en toda la app.
   ============================================================ */

/* ============================================================
   1. Sugerencias y errores
   ============================================================
   SE GUARDA LA PANTALLA, NO SOLO EL TEXTO.
   «No me funciona» sin saber dónde estaba la persona no sirve de nada, y pedirle
   que lo explique es pedirle un trabajo que la app puede hacer sola. La ruta y
   el navegador se rellenan solos.

   NO SE PUEDE EDITAR NI BORRAR LO ENVIADO.
   Ni por quien lo escribe. Un buzón donde el remitente puede reescribir lo que
   dijo no es un buzón. Y quien lo lee no debería encontrarse mensajes que
   cambian solos entre una lectura y otra. */
create table if not exists sugerencia (
  id          bigint generated always as identity primary key,
  id_perfil   uuid references perfiles(id) on delete set null,
  tipo        text not null check (tipo in ('error', 'sugerencia')),
  texto       text not null check (length(trim(texto)) >= 10),
  /* De dónde venía. Lo pone la app, no la persona. */
  pantalla    text,
  agente      text,
  estado      text not null default 'nueva' check (estado in ('nueva', 'vista', 'resuelta')),
  creada_en   timestamptz not null default now()
);

comment on table sugerencia is
  'Errores y sugerencias que manda la gente desde la app. La pantalla se guarda sola.';

create index if not exists sugerencia_estado_idx on sugerencia (estado, creada_en desc);

alter table sugerencia enable row level security;

drop policy if exists sug_escribe on sugerencia;
drop policy if exists sug_lee_propias on sugerencia;
drop policy if exists sug_lee_plataforma on sugerencia;

/* Cualquiera con sesión puede mandar UNA SUYA. El `with check` ata el remitente
   a quien de verdad está dentro: nadie manda un mensaje firmado por otro. */
create policy sug_escribe on sugerencia for insert
  with check (id_perfil = auth.uid());

/* Cada uno ve las que mandó, para saber que llegaron. */
create policy sug_lee_propias on sugerencia for select
  using (id_perfil = auth.uid());

/* La plataforma las ve todas y las marca como vistas o resueltas. */
create policy sug_lee_plataforma on sugerencia for all
  using (es_admin_plataforma(auth.uid()))
  with check (es_admin_plataforma(auth.uid()));

/* ============================================================
   2. El aviso de mantenimiento
   ============================================================
   Una fila por aviso; el que manda es el que aún no ha caducado. Se guarda el
   histórico en vez de machacar una fila única porque así se puede mirar qué se
   anunció y cuándo, que es justo lo que se pregunta después de una caída. */
create table if not exists aviso_app (
  id        bigint generated always as identity primary key,
  mensaje   text not null check (length(trim(mensaje)) >= 5),
  desde     timestamptz not null,
  hasta     timestamptz not null,
  creado_en timestamptz not null default now(),
  check (hasta > desde)
);

comment on table aviso_app is
  'Avisos de mantenimiento programados. Vale el que todavia no ha caducado.';

create index if not exists aviso_app_hasta_idx on aviso_app (hasta desc);

alter table aviso_app enable row level security;

drop policy if exists aviso_lee on aviso_app;
drop policy if exists aviso_escribe on aviso_app;

/* Lo lee todo el mundo, con sesión o sin ella: el aviso tiene que verse también
   en la pantalla de entrar, que es donde se choca cuando la app está caída. */
create policy aviso_lee on aviso_app for select using (true);

/* Lo escribe solo la plataforma. */
create policy aviso_escribe on aviso_app for all
  using (es_admin_plataforma(auth.uid()))
  with check (es_admin_plataforma(auth.uid()));

notify pgrst, 'reload schema';
