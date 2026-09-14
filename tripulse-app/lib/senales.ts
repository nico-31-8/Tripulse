// ============================================================
// TRIPULSE — Las señales de un atleta, en un solo sitio
// ============================================================
// Qué mirar de lo que llega cada día (wellness, sesiones hechas, y mañana el
// reloj) y, sobre todo, QUÉ HACER con ello. Hasta ahora cada pantalla enseñaba
// su trozo —la disposición en wellness, la carga en /carga, los índices en los
// suyos— y ninguna decía «pasa esto, yo haría esto».
//
// Las reglas salen del Máster de Resistencia, módulo 4:
//   · L4.4 — lo que cuenta es la desviación respecto a la base del PROPIO
//     atleta, y hacen falta 3-4 semanas antes de interpretar nada. El ánimo es
//     de lo que antes se mueve. Un día malo es un día malo; la tendencia manda.
//   · L4.1 — la señal más útil de todas: que la misma sesión empiece a costar
//     más. Por eso «le cuesta más de lo previsto» es una señal de primera.
//   · L4.3 — la sesión más larga, por encima del 110 % de la del último mes.
//   · L4.6 — ante un patrón (ánimo + sueño + RPE + rendimiento), se actúa en el
//     escalón más bajo: descarga de 5-7 días. Barato comparado con lo otro.
//
// DOS REGLAS DE LA CASA:
//   1. Sin base no se inventa: si faltan datos se dice qué falta, no se avisa.
//   2. Cada señal trae el número que la sostiene. Un aviso sin su dato no se
//      puede discutir con el atleta, y es con él con quien se decide.

import { analizarWellness, type RegistroWellness } from './wellness-analisis'
import { bienestar } from './wellness-score'
import { sesionLarga } from './progresion'
import { desvioRpe } from './sesion-realizada'

export type NivelSenal = 'roja' | 'ambar' | 'info'

export type IdSenal =
  | 'bienestar' | 'bienestar_tendencia' | 'cuesta_mas' | 'sueno'
  | 'sesion_larga' | 'cumplimiento' | 'sin_wellness'

export interface Senal {
  id: IdSenal
  nivel: NivelSenal
  /** Qué pasa, en una línea. */
  titulo: string
  /** El dato que lo sostiene. Sin esto no se puede hablar con el atleta. */
  porque: string
  /** Qué haría. El entrenador decide; esto es la propuesta. */
  accion: string
}

export interface SesionSenal {
  fecha_sesion: string
  estado?: string | null
  rpe_estimado?: number | null
  rpe_reportado?: number | null
  minutos?: number | null
}

export interface EntradaSenales {
  /** Registros de wellness, del más reciente al más antiguo. */
  wellness: RegistroWellness[]
  /** Sesiones de las últimas semanas, planificadas y realizadas. */
  sesiones: SesionSenal[]
  hoy: string
}

export interface ResultadoSenales {
  senales: Senal[]
  /** Lo que aún no se puede mirar, y por qué. Se enseña; no se calla. */
  sinBase: string[]
}

// ---- Umbrales, todos juntos y con su porqué ----

/** Registros mínimos para comparar con «su normal» (L4.4: 3-4 semanas). */
export const MIN_REGISTROS_BASE = 14
/** Días de la ventana reciente de bienestar. */
const DIAS_RECIENTE = 5
/** Sesiones mínimas con RPE dado y previsto para hablar de cuánto le cuesta. */
const MIN_SESIONES_RPE = 3
/** Desvío medio de RPE a partir del cual la cosa deja de ser ruido (L4.1). */
const DESVIO_RPE_MEDIO = 1.5
/** Horas de sueño por debajo de su media que ya son otra cosa. */
const CAIDA_SUENO_H = 0.75
/** Días sin rellenar el wellness a partir de los que se avisa. */
const DIAS_SIN_WELLNESS = 3
/**
 * Caída mínima de bienestar (sobre 100) para que la tendencia cuente.
 *
 * El umbral es «una desviación típica por debajo de su media», pero con un
 * suelo: un atleta que puntúa casi siempre lo mismo tiene una desviación
 * diminuta, y sin suelo cualquier bajada valdría como señal.
 */
const CAIDA_MINIMA_BIENESTAR = 5
/** Sesiones perdidas en dos semanas a partir de las que se avisa. */
const MIN_PERDIDAS = 3

const dias = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)

const coma = (n: number, dec = 1) => n.toFixed(dec).replace('.', ',')

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

