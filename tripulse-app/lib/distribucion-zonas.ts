// ============================================================
// TRIPULSE — Qué zonas entrenar, y cuánto de cada una
// ============================================================
// El catálogo de plantillas dice CÓMO es cada sesión. Esto dice CUÁLES tocan y
// en qué proporción, que es la parte que faltaba: no es lo mismo preparar un
// 800 que un Ironman, y no es lo mismo estar en pretemporada que en tapering.
//
// Dos ejes independientes, los dos documentados:
//   1. La PRUEBA objetivo  → B1-00b Parte 4 (distribución por distancia)
//   2. La FASE del macro   → B1-00b Parte 5 (distribución por fase)
// Y para carrera pura, además, a qué intensidad se compite cada distancia
//   3. El RITMO de competición → B1-00c («Relaciones VAM con el rendimiento»)
//
// ⚠️ EL PUENTE DE ZONAS NO ES EL MISMO EN LOS TRES DEPORTES. Las fuentes hablan
// en Z1–Z8; la app prescribe en sus 9 siglas. B1-00e documenta que la traducción
// cambia según la disciplina — el «umbral» de la fuente cae en AEM si corres y
// en AEI si pedaleas. Traducirlo con una sola tabla daría un plan que reparte
// mal el volumen sin que nada reviente. Por eso `EQUIVALENCIA` tiene tres
// columnas y no una.
import { PRUEBAS } from './pruebas'

export type Disciplina = 'Natacion' | 'Ciclismo' | 'Carrera'

/** Las cuatro distancias para las que B1-00b da distribución. */
export type DistanciaTri = 'sprint' | 'olimpico' | 'medio' | 'largo'

export type FaseMacro =
  | 'transicion' | 'pg-inicial' | 'pg-avanzada' | 'pe-inicial' | 'pe-avanzada' | 'tapering'

/** Las zonas en las que hablan las fuentes, antes de traducir. */
export type ZonaFuente = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'Z6' | 'Z7-Z8'

export const ZONAS_FUENTE: ZonaFuente[] = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7-Z8']

/** Porcentaje del volumen de la disciplina. */
export interface Reparto { min: number; max: number }

// ------------------------------------------------------------
// El puente: zona de la fuente → siglas de la app, POR DISCIPLINA
// ------------------------------------------------------------
// Fuente: B1-00e (tabla maestra de equivalencias) + sus partes 1 y 2.
//
// Los dos sitios donde NO es una traducción trivial, y conviene tenerlos a mano
// porque son la causa de que esta tabla tenga tres columnas:
//
//   · Carrera Z4 «Umbral» → AEM, no AEI. La Z4 de Tuimil («capacidad aeróbica»,
//     80–90 % VAM) cae dentro del AEM de la app (75–85 %). El AEI de la app
//     (90–95 %) es, por rango, la Z5 de Tuimil. B1-00e §2.1.
//   · Carrera: Z3 y Z4 caen las dos en AEM, así que el presupuesto de AEM en
//     carrera es la SUMA de las dos filas. No es un error de la tabla: es una
//     consecuencia de dónde puso la app sus cortes.
export const EQUIVALENCIA: Record<ZonaFuente, Record<Disciplina, string[]>> = {
  //            🏃 Carrera            🚴 Ciclismo (Coggan 1:1)  🏊 Natación (CSS)
  'Z1':    { Carrera: ['AER'],  Ciclismo: ['AER'],  Natacion: ['AER'] },
  'Z2':    { Carrera: ['AEL'],  Ciclismo: ['AEL'],  Natacion: ['AEL'] },
  'Z3':    { Carrera: ['AEM'],  Ciclismo: ['AEM'],  Natacion: ['AEM'] },
  'Z4':    { Carrera: ['AEM'],  Ciclismo: ['AEI'],  Natacion: ['AEI'] },
  'Z5':    { Carrera: ['AEI'],  Ciclismo: ['PAE'],  Natacion: ['PAE'] },
  'Z6':    { Carrera: ['PAE'],  Ciclismo: ['CLA'],  Natacion: ['PAE'] },
  // El cajón anaeróbico es un presupuesto COMPARTIDO entre varias siglas, no uno
  // para cada una. En natación son cuatro porque la literatura no las separa
  // (B1-00e Parte 3); en ciclismo CALA y PALA ni siquiera tienen %FTP.
  'Z7-Z8': {
    Carrera: ['CLA', 'PLA', 'CALA', 'PALA'],
    Ciclismo: ['PLA', 'CALA', 'PALA'],
    Natacion: ['CLA', 'PLA', 'CALA', 'PALA'],
  },
}

