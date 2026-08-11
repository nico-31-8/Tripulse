// ============================================================
// TRIPULSE — Catálogo de plantillas de fuerza
// ============================================================
// `ZONAS_FUERZA` existía en la app desde el principio, y el esquema de propuesta
// del asistente ya las aceptaba, pero no había ni una sola plantilla de fuerza.
// Un plan de triatlón sin fuerza no es un plan de triatlón: B3-01 documenta
// −3 a −5 % de VO₂ al mismo ritmo por mejora de economía (Beattie 2017) y
// +5–8 % de potencia pico en bici (Rønnestad 2010).
//
// POR QUÉ NO REUTILIZA `PlantillaSesion`
// La fuerza no se prescribe igual: un bloque de resistencia es zona + volumen
// (metros o tiempo); uno de fuerza es zona + ejercicio + series × repeticiones +
// carga relativa al 1RM. Meterlo a la fuerza en `BloqueP` obligaría a guardar
// las repeticiones en el campo de los segundos, que es justo el tipo de mentira
// silenciosa que esta base de código lleva años pagando.
//
// LOS EJERCICIOS SON UNA SUGERENCIA, NO UN VÍNCULO
// `ejercicio` es texto, no un id de la Biblioteca de Fuerza. La plantilla dice
// qué cualidad tocar y con qué dosis; con qué ejercicio concreto lo hace cada
// entrenador es suyo, igual que en resistencia la plantilla da la zona y el
// ritmo lo pone el test de cada atleta.
//
// FUENTE: B3-01 — Fuerza General para Triatlón (Bloque 3 del vault).
import type { OrigenPlantilla } from './plantillas-tipos'
import type { FaseMacro } from './distribucion-zonas'

export interface BloqueFuerza {
  /** Sigla de `ZONAS_FUERZA` en lib/zonas.ts. */
  zona: string
  /** Nombre sugerido. No es un id de la biblioteca: es orientación. */
  ejercicio: string
  series: number
  repeticiones?: number   // por serie
  segundos?: number       // para isométricos (plancha), donde no hay repeticiones
  descansoSeg: number
  /** Texto, no número: la fuente da rangos («82–85 %») y algunos son peso corporal. */
  carga?: string
  unilateral?: boolean    // «cada pierna» / «cada brazo»: dobla el tiempo real
  nota?: string
}

export interface PlantillaFuerza {
  id: string
  nombre: string
  /** En qué fases del macrociclo toca. Enlaza con `distribucion-zonas.ts`. */
  fases: FaseMacro[]
  objetivo: string
  origen: OrigenPlantilla
  fuente: string
  aviso?: string
  sesionesSemana: string
  bloques: BloqueFuerza[]
}

