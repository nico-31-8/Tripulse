/* ============================================================
   BIBLIOTECA · SEPARAR LA TECNICA DE LA FUERZA

   REQUISITO: haber ejecutado biblioteca-fase1-esquema.sql y fase2-migracion.sql
   (que son los que crean `tipo` y `disciplina` y rellenan todo como {Fuerza}).

   Hoy los 33 ejercicios "— especifico" estan TODOS marcados como {Fuerza}, y ahi
   conviven dos cosas que no se parecen en nada: lo que se hace en el gimnasio
   (box jump, Pallof press, dominadas) y lo que se hace en la pista o en la piscina
   (A-skip, sculling, talones al gluteo). Con todo marcado igual, para mandar un
   A-skip habia que crear una sesion de FUERZA, y esos 3x20 m contaban como carga
   de fuerza dentro de una semana de carrera.

   PARTE A reetiqueta los 9 que son tecnica. PARTE B mete los 9 drills del vault
   que faltaban.

   `tipo` es una lista, asi que un ejercicio puede ser las dos cosas: un A-skip es
   tecnica Y es stiffness, y su propia descripcion ya lo decia. Solo se le quita
   {Fuerza} a lo que no carga nada.

   NO se toca `grupo_muscular` (la app lo sigue usando) ni `region` ni `lesion`.
   Ninguno de los 9 reetiquetados tiene lesion asignada, asi que ninguno pierde su
   marca {Rehab}: se comprobo antes de escribir esto.

   Idempotente: la PARTE A asigna valores absolutos y la PARTE B no inserta lo que
   ya existe por nombre.

   Del vault (B6-01): los ejercicios tecnicos van al INICIO de la sesion, sin
   fatiga. Un drill con fatiga muscular refuerza el patron incorrecto.

   OJO CON LA TILDE: la etiqueta es «Técnica» CON tilde. El comentario del esquema
   de la Fase 1 la escribe sin ella, pero quien manda es el dato: /fuerza filtra por
   'Técnica', igual que por 'Natación' y 'Cuádriceps'. Escrita sin tilde, el chip de
   esa pantalla no encontraria nada nunca y la etiqueta saldria en gris, sin que
   nada fallara a la vista.
   ============================================================ */

begin;

/* ============================================================
   PARTE A — los que estaban archivados como fuerza y son tecnica
   ============================================================ */

/* Tecnica pura: no cargan nada. La descripcion de cada uno ya lo decia.
     Sculling                     "el ejercicio del feel for the water"
     Pedaleo unilateral           "revela y corrige las asimetrias"
     Ankling                      "stiffness de tobillo y cadencia"
     Talones al gluteo            "drill de calentamiento"
     Strides                      "sin la carga de un intervalo"                */
update ejercicios_biblioteca set tipo = '{Técnica}'::text[]
  where nombre in ('Sculling', 'Pedaleo unilateral en rodillo', 'Ankling',
                   'Talones al gluteo', 'Strides (zancadas progresivas)');

/* Las dos cosas a la vez. Aqui quitar {Fuerza} seria mentir en el otro sentido:
     Nado con palas               drill de catch en B6-01, y ademas carga el hombro
     Nado con banda en tobillos   posicion corporal, y la traccion sostiene el cuerpo
     Bounding                     "potencia horizontal y cadencia"
     A-skip                       "tecnica y stiffness a la vez", literal          */
update ejercicios_biblioteca set tipo = '{Fuerza,Técnica}'::text[]
  where nombre in ('Nado con palas', 'Nado con banda en los tobillos',
                   'Bounding', 'Skipping alto (A-skip)');

/* Los otros 24 "— especifico" se quedan como estan, y con motivo: box jump, depth
   jump, SFR, cuestas cortas, trineo, step-ups, Pallof, dominadas y las poleas son
   carga de verdad, no patron de movimiento. */

/* ============================================================
   PARTE B — los drills del vault que no estaban

   Natación (B6-01 PARTE 6): faltaban 6 de los 7. Solo estaba "nado con palas".
   Carrera  (B6-03 PARTE 6): faltaban 3. A-skip, ankling, bounding y strides ya
                             estaban, aunque archivados como fuerza.
   Ciclismo: B6-02 va de bike fit y de pedaleo, no trae tabla de drills, asi que
             NO se inventa ninguno. Se queda con el pedaleo unilateral que ya habia.
   ============================================================ */

