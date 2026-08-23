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
import { hoyISO, lunesDe, sumarDias, diasEntre, indiceDia, soloDia } from './fechas'
import { FILTRO_VIVAS } from './papelera'
import { cargarBloques } from './atribucion'
import { minutosCarga, cargaReal } from './duracion-carga'

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
/* Esta SÍ estaba bien —comparaba local contra local— pero seguía haciendo
   aritmética de fechas a mano, que es de donde salen estos fallos. */
function etiquetaDia(fechaStr: string): string {
  const diff = diasEntre(hoyISO(), fechaStr)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  const dows = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
  return dows[indiceDia(fechaStr)] + ' ' + Number(soloDia(fechaStr).slice(8, 10))
}

// ---- Carga / TSB (frescura) ----
/* ------------------------------------------------------------------
   LA CURVA DE FORMA, EN UN SOLO SITIO

   ATL (fatiga) y CTL (condición) son dos medias exponenciales sobre la carga
   diaria, y el TSB es la resta. Las constantes son las horas de vida de cada
   una: 8 días la fatiga, 43 la condición. Que la fatiga suba y baje CINCO VECES
   más rápido que la condición es lo que hace que el modelo signifique algo.

   Estaba escrita cuatro veces —aquí, en /carga, en CargaPorDisciplina y en la
   ficha del deportista— cada una con sus constantes copiadas a mano. El
   comentario que había decía que se habían unificado, pero lo unificado fueron
   las ETIQUETAS (`estadoTSB`): el cálculo seguía repetido. Un cambio de tau en
   una copia habría dado dos curvas distintas para el mismo atleta.

   Lo que NO se comparte es de dónde sale la carga de cada día: una pantalla
   pondera por disciplina, otra por brick, otra no pondera. Eso es de cada una;
   lo de aquí es la recurrencia.
   ------------------------------------------------------------------ */

/** Días de vida de la fatiga. */
export const TAU_ATL = 8
/** Días de vida de la condición. */
export const TAU_CTL = 43

export interface PuntoForma {
  fecha: string
  carga: number
  atl: number
  ctl: number
  tsb: number
}

/**
 * La serie de forma a partir de la carga POR DÍA.
 *
 * `porDia` va con las fechas como claves; se recorren ordenadas, que es lo que
 * hace que la exponencial signifique algo. Los días sin carga no hacen falta:
 * el modelo decae solo entre puntos consecutivos igual que lo hacía antes en
 * las cuatro copias.
 */
export function serieForma(porDia: Record<string, number>): PuntoForma[] {
  let atl = 0, ctl = 0
  return Object.keys(porDia).sort().map(fecha => {
    const carga = porDia[fecha] || 0
    atl = carga * (2 / TAU_ATL) + atl * (1 - 2 / TAU_ATL)
    ctl = carga * (2 / TAU_CTL) + ctl * (1 - 2 / TAU_CTL)
    return {
      fecha,
      carga: Math.round(carga),
      atl: Math.round(atl),
      ctl: Math.round(ctl),
      tsb: Math.round(ctl - atl),
    }
  })
}

export function calcularCargas(sesiones: any[]) {
  if (!sesiones.length) return [] as { carga: number; tsb: number }[]
  const mapa: Record<string, number> = {}
  sesiones.forEach(s => {
    const carga = cargaReal(s)
    mapa[s.fecha_sesion] = (mapa[s.fecha_sesion] || 0) + carga
  })
  return serieForma(mapa).map(p => ({ carga: p.carga, tsb: p.tsb }))
}
/**
 * El estado de forma de HOY: fatiga, condición y frescura.
 *
 * `calcularCargas` devuelve la serie entera para pintarla; esto devuelve el
 * último punto con las tres cifras sueltas, que es lo que enseña la ficha del
 * deportista. La EWMA estaba escrita OTRA VEZ allí a mano, con sus mismas
 * constantes copiadas: el comentario de aquel fichero admitía que ya habían
 * tenido que alinearlas una vez.
 */