export const PLANTILLAS_FUERZA: PlantillaFuerza[] = [
  {
    id: 'fue-aa',
    nombre: 'Adaptación anatómica',
    fases: ['pg-inicial'],
    objetivo: 'Preparar tendones, ligamentos y articulaciones para aguantar la fuerza máxima que viene después. No es la fase donde se mejora el rendimiento: es la fase donde no te lesionas en la siguiente.',
    origen: 'documentado', fuente: 'B3-01 §3.1 (Adaptación Anatómica, semanas 1–4 de PG)',
    sesionesSemana: '2–3',
    // B3-01 §3.1: 2–3 series · 15–20 rep · 40–55 % 1RM · descanso 60–90 s ·
    // ejecución controlada (2 s concéntrico, 2 s excéntrico).
    // Encaja con AFG de la app (40–60 % RM, 15–25 rep, 2–4 series, 45–90 s).
    bloques: [
      { zona: 'AFG', ejercicio: 'Sentadilla goblet', series: 3, repeticiones: 20, descansoSeg: 75, carga: '40 % 1RM', nota: '2 s bajando, 2 s subiendo' },
      { zona: 'AFG', ejercicio: 'Zancada con mancuernas', series: 3, repeticiones: 15, descansoSeg: 75, carga: '40 % 1RM', unilateral: true },
      { zona: 'AFG', ejercicio: 'Peso muerto rumano bilateral', series: 3, repeticiones: 15, descansoSeg: 90, carga: '45 % 1RM' },
      { zona: 'AFG', ejercicio: 'Remo con mancuerna', series: 3, repeticiones: 15, descansoSeg: 60, carga: '40 % 1RM', unilateral: true },
      { zona: 'AFG', ejercicio: 'Plancha frontal', series: 3, segundos: 30, descansoSeg: 60 },
      { zona: 'AFG', ejercicio: 'Puente de glúteo', series: 3, repeticiones: 20, descansoSeg: 60, carga: 'Peso corporal' },
      { zona: 'AFG', ejercicio: 'Elevación de talones', series: 3, repeticiones: 20, descansoSeg: 60, carga: 'Peso corporal' },
    ],
  },
  {
    id: 'fue-fm',
    nombre: 'Fuerza máxima',
    fases: ['pg-avanzada'],
    objetivo: 'El bloque que de verdad importa: las mejoras de economía de movimiento vienen sobre todo de aquí. Sin pasar por esta fase, el trabajo de potencia posterior rinde mucho menos.',
    origen: 'propuesta', fuente: 'B3-01 §3.2 (Fuerza Máxima, semanas 5–12 de PG)',
    aviso: 'Dos choques con las zonas de la app, los dos del mismo tipo que B1-00e documenta en resistencia. (1) La dosis de B3-01 (75–90 % 1RM con 3–6 repeticiones) cae a caballo entre FMI (1–5 rep) y FMH (65–85 % 1RM): se asigna FMI porque en fuerza máxima la cualidad la define el rango de repeticiones, no el porcentaje. (2) B3-01 da descansos de 2–4 min y la FMI de la app pide 3–5: se usa la intersección (3–4 min), que respeta las dos, en vez de elegir un lado.',
    sesionesSemana: '2 — no más: el volumen de resistencia es prioritario',
    // B3-01 §3.2: 3–5 series · 3–6 rep · 75–90 % 1RM · descanso 2–4 min.
    // Progresión de carga a lo largo del bloque: sem 5–6 → 75–78 %,
    // 7–8 → 80–83 %, 9–10 → 85–88 %, 11–12 → 88–90 % (pico).
    // Los descansos conservan el orden de la fuente (a levantamiento más duro,
    // más descanso) dentro de la intersección 180–240 s.
    bloques: [
      { zona: 'FMI', ejercicio: 'Sentadilla trasera', series: 4, repeticiones: 4, descansoSeg: 240, carga: '82–85 % 1RM', nota: 'Intención de máxima velocidad al subir, aunque la barra no vaya rápida' },
      { zona: 'FMI', ejercicio: 'Peso muerto convencional', series: 4, repeticiones: 4, descansoSeg: 240, carga: '82–85 % 1RM' },
      { zona: 'FMI', ejercicio: 'Hip thrust con barra', series: 4, repeticiones: 5, descansoSeg: 210, carga: '80 % 1RM' },
      { zona: 'FMI', ejercicio: 'Step-up con mancuernas', series: 3, repeticiones: 5, descansoSeg: 180, carga: '75 % 1RM', unilateral: true },
      { zona: 'FMI', ejercicio: 'Dominadas o jalón al pecho', series: 4, repeticiones: 4, descansoSeg: 210, carga: 'Lastre si hace falta' },
      { zona: 'FMI', ejercicio: 'Press de hombro', series: 3, repeticiones: 5, descansoSeg: 180, carga: '75 % 1RM' },
    ],
  },
  {
    id: 'fue-potencia',
    nombre: 'Potencia',
    fases: ['pe-inicial'],
    objetivo: 'Convertir la fuerza máxima en fuerza aplicada a la velocidad de la zancada y del pedaleo. Si esta fase no se hace, la fuerza que ganaste en el bloque anterior no llega al rendimiento.',
    origen: 'documentado', fuente: 'B3-01 §3.3 (Fase de Potencia, PE inicial)',
    sesionesSemana: '1–2',
    // B3-01 §3.3: 3–4 series · 4–8 rep · 30–60 % 1RM · descanso 2–3 min ·
    // máxima velocidad en la concéntrica. Encaja con FEC (30–60 % RM, 4–8 rep,
    // descanso 2–4 min) sin desviación.
    //
    // Los seis ejercicios van a FEC y ninguno a FEA aunque el salto a cajón y el
    // slam suenen acíclicos: la FEA de la app son 3–5 repeticiones (esfuerzo
    // único máximo) y B3-01 los prescribe a 6 y a 8. Con esas repeticiones son
    // series explosivas, que es lo que la app llama FEC.
    bloques: [
      { zona: 'FEC', ejercicio: 'Sentadilla con salto', series: 4, repeticiones: 5, descansoSeg: 150, carga: '30–40 % 1RM', nota: 'La carga es baja a propósito: lo que se entrena es la velocidad' },
      { zona: 'FEC', ejercicio: 'Salto a cajón', series: 4, repeticiones: 6, descansoSeg: 150, carga: 'Peso corporal', nota: 'Potencia reactiva' },
      { zona: 'FEC', ejercicio: 'Step-up explosivo', series: 3, repeticiones: 6, descansoSeg: 150, carga: '30–40 % 1RM', unilateral: true, nota: 'Unilateral: es lo más parecido a la zancada' },
      { zona: 'FEC', ejercicio: 'Swing con kettlebell', series: 4, repeticiones: 8, descansoSeg: 120, nota: 'Cadena posterior explosiva' },
      { zona: 'FEC', ejercicio: 'Slam de balón medicinal', series: 3, repeticiones: 8, descansoSeg: 120, nota: 'Potencia + core' },
      { zona: 'FEC', ejercicio: 'Salto a una pierna', series: 3, repeticiones: 5, descansoSeg: 180, carga: 'Peso corporal', unilateral: true },
    ],
  },
  {
    id: 'fue-resistencia',
    nombre: 'Fuerza resistencia',
    fases: ['pe-avanzada'],
    objetivo: 'Sostener la producción de fuerza durante mucho tiempo, que es lo que hace falta en los últimos kilómetros. Mantiene lo ganado sin generar una fatiga que estropee el entrenamiento de resistencia.',
    origen: 'documentado', fuente: 'B3-01 §3.4 (Fuerza Resistencia, PE avanzada)',
    sesionesSemana: '1–2',
    // B3-01 §3.4 (columna PE avanzada): 2–3 series · 10–15 rep · 60–70 % 1RM ·
    // descanso 90 s. Encaja con RFMIX1 (50–70 % RM, 10–20 rep, 60–120 s).
    bloques: [
      { zona: 'RFMIX1', ejercicio: 'Sentadilla trasera', series: 3, repeticiones: 12, descansoSeg: 90, carga: '60–70 % 1RM' },
      { zona: 'RFMIX1', ejercicio: 'Peso muerto rumano', series: 3, repeticiones: 12, descansoSeg: 90, carga: '60–70 % 1RM' },
      { zona: 'RFMIX1', ejercicio: 'Zancada con mancuernas', series: 3, repeticiones: 10, descansoSeg: 90, carga: '60 % 1RM', unilateral: true },
      { zona: 'RFMIX1', ejercicio: 'Remo con mancuerna', series: 3, repeticiones: 12, descansoSeg: 90, carga: '60–70 % 1RM', unilateral: true },
      { zona: 'RFMIX1', ejercicio: 'Elevación de talones', series: 3, repeticiones: 15, descansoSeg: 60, carga: '60 % 1RM' },
    ],
  },
  {
    id: 'fue-mantenimiento',
    nombre: 'Mantenimiento en competición',
    fases: ['tapering'],
    objetivo: 'Lo mínimo para no perder lo ganado, sin dejar piernas en el intento. Menos series y menos repeticiones, pero con carga alta: la fuerza se mantiene con intensidad, no con volumen.',
    origen: 'propuesta', fuente: 'B3-01 §3.4 (columna Tapering/Competición)',
    aviso: 'B3-01 prescribe 2 series y la FMH de la app orienta a 3–5. Se respeta la fuente: bajar series es literalmente en qué consiste un tapering, y hacerlo a 3 por encajar en la orientación de la zona sería añadir fatiga justo cuando el objetivo es quitarla. Repeticiones y carga sí coinciden con FMH.',
    sesionesSemana: '1',
    // B3-01 §3.4 (columna Tapering): 2 series · 6–8 rep · 70–75 % 1RM ·
    // descanso 2 min. Con 6–8 repeticiones la zona de la app es FMH (65–85 %,
    // 6–12 rep), no FMI: aquí el porcentaje y las repeticiones sí coinciden.
    //
    // ⚠️ B3-01 §3.4 fija que la ÚLTIMA sesión de fuerza va 10–14 días antes de
    // la competición A. A partir de ahí, solo core y movilidad.
    bloques: [
      { zona: 'FMH', ejercicio: 'Sentadilla trasera', series: 2, repeticiones: 6, descansoSeg: 120, carga: '70–75 % 1RM' },
      { zona: 'FMH', ejercicio: 'Peso muerto convencional', series: 2, repeticiones: 6, descansoSeg: 120, carga: '70–75 % 1RM' },
      { zona: 'FMH', ejercicio: 'Hip thrust con barra', series: 2, repeticiones: 8, descansoSeg: 120, carga: '70 % 1RM' },
    ],
  },
]

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

export function plantillaFuerzaPorId(id: string): PlantillaFuerza | undefined {
  return PLANTILLAS_FUERZA.find(p => p.id === id)
}

/**
 * Qué trabajo de fuerza toca en una fase del macrociclo.
 *
 * Es la conexión con `distribucion-zonas.ts`: igual que la resistencia reparte
 * sus zonas según la fase, la fuerza cambia de cualidad. En pretemporada se
 * busca fuerza máxima; en competición, no perderla.
 */
export function fuerzaDeFase(fase: FaseMacro): PlantillaFuerza[] {
  return PLANTILLAS_FUERZA.filter(p => p.fases.includes(fase))
}

/** Cuántas series de trabajo tiene la sesión (para hacerse una idea del tamaño). */
export function seriesTotales(p: PlantillaFuerza): number {
  return p.bloques.reduce((a, b) => a + b.series, 0)
}

/**
 * Cuándo hay que dejar de hacer fuerza antes de la competición A.
 * B3-01 §3.4: la última sesión, 10–14 días antes. Después, solo core y movilidad.
 */
export const DIAS_ULTIMA_FUERZA = { min: 10, max: 14 }
