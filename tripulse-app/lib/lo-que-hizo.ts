// ============================================================
// Lo que hizo el atleta, puesto al lado de lo que se le mandó
// ============================================================
//
// PARA QUÉ. Para prescribir el peso de esta semana mirando lo que levantó la
// anterior. En el panel de la semana, una sesión hecha tiene un botón que
// cambia la tarjeta de cada tarea entre lo que PRESCRIBISTE y lo que el atleta
// ANOTÓ al hacerla.
//
// EN LAS MISMAS CASILLAS, UNA POR DATO. Lo hecho se coloca con la misma forma
// que la prescripción —Series, Repeticiones, Carga, Control—, así que al pulsar
// el botón las mismas cajas cambian de valor: «Carga —» pasa a «Carga 40 kg».
//
// Al principio iba todo junto en una línea, «40×10 · 40×10», como lo ve el
// atleta en la ejecución. Lo cambió mirar lo que anotan de verdad: rellenan el
// peso y casi nunca las repeticiones, así que la línea salía «40×? · 40×?». Con
// una casilla por dato, lo que no anotó dice «—» y lo que sí, se lee limpio.
//
// UNA SERIE CUENTA SI TIENE ALGO ANOTADO, esté marcada o no. En la base, las
// series con el peso puesto llegan con `completada = false`: el atleta rellena
// los kilos y no toca el circulito. Fiarse de `completada` decía «0 de 2» de
// una sesión que sí hizo, que es la peor mentira que puede contar esta pantalla.
//
// NO ANOTÓ NADA ≠ HIZO CERO. Una tarea sin nada anotado devuelve `null`, y la
// pantalla lo dice con esas palabras. Un «0 kg» se leería como que no levantó.

import { seriesPrincipales, controlUltimaVez, type SerieHecha } from './modo-mejora'
import { vecesDe } from './bloques-tarea'
import { mmss } from './duracion-carga'
import type { CampoTarea } from './tarea-vista'

/** Una fila de `series_realizadas`: por ejercicio en fuerza, por tarea en resistencia. */
export interface SerieRealizada extends SerieHecha {
  id_ejercicio?: number | null
  id_tarea?: number | null
  metros_reales?: number | string | null
  completada?: boolean | null
}

