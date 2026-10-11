/* ============================================================
   Director de entrenadores · 3 · tests, zonas y plantillas compartidos
   ============================================================
   Un director y cada entrenador con el que trabaja se comparten, EN LOS DOS
   SENTIDOS, sus tests propios (laboratorio), sus zonas propias y sus
   plantillas de sesión. Así el director puede pasarle un test suyo a un
   deportista del entrenador (o uno del entrenador) y los dos ven cómo avanza.

   USAR, NO CAMBIAR. Lo que se abre es la LECTURA de la definición (para verla,
   prescribir con ella o aplicarla) y MEDIR con un test compartido a un
   deportista al que ya se tiene acceso. Editar, archivar o borrar sigue siendo
   solo de quien lo creó: las políticas de escritura de siempre no se tocan.

   QUIÉNES SON «SOCIOS»: un director y los entrenadores con relación ACTIVA y
   con la marca de director puesta (si la plataforma la quita, deja de
   compartirse). No entre dos entrenadores del mismo director.

   PARA TODOS LOS DEMÁS NO CAMBIA NADA: sin relación, socios_de_direccion()
   sale vacía y las políticas nuevas no dejan pasar nada.
   ============================================================ */

set local lock_timeout = '5s';

/* Los socios de quien llama: los entrenadores que dirige y su director. */
create or replace function public.socios_de_direccion()
returns setof uuid language sql stable security definer set search_path = public as $$
  select v.id_entrenador
    from director_entrenador v
    join director r on r.id_perfil = v.id_director
   where v.id_director = auth.uid() and v.estado = 'activo'
  union
  select v.id_director
    from director_entrenador v
    join director r on r.id_perfil = v.id_director
   where v.id_entrenador = auth.uid() and v.estado = 'activo'
$$;

/* Lo mismo con nombre y papel, para que la pantalla ponga «de Pedro». */
create or replace function public.mis_socios_de_direccion()
returns table (id uuid, nombre text, papel text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, 'entrenador'::text
    from director_entrenador v
    join director r on r.id_perfil = v.id_director
    join perfiles p on p.id = v.id_entrenador
   where v.id_director = auth.uid() and v.estado = 'activo'
  union all
  select p.id, p.nombre, 'director'::text
    from director_entrenador v
    join director r on r.id_perfil = v.id_director
    join perfiles p on p.id = v.id_director
   where v.id_entrenador = auth.uid() and v.estado = 'activo'
$$;

/* Los tests de los socios. Va aparte (y como definer) para que la política de
   las mediciones no tenga que leer test_definicion a través de sus propias
   políticas. */
create or replace function public.def_ids_de_socios()
returns setof bigint language sql stable security definer set search_path = public as $$
  select d.id from test_definicion d where d.id_entrenador in (select socios_de_direccion())
$$;

/* ---- Tests propios: leer la definición ---- */
drop policy if exists test_definicion_socios on public.test_definicion;
create policy test_definicion_socios on public.test_definicion for select to authenticated
  using (id_entrenador in (select socios_de_direccion()));

/* ---- Tests propios: medir con uno compartido, solo a deportistas a los que
   ya se tiene acceso (los propios o, para un director, los abiertos) ---- */
drop policy if exists test_medicion_socios on public.test_medicion;
create policy test_medicion_socios on public.test_medicion for all to authenticated
  using (id_definicion in (select def_ids_de_socios()) and id_deportista in (select auth_dep_ids()))
  with check (id_definicion in (select def_ids_de_socios()) and id_deportista in (select auth_dep_ids()));

/* ---- Zonas propias: leerlas para prescribir (la tarea guarda su copia) ---- */
drop policy if exists zona_entrenador_socios on public.zona_entrenador;
create policy zona_entrenador_socios on public.zona_entrenador for select to authenticated
  using (id_entrenador in (select socios_de_direccion()));

/* ---- Plantillas de sesión: leerlas para aplicarlas ---- */
drop policy if exists plantilla_sesion_socios on public.plantilla_sesion;
create policy plantilla_sesion_socios on public.plantilla_sesion for select to authenticated
  using (id_entrenador in (select socios_de_direccion()));

/* ---- La biblioteca de ejercicios, también al revés: el entrenador lee la de
   su director (para ver los ejercicios y vídeos de una plantilla o una sesión
   suya). La del entrenador ya la leía el director (eb_lee_director). ---- */
drop policy if exists eb_lee_socios on public.ejercicios_biblioteca;
create policy eb_lee_socios on public.ejercicios_biblioteca for select to authenticated
  using (id_entrenador in (select socios_de_direccion()));

revoke all on function public.socios_de_direccion() from public, anon;
revoke all on function public.mis_socios_de_direccion() from public, anon;
revoke all on function public.def_ids_de_socios() from public, anon;
grant execute on function public.socios_de_direccion() to authenticated;
grant execute on function public.mis_socios_de_direccion() to authenticated;
grant execute on function public.def_ids_de_socios() to authenticated;
