// ============================================================
// TRIPULSE — La capa que planifica ENTRE semanas
// ============================================================
// Hasta ahora el planificador generaba UNA semana aislada, con la fase elegida a
// mano en un desplegable. Eso deja fuera lo que hace que un plan sea un plan: la
// progresión, la descarga cada tres o cuatro, y cuántas semanas quedan hasta la
// carrera.
//
// LO QUE ESTO NO HACE, A PROPÓSITO: no inventa una periodización paralela. La
// app YA tiene macrociclo → mesociclo → microciclo, y el entrenador ya dibuja su
// curva de carga en el lienzo. Esta capa LEE ese plan y lo traduce a la entrada
// que el planificador de semanas ya sabe consumir (`EntradaSemana`). Si inventara
// su propia estructura, habría dos periodizaciones para el mismo atleta y una de
// las dos mentiría.
//
// FUENTE: B1-03 (Mesociclos). Cada tipo de mesociclo tiene su estructura interna
// documentada en carga relativa semana a semana, y de ahí sale todo esto.
import type { FaseMacro, DistanciaTri } from './distribucion-zonas'
import type { EntradaSemana } from './plan-semana'
import { sumarDias, diasEntre } from './desplazar'

/**
 * La familia a la que pertenece un mesociclo.
 *
 * Los cuatro modelos de periodización de la app (ATR, Tradicional, Inversa,
 * Ondulatoria) llaman distinto a lo mismo: la «Acumulación» del ATR y la
 * «General» del Tradicional son el mismo bloque con otro nombre. Se reducen a
 * cuatro clases para no tener cuatro tablas de cargas diciendo lo mismo.
 */
export type ClaseMeso = 'acumulacion' | 'transmutacion' | 'competicion' | 'descarga'

const CLASE_POR_TIPO: Record<string, ClaseMeso> = {
  // ATR (Issurin)
  'acumulacion': 'acumulacion',
  'transmutacion': 'transmutacion',
  'realizacion': 'competicion',
  'recuperacion': 'descarga',
  // Tradicional
  'general': 'acumulacion',
  'especifica': 'transmutacion',
  'competitiva': 'competicion',
  'taper': 'competicion',
  // Inversa: empieza por la intensidad y construye volumen hacia la prueba, así
  // que sus dos primeros bloques están del revés respecto al tradicional.
  'intensidad': 'transmutacion',
  'desarrollo': 'acumulacion',
  'resistencia especifica': 'competicion',
  // Ondulatoria
  'carga alta': 'acumulacion',
  'carga media': 'transmutacion',
}

