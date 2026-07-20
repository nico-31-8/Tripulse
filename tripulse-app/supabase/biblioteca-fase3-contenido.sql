-- ============================================================
-- TRIPULSE — Biblioteca de Fuerza · FASE 3: contenido nuevo
--   A) Movilidad (21, desde la nota B11-01) + Turkish get-up → ejercicios_biblioteca
--   B) Tests de valoracion (25, desde B3/B5/B6) → tests_valoracion
--
-- REQUISITO: Fases 1 y 2 ejecutadas.
--
-- IDEMPOTENTE:
--   A) INSERT ... WHERE NOT EXISTS por nombre (no duplica).
--   B) INSERT ... ON CONFLICT (nombre) DO NOTHING (indice unico de Fase 1).
--
-- grupo_muscular se sigue rellenando (la app lo usa hasta Fase 4).
-- Los estiramientos de rehab (fascia, TFL, psoas...) NO se recargan:
-- ya estaban en la biblioteca y se etiquetaron en Fase 2.
-- ============================================================

-- ============================================================
-- PARTE A — Movilidad + Turkish get-up
-- ============================================================
insert into ejercicios_biblioteca (nombre, grupo_muscular, descripcion, ejecucion, tipo, region, disciplina, momento)
select v.nombre, v.grupo_muscular, v.descripcion, v.ejecucion, v.tipo, v.region, v.disciplina, v.momento
from (values

-- Columna torácica
('Extension toracica sobre foam roller', 'Movilidad y flexibilidad',
 'Recupera la extension dorsal que pierde el ciclista tras horas en flexion; mejora la posicion aero y la respiracion.',
 E'1) Foam roller cruzado bajo las escapulas, manos tras la nuca.\n2) Extender la columna sobre el rodillo sin arquear la lumbar.\n3) Rodar segmento a segmento buscando las zonas rigidas.\n\n8-10 extensiones o mantener sobre los puntos rigidos.',
 '{Movilidad}'::text[], '{Espalda alta}'::text[], '{Ciclismo}'::text[], '{estatico}'::text[]),

('Rotacion toracica en cuadrupedia', 'Movilidad y flexibilidad',
 'Rotacion del segmento dorsal con estabilidad de core; mejora el roll del crol sin robar rango a la lumbar.',
 E'1) Cuadrupedia, una mano en la nuca.\n2) Rotar el codo hacia el techo abriendo el pecho.\n3) Volver llevando el codo hacia el brazo de apoyo.\n\n8-10 por lado.',
 '{Movilidad}'::text[], '{Espalda alta}'::text[], '{}'::text[], '{dinamico}'::text[]),

-- Cadera / flexores
('Couch stretch (estiramiento del sofa)', 'Movilidad y flexibilidad',
 'Cadena anterior completa (flexores + cuadriceps); contrarresta directamente el acortamiento del psoas por pedalear.',
 E'1) Rodilla trasera en el suelo con la espinilla vertical contra la pared, pie apuntando arriba.\n2) Pie delantero en apoyo, rodilla sobre el tobillo.\n3) Apretar gluteo y core, llevar la cadera al frente SIN bascular la pelvis.\n\n30-60 s (hasta 2 min) por lado. Si notas la lumbar y no la ingle, has perdido la retroversion.',
 '{Movilidad}'::text[], '{Cadera y aductores}'::text[], '{Ciclismo}'::text[], '{estatico}'::text[]),

('Estiramiento de flexor en semi-arrodillado', 'Movilidad y flexibilidad',
 'Version suave del couch stretch para el psoas de la pierna atrasada.',
 E'1) Una rodilla en el suelo, la otra al frente flexionada.\n2) Pelvis en retroversion, empujar el frente de la cadera hacia delante.\n3) Mantener 30 s por lado.',
 '{Movilidad}'::text[], '{Cadera y aductores}'::text[], '{Ciclismo}'::text[], '{estatico}'::text[]),

('World''s Greatest Stretch', 'Movilidad y flexibilidad',
 'Flexor de cadera + isquios + rotacion toracica en un solo gesto; cubre las tres zonas mas rigidas del triatleta.',
 E'1) Zancada profunda al frente.\n2) Llevar el codo hacia el suelo por dentro del pie delantero.\n3) Rotar el tronco abriendo ese brazo hacia el techo.\n4) Estirar la pierna delantera para el isquio.\n\n5-8 por lado.',
 '{Movilidad}'::text[], '{Cadera y aductores}'::text[], '{}'::text[], '{dinamico}'::text[]),

('Hip CARs (rotaciones articulares controladas)', 'Movilidad y flexibilidad',
 'Rango completo activo de la cadera; salud articular para el gesto repetitivo de correr y pedalear.',
 E'1) De pie, sujeto a un apoyo.\n2) Subir la rodilla al pecho, rotarla afuera, dibujar un circulo amplio y volver.\n3) Maximo control, sin compensar con la lumbar.\n\n5-8 circulos por direccion y pierna.',
 '{Movilidad}'::text[], '{Cadera y aductores}'::text[], '{}'::text[], '{dinamico}'::text[]),

('Pigeon pose (paloma)', 'Movilidad y flexibilidad',
 'Gluteo y rotadores externos de cadera; el gluteo tenso reduce el rango y empeora la zancada.',
 E'1) Espinilla delantera cruzada bajo el tronco, pierna trasera extendida.\n2) Bajar el pecho hacia el suelo manteniendo la cadera cuadrada.\n3) Mantener 60 s por lado.',
 '{Movilidad}'::text[], '{Glúteos}'::text[], '{Carrera}'::text[], '{estatico}'::text[]),

('Cossack squat', 'Movilidad y flexibilidad',
 'Rango de cadera en el plano frontal y longitud de aductores; movilidad lateral que los gestos sagitales no dan.',
 E'1) Pies muy anchos, puntas ligeramente afuera.\n2) Descender sobre una pierna manteniendo la otra estirada, talon en el suelo.\n3) Alternar de lado a lado.\n\n6-8 por lado.',
 '{Movilidad}'::text[], '{Cadera y aductores}'::text[], '{}'::text[], '{dinamico}'::text[]),

-- Tobillo
('Ankle rocks (balanceos de tobillo)', 'Movilidad y flexibilidad',
 'Gemelo, tibial anterior y movilidad del tobillo; prepara la pierna baja para la propulsion y amortiguacion.',
 E'1) De pie o en semi-arrodillado.\n2) Alternar elevacion de talon (puntas) y tirar de las puntas hacia la espinilla.\n\n30-45 s.',
 '{Movilidad}'::text[], '{Tobillo y pie}'::text[], '{Carrera}'::text[], '{dinamico}'::text[]),

('Distraccion de tobillo con banda', 'Movilidad y flexibilidad',
 'Capsula anterior del tobillo; util cuando la dorsiflexion esta bloqueada por pinzamiento y no por el gemelo.',
 E'1) Banda anclada baja, rodeando el tobillo y tirando hacia atras.\n2) Avanzar la rodilla sobre la punta del pie sin levantar el talon.\n\n10-15 movilizaciones por lado.',
 '{Movilidad}'::text[], '{Tobillo y pie}'::text[], '{}'::text[], '{dinamico}'::text[]),

-- Hombro
('Sleeper stretch', 'Movilidad y flexibilidad',
 'Capsula posterior del hombro y rotacion interna que necesita el crol; reduce el riesgo de hombro de nadador.',
 E'1) De lado sobre el hombro a estirar, codo a 90 grados.\n2) Con la otra mano, empujar suave el dorso de la mano hacia el suelo.\n3) Mantener 20-30 s por lado.\n\nSuave: es capsula, no fuerza.',
 '{Movilidad}'::text[], '{Hombro}'::text[], '{Natación}'::text[], '{estatico}'::text[]),

('Estiramiento de pectoral en marco de puerta', 'Movilidad y flexibilidad',
 'Pectoral y frente del hombro; contrarresta la postura cerrada de nadar y pedalear.',
 E'1) Antebrazo apoyado en el marco, codo a 90 grados.\n2) Avanzar un paso y girar el tronco al lado contrario.\n3) Mantener 20-30 s por lado.',
 '{Movilidad}'::text[], '{Pectoral}'::text[], '{Natación}'::text[], '{estatico}'::text[]),

('Estiramiento de dorsal (postura del nino con alcance)', 'Movilidad y flexibilidad',
 'Dorsal ancho; su rigidez limita el catch alto de la brazada y la posicion de streamline.',
 E'1) Desde cuadrupedia, sentarse sobre los talones.\n2) Brazos extendidos al frente, pecho hacia el suelo.\n3) Mantener 20-30 s.',
 '{Movilidad}'::text[], '{Espalda alta}'::text[], '{Natación}'::text[], '{estatico}'::text[]),

('Wall angels', 'Movilidad y flexibilidad',
 'Control escapular y espalda alta; combate los hombros redondeados del ciclista y abre para la posicion aero.',
 E'1) Espalda contra la pared, brazos en posicion de cactus.\n2) Deslizar los brazos arriba manteniendo munecas y codos en contacto con la pared.\n3) Bajar controlado.\n\n12-15 reps. Si se despegan, reducir el rango.',
 '{Movilidad}'::text[], '{Hombro}'::text[], '{Natación}'::text[], '{dinamico}'::text[]),

('Circulos de brazos', 'Movilidad y flexibilidad',
 'Movilidad de hombro y apertura de pecho; activacion antes de nadar y mejor mecanica respiratoria al correr.',
 E'1) De pie, brazos extendidos.\n2) Circulos amplios adelante y luego atras.\n\n30-45 s.',
 '{Movilidad}'::text[], '{Hombro}'::text[], '{Natación}'::text[], '{dinamico}'::text[]),

-- Isquios / gemelo / aductor
('Estiramiento de gemelo (rodilla recta)', 'Movilidad y flexibilidad',
 'Gastrocnemio, que cruza la rodilla; su rigidez limita la dorsiflexion y sobrecarga el Aquiles.',
 E'1) Contra la pared, pierna a estirar atrasada, talon en el suelo.\n2) Rodilla trasera EXTENDIDA, empujar la cadera al frente.\n3) Mantener 30-60 s por lado.',
 '{Movilidad}'::text[], '{Tobillo y pie}'::text[], '{Carrera}'::text[], '{estatico}'::text[]),

('Estiramiento de soleo (rodilla flexionada)', 'Movilidad y flexibilidad',
 'Soleo, clave en el despegue de la carrera; se aisla flexionando la rodilla.',
 E'1) Misma posicion que el gemelo pero con la rodilla trasera FLEXIONADA.\n2) Talon pegado al suelo.\n3) Mantener 30-60 s por lado.',
 '{Movilidad}'::text[], '{Tobillo y pie}'::text[], '{Carrera}'::text[], '{estatico}'::text[]),

('Leg swings (balanceos de pierna)', 'Movilidad y flexibilidad',
 'Moviliza la cadera en ambos planos; calentamiento estandar antes de correr.',
 E'1) Sujeto a un apoyo.\n2) Balancear la pierna adelante-atras, controlado.\n3) Luego lado a lado.\n\n10-12 por direccion y pierna.',
 '{Movilidad}'::text[], '{Cadera y aductores}'::text[], '{Carrera}'::text[], '{dinamico}'::text[]),

('Frog stretch (rana)', 'Movilidad y flexibilidad',
 'Aductores; su rigidez limita la apertura de cadera, poco estimulada por gestos puramente sagitales.',
 E'1) Cuadrupedia con las rodillas muy abiertas, tobillos en linea con las rodillas.\n2) Empujar la cadera hacia atras.\n3) Mantener 30-45 s.',
 '{Movilidad}'::text[], '{Cadera y aductores}'::text[], '{}'::text[], '{estatico}'::text[]),

-- Columna general
('Giro lumbar en tendido (supine twist)', 'Movilidad y flexibilidad',
 'Lumbar y cadera; alivia la rigidez de la flexion mantenida en la bici.',
 E'1) Boca arriba, rodillas flexionadas juntas.\n2) Llevar las rodillas a un lado con los hombros pegados al suelo.\n3) 10 reps o mantener 20-30 s por lado.',
 '{Movilidad}'::text[], '{Espalda baja}'::text[], '{}'::text[], '{dinamico,estatico}'::text[]),

('Postura del nino (child''s pose)', 'Movilidad y flexibilidad',
 'Descompresion de columna y caderas; estiramiento suave de la espalda post-sesion.',
 E'1) Sentado sobre los talones, brazos al frente.\n2) Frente hacia el suelo, relajar.\n3) Mantener 30 s.',
 '{Movilidad}'::text[], '{Espalda baja}'::text[], '{}'::text[], '{estatico}'::text[]),

-- Fuerza — el que faltaba
('Turkish get-up', 'Core y estabilidad',
 'Patron completo (bisagra, zancada, empuje, carga y rotacion) en los tres planos; fuerza y estabilidad de todo el cuerpo.',
 E'1) Tumbado, kettlebell o mancuerna en un brazo extendido hacia el techo.\n2) Incorporarse por fases: rodar al codo, a la mano, elevar la cadera, pasar a semi-arrodillado.\n3) Ponerse de pie sin dejar de mirar el peso, siempre vertical.\n4) Deshacer el camino paso a paso hasta tumbarse.\n\n3-5 por lado, carga ligera al aprender. La vista siempre en el peso.',
 '{Fuerza}'::text[], '{Core}'::text[], '{}'::text[], '{}'::text[])

) as v(nombre, grupo_muscular, descripcion, ejecucion, tipo, region, disciplina, momento)
where not exists (
  select 1 from ejercicios_biblioteca e where e.nombre = v.nombre
);