// ------------------------------------------------------------
// 1. Distribución por distancia objetivo — B1-00b Parte 4 (fase PE)
// ------------------------------------------------------------
const r = (min: number, max: number): Reparto => ({ min, max })

type TablaDistancia = Record<ZonaFuente, Record<Disciplina, Reparto>>

export const DISTRIBUCION_POR_DISTANCIA: Record<DistanciaTri, TablaDistancia> = {
  sprint: {
    'Z1':    { Carrera: r(14, 18), Ciclismo: r(20, 26), Natacion: r(8, 12) },
    'Z2':    { Carrera: r(26, 34), Ciclismo: r(32, 40), Natacion: r(26, 34) },
    'Z3':    { Carrera: r(14, 18), Ciclismo: r(12, 16), Natacion: r(14, 18) },
    'Z4':    { Carrera: r(14, 18), Ciclismo: r(10, 14), Natacion: r(14, 18) },
    'Z5':    { Carrera: r(10, 14), Ciclismo: r(6, 10),  Natacion: r(10, 14) },
    'Z6':    { Carrera: r(5, 8),   Ciclismo: r(3, 5),   Natacion: r(5, 8) },
    'Z7-Z8': { Carrera: r(3, 5),   Ciclismo: r(2, 4),   Natacion: r(3, 6) },
  },
  olimpico: {
    'Z1':    { Carrera: r(16, 20), Ciclismo: r(24, 30), Natacion: r(10, 15) },
    'Z2':    { Carrera: r(30, 38), Ciclismo: r(35, 42), Natacion: r(30, 38) },
    'Z3':    { Carrera: r(14, 18), Ciclismo: r(10, 14), Natacion: r(16, 20) },
    'Z4':    { Carrera: r(12, 16), Ciclismo: r(8, 12),  Natacion: r(14, 18) },
    'Z5':    { Carrera: r(8, 12),  Ciclismo: r(5, 8),   Natacion: r(8, 12) },
    'Z6':    { Carrera: r(4, 6),   Ciclismo: r(2, 4),   Natacion: r(4, 6) },
    'Z7-Z8': { Carrera: r(1, 3),   Ciclismo: r(1, 2),   Natacion: r(2, 4) },
  },
  medio: {
    'Z1':    { Carrera: r(18, 22), Ciclismo: r(28, 33), Natacion: r(10, 15) },
    'Z2':    { Carrera: r(36, 44), Ciclismo: r(38, 45), Natacion: r(36, 44) },
    'Z3':    { Carrera: r(14, 18), Ciclismo: r(8, 12),  Natacion: r(18, 22) },
    'Z4':    { Carrera: r(10, 14), Ciclismo: r(6, 10),  Natacion: r(12, 16) },
    'Z5':    { Carrera: r(6, 10),  Ciclismo: r(4, 7),   Natacion: r(6, 10) },
    'Z6':    { Carrera: r(2, 4),   Ciclismo: r(1, 3),   Natacion: r(2, 4) },
    'Z7-Z8': { Carrera: r(0, 1),   Ciclismo: r(0, 1),   Natacion: r(0, 1) },
  },
  largo: {
    'Z1':    { Carrera: r(20, 25), Ciclismo: r(30, 35), Natacion: r(10, 15) },
    'Z2':    { Carrera: r(40, 50), Ciclismo: r(42, 50), Natacion: r(40, 50) },
    'Z3':    { Carrera: r(12, 18), Ciclismo: r(8, 12),  Natacion: r(18, 22) },
    'Z4':    { Carrera: r(8, 12),  Ciclismo: r(5, 8),   Natacion: r(10, 14) },
    'Z5':    { Carrera: r(4, 8),   Ciclismo: r(3, 5),   Natacion: r(5, 8) },
    'Z6':    { Carrera: r(1, 3),   Ciclismo: r(1, 2),   Natacion: r(2, 4) },
    'Z7-Z8': { Carrera: r(0, 1),   Ciclismo: r(0, 1),   Natacion: r(0, 1) },
  },
}

export const ETIQUETA_DISTANCIA: Record<DistanciaTri, string> = {
  sprint: 'Sprint', olimpico: 'Olímpico', medio: 'Media (70.3)', largo: 'Larga (Ironman)',
}

