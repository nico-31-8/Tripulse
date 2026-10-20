// ============================================================
// TRIPULSE — El ritmo a igual FC: la forma aeróbica, sin test
// ============================================================
// Maqueta aprobada el 2026-10-20 («las 5 como propones»):
// https://claude.ai/artifact/BTBghmyQYt94pmRm5a3qfP
//
// Dos cosas, solo en carrera, de los km que manda su reloj (reloj_detalle):
//
//   · EL RITMO A IGUAL FC. Si con su FC de siempre corre más rápido, su forma
//     aeróbica ha mejorado («FC más baja al mismo ritmo», ficha B4-01). La FC
//     de comparación es la suya habitual de rodaje: no necesita test ni FC máx.
//   · EL DESACOPLAMIENTO de sus rodajes largos: cuánto se le sube la FC en la
//     segunda mitad a ritmo constante. Menos del 5 %, bien; hasta el 10 %,
//     normal en base o con calor; más, le falta base o iba cansado (fichas
//     B1-10 y B1-12, lección L0.5 del Máster).
//
// LO QUE ESTROPEA LA COMPARACIÓN (lección L2.3): la cinta, las cuestas, las
// series y una FC muy distinta de la habitual. Esos rodajes no cuentan, y se
// dice por qué. El calor y el cansancio no se pueden quitar: por eso se mira la
// tendencia, nunca un día, y un cambio de menos del 3 % es «sin cambios claros».
//
// No se llama «forma»: en la app la forma es la frescura (el TSB) de /carga.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TramoDetalle, VueltaDetalle } from './detalle-entreno'

/** Doce semanas: lo que se mira. */
export const DIAS_EFICIENCIA = 84
/** Con menos, cualquier cambio es ruido. */
export const MIN_RODAJES = 4
/** Lo que varía de un día a otro sin que cambie nada. */
export const UMBRAL_CAMBIO = 0.03
export const MIN_MINUTOS = 20
export const MIN_MINUTOS_DESACOPLAMIENTO = 45
/** Lo más que pueden variar sus km para ser un rodaje a ritmo regular. */
export const CV_MAXIMO = 0.08
export const SUBIDA_MAXIMA_POR_KM = 15
/** Lo más lejos de la FC de referencia que puede ir su FC media. */
export const MARGEN_FC = 10
/** «Antes»: los rodajes de hace 5 a 9 semanas. */
export const ANTES_DESDE = 63
export const ANTES_HASTA = 35

/** Un rodaje de carrera con lo que hace falta de él. */
export interface RodajeEficiencia {
  id: number
  fecha: string
  minutos: number | null
  /** El deporte como lo dice el reloj: «En cinta», «TREADMILL_RUNNING»… */
  deporte: string | null
  deporteCodigo: number | null
  deporteDetalle: string | null
  /** null: todavía no tiene detalle. */
  tramos: TramoDetalle[] | null
  tramoM: number | null
  vueltas: VueltaDetalle[] | null
  /** Si tiene detalle pero vacío, por qué (el fichero no existe, no se pudo leer…). */
  motivoDetalle?: string | null
}

export interface Desacoplamiento { pct: number; fc1: number; fc2: number }

export interface ResultadoRodaje {
  id: number
  fecha: string
  minutos: number | null
  cuenta: boolean
  /** Por qué no cuenta, como se le dice al entrenador. */
  motivo: string | null
  /** El ritmo medio y la FC media de los km que cuentan (sin el primero). */
  ritmo: number | null
  fc: number | null
  /** Su ritmo a la FC de referencia, en s/km. Solo si cuenta. */
  ritmoRef: number | null
  /** Solo si cuenta y dura 45 min o más. */
  desacoplamiento: Desacoplamiento | null
}

export interface Tendencia {
  /** La mediana de sus 3 últimos. */
  ahora: number
  /** La de los de hace 5 a 9 semanas; null si no hay al menos dos. */
  antes: number | null
  /** (antes − ahora) / antes: positivo es más rápido. */
  cambio: number | null
  veredicto: 'mejor' | 'peor' | 'igual' | null
}