-- ============================================================
-- PARTE B — Tests de valoracion
-- ============================================================
insert into tests_valoracion (nombre, descripcion, protocolo, valor_referencia, interpretacion, categoria, region, disciplina, lesion) values

-- Funcionales (fuerza / estabilidad)
('Sentadilla monopodal (single-leg squat)',
 'Test funcional clave del sindrome femoropatelar; evalua gluteo medio y control de rodilla.',
 '5 repeticiones por pierna, observando la rodilla de frente (idealmente con video o espejo).',
 'valgo <10 grados = correcto',
 'valgo >15 grados → debilidad de gluteo medio → priorizar su fortalecimiento antes de cargar.',
 '{funcional}', '{Rodilla,Cadera y aductores}', '{}', '{femoropatelar}'),

('Puente de gluteo unilateral (test)',
 'Evalua la fuerza del gluteo maximo y el control de la caida pelvica.',
 'Puente sobre un pie, la otra pierna extendida; mantener con la cadera alineada.',
 'mantener 30 s sin caida de pelvis = correcto',
 'Caida de la hemipelvis → gluteo maximo insuficiente.',
 '{funcional}', '{Glúteos}', '{}', '{}'),

('Plancha frontal (test)',
 'Evalua la resistencia del core anterior.',
 'Tiempo maximo en plancha con forma correcta.',
 '>60 s = adecuado para triatleta',
 'Por debajo de 60 s el core fallara en la parte final de la carrera y en rodajes largos en bici.',
 '{funcional}', '{Core}', '{}', '{}'),

