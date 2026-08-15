// ============================================================
// TRIPULSE — Catálogo de movilidad y flexibilidad
// ============================================================
// La zona FLEX existía en `ZONAS_FUERZA` desde el principio y se podía elegir en
// los tres desplegables de fuerza, pero no había NI UNA plantilla: prescribir
// movilidad significaba escribir cada ejercicio a mano, cada vez. Y hay un
// momento en el que es obligatoria — los últimos 10–14 días antes de la
// competición A, donde B3-01 deja «solo core y movilidad» — que es justo cuando
// menos ganas hay de teclear siete ejercicios.
//
// POR QUÉ NO VA EN `PLANTILLAS_FUERZA`
// Tres sitios del planificador hacen `fuerzaDeFase(fase)[0]` para saber qué
// fuerza toca esa semana. Si la movilidad entrara en ese array con fases
// asignadas, podría salir la PRIMERA y el planificador prescribiría estiramientos
// donde tocaba fuerza máxima. No reventaría nada: simplemente el atleta dejaría
// de hacer fuerza y nadie se enteraría. Catálogo aparte.
//
// FUENTE: B11-01 — Movilidad y Flexibilidad (Bloque 11 del vault).
import type { OrigenPlantilla } from './plantillas-tipos'
import type { BloqueFuerza } from './plantillas-fuerza'

/**
 * Cuándo se hace. No es una etiqueta decorativa: es la variable que más
 * importa según B11-01 Parte 1 («el timing lo es casi todo»).
 */
export type MomentoMovilidad = 'antes' | 'despues' | 'aparte'

export interface PlantillaMovilidad {
  id: string
  nombre: string
  momento: MomentoMovilidad
  /** Para qué disciplina prioriza. Sin ella, es la rutina general. */
  disciplina?: 'Natacion' | 'Ciclismo' | 'Carrera'
  objetivo: string
  origen: OrigenPlantilla
  fuente: string
  /** Minutos aproximados, para que el entrenador sepa lo que está metiendo. */
  duracionMin: number
  bloques: BloqueFuerza[]
}

/**
 * La regla que hay que tener delante al elegir, con su evidencia.
 *
 * Se enseña en la interfaz porque el error habitual no es escoger mal el
 * ejercicio: es ponerlo en el momento equivocado.
 */
export const REGLA_TIMING = {
  antes: 'Movilidad DINÁMICA. Efecto neutro o positivo sobre la potencia posterior.',
  despues: 'Flexibilidad ESTÁTICA, 30–60 s por músculo. Es donde se gana rango de verdad.',
  aviso: 'Nunca metas holds estáticos largos justo antes de calidad, fuerza pesada o competición: por encima de 60 s por músculo la fuerza y la potencia caen un 5–10 % de forma aguda (Simic et al., 2013).',
  prevencion: 'Estirar no reduce la incidencia global de lesiones (Behm et al., 2016; consenso Delphi 2025). Se prescribe por rango de movimiento y por calidad del gesto, no como escudo antilesiones.',
} as const

// Un bloque dinámico: repeticiones, sin descanso entre ejercicios (es una
// secuencia continua). Uno estático: segundos de mantenimiento.
const din = (ejercicio: string, repeticiones: number, unilateral = false, nota?: string): BloqueFuerza =>
  ({ zona: 'FLEX', ejercicio, series: 1, repeticiones, descansoSeg: 0, unilateral, nota })
const est = (ejercicio: string, segundos: number, unilateral = true, nota?: string): BloqueFuerza =>
  ({ zona: 'FLEX', ejercicio, series: 1, segundos, descansoSeg: 0, unilateral, nota })