export interface AnalisisEficiencia {
  /** Su FC habitual de rodaje; null si no hay ningún rodaje con el que sacarla. */
  fcRef: number | null
  /** Todos los de carrera del periodo, el más reciente primero, con su motivo si no cuentan. */
  rodajes: ResultadoRodaje[]
  /** Los que cuentan, del más viejo al más nuevo. */
  puntos: { fecha: string; ritmoRef: number }[]
  /** La mediana de cada tres, para la línea. */
  linea: { fecha: string; ritmo: number }[]
  tendencia: Tendencia | null
}

const mediana = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export const esCinta = (r: Pick<RodajeEficiencia, 'deporte' | 'deporteCodigo' | 'deporteDetalle'>): boolean =>
  r.deporteCodigo === 101 || /cinta|treadmill/i.test(String(r.deporte ?? '') + ' ' + String(r.deporteDetalle ?? ''))

/** El tiempo y la FC de unos km: segundos, metros y FC media pesada por el tiempo (null si ninguno la trae). */
function sumar(tramos: TramoDetalle[]): { segundos: number; metros: number; fc: number | null } {
  let segundos = 0, metros = 0, fcPorS = 0, sConFc = 0
  for (const t of tramos) {
    segundos += t.segundos
    metros += t.metros
    if (t.fc_media != null) { fcPorS += t.fc_media * t.segundos; sConFc += t.segundos }
  }
  return { segundos, metros, fc: sConFc ? fcPorS / sConFc : null }
}

/**
 * Su ritmo a la FC de referencia, en s/km: con la misma relación entre
 * velocidad y FC, pero desde su reposo (la reserva) si se sabe, que es como
 * sube de verdad la FC. Solo se usa con FC a ±10 ppm de la de referencia: es
 * una corrección pequeña, no una extrapolación.
 */
export function ritmoAFc(ritmo: number, fc: number, fcRef: number, fcReposo?: number | null): number {
  const rep = fcReposo && fcReposo > 0 && fcReposo < fcRef - 20 && fcReposo < fc - 20 ? fcReposo : 0
  const v = 1000 / ritmo
  return 1000 / (v * (fcRef - rep) / (fc - rep))
}

/**
 * El desacoplamiento de unos km: la eficiencia (velocidad / FC) de la segunda
 * mitad frente a la primera, partiendo por el tiempo. Cada km va a la mitad
 * donde cae su centro.
 */
export function desacoplamientoDe(tramos: TramoDetalle[]): Desacoplamiento | null {
  const conFc = tramos.filter(t => t.fc_media != null && t.segundos > 0)
  if (conFc.length < 4) return null
  const total = conFc.reduce((s, t) => s + t.segundos, 0)
  const primera: TramoDetalle[] = [], segunda: TramoDetalle[] = []
  let hecho = 0
  for (const t of conFc) {
    ;(hecho + t.segundos / 2 <= total / 2 ? primera : segunda).push(t)
    hecho += t.segundos
  }
  if (!primera.length || !segunda.length) return null
  const a = sumar(primera), b = sumar(segunda)
  if (!a.fc || !b.fc) return null
  const ef1 = a.metros / a.segundos / a.fc
  const ef2 = b.metros / b.segundos / b.fc
  return { pct: Math.round((1 - ef2 / ef1) * 1000) / 10, fc1: Math.round(a.fc), fc2: Math.round(b.fc) }
}

/** Cómo se le dice el desacoplamiento al entrenador. */
export function nivelDesacoplamiento(pct: number): { nivel: 'bien' | 'medio' | 'mal'; texto: string } {
  if (pct < 5) return { nivel: 'bien', texto: 'Bien' }
  if (pct <= 10) return { nivel: 'medio', texto: 'Normal en base o con calor' }
  return { nivel: 'mal', texto: 'Alto: falta base o iba cansado' }
}

