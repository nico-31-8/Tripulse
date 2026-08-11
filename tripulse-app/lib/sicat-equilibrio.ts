// ============================================================
// SICAT — ¿están equilibrados los tres deportes, y se van acercando?
//
// El SICAT dice lo que le cuesta cada disciplina, pero mete toda la historia en el
// mismo saco y hay que comparar las tres tarjetas a ojo. Esto añade las dos cosas
// que faltaban: partir por tramos y medir la distancia entre deportes.
// ============================================================
import { DISCIPLINAS_SICAT, type SicatResultado, type Periodo } from './sicat-tipos'

export const SUELO_SICAT = 4    // los 4 factores valen 1 como mínimo
export const TOPE_SICAT = 16    // y 4 como máximo

export type Granularidad = 'semana' | 'quincena' | 'mes' | 'bimestre' | 'trimestre'

export const GRANULARIDADES: { id: Granularidad; label: string; dias: number }[] = [
  { id: 'semana', label: 'Semanas', dias: 7 },
  { id: 'quincena', label: 'Quincenas', dias: 14 },
  { id: 'mes', label: 'Meses', dias: 30 },
  { id: 'bimestre', label: 'Bimestres', dias: 60 },
  { id: 'trimestre', label: 'Trimestres', dias: 90 },
]

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Los últimos `cuantos` tramos hasta hoy, del más antiguo al más reciente.
 *
 * Se cuenta hacia atrás desde hoy en vez de cuadrar con meses naturales: así el
 * último tramo siempre llega hasta hoy y no queda uno a medias que parece una caída
 * de carga cuando en realidad es que el mes acaba de empezar.
 */
export function tramos(g: Granularidad, cuantos = 4, hoy = new Date()): Periodo[] {
  const dias = GRANULARIDADES.find(x => x.id === g)?.dias || 30
  const out: Periodo[] = []
  for (let i = cuantos - 1; i >= 0; i--) {
    const hasta = new Date(hoy); hasta.setDate(hasta.getDate() - i * dias)
    const desde = new Date(hasta); desde.setDate(desde.getDate() - dias + 1)
    out.push({
      desde: iso(desde),
      hasta: iso(hasta),
      etiqueta: etiquetaTramo(desde, hasta, g),
    })
  }
  return out
}

function etiquetaTramo(desde: Date, hasta: Date, g: Granularidad): string {
  const dd = (d: Date) => String(d.getDate()).padStart(2, '0')
  const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, '0')
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  if (g === 'semana' || g === 'quincena') return `${dd(desde)}/${mm(desde)}–${dd(hasta)}/${mm(hasta)}`
  if (desde.getMonth() === hasta.getMonth()) return `${MES[hasta.getMonth()]}`
  return `${MES[desde.getMonth()]}–${MES[hasta.getMonth()]}`
}

export interface PuntoTramo {
  etiqueta: string
  puntos: Record<string, number | null>   // por disciplina
  sesiones: Record<string, number>
  diferencia: number | null               // entre el que más cuesta y el que menos
}

/**
 * La distancia entre el deporte que más cuesta y el que menos, EN PUNTOS.
 *
 * No en porcentaje, y esto importa: cada factor del SICAT va de 1 a 4, así que el
 * total va de 4 a 16 y el 4 NO es «coste cero» — es el mínimo de los cuatro
 * factores. Sin un cero de verdad, dividir un total entre otro no significa nada:
 * 8,9÷10,2 da 87 %, pero descontando el suelo da 79 %. Dos números y los dos
 * arbitrarios. Una diferencia sí se puede afirmar en una escala así.
 */
export function diferencia(puntos: (number | null)[]): number | null {
  const v = puntos.filter((x): x is number => x != null)
  if (v.length < 2) return null
  return Math.round((Math.max(...v) - Math.min(...v)) * 10) / 10
}

export function aPunto(etiqueta: string, res: SicatResultado): PuntoTramo {
  const puntos: Record<string, number | null> = {}
  const sesiones: Record<string, number> = {}
  for (const d of DISCIPLINAS_SICAT) {
    puntos[d] = res[d]?.total ?? null
    sesiones[d] = res[d]?.sesiones ?? 0
  }
  return { etiqueta, puntos, sesiones, diferencia: diferencia(DISCIPLINAS_SICAT.map(d => puntos[d])) }
}

/** Cuánto se ha estrechado (o abierto) la distancia entre el primer tramo y el último. */
export function tendencia(serie: PuntoTramo[]): { cambio: number | null; texto: string } {
  const con = serie.filter(p => p.diferencia != null)
  if (con.length < 2) return { cambio: null, texto: 'Hacen falta al menos dos tramos con datos.' }
  const a = con[0].diferencia!, b = con[con.length - 1].diferencia!
  const cambio = Math.round((a - b) * 10) / 10
  if (Math.abs(cambio) < 0.15) return { cambio, texto: 'La diferencia entre deportes sigue igual.' }
  return cambio > 0
    ? { cambio, texto: `Se han juntado ${fmt(cambio)} puntos desde el primer tramo.` }
    : { cambio, texto: `Se han separado ${fmt(-cambio)} puntos. Mira si es que uno ha mejorado mucho, no que otro haya empeorado.` }
}

export const fmt = (n: number) => n.toFixed(1).replace('.', ',')

/** Media de los tres, para pintar la línea de objetivo en los depósitos. */
export function mediaPuntos(p: PuntoTramo): number | null {
  const v = DISCIPLINAS_SICAT.map(d => p.puntos[d]).filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
