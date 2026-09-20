// ============================================================
// El cardio encadenado a un ejercicio de fuerza
// ============================================================
//
// QUÉ ES. Una sesión de fuerza en la que, pegado a cada serie, va un trozo de
// cardio: sentadilla 4×6 + 300 m de remo, press + 30 s de assault bike. Se
// prescribe con el tipo de serie «Cardio», igual que Superserie o Complex
// encadenan un segundo ejercicio.
//
// Y CUENTA. Ese cardio no es un adorno de la hoja: son minutos que el atleta
// pasa trabajando, así que entra en la duración estimada de la sesión y, por
// ella, en la carga. Prescribir trabajo que los números semanales no ven es
// como no prescribirlo, solo que encima engaña.
//
// DÓNDE VAN SUS METROS: ESA ES LA PARTE DELICADA. Media hora de remo son media
// hora de trabajo, pero 5.000 m de remo NO son 5.000 m de carrera ni de bici.
// Meterlos en el volumen de una disciplina de triatlón corrompería el número
// que el entrenador usa para decidir. Así que:
//
//   · La DURACIÓN y la CARGA las suma siempre, venga de donde venga.
//   · Los METROS solo entran en el volumen de una disciplina cuando la
//     modalidad ES esa disciplina hecha bajo techo: la cinta es correr y el
//     rodillo es ir en bici. Un remo, un ski o una comba no son ninguna de las
//     tres, y sus metros se quedan donde están: en la sesión.
//
// Eso vive AQUÍ y en ningún otro sitio. Si cada pantalla decidiera por su
// cuenta a qué disciplina pertenece un ski erg, acabarían decidiendo distinto.

import { ZONAS_RESISTENCIA } from './zonas'

export type MedidaCardio = 'metros' | 'segundos'
/** Las tres que el resto de la aplicación sabe contar. `null` = ninguna. */
export type DisciplinaCardio = 'Carrera' | 'Ciclismo' | 'Natacion' | null

export interface Modalidad {
  id: string
  nombre: string
  /** A qué disciplina van sus metros. `null` = a ninguna (ver arriba). */
  disciplina: DisciplinaCardio
  /** Cómo se prescribe normalmente. El entrenador puede cambiarlo. */
  medida: MedidaCardio
  /**
   * Metros por segundo a ritmo medio, solo para estimar la duración cuando se
   * prescribe por metros.
   *
   * ES UNA REGLA GRUESA Y SE DICE. Para correr, nadar o pedalear ya existen
   * los tests del atleta y mandan ellos; esto es para el remo, el ski y el
   * trineo, donde no hay test de nada. Sirve para que la sesión no dure
   * «45 min» cuando en realidad son 60, no para calcular un ritmo.
   */
  msAprox: number | null
}

/**
 * Lo que se puede encadenar. Están las tres de triatlón porque un entrenador
 * mete carrera de verdad dentro de una sesión de fuerza, y están las máquinas
 * porque es lo que hay en un gimnasio.
 */
export const MODALIDADES_CARDIO: Modalidad[] = [
  { id: 'remo', nombre: 'Remo', disciplina: null, medida: 'metros', msAprox: 3.6 },
  { id: 'ski', nombre: 'Ski erg', disciplina: null, medida: 'metros', msAprox: 3.3 },
  { id: 'assault', nombre: 'Assault bike', disciplina: null, medida: 'segundos', msAprox: null },
  { id: 'eliptica', nombre: 'Elíptica', disciplina: null, medida: 'segundos', msAprox: null },
  { id: 'comba', nombre: 'Comba', disciplina: null, medida: 'segundos', msAprox: null },
  { id: 'trineo', nombre: 'Trineo', disciplina: null, medida: 'metros', msAprox: 1.0 },
  { id: 'escaleras', nombre: 'Escalera / step', disciplina: null, medida: 'segundos', msAprox: null },
  { id: 'cinta', nombre: 'Cinta', disciplina: 'Carrera', medida: 'metros', msAprox: null },
  { id: 'carrera', nombre: 'Carrera', disciplina: 'Carrera', medida: 'metros', msAprox: null },
  { id: 'rodillo', nombre: 'Rodillo / bici estática', disciplina: 'Ciclismo', medida: 'segundos', msAprox: null },
  { id: 'ciclismo', nombre: 'Ciclismo', disciplina: 'Ciclismo', medida: 'segundos', msAprox: null },
  { id: 'natacion', nombre: 'Natación', disciplina: 'Natacion', medida: 'metros', msAprox: null },
]

export const modalidadDe = (id: string | null | undefined): Modalidad | null =>
  id ? MODALIDADES_CARDIO.find(m => m.id === id) || null : null

