/* ===============================================================
   Lo que cada persona ha visto del tutorial guiado
   =============================================================== */

/* El tutorial sale solo la primera vez que alguien entra en cada parte de la
   app. Para saber que ya lo vio hay que guardarlo, y por persona, no por
   navegador: quien lo ve en el ordenador no tiene que volver a verlo en el
   movil.

   UNA FILA POR COSA RECORDADA (clave), no una fila por persona con listas:
   cada marca se escribe sola con un upsert, y dos pestanas abiertas no se
   pisan la una a la otra.

   Las claves:
   - una zona del recorrido ('panel', 'deportistas'...): 'visto' o 'saltado'.
   - '_pausa' con 'pausado': dijo «Ahora no» y no quiere recorridos que salgan
     solos. Los sigue teniendo con el boton ? y en Tutoriales.
   - '_oferta' con 'aceptada' o 'rechazada': lo que contesto el entrenador que
     ya usaba la app a la tarjeta que se lo ofrece.

   Solo la ve y la toca su dueno. Se borra sola con la cuenta. */

create table if not exists public.tutorial_progreso (
  id_usuario uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clave text not null check (char_length(clave) between 1 and 40),
  estado text not null check (estado in ('visto', 'saltado', 'pausado', 'aceptada', 'rechazada')),
  actualizado timestamptz not null default now(),
  primary key (id_usuario, clave)
);

comment on table public.tutorial_progreso is
  'Lo que cada persona ha visto del tutorial guiado: una fila por zona (visto o saltado), mas _pausa y _oferta. Solo la lee y la escribe su dueno.';

alter table public.tutorial_progreso enable row level security;

create policy tutorial_progreso_solo_suyo on public.tutorial_progreso for all
  to authenticated
  using (id_usuario = (select auth.uid()))
  with check (id_usuario = (select auth.uid()));

/* Los privilegios por defecto de Supabase se la dan tambien a anon: fuera. */
revoke all on public.tutorial_progreso from anon;
