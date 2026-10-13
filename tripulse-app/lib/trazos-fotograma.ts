// ============================================================
// Los trazos del analizador de vídeo y lo que miden
// ============================================================
//
// Las herramientas del visor y su cuenta. Cada trazo es una lista de puntos en
// píxeles del fotograma; aquí se decide cuántos pide cada herramienta y qué
// medida sale de cada uno. La geometría, en lib/geometria-fotograma.
//
// LA PALMA ES LA REGLA. Se mide la palma del deportista en el mismo fotograma
// (del pliegue de la muñeca a la punta del dedo corazón) y las distancias salen
// en palmas: es la unidad de la movilidad de hombro del FMS y del Nine Test, y
// así no hace falta saber a cuántos metros estaba la cámara.
//
// EL SUELO ES EL NIVEL. Si el móvil no estaba recto, se marca el suelo (dos
// toques sobre su línea) y todo lo que se mide «frente a la vertical» o «a la
// horizontal» —las líneas, la plomada, la horizontal y el esqueleto— se mide
// contra él y no contra el borde de la imagen. Sin suelo, se da por recto.

import {
  anguloEnVertice, frenteAVertical, frenteAHorizontal, enPalmas, enGrados, inclinacionDe,
} from './geometria-fotograma'
import type { Medida, TipoTrazo, Trazo } from './movimiento-datos'

export type Herramienta = 'mover' | TipoTrazo

export const PUNTOS_POR_TRAZO: Record<TipoTrazo, number> = {
  linea: 2, angulo: 3, plomada: 1, horizontal: 1, palma: 2, distancia: 2, suelo: 2,
}

export const NOMBRE_HERRAMIENTA: Record<Herramienta, string> = {
  mover: 'mover', linea: 'línea', angulo: 'ángulo', plomada: 'plomada', horizontal: 'horizontal',
  palma: 'palma', distancia: 'distancia', suelo: 'suelo',
}

/** Las que valen una sola vez en el dibujo: marcar otra sustituye a la anterior. */
const UNICAS: TipoTrazo[] = ['palma', 'suelo']

/** La inclinación del suelo marcado, en radianes; 0 si no hay (se da el móvil por recto). */
export function inclinacionSuelo(trazos: Trazo[]): number {
  const s = trazos.find(t => t.tipo === 'suelo' && t.puntos.length === 2)
  return s ? inclinacionDe(s.puntos[0], s.puntos[1]) : 0
}

/** Qué hacer con cada toque, para la pista de debajo del vídeo. */
export const COMO_SE_USA: Record<Herramienta, string> = {
  mover: 'Arrastra un punto para corregirlo.',
  linea: 'Dos toques: un extremo y el otro. Dice cuánto se aparta de la vertical.',
  angulo: 'Tres toques: un extremo, el vértice y el otro extremo.',
  plomada: 'Un toque: una vertical por ese punto.',
  horizontal: 'Un toque: una horizontal por ese punto.',
  palma: 'Dos toques: del pliegue de la muñeca a la punta del dedo corazón. Es la regla para medir distancias.',
  distancia: 'Dos toques. Sale en palmas si has medido la palma.',
  suelo: 'Dos toques sobre la línea del suelo. Si el móvil no estaba recto, las verticales y horizontales se miden contra él.',
}

/** La palma y el suelo valen uno solo: marcar otro sustituye al anterior. */
export function anadirTrazo<T extends Trazo>(trazos: T[], nuevo: T): T[] {
  if (UNICAS.includes(nuevo.tipo)) return [...trazos.filter(t => t.tipo !== nuevo.tipo), nuevo]
  return [...trazos, nuevo]
}

const NOMBRE_MEDIDA: Partial<Record<TipoTrazo, string>> = { angulo: 'Ángulo', linea: 'Línea', distancia: 'Distancia' }

/** El nombre de lo que mide cada trazo («Ángulo 1», «Línea 2»), numerado por tipo; vacío si no mide. */
export function nombresDe(trazos: Trazo[]): string[] {
  const cuenta: Partial<Record<TipoTrazo, number>> = {}
  return trazos.map(t => {
    const base = NOMBRE_MEDIDA[t.tipo]
    if (!base || t.puntos.length < PUNTOS_POR_TRAZO[t.tipo]) return ''
    return base + ' ' + (cuenta[t.tipo] = (cuenta[t.tipo] || 0) + 1)
  })
}

