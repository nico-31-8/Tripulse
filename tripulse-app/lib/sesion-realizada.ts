// ============================================================
// TRIPULSE — Lo que el atleta HIZO en una sesión, frente a lo planificado
// ============================================================
// Para la lista «Lo que ha hecho» de la ficha. Esa lista enseñaba lo
// PLANIFICADO —la duración del plan, el RPE que puso el entrenador y sus
// propias notas— en una sección que se llamaba «sesiones realizadas». O sea que
// lo que el atleta hizo, lo que le costó y lo que contó no se veía en ningún
// sitio de su ficha.
//
// Lo del atleta vive en dos sitios (ver lib/rpe-sesion): la sesión lleva la
// duración real y el RPE; cada tarea, lo que se apunta por bloque al cerrar
// (sensación técnica, dolor, FC media y el comentario).

export interface SesionHecha {
  id: number
  fecha_sesion: string
  disciplina?: string | null
  origen?: string | null
  duracion_minutos?: number | null
  duracion_real?: number | null
  rpe_estimado?: number | null
  rpe_reportado?: number | null
  notas_post?: string | null
}

export interface TareaHecha {
  id_sesion: number
  notas_post?: string | null
  dolor_muscular?: number | null
  sensacion_tecnica?: number | null
  fc_media?: number | null
  rpe_reportado?: number | null
}

/** Cuánto se apartó el esfuerzo de lo previsto. */
export type DesvioRpe = 'mas_duro' | 'mas_suave' | 'segun_plan' | null

export interface ResumenHecha {
  minutosPlan: number | null
  minutosReales: number | null
  rpePlan: number | null
  rpeReal: number | null
  desvio: DesvioRpe
  dolor: number | null
  sensacion: number | null
  fcMedia: number | null
  comentario: string | null
  porSuCuenta: boolean
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/* Dos puntos de RPE es la diferencia que se nota y se puede comentar con el
   atleta; uno es el ruido normal de puntuar con una escala de diez. */
export const UMBRAL_DESVIO_RPE = 2

export function desvioRpe(plan: number | null, real: number | null): DesvioRpe {
  if (plan == null || real == null) return null
  if (real - plan >= UMBRAL_DESVIO_RPE) return 'mas_duro'
  if (plan - real >= UMBRAL_DESVIO_RPE) return 'mas_suave'
  return 'segun_plan'
}

/**
 * Una sesión hecha, resumida: lo planificado y lo real lado a lado.
 *
 * De las tareas: el dolor, el peor (es el que hay que mirar); la sensación y
 * la FC, la media de los bloques que la tienen; el comentario, el primero que
 * haya (en una sesión normal es el mismo en todos los bloques).
 */
export function resumirHecha(s: SesionHecha, tareas: TareaHecha[] = []): ResumenHecha {
  const suyas = tareas.filter(t => t.id_sesion === s.id)
  const media = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null)
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
  }
  const dolores = suyas.map(t => num(t.dolor_muscular)).filter((x): x is number => x != null)
  const comentario = (s.notas_post || '').trim()
    || suyas.map(t => (t.notas_post || '').trim()).find(Boolean) || null

  // El RPE real: el de la sesión y, si falta, el de sus bloques.
  const rpeReal = num(s.rpe_reportado) ?? media(suyas.map(t => num(t.rpe_reportado)))
  const rpePlan = num(s.rpe_estimado)

  return {
    minutosPlan: num(s.duracion_minutos),
    minutosReales: num(s.duracion_real),
    rpePlan,
    rpeReal,
    desvio: desvioRpe(rpePlan, rpeReal),
    dolor: dolores.length ? Math.max(...dolores) : null,
    sensacion: media(suyas.map(t => num(t.sensacion_tecnica))),
    fcMedia: (() => { const f = media(suyas.map(t => num(t.fc_media))); return f == null ? null : Math.round(f) })(),
    comentario,
    porSuCuenta: s.origen === 'deportista',
  }
}
