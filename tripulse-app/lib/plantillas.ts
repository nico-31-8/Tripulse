// ============================================================
// TRIPULSE — Catálogo de plantillas de sesión
// ============================================================
// Una plantilla es un ESQUELETO de sesión: bloques ordenados con su zona y su
// volumen. No guarda ritmos ni potencias — guarda ZONAS, y el ritmo lo pone cada
// atleta a partir de sus tests (lib/zonas.ts). Por eso la misma plantilla es un
// entrenamiento distinto para cada uno: "6×1000m AEM" son ritmos diferentes según
// la VAM de cada cual.
//
// FUENTES (base de Obsidian del usuario):
//   · deporte/.../B1-00c-Tablas-Zonas-Por-Disciplina.md   → Tabla 3 carrera (Tuimil),
//     Tabla 1B natación (CSS), Tabla 2 ciclismo (Coggan)
//   · deporte/.../B1-00d-Sesiones-Tipo-Ciclismo-Natacion.md → sesiones tipo por zona
//   · deporte/.../B1-00e-Equivalencias-Zonas2-TRIPULSE.md   → el puente entre las 9
//     siglas de la app y esos sistemas. LEER ESA NOTA antes de tocar este catálogo.
//
// LOS NIVELES SALEN DE LOS RANGOS DOCUMENTADOS (regla de B1-00e §4): cuando la
// fuente dice "6–12 × 100–200m", ese rango ya es el abanico de atletas. Extremo
// bajo = principiante, medio = intermedio, alto = avanzado. Así hay tres niveles
// sin inventar volúmenes.
//
// PRESCRIPCIÓN POR DISCIPLINA (B1-00e §4):
//   · Ciclismo → por TIEMPO. lib/duracion.ts no estima el ciclismo por distancia.
//   · Natación → por DISTANCIA (es lo que controla el entrenador en la piscina).
//   · Carrera  → por distancia (series) o tiempo (continuos).
import { ZONAS_RESISTENCIA } from './zonas'
import { VARIANTES } from './plantillas-variantes'
import type {
  NivelPlantilla, OrigenPlantilla, BloqueP, PlantillaSesion, VarianteSesion,
} from './plantillas-tipos'

// Los tipos viven en `plantillas-tipos.ts` para que este módulo pueda importar
// las variantes sin ciclo. Se reexportan aquí para que nadie tenga que cambiar
// de dónde importa.
export type { NivelPlantilla, OrigenPlantilla, BloqueP, PlantillaSesion, VarianteSesion }

export const NIVELES: { id: NivelPlantilla; label: string }[] = [
  { id: 'principiante', label: 'Principiante' },
  { id: 'intermedio', label: 'Intermedio' },
  { id: 'avanzado', label: 'Avanzado' },
]

// ------------------------------------------------------------
// 🏊 NATACIÓN — B1-00c Tabla 1B + B1-00d Parte 2
// ------------------------------------------------------------
const CAL_NAT: BloqueP[] = [{ zona: 'AER', metros: 400, nota: 'Calentamiento suave' }]
const VUELTA_NAT: BloqueP[] = [{ zona: 'AER', metros: 200, nota: 'Vuelta a la calma' }]

