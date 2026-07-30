// Presentación del score de wellness.
//
// OJO con la semántica: en la base de datos, `wellness.score_wellness` es un score de
// MALESTAR (se calcula sumando fatiga + estrés + dolor + mala calidad de sueño + ánimo y
// motivación invertidos), así que ALTO = PEOR (0 = perfecto, 100 = crítico).
//
// Eso se lee al revés de lo que espera cualquiera, sobre todo junto a una pastilla verde
// de readiness. Por eso en TODA la interfaz se muestra invertido como «Bienestar»
// (alto = mejor). El dato guardado no cambia: solo se invierte al pintar.

/** Malestar guardado (0-100, alto = peor) → Bienestar mostrado (0-100, alto = mejor). */
export function bienestar(scoreGuardado: number | null | undefined): number | null {
  if (scoreGuardado == null || isNaN(Number(scoreGuardado))) return null
  return 100 - Number(scoreGuardado)
}

/** Color del bienestar mostrado. Equivale a los cortes clásicos 25/50/75 del malestar. */
export function colorBienestar(b: number): string {
  if (b >= 75) return '#22c55e' // Óptimo
  if (b >= 50) return '#eab308' // Aceptable
  if (b >= 25) return '#f97316' // Deteriorado
  return '#ef4444'              // Crítico
}

/** Etiqueta del bienestar mostrado. */
export function estadoBienestar(b: number): string {
  if (b >= 75) return 'Óptimo'
  if (b >= 50) return 'Aceptable'
  if (b >= 25) return 'Deteriorado'
  return 'Crítico'
}