insert into ejercicios_biblioteca (nombre, grupo_muscular, descripcion, ejecucion, tipo, region, disciplina)
select v.nombre, v.grupo_muscular, v.descripcion, v.ejecucion, v.tipo, v.region, v.disciplina
from (values

('Catch-up', 'Natación — específico',
 'Timing de la brazada y extensión completa. El error que corrige es empezar a tirar antes de haber terminado de extender.',
 E'1) Un brazo espera extendido delante.\n2) El otro hace la brazada entera hasta tocar la mano que espera.\n3) Solo cuando se tocan sale el siguiente brazo.\n4) Exagerar el deslizamiento en la extensión.\n\n4x50 m.',
 '{Técnica}'::text[], '{}'::text[], '{Natación}'::text[]),

('Fingertip drag', 'Natación — específico',
 'Recobro con codo alto. Si el codo cae, las yemas dejan de rozar el agua y el fallo se nota solo.',
 E'1) Durante el recobro, arrastrar las yemas por la superficie.\n2) El codo va alto y por delante de la mano.\n3) Mantener la rotación del cuerpo: sin rotar, el codo alto es imposible.\n\n4x50 m.',
 '{Técnica}'::text[], '{}'::text[], '{Natación}'::text[]),

('Fist drill (puños cerrados)', 'Natación — específico',
 'Propiocepción del antebrazo en el catch. Sin mano, la propulsión depende del antebrazo, que es lo que casi nadie usa.',
 E'1) Nadar con los puños cerrados.\n2) Buscar apoyo con el antebrazo, no con la mano.\n3) Al abrir las manos despues, la sensación de agarre es mucho mayor: ese contraste es el ejercicio.\n\n4x50 m.',
 '{Técnica}'::text[], '{}'::text[], '{Natación}'::text[]),

('Side kick (patada lateral)', 'Natación — específico',
 'Rotación y posición corporal. Enseña a nadar de costado, que es la posición real del crol.',
 E'1) De costado, brazo de abajo extendido y brazo de arriba pegado al cuerpo.\n2) Batido continuo desde la cadera.\n3) Mirada al fondo y cabeza alineada con la columna.\n4) Para respirar, girar la cara sin sacar el hombro.\n\n4x25 m por lado.',
 '{Técnica}'::text[], '{}'::text[], '{Natación}'::text[]),

('Single arm (un brazo)', 'Natación — específico',
 'Catch y pull unilateral con foco. Al hacer uno cada vez se puede pensar en lo que hace la mano.',
 E'1) Nada un solo brazo; el otro espera extendido delante.\n2) Rotar el cuerpo igual que en el crol completo.\n3) Cambiar de brazo cada 50.\n\n4x50 m alternando.',
 '{Técnica}'::text[], '{}'::text[], '{Natación}'::text[]),

('Sighting practice', 'Natación — específico',
 'Integrar el sighting sin perder velocidad. En aguas abiertas se pierde mas tiempo nadando torcido que levantando la cabeza.',
 E'1) Levantar los ojos justo antes de la respiración: ojos fuera, boca dentro.\n2) Volver la cara al agua y respirar de lado, como siempre.\n3) Dos o tres brazadas entre cada sighting.\n\nEn todas las sesiones de aguas abiertas.',
 '{Técnica}'::text[], '{}'::text[], '{Natación}'::text[]),

('B-skip', 'Carrera — específico',
 'Extensión de pierna y ciclo completo de zancada. Es el A-skip con la parte que le falta.',
 E'1) A-skip: elevar la rodilla hasta la horizontal.\n2) En el punto alto, extender la pierna hacia delante.\n3) Recoger y empujar el suelo hacia abajo y atras.\n\n2x20-30 m.',
 '{Técnica}'::text[], '{}'::text[], '{Carrera}'::text[]),

('High knees', 'Carrera — específico',
 'Cadencia y elevación de rodilla. Frecuencia por encima de todo lo demas.',
 E'1) Pasos en el mismo sitio o avanzando muy poco.\n2) A la máxima frecuencia posible.\n3) Tronco erguido, sin echarse atrás al elevar.\n\n2x20-30 m.',
 '{Técnica}'::text[], '{}'::text[], '{Carrera}'::text[]),

('Carioca', 'Carrera — específico',
 'Disociación entre caderas y hombros. La cadera rota y el tronco se queda quieto.',
 E'1) Desplazamiento lateral cruzando una pierna por delante y la siguiente por detrás.\n2) Los hombros miran al frente todo el rato: lo que gira es la cadera.\n3) Subir la frecuencia sin perder el cruce.\n\n2x20-30 m por lado.',
 '{Técnica}'::text[], '{}'::text[], '{Carrera}'::text[])

) as v(nombre, grupo_muscular, descripcion, ejecucion, tipo, region, disciplina)
where not exists (
  select 1 from ejercicios_biblioteca e where e.nombre = v.nombre
);

commit;

/* ============================================================
   Comprobacion
   ============================================================ */

/* Cuantos hay de cada tipo. Tecnica deberia dar 18: los 9 reetiquetados mas los 9
   nuevos (los 4 que llevan {Fuerza,Tecnica} cuentan en las dos filas). */
select unnest(tipo) as tipo, count(*)
  from ejercicios_biblioteca group by 1 order by 2 desc;

/* La lista completa de tecnica por disciplina: esto es EXACTAMENTE lo que vas a
   ver en el desplegable al elegir «Tecnica» en una sesion de resistencia. */
select coalesce(disciplina[1], 'sin disciplina') as disciplina, nombre, tipo
  from ejercicios_biblioteca
 where tipo @> '{Técnica}'
 order by 1, 2;
