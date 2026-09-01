// ============================================================
// Cruzar el wellness con lo que se entrenó
// ============================================================
//
// La gráfica de wellness enseña cómo va el atleta, pero no por qué. Ves un pico
// de fatiga el 26 y para saber de dónde sale hay que irse al calendario, buscar
// esos días y volver — con lo cual casi nunca se hace.
//
// EL DÍA QUE HAY QUE MIRAR NO ES EL DEL PICO, Y ESA ES TODA LA GRACIA
// El wellness se rellena por la mañana: lleva calidad y horas de sueño, o sea
// que describe la noche anterior. Cuando el atleta rellenó el 26, las sesiones
// del 26 TODAVÍA NO HABÍAN PASADO. Enseñar «las sesiones de ese día» al lado de
// ese registro invita a una conclusión sobre el día equivocado, y es un error
// que no se nota: ves sesiones, sacas una conclusión, y era la de otro día.
//
// Así que la ventana mira HACIA ATRÁS. 72 horas, siguiendo la clasificación de
// Zatsiorski (1995) que está en el vault del proyecto:
//
//     Extremo → 72 h · Elevado → 48–72 h · Sostén → 24–48 h · Medio → 11–24 h
//
// (fundamentos-del-entrenamiento-deportivo-gonzalez-rave.md). Tres días cubre
// hasta la sesión extrema; menos dejaría fuera justo las que más explican.

import { soloDia, sumarDias, fechaValida } from './fechas'

export interface SesionCruce {
  id: number
  fecha_sesion: string
  disciplina?: string | null
  duracion_minutos?: number | null
  duracion_real?: number | null
  rpe_estimado?: number | null
  rpe_reportado?: number | null
  estado?: string | null
}

/** Cuántos días hacia atrás mira la ventana. */
export const DIAS_VENTANA = 3

/**
 * La carga de una sesión: RPE × minutos.
 *
 * La misma unidad que usa el resto de la app, que es lo que permite comparar
 * dos días de un vistazo. Manda lo REAL sobre lo planificado: si el atleta
 * reportó un 9 donde se le estimó un 7, la fatiga del día siguiente la explica
 * el 9. Sin ninguno de los dos, no se inventa un número — devuelve 0 y quien
 * pinte decidirá si enseña un guion.
 */
export function cargaDe(s: SesionCruce): number {
  const min = s.duracion_real ?? s.duracion_minutos ?? 0
  const rpe = s.rpe_reportado ?? s.rpe_estimado ?? 0
  return Math.round(min * rpe)
}

/** Las sesiones agrupadas por día, en el orden en que llegaron. */
export function sesionesPorDia(sesiones: SesionCruce[] | null | undefined): Record<string, SesionCruce[]> {
  const mapa: Record<string, SesionCruce[]> = {}
  for (const s of sesiones || []) {
    const dia = soloDia(s.fecha_sesion)
    if (!fechaValida(dia)) continue
    ;(mapa[dia] ||= []).push(s)
  }
  return mapa
}

export interface SesionFechada {
  sesion: SesionCruce
  /** El día en que se hizo, para poder decirlo en la lista. */
  dia: string
  /** Cuántos días antes del registro cae. 1 = ayer. */
  hace: number
}

export interface Cruce {
  /** Lo que le precede: las 72 h anteriores, de más reciente a más antigua. */
  antes: SesionFechada[]
  /** Lo que hizo ese mismo día, que NO explica este registro pero sí el siguiente. */
  eseDia: SesionCruce[]
  /** Carga sumada de la ventana. */
  carga: number
}

/**
 * Qué enseñar junto a un registro de wellness.
 *
 * `antes` va de más reciente a más antigua a propósito: lo de ayer pesa más que
 * lo de anteayer, así que es lo primero que se quiere leer.
 */
export function cruceDe(
  fecha: string,
  porDia: Record<string, SesionCruce[]>,
  diasVentana: number = DIAS_VENTANA,
): Cruce {
  const dia = soloDia(fecha)
  if (!fechaValida(dia)) return { antes: [], eseDia: [], carga: 0 }

  const antes: SesionFechada[] = []
  for (let hace = 1; hace <= diasVentana; hace++) {
    const d = sumarDias(dia, -hace)
    for (const sesion of porDia[d] || []) antes.push({ sesion, dia: d, hace })
  }

  return {
    antes,
    eseDia: porDia[dia] || [],
    carga: antes.reduce((a, x) => a + cargaDe(x.sesion), 0),
  }
}

/** «hace 2 días», para que la lista diga cuándo sin repetir la fecha entera. */
export function haceTexto(hace: number): string {
  if (hace === 1) return 'ayer'
  return 'hace ' + hace + ' días'
}

// ============================================================
// El camino contrario: desde una sesión, cómo amaneció después
// ============================================================
// `cruceDe` contesta «veo un pico, ¿qué lo causó?». Esto contesta la que hace
// aprender a un entrenador: «esta sesión que le puse, ¿costó lo que yo creía?».
//
// MIRA AL DÍA SIGUIENTE, por el mismo motivo por el que la otra mira hacia
// atrás: el wellness se rellena por la mañana, así que la factura de la sesión
// del martes aparece en el registro del miércoles, no en el del martes.

export interface RegistroDia {
  fecha: string
  [k: string]: any
}

/** Los registros de wellness indexados por día. */
export function wellnessPorDia(registros: RegistroDia[] | null | undefined): Record<string, RegistroDia> {
  const mapa: Record<string, RegistroDia> = {}
  for (const r of registros || []) {
    const dia = soloDia(r?.fecha)
    if (fechaValida(dia)) mapa[dia] = r
  }
  return mapa
}

export interface Manana {
  /** El día al que corresponde. */
  dia: string
  /** Cuántos días después de la sesión. 1 = la mañana siguiente. */
  despues: number
  registro: RegistroDia
}

/**
 * Cómo amaneció en los días siguientes a una sesión.
 *
 * Por defecto dos días: la mañana de después es la que más dice, pero el dolor
 * muscular pica a las 24–48 h, así que el segundo día también cuenta. Los días
 * sin registro simplemente no salen — no se rellenan con nada.
 */
export function mananasTras(
  fechaSesion: string,
  porDia: Record<string, RegistroDia>,
  dias: number = 2,
): Manana[] {
  const d = soloDia(fechaSesion)
  if (!fechaValida(d)) return []
  const out: Manana[] = []
  for (let despues = 1; despues <= dias; despues++) {
    const dia = sumarDias(d, despues)
    const registro = porDia[dia]
    if (registro) out.push({ dia, despues, registro })
  }
  return out
}

/** «la mañana siguiente» / «dos días después», para etiquetar la lista. */
export function despuesTexto(despues: number): string {
  if (despues === 1) return 'la mañana siguiente'
  return despues + ' días después'
}