const NATACION: PlantillaSesion[] = [
  {
    id: 'nat-aer',
    nombre: 'Recuperación y técnica',
    disciplina: 'Natacion', zona: 'AER',
    objetivo: 'Recuperación activa y trabajo técnico de brazada. Sin señal adaptativa aeróbica.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z1',
    calentamiento: [],
    principal: {
      // B1-00d Z1: "Drills técnicos 4–6 × 50m, pausa 15 s" + "recuperación 1.000–1.500m continuo"
      principiante: [{ zona: 'AER', series: 4, metros: 50, descansoSeg: 15, nota: 'Drills (catch-up, fist, zipper)' }, { zona: 'AER', metros: 800 }],
      intermedio: [{ zona: 'AER', series: 6, metros: 50, descansoSeg: 15, nota: 'Drills' }, { zona: 'AER', metros: 1000 }],
      avanzado: [{ zona: 'AER', series: 6, metros: 50, descansoSeg: 15, nota: 'Drills' }, { zona: 'AER', metros: 1500 }],
    },
    vuelta: [],
  },
  {
    id: 'nat-ael',
    nombre: 'Base aeróbica',
    disciplina: 'Natacion', zona: 'AEL',
    objetivo: 'La zona más importante de la natación en triatlón: densidad mitocondrial, capilarización y eficiencia de brazada a ritmo aeróbico.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z2 (series largas extensivas)',
    calentamiento: CAL_NAT,
    principal: {
      // B1-00d Z2: "2 × 1.500m / 1 × 2.000m / 3 × 1.000m, pausa 30–60 s"
      principiante: [{ zona: 'AEL', series: 3, metros: 600, descansoSeg: 45 }],
      intermedio: [{ zona: 'AEL', series: 3, metros: 1000, descansoSeg: 45 }],
      avanzado: [{ zona: 'AEL', series: 2, metros: 1500, descansoSeg: 45 }],
    },
    vuelta: VUELTA_NAT,
  },
  {
    id: 'nat-aem',
    nombre: 'Tempo',
    disciplina: 'Natacion', zona: 'AEM',
    objetivo: 'Zona del MLSS. Eficiencia neuromuscular de la brazada a ritmo de competición larga.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z3 (series de tempo)',
    calentamiento: CAL_NAT,
    principal: {
      // B1-00d Z3: "4–6 × 400m / 5–8 × 300m, pausa 30–45 s"
      principiante: [{ zona: 'AEM', series: 5, metros: 300, descansoSeg: 45 }],
      intermedio: [{ zona: 'AEM', series: 6, metros: 300, descansoSeg: 35 }],
      avanzado: [{ zona: 'AEM', series: 5, metros: 400, descansoSeg: 45 }],
    },
    vuelta: VUELTA_NAT,
  },
  {
    id: 'nat-aei',
    nombre: 'Umbral (CSS)',
    disciplina: 'Natacion', zona: 'AEI',
    objetivo: 'El CSS es exactamente el ritmo de umbral. La zona de mayor transferencia al triatlón corto y medio.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z4 (series a CSS)',
    calentamiento: [{ zona: 'AER', metros: 600, nota: 'Calentamiento' }],
    principal: {
      // B1-00d Z4: "10–15 × 100m, pausa 10–20 s" · "6–8 × 200m, pausa 15–25 s"
      // La pausa corta es LA clave de esta zona: >30 s disipa el lactato y deja de
      // ser trabajo de umbral (B1-00d, "La pausa en Z4 es crítica").
      principiante: [{ zona: 'AEI', series: 8, metros: 100, descansoSeg: 20 }],
      intermedio: [{ zona: 'AEI', series: 10, metros: 100, descansoSeg: 15 }],
      avanzado: [{ zona: 'AEI', series: 6, metros: 200, descansoSeg: 20 }],
    },
    vuelta: VUELTA_NAT,
  },
  {
    id: 'nat-pae',
    nombre: 'VO₂max',
    disciplina: 'Natacion', zona: 'PAE',
    objetivo: 'Eleva el techo aeróbico y la economía de nado a alta velocidad. Relevante para la salida del triatlón.',
    origen: 'documentado', fuente: 'B1-00d · Natación Z5 (intervalos intensivos cortos)',
    calentamiento: [{ zona: 'AER', metros: 600, nota: 'Calentamiento' }],
    principal: {
      // B1-00d Z5: "6–10 × 100m / 8–12 × 75m, pausa 30–45 s"
      principiante: [{ zona: 'PAE', series: 8, metros: 75, descansoSeg: 45 }],
      intermedio: [{ zona: 'PAE', series: 8, metros: 100, descansoSeg: 40 }],
      avanzado: [{ zona: 'PAE', series: 10, metros: 100, descansoSeg: 35 }],
    },
    vuelta: VUELTA_NAT,
  },
  // ---- De aquí para arriba, la literatura de natación NO distingue (B1-00e §3) ----
  {
    id: 'nat-cla',
    nombre: 'Capacidad láctica',
    disciplina: 'Natacion', zona: 'CLA',
    objetivo: 'Tolerancia al lactato. Sostener velocidad con acidosis alta.',
    origen: 'propuesta', fuente: 'B1-00e §3.1 (propuesta) · distancias de lib/zonas.ts',
    aviso: 'La literatura de natación no separa las zonas anaeróbicas: el modelo CSS y Ferrer-Roca (2024) las agrupan todas en Z5. Estructura propuesta a partir de la prescripción de lib/zonas.ts (series 25–50m) y su duración de zona (30 s–2 min).',
    calentamiento: [{ zona: 'AER', metros: 600, nota: 'Calentamiento' }],
    principal: {
      principiante: [{ zona: 'CLA', series: 8, metros: 50, descansoSeg: 60 }],
      intermedio: [{ zona: 'CLA', series: 10, metros: 50, descansoSeg: 90 }],
      avanzado: [{ zona: 'CLA', series: 12, metros: 50, descansoSeg: 120 }],
    },
    vuelta: VUELTA_NAT,
  },
  {
    id: 'nat-pla',
    nombre: 'Potencia láctica',
    disciplina: 'Natacion', zona: 'PLA',
    objetivo: 'Máxima tasa glucolítica. Velocidad máxima sostenida en distancias muy cortas.',
    origen: 'propuesta', fuente: 'B1-00e §3.1 (propuesta) · lib/zonas.ts (series ≤25m)',
    aviso: 'Propuesta: la literatura de natación no separa potencia de capacidad láctica. Basada en la prescripción de lib/zonas.ts (≤25m a velocidad máxima, 10–30 s).',
    calentamiento: [{ zona: 'AER', metros: 600, nota: 'Calentamiento' }],
    principal: {
      principiante: [{ zona: 'PLA', series: 8, metros: 25, descansoSeg: 120 }],
      intermedio: [{ zona: 'PLA', series: 10, metros: 25, descansoSeg: 150 }],
      avanzado: [{ zona: 'PLA', series: 12, metros: 25, descansoSeg: 180 }],
    },
    vuelta: VUELTA_NAT,
  },
  {
    id: 'nat-cala',
    nombre: 'Capacidad aláctica',
    disciplina: 'Natacion', zona: 'CALA',
    objetivo: 'Velocidad pura por fosfocreatina, con recuperación completa.',
    origen: 'propuesta', fuente: 'B1-00e §3.1 (propuesta) · lib/zonas.ts (10–15m desde pared)',
    aviso: 'Propuesta: no hay categoría aláctica en la literatura de natación (Ferrer-Roca 2024 no la delimita). Basada en lib/zonas.ts (10–15m desde pared, 5–10 s).',
    calentamiento: [{ zona: 'AER', metros: 600, nota: 'Calentamiento' }],
    principal: {
      principiante: [{ zona: 'CALA', series: 6, metros: 15, descansoSeg: 120 }],
      intermedio: [{ zona: 'CALA', series: 8, metros: 15, descansoSeg: 150 }],
      avanzado: [{ zona: 'CALA', series: 10, metros: 15, descansoSeg: 180 }],
    },
    vuelta: VUELTA_NAT,
  },
  {
    id: 'nat-pala',
    nombre: 'Potencia aláctica',
    disciplina: 'Natacion', zona: 'PALA',
    objetivo: 'Potencia pico: salidas y primeros metros a máximo reclutamiento.',
    origen: 'propuesta', fuente: 'B1-00e §3.1 (propuesta) · lib/zonas.ts (<10m desde salida)',
    aviso: 'Propuesta: no hay categoría aláctica en la literatura de natación. Basada en lib/zonas.ts (<10m desde salida, <5 s).',
    calentamiento: [{ zona: 'AER', metros: 600, nota: 'Calentamiento' }],
    principal: {
      principiante: [{ zona: 'PALA', series: 6, metros: 10, descansoSeg: 180 }],
      intermedio: [{ zona: 'PALA', series: 8, metros: 10, descansoSeg: 240 }],
      avanzado: [{ zona: 'PALA', series: 8, metros: 10, descansoSeg: 300 }],
    },
    vuelta: VUELTA_NAT,
  },
]

