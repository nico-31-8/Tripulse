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
  series: number
}

/**
 * Las series de cada grupo, de más a menos.
 *
 * El nombre del grupo se usa TAL CUAL como clave: «Glúteos» y «Gluteo» son dos
 * grupos distintos porque son dos cadenas distintas. Por eso el formulario de
 * crear un ejercicio ofrece los que ya existen en vez de dejar escribir libre.
 */
export function seriesPorGrupo(ejercicios: EjercicioSeries[] | null | undefined): GrupoSeries[] {
  const mapa = new Map<string, number>()
  for (const e of ejercicios || []) {
    const grupo = (e?.grupo_muscular || '').trim() || SIN_CLASIFICAR
    const n = Number(e?.series)
    mapa.set(grupo, (mapa.get(grupo) || 0) + (Number.isFinite(n) && n > 0 ? n : 0))
  }
  return [...mapa.entries()]
    .map(([grupo, series]) => ({ grupo, series }))
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
