// ============================================================
// TRIPULSE — El informe de la semana
// ============================================================
// Qué pasó la semana pasada y qué haría con la que viene. Una sola vez, para
// que el entrenador y el atleta lean LO MISMO: hasta ahora había dos tarjetas
// («Vista de equipo» y «Tu semana pasada») con dos cálculos parecidos y frases
// distintas, y ninguna de las dos decía un número que se pudiera discutir.
//
// Lo que cambia respecto a la versión anterior:
//   · las frases traen el dato («1.840 UA, un 18 % más que en sus 4 semanas
//     anteriores»), no adjetivos («carga elevada»);
//   · el bienestar se compara con la base del PROPIO atleta (L4.4) y no con un
//     número fijo igual para todos;
//   · la progresión se mira en absoluto —esta semana contra sus cuatro— que es
//     lo que el Máster propone en vez del ACWR (L4.3);
//   · y la propuesta para la semana que viene sale de las señales, que ya traen
//     su acción, en vez de un árbol de frases hechas.
//
// Sin base no se opina: si no hay semanas anteriores con las que comparar, se
// dice, y la propuesta se queda en lo que sí se puede sostener.

import { bienestar } from './wellness-score'
import type { RegistroWellness } from './wellness-analisis'
import type { Senal } from './senales'

/** Semanas anteriores con las que se compara la que se informa. */
export const SEMANAS_BASE = 4
/** Subida de carga a partir de la cual toca consolidar antes de volver a subir. */
export const SUBIDA_PARA_CONSOLIDAR = 0.3
/** Cumplimiento por debajo del cual no se progresa: primero se averigua qué pasó. */
export const CUMPLIMIENTO_MINIMO = 0.6
/** RPE que se usa cuando no hay ninguno, igual que en el resto de los motores. */
const RPE_POR_DEFECTO = 5

export interface SesionInforme {
  fecha_sesion: string
  estado?: string | null
  rpe_estimado?: number | null
  rpe_reportado?: number | null
  minutos?: number | null
}

export interface EntradaInforme {
  /** Lunes de la semana de la que se informa. */
  lunes: string
  /** Sesiones de esa semana y de las anteriores; aquí se reparten por fecha. */
  sesiones: SesionInforme[]
  /** Wellness del mismo periodo. */
  wellness: RegistroWellness[]
  /** Las señales de hoy (lib/senales). Traen su porqué y su acción. */
  senales?: Senal[]
}

export type NivelSemana = 'ok' | 'ambar' | 'roja'

export interface Informe {
  lunes: string
  domingo: string
  /** Lo que hizo. */
  hecho: {
    planificadas: number
    realizadas: number
    /** realizadas ÷ planificadas, o null si no había nada planificado. */
    cumplimiento: number | null
    minutos: number
    /** Carga interna de lo realizado, en UA (sRPE de Foster: RPE × minutos). */
    carga: number
  }
  /** Contra sus propias semanas. `null` cuando no hay ninguna con la que comparar. */
  comparado: {
    cargaPrevia: number
    /** +0,18 = un 18 % más que su media. */
    variacion: number
    semanas: number
  } | null
  /** Cómo se encontró, contra su propia base. */
  bienestar: {
    medio: number | null
    dias: number
    base: number | null
    /** Puntos sobre 100 de diferencia con su base. */
    variacion: number | null
  }
  senales: Senal[]
  nivel: NivelSemana
  /** Qué pasó, en una línea con su número. */
  titular: string
  /** Qué haría con la semana que viene. Escrito para el ENTRENADOR. */
  proxima: string
  /**
   * Lo mismo, dicho al ATLETA.
   *
   * No es una traducción: al atleta no se le dan órdenes de carga —las decide su
   * entrenador— sino lo que sí está en su mano (marcar lo que hizo, rellenar el
   * wellness, contar lo que le pasa). Si la app le dijera «no subas esta semana»
   * y su entrenador le sube, la que pierde es la app.
   */
  paraElAtleta: string
  /** Lo que no se puede mirar todavía, y por qué. */
  sinBase: string[]
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

const pct = (x: number) => (x > 0 ? '+' : '') + Math.round(x * 100) + ' %'

const miles = (n: number) => Math.round(n).toLocaleString('es-ES')

/** «6 h 10 min», «45 min». Para leer, no para una tabla. */
export function duracionLarga(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60), r = m % 60
  if (!h) return r + ' min'
  return h + ' h' + (r ? ' ' + r + ' min' : '')
}

