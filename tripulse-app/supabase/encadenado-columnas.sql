/* ============================================================
   LOS NÚMEROS DEL EJERCICIO ENCADENADO, EN COLUMNAS

   QUÉ PASA. En una superserie, el segundo ejercicio tiene nombre propio
   (`ejercicio_encadenado_nombre`, `ejercicio_encadenado_id`) pero sus tres
   números —series, repeticiones y kilos— no tienen dónde ir. Se meten como
   TEXTO dentro de `notas_ejecucion`, así:

       « | EJ2: Press banca 3x10 @40kg »

   Consecuencia: al editar o copiar la tarea vuelve el ejercicio pero no sus
   números, porque recuperarlos exigiría leer esa cadena con una expresión
   regular. Es el mismo apaño que ya se pagó caro con el RIR («RIR: 2» dentro de
   las notas), y que se arregló dándole sus columnas `control_tipo` y
   `control_valor`. Esto es lo mismo, pendiente.

   POR QUÉ ESTE FICHERO Y NO EL CÓDIGO PRIMERO. Escribir en una columna que no
   existe hace fallar el INSERT ENTERO, y aquí el insert es el del ejercicio: se
   perdería el ejercicio completo por no poder guardar un número accesorio. Es
   exactamente lo que pasó hoy con `ritmo_objetivo`. Así que primero las
   columnas, y el código después.

   El bloque 1 SOLO LEE. El bloque 2 crea las columnas.
   ============================================================ */

/* ===== 1. ¿De qué tipo son las columnas del ejercicio principal? =====
   Las nuevas tienen que ser del MISMO tipo que sus equivalentes del primer
   ejercicio. No se deduce del código: se mira. */
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'ejercicios'
   and column_name in ('series', 'repeticiones', 'intensidad',
                       'ejercicio_encadenado_nombre', 'ejercicio_encadenado_id')
 order by column_name;

/* ===== 2. Crear las tres, copiando el tipo de su equivalente =====
   Se copia el tipo en vez de escribirlo a mano para que no puedan divergir: si
   `intensidad` es numeric, `encadenado_intensidad` será numeric, y si mañana
   alguien cambia una, esto seguiría siendo cierto al volver a correrlo.

   `add column if not exists` lo hace repetible sin romper nada. */
do $$
declare
  t_series text;
  t_reps   text;
  t_kg     text;
begin
  select data_type into t_series from information_schema.columns
   where table_name = 'ejercicios' and column_name = 'series';
  select data_type into t_reps from information_schema.columns
   where table_name = 'ejercicios' and column_name = 'repeticiones';
  select data_type into t_kg from information_schema.columns
   where table_name = 'ejercicios' and column_name = 'intensidad';

  if t_series is null or t_reps is null or t_kg is null then
    raise exception 'No encuentro series/repeticiones/intensidad en ejercicios. Parar y mirar.';
  end if;

  execute format('alter table ejercicios add column if not exists encadenado_series %s', t_series);
  execute format('alter table ejercicios add column if not exists encadenado_repeticiones %s', t_reps);
  execute format('alter table ejercicios add column if not exists encadenado_intensidad %s', t_kg);
end $$;

/* ===== 3. Comprobar =====
   Deben salir las tres, con el mismo tipo que sus equivalentes del bloque 1. */
select column_name, data_type
  from information_schema.columns
 where table_name = 'ejercicios'
   and column_name in ('encadenado_series', 'encadenado_repeticiones', 'encadenado_intensidad')
 order by column_name;

/* ============================================================
   LO QUE VIENE DESPUÉS, EN EL CÓDIGO

   1. `tareas-tabla` guarda los tres números en sus columnas y DEJA de pegar el
      « | EJ2: ... » dentro de `notas_ejecucion`. Si se hicieran las dos cosas,
      el mismo dato quedaría escrito en dos sitios y con el tiempo dirían cosas
      distintas, que es el fallo que este pase lleva persiguiendo.

   2. `filaFuerzaDesde` (lib/copiar-tarea) los devuelve a la fila. Ahí hay hoy un
      comentario explicando que el hueco es a propósito; se sustituye por el
      código que lo llena.

   3. Las pantallas que hoy pintan solo el NOMBRE del encadenado pasan a pintar
      también sus números. Son seis, así que el texto se arma UNA vez en
      lib/tarea-vista y de ahí lo leen todas. Sin esto, el atleta perdería unos
      números que hoy sí ve —dentro de las notas— y sería un cambio a peor.

   LAS TAREAS VIEJAS no se tocan: sus números siguen dentro de `notas_ejecucion`
   y se seguirán viendo ahí como hasta ahora. Las columnas nuevas nacen vacías y
   solo se llenan al crear o reeditar. Rellenarlas hacia atrás exigiría el mismo
   parser frágil que estamos quitando de en medio, así que no se hace.
   ============================================================ */
