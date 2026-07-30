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

// ------------------------------------------------------------
// Minutos de una sesión PARA CALCULAR CARGA
// ------------------------------------------------------------
// Única fuente de verdad de "cuánto duró esto" en los motores de carga y volumen.
// Existe porque cada módulo leía `sesion.duracion_minutos` a pelo, y eso tiene dos
// agujeros silenciosos:
//   · una sesión sin duración manual valía 0 UA → no sumaba a CTL/ATL/TSB/ACWR
//     aunque tuviera 3,6 km de natación planificados;
//   · `duracion_real` (lo que el atleta cronometró) no lo miraba nadie.
//
// Prioridad: lo que PASÓ > lo que se planificó a mano > lo que estimamos.
// La estimación es opcional: los módulos que no cargan tareas simplemente no la
// pasan y se quedan con las dos primeras.
export function minutosCarga(
  sesion: { duracion_real?: number | null; duracion_minutos?: number | null } | null | undefined,
  est?: ResultadoDuracion,
): number {
  if (!sesion) return 0
  if (sesion.duracion_real && sesion.duracion_real > 0) return sesion.duracion_real
  if (sesion.duracion_minutos && sesion.duracion_minutos > 0) return sesion.duracion_minutos
  if (est?.estimable && est.minutos > 0) return est.minutos
  return 0
}

// De dónde salieron esos minutos, para poder decírselo al entrenador en vez de
// enseñar un número sin procedencia.
export function origenMinutos(
  sesion: { duracion_real?: number | null; duracion_minutos?: number | null } | null | undefined,
  est?: ResultadoDuracion,
): 'real' | 'manual' | 'estimada' | null {
  if (!sesion) return null
  if (sesion.duracion_real && sesion.duracion_real > 0) return 'real'
  if (sesion.duracion_minutos && sesion.duracion_minutos > 0) return 'manual'
  if (est?.estimable && est.minutos > 0) return 'estimada'
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