// ------------------------------------------------------------
// 🚴 CICLISMO — B1-00d Parte 1 (Coggan). Los %FTP de la app SON los de Coggan,
// nivel a nivel, sin desviación (B1-00e Parte 1) → traducción directa.
// SIEMPRE por tiempo: lib/duracion.ts no estima el ciclismo por distancia.
// ------------------------------------------------------------
const CAL_CIC: BloqueP[] = [{ zona: 'AER', segundos: 15 * 60, nota: 'Calentamiento progresivo' }]
const VUELTA_CIC: BloqueP[] = [{ zona: 'AER', segundos: 10 * 60, nota: 'Enfriamiento' }]

const CICLISMO: PlantillaSesion[] = [
  {
    id: 'cic-aer',
    nombre: 'Rodadura de recuperación',
    disciplina: 'Ciclismo', zona: 'AER',
    objetivo: 'Recuperación. Elimina el lactato residual de sesiones anteriores. Sin señal adaptativa.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z1 (Coggan 1)',
    calentamiento: [],
    // B1-00d Z1: "Rodadura de recuperación, 1 bloque continuo, 30–60 min, 80–90 rpm"
    principal: {
      principiante: [{ zona: 'AER', segundos: 30 * 60, nota: '80–90 rpm' }],
      intermedio: [{ zona: 'AER', segundos: 45 * 60, nota: '80–90 rpm' }],
      avanzado: [{ zona: 'AER', segundos: 60 * 60, nota: '80–90 rpm' }],
    },
    vuelta: [],
  },
  {
    id: 'cic-ael',
    nombre: 'Fondo largo',
    disciplina: 'Ciclismo', zona: 'AEL',
    objetivo: 'La base aeróbica del ciclismo: biogénesis mitocondrial, capilarización, oxidación de grasas.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z2 (Coggan 2, fondo largo)',
    calentamiento: [],
    // B1-00d Z2: "Fondo largo, 1 bloque continuo, 90–300 min, 85–95 rpm"
    principal: {
      principiante: [{ zona: 'AEL', segundos: 90 * 60, nota: '85–95 rpm' }],
      intermedio: [{ zona: 'AEL', segundos: 150 * 60, nota: '85–95 rpm' }],
      avanzado: [{ zona: 'AEL', segundos: 240 * 60, nota: '85–95 rpm' }],
    },
    vuelta: [],
  },
  {
    id: 'cic-aem',
    nombre: 'Tempo / Sweet Spot',
    disciplina: 'Ciclismo', zona: 'AEM',
    objetivo: 'Zona del MLSS. Umbral aeróbico y eficiencia. Es la intensidad de competición en 70.3 e Ironman.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z3 (Coggan 3, tempo fraccionado)',
    calentamiento: CAL_CIC,
    // B1-00d Z3: "Tempo fraccionado 2 × 20 min / 3 × 15 min, recuperación 5–8 min Z1"
    principal: {
      principiante: [{ zona: 'AEM', series: 2, segundos: 15 * 60, descansoSeg: 6 * 60 }],
      intermedio: [{ zona: 'AEM', series: 2, segundos: 20 * 60, descansoSeg: 6 * 60 }],
      avanzado: [{ zona: 'AEM', series: 3, segundos: 15 * 60, descansoSeg: 5 * 60 }],
    },
    vuelta: VUELTA_CIC,
  },
  {
    id: 'cic-aei',
    nombre: 'Intervalos al FTP',
    disciplina: 'Ciclismo', zona: 'AEI',
    objetivo: 'La zona del FTP. Eleva el umbral y la capacidad de tamponar lactato. La sesión más específica para triatlón corto-medio.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z4 (Coggan 4, intervalos FTP)',
    calentamiento: CAL_CIC,
    // B1-00d Z4: "cortos 4 × 10 min (rec 5 min)" · "medios 3 × 15 min (rec 5–8 min)"
    //            · "largos 2 × 20 min (rec 5–10 min)"
    // OJO: aquí el nivel NO es más volumen, es más LONGITUD DE BLOQUE. La propia
    // fuente da 40 / 45 / 40 min de trabajo: sostener 20 min seguidos al FTP es más
    // duro que 4×10 aunque sume menos. No "arreglar" para que el volumen crezca.
    principal: {
      principiante: [{ zona: 'AEI', series: 4, segundos: 10 * 60, descansoSeg: 5 * 60 }],
      intermedio: [{ zona: 'AEI', series: 3, segundos: 15 * 60, descansoSeg: 7 * 60 }],
      avanzado: [{ zona: 'AEI', series: 2, segundos: 20 * 60, descansoSeg: 8 * 60 }],
    },
    vuelta: VUELTA_CIC,
  },
  {
    id: 'cic-pae',
    nombre: 'Intervalos VO₂max',
    disciplina: 'Ciclismo', zona: 'PAE',
    objetivo: 'Máximo estímulo para el VO₂max. Eleva el techo aeróbico: hace que AEL y AEM sean más cómodos.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z5 (Coggan 5, intervalos VO₂max clásicos)',
    calentamiento: CAL_CIC,
    // B1-00d Z5: "4–6 × 3–5 min, recuperación igual que el intervalo (1:1)"
    principal: {
      principiante: [{ zona: 'PAE', series: 4, segundos: 3 * 60, descansoSeg: 3 * 60, nota: '95–110 rpm' }],
      intermedio: [{ zona: 'PAE', series: 5, segundos: 4 * 60, descansoSeg: 4 * 60, nota: '95–110 rpm' }],
      avanzado: [{ zona: 'PAE', series: 6, segundos: 5 * 60, descansoSeg: 5 * 60, nota: '95–110 rpm' }],
    },
    vuelta: VUELTA_CIC,
  },
  {
    id: 'cic-cla',
    nombre: 'Capacidad anaeróbica',
    disciplina: 'Ciclismo', zona: 'CLA',
    objetivo: 'Glucólisis anaeróbica: tolerancia al lactato. Relevante sobre todo en Sprint y Olímpico.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z6 (Coggan 6, sprints subumbrales)',
    calentamiento: [{ zona: 'AER', segundos: 20 * 60, nota: 'Calentamiento (más largo: la sesión es intensa)' }],
    // B1-00d Z6: "Sprints subumbrales 6–10 × 1–2 min, recuperación 3–5 min completa"
    principal: {
      principiante: [{ zona: 'CLA', series: 6, segundos: 60, descansoSeg: 4 * 60 }],
      intermedio: [{ zona: 'CLA', series: 8, segundos: 60, descansoSeg: 3 * 60 }],
      avanzado: [{ zona: 'CLA', series: 10, segundos: 120, descansoSeg: 5 * 60 }],
    },
    vuelta: VUELTA_CIC,
  },
  {
    id: 'cic-pla',
    nombre: 'Potencia neuromuscular',
    disciplina: 'Ciclismo', zona: 'PLA',
    objetivo: 'Fosfocreatina y máximo reclutamiento de fibras II. En triatlón: salidas, ataques y aceleraciones tras virajes.',
    origen: 'documentado', fuente: 'B1-00d · Ciclismo Z7 (Coggan 7, arranques)',
    calentamiento: [{ zona: 'AER', segundos: 20 * 60, nota: 'Calentamiento' }],
    // B1-00d Z7: "Arranques sentado 8–12 s desde parado, recuperación 5–8 min, 5–6 arranques"
    principal: {
      principiante: [{ zona: 'PLA', series: 5, segundos: 8, descansoSeg: 5 * 60, nota: 'Arranque desde parado' }],
      intermedio: [{ zona: 'PLA', series: 6, segundos: 10, descansoSeg: 6 * 60, nota: 'Arranque desde parado' }],
      avanzado: [{ zona: 'PLA', series: 6, segundos: 12, descansoSeg: 8 * 60, nota: 'Arranque desde parado' }],
    },
    vuelta: VUELTA_CIC,
  },
  {
    id: 'cic-cala',
    nombre: 'Sprint máximo',
    disciplina: 'Ciclismo', zona: 'CALA',
    objetivo: 'Potencia pico desde rodadura, con recuperación completa.',
    origen: 'propuesta', fuente: 'B1-00e Parte 1 · B1-00d Ciclismo Z7 (sprint de 6 s)',
    aviso: 'CALA y PALA no tienen %FTP en lib/zonas.ts: Coggan mete todo el sprint en su nivel 7, sin separar capacidad de potencia. Estructura tomada del "sprint de 6 s" de B1-00d y de la duración de zona de lib/zonas.ts (5–10 s).',
    calentamiento: [{ zona: 'AER', segundos: 20 * 60, nota: 'Calentamiento' }],
    principal: {
      principiante: [{ zona: 'CALA', series: 5, segundos: 6, descansoSeg: 5 * 60, nota: 'Desde rodadura' }],
      intermedio: [{ zona: 'CALA', series: 6, segundos: 8, descansoSeg: 6 * 60, nota: 'Desde rodadura' }],
      avanzado: [{ zona: 'CALA', series: 8, segundos: 10, descansoSeg: 8 * 60, nota: 'Desde rodadura' }],
    },
    vuelta: VUELTA_CIC,
  },
  {
    id: 'cic-pala',
    nombre: 'Potencia pico',
    disciplina: 'Ciclismo', zona: 'PALA',
    objetivo: 'Esfuerzos máximos < 5 s: potencia pico absoluta.',
    origen: 'propuesta', fuente: 'B1-00e Parte 1 · B1-00d Ciclismo Z7',
    aviso: 'Coggan no separa PALA de CALA (todo es su nivel 7). Estructura basada en la duración de zona de lib/zonas.ts (<5 s) y la recuperación completa de B1-00d Z7 (5–8 min).',
    calentamiento: [{ zona: 'AER', segundos: 20 * 60, nota: 'Calentamiento' }],
    principal: {
      principiante: [{ zona: 'PALA', series: 5, segundos: 5, descansoSeg: 5 * 60 }],
      intermedio: [{ zona: 'PALA', series: 6, segundos: 5, descansoSeg: 6 * 60 }],
      avanzado: [{ zona: 'PALA', series: 8, segundos: 5, descansoSeg: 8 * 60 }],
    },
    vuelta: VUELTA_CIC,
  },
]