export function cargaActual(sesiones: any[]): { atl: number; ctl: number; tsb: number } | null {
  if (!sesiones.length) return null
  const mapa: Record<string, number> = {}
  sesiones.forEach(s => { mapa[s.fecha_sesion] = (mapa[s.fecha_sesion] || 0) + cargaReal(s) })
  const serie = serieForma(mapa)
  const u = serie[serie.length - 1]
  return { atl: u.atl, ctl: u.ctl, tsb: u.tsb }
}
// ESTA ES LA ÚNICA. Estaba copiada cuatro veces —aquí, en /carga, en la ficha del
// deportista y en CargaPorDisciplina— y las copias ya habían empezado a separarse
// por las etiquetas: el mismo TSB salía como «Desentrenando» en el panel y como
// «Desentrenamiento» en la ficha. Los umbrales todavía coincidían; el problema
// era el siguiente cambio, que se habría quedado en una copia de cuatro.
//
// Gana la escritura de las tres copias de pantalla («Transición»,
// «Desentrenamiento»), que además es la que usa el prompt del asistente.
//
// El color va en dos formatos a propósito: `color` en hexadecimal para las
// gráficas y `texto` como clase de Tailwind para el texto. El fondo NO viene de
// aquí porque cada pantalla lo tiñe distinto a propósito, y eso sí es decisión
// suya: se elige con `nivel`.
export type NivelTSB = 'sobrecarga' | 'productiva' | 'transicion' | 'optima' | 'desentrenando'

export const UMBRALES_TSB = { sobrecarga: -30, productiva: -10, transicion: 5, optima: 25 }

// ------------------------------------------------------------
// ACWR — carga aguda entre crónica
// ------------------------------------------------------------
// Estaba SOLO como texto dentro del prompt del asistente («< 0,8 Subcarga ·
// 0,8-1,3 Zona óptima…»). En cuanto otro módulo necesita decidir con esos
// números —y la capa que encadena mesociclos los necesita— o los copia o los
// comparte. Aquí se comparten, y la línea del prompt se genera igual que la de
// TSB en vez de escribirse a mano.
export type NivelACWR = 'subcarga' | 'optima' | 'precaucion' | 'peligro'

export const UMBRALES_ACWR = { subcarga: 0.8, optima: 1.3, precaucion: 1.5 }

/**
 * ACWR sobre una serie diaria de carga: la última semana entre la media semanal
 * de las cuatro anteriores.
 *
 * Vivía dentro de `app/carga/page.tsx`, así que era la única pantalla que sabía
 * calcularlo. La capa que encadena mesociclos también necesita el número para
 * decidir si la semana que viene sube o no, y copiarlo habría sido la quinta
 * copia de este concepto en el proyecto.
 *
 * `null` cuando no hay historia suficiente: con menos de cinco semanas el
 * denominador no significa nada, y devolver un 1,0 tranquilizador sería peor que
 * decir que no se sabe.
 */
export function calcularACWR(diario: { carga: number }[]): number | null {
  if (diario.length < 8) return null
  const aguda = diario.slice(-7).reduce((s, d) => s + d.carga, 0)
  const cronicas = diario.slice(-35, -7)
  if (!cronicas.length) return null
  const media = cronicas.reduce((s, d) => s + d.carga, 0) / 4
  return media > 0 ? Math.round((aguda / media) * 100) / 100 : null
}

export function estadoACWR(acwr: number): { nivel: NivelACWR; label: string } {
  if (acwr < UMBRALES_ACWR.subcarga) return { nivel: 'subcarga', label: 'Subcarga' }
  if (acwr <= UMBRALES_ACWR.optima) return { nivel: 'optima', label: 'Zona óptima' }
  if (acwr <= UMBRALES_ACWR.precaucion) return { nivel: 'precaucion', label: 'Precaución' }
  return { nivel: 'peligro', label: 'Peligro' }
}

