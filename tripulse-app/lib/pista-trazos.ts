// ============================================================
// Dónde estaba cada trazo en cada fotograma
// ============================================================
//
// Con el seguimiento (lib/seguimiento-puntos), un ángulo dibujado sobre el vídeo
// ya no está quieto: sus puntos tienen una posición en cada fotograma. Aquí se
// lleva esa cuenta —la «pista» de cada trazo— sin tocar imágenes, para poder
// probarla.
//
// CADA FOTOGRAMA SABE DE CUÁL SALIÓ. Los que pone el entrenador (al dibujar o
// al arrastrar un punto) no salen de ninguno; los que calcula el seguimiento
// salen del de al lado. Así, al corregir un punto, se borra exactamente lo que
// se calculó a partir de él —hacia delante o hacia atrás— y nada más: lo demás
// no dependía de ese error.
//
// La clave de cada fotograma es su número (el tiempo × 30): el navegador no
// dice los fps del vídeo, y 30 es lo que graba casi cualquier móvil.

import type { Punto } from './geometria-fotograma'
import type { TipoTrazo, Trazo } from './movimiento-datos'

export interface EnFotograma {
  p: Punto[]
  /** El fotograma del que lo sacó el seguimiento. Sin él, lo puso el entrenador. */
  desde?: number
  /** Los puntos que el seguimiento no encontró: se quedan donde estaban. */
  perdidos?: number[]
}

export type Pista = Record<number, EnFotograma>

/** Un trazo del visor: lo guardable más, si se sigue, su pista. */
export interface TrazoVivo extends Trazo {
  id: number
  pista?: Pista
}

/** Lo que se sigue. La plomada y la horizontal son del encuadre, y la palma se mide una vez. */
export const SE_SIGUEN: TipoTrazo[] = ['linea', 'angulo', 'distancia']

export const seSigue = (tipo: TipoTrazo) => SE_SIGUEN.includes(tipo)

/**
 * El número del fotograma que se ve en ese tiempo: el que empezó antes. Con un
 * margen, porque el navegador da el tiempo redondeado (0,66666 por 0,666667) y
 * sin él caería en el fotograma anterior.
 */
export const claveDe = (segundos: number, fps: number) => Math.floor(segundos * fps + 0.01)

/** El tiempo al que saltar para ver el fotograma k: su centro, lejos de los bordes. */
export const centroDe = (k: number, fps: number) => (k + 0.5) / fps

const claves = (pista: Pista) => Object.keys(pista).map(Number).sort((a, b) => a - b)

/**
 * La posición en un fotograma: la suya si la tiene; si no, la del último
 * fotograma anterior que la tenga, y si no hay ninguno antes, la del primero
 * después. Así el trazo se queda quieto fuera del tramo seguido.
 */
export function enFotograma(pista: Pista, clave: number): EnFotograma | null {
  if (pista[clave]) return pista[clave]
  const ks = claves(pista)
  if (!ks.length) return null
  const antes = ks.filter(k => k < clave)
  return pista[antes.length ? antes[antes.length - 1] : ks[0]]
}

/** Lo que se pinta y se mide en un fotograma: cada trazo en su sitio de ese momento. */
export function visiblesEn(trazos: TrazoVivo[], clave: number): Trazo[] {
  return trazos.map(t => ({ tipo: t.tipo, puntos: t.pista ? enFotograma(t.pista, clave)?.p ?? t.puntos : t.puntos }))
}

/**
 * El entrenador pone el trazo en un fotograma (al arrastrar un punto). Ese
 * fotograma pasa a ser suyo, y se borra todo lo que el seguimiento calculó a
 * partir de él, directa o indirectamente: estaba hecho con el punto mal puesto.
 * `perdidos`: los que siguen perdidos (había dos y ha arrastrado uno).
 */
export function corregir(pista: Pista, clave: number, puntos: Punto[], perdidos: number[] = []): Pista {
  const out: Pista = { ...pista, [clave]: perdidos.length ? { p: puntos, perdidos } : { p: puntos } }
  for (const k of derivadosDe(out, clave)) if (k !== clave) delete out[k]
  return out
}

