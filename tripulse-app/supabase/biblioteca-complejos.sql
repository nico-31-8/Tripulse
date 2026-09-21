/* ============================================================
   BIBLIOTECA · Grupo «Complejos»
   ============================================================

   Levantamientos de cuerpo entero que llevan una carga de abajo arriba:
   arrancada, cargada, dos tiempos y sus variantes con barra, mancuerna y
   kettlebell, y los de suelo a overhead.

   Van con grupo_muscular = 'Complejos' para que salgan juntos en el
   desplegable «Grupo» de la prescripción, y con la etiqueta 'Complejos' en
   `tipo` para filtrarlos en /fuerza (ver lib/grupo-ejercicio.ts).

   Las dosis de la cargada y la arrancada de fuerza, y los parámetros del
   bloque de potencia (2-5 repeticiones, máxima velocidad, cortar la serie si
   cae la calidad), salen de la wiki: Perfiles-de-Prueba/ejercicios-fuerza-y-
   potencia.md. El resto de descripciones son técnica estándar.

   Se puede lanzar dos veces: solo inserta los que no existan por nombre.
   Sin vídeos: se ponen desde la lupa del buscador o desde /fuerza.
   ============================================================ */

insert into ejercicios_biblioteca (nombre, grupo_muscular, descripcion, ejecucion, tipo, region, disciplina, momento, lesion)
select v.nombre, 'Complejos', v.descripcion, v.ejecucion,
       array['Fuerza', 'Complejos']::text[], v.region, '{}'::text[], '{}'::text[], '{}'::text[]
from (values

/* === Con barra: arrancada === */

('Arrancada (snatch)',
 'El levantamiento olímpico completo: la barra va del suelo a brazos extendidos sobre la cabeza en un solo movimiento y se recibe en sentadilla profunda. La de más velocidad de barra y la más técnica.',
 '1) Barra sobre los cordones, agarre muy abierto, espalda neutra y hombros por delante de la barra.
2) Primer tirón: empujar el suelo con las piernas; la barra sube pegada a las espinillas y la cadera no se adelanta a los hombros.
3) Segundo tirón: al pasar la rodilla, extender de golpe cadera, rodillas y tobillos; la barra roza la cadera.
4) Meterse debajo y recibir la barra con los brazos bloqueados en sentadilla profunda.
5) Ponerse de pie con la barra estable arriba.

3-5x2-3. Pide técnica y movilidad de hombro y tobillo: sin ellas, mejor la arrancada de fuerza o la colgada. Si la barra se separa del cuerpo, sobra peso.',
 array['Cuádriceps', 'Glúteos', 'Isquiotibiales', 'Espalda alta', 'Hombro']::text[]),

('Arrancada de fuerza (power snatch)',
 'La arrancada recibiendo la barra por encima de media sentadilla. Menos técnica y movilidad que la completa, y la que se usa en un bloque de potencia.',
 '1) Misma salida que la arrancada: agarre abierto, espalda neutra.
2) Tirón desde el suelo con las piernas, barra pegada al cuerpo.
3) Extensión explosiva de cadera, rodillas y tobillos.
4) Recibir con los brazos bloqueados arriba y las rodillas poco flexionadas, por encima de la paralela.
5) Estabilizar de pie.

3-5x2-3 al 65-80 %. Velocidad máxima de barra: si una repetición sale lenta, se corta la serie.',
 array['Cuádriceps', 'Glúteos', 'Isquiotibiales', 'Espalda alta', 'Hombro']::text[]),

('Arrancada colgada (hang power snatch)',
 'Arrancada de fuerza empezando con la barra justo por encima de las rodillas, sin el tirón desde el suelo. Deja la extensión explosiva de cadera y es más fácil de aprender.',
 '1) De pie con la barra en las manos, agarre de arrancada.
2) Bisagra de cadera hasta dejar la barra justo por encima de la rodilla, espalda neutra, hombros por delante.
3) Extender cadera y rodillas de golpe; la barra sube pegada al cuerpo.
4) Recibirla arriba con los brazos bloqueados en media sentadilla.

3-4x2-4. Buena puerta de entrada a la arrancada: el gesto que importa, la extensión de cadera, está entero.',
 array['Glúteos', 'Isquiotibiales', 'Espalda alta', 'Hombro']::text[]),

/* === Con barra: cargada === */