/** La forma del rodaje, sin mirar aún la FC de referencia: si vale para comparar y, si vale, su ritmo y su FC. */
function forma(r: RodajeEficiencia): { motivo: string } | { ritmo: number; fc: number; usados: TramoDetalle[] } {
  if (esCinta(r)) return { motivo: 'En cinta: el ritmo del reloj no vale' }
  if (r.minutos != null && r.minutos < MIN_MINUTOS) return { motivo: Math.round(r.minutos) + ' min: hacen falta ' + MIN_MINUTOS }
  if (r.motivoDetalle) return { motivo: 'Sin el detalle de sus km: ' + r.motivoDetalle.replace(/\.$/, '') }
  if (!r.tramos) return { motivo: 'Aún sin el detalle de sus km: llega con la próxima sincronización' }
  /* Solo los km enteros, y sin el primero: la FC tarda en subir. */
  const enteros = r.tramoM === 1000 ? r.tramos.filter(t => t.metros === 1000 && t.segundos > 0) : []
  const usados = enteros.slice(1)
  if (usados.length < 3) return { motivo: 'Menos de 4 km enteros' }
  const ritmos = usados.map(t => t.segundos)
  const media = ritmos.reduce((s, x) => s + x, 0) / ritmos.length
  const cv = Math.sqrt(ritmos.reduce((s, x) => s + (x - media) ** 2, 0) / ritmos.length) / media
  if (cv > CV_MAXIMO) return { motivo: 'Con series o cambios de ritmo: sus km varían un ' + Math.round(cv * 100) + ' %' }
  const subida = (r.vueltas || []).reduce((s, v) => s + (v.desnivel || 0), 0)
  const km = r.tramos.reduce((s, t) => s + t.metros, 0) / 1000
  if (km > 0 && subida / km > SUBIDA_MAXIMA_POR_KM) return { motivo: 'Cuestas: ' + Math.round(subida / km) + ' m de subida por km' }
  const { segundos, metros, fc } = sumar(usados)
  if (fc == null) return { motivo: 'Sin FC' }
  return { ritmo: segundos * 1000 / metros, fc, usados }
}

/** Todo lo de la pestaña Eficiencia, de sus rodajes de carrera de las últimas 12 semanas. */
export function analizarEficiencia(rodajes: RodajeEficiencia[], { hoy, fcReposo }: { hoy: string; fcReposo?: number | null }): AnalisisEficiencia {
  const desde = sumarDiasISO(hoy, -DIAS_EFICIENCIA)
  const delPeriodo = rodajes.filter(r => r.fecha >= desde && r.fecha <= hoy).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id - b.id))
  const formas = delPeriodo.map(r => ({ r, f: forma(r) }))
  const validas = formas.flatMap(x => ('ritmo' in x.f ? [x.f.fc] : []))
  const fcRef = validas.length ? Math.round(mediana(validas) / 5) * 5 : null

  const resultados: ResultadoRodaje[] = formas.map(({ r, f }) => {
    const base = { id: r.id, fecha: r.fecha, minutos: r.minutos }
    if (!('ritmo' in f)) return { ...base, cuenta: false, motivo: f.motivo, ritmo: null, fc: null, ritmoRef: null, desacoplamiento: null }
    const ritmo = Math.round(f.ritmo), fc = Math.round(f.fc)
    if (fcRef == null || Math.abs(f.fc - fcRef) > MARGEN_FC) {
      return { ...base, cuenta: false, motivo: 'FC lejos de ' + fcRef + ' (' + fc + ')', ritmo, fc, ritmoRef: null, desacoplamiento: null }
    }
    return {
      ...base, cuenta: true, motivo: null, ritmo, fc,
      ritmoRef: Math.round(ritmoAFc(f.ritmo, f.fc, fcRef, fcReposo)),
      desacoplamiento: r.minutos != null && r.minutos >= MIN_MINUTOS_DESACOPLAMIENTO ? desacoplamientoDe(f.usados) : null,
    }
  })

  const puntos = resultados.filter(x => x.cuenta && x.ritmoRef != null).map(x => ({ fecha: x.fecha, ritmoRef: x.ritmoRef! }))
  const linea = puntos.slice(2).map((p, i) => ({ fecha: p.fecha, ritmo: mediana([puntos[i].ritmoRef, puntos[i + 1].ritmoRef, p.ritmoRef]) }))
  return { fcRef, rodajes: [...resultados].reverse(), puntos, linea, tendencia: tendenciaDe(puntos, hoy) }
}

