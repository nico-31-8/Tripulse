/**
 * Dónde va la marca de cada competición en el lienzo de periodización.
 *
 * Antes era una etiqueta con el nombre entero. Con seis carreras hacían tres
 * pisos de 27 píxeles que empujaban el lienzo hacia abajo, así que se
 * cambiaron por banderas: una sola fila, y plantadas en el día que caen.
 *
 * Vive en `lib/` y no dentro de la página porque es justo el tipo de cuenta que
 * se rompe en silencio: si dos marcas se solapan no falla nada, solo queda una
 * encima de la otra y el entrenador lee mal la fecha.
 */

export interface Colocada<T> {
  item: T
  left: number
  ancho: number
  fila: number
}

// ============================================================
// LAS BANDERAS
// ============================================================
// La etiqueta con el nombre entero se pisaba con la de al lado y hacía pisos:
// con seis carreras, tres filas de 27 píxeles empujando el lienzo hacia abajo.
// La bandera ocupa una sola fila y, además, DICE EL DÍA: se planta donde cae
// dentro de su semana, así que una carrera de domingo se ve al final de la
// barra y una de miércoles en medio. Eso antes no se sabía sin abrir el
// calendario.

/** Lo que mide una bandera de ancho, en píxeles. */
export const ANCHO_BANDERA = 17

export interface CompBandera {
  /** Semana del lienzo (0 = primera). */
  wi: number
  /** Día dentro de la semana: 0 lunes … 6 domingo (lib/fechas, indiceDia). */
  dia: number
}

/**
 * Dónde se planta el asta, dentro de su semana.
 *
 * El día se reparte a lo ancho de la columna y la bandera se queda ENTERA
 * dentro de ella: si la de domingo se saliera por la derecha, parecería de la
 * semana siguiente, que es justo el error que no se puede permitir aquí.
 */
export function posicionBandera(
  c: CompBandera,
  { semanaW, labelW }: { semanaW: number; labelW: number },
  ancho: number = ANCHO_BANDERA,
): number {
  const dia = Math.min(6, Math.max(0, Math.round(Number(c.dia) || 0)))
  const inicio = labelW + c.wi * semanaW
  const centro = inicio + Math.round((dia + 0.5) / 7 * semanaW) - Math.round(ancho / 2)
  return Math.min(Math.max(centro, inicio + 1), inicio + semanaW - ancho - 1)
}

/**
 * Las banderas con su sitio, y en qué piso va cada una.
 *
 * Casi siempre es un solo piso. Dos carreras el mismo fin de semana —o en días
 * pegados de semanas seguidas— se pisarían, y ahí la segunda sube una fila en
 * vez de taparse.
 */
export function colocarBanderas<T extends CompBandera>(
  comps: T[],
  medidas: { semanaW: number; labelW: number },
  ancho: number = ANCHO_BANDERA,
): Colocada<T>[] {
  const finDeFila: number[] = []
  return [...comps]
    .map(item => ({ item, left: posicionBandera(item, medidas, ancho) }))
    .sort((a, b) => a.left - b.left)
    .map(({ item, left }) => {
      let fila = finDeFila.findIndex(fin => fin <= left)
      if (fila < 0) fila = finDeFila.length
      finDeFila[fila] = left + ancho + 2
      return { item, left, ancho, fila }
    })
}

/** Cuántas filas ocupa la banda. 0 si no hay ninguna competición dentro. */
export function filasBanda(colocadas: Colocada<unknown>[]): number {
  return colocadas.reduce((n, c) => Math.max(n, c.fila + 1), 0)
}