function desviacion(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = media(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

/**
 * Todas las señales de un atleta.
 *
 * Orden: primero lo rojo, luego lo ámbar, luego lo informativo. Dentro de cada
 * nivel, el orden en que se calculan, que va de lo más grave a lo más leve.
 */
export function senalesDeAtleta(e: EntradaSenales): ResultadoSenales {
  const senales: Senal[] = []
  const sinBase: string[] = []
  const hoy = e.hoy
  const wellness = [...(e.wellness || [])].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const sesiones = e.sesiones || []

  // ---- 1. Disposición: lo que ya sabe hacer el motor de wellness ----
  const an = analizarWellness(wellness)
  if (!an.readiness || !an.baselineFiable) {
    sinBase.push(wellness.length
      ? 'Su bienestar: ' + wellness.length + ' registros; con ' + MIN_REGISTROS_BASE + ' ya se puede comparar con su normal'
      : 'Su bienestar: todavía no ha rellenado ninguno')
  } else if (an.readiness.nivel === 'alerta' || an.readiness.nivel === 'fatiga') {
    const fuera = an.metricas.filter(m => m.fuera && m.reciente != null && m.base != null)
    senales.push({
      id: 'bienestar',
      nivel: an.readiness.nivel === 'alerta' ? 'roja' : 'ambar',
      titulo: an.readiness.nivel === 'alerta' ? 'Varios marcadores fuera de su normal' : 'Señales de fatiga acumulada',
      porque: fuera.length
        ? fuera.slice(0, 3).map(m => m.label + ' ' + coma(m.reciente!) + (m.unidad === '/7' ? '' : ' ' + m.unidad) + ' (su normal, ' + coma(m.base!) + ')').join(' · ')
        : an.conclusiones[0]?.texto || 'Su disposición está por debajo de lo normal en él.',
      accion: an.readiness.recomendacion,
    })
  }

  // ---- 2. La tendencia, que es la que convierte días mediocres en señal ----
  //     (L4.4: «un día malo es un día malo; cinco días bajando no lo son»).
  const conScore = wellness.filter(r => r.score_wellness != null)
  if (conScore.length >= MIN_REGISTROS_BASE) {
    const puntos = conScore.map(r => bienestar(r.score_wellness) ?? 0)
    const recientes = puntos.slice(0, DIAS_RECIENTE)
    const base = puntos.slice(DIAS_RECIENTE)
    const de = Math.max(desviacion(base), CAIDA_MINIMA_BIENESTAR)
    const mBase = media(base), mRec = media(recientes)
    if (base.length && mRec < mBase - de && !senales.some(s => s.id === 'bienestar')) {
      senales.push({
        id: 'bienestar_tendencia',
        nivel: 'ambar',
        titulo: 'Su bienestar lleva días por debajo de lo normal',
        porque: 'Últimos ' + DIAS_RECIENTE + ' días: ' + Math.round(mRec) + ' de 100, frente a ' + Math.round(mBase) + ' de su media.',
        accion: 'Pregúntale qué ha cambiado antes de tocar el plan: si es carga, se descarga; si es su vida (trabajo, sueño), se ajusta el plan a lo que hay.',
      })
    }
  }

  // ---- 3. Le cuesta más de lo previsto (L4.1: la señal más útil) ----
  const hechasRpe = sesiones.filter(s =>
    s.estado === 'Realizada' && s.rpe_reportado != null && s.rpe_estimado != null
    && dias(s.fecha_sesion.slice(0, 10), hoy) >= 0 && dias(s.fecha_sesion.slice(0, 10), hoy) < 14)
  if (hechasRpe.length < MIN_SESIONES_RPE) {
    sinBase.push('Cuánto le cuestan las sesiones: hacen falta al menos ' + MIN_SESIONES_RPE
      + ' con RPE en dos semanas (hay ' + hechasRpe.length + ')')
  } else {
    const desvios = hechasRpe.map(s => (s.rpe_reportado as number) - (s.rpe_estimado as number))
    const mDesvio = media(desvios)
    const duras = hechasRpe.filter(s => desvioRpe(s.rpe_estimado ?? null, s.rpe_reportado ?? null) === 'mas_duro').length
    if (mDesvio >= DESVIO_RPE_MEDIO || duras >= MIN_SESIONES_RPE) {
      senales.push({
        id: 'cuesta_mas',
        nivel: 'ambar',
        titulo: 'Las sesiones le están costando más de lo previsto',
        porque: duras + ' de las últimas ' + hechasRpe.length + ' por encima del RPE que pusiste'
          + ' (de media, ' + (mDesvio > 0 ? '+' : '') + coma(mDesvio) + ' puntos).',
        accion: 'Si la carga externa es la de siempre, es fatiga acumulándose: baja la exigencia de la próxima sesión de calidad y mira sueño y estrés.',
      })
    }
  }

  // ---- 4. Sueño (L4.4: con horas limitadas, la variable con más impacto) ----
  const conSueno = wellness.filter(r => typeof r.horas_sueno === 'number' && r.horas_sueno > 0)
  if (conSueno.length >= MIN_REGISTROS_BASE) {
    const h = conSueno.map(r => r.horas_sueno as number)
    const rec = media(h.slice(0, 7)), bas = media(h.slice(7))
    if (rec <= bas - CAIDA_SUENO_H) {
      senales.push({
        id: 'sueno',
        nivel: 'ambar',
        titulo: 'Está durmiendo menos de lo que suele',
        porque: 'Últimos 7 días: ' + coma(rec) + ' h de media, frente a ' + coma(bas) + ' h de su normal.',
        accion: 'Con menos sueño la misma sesión cuesta más y se adapta peor. Pregúntale qué ha cambiado antes de subirle la carga.',
      })
    }
  } else if (conSueno.length) {
    sinBase.push('Su sueño: ' + conSueno.length + ' días apuntados de ' + MIN_REGISTROS_BASE)
  }

  // ---- 5. El salto de la sesión larga (L4.3) ----
  const realizadas = sesiones.filter(s => s.estado === 'Realizada')
  const larga = sesionLarga(realizadas.map(s => ({ fecha_sesion: s.fecha_sesion, minutos: s.minutos })), hoy)
  if (larga?.excede) {
    senales.push({
      id: 'sesion_larga',
      nivel: 'ambar',
      titulo: 'Su sesión más larga ha dado un salto',
      porque: larga.ultimaSemana + ' min esta semana, frente a ' + larga.mesAnterior + ' min de la más larga del mes anterior (+'
        + Math.round((larga.ratio - 1) * 100) + ' %).',
      accion: 'Si el salto no era intencionado, vuelve al ' + Math.round(larga.mesAnterior * 1.1) + ' min como techo: es lo que mejor se relaciona con no lesionarse.',
    })
  }

  // ---- 6. Lo que no se ha hecho ----
  const pasadas = sesiones.filter(s => {
    const d = dias(s.fecha_sesion.slice(0, 10), hoy)
    return d >= 0 && d < 14
  })
  const perdidas = pasadas.filter(s => s.estado !== 'Realizada')
  if (perdidas.length >= MIN_PERDIDAS && pasadas.length > 0) {
    senales.push({
      id: 'cumplimiento',
      nivel: 'info',
      titulo: 'Se ha quedado sin hacer parte del plan',
      porque: perdidas.length + ' de ' + pasadas.length + ' sesiones de las dos últimas semanas sin marcar como hechas.',
      accion: 'Antes de progresar, averigua si no las hizo o no las apuntó: subir sobre una semana que no ocurrió es subir desde una base que no existe.',
    })
  }

  /* ---- 7. Y si no llegan datos, eso también es una señal ----
     Solo de quien está entrenando. Sin esa condición, una cuenta que dejó de
     usarse hace cuatro meses enseñaría «lleva 134 días sin rellenar» todos los
     días del resto de su vida, y la entrada del panel —donde esto se lee de un
     vistazo— se llenaría de gente que no entrena. Dejar de rellenar solo es
     noticia si hay algo que mirar. */
  const ultimo = wellness[0]?.fecha
  const sinRellenar = ultimo ? dias(ultimo.slice(0, 10), hoy) : null
  if (sinRellenar != null && sinRellenar >= DIAS_SIN_WELLNESS && pasadas.length > 0) {
    senales.push({
      id: 'sin_wellness',
      nivel: 'info',
      titulo: 'Lleva ' + sinRellenar + ' días sin rellenar el wellness',
      porque: 'Su último registro es del ' + ultimo.slice(0, 10) + '.',
      accion: 'Sin sus registros no se puede ver la fatiga venir. Treinta segundos al despertar bastan.',
    })
  }

  senales.sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel])
  return { senales, sinBase }
}

