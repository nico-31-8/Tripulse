/* ============================================================
   ¿ESTÁ id_deportista EN TODAS LAS FILAS, Y BIEN?

   POR QUÉ AHORA. El pase de pulido ha cambiado la forma de traer los ciclos: en
   vez de encadenar microciclo → mesociclo → macrociclo para acotar, se piden los
   mesociclos y microciclos del deportista de una vez y se acota en memoria. Eso
   quita cinco viajes por pantalla.

   Pero descansa entero sobre una suposición: que `id_deportista` está relleno en
   `mesociclo` y `microciclo`. La columna la creó la Fase A y hay triggers que la
   rellenan, PERO hasta hoy NINGÚN camino de lectura de la app la usaba. Es una
   columna que se escribe y no se lee, y esas son las que se pudren sin que nadie
   se entere.

   Si faltara en alguna fila, no petaría nada: la cabecera de la sesión diría
   «Semana — de —» y la cuenta atrás de la competición desaparecería. Mentiría en
   silencio, que es peor.

   SOLO LEE. No escribe ni borra nada. Se puede correr en producción.
   ============================================================ */

/* ===== 1. ¿Falta en alguna fila? =====
   Los tres deben salir a 0. */
select
  (select count(*) from mesociclo  where id_deportista is null) as mesos_sin_dueno,
  (select count(*) from microciclo where id_deportista is null) as micros_sin_dueno,
  (select count(*) from sesion     where id_deportista is null) as sesiones_sin_dueno;

/* ===== 2. ¿Coincide con la jerarquía? =====
   Que esté relleno no basta: podría estar relleno con el deportista EQUIVOCADO,
   y entonces la semana de un atleta saldría contada con los ciclos de otro. Se
   compara cada fila con su padre. Los tres a 0.

   `is distinct from` y no `<>`: con `<>`, una comparación contra null da null y
   la fila no saldría, que es justo el caso que se busca. */
select
  (select count(*) from mesociclo me
     join macrociclo ma on ma.id = me.id_macrociclo
   where me.id_deportista is distinct from ma.id_deportista) as mesos_con_dueno_ajeno,

  (select count(*) from microciclo mi
     join mesociclo me on me.id = mi.id_mesociclo
   where mi.id_deportista is distinct from me.id_deportista) as micros_con_dueno_ajeno,

  (select count(*) from sesion s
     join microciclo mi on mi.id = s.id_microciclo
   where s.id_deportista is distinct from mi.id_deportista) as sesiones_con_dueno_ajeno;

/* ===== 3. ¿Siguen puestos los disparadores? =====
   Son los que rellenan la columna en cada alta. Si alguno se hubiera caído, lo
   viejo estaría bien y lo nuevo iría entrando vacío: el fallo aparecería semanas
   después y solo en los planes recientes.

   Deben salir los tres, y en estado 'O' (habilitado). */
select tgname as disparador,
       case tgenabled when 'O' then 'encendido' else 'APAGADO' end as estado
from pg_trigger
where tgname in ('trg_fill_dep_mesociclo', 'trg_fill_dep_microciclo', 'trg_fill_dep_sesion')
order by tgname;

/* ============================================================
   CÓMO SE LEE

   Todo a 0 y los tres disparadores encendidos  →  el pulido se sostiene.

   Si el bloque 1 da algo distinto de 0, el arreglo es un relleno como el de la
   Fase A (supabase/fase-a.sql, apartado 3), de arriba abajo: mesociclo desde
   macrociclo, microciclo desde mesociclo, sesion desde microciclo.

   Si el bloque 2 da algo distinto de 0, NO se rellena a ciegas: hay filas
   colgando de un padre que no les corresponde y hay que mirar cuáles antes de
   tocar nada.
   ============================================================ */