// ------------------------------------------------------------
// 2. Distribución por fase del macrociclo — B1-00b Parte 5
// ------------------------------------------------------------
// Esta tabla NO distingue disciplina: es el reparto global del macrociclo. Se
// cruza con la de arriba, no la sustituye.
export const DISTRIBUCION_POR_FASE: Record<FaseMacro, { etiqueta: string; tid: string; zonas: Record<ZonaFuente, Reparto> }> = {
  'transicion': {
    etiqueta: 'Transición', tid: '—',
    zonas: { 'Z1': r(90, 100), 'Z2': r(0, 10), 'Z3': r(0, 0), 'Z4': r(0, 0), 'Z5': r(0, 0), 'Z6': r(0, 0), 'Z7-Z8': r(0, 0) },
  },
  'pg-inicial': {
    etiqueta: 'Preparación general inicial', tid: 'Polarizado',
    zonas: { 'Z1': r(45, 55), 'Z2': r(30, 38), 'Z3': r(5, 8), 'Z4': r(3, 5), 'Z5': r(1, 2), 'Z6': r(0, 1), 'Z7-Z8': r(0, 0) },
  },
  'pg-avanzada': {
    etiqueta: 'Preparación general avanzada', tid: 'Piramidal',
    zonas: { 'Z1': r(40, 50), 'Z2': r(30, 36), 'Z3': r(8, 12), 'Z4': r(4, 7), 'Z5': r(2, 4), 'Z6': r(0, 1), 'Z7-Z8': r(0, 0) },
  },
  'pe-inicial': {
    etiqueta: 'Preparación específica inicial', tid: 'Piramidal',
    zonas: { 'Z1': r(35, 45), 'Z2': r(28, 34), 'Z3': r(8, 12), 'Z4': r(6, 10), 'Z5': r(4, 8), 'Z6': r(1, 2), 'Z7-Z8': r(0, 1) },
  },
  'pe-avanzada': {
    etiqueta: 'Preparación específica avanzada', tid: 'Piramidal',
    zonas: { 'Z1': r(32, 40), 'Z2': r(24, 30), 'Z3': r(8, 12), 'Z4': r(8, 12), 'Z5': r(6, 10), 'Z6': r(2, 4), 'Z7-Z8': r(1, 2) },
  },
  'tapering': {
    etiqueta: 'Tapering', tid: 'Polarizado',
    zonas: { 'Z1': r(38, 45), 'Z2': r(18, 24), 'Z3': r(5, 8), 'Z4': r(8, 12), 'Z5': r(8, 12), 'Z6': r(3, 5), 'Z7-Z8': r(1, 2) },
  },
}

// ------------------------------------------------------------
// 3. A qué intensidad se compite cada distancia — carrera
// ------------------------------------------------------------
// B1-00c, «Relaciones VAM con el rendimiento en competición»
// (Padilla et al. 1992; Billat 1994, citados en Tuimil).
//
// Esto es lo que hace concreto que un 800 y un maratón no se entrenan igual: el
// 800 se corre por encima del 115 % de la VAM (zona CLA de la app) y el maratón
// al 80 % (zona AEM). La sesión de ritmo de competición de cada uno no se parece
// en nada, y el porqué está en esta tabla.
export interface RitmoCompeticion {
  prueba: string
  pruebaId?: string      // id de lib/pruebas.ts, cuando existe allí
  vamMin: number
  vamMax: number
  zona: string | null    // sigla de la app en la que cae; null = cae en un hueco
  nota?: string
}

export const RITMO_COMPETICION_CARRERA: RitmoCompeticion[] = [
  { prueba: '800 m', vamMin: 115, vamMax: 117, zona: 'CLA' },
  { prueba: '1.500 m', vamMin: 105, vamMax: 107, zona: 'CLA' },
  { prueba: '5.000 m', pruebaId: 'run-5k', vamMin: 95, vamMax: 97, zona: 'PAE' },
  { prueba: '10.000 m', pruebaId: 'run-10k', vamMin: 90, vamMax: 92, zona: 'AEI' },
  { prueba: 'Maratón', pruebaId: 'run-maraton', vamMin: 80, vamMax: 82, zona: 'AEM' },
  { prueba: 'Ultra 100 km', pruebaId: 'run-100k', vamMin: 60, vamMax: 60, zona: 'AER' },
]

/**
 * Media maratón NO está en esta tabla, y no es un olvido: se corre en torno al
 * 85–88 % de la VAM, que en `lib/zonas.ts` cae en el hueco entre AEM (acaba en
 * 85) y AEI (empieza en 90). B1-00e §2.3 lo tiene anotado como pendiente de
 * decidir: o los cortes son deliberados o es un descuido al transcribir. Hasta
 * que se decida, prescribir una media por zona es elegir un lado sin base.
 */