/** Lo que se guarda de un cardio encadenado. */
export interface CardioPrescrito {
  modo?: string | null
  medida?: string | null
  valor?: number | null
  zona?: string | null
  /** El «@»: ritmo, potencia o lo que el entrenador escriba. Texto a propósito. */
  objetivo?: string | null
}

/**
 * Si esta prescripción lleva cardio de verdad.
 *
 * HACE FALTA MODALIDAD **Y** CANTIDAD. Un «Remo» sin metros ni segundos no es
 * media prescripción: es una que no se puede hacer ni contar, y dejarla pasar
 * la metería en la duración como un cero sin que nadie lo notara.
 */
export const hayCardio = (c: CardioPrescrito | null | undefined): boolean =>
  !!modalidadDe(c?.modo) && Number(c?.valor) > 0

export const medidaDe = (c: CardioPrescrito | null | undefined): MedidaCardio =>
  c?.medida === 'segundos' ? 'segundos' : 'metros'

/**
 * Cuánto dura UNA vez ese cardio, en segundos.
 *
 * Por tiempo es el propio valor. Por metros hace falta un ritmo: si la
 * modalidad es una disciplina de verdad se usa el del atleta —lo pasa quien
 * llama, que es quien tiene los tests— y si es una máquina, la regla gruesa de
 * la modalidad. Sin ninguna de las dos devuelve `null`, y `null` NO es cero:
 * significa «no se sabe», y quien llame tiene que decirlo en vez de sumar 0.
 */
export function segundosDeCardio(
  c: CardioPrescrito | null | undefined,
  msDeLaDisciplina?: number | null,
): number | null {
  if (!hayCardio(c)) return null
  const valor = Number(c?.valor)
  if (medidaDe(c) === 'segundos') return valor

  const m = modalidadDe(c?.modo)
  const ms = m?.disciplina && Number(msDeLaDisciplina) > 0 ? Number(msDeLaDisciplina) : m?.msAprox
  if (!ms || ms <= 0) return null
  return Math.round(valor / ms)
}

/**
 * Los metros que este cardio le suma a una disciplina, y a cuál.
 *
 * `null` cuando no le suma a ninguna: o no se prescribió por metros, o la
 * modalidad no es ninguna de las tres. Eso NO es que no cuente —la duración y
 * la carga la suman igual—: es que sus metros no son comparables con los de
 * correr, nadar o pedalear, y mezclarlos estropearía el volumen semanal.
 */
export function metrosDeCardio(
  c: CardioPrescrito | null | undefined,
  veces = 1,
): { disciplina: 'Carrera' | 'Ciclismo' | 'Natacion'; metros: number } | null {
  if (!hayCardio(c) || medidaDe(c) !== 'metros') return null
  const m = modalidadDe(c?.modo)
  if (!m?.disciplina) return null
  return { disciplina: m.disciplina, metros: Number(c?.valor) * Math.max(1, veces) }
}

/** Si sus metros se quedan fuera del volumen por disciplina, y por qué. */
export const metrosSeQuedanFuera = (c: CardioPrescrito | null | undefined): boolean =>
  hayCardio(c) && medidaDe(c) === 'metros' && !modalidadDe(c?.modo)?.disciplina

/** «Remo 300 m · AEM» — cómo se lee en la hoja. */
export function textoCardio(c: CardioPrescrito | null | undefined): string {
  if (!hayCardio(c)) return ''
  const m = modalidadDe(c?.modo)
  const valor = Number(c?.valor)
  const cuanto = medidaDe(c) === 'segundos'
    ? (valor >= 60 && valor % 60 === 0 ? valor / 60 + ' min' : valor + ' s')
    : (valor >= 1000 ? (valor / 1000).toString().replace('.', ',') + ' km' : valor + ' m')
  const zona = c?.zona && ZONAS_RESISTENCIA.some(z => z.sigla === c.zona) ? ' · ' + c.zona : ''
  const obj = c?.objetivo ? ' @ ' + c.objetivo : ''
  return (m?.nombre || '') + ' ' + cuanto + zona + obj
}

/**
 * Las columnas del cardio, para los `select` que las piden a mano.
 *
 * UN SOLO SITIO. Varias pantallas leen `ejercicios` con una lista explícita de
 * columnas en vez de `*`, y una que se olvide de estas no falla: cuenta el
 * cardio como si no existiera, que es la forma silenciosa de que el volumen
 * salga corto en una pantalla y bien en la de al lado.
 */
export const SELECT_EJERCICIOS_CONTEO =
  'id_tarea, repeticiones, cardio_modo, cardio_medida, cardio_valor, cardio_zona' as const