('Plancha lateral (test)',
 'Evalua el core lateral y el gluteo medio, y detecta asimetrias.',
 'Tiempo maximo por lado con forma correcta.',
 '>40 s = adecuado; asimetria >10 s entre lados = desequilibrio',
 'El lado mas debil marca el que hay que trabajar.',
 '{funcional}', '{Core}', '{}', '{}'),

('Step-down (test)',
 'Test y ejercicio del control neuromuscular de la rodilla.',
 'De pie sobre un escalon, bajar la pierna contraria lentamente observando la rodilla de apoyo.',
 'sin valgo = correcto',
 'Valgo dinamico → corregir el control de rodilla y gluteo medio antes de anadir carga.',
 '{funcional}', '{Rodilla}', '{}', '{femoropatelar}'),

('Single-leg glute bridge (estabilidad pelvica)',
 'Test de estabilidad pelvica y gluteo medio (bike fit, B6-08).',
 'Puente sobre un pie con la otra pierna extendida; mantener 10 s.',
 'pelvis horizontal los 10 s en ambos lados = correcto',
 'Caida <5 grados = asimetria leve; caida >5 grados o incapaz de extender = debilidad significativa de gluteo medio.',
 '{funcional}', '{Glúteos,Cadera y aductores}', '{Ciclismo}', '{}'),

