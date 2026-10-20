// ============================================================
// TRIPULSE — El detalle de un entreno del reloj
// ============================================================
// Maqueta aprobada el 2026-10-19 («las 4 como propones»). Dos mitades:
//
//   1. Lo que se GUARDA (solo en el servidor, al sincronizar): del fichero
//      FIT (lib/fit) salen las vueltas que grabó el reloj, los tramos de cada
//      km (5 km en bici) y cuántos segundos pasó a cada pulsación. Ni una
//      coordenada: el lector ni las lee.
//   2. Lo que se ENSEÑA (en «Su reloj»): con eso y las zonas que el
//      entrenador usa con ese deportista (su FC máx y su reposo), el tiempo en
//      cada zona. Las zonas no se guardan: se calculan al enseñarlas, así que
//      un test nuevo las corrige solas en todos los entrenos.
//
// Puro: ni base ni pantallas. Lo usan lib/relojes-sincronizar (1) y
// components/DetalleEntreno (2).

import type { Fit, RegistroFit } from './fit'
import { ZONAS_RESISTENCIA } from './zonas'
import { ZONAS_UI } from './referencia-zona'
import { bandaFC, type DatosFC, type MetodoFC } from './frecuencia-cardiaca'
import { hmmss } from './medicion'

/** Sube cuando cambie lo que se saca del fichero: se puede saber qué detalles son de antes. */
export const VERSION_DETALLE = 1

/** De cuántos días atrás se pide el detalle (y «Su reloj» avisa de que llegará). */
export const DIAS_DETALLE = 28
/** Cuántos ficheros como mucho en cada sincronización: COROS limita las descargas al día. */
export const DETALLES_POR_VEZ = 3

/** Cada cuánto se parte en tramos. Natación y el resto no: se quedan con las vueltas del reloj. */
export const TRAMO_POR_DISCIPLINA: Record<string, number> = { Carrera: 1000, Ciclismo: 5000 }

/** Un hueco mayor entre dos datos seguidos es una pausa: no cuenta como tiempo entrenando. */
export const PAUSA_S = 10

/** Una FC fuera de esto es un error del sensor, no un dato. */
const FC_CREIBLE: [number, number] = [30, 240]

export interface VueltaDetalle {
  metros: number | null
  segundos: number | null
  fc_media: number | null
  fc_max: number | null
  /** Como la graba el reloj (en carrera, la de una pierna: se dobla al enseñarla). */
  cadencia: number | null
  potencia: number | null
  desnivel: number | null
}

export interface TramoDetalle {
  metros: number
  segundos: number
  fc_media: number | null
  fc_max: number | null
}

export interface DetalleEntreno {
  vueltas: VueltaDetalle[]
  tramos: TramoDetalle[]
  tramo_m: number | null
  /** Segundos a cada pulsación: {"146": 63}. */
  fc_segundos: Record<string, number>
  segundos_con_fc: number
  /** Por qué no hay detalle que enseñar, si no lo hay. */
  motivo: string | null
  version: number
}

const redondo = (x: number | undefined | null, dec = 0): number | null => {
  if (x == null || !Number.isFinite(x)) return null
  const f = 10 ** dec
  return Math.round(x * f) / f
}
const fcValida = (fc: number | undefined): fc is number => fc != null && fc >= FC_CREIBLE[0] && fc <= FC_CREIBLE[1]

// ---------------------------------------------------------------------------
// 1. Lo que se guarda
// ---------------------------------------------------------------------------

/** Los segundos a cada pulsación, sin las pausas. */
export function fcSegundosDe(registros: RegistroFit[]): { fc_segundos: Record<string, number>; segundos_con_fc: number } {
  const hist: Record<string, number> = {}
  let total = 0
  for (let i = 0; i < registros.length; i++) {
    const r = registros[i]
    if (!fcValida(r.fc)) continue
    const sig = registros[i + 1]
    const dt = sig ? sig.t - r.t : 1
    /* El último dato, o el que va antes de una pausa, vale un segundo. */
    const s = dt > 0 && dt <= PAUSA_S ? dt : 1
    const k = String(Math.round(r.fc))
    hist[k] = (hist[k] || 0) + s
    total += s
  }
  return { fc_segundos: hist, segundos_con_fc: total }
}

/**
 * Los tramos de `tramo` metros, con la hora de cada paso interpolada entre los
 * dos datos que lo rodean. Sin las pausas. El último, el trozo que sobre, si
 * pasa de 50 m. Si no llega a un tramo entero, ninguno.
 */
