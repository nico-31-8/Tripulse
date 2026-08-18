// ============================================================
// TRIPULSE — La importancia de una competición
// ============================================================
// No todas las carreras de una temporada valen lo mismo, y la diferencia no es
// de adorno: cambia el tapering, y con él las dos o tres semanas anteriores.
// Hasta ahora la app las trataba todas igual, así que un rodaje de domingo en
// un 10k popular pesaba lo mismo que el Ironman del año.
//
// FUENTE: B1-02 §Paso 1 (Clasifica tus carreras).

export type Prioridad = 'A' | 'B' | 'C'

export interface DefPrioridad {
  id: Prioridad
  etiqueta: string
  /** Qué es, en una frase, para el desplegable. */
  que: string
  /** Cuántos días de tapering pide. 0 = ninguno. */
  diasTaper: number
  /** El texto de la fuente sobre su tapering. */
  taperTexto: string
  /** Cuántas caben en una temporada, según B1-02. */
  alAno: string
  /** Emoji del calendario. */
  simbolo: string
  /** Color del chip y del borde del día. */
  hex: string
}

export const PRIORIDADES: DefPrioridad[] = [
  {
    id: 'A', etiqueta: 'Principal', simbolo: '🏆', hex: '#EAB308',
    que: 'El objetivo. Máximo rendimiento, con tapering completo.',
    diasTaper: 16, taperTexto: '10–21 días de tapering', alAno: '1–3 al año',
  },
  {
    id: 'B', etiqueta: 'Secundaria', simbolo: '🥈', hex: '#60A5FA',
    que: 'Quieres rendir, pero no se afina del todo por ella.',
    diasTaper: 6, taperTexto: '5–7 días de reducción', alAno: '2–4 al año',
  },
  {
    id: 'C', etiqueta: 'De entrenamiento', simbolo: '🎽', hex: '#9CA3AF',
    que: 'Se corre como un entrenamiento más. La carga no se toca.',
    diasTaper: 0, taperTexto: 'sin cambio de carga', alAno: 'las que quieras',
  },
]

/**
 * La prioridad de una competición, con su valor por defecto.
 *
 * Las que ya existían no tienen ninguna, y **B es el defecto correcto**: con A
 * cada carrera del año dispararía un tapering completo y el plan se llenaría de
 * semanas suaves; con C, ninguna lo haría y el atleta llegaría fundido a su
 * objetivo. La intermedia es la única que se equivoca poco en las dos
 * direcciones.
 */
export function prioridadDe(c: { prioridad?: string | null } | null | undefined): Prioridad {
  const p = String(c?.prioridad || '').toUpperCase()
  return p === 'A' || p === 'C' ? p : 'B'
}

export const defDe = (p: Prioridad): DefPrioridad =>
  PRIORIDADES.find(x => x.id === p) || PRIORIDADES[1]

/**
 * Días de tapering de una competición concreta.
 *
 * La prioridad manda sobre la distancia: un Ironman de entrenamiento —que los
 * hay— no se afina, y un sprint que es EL objetivo del año sí. Para las de
 * prioridad A se usa la duración por distancia, que es más fina que el rango
 * genérico de B1-02.
 */
export function diasTaperDe(p: Prioridad, diasPorDistancia?: number): number {
  const d = defDe(p)
  if (d.id !== 'A') return d.diasTaper
  return diasPorDistancia ?? d.diasTaper
}

/**
 * El aviso de B1-02 sobre acumular objetivos.
 *
 * «Con más de 3 A-races anuales es prácticamente imposible llegar a todas en
 * forma óptima.» No lo impide —el entrenador sabrá— pero lo dice.
 */
export function avisoDeObjetivos(comps: { prioridad?: string | null }[]): string | null {
  const n = comps.filter(c => prioridadDe(c) === 'A').length
  if (n <= 3) return null
  return n + ' competiciones principales. Con más de tres es prácticamente imposible llegar a todas en forma óptima: piensa cuáles son de verdad el objetivo.'
}
