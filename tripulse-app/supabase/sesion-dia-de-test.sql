/* ============================================================
   TRIPULSE. Un dia de test: la sesion lleva su test pegado
   ============================================================

   APLICADO EN PRODUCCION el 2026-09-30.

   POR QUE. Un dia de test era una sesion normal con una nota escrita a mano.
   El jueves habia que ir a Tests o al Laboratorio, buscar el test en la lista,
   elegir al deportista y poner la fecha: cuatro pasos a pie de pista con gente
   esperando. Ahora la sesion sabe que ES un test y lo abre montado.

   QUE SE GUARDA. Una referencia, nunca el nombre:

     {"origen":"bateria","clave":"6min"}   los 17 de campo (lib/catalogo-tests)
     {"origen":"propio","id":12}           los tuyos (test_definicion)

   Son DOS catalogos distintos y por eso se dice de cual: una clave de texto y
   un id numerico no son la misma cosa, y una casilla que a veces lleve una y a
   veces el otro acaba abriendo el test equivocado. El nombre NO se guarda: se
   resuelve al pintarlo, para que renombrar un test no deje sesiones diciendo
   el nombre viejo.

   RLS. No hace falta tocar nada: las politicas estan puestas sobre la tabla
   sesion, no por columna, asi que quien ya podia ver esa sesion ve su test.

   EL GRUPO SALE GRATIS, y conviene saber por que: el volcado copia la fila
   entera menos una lista de exclusiones (lib/grupos-volcado, SIN_COPIAR), asi
   que una columna nueva viaja sola a cada miembro. Hay un test que lo sujeta.

   DESHACER: alter table sesion drop column test;
   ============================================================ */

alter table sesion add column if not exists test jsonb;

comment on column sesion.test is
  'Dia de test. {"origen":"bateria","clave":"6min"} para los de campo, {"origen":"propio","id":12} para los tuyos. Null = sesion normal.';