export function tramosDe(registros: RegistroFit[], tramo: number): TramoDetalle[] {
  const conDistancia = registros.filter(r => r.metros != null && Number.isFinite(r.metros))
  if (conDistancia.length < 2 || !(tramo > 0)) return []
  const salida: TramoDetalle[] = []
  let segundos = 0
  let fcPorSegundos = 0, segundosConFc = 0, fcMax: number | null = null
  let siguiente = conDistancia[0].metros! + tramo

  const cerrar = (metros: number) => {
    salida.push({
      metros: Math.round(metros),
      segundos: Math.round(segundos * 10) / 10,
      fc_media: segundosConFc > 0 ? Math.round(fcPorSegundos / segundosConFc) : null,
      fc_max: fcMax,
    })
    segundos = 0; fcPorSegundos = 0; segundosConFc = 0; fcMax = null
  }

  for (let i = 0; i < conDistancia.length - 1; i++) {
    const a = conDistancia[i], b = conDistancia[i + 1]
    const dt = b.t - a.t
    if (!(dt > 0)) continue
    const enPausa = dt > PAUSA_S
    const da = a.metros!, db = b.metros!
    let corte = 0
    /* Uno o varios pasos de tramo entre a y b (raro, salvo con datos espaciados). */
    while (db >= siguiente && db > da) {
      const fraccion = (siguiente - da) / (db - da)
      const s = enPausa ? 0 : dt * (fraccion - corte)
      segundos += s
      if (fcValida(a.fc)) { fcPorSegundos += a.fc * s; segundosConFc += s; fcMax = Math.max(fcMax ?? 0, a.fc) }
      cerrar(tramo)
      corte = fraccion
      siguiente += tramo
    }
    const s = enPausa ? 0 : dt * (1 - corte)
    segundos += s
    if (fcValida(a.fc) && s > 0) { fcPorSegundos += a.fc * s; segundosConFc += s; fcMax = Math.max(fcMax ?? 0, a.fc) }
  }
  /* El trozo final, si pasa de 50 m. Sin ningún tramo entero no hay tramos: uno
     solo sería el entreno completo, que ya está arriba. */
  const resto = conDistancia[conDistancia.length - 1].metros! - (siguiente - tramo)
  if (salida.length && resto > 50 && segundos > 0) cerrar(resto)
  return salida
}

/** El detalle de un entreno a partir de su fichero. */
export function detalleDeFit(fit: Fit, disciplina: string | null | undefined): DetalleEntreno {
  const vueltas: VueltaDetalle[] = fit.vueltas.map(l => ({
    metros: redondo(l.metros),
    segundos: redondo(l.segundos ?? l.segundosTotales, 1),
    fc_media: redondo(l.fcMedia),
    fc_max: redondo(l.fcMax),
    cadencia: redondo(l.cadencia),
    potencia: redondo(l.potencia),
    desnivel: redondo(l.desnivel),
  }))
  const tramo = disciplina ? TRAMO_POR_DISCIPLINA[disciplina] ?? null : null
  const tramos = tramo ? tramosDe(fit.registros, tramo) : []
  const { fc_segundos, segundos_con_fc } = fcSegundosDe(fit.registros)
  const nada = !vueltas.length && !tramos.length && !segundos_con_fc
  return {
    vueltas, tramos, tramo_m: tramos.length ? tramo : null,
    fc_segundos, segundos_con_fc,
    motivo: nada ? 'El fichero del reloj no trae ni vueltas ni FC.' : null,
    version: VERSION_DETALLE,
  }
}

// ---------------------------------------------------------------------------
// 2. Lo que se enseña
// ---------------------------------------------------------------------------

export interface ZonaFc {
  sigla: string
  nombre: string
  color: string
  /** Desde qué pulsación es esta zona (la primera, desde 0). */
  min: number
  /** Hasta cuál (la última, sin tope). Solo para enseñarlo. */
  max: number | null
}

/* Las clásicas no tienen color en la app: los mismos tonos que Zonas 2, por intensidad. */
const COLOR_CLASICA = ['#6B7280', '#38BDF8', '#22C55E', '#EAB308', '#F97316']

/**
 * Las zonas de FC de un deportista, en pulsaciones, con el sistema que tiene
 * puesto en su ficha (1 = clásico, 2 = Zonas 2) y su FC máx y su reposo (con
 * la reserva si hay reposo, como en el resto de la app: lib/frecuencia-cardiaca).
 * Solo las que tienen banda de FC: CLA, PLA… y Z6-Z7 van por esfuerzo, no por pulso.
 * null sin FC máx: no se inventa.
 */