('Cargada (clean)',
 'La barra va del suelo a los hombros en un solo movimiento y se recibe en sentadilla frontal profunda. Es la primera mitad del dos tiempos.',
 '1) Barra sobre los cordones, agarre algo más ancho que los hombros, espalda neutra.
2) Primer tirón con las piernas, barra pegada a las espinillas.
3) Al pasar la rodilla, extensión explosiva de cadera, rodillas y tobillos.
4) Meterse debajo girando los codos al frente y recibir la barra sobre los hombros en sentadilla frontal.
5) Ponerse de pie con los codos altos.

3-5x2-3. Codos altos al recibir: si caen, la barra rueda de los hombros a las muñecas.',
 array['Cuádriceps', 'Glúteos', 'Isquiotibiales', 'Espalda alta']::text[]),

('Cargada de fuerza (power clean)',
 'La cargada recibiendo la barra en los hombros por encima de media sentadilla. El levantamiento olímpico con la producción de fuerza más rápida (RFD) de los que se usan para potencia.',
 '1) Barra sobre los cordones, agarre algo más ancho que los hombros, espalda neutra.
2) Tirón desde el suelo con las piernas, barra pegada al cuerpo.
3) Extensión explosiva de cadera, rodillas y tobillos.
4) Recibir la barra en los hombros con los codos al frente y las rodillas poco flexionadas.

3-5x2-4 al 70-85 %. Pide mucha técnica: en un atleta de resistencia con la semana llena rara vez compensa frente a la pliometría o la fuerza pesada.',
 array['Cuádriceps', 'Glúteos', 'Isquiotibiales', 'Espalda alta']::text[]),

('Cargada colgada (hang power clean)',
 'Cargada de fuerza empezando con la barra justo por encima de las rodillas. Quita el tirón desde el suelo y deja la extensión explosiva de cadera.',
 '1) De pie con la barra en las manos, agarre de cargada.
2) Bisagra de cadera hasta dejar la barra justo por encima de la rodilla, espalda neutra.
3) Extender cadera y rodillas de golpe; la barra sube pegada.
4) Recibirla en los hombros con los codos al frente.

3-4x2-4. La más sencilla de enseñar de las olímpicas.',
 array['Glúteos', 'Isquiotibiales', 'Espalda alta']::text[]),

('Tirón de cargada (clean pull)',
 'El tirón de la cargada sin recibir la barra. Trabaja la extensión explosiva con más carga que la cargada completa y sin la parte técnica de meterse debajo.',
 '1) Salida de cargada: barra sobre los cordones, espalda neutra.
2) Tirón desde el suelo, barra pegada al cuerpo.
3) Extensión completa de cadera, rodillas y tobillos, encogiendo los hombros al final.
4) Bajar la barra controlada.

3-4x3-5, con algo más de peso que la cargada. Los brazos no tiran: la barra la suben las piernas y la cadera.',
 array['Glúteos', 'Isquiotibiales', 'Espalda alta']::text[]),

/* === Con barra: hasta overhead === */

('Dos tiempos (clean & jerk)',
 'Cargada hasta los hombros y, en un segundo movimiento, envión de la barra por encima de la cabeza. El levantamiento olímpico que más carga mueve.',
 '1) Cargada completa hasta la posición de sentadilla frontal, de pie.
2) Pausa breve: codos al frente, peso en los talones.
3) Flexión corta y vertical de rodillas.
4) Extensión explosiva y meterse debajo de la barra abriendo las piernas en tijera, brazos bloqueados.
5) Juntar los pies: primero el de delante hacia atrás, luego el de atrás.

3-5x1-2. Son dos gestos técnicos seguidos: si no se dominan la cargada y el envión por separado, se trabajan antes por separado.',
 array['Cuádriceps', 'Glúteos', 'Espalda alta', 'Hombro', 'Tríceps']::text[]),

('Envión en tijera (split jerk)',
 'La segunda parte del dos tiempos: desde los hombros, la barra sube con un impulso de piernas y se recibe con los brazos bloqueados en tijera.',
 '1) Barra en los hombros como en la sentadilla frontal, sacada de los soportes.
2) Flexión corta y vertical de rodillas.
3) Extensión explosiva de piernas lanzando la barra.
4) Meterse debajo en tijera, brazos bloqueados, cabeza por delante de la barra.
5) Recuperar los pies.