('Heel drop unilateral (test)',
 'Screening rapido de la salud del tendon de Aquiles.',
 '15 repeticiones de heel drop unilateral, valorando el dolor.',
 '15 repeticiones sin dolor = tendon sano',
 'Dolor durante las repeticiones → sospecha de tendinopatia; combinar con el heel drop test.',
 '{funcional}', '{Tobillo y pie}', '{Carrera}', '{tendinopatia-aquiles}'),

-- Movilidad / screening
('Sit-and-reach modificado',
 'Valora la longitud de los isquiotibiales; screening previo a la posicion aero.',
 'Sentado con las piernas extendidas, alcanzar los pies.',
 '+10cm o mas = puede asumir posicion TT agresiva; mas de -10cm = no candidato a posicion aero',
 'Isquios cortos obligan a una posicion de bici mas conservadora hasta ganar rango.',
 '{movilidad}', '{Isquiotibiales}', '{Ciclismo}', '{}'),

('Test de Thomas',
 'Valora la longitud de los flexores de cadera / psoas.',
 'Decubito supino al borde de la camilla, llevar una rodilla al pecho y observar la pierna opuesta.',
 'pierna opuesta horizontal (rodilla a 90 grados) = psoas flexible',
 'Elevacion >10 grados → psoas muy acortado; riesgo alto de impingement y de lordosis en bici.',
 '{movilidad}', '{Cadera y aductores}', '{Ciclismo}', '{}'),

