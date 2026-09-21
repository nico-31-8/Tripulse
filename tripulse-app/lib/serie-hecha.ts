// ============================================================
// Cuándo una serie cuenta como hecha
// ============================================================
//
// MARCADA O CON ALGO ANOTADO. Cada serie tiene un circulito para marcarla y casi
// nadie lo toca. En la base, a 21 de septiembre de 2026, de 76 series anotadas
// solo 9 estaban marcadas: las otras 67 tenían los kilos puestos y
// `completada = false`. Fiarse del circulito decía «0 de 3» de sesiones que se
// hicieron enteras.
//
// Por eso la regla vive aquí, una vez, y la usan todas las pantallas que cuentan
// series: La semana (lo que hizo), las series realizadas de la ficha de sesión y
// el resumen al cerrar la ejecución. Si cada una decidiera por su cuenta, la
// misma serie saldría hecha en una pantalla y sin hacer en la de al lado.

/** Lo que se mira de una fila de `series_realizadas` para saber si se hizo. */
export interface SerieConDatos {
  numero_serie?: number | string | null
  completada?: boolean | null
  peso_real?: number | string | null
  repeticiones_reales?: number | string | null
  tiempo_real?: number | string | null
  metros_reales?: number | string | null
  control_real?: number | string | null
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
export const tieneDatos = (s: SerieConDatos | null | undefined): boolean =>
  !!s && (s.completada === true ||
    [s.peso_real, s.repeticiones_reales, s.tiempo_real, s.metros_reales, s.control_real].some(v => num(v) > 0))

/**
 * Cuántas series distintas hizo.
 *
 * Una serie cuenta una vez aunque ocupe varias filas: en una superserie cada
 * serie lleva dos (una por ejercicio) y en un drop set una por escalón. Basta con
 * que tenga algo anotado en cualquiera de ellas.
 */
export function seriesHechas(series: SerieConDatos[] | null | undefined): number {
  return new Set((series || []).filter(tieneDatos).map(s => num(s.numero_serie))).size
}

/** Una serie de resistencia a medio anotar en la pantalla de ejecución, donde todo es texto. */
export interface SerieEscrita {
  completada?: boolean
  tiempo?: string
  metros?: string
  ritmo?: string
  sensacion?: string
}

/**
 * La misma regla en la ejecución de resistencia: allí aún no hay columnas, hay
 * lo que va escribiendo («4:30», «400»). Por eso no vale `tieneDatos`, que
 * leería «4:30» como cero.
 */
export const serieEscrita = (s: SerieEscrita | null | undefined): boolean =>
  !!s && (s.completada === true ||
    [s.tiempo, s.metros, s.ritmo, s.sensacion].some(v => String(v ?? '').trim() !== ''))
