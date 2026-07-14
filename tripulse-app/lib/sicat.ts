// ============================================================
// TRIPULSE — Motor SICAT (Sistema de Individualización de la Carga en Triatlón)
// Única fuente de verdad para F1-F4 + corrector HRV. La usan /eco, /carga y /volumen
// (estas dos últimas para ponderar UA por disciplina cuando el entrenador activa el
// toggle "SICAT").
// ============================================================
import { supabase } from './supabase'

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

function vacio(): FactorSicatDisc {
  return { sesiones: 0, f1: null, f2: null, f3: null, f4: null, total: null, corrector: 1, porcentaje: null }
}

export async function getMicrosDeportista(depId: number): Promise<number[]> {
  const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', depId)
  const macroIds = (macros || []).map((m: any) => m.id)
  if (!macroIds.length) return []
  const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
  const mesoIds = (mesos || []).map((m: any) => m.id)
  if (!mesoIds.length) return []
  const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
  return (micros || []).map((m: any) => m.id)
}

// F1 — Dificultad técnica. Promedia la sensación técnica del atleta (media de todas
// sus sesiones) con la valoración técnica que el entrenador da en el PERFIL del
// deportista (dep.tec_natacion/ciclismo/carrera) — no por sesión: el entrenador no
// está presente en cada sesión, así que es una valoración general de esa disciplina.
function calcularF1(filas: any[], valoracionGlobal: number | null): number | null {
  const validas = filas.filter(f => f.sensacion_tecnica)
  const sensacionMedia = validas.length
    ? validas.reduce((acc, f) => acc + f.sensacion_tecnica, 0) / validas.length
    : null

  let media: number | null = null
  if (sensacionMedia !== null && valoracionGlobal !== null) media = (sensacionMedia + valoracionGlobal) / 2
  else if (sensacionMedia !== null) media = sensacionMedia
  else if (valoracionGlobal !== null) media = valoracionGlobal

  if (media === null) return null
  return Math.min(4, Math.max(1, Math.round(5 - media)))
}

function calcularF2(filas: any[]): number | null {
  const validas = filas.filter(f => f.dolor_muscular)
  if (!validas.length) return null
  const scores = validas.map(f => {
    const d0 = f.dolor_muscular || 0
    const d24 = f.dolor_24h || f.dolor_muscular || 0
    const d48 = f.dolor_48h || f.dolor_muscular || 0
    return d0 * 0.2 + d24 * 0.4 + d48 * 0.4
  })
  const media = scores.reduce((acc, s) => acc + s, 0) / scores.length
  return Math.min(4, Math.max(1, Math.round(media * 0.8)))
}

function calcularF3(filas: any[]): number {
  const duras = filas.filter(f => f.rpe_reportado > 7)
  if (!duras.length) return 1
  const degradadas = duras.filter(f => f.sensacion_tecnica < 3)
  const degradacion = degradadas.length / duras.length
  return Math.min(4, Math.max(1, 1 + Math.round(degradacion * 3)))
}

function calcularF4(filas: any[], fcUmbral: number): number | null {
  const validas = filas.filter(f => f.fc_media && f.rpe_reportado && fcUmbral > 0)
  if (!validas.length) return null
  const fcRel = validas.reduce((acc, f) => acc + f.fc_media / fcUmbral, 0) / validas.length
  const mediaRpe = validas.reduce((acc, f) => acc + f.rpe_reportado, 0) / validas.length
  return Math.min(4, Math.max(1, Math.round((fcRel * 2) + (mediaRpe / 10 * 2))))
}

// Corrector HRV — usa la HRV diaria real del atleta (tabla wellness, misma fecha de la
// sesión), con la entrada manual de tarea.hrv_del_dia como respaldo si no hay wellness.
function calcularCorrectorHRV(filas: any[], hrvBasal: number): number {
  const validas = filas.filter(f => (f.hrv_dia || f.hrv_del_dia) && hrvBasal > 0)
  if (!validas.length) return 1
  const hrvMedia = validas.reduce((acc, f) => acc + (f.hrv_dia || f.hrv_del_dia), 0) / validas.length
  const ratio = hrvMedia / hrvBasal
  return 1 + (1 - ratio) * 0.3
}

