// Carga en lote de la duración estimada de varias sesiones.
// Reúne tareas + parámetros (distancia/duración/ejercicios) de todas las
// sesiones de una vez y calcula la estimación de cada una con el helper puro.

import { calcularDuracionEstimada, type TestsDeportista, type ResultadoDuracion } from './duracion'

export async function estimarDuraciones(
  supabase: any,
  sesionIds: number[],
  tests: TestsDeportista,
): Promise<Record<number, ResultadoDuracion>> {
  const out: Record<number, ResultadoDuracion> = {}
  if (!sesionIds.length) return out

  const { data: tareas } = await supabase
    .from('tarea')
    .select('id, id_sesion, series, disciplina, zona_entrenamiento, descanso_segundos')
    .in('id_sesion', sesionIds)
  const tareaIds = (tareas || []).map((t: any) => t.id)

  const { data: dists } = tareaIds.length
    ? await supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds)
    : { data: [] }
  const { data: durs } = tareaIds.length
    ? await supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds)
    : { data: [] }
  const { data: ejs } = tareaIds.length
    ? await supabase.from('ejercicios').select('id_tarea, repeticiones').in('id_tarea', tareaIds)
    : { data: [] }

  for (const sid of sesionIds) {
    const tarSes = (tareas || []).filter((t: any) => t.id_sesion === sid)
    const tareasDur = tarSes.map((t: any) => ({
      disciplina: t.disciplina,
      series: t.series,
      descanso_segundos: t.descanso_segundos,
      zona_entrenamiento: t.zona_entrenamiento,
      p_distancia: (dists || []).filter((d: any) => d.id_tarea === t.id),
      p_duracion: (durs || []).filter((d: any) => d.id_tarea === t.id),
      ejercicios: (ejs || []).filter((e: any) => e.id_tarea === t.id),
    }))
    out[sid] = calcularDuracionEstimada(tareasDur, tests)
  }
  return out
}

// Minutos efectivos de una sesión: manual si existe, si no la estimación.
// Devuelve null si no hay ni manual ni estimación.
export function minutosEfectivos(
  duracionManual: number | null | undefined,
  est: ResultadoDuracion | undefined,
): number | null {
  if (duracionManual) return duracionManual
  if (est?.estimable && est.minutos > 0) return est.minutos
  return null
}

// Texto para mostrar: '50 min' (manual), '~45 min' (estimada) o '—'.
export function duracionSesionTexto(
  duracionManual: number | null | undefined,
  est: ResultadoDuracion | undefined,
): string {
  if (duracionManual) return duracionManual + ' min'
  if (est?.estimable && est.minutos > 0) return '~' + est.minutos + ' min'
  return '—'
}
