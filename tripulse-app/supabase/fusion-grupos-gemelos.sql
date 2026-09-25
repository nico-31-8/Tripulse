/* ============================================================
   Fusión de los grupos gemelos de la biblioteca (2026-09-25)
   ============================================================
   El desplegable de grupo muscular tenía 22 grupos, y dos sobraban:

   · «Espalda alta» (1 ejercicio) era el mismo sitio que «Espalda alta y
     romboides» (10), escrito de dos formas.
   · «Otros» (4) era el cajón de los que se crearon SIN REGIÓN: cuando un
     ejercicio nuevo no trae región, `grupoAlCrear` lo manda ahí.

   A cada uno se le da el grupo de sus hermanos, que es lo que resuelve las
   dudas sin adivinar: los seis «Remo…» ya estaban en espalda alta y romboides,
   «Excéntrico de tibial posterior» en tobillo y pie, y «Estiramiento de TFL»
   en movilidad.

   Los cinco tienen CERO usos en sesiones, así que no hay histórico que mover.
   Se actualiza `ejercicios` igualmente para que la operación sea correcta por
   construcción: si alguno se usara entre que esto se escribe y se aplica, el
   reparto de series por grupo seguiría cuadrando.

   El grifo se cierra aparte, en lib/grupo-ejercicio: las regiones de /fuerza
   se llaman más corto que los grupos («Rodilla» vs «Rodilla (fortalecimiento)»)
   y sin eso volverían a nacer gemelos con el siguiente ejercicio. */

UPDATE ejercicios_biblioteca SET grupo_muscular = 'Espalda alta y romboides'
 WHERE nombre IN ('Remo unilateral con goma en posición de caballero', 'Remo en P.C con goma');

UPDATE ejercicios_biblioteca SET grupo_muscular = 'Tobillo y pie'
 WHERE nombre = 'Fuerza de tibial posterior';

/* Los dos estiramientos estaban marcados como tipo Fuerza. Son Movilidad, como
   su hermano «Estiramiento de TFL». */
UPDATE ejercicios_biblioteca
   SET grupo_muscular = 'Movilidad y flexibilidad', tipo = ARRAY['Movilidad','Rehab']
 WHERE nombre IN ('Estiramiento TFL 2', 'Esitramiento del TFL 3');

UPDATE ejercicios_biblioteca SET nombre = 'Estiramiento del TFL 3'
 WHERE nombre = 'Esitramiento del TFL 3';

UPDATE ejercicios SET grupo_muscular = 'Espalda alta y romboides'
 WHERE nombre IN ('Remo unilateral con goma en posición de caballero', 'Remo en P.C con goma');

UPDATE ejercicios SET grupo_muscular = 'Tobillo y pie'
 WHERE nombre = 'Fuerza de tibial posterior';

UPDATE ejercicios SET grupo_muscular = 'Movilidad y flexibilidad'
 WHERE nombre IN ('Estiramiento TFL 2', 'Esitramiento del TFL 3');

UPDATE ejercicios SET nombre = 'Estiramiento del TFL 3'
 WHERE nombre = 'Esitramiento del TFL 3';
