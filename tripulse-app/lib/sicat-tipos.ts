// Tipos y constantes del SICAT, SIN tocar Supabase.
//
// Viven aparte porque `lib/sicat.ts` monta el cliente al cargarse, y eso revienta
// en los tests (no hay ni URL ni clave). Así los módulos que solo necesitan saber
// cuáles son las disciplinas o qué forma tiene un resultado pueden importarlos y
// seguir siendo comprobables. `sicat.ts` los reexporta, así que nada de lo que ya
// importaba de allí cambia.

export const DISCIPLINAS_SICAT = ['Natacion', 'Ciclismo', 'Carrera'] as const
export type DisciplinaSicat = typeof DISCIPLINAS_SICAT[number]

export interface FactorSicatDisc {
  sesiones: number
  f1: number | null
  f2: number | null
  f3: number | null
  f4: number | null
  total: number | null
  corrector: number
  porcentaje: number | null
}

export type SicatResultado = Record<DisciplinaSicat, FactorSicatDisc>

export interface Periodo { desde?: string; hasta?: string; etiqueta?: string }