const ORDEN_NIVEL: Record<NivelSenal, number> = { roja: 0, ambar: 1, info: 2 }

/** El color de cada nivel. Aquí para que la entrada y el panel pinten igual. */
export const COLOR_SENAL: Record<NivelSenal, string> = {
  roja: '#ef4444', ambar: '#f59e0b', info: '#3b82f6',
}

// ============================================================
// El equipo entero, para la entrada del panel
// ============================================================
// Al entrar, el entrenador no tiene abierto a nadie. Sin esto, la única forma de
// saber quién necesita que le mire es abrirlos uno a uno — y entonces las
// señales solo sirven para el atleta que ya sospechabas.

export interface AtletaConSenales {
  id: number
  nombre: string
  /** El nivel más alto de sus señales: con eso se pinta. */
  nivel: NivelSenal
  /** Cuántas tiene. */
  n: number
  /** La primera, que ya viene ordenada de más grave a menos. */
  titular: string
}

/** Quién tiene algo y qué es lo primero. Ordenados de más grave a menos. */
export function resumenDeEquipo(
  por: Map<number, ResultadoSenales>,
  deportistas: { id: number; nombre?: string | null }[],
): AtletaConSenales[] {
  const out: AtletaConSenales[] = []
  for (const d of deportistas || []) {
    const s = por.get(d.id)?.senales || []
    if (!s.length) continue
    out.push({
      id: d.id,
      nombre: (d.nombre || '').trim() || 'Sin nombre',
      nivel: s[0].nivel,
      n: s.length,
      titular: s[0].titulo,
    })
  }
  return out.sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel] || b.n - a.n)
}

/** «2 atletas con señales» / «1 atleta con señales». Vacío si no hay ninguno. */
export function textoEquipo(lista: AtletaConSenales[]): string {
  const n = (lista || []).length
  if (!n) return ''
  return n === 1 ? '1 atleta con señales' : n + ' atletas con señales'
}