// Calcula el perfil SICAT (F1-F4 + % relativo) de un deportista para las 3 disciplinas
// de resistencia. Fuerza queda fuera del modelo (no tiene tabla de referencia ECO).
export async function calcularSICAT(dep: any): Promise<SicatResultado> {
  const fcUmbral = dep.fc_maxima || 0
  const hrvBasal = dep.hrv_basal || 0
  const resultados = {} as SicatResultado

  const microsIds = await getMicrosDeportista(dep.id)
  if (!microsIds.length) {
    DISCIPLINAS_SICAT.forEach(d => { resultados[d] = vacio() })
    return resultados
  }

  const { data: todasSesiones } = await supabase
    .from('sesion')
    .select('id, disciplina, rpe_estimado, rpe_reportado, fecha_sesion')
    .eq('estado', 'Realizada')
    .in('id_microciclo', microsIds)

  const sesiones = todasSesiones || []
  if (!sesiones.length) {
    DISCIPLINAS_SICAT.forEach(d => { resultados[d] = vacio() })
    return resultados
  }

  // Una sola consulta de wellness para todo el rango de fechas necesario
  // (sesión + hasta 2 días después, para DOMS 24h/48h y HRV del mismo día).
  const fechasOrdenadas = sesiones.map(s => s.fecha_sesion).filter(Boolean).sort()
  const desde = fechasOrdenadas[0]
  const hastaD = new Date(fechasOrdenadas[fechasOrdenadas.length - 1] + 'T12:00:00')
  hastaD.setDate(hastaD.getDate() + 2)
  const hasta = hastaD.toISOString().split('T')[0]

  const { data: wellnessRows } = await supabase
    .from('wellness')
    .select('fecha, dolor_muscular, hrv')
    .eq('id_deportista', dep.id)
    .gte('fecha', desde)
    .lte('fecha', hasta)
  const wellnessPorFecha: Record<string, { dolor_muscular?: number; hrv?: number }> = {}
  ;(wellnessRows || []).forEach((w: any) => { wellnessPorFecha[w.fecha] = w })

  const sesionIdAFecha: Record<number, string> = {}
  sesiones.forEach(s => { sesionIdAFecha[s.id] = s.fecha_sesion })

  const sesionIds = sesiones.map(s => s.id)
  const { data: tareas } = await supabase
    .from('tarea')
    .select('rpe_reportado, fc_media, sensacion_tecnica, dolor_muscular, hrv_del_dia, id_sesion')
    .in('id_sesion', sesionIds)

  // Cada SESIÓN realizada cuenta una vez (los valores post-sesión se guardan iguales
  // en todas sus tareas) — evita que sesiones con más tareas pesen de más en la media.
  const porSesion = new Map<number, any>()
  ;(tareas || []).forEach((t: any) => { if (!porSesion.has(t.id_sesion)) porSesion.set(t.id_sesion, t) })

  const filas = Array.from(porSesion.entries()).map(([idSesion, t]) => {
    const fecha = sesionIdAFecha[idSesion]
    if (!fecha) return { ...t, id_sesion: idSesion }
    const f = new Date(fecha + 'T12:00:00')
    const f24 = new Date(f); f24.setDate(f.getDate() + 1)
    const f48 = new Date(f); f48.setDate(f.getDate() + 2)
    const k = (d: Date) => d.toISOString().split('T')[0]
    return {
      ...t,
      id_sesion: idSesion,
      dolor_24h: wellnessPorFecha[k(f24)]?.dolor_muscular ?? null,
      dolor_48h: wellnessPorFecha[k(f48)]?.dolor_muscular ?? null,
      hrv_dia: wellnessPorFecha[k(f)]?.hrv ?? null,
    }
  })

  for (const disc of DISCIPLINAS_SICAT) {
    const idsDisc = new Set(sesiones.filter(s => s.disciplina === disc).map(s => s.id))
    const filasDisc = filas.filter(f => idsDisc.has(f.id_sesion))
    if (!filasDisc.length) { resultados[disc] = vacio(); continue }

    const valoracionGlobal = disc === 'Natacion' ? dep.tec_natacion
      : disc === 'Ciclismo' ? dep.tec_ciclismo
      : dep.tec_carrera

    const f1 = calcularF1(filasDisc, valoracionGlobal ?? null)
    const f2 = calcularF2(filasDisc)
    const f3 = calcularF3(filasDisc)
    const f4 = calcularF4(filasDisc, fcUmbral)
    const corrector = calcularCorrectorHRV(filasDisc, hrvBasal)

    const validos = [f1, f2, f3, f4].filter((f): f is number => f !== null)
    const total = validos.length === 4 ? Math.round((f1! + f2! + f3! + f4!) * corrector * 10) / 10 : null

    resultados[disc] = { sesiones: filasDisc.length, f1, f2, f3, f4, total, corrector, porcentaje: null }
  }

  const totales = DISCIPLINAS_SICAT.map(d => resultados[d].total).filter((t): t is number => t !== null)
  const maxTotal = totales.length ? Math.max(...totales) : 16
  DISCIPLINAS_SICAT.forEach(d => {
    if (resultados[d].total !== null) resultados[d].porcentaje = Math.round((resultados[d].total as number) / maxTotal * 100)
  })

  return resultados
}

// Factor de ponderación 0-1 para aplicar el SICAT a la carga (UA) de una disciplina.
// 1 = disciplina más costosa para ese atleta (o sin datos suficientes → neutro).
// Fuerza y cualquier disciplina fuera del modelo SICAT siempre devuelven 1 (neutro).
export function factorSicat(disciplina: string, resultado: SicatResultado | null): number {
  if (!resultado) return 1
  const r = (resultado as Record<string, FactorSicatDisc>)[disciplina]
  if (!r || r.porcentaje == null) return 1
  return r.porcentaje / 100
}