3-4x2-3. A diferencia del push press, los brazos no terminan el movimiento: el cuerpo baja a buscar la barra.',
 array['Cuádriceps', 'Hombro', 'Tríceps']::text[]),

('Cargada y press con barra (clean & press)',
 'Cargada de fuerza hasta los hombros seguida de un press estricto por encima de la cabeza. Del suelo a overhead con barra.',
 '1) Cargada de fuerza hasta los hombros.
2) De pie, glúteo y abdomen apretados.
3) Press estricto: la barra sube pasando cerca de la cara hasta bloquear los brazos.
4) Bajarla a los hombros y al suelo, controlada.

3-4x3-5. El press es estricto: si hacen falta las piernas para subirla, es un push press y sobra peso.',
 array['Glúteos', 'Isquiotibiales', 'Espalda alta', 'Hombro', 'Tríceps']::text[]),

('Thruster con barra',
 'Sentadilla frontal que sale en un solo empuje hasta el press por encima de la cabeza. Potencia de cadena completa y mucha demanda metabólica.',
 '1) Barra en los hombros, codos altos.
2) Sentadilla frontal hasta la paralela o más.
3) Subir explosivo y, sin parar, usar ese impulso para empujar la barra arriba.
4) Bloquear los brazos arriba y bajar la barra a los hombros entrando en la siguiente sentadilla.

3-4x4-6. Si la barra se para en los hombros entre la sentadilla y el press, son dos ejercicios, no un thruster.',
 array['Cuádriceps', 'Glúteos', 'Hombro', 'Tríceps']::text[]),

/* === Con mancuerna === */

('Arrancada con mancuerna (DB snatch)',
 'La mancuerna va del suelo a brazo extendido sobre la cabeza en un solo movimiento, a una mano. Potencia de todo el cuerpo con poca técnica.',
 '1) Mancuerna en el suelo entre los pies, pies a la anchura de la cadera.
2) Bajar en bisagra y sentadilla, espalda neutra, y agarrarla con una mano.
3) Extender cadera y piernas de golpe; la mancuerna sube pegada al cuerpo.
4) Meterse debajo y recibirla con el brazo bloqueado arriba.
5) Bajarla al hombro y al suelo, controlada.

3-4x3-5 por brazo. La mancuerna la sube la cadera, no el hombro: si el brazo tira desde abajo, sobra peso.',
 array['Glúteos', 'Isquiotibiales', 'Hombro', 'Core']::text[]),

('Cargada con mancuernas (DB clean)',
 'Las dos mancuernas van del suelo a los hombros en un solo movimiento. La cargada sin la técnica de la barra.',
 '1) Mancuernas en el suelo a los lados de los pies.
2) Bajar en sentadilla con la espalda neutra y agarrarlas.
3) Extensión explosiva de piernas y cadera.
4) Recibirlas sobre los hombros con una pequeña flexión de rodillas.

3-4x4-6. Las mancuernas suben pegadas a los muslos: si se abren hacia fuera, tira el hombro y no la cadera.',
 array['Cuádriceps', 'Glúteos', 'Isquiotibiales', 'Espalda alta']::text[]),

('Cargada y press con mancuernas (DB clean & press)',
 'Del suelo a los hombros con una cargada y de los hombros a overhead con un press. El de suelo a overhead con mancuernas por excelencia.',
 '1) Cargada con mancuernas hasta los hombros.
2) Press hasta bloquear los brazos arriba, estricto o con un pequeño impulso de rodillas.
3) Bajarlas a los hombros, a la cadera y al suelo, siempre con la espalda neutra.

3-4x4-6. La vuelta al suelo también es parte del ejercicio: bajar con la espalda redonda es donde se hace daño.',
 array['Cuádriceps', 'Glúteos', 'Espalda alta', 'Hombro', 'Tríceps']::text[]),

('Thruster con mancuernas',
 'Sentadilla con las mancuernas en los hombros que sale en un solo empuje hasta overhead. El thruster sin barra, algo más exigente para la estabilidad del hombro.',
 '1) Una mancuerna en cada hombro, codos al frente.
2) Sentadilla hasta la paralela o más.
3) Subir explosivo y, sin parar, empujar las mancuernas arriba.
4) Bloquear los brazos y bajarlas a los hombros entrando en la siguiente sentadilla.