// ------------------------------------------------------------
// 🏃 CARRERA — B1-00c Tabla 3 (Tuimil / Billat)
// Asignación por NOMBRE y FUNCIÓN, no por %VAM: los cortes de la app y los de
// Tuimil no coinciden (B1-00e Parte 2). Cada plantilla dice de qué zona de Tuimil
// sale.
// ------------------------------------------------------------
const CAL_CAR: BloqueP[] = [{ zona: 'AER', segundos: 15 * 60, nota: 'Calentamiento' }]
const VUELTA_CAR: BloqueP[] = [{ zona: 'AER', segundos: 10 * 60, nota: 'Vuelta a la calma' }]

const CARRERA: PlantillaSesion[] = [
  {
    id: 'car-aer',
    nombre: 'Trote de recuperación',
    disciplina: 'Carrera', zona: 'AER',
    objetivo: 'Recuperación activa. Aeróbico de lípidos, sin acumulación de lactato.',
    origen: 'documentado', fuente: 'B1-00c Tabla 3 · Tuimil Z1 (continuo lento, K1)',
    calentamiento: [],
    // Tuimil Z1: "Trote suave 45–120 min, calentamiento"
    principal: {
      principiante: [{ zona: 'AER', segundos: 30 * 60 }],
      intermedio: [{ zona: 'AER', segundos: 45 * 60 }],
      avanzado: [{ zona: 'AER', segundos: 60 * 60 }],
    },
    vuelta: [],
  },
  {
    id: 'car-ael',
    nombre: 'Tirada larga',
    disciplina: 'Carrera', zona: 'AEL',
    objetivo: 'Base aeróbica: mezcla de lípidos y glucógeno. El volumen que sostiene la temporada.',
    origen: 'documentado', fuente: 'B1-00c Tabla 3 · Tuimil Z2 (continuo largo, K2)',
    calentamiento: [],
    // Tuimil Z2: "Tiradas 60–150 min / 8–25 km"
    principal: {
      principiante: [{ zona: 'AEL', segundos: 60 * 60 }],
      intermedio: [{ zona: 'AEL', segundos: 90 * 60 }],
      avanzado: [{ zona: 'AEL', segundos: 120 * 60 }],
    },
    vuelta: [],
  },
  {
    id: 'car-aem',
    nombre: 'Continuo medio',
    disciplina: 'Carrera', zona: 'AEM',
    objetivo: 'Zona del MLSS. El ritmo de competición en distancias largas.',
    origen: 'documentado', fuente: 'B1-00c Tabla 3 · Tuimil Z3 (continuo medio, K3)',
    calentamiento: CAL_CAR,
    // Tuimil Z3: "20–60 min / 5–15 km"
    principal: {
      principiante: [{ zona: 'AEM', segundos: 20 * 60 }],
      intermedio: [{ zona: 'AEM', segundos: 40 * 60 }],
      avanzado: [{ zona: 'AEM', segundos: 60 * 60 }],
    },
    vuelta: VUELTA_CAR,
  },
  {
    id: 'car-aem-int',
    nombre: 'Interválico largo extensivo',
    disciplina: 'Carrera', zona: 'AEM',
    objetivo: 'Trabajo de umbral (VT2) fraccionado: más volumen a la intensidad del umbral del que se aguanta continuo.',
    origen: 'documentado', fuente: 'B1-00c Tabla 3 · Tuimil Z4 (capacidad aeróbica)',
    // Ojo: la "Capacidad aeróbica" de Tuimil (80–90% VAM) cae dentro del AEM de la
    // app (75–85%), NO del AEI. Ver B1-00e §2.1.
    calentamiento: CAL_CAR,
    // Tuimil Z4: "3–12 min × 1.000–4.000m, rec. 1:0,5"
    principal: {
      principiante: [{ zona: 'AEM', series: 3, metros: 1000, descansoSeg: 150 }],
      intermedio: [{ zona: 'AEM', series: 4, metros: 2000, descansoSeg: 240 }],
      avanzado: [{ zona: 'AEM', series: 3, metros: 4000, descansoSeg: 360 }],
    },
    vuelta: VUELTA_CAR,
  },
  {
    id: 'car-aei',
    nombre: 'Interválico aeróbico intensivo',
    disciplina: 'Carrera', zona: 'AEI',
    objetivo: 'Potencia aeróbica: series largas cerca del VO₂max con recuperación 1:1.',
    origen: 'documentado', fuente: 'B1-00c Tabla 3 · Tuimil Z5 (potencia aeróbica 1, HIT)',
    // El AEI de la app (90–95% VAM) es, por rango, la Z5 de Tuimil — no su Z4
    // "capacidad aeróbica" pese al parecido del nombre. Ver B1-00e §2.1.
    calentamiento: CAL_CAR,
    // Tuimil Z5: "90 s–6 min / 600–2.000m, rec. 1:1"
    principal: {
      principiante: [{ zona: 'AEI', series: 4, metros: 800, descansoSeg: 210 }],
      intermedio: [{ zona: 'AEI', series: 5, metros: 1000, descansoSeg: 250 }],
      avanzado: [{ zona: 'AEI', series: 5, metros: 2000, descansoSeg: 480 }],
    },
    vuelta: VUELTA_CAR,
  },
  {
    id: 'car-pae',
    nombre: 'Interválico corto (VO₂max)',
    disciplina: 'Carrera', zona: 'PAE',
    objetivo: 'Potencia aeróbica con series cortas y rápidas. Máximo tiempo cerca del VO₂max.',
    origen: 'documentado', fuente: 'B1-00c Tabla 3 · Tuimil Z6 (potencia aeróbica 2, HIT corto)',
    calentamiento: CAL_CAR,
    // Tuimil Z6: "30 s–3 min / 200–800m, rec. 1:1,5–1:2"
    principal: {
      principiante: [{ zona: 'PAE', series: 6, metros: 400, descansoSeg: 180 }],
      intermedio: [{ zona: 'PAE', series: 8, metros: 600, descansoSeg: 240 }],
      avanzado: [{ zona: 'PAE', series: 8, metros: 800, descansoSeg: 300 }],
    },
    vuelta: VUELTA_CAR,
  },
  {
    id: 'car-cla',
    nombre: 'Capacidad láctica',
    disciplina: 'Carrera', zona: 'CLA',
    objetivo: 'Tolerancia al lactato: sostener velocidad con acidosis alta.',
    origen: 'documentado', fuente: 'B1-00c Tabla 3 · Tuimil Z7.1 (capacidad láctica)',
    // Asignada por NOMBRE: la Z7.1 de Tuimil es 115–125% VAM y el CLA de la app
    // 105–120%. Solo se solapan en 115–120%. Ver B1-00e §2.2.
    calentamiento: [{ zona: 'AER', segundos: 20 * 60, nota: 'Calentamiento' }],
    // Tuimil Z7.1: "30–90 s / 200–500m, recuperación 2–5 min"
    principal: {
      principiante: [{ zona: 'CLA', series: 6, metros: 200, descansoSeg: 180 }],
      intermedio: [{ zona: 'CLA', series: 8, metros: 300, descansoSeg: 240 }],
      avanzado: [{ zona: 'CLA', series: 8, metros: 500, descansoSeg: 300 }],
    },
    vuelta: VUELTA_CAR,
  },
  {
    id: 'car-pla',
    nombre: 'Potencia láctica',
    disciplina: 'Carrera', zona: 'PLA',
    objetivo: 'Máxima tasa glucolítica: esfuerzos muy cortos y muy rápidos, repetidos.',
    origen: 'documentado', fuente: 'B1-00c Tabla 3 · Tuimil Z7.2 (potencia láctica)',
    calentamiento: [{ zona: 'AER', segundos: 20 * 60, nota: 'Calentamiento' }],
    // Tuimil Z7.2: "125–140% VAM, 10–30 s, recuperación 3–5 min, pruebas repetidas"
    principal: {
      principiante: [{ zona: 'PLA', series: 6, metros: 100, descansoSeg: 180 }],
      intermedio: [{ zona: 'PLA', series: 8, metros: 150, descansoSeg: 240 }],
      avanzado: [{ zona: 'PLA', series: 10, metros: 150, descansoSeg: 300 }],
    },
    vuelta: VUELTA_CAR,
  },
  {
    id: 'car-cala',
    nombre: 'Velocidad (aláctico)',
    disciplina: 'Carrera', zona: 'CALA',
    objetivo: 'Velocidad pura por fosfocreatina, con recuperación completa entre repeticiones.',
    origen: 'documentado', fuente: 'B1-00c Tabla 3 · Tuimil Z8 (anaeróbica aláctica)',
    calentamiento: [{ zona: 'AER', segundos: 20 * 60, nota: 'Calentamiento' }],
    // Tuimil Z8: "Sprints 30–60m con recuperación completa (5–8 min)"
    principal: {
      principiante: [{ zona: 'CALA', series: 6, metros: 40, descansoSeg: 5 * 60 }],
      intermedio: [{ zona: 'CALA', series: 8, metros: 50, descansoSeg: 6 * 60 }],
      avanzado: [{ zona: 'CALA', series: 10, metros: 60, descansoSeg: 8 * 60 }],
    },
    vuelta: VUELTA_CAR,
  },
  {
    id: 'car-pala',
    nombre: 'Potencia aláctica',
    disciplina: 'Carrera', zona: 'PALA',
    objetivo: 'Potencia pico: aceleración máxima en menos de 5 s.',
    origen: 'propuesta', fuente: 'B1-00c Tabla 3 · Tuimil Z8 (extremo corto)',
    aviso: 'Tuimil no separa PALA de CALA: su Z8 es un único cajón de 30–60m. Se toma el extremo corto (30m ≈ <5 s, la duración de PALA en lib/zonas.ts) con la recuperación completa de la Z8.',
    calentamiento: [{ zona: 'AER', segundos: 20 * 60, nota: 'Calentamiento' }],
    principal: {
      principiante: [{ zona: 'PALA', series: 5, metros: 30, descansoSeg: 5 * 60 }],
      intermedio: [{ zona: 'PALA', series: 6, metros: 30, descansoSeg: 6 * 60 }],
      avanzado: [{ zona: 'PALA', series: 8, metros: 30, descansoSeg: 8 * 60 }],
    },
    vuelta: VUELTA_CAR,
  },
]

