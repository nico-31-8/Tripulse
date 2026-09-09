/**
 * Dónde va la etiqueta de cada competición en la banda del lienzo de
 * periodización.
 *
 * DOS COSAS QUE UNA SOLA FILA NO RESUELVE: dos carreras en semanas seguidas se
 * pisan la una a la otra, y una en la última semana se sale del lienzo por la
 * derecha. Aquí cada etiqueta busca la primera fila libre —como los eventos de
 * un calendario— y la última se pega al borde en vez de desbordarlo.
 *
 * Vive en `lib/` y no dentro de la página porque es justo el tipo de cuenta que
 * se rompe en silencio: si dos etiquetas se solapan no falla nada, solo queda
 * una encima de la otra y el entrenador lee mal la fecha.
 */

export interface CompBanda {
  /** Semana del lienzo (0 = primera). */
  wi: number
  /** Se usa solo para estimar el ancho de la etiqueta. */
  nombre: string
}

export interface Colocada<T> {
  item: T
  left: number
  ancho: number
  fila: number
}

export interface MedidasBanda {
  /** Ancho de una columna de semana, en píxeles. */
  semanaW: number
  /** Margen reservado a la izquierda antes de la semana 1. */
  labelW: number
  /** Ancho total del lienzo. */
  anchoTotal: number
}

/**
 * Ancho estimado de la etiqueta a partir del nombre.
 *
 * No mide el texto de verdad —eso obligaría a pintar primero—, así que redondea
 * A LO ANCHO a propósito: si sobra, las etiquetas quedan más separadas de la
 * cuenta; si faltara, volverían a pisarse. El error caro es solo uno de los dos.
 */
export function anchoEtiqueta(nombre: string): number {
  return Math.max(96, (nombre || '').length * 5.6 + 74)
}

export function colocarBanda<T extends CompBanda>(
  comps: T[],
  { semanaW, labelW, anchoTotal }: MedidasBanda,
): Colocada<T>[] {
  const finDeFila: number[] = []
  const salida: Colocada<T>[] = []

  for (const item of [...comps].sort((a, b) => a.wi - b.wi)) {
    const ancho = anchoEtiqueta(item.nombre)
    /* La de la última semana se pega al borde derecho en vez de desbordarlo,
       pero nunca se mete en la columna de etiquetas de la izquierda. */
    const left = Math.min(labelW + item.wi * semanaW, Math.max(labelW, anchoTotal - ancho - 2))

    let fila = finDeFila.findIndex(fin => fin <= left)
    if (fila < 0) fila = finDeFila.length
    finDeFila[fila] = left + ancho + 4

    salida.push({ item, left, ancho, fila })
  }

  return salida
}

/** Cuántas filas ocupa la banda. 0 si no hay ninguna competición dentro. */
export function filasBanda(colocadas: Colocada<unknown>[]): number {
  return colocadas.reduce((n, c) => Math.max(n, c.fila + 1), 0)
}

/** Orden de importancia: la A manda sobre la B, y la B sobre la C. */
const PESO: Record<string, number> = { A: 3, B: 2, C: 1 }

/**
 * Una columna por semana, no una por carrera.
 *
 * DOS CARRERAS EN LA MISMA SEMANA PINTABAN DOS COLUMNAS ENCIMA DE LA OTRA, y
 * como la columna es translúcida se sumaban: cuatro carreras el mismo día
 * dejaban esa semana casi opaca, mucho más marcada que la del objetivo del año.
 * El color lo pone la más importante de las que caen ahí.
 */
export function columnasPorSemana<T extends { wi: number }>(
  comps: T[],
  prioridad: (c: T) => string,
): { wi: number; comp: T }[] {
  const porSemana = new Map<number, T>()
  for (const c of comps) {
    const antes = porSemana.get(c.wi)
    if (!antes || (PESO[prioridad(c)] || 0) > (PESO[prioridad(antes)] || 0)) porSemana.set(c.wi, c)
  }
  return [...porSemana.entries()].sort((a, b) => a[0] - b[0]).map(([wi, comp]) => ({ wi, comp }))
}
