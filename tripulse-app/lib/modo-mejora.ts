// ============================================================
// TRIPULSE — «La última vez hiciste esto»
// ============================================================
//
// Lo que convierte una hoja de registro en un entrenamiento: al ponerte con la
// sentadilla, ver que la última vez fueron 80×8 con RIR 2. Sin eso el atleta
// apunta números en el vacío y la progresión depende de que se acuerde.
//
// Esta lógica vivía DENTRO de FuerzaRegistro, la pantalla de ejecución. Al
// hacer que el atleta pueda registrar su propia sesión de fuerza habría que
// escribirla por segunda vez, y entonces «lo que hiciste la última vez» diría
// una cosa en una pantalla y otra en la otra. Aquí está una sola vez.
//
// De dónde salen las series: del RPC `ultima_ejecucion_fuerza(_dep, _nombre,
// _antes)`, que busca la sesión Realizada más reciente ANTES de esa fecha con un
// ejercicio de ese nombre. Se casa por NOMBRE y no por id de biblioteca porque
// el histórico es de lo que se hizo, no de lo que se prescribió.

import { controlDe } from './control-esfuerzo'

export interface SerieHecha {
  numero_serie?: number | null
  peso_real?: number | string | null
  repeticiones_reales?: number | string | null
  tiempo_real?: number | string | null
  control_real?: number | string | null
  /** Cómo se anotó ESE día: rir, rpe, vel o pct1rm. */
  control_tipo?: string | null
  /** 1 = el ejercicio principal; 2 = el encadenado de una superserie. */
  ejercicio_numero?: number | null
}

/**
 * Solo las del ejercicio PRINCIPAL.
 *
 * En una superserie hay series con `ejercicio_numero` 2, que son de otro
 * ejercicio distinto. Mezclarlas haría que «la última vez» sumara press banca
 * dentro de la sentadilla.
 */
export function seriesPrincipales(series: SerieHecha[] | null | undefined): SerieHecha[] {
  return (series || []).filter(s => (s?.ejercicio_numero ?? 1) === 1)
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * «80×8 · 80×8 · 75×6», o «45s · 40s» si el ejercicio va por tiempo.
 *
 * En un ejercicio por tiempo, «45×? reps» no dice nada: lo que hay que superar
 * son los segundos.
 */
export function resumenUltimaVez(series: SerieHecha[] | null | undefined, porTiempo = false): string {
  return seriesPrincipales(series).map(s => {
    if (porTiempo) {
      const seg = num(s.tiempo_real)
      if (!seg) return '?'
      return s.peso_real ? num(s.peso_real) + 'kg·' + seg + 's' : seg + 's'
    }
    if (s.peso_real) return num(s.peso_real) + '×' + (num(s.repeticiones_reales) || '?')
    return (num(s.repeticiones_reales) || '?') + ' reps'
  }).join(' · ')
}

/**
 * El control con el que se anotó ESE día, no el que se prescribe hoy.
 *
 * Si la última vez fue en RPE y hoy pides RIR, poner «RIR 8» encima de un número
 * que era un RPE sería mentir sobre el histórico. Devuelve la etiqueta corta y
 * el valor, que puede ser un rango si las series no coincidieron.
 */
export function controlUltimaVez(series: SerieHecha[] | null | undefined): { etiqueta: string; valor: string } {
  const p = seriesPrincipales(series)
  const etiqueta = controlDe(p[0]?.control_tipo || 'rir').corto
  const vals = p.map(s => s.control_real).filter(v => v != null).map(v => Number(v))
  if (!vals.length) return { etiqueta, valor: '' }
  const min = Math.min(...vals), max = Math.max(...vals)
  return { etiqueta, valor: min === max ? String(min) : min + '-' + max }
}

/**
 * Cuánto trabajo hubo.
 *
 * En reps es kg×reps; en los de tiempo, los segundos aguantados. Mezclar las dos
 * daría 0 siempre en los de tiempo y el «lo has superado» no saltaría nunca.
 */
export function volumenDe(series: SerieHecha[] | null | undefined, porTiempo = false): number {
  return seriesPrincipales(series).reduce((a, s) => a + (porTiempo
    ? num(s.tiempo_real)
    : num(s.peso_real) * num(s.repeticiones_reales)), 0)
}

/** ¿Lo de hoy iguala o pasa lo de la última vez? Sin última vez no hay nada que superar. */
export function haSuperado(volAnterior: number, volHoy: number): boolean {
  return volAnterior > 0 && volHoy >= volAnterior
}

/** La serie número N de la última vez, para el fantasma de esa casilla. */
export function serieAnterior(series: SerieHecha[] | null | undefined, n: number): SerieHecha | undefined {
  return seriesPrincipales(series).find(s => s.numero_serie === n)
}

/** «hace 5 días» / «ayer» / «hoy». */
export function haceTexto(dias: number | null | undefined): string {
  if (dias == null) return ''
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return 'hace ' + dias + ' días'
}

/**
 * ¿Lo de hoy PASA lo de la última vez? Estrictamente mayor.
 *
 * Se diferencia de `haSuperado` a propósito, y la diferencia depende de con qué
 * empiezan las casillas:
 *
 *   · En la pantalla de ejecución nacen VACÍAS, así que llegar a lo de la última
 *     vez ya es un logro y se marca (`haSuperado`, con >=).
 *   · Cuando el atleta apunta su propia sesión, las casillas nacen RELLENAS con
 *     lo de la última vez. Ahí igualar es el punto de partida, no un logro: si
 *     se marcara con >=, la insignia saldría encendida antes de entrenar.
 */
export function haMejorado(volAnterior: number, volHoy: number): boolean {
  return volAnterior > 0 && volHoy > volAnterior
}