const cargaDe = (s: SesionInforme, real: boolean) => {
  const rpe = (real ? s.rpe_reportado ?? s.rpe_estimado : s.rpe_estimado) ?? RPE_POR_DEFECTO
  return rpe * Math.max(0, s.minutos || 0)
}

const enSemana = (fecha: string, lunes: string) => {
  const d = Math.round((Date.parse(fecha.slice(0, 10) + 'T12:00:00Z') - Date.parse(lunes + 'T12:00:00Z')) / 86400000)
  return d >= 0 && d < 7 ? 0 : d < 0 ? Math.floor(d / 7) : 1
}

export function informeSemanal(e: EntradaInforme): Informe {
  const lunes = e.lunes
  const domingo = new Date(Date.parse(lunes + 'T12:00:00Z') + 6 * 86400000).toISOString().slice(0, 10)
  const sesiones = (e.sesiones || []).filter(s => s.fecha_sesion)
  const senales = e.senales || []
  const sinBase: string[] = []

  // ---- Lo que hizo ----
  const semana = sesiones.filter(s => enSemana(s.fecha_sesion, lunes) === 0)
  const realizadas = semana.filter(s => s.estado === 'Realizada')
  const planificadas = semana.length
  const cumplimiento = planificadas ? realizadas.length / planificadas : null
  const minutos = realizadas.reduce((a, s) => a + Math.max(0, s.minutos || 0), 0)
  const carga = realizadas.reduce((a, s) => a + cargaDe(s, true), 0)

  // ---- Contra sus propias semanas (L4.3: progresión en absoluto) ----
  /* Solo semanas en las que entrenó: un parón de vacaciones metido en la media
     haría que cualquier vuelta a la normalidad saliera como «subida fuerte». */
  const previas: number[] = []
  for (let k = 1; k <= SEMANAS_BASE; k++) {
    const cs = sesiones.filter(s => enSemana(s.fecha_sesion, lunes) === -k && s.estado === 'Realizada')
    if (cs.length) previas.push(cs.reduce((a, s) => a + cargaDe(s, true), 0))
  }
  const cargaPrevia = previas.length ? media(previas) : 0
  const comparado = previas.length && cargaPrevia > 0
    ? { cargaPrevia, variacion: (carga - cargaPrevia) / cargaPrevia, semanas: previas.length }
    : null
  if (!comparado) sinBase.push('Su carga: todavía no hay semanas anteriores con las que compararla')

  // ---- Cómo se encontró, contra su base (L4.4) ----
  const puntos = (w: RegistroWellness[]) =>
    w.map(r => bienestar(r.score_wellness)).filter((n): n is number => n != null)
  const wellSemana = puntos((e.wellness || []).filter(w => enSemana(w.fecha, lunes) === 0))
  const wellBase = puntos((e.wellness || []).filter(w => {
    const k = enSemana(w.fecha, lunes)
    return k < 0 && k >= -SEMANAS_BASE
  }))
  const medio = wellSemana.length ? Math.round(media(wellSemana)) : null
  const base = wellBase.length ? Math.round(media(wellBase)) : null
  if (medio == null) sinBase.push('Su bienestar de esa semana: no rellenó ninguno')
  else if (base == null) sinBase.push('Su bienestar: falta la base de las semanas anteriores para saber si eso es mucho o poco en él')

  // ---- El veredicto, que sale de las señales y del cumplimiento ----
  const roja = senales.find(s => s.nivel === 'roja')
  const ambar = senales.find(s => s.nivel === 'ambar')
  const flojo = cumplimiento != null && cumplimiento < CUMPLIMIENTO_MINIMO
  const subidaFuerte = !!comparado && comparado.variacion > SUBIDA_PARA_CONSOLIDAR
  const nivel: NivelSemana = roja || flojo ? 'roja' : ambar || subidaFuerte ? 'ambar' : 'ok'

  return {
    lunes, domingo,
    hecho: { planificadas, realizadas: realizadas.length, cumplimiento, minutos, carga },
    comparado,
    bienestar: { medio, dias: wellSemana.length, base, variacion: medio != null && base != null ? medio - base : null },
    senales, nivel,
    titular: titularDe({ planificadas, realizadas: realizadas.length, minutos, carga }, comparado),
    proxima: proximaDe({ roja, ambar, flojo, subidaFuerte, comparado, cumplimiento, planificadas }),
    paraElAtleta: paraElAtletaDe({
      aviso: roja || ambar, flojo, subidaFuerte, comparado, planificadas,
      sinMarcar: planificadas - realizadas.length, wellness: wellSemana.length,
    }),
    sinBase,
  }
}

