// ============================================================
// Traer a la prescripción lo que hizo la última vez
// ============================================================
//
// El entrenador, escribiendo la sesión, pulsa el botón de un ejercicio y la fila
// se rellena con lo que ese atleta hizo la última vez que lo hizo. Luego lo
// retoca: sube el peso, cambia las repeticiones, lo que quiera. Lo que el atleta
// acaba viendo es LA PRESCRIPCIÓN, no un historial — solo que ahora la
// prescripción nace de lo que de verdad levantó.
//
// EL PROBLEMA ES QUE LAS SERIES CASI NUNCA SON IGUALES. «40×10, 40×10, 30×8» no
// es «3 × 10 @ 40», y rellenar eso sería meterle al entrenador un dato que él no
// ha comprobado. Así que:
//
//   · las repeticiones salen como RANGO cuando varían («8-10»), que es
//     exactamente para lo que existen los rangos;
//   · el peso es el que MÁS SE REPITIÓ, no el máximo ni el último: es el peso al
//     que de verdad trabajó, y el máximo de una serie suelta engaña;
//   · y siempre se devuelve el detalle serie a serie, para enseñárselo al lado.
//     Rellenar sin decir de dónde sale es pedirle que se fíe.

import { seriesPrincipales, type SerieHecha } from './modo-mejora'
import { textoReps } from './repeticiones'

export interface PrescripcionTraida {
  /** Cuántas series hizo. */
  series: string
  /** «10» o «8-10». Vacío en un ejercicio por tiempo. */
  reps: string
  /** El peso al que trabajó. Vacío si no anotó ninguno (peso corporal). */
  kg: string
  /** El control de aquel día, si lo anotó: «2» o «1-3». */
  control: string
  /** En qué escala lo anotó: rir, rpe, vel o pct1rm. */
  controlTipo: string
  /** Lo que hizo, tal cual: «40×10 · 40×10 · 30×8». Para enseñarlo al lado. */
  detalle: string
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** El valor que más veces aparece. Con empate, el mayor. */
function elQueMasSeRepite(valores: number[]): number | null {
  if (!valores.length) return null
  const cuenta = new Map<number, number>()
  for (const v of valores) cuenta.set(v, (cuenta.get(v) || 0) + 1)
  let mejor: number | null = null, mejorN = 0
  for (const [v, n] of cuenta) {
    if (n > mejorN || (n === mejorN && mejor !== null && v > mejor)) { mejor = v; mejorN = n }
  }
  return mejor
}

/**
 * Lo que rellena la fila, a partir de las series de la última ejecución.
 *
 * Devuelve null si no hay nada aprovechable: sin series, o con todas en blanco.
 * Quien llama avisa; rellenar con ceros sería peor que no hacer nada.
 */
export function prescripcionDesdeUltimaVez(
  series: SerieHecha[] | null | undefined,
  porTiempo = false,
): PrescripcionTraida | null {
  const p = seriesPrincipales(series)
  if (!p.length) return null

  const pesos = p.map(s => num(s.peso_real)).filter(v => v > 0)
  const reps = p.map(s => num(s.repeticiones_reales)).filter(v => v > 0)
  const tiempos = p.map(s => num(s.tiempo_real)).filter(v => v > 0)
  const controles = p.map(s => num(s.control_real)).filter(v => v > 0)

  /* Sin nada medido no hay prescripción que traer: puede pasar si el atleta
     marcó las series como hechas sin anotar ni peso ni repeticiones. */
  if (!pesos.length && !reps.length && !tiempos.length) return null

  const kg = elQueMasSeRepite(pesos)

  const medida = porTiempo ? tiempos : reps
  const min = medida.length ? Math.min(...medida) : 0
  const max = medida.length ? Math.max(...medida) : 0

  const cMin = controles.length ? Math.min(...controles) : 0
  const cMax = controles.length ? Math.max(...controles) : 0

  return {
    series: String(p.length),
    /* Por tiempo, el campo de la fila lleva los segundos y no admite rango:
       se manda el mayor, que es lo que aguantó en su mejor serie. */
    reps: porTiempo ? (max ? String(max) : '') : textoReps(min, max),
    kg: kg ? String(kg) : '',
    control: cMin ? (cMin === cMax ? String(cMin) : cMin + '-' + cMax) : '',
    controlTipo: p.find(s => s.control_tipo)?.control_tipo || '',
    detalle: p.map(s => {
      if (porTiempo) return num(s.tiempo_real) ? num(s.tiempo_real) + 's' : '—'
      const k = num(s.peso_real), r = num(s.repeticiones_reales)
      if (k && r) return k + '×' + r
      if (r) return String(r)
      if (k) return k + ' kg'
      return '—'
    }).join(' · '),
  }
}
