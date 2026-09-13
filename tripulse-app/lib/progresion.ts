// ============================================================
// TRIPULSE — Progresión de la carga, en lo que se puede decidir
// ============================================================
// El Máster de Resistencia (L4.3) propone sustituir el ACWR en las decisiones
// por cosas concretas. Esta es una de ellas:
//
//   SESIÓN MÁS LARGA ≤ 110 % de la más larga de los últimos 30 días.
//
// Un salto en la sesión larga es de lo que más se relaciona con lesionarse, y a
// diferencia del ACWR no tiene truco matemático: es una sesión y un número.

/** Cuánto puede crecer la sesión más larga respecto a la del mes anterior. */
export const TOPE_SESION_LARGA = 1.1

export interface SesionConMinutos { fecha_sesion: string; minutos: number | null | undefined }

export interface SesionLarga {
  /** La más larga de la última semana (7 días hasta `hoy`, incluido). */
  ultimaSemana: number
  /** La más larga de los 30 días anteriores a esa semana. */
  mesAnterior: number
  /** ultimaSemana ÷ mesAnterior. */
  ratio: number
  excede: boolean
}

const dias = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)

/**
 * La sesión más larga de la última semana frente a la del mes anterior.
 *
 * `null` si no se puede decir: sin sesiones esta semana (no hay salto que
 * mirar) o sin ninguna en el mes anterior (no hay con qué comparar; un atleta
 * que empieza no «se pasa» de nada).
 */
export function sesionLarga(sesiones: SesionConMinutos[], hoy: string): SesionLarga | null {
  let ultima = 0, previa = 0
  for (const s of sesiones) {
    const m = typeof s.minutos === 'number' && Number.isFinite(s.minutos) ? s.minutos : 0
    if (m <= 0 || !s.fecha_sesion) continue
    const d = dias(s.fecha_sesion.slice(0, 10), hoy)
    if (d >= 0 && d < 7) ultima = Math.max(ultima, m)
    else if (d >= 7 && d < 37) previa = Math.max(previa, m)
  }
  if (!ultima || !previa) return null
  const ratio = Math.round((ultima / previa) * 100) / 100
  return { ultimaSemana: ultima, mesAnterior: previa, ratio, excede: ultima > previa * TOPE_SESION_LARGA }
}
