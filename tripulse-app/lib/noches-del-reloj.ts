// ============================================================
// TRIPULSE — Sus noches: lo que manda el reloj, para el entrenador
// ============================================================
// La pestaña «Noches» de la página del reloj. Junta el sueño y la recarga de
// cada noche (las dos filas que guarda reloj_medicion) en una sola, con lo que
// tienen en común las dos marcas y lo propio de cada una, y compara su semana
// con lo suyo.
//
// LO QUE DA CADA MARCA (lib/polar, lib/coros):
//   · las dos: el sueño (dormido), su puntuación, la HRV y la FC;
//   · COROS: las fases en %, despertares, siesta, minutos en la cama y SU
//     valoración de la HRV (por debajo / normal / por encima) con su rango;
//     su FC es la de reposo del día;
//   · Polar: las fases en minutos, la respiración y la «recarga nocturna»; su
//     FC es la media de la noche.
//
// CÓMO SE COMPARA (decidido el 18-10-2026): la media de sus últimas 7 noches
// contra las 3 semanas de antes (sus 4 semanas), con la MISMA regla que el
// análisis del wellness: fuera solo si se aleja más que su propia variación, y
// nunca menos de los mínimos de UMBRAL_MIN (30 min de sueño, 3 ms de HRV, 2 ppm
// de FC). Con menos de 3 semanas de noches, «Aún sin base». La HRV de COROS se
// compara con el rango normal que da el propio COROS. Ni un semáforo por noche.

import { UMBRAL_MIN } from './wellness-analisis'

export type EstadoHrvCoros = 'por_debajo' | 'normal' | 'por_encima'

export interface NocheDelReloj {
  fecha: string
  dormidoMin: number | null
  puntuacion: number | null
  /** Profundo, ligero y REM en % del sueño. */
  fases: { profundo: number; ligero: number; rem: number } | null
  /** COROS: despertares de más de 5 minutos. */
  despertares: number | null
  interrupcionesMin: number | null
  /** COROS: lo dormido en siestas. */
  siestaMin: number | null
  /** COROS: en la cama, con lo despierto dentro. */
  enCamaMin: number | null
  inicio: string | null
  fin: string | null
  hrv: number | null
  /** COROS: su valoración de la HRV de esa noche frente a su rango normal. */
  hrvEstado: EstadoHrvCoros | null
  hrvRango: [number, number] | null
  hrvLineaBase: number | null
  fc: number | null
  /** De qué FC se trata: la de reposo (COROS) o la media de la noche (Polar). */
  fcTipo: 'reposo' | 'media' | null
  /** Polar: respiraciones por minuto. */
  respiracion: number | null
  /** Polar: el estado de la recarga nocturna, de 1 a 6. */
  recarga: number | null
  /** Polar: las fases en minutos. */
  profundoMin: number | null
  remMin: number | null
}

/** La escala de la «recarga nocturna» de Polar (nightly_recharge_status). */
export const RECARGA_POLAR: Record<number, string> = {
  1: 'muy baja', 2: 'baja', 3: 'comprometida', 4: 'normal', 5: 'buena', 6: 'muy buena',
}

const num = (x: unknown): number | null => {
  const n = typeof x === 'string' ? Number(x) : x
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)

interface FilaMedicion { tipo?: string | null; fecha?: string | null; proveedor?: string | null; datos?: unknown }

/**
 * Las noches de una marca, de la más reciente a la más antigua. Las filas de
 * otra marca (un reloj de antes) no cuentan como de este.
 */
