-- ============================================================
-- TRIPULSE — Biblioteca de Fuerza · FASE 2: migracion de las 162 filas a etiquetas
--
-- REQUISITO: haber ejecutado antes biblioteca-fase1-esquema.sql.
--
-- Rellena tipo / region / disciplina / lesion / momento de los
-- ejercicios YA cargados, a partir de su grupo_muscular y del
-- mapeo de la wiki (B3-01, B4-01, B5-01, B5-02, B11-01).
--
-- NO toca grupo_muscular (sigue intacto hasta Fase 5).
-- Idempotente: todas las asignaciones son absolutas (SET = valor),
-- salvo el paso 7 que va guardado con 'not (... @> Rehab)'.
--
-- Criterio de los ejes:
--   region     → grupo anatomico (solo los 14 grupos musculares;
--                los "— especifico" y "Movilidad" no llevan region).
--   disciplina → transferencia de rendimiento a esa disciplina
--                (de los grupos "— especifico" + prioridades de B4-01).
--   lesion     → protocolo de rehab de B5 al que pertenece.
--   momento    → dinamico | estatico (solo movilidad, de B11-01).
-- ============================================================

begin;

-- ---------- 1. REGION (desde grupo_muscular, 14 grupos anatomicos) ----------
update ejercicios_biblioteca set region = (case grupo_muscular
  when 'Cuádriceps'                 then '{Cuádriceps}'
  when 'Isquiotibiales'             then '{Isquiotibiales}'
  when 'Glúteos'                    then '{Glúteos}'
  when 'Cadera y aductores'         then '{Cadera y aductores}'
  when 'Rodilla (fortalecimiento)'  then '{Rodilla}'
  when 'Tobillo y pie'              then '{Tobillo y pie}'
  when 'Core y estabilidad'         then '{Core}'
  when 'Espalda baja'               then '{Espalda baja}'
  when 'Espalda alta y romboides'   then '{Espalda alta}'
  when 'Pectoral'                   then '{Pectoral}'
  when 'Hombro y manguito rotador'  then '{Hombro}'
  when 'Bíceps'                     then '{Bíceps}'
  when 'Tríceps'                    then '{Tríceps}'
  when 'Cuello y cervical'          then '{Cuello}'
  else '{}'  -- "— especifico" y "Movilidad y flexibilidad": sin region
end)::text[];

-- ---------- 2. TIPO base (Movilidad vs Fuerza) ----------
update ejercicios_biblioteca set tipo =
  (case when grupo_muscular = 'Movilidad y flexibilidad' then '{Movilidad}' else '{Fuerza}' end)::text[];

-- ---------- 3. DISCIPLINA base (grupos "— especifico") ----------
update ejercicios_biblioteca set disciplina = (case grupo_muscular
  when 'Natación — específico' then '{Natación}'
  when 'Ciclismo — específico' then '{Ciclismo}'
  when 'Carrera — específico'  then '{Carrera}'
  else disciplina
end)::text[];

-- ---------- 4. DISCIPLINA por transferencia (prioridades de B4-01) ----------
-- Natacion
update ejercicios_biblioteca set disciplina = '{Natación}'
  where nombre in ('Dominadas','Remo con mancuerna unilateral','Rotacion externa con banda','Face pull');
-- Ciclismo
update ejercicios_biblioteca set disciplina = '{Ciclismo}'
  where nombre in ('Sentadilla bulgara','Curl nordico','Prensa unilateral');
-- Carrera
update ejercicios_biblioteca set disciplina = '{Carrera}'
  where nombre in ('Peso muerto rumano unilateral','Clamshell con banda','Heel drop excentrico (Alfredson)');
-- Hip thrust: transferencia doble (ciclismo + carrera, B4-01)
update ejercicios_biblioteca set disciplina = '{Ciclismo,Carrera}'
  where nombre in ('Hip thrust con barra','Hip thrust unilateral');

