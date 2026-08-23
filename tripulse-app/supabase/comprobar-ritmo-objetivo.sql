/* ============================================================
   ¿QUÉ HAY DE VERDAD EN ritmo_objetivo?

   POR QUÉ. El código escribe en esa columna el TEXTO que devuelve
   `prescripcion()`, con la unidad dentro: «4:12–4:30 /km», «180–220 W»,
   «> 2:05 /100m». Tres pantallas lo pintaban tal cual, bien. Dos lo leían como
   SEGUNDOS y lo pasaban por un m:ss, así que ponían «NaN:NaN /km». Ya está
   corregido, pero quedan dos cosas por saber de la base:

   1. Si hay filas ANTIGUAS guardadas como número de segundos. El arreglo las
      contempla (formatea solo si de verdad es un número), pero conviene saber
      si existen o si la rama nunca se usa.

   2. Si `p_duracion` tiene esa columna. La pantalla de ejecución la lee
      (`p_duracion?.[0]?.ritmo_objetivo`) pero NADIE la escribe. O la columna no
      existe y esa lectura es código muerto, o existe y está siempre vacía: en
      un caso se borra la lectura, en el otro se decide si se rellena.

   SOLO LEE. No escribe ni borra nada. Se puede correr en producción.
   ============================================================ */
select * from (
  select 1 as n,
         'la columna existe en' as comprobacion,
         coalesce(string_agg(table_name || ' (' || data_type || ')', ', ' order by table_name),
                  'EN NINGUNA') as valor
    from information_schema.columns
   where table_name in ('p_distancia', 'p_duracion')
     and column_name = 'ritmo_objetivo'

  union all
  select 2, 'filas de p_distancia con ritmo guardado',
         (select count(*)::text from p_distancia where ritmo_objetivo is not null)

  union all
  /* Si esto da algo distinto de 0, hay filas viejas en segundos y la rama de
     compatibilidad del arreglo sí hace falta. */
  select 3, 'de esas, cuantas son un numero puro',
         (select count(*)::text from p_distancia
           where ritmo_objetivo is not null
             and ritmo_objetivo::text ~ '^[0-9]+$')

  union all
  select 4, 'ejemplos de lo guardado',
         (select coalesce(string_agg(v, '  |  '), 'ninguno') from (
            select distinct ritmo_objetivo::text as v
              from p_distancia where ritmo_objetivo is not null limit 8) x)
) t order by n;

/* ============================================================
   CÓMO SE LEE

   Fila 1  →  si solo sale `p_distancia`, la lectura de `p_duracion` en la
              pantalla de ejecución es código muerto y se quita.
   Fila 2  →  cuántas prescripciones tienen ritmo. Si es 0, la caja naranja no
              se ha pintado nunca y el «NaN» era un fallo latente, no visto.
   Fila 3  →  0 significa que todo lo guardado es texto y no hay herencia.
   Fila 4  →  para verlo con los ojos. Debe parecerse a «180–220 W».
   ============================================================ */