export const HUECOS_VAM = [
  { desde: 85, hasta: 90, nota: 'Entre AEM y AEI. Aquí cae el ritmo de media maratón.' },
  { desde: 100, hasta: 105, nota: 'Entre PAE y CLA.' },
]

// ------------------------------------------------------------
// De una prueba del catálogo a su distancia de referencia
// ------------------------------------------------------------
// B1-00b da distribución para cuatro distancias de TRIATLÓN. El catálogo de
// `lib/pruebas.ts` es más ancho (duatlón, aquabike, carrera, natación...), así
// que muchas pruebas no tienen tabla. Devolver `null` es la respuesta correcta:
// inventar un reparto para una prueba que la fuente no cubre sería peor que
// decir que no lo sabemos.
const DISTANCIA_POR_PRUEBA: Record<string, DistanciaTri> = {
  'tri-supersprint': 'sprint',
  'tri-sprint': 'sprint',
  'tri-relevo-mixto': 'sprint',
  'tri-olimpico': 'olimpico',
  'tri-media': 'medio',
  'tri-larga': 'largo',
  // Duatlón y aquabike comparten la demanda energética de su triatlón
  // equivalente en duración, aunque cambie el reparto entre disciplinas.
  'du-sprint': 'sprint',
  'du-estandar': 'olimpico',
  'du-larga': 'largo',
  'aquabike-media': 'medio',
  'aquabike-larga': 'largo',
}

export function distanciaDePrueba(pruebaId: string): DistanciaTri | null {
  return DISTANCIA_POR_PRUEBA[pruebaId] ?? null
}

export function ritmoDePrueba(pruebaId: string): RitmoCompeticion | undefined {
  return RITMO_COMPETICION_CARRERA.find(x => x.pruebaId === pruebaId)
}

/** Las pruebas del catálogo para las que NO hay distribución documentada. */
export function pruebasSinDistribucion(): string[] {
  return PRUEBAS.filter(p => !DISTANCIA_POR_PRUEBA[p.id]).map(p => p.id)
}

// ------------------------------------------------------------
// Traducir un reparto a las siglas de la app
// ------------------------------------------------------------

export interface FranjaReparto {
  /** Más de una sigla = presupuesto COMPARTIDO entre ellas, no uno por cada. */
  siglas: string[]
  min: number
  max: number
  /** De qué zonas de la fuente sale, para poder auditar el número. */
  zonasFuente: ZonaFuente[]
}

/**
 * Junta las zonas de la fuente que caen en la misma sigla y suma sus rangos.
 *
 * En carrera esto importa de verdad: Z3 y Z4 caen las dos en AEM, así que el
 * presupuesto de AEM es la suma de ambas. Si se devolvieran por separado, quien
 * lo consuma se creería que hay dos zonas distintas donde la app solo tiene una.
 */
function agrupar(disciplina: Disciplina, porZona: Record<ZonaFuente, Reparto>): FranjaReparto[] {
  const fuera: FranjaReparto[] = []
  for (const z of ZONAS_FUENTE) {
    const siglas = EQUIVALENCIA[z][disciplina]
    const reparto = porZona[z]
    const clave = siglas.join('+')
    const ya = fuera.find(f => f.siglas.join('+') === clave)
    if (ya) {
      ya.min += reparto.min
      ya.max += reparto.max
      ya.zonasFuente.push(z)
    } else {
      fuera.push({ siglas: [...siglas], min: reparto.min, max: reparto.max, zonasFuente: [z] })
    }
  }
  return fuera
}

/** Cuánto de cada zona toca para una distancia objetivo, en fase específica. */
export function repartoPorDistancia(distancia: DistanciaTri, disciplina: Disciplina): FranjaReparto[] {
  const tabla = DISTRIBUCION_POR_DISTANCIA[distancia]
  const porZona = {} as Record<ZonaFuente, Reparto>
  for (const z of ZONAS_FUENTE) porZona[z] = tabla[z][disciplina]
  return agrupar(disciplina, porZona)
}

/** Cuánto de cada zona toca en una fase del macrociclo. */
export function repartoPorFase(fase: FaseMacro, disciplina: Disciplina): FranjaReparto[] {
  return agrupar(disciplina, DISTRIBUCION_POR_FASE[fase].zonas)
}

/** El modelo de distribución de intensidad que le toca a esa fase. */
export function tidDeFase(fase: FaseMacro): string {
  return DISTRIBUCION_POR_FASE[fase].tid
}