/**
 * El fotograma `clave` y todos los que salieron de él, directa o indirectamente
 * (siguiendo `desde`), hacia delante y hacia atrás.
 */
export function derivadosDe(pista: Pista, clave: number): Set<number> {
  const fuera = new Set<number>([clave])
  let otro = true
  while (otro) {
    otro = false
    for (const k of Object.keys(pista).map(Number)) {
      const d = pista[k].desde
      if (k !== clave && !fuera.has(k) && d != null && fuera.has(d)) { fuera.add(k); otro = true }
    }
  }
  return fuera
}

/** Quita lo que puso el entrenador en `clave` y todo lo que el seguimiento sacó de ahí. Lo demás se queda. */
export function deshacerDesde(pista: Pista, clave: number): Pista {
  if (!pista[clave]) return pista
  const out: Pista = { ...pista }
  for (const k of derivadosDe(pista, clave)) delete out[k]
  return out
}

/**
 * Un paso del seguimiento para un trazo: del fotograma `desde` al `hasta`.
 * `buscar` dice dónde está ahora cada punto (null si no lo encuentra). Un punto
 * ya perdido no se busca: se queda donde estaba, perdido, hasta que el
 * entrenador lo arrastre; los demás siguen, para que al corregirlo estén en su
 * sitio. null si no hay desde dónde seguir o si ese fotograma ya se sabe.
 */
export function pasoDePista(
  pista: Pista, desde: number, hasta: number, buscar: (j: number, q: Punto) => Punto | null,
): { pista: Pista; nuevosPerdidos: number } | null {
  const fuente = pista[desde]
  if (!fuente || pista[hasta]) return null
  const ya = new Set(fuente.perdidos ?? [])
  const p: Punto[] = []
  const perdidos: number[] = []
  let nuevosPerdidos = 0
  fuente.p.forEach((q, j) => {
    const r = ya.has(j) ? null : buscar(j, q)
    if (r) { p.push(r); return }
    p.push(q)
    perdidos.push(j)
    if (!ya.has(j)) nuevosPerdidos++
  })
  return { pista: { ...pista, [hasta]: { p, desde, ...(perdidos.length ? { perdidos } : {}) } }, nuevosPerdidos }
}

/**
 * Mueve el punto `i` de un trazo en un fotograma: si se sigue, corrige su
 * pista (y ese punto deja de estar perdido); si no, el trazo entero.
 */
export function moverPunto(t: TrazoVivo, clave: number, i: number, p: Punto): TrazoVivo {
  if (!t.pista) return { ...t, puntos: t.puntos.map((q, j) => (j === i ? p : q)) }
  const ahora = enFotograma(t.pista, clave)
  const puntos = (ahora?.p ?? t.puntos).map((q, j) => (j === i ? p : q))
  return { ...t, pista: corregir(t.pista, clave, puntos, (ahora?.perdidos ?? []).filter(j => j !== i)) }
}

/** Empieza a seguir un trazo desde este fotograma, donde está ahora. */
export const empezarPista = (t: TrazoVivo, clave: number): TrazoVivo =>
  t.pista || !seSigue(t.tipo) ? t : { ...t, pista: { [clave]: { p: t.puntos } } }

/** Un valor por fotograma, en orden, sin los fotogramas con algún punto perdido. */
export function serieDe(pista: Pista, valor: (p: Punto[]) => number | null): { clave: number; valor: number }[] {
  const out: { clave: number; valor: number }[] = []
  for (const k of claves(pista)) {
    if (pista[k].perdidos?.length) continue
    const v = valor(pista[k].p)
    if (v != null && Number.isFinite(v)) out.push({ clave: k, valor: v })
  }
  return out
}

/** El mínimo y el máximo de una serie; con empates, el primero. */
export function extremosDe(serie: { clave: number; valor: number }[]) {
  if (!serie.length) return null
  let min = serie[0], max = serie[0]
  for (const s of serie) {
    if (s.valor < min.valor) min = s
    if (s.valor > max.valor) max = s
  }
  return { min, max }
}
