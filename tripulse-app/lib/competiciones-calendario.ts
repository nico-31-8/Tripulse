// ============================================================
// Las competiciones, en el calendario del deportista
// ============================================================
//
// El atleta no las veía. Estaban en la base desde que el entrenador las metía,
// se usaban para el tapering y para el plan, y salían en el panel del
// entrenador y en el canvas — pero en /mis-sesiones, que es donde el atleta
// mira qué le toca, no aparecían por ningún lado. La carrera para la que lleva
// cuatro meses entrenando no estaba en su calendario.
//
// LO QUE HAY QUE VIGILAR AQUÍ ES LA FECHA
// `competicion.fecha` unas veces llega como '2026-09-13' y otras con hora
// detrás. Comparar la cadena entera contra un día del calendario no encuentra
// nunca nada, y el fallo es silencioso: no peta, simplemente no sale la
// competición. Por eso todo pasa por `soloDia()` antes de comparar, y el índice
// se construye una vez en vez de filtrar el array en cada casilla del mes.

import { soloDia, diasEntre, fechaValida } from './fechas'

export interface CompeticionCal {
  id?: number
  nombre?: string | null
  fecha?: string | null
  tipo?: string | null
  prioridad?: string | null
  notas?: string | null
}

/**
 * Las competiciones agrupadas por día.
 *
 * Un mes son 42 casillas y una temporada puede tener veinte carreras: filtrar
 * el array en cada casilla es recorrerlo 42 veces por render. Con el índice se
 * recorre una.
 */
export function porDia(comps: CompeticionCal[] | null | undefined): Record<string, CompeticionCal[]> {
  const mapa: Record<string, CompeticionCal[]> = {}
  for (const c of comps || []) {
    const dia = soloDia(c.fecha)
    if (!fechaValida(dia)) continue
    ;(mapa[dia] ||= []).push(c)
  }
  return mapa
}

/** Días que faltan. Negativo si ya pasó, 0 si es hoy. */
export function diasHasta(fecha: string | null | undefined, hoy: string): number | null {
  const dia = soloDia(fecha)
  if (!fechaValida(dia) || !fechaValida(hoy)) return null
  return diasEntre(hoy, dia)
}

/**
 * La cuenta atrás en palabras.
 *
 * «Faltan 3 días» le dice al atleta algo que «13 de septiembre» no: si la
 * carrera es este fin de semana o dentro de tres meses.
 */
export function cuentaAtras(dias: number | null): string {
  if (dias === null) return ''
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  if (dias === -1) return 'Ayer'
  if (dias > 1) return 'Faltan ' + dias + ' días'
  return 'Hace ' + Math.abs(dias) + ' días'
}

/** La siguiente que viene, contando la de hoy. `null` si no queda ninguna. */
export function proxima(comps: CompeticionCal[] | null | undefined, hoy: string): CompeticionCal | null {
  const futuras = (comps || [])
    .filter(c => {
      const d = diasHasta(c.fecha, hoy)
      return d !== null && d >= 0
    })
    .sort((a, b) => soloDia(a.fecha) < soloDia(b.fecha) ? -1 : 1)
  return futuras[0] || null
}