('Test FABER (Patrick)',
 'Valora la rotacion externa de la cadera.',
 'Decubito supino, tobillo sobre la rodilla contraria (figura de 4); medir la distancia rodilla-camilla.',
 '<5cm = buena rotacion externa; >15cm = muy limitada, evaluar con fisio',
 'Limitacion → puede requerir ajuste de calas en la bici.',
 '{movilidad}', '{Cadera y aductores}', '{Ciclismo}', '{}'),

('Test de rotacion toracica',
 'Valora la movilidad rotacional del segmento dorsal.',
 'De pie, brazos cruzados sobre el pecho, rotar el tronco a cada lado.',
 '>45 grados por lado = correcta; <35 grados = torax rigido',
 'Por debajo de 35 grados, no forzar la posicion TT: la lumbar y el cuello compensaran.',
 '{movilidad}', '{Espalda alta}', '{Ciclismo}', '{}'),

('Knee-to-wall (dorsiflexion de tobillo)',
 'Valora la dorsiflexion del tobillo, clave para la carrera y la sentadilla.',
 'Punta del pie a distancia creciente de la pared, llevar la rodilla a tocar sin levantar el talon.',
 '>10cm = correcta; 7-10cm = limite; <7cm = limitada',
 'Dorsiflexion limitada → el pie compensa en puntilla y se pierde amortiguacion; corregir antes de cargar la sentadilla.',
 '{movilidad}', '{Tobillo y pie}', '{Carrera}', '{}'),

('Hip extension test',
 'Valora la extensibilidad de los flexores/isquios que condiciona el overstriding.',
 'Decubito prono, extension pasiva de la cadera.',
 '<10 grados = isquiotibiales/flexores tensos',
 'Rango pobre → overstriding practicamente inevitable; trabajar movilidad de cadera.',
 '{movilidad}', '{Isquiotibiales}', '{Carrera}', '{}'),

('Angulo de rodilla en el pedaleo',
 'Valoracion de bike fit: altura de sillin por el angulo de rodilla.',
 'En el punto mas bajo del pedaleo (6 horas), medir la flexion de rodilla.',
 '25-35 grados de flexion = correcto',
 'Menos de 25 grados → sillin demasiado bajo (dolor anterior de rodilla); mas de 35 → demasiado alto.',
 '{movilidad}', '{Rodilla}', '{Ciclismo}', '{}'),

('Deteccion de varo de antepie',
 'Detecta el varo de antepie que hace colapsar la rodilla en el pedaleo.',
 'Con el retropie en neutro, observar la inclinacion del antepie; y la rodilla al pedalear.',
 'leve 1-4 grados / moderado 5-8 grados / severo >8 grados',
 'Rodilla que colapsa hacia dentro SOLO al pedalear (no en estatico) → sospecha de varo; valorar cunas en la cala.',
 '{movilidad}', '{Tobillo y pie}', '{Ciclismo}', '{}'),

('Test de longitud de piernas',
 'Detecta dismetria de piernas relevante para el ajuste de la bici.',
 'Decubito supino, comparar maleolos internos y espinas iliacas; o asimetria de potencia por pierna en Z2.',
 'diferencia >5-6mm en ciclismo requiere compensacion; asimetria de potencia >5% sostenida es relevante',
 '<3mm no requiere; 3-6mm anadir cuna (shim); >6mm shim y derivar.',
 '{movilidad}', '{}', '{Ciclismo}', '{}'),

-- Clinicos de deteccion de lesion
('Heel drop test (Alfredson)',
 'Diferencia la tendinopatia del cuerpo del Aquiles de la insercional.',
 'De puntillas en el borde de un escalon con las dos piernas, bajar lentamente con una.',
 'reproduccion del dolor en el cuerpo del tendon vs rigidez sin dolor',
 'Reproduce dolor → tendinopatia del cuerpo (heel drop excentrico). Rigidez sin dolor → insercional (protocolo distinto: isometricos, NO heel drop).',
 '{clinico}', '{Tobillo y pie}', '{Carrera}', '{tendinopatia-aquiles}'),