-- ---------- 5. MOMENTO (movilidad, de B11-01) ----------
update ejercicios_biblioteca set momento = '{estatico}'
  where nombre in ('Estiramiento de psoas','Estiramiento de TFL','Estiramiento de isquiotibiales',
    'Estiramiento de pantorrilla','Estiramiento de fascia plantar','Estiramiento de suboccipitales',
    'Foam roller de TFL y gluteo');
update ejercicios_biblioteca set momento = '{dinamico}'
  where nombre in ('Movilidad toracica en rotacion','Cadera 90/90','Gato-camello','Movilidad de hombro con palo');
update ejercicios_biblioteca set momento = '{dinamico,estatico}'
  where nombre in ('Movilidad de tobillo en pared');

-- ---------- 6. LESION (protocolos de rehab de B5) ----------
update ejercicios_biblioteca set lesion = '{femoropatelar}'
  where nombre in ('Puente de gluteo unilateral','Clamshell con banda','Step-up lateral','Sentadilla bulgara',
    'Sentadilla con pelota entre rodillas (VMO)','Step-down','Extension terminal de rodilla con banda (TKE)');
update ejercicios_biblioteca set lesion = '{tendinopatia-rotuliana}'
  where nombre in ('Sentadilla isometrica en pared','Spanish squat');
update ejercicios_biblioteca set lesion = '{cintilla-iliotibial}'
  where nombre in ('Abduccion de cadera en decubito lateral','Monster walk','Sentadilla lateral',
    'Peso muerto rumano unilateral','Plancha lateral con elevacion de cadera','Estiramiento de TFL',
    'Foam roller de TFL y gluteo');
update ejercicios_biblioteca set lesion = '{tendinopatia-aquiles}'
  where nombre in ('Heel drop excentrico (Alfredson)','Isometria de triceps sural en carga');
update ejercicios_biblioteca set lesion = '{fascia-plantar}'
  where nombre in ('Estiramiento de fascia plantar','Towel curl','Marble pickup','Short foot (pie corto)',
    'Plantarflexion excentrica','Estiramiento de pantorrilla');
update ejercicios_biblioteca set lesion = '{periostitis-tibial}'
  where nombre in ('Excentrico de tibial posterior','Dorsiflexion de tobillo con banda');
update ejercicios_biblioteca set lesion = '{hombro-nadador}'
  where nombre in ('Rotacion externa con banda','Rotacion interna con banda','Rotacion externa en decubito lateral',
    'Face pull','Wall slide (Y-T-W)','Remo horizontal con banda','Wall push-up plus (serrato)');
update ejercicios_biblioteca set lesion = '{lumbalgia-ciclista}'
  where nombre in ('Bird-dog','Dead bug','Plancha frontal','Puente de gluteo','Prone press-up (McKenzie)','Estiramiento de psoas');
update ejercicios_biblioteca set lesion = '{cervicalgia}'
  where nombre in ('Retraccion cervical (doble papada)','Isometria cervical multidireccional',
    'Estiramiento de suboccipitales','Extension cervical en prono','Remo con banda para trapecios medios');

-- ---------- 7. Anadir 'Rehab' a tipo donde haya lesion (preserva Fuerza/Movilidad) ----------
update ejercicios_biblioteca set tipo = tipo || '{Rehab}'
  where cardinality(lesion) > 0 and not (tipo @> '{Rehab}');

commit;

-- ============================================================
-- Verificacion (opcional)
-- ============================================================
-- Reparto por tipo:
-- select unnest(tipo) as t, count(*) from ejercicios_biblioteca group by t order by 2 desc;
-- Ejercicios sin region NI disciplina (deberian ser solo los "— especifico" sin region asignada):
-- select nombre, grupo_muscular from ejercicios_biblioteca where cardinality(region)=0 and cardinality(disciplina)=0;
-- Reparto por lesion:
-- select unnest(lesion) as l, count(*) from ejercicios_biblioteca group by l order by 2 desc;
