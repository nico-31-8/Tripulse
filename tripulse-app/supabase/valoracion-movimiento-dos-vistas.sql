/* ============================================================
   Las pruebas de movimiento que se miran desde dos cámaras
   ============================================================

   (22-10-2026) Seis de las dieciséis pruebas del FMS y del Nine Test se miran
   desde dos vistas: de perfil y de frente, y la elevación diagonal, desde atrás
   y de perfil. Cada fila de valoracion_prueba es una prueba y un lado, y hasta
   ahora guardaba UN fotograma (vista, fotograma, medidas, dibujo). El de la otra
   vista va en esta columna, con la misma forma, y con si los dos fotogramas son
   de la misma repetición (misma_repeticion: los dos vídeos alineados).

   Quién ve y quién escribe no cambia: son las reglas de la fila. El almacén
   tampoco: mira solo la primera carpeta (el deportista), así que la ruta
   {deportista}/{valoración}/{prueba}-{lado}-{vista}.jpg entra igual.

   Ensayada el 22-10-2026 en una transacción deshecha: el entrenador guarda las
   dos vistas, la base rechaza las formas malas (la misma vista que la principal,
   sin vista, una vista inventada, misma_repeticion que no es sí o no), y el
   deportista ve su fila pero no la cambia. */

alter table public.valoracion_prueba add column if not exists segunda_vista jsonb;

alter table public.valoracion_prueba drop constraint if exists valoracion_prueba_segunda_vista_check;
alter table public.valoracion_prueba add constraint valoracion_prueba_segunda_vista_check check (
  segunda_vista is null or (
    jsonb_typeof(segunda_vista) = 'object'
    and coalesce(segunda_vista->>'vista', '') in ('perfil', 'frente', 'espalda', 'atras', 'arriba')
    and (vista is null or segunda_vista->>'vista' <> vista)
    and coalesce(jsonb_typeof(segunda_vista->'fotograma'), 'null') in ('string', 'null')
    and coalesce(jsonb_typeof(segunda_vista->'medidas'), 'null') in ('array', 'null')
    and coalesce(jsonb_typeof(segunda_vista->'dibujo'), 'null') in ('array', 'null')
    and coalesce(jsonb_typeof(segunda_vista->'misma_repeticion'), 'boolean') = 'boolean'
  )
);

comment on column public.valoracion_prueba.segunda_vista is
  'Las pruebas que se miran desde dos camaras: el fotograma de la otra vista (vista, fotograma, medidas, dibujo) y si los dos son de la misma repeticion (misma_repeticion).';