/** «Ahora» frente a «antes», y si el cambio pasa de lo que varía de un día a otro. */
export function tendenciaDe(puntos: { fecha: string; ritmoRef: number }[], hoy: string): Tendencia | null {
  if (puntos.length < MIN_RODAJES) return null
  const ahora = mediana(puntos.slice(-3).map(p => p.ritmoRef))
  const desde = sumarDiasISO(hoy, -ANTES_DESDE), hasta = sumarDiasISO(hoy, -ANTES_HASTA)
  const deAntes = puntos.filter(p => p.fecha >= desde && p.fecha <= hasta).map(p => p.ritmoRef)
  if (deAntes.length < 2) return { ahora, antes: null, cambio: null, veredicto: null }
  const antes = mediana(deAntes)
  const cambio = (antes - ahora) / antes
  return { ahora, antes, cambio, veredicto: Math.abs(cambio) < UMBRAL_CAMBIO ? 'igual' : cambio > 0 ? 'mejor' : 'peor' }
}

/* Aquí y no de lib/fechas para que esto siga siendo una hoja sin dependencias de pantalla. */
function sumarDiasISO(iso: string, dias: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Leerlos de la base
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? n : null
}

/** Sus rodajes de carrera de las últimas 12 semanas, con su detalle si lo tienen. */
export async function cargarRodajes(sb: SupabaseClient, idDeportista: number, hoy: string): Promise<{ rodajes: RodajeEficiencia[]; error: string | null }> {
  const { data: med, error } = await sb.from('reloj_medicion').select('id, fecha, datos')
    .eq('id_deportista', idDeportista).eq('tipo', 'entreno').gte('fecha', sumarDiasISO(hoy, -DIAS_EFICIENCIA))
  if (error) return { rodajes: [], error: error.message }
  const carreras = (med || []).filter(m => (m.datos as Record<string, unknown> | null)?.disciplina === 'Carrera')
  if (!carreras.length) return { rodajes: [], error: null }
  const { data: det, error: e2 } = await sb.from('reloj_detalle').select('id_medicion, tramos, tramo_m, vueltas, motivo')
    .in('id_medicion', carreras.map(c => c.id))
  if (e2) return { rodajes: [], error: e2.message }
  const porId = new Map((det || []).map(d => [d.id_medicion as number, d]))
  const rodajes = carreras.map(c => {
    const d = (c.datos || {}) as Record<string, unknown>
    const x = porId.get(c.id)
    const conDetalle = x && !x.motivo
    return {
      id: c.id as number,
      fecha: String(c.fecha).slice(0, 10),
      minutos: num(d.duracion_min),
      deporte: typeof d.deporte === 'string' ? d.deporte : null,
      deporteCodigo: num(d.deporte_codigo),
      deporteDetalle: typeof d.deporte_detalle === 'string' ? d.deporte_detalle : null,
      tramos: conDetalle ? (x.tramos as TramoDetalle[]) : null,
      tramoM: conDetalle ? num(x.tramo_m) : null,
      vueltas: conDetalle ? (x.vueltas as VueltaDetalle[]) : null,
      motivoDetalle: x?.motivo ? String(x.motivo) : null,
    }
  })
  return { rodajes, error: null }
}
