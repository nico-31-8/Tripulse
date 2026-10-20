/* ============================================================
   WELLNESS: de qué tipo es la FC del reloj (`wellness_fc_noche_tipo`)
   ============================================================
   `wellness.fc_noche` guarda la FC que da cada reloj, y no es la misma medida:
     · Polar: la FC MEDIA de cuatro horas de sueño («FC nocturna»);
     · COROS: su FC EN REPOSO de ese día (no da la media de la noche).
   La de Polar suele salir unas pulsaciones más baja. Mientras un deportista
   lleva una marca su serie no se mezcla, pero el análisis lo llamaba todo «FC
   nocturna», y si cambia de marca las dos medidas entrarían en la misma línea
   base: saldría «fuera de su normal» sin que nada hubiera cambiado.

   Esta columna dice cuál es cada una: 'nocturna' o 'reposo'. El análisis
   (lib/wellness-analisis) las lleva en series separadas, como ya hace con las
   horas de sueño del reloj (`sueno_del_reloj`).

   ADITIVO: una columna nueva, sin valor por defecto. Ninguna fila tenía
   todavía FC del reloj (0 el 2026-10-20), así que no hay nada que rellenar
   hacia atrás. No obliga a ponerla: la app publicada antes que esto guarda
   fc_noche sin ella, y no debe fallar. Sin marca, el análisis la trata como
   hasta ahora (nocturna).
   ============================================================ */

set local lock_timeout = '5s';

alter table public.wellness add column if not exists fc_noche_tipo text
  check (fc_noche_tipo is null or fc_noche_tipo in ('nocturna', 'reposo'));
