// Métricas del panel del entrenador (bento vivo) para UN deportista.
// Reúne en una sola llamada: frescura (TSB), volumen planificado por disciplina
// de la semana en curso, índices de percepción/planificación, última fecha de
// test y el mapa de sesiones de la semana (para los puntitos por día).
//
// Las fórmulas puras replican las de las páginas de origen (fuente de verdad):
//   · TSB / carga   → app/carga/page.tsx  (calcularCargas, estadoTSB)
//   · índices       → app/indices/page.tsx (calcularIndices, semaforo)
//   · duración      → lib/duracion-carga.ts (estimarDuraciones)

import { estimarDuraciones, minutosEfectivos } from './duracion-carga'
import { cargarBloques } from './atribucion'

// ---- Disciplinas (colores alineados con app/volumen/page.tsx) ----
// 'Brick' está aquí solo para PINTAR (es la etiqueta de la sesión, morada en toda
// la app). No entra en DISC_ORDEN: no es un deporte y su volumen se reparte entre
// los deportes reales de sus bloques (ver lib/atribucion).
export const DISC_META: Record<string, { label: string; color: string }> = {
  Natacion: { label: 'Natación', color: '#60a5fa' },
  Ciclismo: { label: 'Ciclismo', color: '#fbbf24' },
  Carrera: { label: 'Carrera', color: '#4ade80' },
  Fuerza: { label: 'Fuerza', color: '#f87171' },
  Brick: { label: 'Brick', color: '#a855f7' },
}
const DISC_ORDEN = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']

export interface MetricasPanel {
  carga: { tsb: number; label: string; color: string; spark: number[] } | null
  tendencia: number[]
  proxima: { fecha: string; dow: string; disciplina: string; color: string } | null
  volumen: { total: number; nSesiones: number; modo: 'tiempo' | 'conteo'; porDisc: { key: string; label: string; color: string; min: number; n: number }[] } | null
  indices: { perTexto: string; perColor: string; planTexto: string; planColor: string; n: number } | null
  tests: { ultima: string | null }
  semana: { fecha: string; dow: string; sesiones: { color: string }[] }[]
  agenda: { fecha: string; etiqueta: string; disciplina: string; color: string; zona: string | null; min: number | null }[]
  general: { comunicacion: number; ejercicios: number; papelera: number }
}