const palmaDe = (trazos: Trazo[]) => trazos.find(t => t.tipo === 'palma' && t.puntos.length === 2)

/**
 * Lo que mide un trazo, en número: el ángulo en grados, la línea en grados
 * desde la vertical y la distancia en palmas (null sin palma). Es lo que sigue
 * la gráfica del vídeo.
 */
export function valorDe(t: Trazo, trazos: Trazo[]): number | null {
  if (t.puntos.length < PUNTOS_POR_TRAZO[t.tipo]) return null
  const [a, b, c] = t.puntos
  if (t.tipo === 'angulo') return anguloEnVertice(a, b, c)
  if (t.tipo === 'linea') return frenteAVertical(a, b, inclinacionSuelo(trazos))
  if (t.tipo === 'distancia') {
    const palma = palmaDe(trazos)
    return palma ? enPalmas(a, b, palma.puntos[0], palma.puntos[1]) : null
  }
  return null
}

/** Un valor de valorDe, para leer: «78°» o «1,4 palmas». */
export const textoValor = (tipo: TipoTrazo, v: number): string =>
  tipo === 'distancia' ? v.toFixed(1).replace('.', ',') + ' palmas' : Math.round(v) + '°'

/** Lo que ha recorrido a lo largo del vídeo, para guardarlo con las medidas. */
export function textoRecorrido(tipo: TipoTrazo, min: number, max: number): string {
  const r = 'de ' + textoValor(tipo, min).replace(' palmas', '') + ' a ' + textoValor(tipo, max)
  return tipo === 'linea' ? r + ' de la vertical' : r
}

/** Lo torcido que estaba el móvil, en grados enteros y sin signo, para enseñarlo. */
const torcido = (trazos: Trazo[]) => Math.round(Math.abs((inclinacionSuelo(trazos) * 180) / Math.PI))

/** Las medidas que se enseñan y se guardan, en el orden en que se dibujaron; y el suelo, si se marcó. */
export function medidasDe(trazos: Trazo[]): Medida[] {
  const nombres = nombresDe(trazos)
  const incl = inclinacionSuelo(trazos)
  const out: Medida[] = []
  trazos.forEach((t, i) => {
    if (!nombres[i]) return
    const [a, b] = t.puntos
    const v = valorDe(t, trazos)
    if (t.tipo === 'angulo') {
      out.push({ nombre: nombres[i], valor: enGrados(v) })
    } else if (t.tipo === 'linea') {
      out.push({ nombre: nombres[i], valor: enGrados(v) + ' de la vertical · ' + enGrados(frenteAHorizontal(a, b, incl)) + ' de la horizontal' })
    } else {
      out.push({ nombre: nombres[i], valor: v != null ? textoValor('distancia', v) : 'mide la palma para tenerla en palmas' })
    }
  })
  if (trazos.some(t => t.tipo === 'suelo' && t.puntos.length === 2)) {
    const g = torcido(trazos)
    out.push({ nombre: 'Suelo', valor: g ? `el móvil estaba torcido ${g}°: se mide contra el suelo` : 'el móvil estaba recto' })
  }
  return out
}

/** La etiqueta que se pinta junto a un trazo sobre el fotograma. */
export function etiquetaDe(t: Trazo, trazos: Trazo[]): string {
  const [a, b, c] = t.puntos
  if (t.puntos.length < PUNTOS_POR_TRAZO[t.tipo]) return ''
  if (t.tipo === 'angulo') return enGrados(anguloEnVertice(a, b, c))
  if (t.tipo === 'linea') return enGrados(frenteAVertical(a, b, inclinacionSuelo(trazos)))
  if (t.tipo === 'palma') return 'palma'
  if (t.tipo === 'suelo') { const g = torcido(trazos); return g ? `suelo · ${g}°` : 'suelo' }
  if (t.tipo === 'distancia') {
    const v = valorDe(t, trazos)
    return v != null ? textoValor('distancia', v) : ''
  }
  return t.tipo === 'plomada' ? 'plomada' : 'horizontal'
}