export function nochesDeMediciones(filas: FilaMedicion[] | null | undefined, proveedor: string): NocheDelReloj[] {
  const porFecha = new Map<string, NocheDelReloj>()
  const de = (fecha: string): NocheDelReloj => {
    let n = porFecha.get(fecha)
    if (!n) {
      n = {
        fecha, dormidoMin: null, puntuacion: null, fases: null, despertares: null, interrupcionesMin: null,
        siestaMin: null, enCamaMin: null, inicio: null, fin: null, hrv: null, hrvEstado: null, hrvRango: null,
        hrvLineaBase: null, fc: null, fcTipo: null, respiracion: null, recarga: null, profundoMin: null, remMin: null,
      }
      porFecha.set(fecha, n)
    }
    return n
  }
  for (const f of filas || []) {
    if (f?.proveedor !== proveedor || !f.fecha) continue
    const d = (f.datos && typeof f.datos === 'object' ? f.datos : {}) as Record<string, unknown>
    const fecha = String(f.fecha).slice(0, 10)
    if (f.tipo === 'sueno') {
      const n = de(fecha)
      n.dormidoMin = num(d.dormido_min)
      const p = num(d.puntuacion)
      n.puntuacion = p && p > 0 ? p : null
      n.interrupcionesMin = num(d.interrupciones_min)
      n.despertares = num(d.despertares)
      n.siestaMin = num(d.siesta_min)
      n.enCamaMin = num(d.en_cama_min)
      n.inicio = txt(d.inicio)
      n.fin = txt(d.fin)
      n.profundoMin = num(d.profundo_min)
      n.remMin = num(d.rem_min)
      const pp = num(d.profundo_pct), lp = num(d.ligero_pct), rp = num(d.rem_pct)
      if (pp != null && lp != null && rp != null) {
        n.fases = { profundo: pp, ligero: lp, rem: rp }
      } else if (n.dormidoMin && n.profundoMin != null && n.remMin != null) {
        /* Polar las da en minutos del sueño: lo ligero es lo que queda. */
        const pr = Math.round(100 * n.profundoMin / n.dormidoMin), rm = Math.round(100 * n.remMin / n.dormidoMin)
        if (pr + rm <= 100) n.fases = { profundo: pr, ligero: 100 - pr - rm, rem: rm }
      }
    } else if (f.tipo === 'recarga') {
      const n = de(fecha)
      n.hrv = num(d.rmssd_ms)
      const e = d.hrv_estado
      n.hrvEstado = e === 'por_debajo' || e === 'normal' || e === 'por_encima' ? e : null
      const a = num(d.hrv_rango_min), b = num(d.hrv_rango_max)
      n.hrvRango = a != null && b != null ? [a, b] : null
      n.hrvLineaBase = num(d.hrv_linea_base_ms)
      const media = num(d.fc_media), reposo = num(d.fc_reposo)
      n.fc = media ?? reposo
      n.fcTipo = media != null ? 'media' : reposo != null ? 'reposo' : null
      n.respiracion = num(d.respiracion)
      n.recarga = num(d.estado_recarga)
    }
  }
  return [...porFecha.values()].sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0))
}

// ------------------------------------------------------------
// Su semana frente a lo suyo
// ------------------------------------------------------------

export type EstadoComparado = 'dentro' | 'peor' | 'mejor' | 'sinBase' | 'sinDatos'
export interface Comparacion {
  /** La media de sus últimas 7 noches. */
  reciente: number | null
  /** Su media de las 3 semanas anteriores. */
  base: number | null
  /** Lo que tiene que moverse para estar fuera de lo suyo. */
  margen: number | null
  /** Con COROS, el rango normal de su HRV que da COROS. */
  rango: [number, number] | null
  estado: EstadoComparado
}

/** Las noches con las que se compara: una semana reciente y sus 3 semanas anteriores. */
export const DIAS_RECIENTES = 7
export const DIAS_BASE = 21
/** Con menos noches que estas en la base (3 semanas en total), «Aún sin base». */
export const NOCHES_MINIMAS_BASE = 14

const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const desviacion = (a: number[], m: number) => (a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : 0)
const restarDias = (iso: string, n: number) => {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function comparar(
  noches: NocheDelReloj[], hoy: string, valor: (n: NocheDelReloj) => number | null, minimo: number, mejorAlto: boolean,
): Comparacion {
  const inicioReciente = restarDias(hoy, DIAS_RECIENTES - 1)
  const inicioBase = restarDias(inicioReciente, DIAS_BASE)
  const vals = (de: string, hasta: string) => noches
    .filter(n => n.fecha >= de && n.fecha <= hasta).map(valor).filter((v): v is number => v != null)
  const recientes = vals(inicioReciente, hoy)
  const base = vals(inicioBase, restarDias(inicioReciente, 1))
  const reciente = media(recientes)
  if (reciente == null) return { reciente: null, base: media(base), margen: null, rango: null, estado: 'sinDatos' }
  if (base.length < NOCHES_MINIMAS_BASE) return { reciente, base: media(base), margen: null, rango: null, estado: 'sinBase' }
  const m = media(base)!
  const margen = Math.max(desviacion(base, m), minimo)
  const arriba = reciente > m + margen, abajo = reciente < m - margen
  const estado: EstadoComparado = !arriba && !abajo ? 'dentro' : (arriba === mejorAlto ? 'mejor' : 'peor')
  return { reciente, base: m, margen, rango: null, estado }
}

/** El rango normal de su HRV que da COROS, de la noche más reciente que lo traiga. */
const rangoCoros = (noches: NocheDelReloj[]) => noches.find(n => n.hrvRango)?.hrvRango ?? null

export function resumenDeNoches(noches: NocheDelReloj[], hoy: string): { sueno: Comparacion; hrv: Comparacion; fc: Comparacion } {
  const sueno = comparar(noches, hoy, n => n.dormidoMin, UMBRAL_MIN.horas_sueno_reloj * 60, true)
  let hrv = comparar(noches, hoy, n => n.hrv, UMBRAL_MIN.hrv_noche, true)
  const fc = comparar(noches, hoy, n => n.fc, UMBRAL_MIN.fc_noche, false)

  /* Con COROS manda su rango normal: ya es SU base, la calcula COROS. */
  const rango = rangoCoros(noches)
  if (rango && hrv.reciente != null) {
    const r = hrv.reciente
    hrv = { ...hrv, rango, estado: r < rango[0] ? 'peor' : r > rango[1] ? 'mejor' : 'dentro' }
  }
  return { sueno, hrv, fc }
}