3-4x6-8. Si las mancuernas se paran en los hombros, son dos ejercicios, no un thruster.',
 array['Cuádriceps', 'Glúteos', 'Hombro', 'Tríceps']::text[]),

('Devil press',
 'Burpee con una mancuerna en cada mano y, al levantarse, las dos van del suelo a overhead en un solo gesto. Muy metabólico.',
 '1) De pie con una mancuerna en cada mano.
2) Apoyarlas en el suelo, saltar atrás a plancha y bajar el pecho al suelo.
3) Volver a llevar los pies junto a las manos.
4) Con la espalda neutra, llevar las dos mancuernas entre las piernas y, en un solo gesto, subirlas hasta bloquear los brazos arriba.

3-4x6-10 o por tiempo. Carga ligera: con fatiga, lo primero que se pierde es la espalda neutra al subir las mancuernas.',
 array['Glúteos', 'Isquiotibiales', 'Hombro', 'Pectoral', 'Core']::text[]),

('Man maker',
 'Flexión con remo a cada brazo sobre las mancuernas, salto a sentadilla y cargada con thruster hasta overhead. Cuerpo entero en cada repetición.',
 '1) Plancha con las manos sobre dos mancuernas.
2) Flexión, remo con un brazo y remo con el otro.
3) Saltar con los pies hacia las manos.
4) Cargada de las mancuernas a los hombros y thruster hasta overhead.
5) Bajarlas y volver a la plancha.

3x5-8. Mejor mancuernas hexagonales o de base plana: sobre las redondas, el remo en plancha rueda.',
 array['Cuádriceps', 'Glúteos', 'Espalda alta', 'Pectoral', 'Hombro', 'Core']::text[]),

('Del suelo a overhead (ground to overhead)',
 'Llevar una carga del suelo a brazos extendidos por encima de la cabeza con las dos manos, por el camino más eficiente. El patrón de coger algo del suelo y dejarlo en una balda alta.',
 '1) Carga (disco, mancuerna o balón) en el suelo, delante de los pies.
2) Sentadilla con bisagra y espalda neutra para agarrarla.
3) Subir extendiendo cadera y piernas y, sin pararse, llevarla hasta arriba con los brazos bloqueados.
4) Bajarla por el mismo camino.

3-4x6-10. La fuerza sale de las piernas: si la carga sube con los brazos desde abajo, sobra peso.',
 array['Cuádriceps', 'Glúteos', 'Hombro', 'Core']::text[]),

/* === Con kettlebell === */

('Arrancada con kettlebell (KB snatch)',
 'La kettlebell va desde entre las piernas a brazo extendido sobre la cabeza con un swing y un giro de muñeca. Potencia balística con poca carga.',
 '1) Swing a una mano: bisagra, kettlebell entre las piernas.
2) Proyectar la cadera; la pesa sube pegada al cuerpo.
3) A la altura del pecho, meter la mano por dentro del asa para que la pesa gire y se apoye en el antebrazo sin golpear.
4) Terminar con el brazo bloqueado arriba.
5) Bajarla en un arco y encadenar el siguiente swing.

3-4x5-10 por brazo. Si la kettlebell golpea el antebrazo, la mano ha entrado tarde: acompañarla antes, no dejarla caer.',
 array['Glúteos', 'Isquiotibiales', 'Hombro', 'Core']::text[]),

('Cargada y press con kettlebell (KB clean & press)',
 'Cargada de la kettlebell a la posición de rack y press por encima de la cabeza. Hombro estable con la carga descentrada.',
 '1) Swing corto desde entre las piernas.
2) Cargada: la pesa rueda por fuera de la mano y se apoya en el antebrazo, codo pegado al cuerpo.
3) Press hasta bloquear el brazo, con el bíceps junto a la oreja.
4) Volver a la posición de rack y bajarla entre las piernas.

3-4x5-8 por brazo. En el rack la muñeca va recta: si se dobla hacia atrás, la pesa cuelga de ella y no del antebrazo.',
 array['Glúteos', 'Hombro', 'Tríceps', 'Core']::text[])

) as v(nombre, descripcion, ejecucion, region)
where not exists (select 1 from ejercicios_biblioteca b where b.nombre = v.nombre);

/* ============================================================
   COMPROBACIÓN

     select nombre, grupo_muscular, tipo from ejercicios_biblioteca
      where grupo_muscular = 'Complejos' order by nombre;
   ============================================================ */