function titularDe(
  h: { planificadas: number; realizadas: number; minutos: number; carga: number },
  comparado: Informe['comparado'],
): string {
  if (!h.planificadas) return 'No había nada planificado esa semana.'
  if (!h.realizadas) return 'No marcó ninguna de las ' + h.planificadas + ' sesiones de esa semana.'

  const sesiones = h.realizadas !== h.planificadas
    ? 'Hizo ' + h.realizadas + ' de ' + h.planificadas + ' sesiones'
    : h.realizadas === 1 ? 'Hizo la sesión que tenía' : 'Hizo las ' + h.realizadas + ' sesiones'
  const cuerpo = sesiones + ': ' + duracionLarga(h.minutos) + ' y ' + miles(h.carga) + ' UA de carga'
  if (!comparado) return cuerpo + '.'
  const v = comparado.variacion
  if (Math.abs(v) < 0.1) return cuerpo + ', en línea con sus ' + comparado.semanas + ' semanas anteriores.'
  return cuerpo + ', ' + pct(v) + ' respecto a sus ' + comparado.semanas + ' semanas anteriores.'
}

function proximaDe(c: {
  roja?: Senal; ambar?: Senal; flojo: boolean; subidaFuerte: boolean
  comparado: Informe['comparado']; cumplimiento: number | null; planificadas: number
}): string {
  /* El orden importa: primero lo que impide subir, luego lo que aconseja
     esperar, y solo al final la progresión. Cada rama dice qué hacer, no cómo
     está la cosa. */
  if (c.roja) return 'Esta semana no es de subir. ' + c.roja.accion
  if (c.flojo) {
    return 'Antes de progresar, averigua qué pasó: solo hizo '
      + Math.round((c.cumplimiento || 0) * 100) + ' % de lo planificado, y subir sobre una semana'
      + ' que no ocurrió es subir desde una base que no existe.'
  }
  if (c.ambar) return 'Mantén la carga donde está y confirma que se recupera. ' + c.ambar.accion
  if (c.subidaFuerte && c.comparado) {
    return 'Ya subió un ' + Math.round(c.comparado.variacion * 100) + ' %: consolida esa carga otra semana'
      + ' antes de volver a subir. La adaptación va por detrás del entrenamiento.'
  }
  if (!c.planificadas) return 'Planifica la semana y vuelve a mirar esto el lunes que viene.'
  return 'Semana en orden. Si toca progresar, sube el volumen total entre un 5 y un 10 %'
    + ' y deja la sesión más larga como está: es el salto de la larga el que se relaciona con lesionarse.'
}

function paraElAtletaDe(c: {
  aviso?: Senal; flojo: boolean; subidaFuerte: boolean; comparado: Informe['comparado']
  planificadas: number; sinMarcar: number; wellness: number
}): string {
  if (!c.planificadas) return 'No tenías nada planificado esa semana.'
  if (c.flojo) {
    return 'Te quedaron ' + c.sinMarcar + (c.sinMarcar === 1 ? ' sesión' : ' sesiones')
      + ' sin marcar. Si las hiciste, márcalas; y si no pudiste, cuéntaselo a tu entrenador:'
      + ' el plan se ajusta a lo que hay, pero solo si lo sabe.'
  }
  if (c.aviso) {
    return 'Hay algo que conviene que habléis: ' + c.aviso.tituloAtleta
      + '. Tu entrenador lo tiene delante; tú cuéntale cómo lo estás llevando.'
  }
  if (c.subidaFuerte && c.comparado) {
    return 'Entrenaste un ' + Math.round(c.comparado.variacion * 100) + ' % más que en tus semanas anteriores.'
      + ' Es bastante de golpe: si notas que cuesta más de lo normal, dilo antes de que se acumule.'
  }
  if (!c.wellness) {
    return 'Semana en orden. Lo único que falta es tu wellness: son treinta segundos al despertar,'
      + ' y es lo que permite ver la fatiga venir antes de que la notes.'
  }
  return 'Semana en orden. Sigue apuntando cómo te encuentras: es lo que deja ver la fatiga'
    + ' antes de que se convierta en un problema.'
}