export const PLANTILLAS: PlantillaSesion[] = [...NATACION, ...CICLISMO, ...CARRERA]

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

// Plantillas de una disciplina, ordenadas de la zona más suave a la más dura
// (el orden del catálogo de zonas).
export function plantillasDe(disciplina: string): PlantillaSesion[] {
  const orden = ZONAS_RESISTENCIA.map(z => z.sigla)
  return PLANTILLAS
    .filter(p => p.disciplina === disciplina)
    .sort((a, b) => orden.indexOf(a.zona) - orden.indexOf(b.zona))
}

export function plantillaPorId(id: string): PlantillaSesion | undefined {
  return PLANTILLAS.find(p => p.id === id)
}

// ------------------------------------------------------------
// Variantes: otra forma de hacer la misma zona
// ------------------------------------------------------------
// Con una sola estructura por zona, un plan de doce semanas repite el mismo
// martes ocho veces. Las variantes son el eje que faltaba. Viven en
// `plantillas-variantes.ts` para no engordar este fichero.

/** Las otras formas de hacer esta plantilla. Vacío si solo tiene la base. */
export function variantesDe(p: PlantillaSesion): VarianteSesion[] {
  return VARIANTES[p.id] || []
}

export function varianteDe(p: PlantillaSesion, idVariante: string): VarianteSesion | undefined {
  return variantesDe(p).find(v => v.id === idVariante)
}

