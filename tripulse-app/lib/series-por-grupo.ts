// ============================================================
// TRIPULSE — Series por grupo muscular
// ============================================================
//
// Cuántas series se han hecho de cada grupo. Es la medida con la que se controla
// el volumen de fuerza, y hasta ahora estaba escrita DOS VECES, cada una con sus
// reglas:
//
//   /volumen  →  if (e.grupo_muscular) ... + (e.series || 0)
//   el canvas →  (e.grupo_muscular || 'Sin clasificar') ... + (e.series || 1)
//
// O sea, la misma pregunta con dos respuestas distintas:
//
//   · Un ejercicio SIN grupo desaparecía del gráfico de /volumen y salía como
//     «Sin clasificar» en el del canvas. En /volumen el total era menor que el
//     de verdad y nada lo decía, que es la peor forma de equivocarse.
//   · Una fila sin número de series contaba 0 en una y 1 en la otra.
//
// Aquí se decide una vez:
//
//   SIN GRUPO NO ES DESAPARECER. Va a «Sin clasificar», que además es lo que
//   escribe el atleta cuando se crea un ejercicio y no dice de qué es. Un montón
//   visible se puede arreglar; uno invisible no se sabe ni que está.
//
//   SIN SERIES CUENTA 0, NO 1. Contar una desconocida como una es inventarse un
//   dato. El grupo sigue apareciendo, así que el hueco se ve en vez de taparse.

export const SIN_CLASIFICAR = 'Sin clasificar'

export interface EjercicioSeries {
  grupo_muscular?: string | null
  series?: number | null
}

export interface GrupoSeries {
  grupo: string
  /** Las series del periodo entero. */
  series: number
  /**
   * Las de una semana media de ese periodo.
   *
   * Es el número que hay que MIRAR. El volumen de fuerza se piensa siempre por
   * semana —nadie dice «hago 40 series de glúteo», dice «hago 10 a la semana»—,
   * y el gráfico sumaba el periodo elegido sin decir cuál era: las mismas «5
   * series» eran 2,5 por semana con el botón de 2 sem y 0,6 con el de 8. La
   * barra se veía igual en los dos casos.
   */
  porSemana: number
}

/**
 * Las series de cada grupo, de más a menos.
 *
 * El nombre del grupo se usa TAL CUAL como clave: «Glúteos» y «Gluteo» son dos
 * grupos distintos porque son dos cadenas distintas. Por eso el formulario de
 * crear un ejercicio ofrece los que ya existen en vez de dejar escribir libre.
 */
export function seriesPorGrupo(
  ejercicios: EjercicioSeries[] | null | undefined,
  /* Cuántos días abarca lo que se le pasa. Por defecto una semana, que es lo
     que mira el canvas. /volumen le pasa los de su selector. */
  diasDelPeriodo = 7,
): GrupoSeries[] {
  const semanas = Math.max(1, (Number(diasDelPeriodo) || 7) / 7)
  const mapa = new Map<string, number>()
  for (const e of ejercicios || []) {
    const grupo = (e?.grupo_muscular || '').trim() || SIN_CLASIFICAR
    const n = Number(e?.series)
    mapa.set(grupo, (mapa.get(grupo) || 0) + (Number.isFinite(n) && n > 0 ? n : 0))
  }
  return [...mapa.entries()]
    .map(([grupo, series]) => ({ grupo, series, porSemana: Math.round((series / semanas) * 10) / 10 }))
    /* De más a menos, y a igualdad por nombre: sin el segundo criterio, dos
       grupos con las mismas series se colocaban según el orden en que llegaran
       de la base y el gráfico bailaba entre recargas. */
    .sort((a, b) => (b.series - a.series) || a.grupo.localeCompare(b.grupo, 'es'))
}

/** El total, para poder decir porcentajes sin volver a sumar por otro lado. */
export function totalSeries(grupos: GrupoSeries[]): number {
  return grupos.reduce((a, g) => a + g.series, 0)
}

/** El porcentaje que se lleva un grupo. 0 si no hay nada, sin dividir por cero. */
export function porcentajeDe(series: number, total: number): number {
  return total > 0 ? Math.round((series / total) * 100) : 0
}

/**
 * En qué banda cae un grupo según sus series SEMANALES.
 *
 * Los umbrales estaban escritos dos veces en /volumen: en las cuatro tarjetas
 * de la leyenda y otra vez en la lista de abajo. Y la lista clasificaba con el
 * TOTAL del periodo contra unos umbrales que son semanales, así que con «4 sem»
 * elegidas un grupo con 5 series —1,25 por semana, mantenimiento— salía
 * etiquetado como «Desarrollo» en verde.
 */
export const BANDAS = [
  { id: 'mantenimiento', label: 'Mantenimiento', rango: '< 4 / semana', hasta: 4 },
  { id: 'desarrollo', label: 'Desarrollo', rango: '4–8 / semana', hasta: 8 },
  { id: 'carga-alta', label: 'Carga alta', rango: '9–12 / semana', hasta: 12 },
  { id: 'sobrevolumen', label: 'Sobrevolumen', rango: '> 12 / semana', hasta: Infinity },
] as const

export type BandaId = typeof BANDAS[number]['id']

export function bandaDe(seriesSemanales: number): typeof BANDAS[number] {
  const n = Number(seriesSemanales) || 0
  return BANDAS.find(b => n < b.hasta) || BANDAS[BANDAS.length - 1]
}

/** «2,5» / «5». Sin decimal cuando es redondo, para no pintar «5,0». */
export function seriesTexto(n: number): string {
  return (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

/**
 * De cuánto tiempo es la media, con todas las letras.
 *
 * El rótulo tiene que llevarlo. Un «2,5 series/semana» sacado de un año dice
 * algo muy distinto de uno sacado de dos semanas, y sin el periodo delante los
 * dos se leen igual.
 */
export function periodoTexto(dias: number): string {
  const d = Number(dias) || 0
  if (d >= 360) return 'último año'
  const semanas = Math.round(d / 7)
  return semanas === 1 ? 'última semana' : 'últimas ' + semanas + ' semanas'
}
