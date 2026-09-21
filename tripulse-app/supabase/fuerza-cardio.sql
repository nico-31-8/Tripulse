/* ============================================================
   Lineas de cardio dentro de una sesion de fuerza
   ============================================================

   EL PROBLEMA

   Una sesión es de fuerza O de resistencia, nunca las dos. Si la disciplina
   es «Fuerza», la pantalla solo enseña la tabla de fuerza, y ahí lo único que
   se puede encadenar a un ejercicio es OTRO EJERCICIO de la biblioteca
   (Superserie, Complex).

   Así que no había forma de prescribir lo más corriente de un gimnasio:
   sentadilla 4x6 + 300 m de remo, press + 30 s de assault bike, o un bloque
   con la cinta entre series.

   LA SOLUCIÓN

   Un tipo de serie nuevo, «Cardio», que es la linea entera (no se encadena a
   ningun ejercicio), y cinco columnas para describirla.
   No se reutilizan las del encadenado que ya existen: meter metros dentro de
   `encadenado_repeticiones` es mentir sobre lo que guarda una columna, que es
   exactamente el fallo del RIR guardado como texto dentro de las notas.

       cardio_modo      la modalidad: remo, ski, assault, cinta, rodillo...
       cardio_medida    'metros' o 'segundos'
       cardio_valor     cuantos, por serie
       cardio_zona      la zona de resistencia (AER, AEL, AEM...)
       cardio_objetivo  el «@»: ritmo, potencia o vatios. TEXTO, como en el
                        resto de la aplicacion, porque se prescribe en rangos
                        y en formatos que no son un numero ("2:00/500")

   POR QUE `cardio_valor` ES ENTERO Y `cardio_objetivo` ES TEXTO

   El primero es una cantidad con la que hay que hacer cuentas: se multiplica
   por las series para el volumen y se convierte en minutos para la duracion.
   El segundo no se calcula nunca, solo se lee.

   QUE CUENTA Y QUE NO

   La duracion y la carga las suma SIEMPRE: son minutos que el atleta pasa
   trabajando. Los metros solo entran en el volumen de una disciplina cuando
   la modalidad ES esa disciplina bajo techo (la cinta es correr, el rodillo
   es ir en bici). 5.000 m de remo no son 5.000 m de carrera, y mezclarlos
   estropearia el numero con el que se decide. Esa regla vive en un solo
   sitio: lib/cardio-fuerza.ts.

   DESHACERLO

   Es aditivo: cinco columnas nullable. Quitarlas es el `alter table drop
   column` del final, comentado.

   ============================================================ */

alter table ejercicios add column if not exists cardio_modo text;
alter table ejercicios add column if not exists cardio_medida text;
alter table ejercicios add column if not exists cardio_valor integer;
alter table ejercicios add column if not exists cardio_zona text;
alter table ejercicios add column if not exists cardio_objetivo text;

comment on column ejercicios.cardio_modo is
  'Modalidad del cardio encadenado (remo, ski, assault, cinta, rodillo...). El catalogo vive en lib/cardio-fuerza.ts';
comment on column ejercicios.cardio_medida is
  'metros | segundos. Como se prescribe la cantidad de cardio';
comment on column ejercicios.cardio_valor is
  'Cuanto cardio por serie, en la unidad de cardio_medida';
comment on column ejercicios.cardio_zona is
  'Zona de resistencia del cardio (AER, AEL, AEM, AEI, PAE, CLA...)';
comment on column ejercicios.cardio_objetivo is
  'El «@» del cardio: ritmo, potencia o vatios. Texto porque se prescribe en rangos';

/* ============================================================
   COMPROBAR QUE HA ENTRADO
   ============================================================ */

select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'ejercicios' and column_name like 'cardio%'
order by column_name;

/* ============================================================
   DESHACER (no ejecutar salvo que se quiera quitar la funcion)
   ============================================================

   alter table ejercicios drop column if exists cardio_modo;
   alter table ejercicios drop column if exists cardio_medida;
   alter table ejercicios drop column if exists cardio_valor;
   alter table ejercicios drop column if exists cardio_zona;
   alter table ejercicios drop column if exists cardio_objetivo;

   ============================================================ */