/** Lo que se mira de una tarea para colocar lo que hizo. */
export interface TareaVistaHecha {
  id?: number | null
  disciplina?: string | null
  series?: number | null
  bloques?: number | null
  rpe_reportado?: number | null
  fc_media?: number | null
  p_distancia?: { metros_reales?: number | null }[] | null
  p_duracion?: { tiempo_planeado?: number | null; tiempo_real?: number | null }[] | null
  ejercicios?: { id?: number | null; grupo_muscular?: string | null; series?: number | null; tipo_serie?: string | null }[] | null
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Si esta serie la hizo: marcada, o con cualquier dato anotado.
 *
 * Lo segundo es lo normal: el atleta pone los kilos y no marca el circulito.
 */
export const tieneDatos = (s: SerieRealizada): boolean =>
  s.completada === true ||
  [s.peso_real, s.repeticiones_reales, s.tiempo_real, s.metros_reales, s.control_real].some(v => num(v) > 0)

/**
 * Las series que anotó para ESTA tarea.
 *
 * En fuerza cuelgan de sus ejercicios (`id_ejercicio`) y en resistencia de la
 * propia tarea (`id_tarea`). Se miran las dos cosas porque una tarea de fuerza
 * no tiene series por tarea y una de resistencia no tiene ejercicios: pedir
 * solo una de las dos dejaría media app sin nada que enseñar.
 */
export function seriesDeTarea(t: TareaVistaHecha, todas: SerieRealizada[] | null | undefined): SerieRealizada[] {
  const idsEj = new Set((t?.ejercicios || []).map(e => e?.id).filter((x): x is number => x != null))
  return (todas || [])
    .filter(s => (s.id_ejercicio != null && idsEj.has(s.id_ejercicio)) || (s.id_tarea != null && s.id_tarea === t?.id))
    .slice()
    .sort((a, b) => num(a.numero_serie) - num(b.numero_serie))
}

/**
 * Un dato de todas las series en una casilla: «40 kg», «60 · 60 · 62.5 kg»,
 * «10 · ? · 8» o «—».
 *
 * Si en todas es el mismo se dice una vez: la casilla de al lado ya dice
 * cuántas series fueron. Si falta en alguna, un «?» en su sitio para que las
 * posiciones sigan cuadrando con las otras casillas. Si no está en ninguna,
 * «—»: no anotado, que no es lo mismo que cero.
 */
export function valoresEnCasilla(vals: number[], formato: (n: number) => string = String, sufijo = ''): string {
  const hay = vals.filter(v => v > 0)
  if (!hay.length) return '—'
  if (hay.length === vals.length && hay.every(v => v === hay[0])) return formato(hay[0]) + sufijo
  return vals.map(v => (v > 0 ? formato(v) : '?')).join(' · ') + sufijo
}

/** «2 de 2», o «2» si no hay cuántas se mandaron. */
const deCuantas = (n: number, mandadas: number) => (mandadas > 0 ? n + ' de ' + mandadas : String(n))

/** Segundos como se leen en una casilla: «45 s» o «1:25». */
const segundos = (s: number) => (s < 60 ? s + ' s' : mmss(s))

/** Una serie de resistencia: «400 m en 1:25», «1:25» o «400 m». */
function serieResistencia(s: SerieRealizada): string {
  const m = num(s.metros_reales), seg = num(s.tiempo_real)
  if (m && seg) return m + ' m en ' + mmss(seg)
  if (seg) return mmss(seg)
  if (m) return m + ' m'
  return ''
}

/**
 * Lo que hizo en una tarea, en casillas como las de la prescripción.
 *
 * `null` cuando no anotó nada en ella. Eso no es un fallo: muchos atletas
 * cierran la sesión con el RPE y no apuntan serie a serie, y la pantalla tiene
 * que poder decirlo sin inventarse ceros.
 */
export function camposHechos(t: TareaVistaHecha, series: SerieRealizada[] | null | undefined): CampoTarea[] | null {
  const suyas = (series || []).filter(tieneDatos)
  const ej = t?.ejercicios?.[0]

  /* FUERZA, incluida la línea de cardio: series por ejercicio. */
  if (t?.disciplina === 'Fuerza') {
    const principal = seriesPrincipales(suyas)
    if (!principal.length) return null
    const esCardio = ej?.tipo_serie === 'Cardio'
    const porTiempo = esCardio || !!t?.p_duracion?.[0]?.tiempo_planeado
    const campos: CampoTarea[] = []
    if (!esCardio && ej?.grupo_muscular) campos.push({ k: 'Grupo', v: ej.grupo_muscular })
    campos.push({ k: 'Series', v: deCuantas(principal.length, num(ej?.series ?? t?.series)) })
    if (porTiempo) {
      campos.push({ k: 'Tiempo', v: valoresEnCasilla(principal.map(s => num(s.tiempo_real)), segundos), destaca: true })
    } else {
      campos.push({ k: 'Repeticiones', v: valoresEnCasilla(principal.map(s => num(s.repeticiones_reales)), String, ' reps') })
    }
    if (!esCardio) {
      /* La casilla por la que existe este botón: cuánto peso puso. */
      campos.push({ k: 'Carga', v: valoresEnCasilla(principal.map(s => num(s.peso_real)), String, ' kg'), destaca: true })
      const c = controlUltimaVez(principal)
      campos.push({ k: 'Control', v: c.valor ? c.etiqueta + ' ' + c.valor : '—' })
    }
    /* El segundo ejercicio de una superserie tiene sus propias series: si se
       mezclaran, la carga sumaría el press banca dentro de la sentadilla. */
    const encadenado = suyas.filter(s => (s.ejercicio_numero ?? 1) === 2)
    if (encadenado.length) {
      const kg = valoresEnCasilla(encadenado.map(s => num(s.peso_real)), String, ' kg')
      const reps = valoresEnCasilla(encadenado.map(s => num(s.repeticiones_reales)), String, ' reps')
      campos.push({ k: 'Encadenado', v: [kg, reps].filter(x => x !== '—').join(' · ') || '—' })
    }
    return campos
  }

  /* RESISTENCIA: series por tarea y, si no apuntó serie a serie, lo que dejó en
     la tarea al cerrar. */
  const porSerie = suyas.map(serieResistencia).filter(Boolean)
  const campos: CampoTarea[] = []
  if (porSerie.length) {
    campos.push({ k: 'Series', v: deCuantas(suyas.length, vecesDe(t)) })
    campos.push({ k: 'Hecho', v: porSerie.join(' · '), destaca: true })
  } else {
    const m = num(t?.p_distancia?.[0]?.metros_reales)
    const seg = num(t?.p_duracion?.[0]?.tiempo_real)
    if (m) campos.push({ k: 'Distancia', v: m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m', destaca: true })
    if (seg) campos.push({ k: 'Tiempo', v: mmss(seg), destaca: true })
  }
  if (t?.rpe_reportado != null) campos.push({ k: 'RPE', v: t.rpe_reportado + '/10' })
  if (t?.fc_media != null) campos.push({ k: 'FC media', v: t.fc_media + ' ppm' })
  return campos.length ? campos : null
}
