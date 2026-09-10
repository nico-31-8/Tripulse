/* ============================================================
   WELLNESS CON RELOJ (aplicada el 10/09/2026 como `wellness_con_reloj`)
   ============================================================
   Aditivo: cuatro columnas nuevas, ninguna existente cambia.

   Lo del reloj va en columnas PROPIAS y no en hrv / fc_reposo, por tres motivos:
   - La HRV nocturna (RMSSD de 4 h de sueño) y la de la mañana son medidas
     distintas; mezcladas, la línea base del readiness saltaría sola el día que
     un atleta conecta el reloj.
   - SICAT compara wellness.hrv con deportista.hrv_basal: con la nocturna
     dentro marcaría caídas falsas.
   - wellness.fc_reposo alimenta las zonas de Karvonen: la FC media del sueño
     es más baja que la de al despertar y movería las zonas de pulso.

   `sueno_del_reloj` dice que las horas las puso el reloj y no se corrigieron:
   el motor las compara en su propia serie (el reloj cuenta el sueño real, sin
   interrupciones; quien las teclea suele contar el tiempo en la cama).

   `deportista.hrv_matutina` es la casilla del entrenador: este atleta hace el
   ritual de medirse la HRV al despertar, y con reloj conectado el formulario se
   la sigue pidiendo. */

alter table public.wellness add column hrv_noche numeric;
alter table public.wellness add column fc_noche integer;
alter table public.wellness add column sueno_del_reloj boolean not null default false;

alter table public.deportista add column hrv_matutina boolean not null default false;
