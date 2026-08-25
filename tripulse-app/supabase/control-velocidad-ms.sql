/* ============================================================
   UNA ESCALA MÁS: LA VELOCIDAD MEDIA EN m/s

   QUÉ FALTA. `control_tipo` admite hoy cuatro escalas y solo una habla de
   velocidad: `vel`, que es el PORCENTAJE DE PÉRDIDA dentro de la serie. Pero el
   número que da un encoder es la velocidad media de la repetición —0,62 m/s— y
   el porcentaje sale DESPUÉS, de comparar con la primera. Quien entrena con VBT
   tiene ese dato delante y hoy no tiene dónde escribirlo.

   Son dos cosas distintas y las dos valen:
     · `vel`     → «perdí un 20 % en la serie»  (cuándo cortar)
     · `vel_ms`  → «moví a 0,62 m/s»            (a qué velocidad se levantó)

   No hace falta columna nueva: `control_real` ya es `numeric` y 0,62 cabe. Lo
   único que sobra es el CHECK, que está en DOS tablas — `ejercicios` (lo
   prescrito) y `series_realizadas` (lo que se anotó).

   El bloque 1 SOLO LEE. El bloque 2 cambia las restricciones.
   ============================================================ */

/* ===== 1. Qué restricciones se van a tocar =====
   Deben salir dos, una por tabla. Si sale alguna más, PARAR y mirarla: querría
   decir que hay otra regla sobre esa columna que no conocíamos. */
select rel.relname as tabla,
       con.conname as restriccion,
       pg_get_constraintdef(con.oid) as dice_ahora
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attname = 'control_tipo'
 where con.contype = 'c'
   and rel.relname in ('ejercicios', 'series_realizadas')
   and att.attnum = any (con.conkey)
 order by rel.relname;

/* ===== 2. Cambiarlas =====
   Se buscan por lo que RESTRINGEN y no por su nombre: las creó un
   `add column ... check (...)` sin nombrarlas, así que el nombre lo puso
   Postgres y fiarse de él es fiarse de una convención.

   Los valores viejos se conservan todos: esto solo AÑADE uno. Ninguna fila
   existente deja de cumplir la regla, así que el `alter` no puede fallar por
   datos. */
do $$
declare c record;
begin
  for c in
    select rel.relname as tabla, con.conname as nombre
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_attribute att on att.attrelid = rel.oid and att.attname = 'control_tipo'
     where con.contype = 'c'
       and rel.relname in ('ejercicios', 'series_realizadas')
       and att.attnum = any (con.conkey)
  loop
    execute format('alter table %I drop constraint %I', c.tabla, c.nombre);
  end loop;
end $$;

alter table ejercicios add constraint ejercicios_control_tipo_check
  check (control_tipo in ('rir', 'rpe', 'vel', 'vel_ms', 'pct1rm'));

alter table series_realizadas add constraint series_realizadas_control_tipo_check
  check (control_tipo in ('rir', 'rpe', 'vel', 'vel_ms', 'pct1rm'));

comment on column series_realizadas.control_tipo is
  'Escala con la que se anotó ESA serie: rir, rpe, vel (% de pérdida), vel_ms (velocidad media en m/s) o pct1rm.';

/* ===== 3. Comprobar =====
   Las dos tienen que mencionar ya `vel_ms`. */
select rel.relname as tabla, pg_get_constraintdef(con.oid) as dice_ahora
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attname = 'control_tipo'
 where con.contype = 'c'
   and rel.relname in ('ejercicios', 'series_realizadas')
   and att.attnum = any (con.conkey)
 order by rel.relname;

/* ============================================================
   DESPUÉS DE ESTO, EN EL CÓDIGO

   `vel_ms` se añade a CONTROLES en lib/control-esfuerzo, con el número DELANTE
   («0,62 m/s») como ya hacen `% vel` y `% 1RM`, y sin tope: no es una escala de
   1 a 10, es una medida.

   OJO A UN EFECTO LATERAL: esa lista también alimenta la pantalla donde el
   ENTRENADOR prescribe, y `siguienteControl` la recorre entera. O sea que al
   añadirla aparece una quinta opción también ahí. Es razonable —«mueve a 0,60
   m/s» es una prescripción de VBT de manual— pero no es solo del atleta, y
   conviene saberlo antes.

   Nada de lo ya guardado cambia: las filas viejas siguen con su escala.
   ============================================================ */