const sinTildes = (s: string) =>
  String(s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * De qué clase es un mesociclo por su tipo.
 *
 * Un tipo desconocido cae en `acumulacion`: es el bloque más común y el patrón
 * menos dañino —una progresión normal con su descarga al final—. Devolver algo
 * que no sea un bloque de carga ante la duda sería suponer que el entrenador
 * está afinando cuando lo más probable es que esté construyendo.
 */
export function claseDeMeso(tipo: string | null | undefined): ClaseMeso {
  return CLASE_POR_TIPO[sinTildes(tipo || '')] || 'acumulacion'
}

/** La fase del macro que le corresponde a cada clase, para el reparto de zonas. */
const FASE_POR_CLASE: Record<ClaseMeso, FaseMacro> = {
  acumulacion: 'pg-avanzada',
  transmutacion: 'pe-inicial',
  competicion: 'tapering',
  descarga: 'pg-inicial',   // volumen suave: el reparto más polarizado y sin calidad
}

// ------------------------------------------------------------
// Los patrones de carga relativa, de B1-03
// ------------------------------------------------------------
// 1,00 = semana plena. El último valor de acumulación y transmutación es la
// DESCARGA del bloque, y no es un adorno: es donde ocurre la supercompensación.
const PATRONES: Record<ClaseMeso, { cargas: number[]; conDescarga: boolean; fuente: string }> = {
  // B1-03 §Carga, estructura 4 semanas ratio 3:1 → 90 %, 100 %, 105-110 %, 55-60 %
  acumulacion: { cargas: [0.90, 1.00, 1.075, 0.575], conDescarga: true, fuente: 'B1-03 §Mesociclo de carga (ratio 3:1)' },
  // B1-03 §Transmutación, 3 semanas ratio 2:1 → 85 %, 100 %, 55 %
  transmutacion: { cargas: [0.85, 1.00, 0.55], conDescarga: true, fuente: 'B1-03 §Transmutación (ratio 2:1)' },
  // B1-03 §Descarga: −40 a −50 % de volumen manteniendo la intensidad
  descarga: { cargas: [0.55], conDescarga: false, fuente: 'B1-03 §Descarga (Mujika & Padilla 2003)' },
  // El tapering depende de la distancia: se resuelve en `cargasDe`.
  competicion: { cargas: [0.50], conDescarga: false, fuente: 'B1-03 §Tapering (por distancia)' },
}

/**
 * Volumen del tapering como fracción del pico, por distancia.
 * B1-03: sprint −35/−45 %, olímpico −40/−50 %, 70.3 −45/−55 %, IM −50/−60 %.
 * Se toma el punto medio de cada rango.
 */
const TAPER_POR_DISTANCIA: Record<DistanciaTri, number> = {
  sprint: 0.60, olimpico: 0.55, medio: 0.50, largo: 0.45,
}

export interface SemanaDelMeso {
  /** Posición dentro del mesociclo, desde 1 — es como lo cuenta un entrenador. */
  n: number
  /** Lunes de esa semana, si se conoce la fecha de inicio del mesociclo. */
  lunes?: string
  cargaRelativa: number
  esDescarga: boolean
  etiqueta: string
  /** Horas de esa semana: las de referencia por la carga relativa. */
  horasSemana: number
  fase: FaseMacro
}

/**
 * La carga relativa de cada semana de un bloque de `semanas` de duración.
 *
 * El patrón documentado tiene una duración canónica (4 la acumulación, 3 la
 * transmutación) y el entrenador dibuja la que quiere. Al estirar o encoger hay
 * una regla que no se negocia: **la descarga es siempre la última semana y nunca
 * es la que se cae**. Quitarla de un bloque de cuatro no da un bloque de tres:
 * da tres semanas de fatiga acumulándose sin sitio donde asimilarla.
 */
export function cargasDe(clase: ClaseMeso, semanas: number, distancia: DistanciaTri): number[] {
  const n = Math.max(1, Math.round(semanas))
  const p = PATRONES[clase]

  if (clase === 'competicion') {
    // Rampa descendente desde el volumen de taper de esa distancia. Cada semana
    // baja un 30 % respecto a la anterior: lo que dice B1-03 al pasar de la
    // semana −2 a la −1.
    const base = TAPER_POR_DISTANCIA[distancia] ?? 0.5
    return Array.from({ length: n }, (_, i) => Math.round(base * Math.pow(0.7, i) * 1000) / 1000)
  }

  if (!p.conDescarga) {
    return Array.from({ length: n }, () => p.cargas[0])
  }

  const subida = p.cargas.slice(0, -1)
  const descarga = p.cargas[p.cargas.length - 1]

  // Un bloque de una sola semana no puede ser solo descarga: sin nada que
  // asimilar, descargar no significa nada. Es una semana plena.
  if (n === 1) return [1.00]
  if (n === 2) return [subida[subida.length - 1], descarga]

  if (n - 1 === subida.length) return [...subida, descarga]

  // Más corto: se conservan las semanas MÁS DURAS de la subida, no las primeras.
  // Empezar suave importa menos que llegar arriba antes de descargar.
  if (n - 1 < subida.length) return [...subida.slice(subida.length - (n - 1)), descarga]

  // Más largo: la subida se reparte linealmente entre su primer y su último
  // valor, en vez de repetir la semana pico varias veces seguidas.
  const de = subida[0], a = subida[subida.length - 1], pasos = n - 1
  const estirada = Array.from({ length: pasos }, (_, i) =>
    Math.round((de + (a - de) * (i / (pasos - 1))) * 1000) / 1000)
  return [...estirada, descarga]
}

const etiquetaDe = (carga: number, esDescarga: boolean): string => {
  if (esDescarga) return 'Descarga'
  if (carga >= 1.05) return 'Sobrecarga controlada'
  if (carga >= 0.98) return 'Carga plena'
  if (carga >= 0.8) return 'Entrada progresiva'
  return 'Volumen reducido'
}

/**
 * La carga relativa que se deduce de la UA que el entrenador DIBUJÓ.
 *
 * Es la pieza que evita tener dos verdades sobre el mismo bloque. El patrón de
 * B1-03 dice «la tercera semana al 107 %»; el lienzo dice «la tercera semana,
 * 350 UA». Si las dos hablan, manda el entrenador: él ya decidió, y un patrón
 * de libro no puede corregir a quien conoce al atleta.
 *
 * Se normaliza por el MÁXIMO del bloque, no por la media: la semana más dura de
 * un mesociclo es su 100 % por definición, y así la descarga sale en su
 * proporción real respecto al pico.
 *
 * `null` si no hay al menos dos semanas con UA: con una sola no hay forma, y
 * normalizar un número por sí mismo daría un bloque plano al 100 %.
 */
export function cargasDeUA(uas: (number | null | undefined)[]): number[] | null {
  const validas = uas.filter((u): u is number => typeof u === 'number' && u > 0)
  if (validas.length < 2) return null
  const pico = Math.max(...validas)
  if (!pico) return null
  return uas.map(u => (typeof u === 'number' && u > 0) ? Math.round((u / pico) * 1000) / 1000 : 0)
}

export interface EntradaMesociclo {
  /** Tipo del mesociclo tal y como está en la base (`mesociclo.tipo`). */
  tipo: string | null | undefined
  semanas: number
  /** Horas de una semana PLENA de este atleta. La carga relativa las escala. */
  horasReferencia: number
  distancia: DistanciaTri
  /** Lunes de la primera semana, si se conoce. */
  lunes?: string
  /**
   * La UA que el entrenador dibujó en el lienzo, semana a semana. Si viene y
   * tiene al menos dos valores, MANDA sobre el patrón de B1-03.
   */
  uaPorSemana?: (number | null | undefined)[]
}

/** Las semanas de un mesociclo, con su carga y su etiqueta. */
export function semanasDelMesociclo(e: EntradaMesociclo): SemanaDelMeso[] {
  const clase = claseDeMeso(e.tipo)
  const dibujadas = e.uaPorSemana ? cargasDeUA(e.uaPorSemana) : null
  // Las dibujadas se recortan o rellenan a la duración del bloque: la fuente de
  // la forma es el lienzo, pero la duración la manda el mesociclo.
  const cargas = dibujadas
    ? Array.from({ length: e.semanas }, (_, i) => dibujadas[i] ?? 0).map(c => c || 0.55)
    : cargasDe(clase, e.semanas, e.distancia)
  const p = PATRONES[clase]
  const ultima = cargas.length - 1

  return cargas.map((c, i) => {
    // Con la forma dibujada, «descarga» es la semana que de verdad baja, no la
    // que el patrón decía: si el entrenador puso el valle en la segunda, es la
    // segunda.
    const esDescarga = dibujadas
      ? c < Math.max(...cargas) * 0.75
      : p.conDescarga && i === ultima && cargas.length > 1
    return {
      n: i + 1,
      lunes: e.lunes ? sumarDias(e.lunes, i * 7) : undefined,
      cargaRelativa: c,
      esDescarga,
      etiqueta: etiquetaDe(c, esDescarga),
      // Media hora es el escalón con el que un entrenador piensa el volumen.
      horasSemana: Math.round(e.horasReferencia * c * 2) / 2,
      fase: FASE_POR_CLASE[clase],
    }
  })
}

/** La entrada que el planificador de semanas ya sabe consumir. */
export function entradaDeSemana(s: SemanaDelMeso, base: Omit<EntradaSemana, 'horasSemana' | 'fase'>): EntradaSemana {
  return { ...base, horasSemana: s.horasSemana, fase: s.fase }
}

// ------------------------------------------------------------
// Cuántas semanas quedan
// ------------------------------------------------------------

/**
 * Semanas completas entre dos fechas. Es «quedan siete semanas», la frase con la
 * que un entrenador decide si aún hay sitio para un bloque de carga o ya toca
 * afinar. Negativo si la carrera ya pasó.
 */
export function semanasHasta(desde: string, fecha: string): number {
  return Math.floor(diasEntre(desde, fecha) / 7)
}

/**
 * Si el bloque que se está planificando pisa el tapering de una competición.
 *
 * B1-03 da la duración del tapering por distancia, y meter un bloque de carga
 * dentro de esos días es el error que más caro sale: se llega a la carrera con
 * fatiga que ya no hay tiempo de soltar.
 */
export const DIAS_TAPER: Record<DistanciaTri, number> = {
  sprint: 9, olimpico: 12, medio: 16, largo: 19,
}

export function pisaElTapering(
  lunesFin: string, competicion: string, distancia: DistanciaTri,
): boolean {
  const dias = diasEntre(lunesFin, competicion)
  return dias >= 0 && dias < (DIAS_TAPER[distancia] ?? 14)
}
