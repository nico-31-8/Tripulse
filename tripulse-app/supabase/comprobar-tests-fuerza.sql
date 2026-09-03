/* ============================================================
   ¿QUÉ GUARDAN test_fuerza Y tests_libres?

   POR QUÉ. Van a entrar dos cosas nuevas: los tests de SALTO (CMJ y squat
   jump, con su potencia en vatios por la fórmula de Sayers) y el 1RM estimado
   a partir de repeticiones al fallo.

   El 1RM ya tiene sitio: el código lee `test_fuerza.rm_estimado` para enseñar
   los kilos cuando se prescribe por porcentaje. Los saltos no se sabe, y de eso
   depende si hacen falta columnas nuevas o si caben en lo que hay.

   `tests_libres` guarda nombre + resultado + unidad, o sea que un salto CABRÍA
   ahí como texto. Pero entonces la potencia calculada no sería un número
   consultable y no se podría dibujar la evolución, que es justo para lo que
   sirve un CMJ repetido en el tiempo.

   SOLO LEE. No escribe ni borra nada. Se puede correr en producción.
   ============================================================ */

select 1 as n, 'columnas de test_fuerza' as comprobacion,
       coalesce(string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position),
                'LA TABLA NO EXISTE') as valor
  from information_schema.columns
 where table_name = 'test_fuerza'

union all
select 2, 'columnas de tests_libres',
       coalesce((select string_agg(column_name || ' (' || data_type || ')', ', ' order by ordinal_position)
                   from information_schema.columns where table_name = 'tests_libres'),
                'LA TABLA NO EXISTE')

union all
select 3, 'filas que hay en test_fuerza',
       (select count(*)::text from test_fuerza)

union all
select 4, 'que ejercicios se han testado',
       coalesce((select string_agg(distinct ejercicio, ' | ') from test_fuerza where ejercicio is not null),
                'ninguno')

union all
select 5, 'filas en tests_libres y con que nombres',
       coalesce((select count(*)::text || ' filas: ' || coalesce(string_agg(distinct nombre, ' | '), 'sin nombre')
                   from tests_libres), '0')

order by n;