export const PLANTILLAS_MOVILIDAD: PlantillaMovilidad[] = [
  // ----------------------------------------------------------
  // Calentamiento dinámico — B11-01 §3.1
  // ----------------------------------------------------------
  {
    id: 'mov-nat-antes',
    nombre: 'Calentamiento dinámico · Natación',
    momento: 'antes', disciplina: 'Natacion',
    objetivo: 'Abrir hombro y rotación torácica antes de nadar: es lo que necesita la brazada y la posición de streamline.',
    origen: 'documentado', fuente: 'B11-01 §3.1 (secuencia dinámica de natación)',
    duracionMin: 7,
    bloques: [
      din('Círculos de brazos / aperturas', 20, false, 'Círculos amplios adelante y atrás, 30–45 s'),
      din('Wall angels', 14, false, 'Espalda en la pared, brazos en cactus, sin despegar el contacto'),
      din('Open book (rotación en decúbito lateral)', 9, true, 'Seguir la mano con la mirada'),
      din('Rotación torácica en cuadrupedia', 9, true, 'Mano en la nuca, codo al techo'),
    ],
  },
  {
    id: 'mov-cic-antes',
    nombre: 'Calentamiento dinámico · Ciclismo',
    momento: 'antes', disciplina: 'Ciclismo',
    objetivo: 'Devolver a la cadera el rango que la posición sentada le quita, antes de volver a sentarse encima de ella.',
    origen: 'documentado', fuente: 'B11-01 §3.1 (secuencia dinámica de ciclismo)',
    duracionMin: 7,
    bloques: [
      din('90/90 hip switch', 9, false, 'Rotación interna y externa alternando lados, sin manos'),
      din("World's Greatest Stretch", 6, true, 'Codo al suelo por dentro del pie, abrir el brazo al techo'),
      din('Gato-camello', 12, false, 'Acompañando la respiración'),
      din('Leg swings (balanceos de pierna)', 11, true, 'Adelante-atrás y lateral, controlado'),
    ],
  },
  {
    id: 'mov-car-antes',
    nombre: 'Calentamiento dinámico · Carrera',
    momento: 'antes', disciplina: 'Carrera',
    objetivo: 'Tobillo y cadera antes de correr: la dorsiflexión es lo que permite absorber el impacto y devolverlo.',
    origen: 'documentado', fuente: 'B11-01 §3.1 (secuencia dinámica de carrera)',
    duracionMin: 9,
    bloques: [
      din('Leg swings (balanceos de pierna)', 11, true, 'Los dos planos: adelante-atrás y lateral'),
      din('Knee-to-wall (rodilla a la pared)', 9, true, 'Tocar la pared con la rodilla SIN levantar el talón'),
      din('Ankle rocks (balanceos de tobillo)', 20, false, 'Alternar puntas y talones, 30–45 s'),
      din("World's Greatest Stretch", 6, true),
      din('Hip CARs (rotaciones articulares controladas)', 6, true, 'Círculos amplios en las dos direcciones'),
    ],
  },

  // ----------------------------------------------------------
  // Flexibilidad estática por disciplina — B11-01 §3.2
  // ----------------------------------------------------------
  {
    id: 'flex-nat',
    nombre: 'Flexibilidad estática · Natación',
    momento: 'despues', disciplina: 'Natacion',
    objetivo: 'Cápsula posterior de hombro, pectoral y dorsal — las tres cosas que cierran la brazada y limitan el catch alto.',
    origen: 'documentado', fuente: 'B11-01 §3.2 (prioridades estáticas de natación)',
    duracionMin: 6,
    bloques: [
      est('Sleeper stretch', 25, true, 'De lado sobre el hombro a estirar, codo a 90°, empujar suave'),
      est('Estiramiento de pectoral en marco de puerta', 25, true, 'Antebrazo en el marco, avanzar un paso girando el tronco'),
      est('Estiramiento de dorsal (postura del niño con alcance)', 25, false),
    ],
  },
  {
    id: 'flex-cic',
    nombre: 'Flexibilidad estática · Ciclismo',
    momento: 'despues', disciplina: 'Ciclismo',
    objetivo: 'Flexores de cadera y torácica: lo que el pedaleo acorta y lo que hace falta para sostener la posición aero sin lumbalgia.',
    origen: 'documentado', fuente: 'B11-01 §3.2 (prioridades estáticas de ciclismo)',
    duracionMin: 8,
    bloques: [
      est('Couch stretch (estiramiento del sofá)', 60, true, 'Apretar el glúteo y llevar la cadera al frente SIN bascular la pelvis'),
      est('Extensión torácica sobre foam roller', 45, false, 'Roller bajo las escápulas, extender segmento a segmento'),
      est('Pigeon pose (paloma)', 60, true),
    ],
  },
  {
    id: 'flex-car',
    nombre: 'Flexibilidad estática · Carrera',
    momento: 'despues', disciplina: 'Carrera',
    objetivo: 'Gemelo, sóleo, isquios y glúteo — la cadena que el impacto repetido acorta.',
    origen: 'documentado', fuente: 'B11-01 §3.2 (prioridades estáticas de carrera)',
    duracionMin: 9,
    bloques: [
      est('Estiramiento de gemelo (rodilla recta)', 45, true, 'Rodilla EXTENDIDA: aísla el gastrocnemio'),
      est('Estiramiento de sóleo (rodilla flexionada)', 45, true, 'Rodilla FLEXIONADA: el gemelo queda acortado y trabaja el sóleo'),
      est('Estiramiento de isquiotibiales', 45, true, 'Bisagra de cadera con la espalda recta, no encorvando'),
      est('Pigeon pose (paloma)', 60, true),
    ],
  },

  // ----------------------------------------------------------
  // Sesión completa, día aparte — B11-01 Parte 2, recorriendo las regiones
  // ----------------------------------------------------------
  {
    id: 'mov-completa',
    nombre: 'Sesión de movilidad completa',
    momento: 'aparte',
    objetivo: 'Recorre las cinco regiones que el triatlón cierra: cadera, torácica, tobillo, hombro y columna. Es la sesión de los últimos 10–14 días antes de la competición A, cuando ya no toca fuerza.',
    origen: 'propuesta', fuente: 'B11-01 Parte 2 (movilidad por región). La secuencia es nuestra: la nota documenta los ejercicios región a región, no una rutina cerrada.',
    duracionMin: 22,
    bloques: [
      din('Gato-camello', 12, false, 'Empezar movilizando la columna entera'),
      est('Extensión torácica sobre foam roller', 45, false),
      din('Open book (rotación en decúbito lateral)', 9, true),
      est('Couch stretch (estiramiento del sofá)', 60, true),
      din('90/90 hip switch', 9, false),
      est('Pigeon pose (paloma)', 60, true),
      din('Knee-to-wall (rodilla a la pared)', 9, true),
      est('Estiramiento de gemelo (rodilla recta)', 45, true),
      est('Sleeper stretch', 25, true),
      est('Estiramiento de pectoral en marco de puerta', 25, true),
      est('Giro lumbar en tendido (supine twist)', 25, true),
      est('Postura del niño (child\'s pose)', 30, false, 'Cerrar descomprimiendo'),
    ],
  },
]

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

export function plantillaMovilidadPorId(id: string): PlantillaMovilidad | undefined {
  return PLANTILLAS_MOVILIDAD.find(p => p.id === id)
}

/** Las rutinas de un momento, opcionalmente filtradas por disciplina. */
export function movilidadDe(momento?: MomentoMovilidad, disciplina?: string): PlantillaMovilidad[] {
  return PLANTILLAS_MOVILIDAD.filter(p =>
    (!momento || p.momento === momento) &&
    // La rutina general (sin disciplina) vale para cualquiera: no se filtra fuera.
    (!disciplina || !p.disciplina || p.disciplina === disciplina))
}

export const ETIQUETA_MOMENTO: Record<MomentoMovilidad, string> = {
  antes: 'Antes de entrenar',
  despues: 'Después de entrenar',
  aparte: 'Sesión aparte',
}