/**
 * La clave que identifica una sesión con UN solo string: `cic-aei` para la base,
 * `cic-aei/over-unders` para una variante.
 *
 * Existe para que quien elige una sesión —el asistente, un plan guardado, un
 * enlace— pueda nombrarla sin arrastrar dos campos que se pueden desparejar.
 */
export function claveDe(idPlantilla: string, idVariante?: string): string {
  return idVariante ? idPlantilla + '/' + idVariante : idPlantilla
}

export function resolverClave(clave: string): { plantilla: PlantillaSesion; variante?: VarianteSesion } | undefined {
  const [idPlantilla, idVariante] = clave.split('/')
  const plantilla = plantillaPorId(idPlantilla)
  if (!plantilla) return undefined
  if (!idVariante) return { plantilla }
  const variante = varianteDe(plantilla, idVariante)
  // Una clave con variante inexistente NO cae a la base en silencio: quien la
  // escribió creía estar pidiendo otra cosa, y devolverle la base sin avisar
  // es exactamente el fallo que no queremos (nada revienta, el dato miente).
  return variante ? { plantilla, variante } : undefined
}

/** La base y sus variantes en una lista uniforme, para pintar un selector. */
export interface OpcionSesion {
  clave: string
  /** El id de la variante, o `undefined` si es la base. Es lo que pide `bloquesDe`. */
  varianteId?: string
  nombre: string
  objetivo: string
  origen: OrigenPlantilla
  fuente: string
  aviso?: string
  esBase: boolean
}

