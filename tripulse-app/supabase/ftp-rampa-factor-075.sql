/* ============================================================
   EL FTP DE LA RAMPA ESTABA INFLADO UN TERCIO

   QUÉ PASABA. La función `ftpDeRampa` calculaba la potencia del último escalón
   —la PAM— y se guardaba tal cual en `test3_ciclismo.ftp`. El factor 0,75 no se
   aplicaba en ninguna parte del código.

   La batería de tests del proyecto lo dice en una línea:

       FTP = último min x 0,75   ·   PAM = último min

   Y de `ftp` salen las zonas de ciclismo: en /zonas la Z2 es el 55-75 % del FTP
   y la Z3 el 75-90 %. Con el FTP un tercio alto, a un ciclista al que se le
   mandaba «Z3» se le estaba mandando bastante por encima de Z3. No rompia nada
   y no avisaba nadie: el numero simplemente mentia.

   Que la tabla tenga `potencia_pico` y `ftp` como columnas separadas ya decia
   que la intencion era guardar dos cosas distintas; se guardaba la misma.

   POR QUE SE RECALCULA Y NO SE MULTIPLICA POR 0,75

   Lo facil seria `update ... set ftp = ftp * 0.75`. Pero eso NO se puede correr
   dos veces: la segunda dejaria el FTP en el 56 %. Y basta con que alguien lo
   ejecute por si acaso, o que se relance el script, para estropear los datos de
   todos los ciclistas sin que salte nada.

   Como cada fila guarda los cuatro datos de entrada del test, se puede
   RECALCULAR el FTP desde cero. Correrlo diez veces da diez veces el mismo
   numero. Es la diferencia entre una operacion que hay que hacer exactamente
   una vez y otra que da igual cuantas veces se haga.

   Solo toca las filas que tengan los cuatro datos. Una fila incompleta se queda
   como esta: no se sabe recalcularla, y dejarla a medias seria peor.
   ============================================================ */


/* ============================================================
   1. ANTES: que hay ahora mismo
   ============================================================ */
select 'ANTES' as momento,
       count(*) as filas,
       round(avg(ftp)) as ftp_medio,
       min(ftp) as ftp_min,
       max(ftp) as ftp_max
  from test3_ciclismo
 where ftp is not null;


/* ============================================================
   2. EL ARREGLO
   ============================================================ */
update test3_ciclismo
   set ftp = round(
         (
           (potencia_pico - incremento_potencia)
           + incremento_potencia * tiempo_escalon_no_completado::numeric / duracion_escalones
         ) * 0.75
       )
 where potencia_pico is not null
   and incremento_potencia is not null
   and tiempo_escalon_no_completado is not null
   and duracion_escalones is not null
   and duracion_escalones <> 0;


/* ============================================================
   3. DESPUES: tiene que haber bajado sobre un 25 %
   ============================================================ */
select 'DESPUES' as momento,
       count(*) as filas,
       round(avg(ftp)) as ftp_medio,
       min(ftp) as ftp_min,
       max(ftp) as ftp_max
  from test3_ciclismo
 where ftp is not null;


/* ============================================================
   4. LAS QUE NO SE HAN PODIDO RECALCULAR

   Si sale alguna, es una fila sin los datos del test: su `ftp` sigue con el
   valor viejo, inflado. Habria que repetirle el test o borrar ese numero, pero
   eso se decide viendolo y no a ciegas.
   ============================================================ */
select id_deportista, fecha, ftp,
       potencia_pico, incremento_potencia,
       tiempo_escalon_no_completado, duracion_escalones
  from test3_ciclismo
 where ftp is not null
   and (potencia_pico is null
        or incremento_potencia is null
        or tiempo_escalon_no_completado is null
        or duracion_escalones is null
        or duracion_escalones = 0)
 order by fecha desc;