/** La escala en texto, para el prompt del asistente. Se genera, no se escribe. */
export function escalaACWRTexto(): string {
  const u = UMBRALES_ACWR
  const c = (n: number) => String(n).replace('.', ',')
  return `< ${c(u.subcarga)} Subcarga · ${c(u.subcarga)}–${c(u.optima)} Zona óptima`
    + ` · ${c(u.optima)}–${c(u.precaucion)} Precaución · > ${c(u.precaucion)} Peligro`
}

export function estadoTSB(tsb: number): { nivel: NivelTSB; label: string; color: string; texto: string } {
  if (tsb < UMBRALES_TSB.sobrecarga) return { nivel: 'sobrecarga', label: 'Sobrecarga', color: '#ef4444', texto: 'text-red-400' }
  if (tsb < UMBRALES_TSB.productiva) return { nivel: 'productiva', label: 'Carga productiva', color: '#f97316', texto: 'text-orange-400' }
  if (tsb < UMBRALES_TSB.transicion) return { nivel: 'transicion', label: 'Transición', color: '#eab308', texto: 'text-yellow-400' }
  if (tsb < UMBRALES_TSB.optima) return { nivel: 'optima', label: 'Forma óptima', color: '#22c55e', texto: 'text-green-400' }
  return { nivel: 'desentrenando', label: 'Desentrenamiento', color: '#3b82f6', texto: 'text-blue-400' }
}

