/* ============================================================
   BIBLIOTECA · Grupo «Funcional»
   ============================================================

   Las estaciones de HYROX y los gimnásticos de CrossFit que faltaban para
   poder elegirlos de la biblioteca dentro de un bloque (AMRAP, EMOM…). Lo
   demás ya estaba: dominadas, box jump, empuje o arrastre de trineo, paseo del
   granjero, kettlebell swing y todos los Complejos.

   Van con grupo_muscular = 'Funcional' y la etiqueta 'Funcional' en `tipo`
   (ver lib/grupo-ejercicio.ts). Técnica estándar; sin vídeo, se pone desde la
   lupa o desde /fuerza. Se puede lanzar dos veces: solo inserta los que no
   existan por nombre.
   ============================================================ */

insert into ejercicios_biblioteca (nombre, grupo_muscular, descripcion, ejecucion, tipo, region, disciplina, momento, lesion)
select v.nombre, 'Funcional', v.descripcion, v.ejecucion,
       array['Fuerza', 'Funcional']::text[], v.region, '{}'::text[], '{}'::text[], '{}'::text[]
from (values

('Wall balls',
 'Sentadilla con balón medicinal y lanzamiento a una diana alta en la pared, en un solo movimiento. Una de las estaciones de HYROX y un clásico de CrossFit.',
 '1) De pie frente a la pared, a medio metro, con el balón a la altura del pecho y los codos debajo.
2) Sentadilla completa con el torso erguido.
3) Subir explosivo y, aprovechando el impulso de las piernas, lanzar el balón a la diana.
4) Recibirlo con los brazos altos y bajar directamente a la siguiente sentadilla.

Las que pida el formato. Si el balón no llega a la diana, lo lanzan los brazos y no las piernas: más profundidad y más impulso.',
 array['Cuádriceps', 'Glúteos', 'Hombro']::text[]),

('Burpees',
 'Del suelo con el pecho abajo a un salto con palmada sobre la cabeza. Cuerpo entero y mucha demanda metabólica.',
 '1) De pie, bajar en cuclillas y apoyar las manos en el suelo.
2) Saltar atrás a plancha y bajar el pecho y los muslos al suelo.
3) Subir el cuerpo y llevar los pies junto a las manos.
4) Saltar con una palmada por encima de la cabeza.

Las que pida el formato. Con fatiga, que no se pierda la plancha: la cadera no se queda colgando.',
 array['Cuádriceps', 'Pectoral', 'Core']::text[]),

('Burpee broad jump',
 'Burpee seguido de un salto horizontal hacia delante, y así sucesivamente. En HYROX se hace por metros (80 m).',
 '1) Burpee: pecho al suelo y vuelta a pies.
2) En vez de saltar hacia arriba, salto horizontal lo más lejos posible con los dos pies.
3) Aterrizar amortiguando y encadenar el siguiente burpee donde se cae.

Por metros. El salto sale de la cadera y los brazos: aterrizar con las rodillas hacia dentro es lo que hay que evitar.',
 array['Cuádriceps', 'Glúteos', 'Core']::text[]),

('Zancadas con saco (sandbag lunges)',
 'Zancadas caminando con un saco de arena sobre los hombros. En HYROX se hacen por metros (100 m).',
 '1) Saco sobre los hombros, detrás o delante de la cabeza, agarrado con las dos manos.
2) Paso largo al frente y bajar hasta que la rodilla de atrás roce el suelo.
3) Subir empujando con la pierna de delante y encadenar el siguiente paso.

Por metros. El torso vertical: si se inclina hacia delante, el saco empuja la espalda.',
 array['Cuádriceps', 'Glúteos', 'Core']::text[]),

('Toes to bar',
 'Colgado de la barra, llevar los pies a tocarla. Core y agarre; el gimnástico más habitual de CrossFit.',
 '1) Colgado de la barra, agarre a la anchura de los hombros.
2) Pequeño balanceo con el cuerpo en arco y luego cerrado.
3) Llevar los pies a tocar la barra entre las manos, tirando con el abdomen y los dorsales.
4) Bajar controlado y aprovechar el balanceo para la siguiente.

Las que pida el formato. Si no llegan los pies, escalar a rodillas al pecho.',
 array['Core', 'Espalda alta']::text[]),

('Handstand push-up',
 'Flexión en pino, con los pies apoyados en la pared. Fuerza de empuje por encima de la cabeza.',
 '1) Pino contra la pared, manos algo más abiertas que los hombros.
2) Bajar controlado hasta que la cabeza toque el suelo (o un cojín).
3) Empujar hasta bloquear los brazos.

Las que pida el formato. Si no se dominan, escalar a flexiones pica con los pies en un cajón.',
 array['Hombro', 'Tríceps']::text[]),

('Muscle-up',
 'De colgado a apoyo por encima de la barra o de las anillas en un solo movimiento. El gimnástico más técnico.',
 '1) Colgado, balanceo para cargar la cadera.
2) Tirón explosivo llevando la barra hacia la cadera.
3) Pasar el pecho por encima de la barra girando las muñecas.
4) Empujar hasta bloquear los brazos arriba.

Las que pida el formato. Pide dominadas y fondos de sobra antes de intentarlo.',
 array['Espalda alta', 'Pectoral', 'Tríceps']::text[])

) as v(nombre, descripcion, ejecucion, region)
where not exists (select 1 from ejercicios_biblioteca b where b.nombre = v.nombre);

/* ============================================================
   COMPROBACIÓN

     select nombre, grupo_muscular from ejercicios_biblioteca
      where grupo_muscular = 'Funcional' order by nombre;
   ============================================================ */
