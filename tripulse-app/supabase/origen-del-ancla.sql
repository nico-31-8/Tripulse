/* ============================================================
   DE QUÉ TEST SALIÓ ESTE NÚMERO
   Ejecutar en: Supabase Dashboard > SQL Editor
   ============================================================

   QUÉ CAMBIA. Hasta ahora, las zonas de cada disciplina solo las podía fijar
   un test: el Montreal en carrera, el CSS de dos distancias en natación y la
   rampa en ciclismo. Son los únicos que escriben en test1_carrera,
   test2_natacion y test3_ciclismo.

   Pero hay más tests que miden lo mismo. El de 6 minutos da una VAM. El FTP de
   60 minutos da un FTP, y ademas es el patrón oro, el que menos corrección
   necesita: se guardaba en tests_libres y las zonas ni se enteraban. Un
   entrenador que hiciera ese test, viera el número y esperase que los ritmos
   del atleta se movieran, se quedaba esperando sin que nada avisara.

   A partir de ahora esos tests pueden fijar el ancla. Pero hay que pulsar un
   botón: guardar el test NO mueve las zonas solo. Un test puede salir mal, y
   que eso reescriba en silencio los ritmos de las próximas semanas sería el
   peor fallo posible de esa pantalla.

   POR QUÉ HACE FALTA ESTA COLUMNA. Si el 6 minutos y el Montreal escriben los
   dos en test1_carrera.vam, dentro de dos meses hay una VAM de 15,4 en la tabla
   y no hay forma de saber de cuál de los dos salió. Y no son igual de fiables:
   el Montreal llega al agotamiento por escalones y el de 6 minutos es una media.
   Sin saber el origen no se puede ni comparar ni decidir cuál mandaba.

   ES ADITIVA Y SE PUEDE CORRER DOS VECES. Columna nueva, que admite nulos y sin
   valor por defecto: las filas que ya existen se quedan con origen a nulo, que
   es la verdad, porque de esas no se sabe de dónde salieron. No toca ni un dato.
   ============================================================ */


/* ============================================================
   1. ANTES: qué columnas tienen ahora esas tres tablas
   ============================================================ */
select table_name as tabla,
       string_agg(column_name, ', ' order by ordinal_position) as columnas
  from information_schema.columns
 where table_name in ('test1_carrera', 'test2_natacion', 'test3_ciclismo')
 group by table_name
 order by table_name;


/* ============================================================
   2. LA COLUMNA
   ============================================================ */
alter table test1_carrera  add column if not exists origen text;
alter table test2_natacion add column if not exists origen text;
alter table test3_ciclismo add column if not exists origen text;

comment on column test1_carrera.origen  is 'Clave del test del que salió la VAM. Nulo = el Montreal de siempre.';
comment on column test2_natacion.origen is 'Clave del test del que salió el CSS. Nulo = el CSS de dos distancias.';
comment on column test3_ciclismo.origen is 'Clave del test del que salió el FTP. Nulo = la rampa.';


/* ============================================================
   3. DESPUÉS: tiene que aparecer origen en las tres
   ============================================================ */
select table_name as tabla, column_name, data_type
  from information_schema.columns
 where table_name in ('test1_carrera', 'test2_natacion', 'test3_ciclismo')
   and column_name = 'origen'
 order by table_name;


/* ============================================================
   4. QUÉ HAY GUARDADO, POR ORIGEN

   Ahora mismo saldrá todo con origen nulo, que es correcto: hasta hoy solo
   escribían los tests clásicos. Según se vayan usando los nuevos, aquí se verá
   de dónde viene cada ancla.
   ============================================================ */
select 'carrera' as disciplina, coalesce(origen, 'clasico (Montreal)') as origen,
       count(*) as filas, round(avg(vam), 1) as media
  from test1_carrera where vam is not null group by origen
union all
select 'natacion', coalesce(origen, 'clasico (CSS 400+200)'),
       count(*), round(avg(css), 3)
  from test2_natacion where css is not null group by origen
union all
select 'ciclismo', coalesce(origen, 'clasico (rampa)'),
       count(*), round(avg(ftp), 0)
  from test3_ciclismo where ftp is not null group by origen
 order by disciplina, origen;
