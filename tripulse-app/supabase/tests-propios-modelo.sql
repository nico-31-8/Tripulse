/* ============================================================
   TRIPULSE — El modelo nuevo de los tests propios
   ============================================================

   QUE HACE. Anade UNA columna a test_definicion. Nada mas.

   POR QUE UNA COLUMNA Y NO OTRA TABLA. El modelo nuevo (bloques de
   repeticiones, columnas dadas y medidas, calculadas) es un superconjunto del
   viejo, pero no cabe en las columnas campos y resultados tal como estan. Con
   una columna aparte los dos conviven: un test que tiene modelo se lee con el
   nuevo, y el que no, con el de siempre. Nada se migra a la fuerza y no hay
   un dia en que todo tiene que cambiar a la vez.

   DESHACER. alter table test_definicion drop column modelo;
   Los tests viejos ni se enteran.

   LAS MEDICIONES NO CAMBIAN. test_medicion.datos ya es jsonb y aguanta lo que
   el modelo nuevo guarda: numeros sueltos, listas por repeticion y el marcador
   de hasta donde llego. No hay que tocar esa tabla.

   Y LA RLS TAMPOCO. Las politicas son de la fila entera, asi que la columna
   nueva queda cubierta por lo que ya hay.
   ============================================================ */

alter table test_definicion
  add column if not exists modelo jsonb;

comment on column test_definicion.modelo is
  'El modelo nuevo: {sueltos, bloques, resultados}. Si es null, el test usa las columnas campos y resultados de siempre. Ver lib/lab-constructor.ts';

/* ============================================================
   Comprobacion: deben salir las tres columnas, y modelo nullable
   ============================================================ */

select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'test_definicion'
  and column_name in ('campos', 'resultados', 'modelo')
order by column_name;