export function opcionesDe(p: PlantillaSesion): OpcionSesion[] {
  return [
    { clave: p.id, nombre: p.nombre, objetivo: p.objetivo, origen: p.origen, fuente: p.fuente, aviso: p.aviso, esBase: true },
    ...variantesDe(p).map(v => ({
      clave: claveDe(p.id, v.id), varianteId: v.id, nombre: v.nombre, objetivo: v.objetivo,
      origen: v.origen, fuente: v.fuente, aviso: v.aviso, esBase: false,
    })),
  ]
}

// Los bloques de una plantilla en un nivel: calentamiento + principal + vuelta.
// Con `varianteId`, el bloque principal es el de la variante; el calentamiento y
// la vuelta se heredan de la plantilla salvo que la variante los cambie (una
// sesión sin pausas internas necesita calentar más).
export function bloquesDe(p: PlantillaSesion, nivel: NivelPlantilla, varianteId?: string): BloqueP[] {
  const v = varianteId ? varianteDe(p, varianteId) : undefined
  if (!v) return [...p.calentamiento, ...p.principal[nivel], ...p.vuelta]
  return [
    ...(v.calentamiento ?? p.calentamiento),
    ...v.principal[nivel],
    ...(v.vuelta ?? p.vuelta),
  ]
}

/** Los bloques a partir de una clave. `undefined` si la clave no existe. */
export function bloquesPorClave(clave: string, nivel: NivelPlantilla): BloqueP[] | undefined {
  const r = resolverClave(clave)
  return r ? bloquesDe(r.plantilla, nivel, r.variante?.id) : undefined
}

