// ============================================================
// Corregir el esqueleto: el punto arrastrado se sigue solo
// ============================================================
//
// Pedido el 17-10-2026 (maqueta v3 del analizador): si el detector se equivoca
// en 40 fotogramas seguidos, no puede ser corregirlos uno a uno. El entrenador
// arrastra el punto UNA vez y, desde ahí, el seguimiento de imagen (el mismo de
// los trazos, lib/seguimiento-puntos) lo lleva hacia delante y hacia atrás.
//
// CADA PUNTO CORREGIDO LLEVA SU PISTA, como un trazo (lib/pista-trazos): el
// fotograma que puso el entrenador no sale de ninguno, y cada uno de los
// seguidos sabe de cuál salió. Así «deshacer» quita exactamente lo que salió de
// esa corrección, y corregir encima de un tramo seguido borra solo lo que se
// siguió a partir de ahí.
//
// FUERA DE LO CORREGIDO MANDA LA APP: donde un punto no tiene pista, vale lo que
// vio el detector (no se queda quieto, como un trazo).
//
// CUÁNDO SE PARA el seguimiento (propagar):
// - al perderse el punto (el seguimiento lo dice; el vídeo se para ahí para que
//   se corrija otra vez);
// - cuando la app y el seguimiento vuelven a coincidir unos fotogramas seguidos:
//   el detector ya ve bien ese punto y seguir llevándolo a mano solo metería el
//   poco error de cada paso;
// - al llegar a otro fotograma que ya tiene pista (otra corrección): lo de ahí
//   ya estaba bien;
// - al final o al principio del vídeo, o si el entrenador lo para.
//
// Aquí no hay imágenes: quién sigue el punto en el vídeo lo pone el visor
// (components/movimiento/Analizador), y esto decide qué hacer con cada paso.

import type { Punto } from './geometria-fotograma'
import { VISIBLE_MINIMO, type Ajustes, type PuntoCuerpo } from './cuerpo'
import { corregir, deshacerDesde, derivadosDe, type Pista } from './pista-trazos'

/** La pista de cada punto corregido: índice de MediaPipe → dónde va en cada fotograma. */
export type PistasCuerpo = Record<number, Pista>

/** Fotogramas seguidos en que tienen que coincidir la app y el seguimiento para devolverle el punto a la app. */
export const COINCIDE_SEGUIDOS = 3

/** Lo que pueden separarse para contar como que coinciden, en proporción al lado mayor del fotograma. */
export const COINCIDE_PROPORCION = 0.015

/** Lo que va encima del detector en cada fotograma: solo donde el punto tiene sitio propio. */
export function ajustesDe(pistas: PistasCuerpo): Record<number, Ajustes> {
  const out: Record<number, Ajustes> = {}
  for (const [punto, pista] of Object.entries(pistas)) {
    for (const [k, e] of Object.entries(pista)) {
      const p = e.p[0]
      if (!p) continue
      const clave = Number(k)
      out[clave] = { ...out[clave], [Number(punto)]: p }
    }
  }
  return out
}

/** El entrenador pone el punto en un fotograma: lo que se siguió a partir de ahí se borra. */
export function corregirPunto(pistas: PistasCuerpo, punto: number, clave: number, p: Punto): PistasCuerpo {
  return { ...pistas, [punto]: corregir(pistas[punto] ?? {}, clave, [p]) }
}

/** Quita una corrección y lo que se siguió de ella. Si el punto se queda sin nada, deja de tener pista. */
export function deshacerCorreccion(pistas: PistasCuerpo, punto: number, clave: number): PistasCuerpo {
  const pista = pistas[punto]
  if (!pista) return pistas
  const queda = deshacerDesde(pista, clave)
  const out = { ...pistas }
  if (Object.keys(queda).length) out[punto] = queda
  else delete out[punto]
  return out
}

/** Una corrección: dónde la puso el entrenador y qué tramo salió de ella. */
export interface Correccion {
  punto: number
  fotograma: number
  desde: number
  hasta: number
}

/** Las correcciones de todos los puntos, por orden de fotograma. */
export function correccionesDe(pistas: PistasCuerpo): Correccion[] {
  const out: Correccion[] = []
  for (const [punto, pista] of Object.entries(pistas)) {
    for (const k of Object.keys(pista).map(Number)) {
      if (pista[k].desde != null) continue
      const tramo = [...derivadosDe(pista, k)]
      out.push({ punto: Number(punto), fotograma: k, desde: Math.min(...tramo), hasta: Math.max(...tramo) })
    }
  }
  return out.sort((a, b) => a.fotograma - b.fotograma || a.punto - b.punto)
}

/** Lo seguido en un fotograma: dónde quedó el punto y de qué fotograma salió. */
export interface Puesto {
  clave: number
  p: Punto
  desde: number
}

/** Añade a la pista de un punto lo seguido. No pisa lo que ya tuviera sitio. */
export function conPuestos(pistas: PistasCuerpo, punto: number, puestos: Puesto[]): PistasCuerpo {
  if (!puestos.length) return pistas
  const pista: Pista = { ...(pistas[punto] ?? {}) }
  for (const s of puestos) if (!pista[s.clave]) pista[s.clave] = { p: [s.p], desde: s.desde }
  return { ...pistas, [punto]: pista }
}

export type FinSeguir = 'perdido' | 'coincide' | 'ocupado' | 'borde' | 'parado'

export interface OpcionesPropagar {
  /** El fotograma corregido, del que se sale. */
  inicio: number
  /** Hacia delante (1) o hacia atrás (−1). */
  paso: 1 | -1
  primero: number
  ultimo: number
  /** Si ese fotograma ya tiene sitio para el punto (otra corrección o su tramo). */
  ocupado: (clave: number) => boolean
  /** Dónde está ahora el punto en ese fotograma, siguiéndolo desde el anterior; null si se ha perdido. */
  seguir: (clave: number) => Promise<Punto | null>
  /** Lo que vio el detector de ese punto en ese fotograma. */
  detectado: (clave: number) => PuntoCuerpo | undefined
  /** Lo que pueden separarse para contar como que coinciden, en píxeles del fotograma. */
  tolerancia: number
  parar: () => boolean
}

/**
 * Lleva el punto fotograma a fotograma en un sentido hasta que toque parar
 * (arriba, cuándo). `en`: el fotograma donde se perdió o con el que se topó;
 * en los demás casos, el último seguido.
 */
export async function propagar(o: OpcionesPropagar): Promise<{ puestos: Puesto[]; fin: FinSeguir; en: number }> {
  const puestos: Puesto[] = []
  let iguales = 0
  let k = o.inicio
  for (;;) {
    const sig = k + o.paso
    if (sig < o.primero || sig > o.ultimo) return { puestos, fin: 'borde', en: k }
    if (o.parar()) return { puestos, fin: 'parado', en: k }
    if (o.ocupado(sig)) return { puestos, fin: 'ocupado', en: sig }
    const p = await o.seguir(sig)
    if (!p) return { puestos, fin: 'perdido', en: sig }
    puestos.push({ clave: sig, p, desde: k })
    const d = o.detectado(sig)
    iguales = d && d.v >= VISIBLE_MINIMO && Math.hypot(d.x - p.x, d.y - p.y) <= o.tolerancia ? iguales + 1 : 0
    if (iguales >= COINCIDE_SEGUIDOS) return { puestos, fin: 'coincide', en: sig }
    k = sig
  }
}