/** La escala en texto, para el prompt del asistente. Se genera, no se escribe. */
export function escalaTSBTexto(): string {
  const u = UMBRALES_TSB
  return `< ${u.sobrecarga} ${estadoTSB(u.sobrecarga - 1).label}`
    + ` · ${u.sobrecarga} a ${u.productiva} ${estadoTSB(u.productiva - 1).label}`
    + ` · ${u.productiva} a ${u.transicion} ${estadoTSB(u.transicion - 1).label}`
    + ` · ${u.transicion} a ${u.optima} ${estadoTSB(u.optima - 1).label}`
    + ` · > ${u.optima} ${estadoTSB(u.optima).label}`
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

/**
 * Los siete días de esta semana, de lunes a domingo.
 *
 * ESTO ESTABA ROTO Y SE VEÍA EN PANTALLA. La versión anterior construía un
 * `Date` local, le hacía `setHours(0,0,0,0)` y lo serializaba con
 * `toISOString()`. Medianoche local en España son las 22:00 UTC del día
 * ANTERIOR, así que el lunes salía siendo domingo y la semana entera se corría
 * un día: la columna «L» del panel enseñaba el domingo, y el sábado aparecía
 * marcado como «D · HOY».
 *
 * Y no era solo la etiqueta: ese lunes alimenta las consultas que traen las
 * sesiones de la semana, así que «11 sesiones esta semana» y el volumen salían
 * contados sobre domingo→sábado en vez de lunes→domingo.
 *
 * Se devuelven cadenas y no `Date`: en cuanto hay un `Date` de por medio
 * vuelve a haber un huso que puede mover el día.
 */
export function diasDeLaSemanaActual(hoy: string = hoyISO()): string[] {
  const lunes = lunesDe(hoy)
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

export async function cargarMetricasPanel(supabase: any, dep: any): Promise<MetricasPanel> {
  /* Aquí empezaba la cadena macro → meso → micro, «base de casi todo». Tres
     viajes encadenados antes de poder pedir nada. El microciclo lleva su
     `id_deportista` desde la Fase A: uno. */
  const { data: micros } = await supabase.from('microciclo').select('id').eq('id_deportista', dep.id)
  const microIds = (micros || []).map((m: any) => m.id)

  // ---- Ventanas temporales ----
  const hoyStr = hoyISO()
  const diasSemana = diasDeLaSemanaActual(hoyStr)
  const lunesStr = diasSemana[0]
  const domingoStr = diasSemana[6]
  const desdeCargaStr = sumarDias(hoyStr, -70)

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

  const selSes = 'id, fecha_sesion, disciplina, rpe_estimado, rpe_reportado, duracion_minutos, duracion_real, estado'

  /* LO QUE ESTÁ EN LA PAPELERA NO CUENTA.
   Ninguna de las siete consultas de este fichero filtraba `eliminada`, y
   `eliminada` solo aparecía para CONTAR la papelera. O sea que una sesión
   borrada seguía sumando a la carga, al TSB, al volumen de la semana y salía en
   «próximas sesiones». Con doce en la papelera, el «Sobrecarga» que veía el
   entrenador estaba hinchado con sesiones que él mismo había borrado.

   El resto de la app ya lo filtraba así (la vista de semana, el calendario): era
   este fichero el que se había quedado fuera del convenio. Se pone en una
   constante para que la próxima consulta no vuelva a olvidarlo. */
const VIVAS = FILTRO_VIVAS

// ---- Carga (frescura): sesiones realizadas 70 días ----
  const cargaChain = microIds.length
    ? (await supabase.from('sesion').select(selSes).in('id_microciclo', microIds)
        .eq('estado', 'Realizada').gte('fecha_sesion', desdeCargaStr).or(VIVAS)).data || [] : []
  const cargaLibres = (await supabase.from('sesion').select(selSes)
    .eq('id_deportista', dep.id).is('id_microciclo', null)
    .eq('estado', 'Realizada').gte('fecha_sesion', desdeCargaStr).or(VIVAS)).data || []
  const serieCarga = calcularCargas([...cargaChain, ...cargaLibres])
  const ultimaCarga = serieCarga[serieCarga.length - 1]
  const carga = ultimaCarga
    ? { tsb: ultimaCarga.tsb, ...estadoTSB(ultimaCarga.tsb), spark: serieCarga.slice(-14).map(x => x.tsb) }
    : null
  const tendencia = serieCarga.slice(-42).map(x => x.tsb)

  // ---- Semana en curso: sesiones planificadas (cualquier estado) ----
  const semChain = microIds.length
    ? (await supabase.from('sesion').select(selSes).in('id_microciclo', microIds)
        .gte('fecha_sesion', lunesStr).lte('fecha_sesion', domingoStr).or(VIVAS)).data || [] : []
  const semLibres = (await supabase.from('sesion').select(selSes)
    .eq('id_deportista', dep.id).is('id_microciclo', null)
    .gte('fecha_sesion', lunesStr).lte('fecha_sesion', domingoStr).or(VIVAS)).data || []
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
    const f = diasSemana[i]
    const sesiones = sesSemana
      .filter(s => s.fecha_sesion === f)
      .map(s => ({ color: DISC_META[s.disciplina]?.color || '#94a3b8' }))
    return { fecha: f, dow: DOW[i], sesiones }
  })

  // Próxima sesión (hoy o después, dentro de la semana)
  const futuras = sesSemana
    .filter(s => s.fecha_sesion >= hoyStr)
    .sort((a, b) => a.fecha_sesion.localeCompare(b.fecha_sesion))
  let proxima: MetricasPanel['proxima'] = null
  if (futuras[0]) {
    const s = futuras[0]
    proxima = {
      fecha: s.fecha_sesion,
      dow: DOW[indiceDia(s.fecha_sesion)],
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
      .eq('estado', 'Realizada').or(VIVAS).order('fecha_sesion', { ascending: false }).limit(20)
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
  const finStr = sumarDias(hoyStr, 21)
  const agChain = microIds.length
    ? (await supabase.from('sesion').select(selSes).in('id_microciclo', microIds).gte('fecha_sesion', hoyStr).lte('fecha_sesion', finStr).or(VIVAS)).data || [] : []
  const agLibres = (await supabase.from('sesion').select(selSes)
    .eq('id_deportista', dep.id).is('id_microciclo', null).gte('fecha_sesion', hoyStr).lte('fecha_sesion', finStr).or(VIVAS)).data || []
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
      min: minutosEfectivos(s, estimAg[s.id]),
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