/**
 * Todas las claves del catálogo, base y variantes. Es lo que se le da al
 * asistente para que ELIJA en vez de inventar: un menú cerrado de sesiones que
 * la app sabe aplicar, en vez de texto libre que hay que validar después.
 */
export function todasLasClaves(disciplina?: string): string[] {
  return PLANTILLAS
    .filter(p => !disciplina || p.disciplina === disciplina)
    .flatMap(p => opcionesDe(p).map(o => o.clave))
}

// Resumen legible de un bloque: "8 × 100m", "3 × 15′", "45′".
export function textoBloque(b: BloqueP): string {
  const unidad = b.metros ? b.metros + 'm' : b.segundos ? fmtSegundos(b.segundos) : ''
  return b.series && b.series > 1 ? b.series + ' × ' + unidad : unidad
}

function fmtSegundos(s: number): string {
  if (s < 60) return s + '″'
  const min = Math.round(s / 60)
  if (min < 60) return min + '′'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h + 'h' + (m ? String(m).padStart(2, '0') : '')
}

// Escribe unos bloques como tareas de una sesión. Lo usan el panel de plantillas
// (/sesion/[id]) y el pegado de plantillas del calendario. `desde` es el orden de
// la última tarea existente (0 = reemplazar / sesión vacía).
export async function aplicarBloques(
  supabase: any,
  idSesion: number,
  disciplina: string,
  bloques: BloqueP[],
  desde = 0,
): Promise<string | null> {
  const { data: creadas, error } = await supabase.from('tarea').insert(
    bloques.map((b, i) => ({
      id_sesion: idSesion,
      disciplina,
      zona_entrenamiento: b.zona,
      series: b.series || 1,
      descanso_segundos: b.descansoSeg ?? null,
      orden: desde + i + 1,
    })),
  ).select()
  if (error) return error.message

  // Cada bloque lleva su parámetro: metros (natación/carrera) o tiempo (ciclismo).
  const dists: any[] = []
  const durs: any[] = []
  ;(creadas || []).forEach((t: any) => {
    const b = bloques[t.orden - desde - 1]
    if (!b) return
    if (b.metros) dists.push({ id_tarea: t.id, metros_planeados: b.metros })
    else if (b.segundos) durs.push({ id_tarea: t.id, tiempo_planeado: b.segundos })
  })
  if (dists.length) await supabase.from('p_distancia').insert(dists)
  if (durs.length) await supabase.from('p_duracion').insert(durs)
  return null
}

// Volumen total de trabajo del bloque principal (sin calentamiento ni vuelta):
// metros para natación/carrera, minutos para ciclismo.
export function volumenPrincipal(p: PlantillaSesion, nivel: NivelPlantilla, varianteId?: string): string {
  const v = varianteId ? varianteDe(p, varianteId) : undefined
  const bloques = v ? v.principal[nivel] : p.principal[nivel]
  const metros = bloques.reduce((a, b) => a + (b.metros || 0) * (b.series || 1), 0)
  if (metros > 0) return metros >= 1000 ? (metros / 1000).toFixed(1).replace('.0', '') + ' km' : metros + ' m'
  const seg = bloques.reduce((a, b) => a + (b.segundos || 0) * (b.series || 1), 0)
  return seg > 0 ? fmtSegundos(seg) : '—'
}
