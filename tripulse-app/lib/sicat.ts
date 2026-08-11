// ============================================================
// TRIPULSE — Motor SICAT (Sistema de Individualización de la Carga en Triatlón)
// Única fuente de verdad para F1-F4 + corrector HRV. La usan /eco, /carga y /volumen
// (estas dos últimas para ponderar UA por disciplina cuando el entrenador activa el
// toggle "SICAT").
// ============================================================
import { supabase } from './supabase'
// Los tipos y la lista de disciplinas viven en sicat-tipos (sin Supabase, para poder
// importarlos desde modulos que se testean). Se reexportan para no romper nada.
import { DISCIPLINAS_SICAT, type DisciplinaSicat, type FactorSicatDisc, type SicatResultado, type Periodo } from './sicat-tipos'
export { DISCIPLINAS_SICAT }
export type { DisciplinaSicat, FactorSicatDisc, SicatResultado, Periodo }

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
export function calcularF1(filas: any[], valoracionGlobal: number | null): number | null {
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

export function calcularF2(filas: any[]): number | null {
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

export function calcularF3(filas: any[]): number {
  const duras = filas.filter(f => f.rpe_reportado > 7)
  if (!duras.length) return 1
  // Solo puntúan las duras con sensación técnica REPORTADA. El campo es nullable en
  // Supabase y en JS `null < 3` es true (null → 0), así que antes una sesión dura sin
  // ese dato se contaba como técnica degradada y disparaba F3 al máximo en silencio.
  const conDato = duras.filter(f => f.sensacion_tecnica != null)
  if (!conDato.length) return 1
  const degradadas = conDato.filter(f => f.sensacion_tecnica < 3)
  const degradacion = degradadas.length / conDato.length
  return Math.min(4, Math.max(1, 1 + Math.round(degradacion * 3)))
}

export function calcularF4(filas: any[], fcUmbral: number): number | null {
  const validas = filas.filter(f => f.fc_media && f.rpe_reportado && fcUmbral > 0)
  if (!validas.length) return null
  const fcRel = validas.reduce((acc, f) => acc + f.fc_media / fcUmbral, 0) / validas.length
  const mediaRpe = validas.reduce((acc, f) => acc + f.rpe_reportado, 0) / validas.length
  return Math.min(4, Math.max(1, Math.round((fcRel * 2) + (mediaRpe / 10 * 2))))
}

// Corrector HRV — usa la HRV diaria real del atleta (tabla wellness, misma fecha de la
// sesión), con la entrada manual de tarea.hrv_del_dia como respaldo si no hay wellness.
export function calcularCorrectorHRV(filas: any[], hrvBasal: number): number {
  const validas = filas.filter(f => (f.hrv_dia || f.hrv_del_dia) && hrvBasal > 0)
  if (!validas.length) return 1
  const hrvMedia = validas.reduce((acc, f) => acc + (f.hrv_dia || f.hrv_del_dia), 0) / validas.length
  const ratio = hrvMedia / hrvBasal
  // Acotado, como F1-F4. Sin tope, una HRV muy por encima de la basal —una basal
  // mal medida, un valor suelto raro del reloj— podía hundir el corrector por
  // debajo de 0,5 y abaratar una disciplina entera de forma artificial.
  // El rango cubre la variación diaria real: por debajo de la basal encarece hasta
  // un 30%, por encima abarata hasta un 15%. Fuera de ahí es ruido, no fisiología.
  return Math.min(1.3, Math.max(0.85, 1 + (1 - ratio) * 0.3))
}

// Calcula el perfil SICAT (F1-F4 + % relativo) de un deportista para las 3 disciplinas
// de resistencia. Fuerza queda fuera del modelo (no tiene tabla de referencia ECO).
export async function calcularSICAT(dep: any, periodo?: Periodo): Promise<SicatResultado> {
  // FC umbral estimada como el 85% de la máxima, igual que el resto de la app
  // (/indices, tareas-tabla, panel-metricas, calendario y bloques). Antes aquí se
  // usaba la FC máxima a secas aunque la variable ya se llamaba fcUmbral, así que F4
  // infravaloraba el coste cardiovascular ~15% solo en el SICAT.
  const fcUmbral = dep.fc_maxima ? dep.fc_maxima * 0.85 : 0
  const hrvBasal = dep.hrv_basal || 0
  const resultados = {} as SicatResultado

  // Las sesiones LIBRES (sin microciclo) cuentan igual que las planificadas.
  //
  // Antes solo se miraban las que colgaban de un microciclo, y encima se salía de
  // vacío si el atleta no tenía plan montado. O sea que NO contaban: las que se
  // añade él por su cuenta, las que el entrenador pega con plantilla en una semana
  // sin planificar, y las que le llegan de un grupo. Se entrenaron y costaron lo
  // mismo; el SICAT calculaba el coste de media vida.
  //
  // Y las eliminadas ahora quedan fuera. Estaban entrando: `estado = Realizada` no
  // dice nada de si la sesión sigue viva, así que una borrada seguía pesando.
  const microsIds = await getMicrosDeportista(dep.id)

  // Con `periodo` se acota a un tramo. Sirve para ver si el coste de cada deporte se
  // mueve con el tiempo: sin acotar, el SICAT mete toda la historia en el mismo saco
  // y una mejora de hace un mes queda diluida entre dos años de sesiones.
  const consulta = () => {
    let q = supabase
      .from('sesion')
      .select('id, disciplina, rpe_estimado, rpe_reportado, fecha_sesion')
      .eq('estado', 'Realizada')
      .or('eliminada.is.null,eliminada.eq.false')
    if (periodo?.desde) q = q.gte('fecha_sesion', periodo.desde)
    if (periodo?.hasta) q = q.lte('fecha_sesion', periodo.hasta)
    return q
  }

  const [enPlan, libres] = await Promise.all([
    microsIds.length ? consulta().in('id_microciclo', microsIds) : Promise.resolve({ data: [] }),
    consulta().eq('id_deportista', dep.id).is('id_microciclo', null),
  ])

  const sesiones = [...(enPlan.data || []), ...(libres.data || [])]
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
    .select('rpe_reportado, fc_media, sensacion_tecnica, dolor_muscular, hrv_del_dia, id_sesion, disciplina')
    .in('id_sesion', sesionIds)

  const discDeSesion: Record<number, string> = {}
  sesiones.forEach(s => { discDeSesion[s.id] = s.disciplina })

  // Una fila por SESIÓN y DEPORTE. En una sesión normal todas sus tareas son del mismo
  // deporte → 1 fila, como siempre (los valores post-sesión se guardan iguales en todas
  // sus tareas, y así una sesión con más tareas no pesa de más en la media).
  // En un BRICK cada bloque es un deporte distinto → una fila por deporte, con el
  // feedback de ESE bloque. Si no, el brick no contaría en ninguna disciplina, que es
  // absurdo siendo la sesión más exigente (ver lib/atribucion).
  const porSesionDeporte = new Map<string, any>()
  ;(tareas || []).forEach((t: any) => {
    const disc = t.disciplina || discDeSesion[t.id_sesion]
    if (!disc) return
    const clave = t.id_sesion + '|' + disc
    if (!porSesionDeporte.has(clave)) porSesionDeporte.set(clave, { ...t, disciplina: disc })
  })

  const filas = Array.from(porSesionDeporte.values()).map((t: any) => {
    const idSesion = t.id_sesion
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
    // Por el DEPORTE DEL BLOQUE, nunca por sesion.disciplina: en un brick vale 'Brick'
    // y no casaría con ninguna disciplina → el brick desaparecería del SICAT.
    const filasDisc = filas.filter((f: any) => f.disciplina === disc)
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