// Etiqueta relativa de un día: Hoy / Mañana / «mié 17».
function etiquetaDia(fechaStr: string): string {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const d = new Date(fechaStr + 'T00:00:00')
  const diff = Math.round((d.getTime() - hoy.getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  const dows = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return dows[d.getDay()] + ' ' + d.getDate()
}

// ---- Carga / TSB (frescura) ----
function calcularCargas(sesiones: any[]) {
  if (!sesiones.length) return [] as { carga: number; tsb: number }[]
  const mapa: Record<string, number> = {}
  sesiones.forEach(s => {
    const carga = (s.rpe_reportado || s.rpe_estimado || 5) * (s.duracion_minutos || 0)
    mapa[s.fecha_sesion] = (mapa[s.fecha_sesion] || 0) + carga
  })
  const fechas = Object.keys(mapa).sort()
  const out: { carga: number; tsb: number }[] = []
  let atl = 0, ctl = 0
  fechas.forEach(f => {
    const carga = mapa[f] || 0
    atl = carga * (2 / 8) + atl * (1 - 2 / 8)
    ctl = carga * (2 / 43) + ctl * (1 - 2 / 43)
    out.push({ carga: Math.round(carga), tsb: Math.round(ctl - atl) })
  })
  return out
}
function estadoTSB(tsb: number) {
  if (tsb < -30) return { label: 'Sobrecarga', color: '#ef4444' }
  if (tsb < -10) return { label: 'Carga productiva', color: '#f97316' }
  if (tsb < 5) return { label: 'En transición', color: '#eab308' }
  if (tsb < 25) return { label: 'Forma óptima', color: '#22c55e' }
  return { label: 'Desentrenando', color: '#3b82f6' }
}

// ---- Índices (percepción / planificación) ----
function semaforoPer(v: number) {
  if (v < 0.85) return { texto: 'Infraperceptor', color: '#22c55e' }
  if (v <= 1.15) return { texto: 'Calibrado', color: '#eab308' }
  return { texto: 'Sobreperceptor', color: '#ef4444' }
}
function semaforoPlan(v: number) {
  if (v < 0.85) return { texto: 'Más suave de lo previsto', color: '#22c55e' }
  if (v <= 1.15) return { texto: 'Según el plan', color: '#eab308' }
  return { texto: 'Más duro de lo previsto', color: '#ef4444' }
}

function lunesDeEstaSemana(): Date {
  const hoy = new Date()
  const l = new Date(hoy)
  l.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
  l.setHours(0, 0, 0, 0)
  return l
}

export async function cargarMetricasPanel(supabase: any, dep: any): Promise<MetricasPanel> {
  // ---- Cadena macro → meso → micro (base de casi todo) ----
  const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
  const macroIds = (macros || []).map((m: any) => m.id)
  const { data: mesos } = macroIds.length
    ? await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds) : { data: [] }
  const mesoIds = (mesos || []).map((m: any) => m.id)
  const { data: micros } = mesoIds.length
    ? await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds) : { data: [] }
  const microIds = (micros || []).map((m: any) => m.id)

  // ---- Ventanas temporales ----
  const lunes = lunesDeEstaSemana()
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
  const lunesStr = lunes.toISOString().split('T')[0]
  const domingoStr = domingo.toISOString().split('T')[0]
  const desdeCarga = new Date(); desdeCarga.setDate(desdeCarga.getDate() - 70)
  const desdeCargaStr = desdeCarga.toISOString().split('T')[0]

  // ---- Tests: última fecha + valores para estimar duraciones ----
  const testTablas = ['test1_carrera', 'test2_natacion', 'test3_ciclismo', 'test_fuerza', 'tests_libres']
  const testCols: Record<string, string> = {
    test1_carrera: 'fecha, vam', test2_natacion: 'fecha, css', test3_ciclismo: 'fecha, ftp',
    test_fuerza: 'fecha', tests_libres: 'fecha',
  }
  const testsRes = await Promise.all(testTablas.map(t =>
    supabase.from(t).select(testCols[t]).eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1)
  ))
  let ultimaTest: string | null = null
  const tests = { vam: null as number | null, css: null as number | null, ftp: null as number | null }
  testsRes.forEach((r, i) => {
    const row = r.data?.[0]
    if (!row) return
    if (row.fecha && (!ultimaTest || row.fecha > ultimaTest)) ultimaTest = row.fecha
    if (testTablas[i] === 'test1_carrera') tests.vam = row.vam ?? null
    if (testTablas[i] === 'test2_natacion') tests.css = row.css ?? null
    if (testTablas[i] === 'test3_ciclismo') tests.ftp = row.ftp ?? null
  })

  const selSes = 'id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, estado'

  // ---- Carga (frescura): sesiones realizadas 70 días ----
  const cargaChain = microIds.length
    ? (await supabase.from('sesion').select(selSes).in('id_microciclo', microIds)
        .eq('estado', 'Realizada').gte('fecha_sesion', desdeCargaStr)).data || [] : []
  const cargaLibres = (await supabase.from('sesion').select(selSes)
    .eq('id_deportista', dep.id).is('id_microciclo', null)
    .eq('estado', 'Realizada').gte('fecha_sesion', desdeCargaStr)).data || []
  const serieCarga = calcularCargas([...cargaChain, ...cargaLibres])
  const ultimaCarga = serieCarga[serieCarga.length - 1]
  const carga = ultimaCarga
    ? { tsb: ultimaCarga.tsb, ...estadoTSB(ultimaCarga.tsb), spark: serieCarga.slice(-14).map(x => x.tsb) }
    : null
  const tendencia = serieCarga.slice(-42).map(x => x.tsb)

  // ---- Semana en curso: sesiones planificadas (cualquier estado) ----
  const semChain = microIds.length
    ? (await supabase.from('sesion').select(selSes).in('id_microciclo', microIds)
        .gte('fecha_sesion', lunesStr).lte('fecha_sesion', domingoStr)).data || [] : []
  const semLibres = (await supabase.from('sesion').select(selSes)
    .eq('id_deportista', dep.id).is('id_microciclo', null)
    .gte('fecha_sesion', lunesStr).lte('fecha_sesion', domingoStr)).data || []
  const sesSemana = [...semChain, ...semLibres]

  // Volumen por disciplina. Si hay duración estimable → minutos; si no, conteo de sesiones.
  let volumen: MetricasPanel['volumen'] = null
  if (sesSemana.length) {
    // Por BLOQUE, no por sesión: un brick suma sus minutos a la bici y a la
    // carrera por separado, no a una disciplina 'Brick' inexistente.
    const bloques = await cargarBloques(supabase, sesSemana, { tests })
    const minPorDisc: Record<string, number> = {}
    const nPorDisc: Record<string, number> = {}
    bloques.forEach(b => {
      minPorDisc[b.disciplina] = (minPorDisc[b.disciplina] || 0) + b.minutos
    })
    // El conteo sigue siendo de sesiones (un brick es UNA sesión), pero cuenta
    // en cada disciplina que toca.
    sesSemana.forEach(s => {
      const suyos = bloques.filter(b => b.id_sesion === s.id)
      const discs = new Set(suyos.length ? suyos.map(b => b.disciplina) : [s.disciplina || 'Otra'])
      discs.forEach(k => { nPorDisc[k] = (nPorDisc[k] || 0) + 1 })
    })
    const total = Math.round(Object.values(minPorDisc).reduce((a, b) => a + b, 0))
    const modo: 'tiempo' | 'conteo' = total > 0 ? 'tiempo' : 'conteo'
    const porDisc = DISC_ORDEN
      .filter(k => (nPorDisc[k] || 0) > 0)
      .map(k => ({ key: k, label: DISC_META[k].label, color: DISC_META[k].color, min: Math.round(minPorDisc[k] || 0), n: nPorDisc[k] }))
    volumen = { total, nSesiones: sesSemana.length, modo, porDisc }
  }

  // Mapa de la semana (puntitos por día)
  const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const semana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes); d.setDate(lunes.getDate() + i)
    const f = d.toISOString().split('T')[0]
    const sesiones = sesSemana
      .filter(s => s.fecha_sesion === f)
      .map(s => ({ color: DISC_META[s.disciplina]?.color || '#94a3b8' }))
    return { fecha: f, dow: DOW[i], sesiones }
  })

  // Próxima sesión (hoy o después, dentro de la semana)
  const hoyStr = new Date().toISOString().split('T')[0]
  const futuras = sesSemana
    .filter(s => s.fecha_sesion >= hoyStr)
    .sort((a, b) => a.fecha_sesion.localeCompare(b.fecha_sesion))
  let proxima: MetricasPanel['proxima'] = null
  if (futuras[0]) {
    const s = futuras[0]
    const d = new Date(s.fecha_sesion)
    proxima = {
      fecha: s.fecha_sesion,
      dow: DOW[(d.getDay() + 6) % 7],
      disciplina: s.disciplina || '—',
      color: DISC_META[s.disciplina]?.color || '#94a3b8',
    }
  }

  // ---- Índices: últimas 20 realizadas + sus tareas ----
  let indices: MetricasPanel['indices'] = null
  const fcUmbral = dep.fc_maxima ? dep.fc_maxima * 0.85 : 0
  if (microIds.length && fcUmbral) {
    const { data: ses } = await supabase.from('sesion')
      .select('id, rpe_estimado, fecha_sesion').in('id_microciclo', microIds)
      .eq('estado', 'Realizada').order('fecha_sesion', { ascending: false }).limit(20)
    const sesIds = (ses || []).map((s: any) => s.id)
    if (sesIds.length) {
      const { data: tareas } = await supabase.from('tarea')
        .select('id_sesion, rpe_reportado, fc_media').in('id_sesion', sesIds)
        .not('rpe_reportado', 'is', null)
      const perVals: number[] = []
      const planVals: number[] = []
      ;(ses || []).forEach((s: any) => {
        const t = (tareas || []).find((x: any) => x.id_sesion === s.id && x.fc_media)
        if (!t || !t.fc_media || !t.rpe_reportado) return
        const cargaObj = (t.fc_media / fcUmbral) * 10
        if (cargaObj <= 0) return
        perVals.push(t.rpe_reportado / cargaObj)
        if (s.rpe_estimado > 0) planVals.push(cargaObj / s.rpe_estimado)
      })
      if (perVals.length) {
        const mediaPer = perVals.reduce((a, b) => a + b, 0) / perVals.length
        const mediaPlan = planVals.length ? planVals.reduce((a, b) => a + b, 0) / planVals.length : 1
        const p = semaforoPer(mediaPer)
        const pl = semaforoPlan(mediaPlan)
        indices = { perTexto: p.texto, perColor: p.color, planTexto: pl.texto, planColor: pl.color, n: perVals.length }
      }
    }
  }

  // ---- Agenda: próximas sesiones (hoy → +21 días, no realizadas) ----
  const finVentana = new Date(); finVentana.setDate(finVentana.getDate() + 21)
  const finStr = finVentana.toISOString().split('T')[0]
  const agChain = microIds.length
    ? (await supabase.from('sesion').select(selSes).in('id_microciclo', microIds).gte('fecha_sesion', hoyStr).lte('fecha_sesion', finStr)).data || [] : []
  const agLibres = (await supabase.from('sesion').select(selSes)
    .eq('id_deportista', dep.id).is('id_microciclo', null).gte('fecha_sesion', hoyStr).lte('fecha_sesion', finStr)).data || []
  const agSes = [...agChain, ...agLibres]
    .filter(s => s.estado !== 'Realizada')
    .sort((a, b) => a.fecha_sesion.localeCompare(b.fecha_sesion))
    .slice(0, 6)
  const agIds = agSes.map(s => s.id)
  const { data: agTareas } = agIds.length
    ? await supabase.from('tarea').select('id_sesion, zona_entrenamiento, orden').in('id_sesion', agIds).order('orden')
    : { data: [] }
  const estimAg = agIds.length ? await estimarDuraciones(supabase, agIds, tests) : {}
  const agenda = agSes.map(s => {
    const t0 = (agTareas || []).find((t: any) => t.id_sesion === s.id)
    return {
      fecha: s.fecha_sesion,
      etiqueta: etiquetaDia(s.fecha_sesion),
      disciplina: s.disciplina || '—',
      color: DISC_META[s.disciplina]?.color || '#94a3b8',
      zona: t0?.zona_entrenamiento || null,
      min: minutosEfectivos(s.duracion_minutos, estimAg[s.id]),
    }
  })

  // ---- General: conteos para los accesos secundarios ----
  const [ejRes, comRes, papChain, papLibres] = await Promise.all([
    supabase.from('ejercicios_biblioteca').select('id', { count: 'exact', head: true }),
    supabase.from('mensajes').select('id').eq('id_deportista', dep.id).eq('autor', 'deportista').eq('leido', false),
    microIds.length ? supabase.from('sesion').select('id').in('id_microciclo', microIds).eq('eliminada', true) : Promise.resolve({ data: [] }),
    supabase.from('sesion').select('id').eq('id_deportista', dep.id).is('id_microciclo', null).eq('eliminada', true),
  ])
  const general = {
    comunicacion: (comRes.data || []).length,
    ejercicios: ejRes.count || 0,
    papelera: (papChain.data || []).length + (papLibres.data || []).length,
  }

  return { carga, tendencia, proxima, volumen, indices, tests: { ultima: ultimaTest }, semana, agenda, general }
}

// Formatea minutos como "1h20" / "45′".
export function fmtMin(min: number): string {
  if (min <= 0) return '0'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return m + '′'
  return h + 'h' + (m ? String(m).padStart(2, '0') : '')
}