('Windlass test',
 'Test de confirmacion de la fascitis plantar.',
 'De pie, extension pasiva del primer dedo del pie.',
 'sensibilidad 32%, especificidad 100%',
 'Reproduce el dolor en el talon → diagnostico casi confirmado de fascitis plantar (muy especifico).',
 '{clinico}', '{Tobillo y pie}', '{Carrera}', '{fascia-plantar}'),

('Test de Ober',
 'Valora la tension de la cintilla iliotibial.',
 'Decubito lateral, el examinador abduce y extiende la cadera superior y la deja caer.',
 'la pierna no cae (queda en abduccion) = IT band tensa',
 'Positivo → cintilla tensa; reforzar gluteo medio y trabajar movilidad de TFL.',
 '{clinico}', '{Cadera y aductores}', '{Carrera}', '{cintilla-iliotibial}'),

('Test de Noble',
 'Test de compresion para el sindrome de la cintilla iliotibial.',
 'Rodilla a 30 grados de flexion, comprimir el epicondilo lateral del femur.',
 'reproduce el dolor exacto del corredor = positivo',
 'Positivo → diagnostico probable de sindrome de la cintilla iliotibial.',
 '{clinico}', '{Rodilla}', '{Carrera}', '{cintilla-iliotibial}'),

('Test de Neer',
 'Test de impingement subacromial (hombro del nadador).',
 'El examinador estabiliza la escapula y eleva el brazo en rotacion interna.',
 'sensibilidad 72%, especificidad 60%',
 'Dolor en el arco 70-120 grados → impingement subacromial.',
 '{clinico}', '{Hombro}', '{Natación}', '{hombro-nadador}'),

('Test de Hawkins-Kennedy',
 'Test de impingement del supraespinoso.',
 'Hombro y codo a 90 grados, el examinador rota internamente el brazo.',
 'sensibilidad 79%, especificidad 59%',
 'Dolor → impingement del supraespinoso bajo el ligamento coracoacromial.',
 '{clinico}', '{Hombro}', '{Natación}', '{hombro-nadador}'),

('Test de Jobe (empty can)',
 'Valora la integridad del supraespinoso.',
 'Brazo en abduccion 90 grados y rotacion interna (pulgar al suelo), resistir la elevacion.',
 'sensibilidad 69%, especificidad 66%',
 'Dolor o debilidad → lesion del supraespinoso.',
 '{clinico}', '{Hombro}', '{Natación}', '{hombro-nadador}'),

('Test de Schober',
 'Valora la movilidad en flexion de la columna lumbar.',
 'Marcar S1 y un punto 10 cm superior, flexion anterior maxima.',
 'la distancia aumenta >=5 cm = normal; <5 cm = reducida',
 'Movilidad reducida → rigidez lumbar; factor en la lumbalgia del ciclista.',
 '{clinico}', '{Espalda baja}', '{Ciclismo}', '{lumbalgia-ciclista}'),

('Prone press-up (McKenzie) — test',
 'Diferencia la lumbalgia mecanica del componente discal.',
 'Decubito prono, extension de codos empujando el tronco arriba con la pelvis en el suelo.',
 'alivia/centraliza vs reproduce/irradia el dolor',
 'Alivia o centraliza → lumbalgia mecanica por flexion prolongada (seguir extensiones). Reproduce o irradia a la pierna → posible componente discal, derivar.',
 '{clinico}', '{Espalda baja}', '{Ciclismo}', '{lumbalgia-ciclista}'),

('Hop test',
 'Screening de fractura por estres tibial.',
 'Saltar 10 veces sobre la pierna afectada.',
 'dolor localizado = positivo',
 'Positivo → alta probabilidad de fractura por estres → STOP inmediato de carrera y derivar a medico.',
 '{clinico}', '{Tobillo y pie}', '{Carrera}', '{periostitis-tibial}')

on conflict (nombre) do nothing;

-- ============================================================
-- Verificacion (opcional)
-- ============================================================
-- select count(*) from ejercicios_biblioteca;                 -- deberia subir de 162 a 184
-- select count(*) from tests_valoracion;                      -- 26
-- select unnest(tipo) t, count(*) from ejercicios_biblioteca group by t order by 2 desc;
-- select categoria, count(*) from (select unnest(categoria) categoria from tests_valoracion) s group by categoria;