export function zonasFcDe(sistema: number | null | undefined, d: DatosFC): { zonas: ZonaFc[]; metodo: MetodoFC } | null {
  if (!(d.fcMax > 0)) return null
  const filas: ZonaFc[] = []
  let metodo: MetodoFC = 'fcmax'
  if (sistema === 2) {
    for (const z of ZONAS_RESISTENCIA) {
      const b = bandaFC(z.fcMin, z.fcMax, 'fcmax', d)
      if (!b) continue
      metodo = b.metodo
      filas.push({ sigla: z.sigla, nombre: z.nombre, color: z.color, min: z.fcMin ? b.min : 0, max: z.fcMax ? b.max : null })
    }
  } else {
    ZONAS_UI.slice(0, 5).forEach((z, i) => {
      const b = bandaFC(z.pct[0] || null, z.pct[1] || null, 'umbral', d)
      if (!b) return
      metodo = b.metodo
      filas.push({ sigla: 'Z' + z.num, nombre: z.nombre.replace(/^Z\d\s*/, ''), color: COLOR_CLASICA[i], min: z.pct[0] ? b.min : 0, max: b.max || null })
    })
  }
  if (!filas.length) return null
  /* La última sin tope: por encima de su banda sigue siendo la más alta que hay por pulso. */
  filas.sort((a, b) => a.min - b.min)
  filas[filas.length - 1] = { ...filas[filas.length - 1], max: null }
  return { zonas: filas, metodo }
}

export interface TiempoEnZona { sigla: string; nombre: string; color: string; min: number; max: number | null; segundos: number; pct: number }

/**
 * Cuánto tiempo pasó en cada zona. Cada pulsación va a la zona más alta cuyo
 * principio no supera: así no se pierde nada en los huecos de un punto entre
 * bandas (las clásicas los tienen: Z2 acaba en el 85 % y Z3 empieza en el 86 %).
 */
export function tiempoEnZonas(fcSegundos: Record<string, number> | null | undefined, zonas: ZonaFc[]): TiempoEnZona[] {
  const orden = [...zonas].sort((a, b) => a.min - b.min)
  const seg = orden.map(() => 0)
  let total = 0
  for (const [k, s] of Object.entries(fcSegundos || {})) {
    const fc = Number(k), n = Number(s)
    if (!Number.isFinite(fc) || !(n > 0)) continue
    let i = 0
    for (let j = 0; j < orden.length; j++) if (fc >= orden[j].min) i = j
    seg[i] += n
    total += n
  }
  return orden.map((z, i) => ({ ...z, segundos: seg[i], pct: total ? Math.round(seg[i] * 1000 / total) / 10 : 0 }))
}

/** Lo prescrito frente a lo que hizo: en la zona, por encima y por debajo, en %. */
export function cumplimiento(tiempos: TiempoEnZona[], prescrita: string | null | undefined): { en: number; encima: number; debajo: number } | null {
  const i = tiempos.findIndex(t => t.sigla === prescrita)
  if (i < 0) return null
  const total = tiempos.reduce((s, t) => s + t.segundos, 0)
  if (!total) return null
  const pct = (s: number) => Math.round(s * 100 / total)
  const en = pct(tiempos[i].segundos)
  const encima = pct(tiempos.slice(i + 1).reduce((s, t) => s + t.segundos, 0))
  return { en, encima, debajo: Math.max(0, 100 - en - encima) }
}

/** Sin zonas: su FC por tramos de `ancho` pulsaciones, solo los que tienen algo. */
export function fcPorTramos(fcSegundos: Record<string, number> | null | undefined, ancho = 10): { desde: number; hasta: number; segundos: number }[] {
  const m = new Map<number, number>()
  for (const [k, s] of Object.entries(fcSegundos || {})) {
    const fc = Number(k), n = Number(s)
    if (!Number.isFinite(fc) || !(n > 0)) continue
    const desde = Math.floor(fc / ancho) * ancho
    m.set(desde, (m.get(desde) || 0) + n)
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([desde, segundos]) => ({ desde, hasta: desde + ancho - 1, segundos }))
}

/** «54:00», «1:02:15»; «—» si no hay. El formato vive en lib/medicion. */
export function tiempoTexto(segundos: number | null | undefined): string {
  if (segundos == null || !Number.isFinite(segundos) || segundos < 0) return '—'
  return hmmss(segundos)
}

/** El ritmo o la velocidad de un trozo, como se lee en cada deporte: «8:09 /km», «28,4 km/h», «1:52 /100 m». */
export function ritmoDeTrozo(metros: number | null | undefined, segundos: number | null | undefined, disciplina: string | null | undefined): string | null {
  if (!(Number(metros) > 0) || !(Number(segundos) > 0)) return null
  const m = Number(metros), s = Number(segundos)
  if (disciplina === 'Ciclismo') return (m / s * 3.6).toFixed(1).replace('.', ',') + ' km/h'
  if (disciplina === 'Natacion' || disciplina === 'Natación') return tiempoTexto(s * 100 / m) + ' /100 m'
  return tiempoTexto(s * 1000 / m) + ' /km'
}

/** «6,62 km», «800 m». */
export function distanciaTexto(metros: number | null | undefined): string {
  if (!(Number(metros) > 0)) return '—'
  const m = Number(metros)
  return m >= 1000 ? (m / 1000).toFixed(2).replace('.', ',') + ' km' : Math.round(m) + ' m'
}

/** Los minutos de una zona como se escriben en la pantalla: «31′», «0′». */
export const minutosTexto = (segundos: number) => Math.round(segundos / 60) + '′'
