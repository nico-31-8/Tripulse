// ============================================================
// Seguir un punto de un fotograma al siguiente
// ============================================================
//
// El seguimiento del analizador de vídeo, como el de Kinovea: el entrenador
// marca un punto (la rodilla) y, al pasar al fotograma siguiente, el punto busca
// su sitio comparando la imagen de alrededor. Sin inteligencia artificial:
// correlación normalizada de un recorte de la imagen («plantilla»).
//
// CÓMO: se toma un cuadrado de (2·radio+1) píxeles alrededor del punto y se
// busca, en un margen de ±radioBusqueda píxeles del fotograma siguiente, la
// posición donde la imagen se le parece más. «Parecerse» es la correlación
// normalizada (de −1 a 1): no le afecta que el fotograma esté algo más claro u
// oscuro. El máximo se afina por debajo del píxel con una parábola.
//
// LA PLANTILLA NO SE RENUEVA EN CADA FOTOGRAMA. Si se cogiera la del fotograma
// anterior cada vez, el error de cada paso se sumaría y el punto se iría
// deslizando. Se busca con la misma mientras se parezca, y solo se coge otra
// cuando ya no (la pierna ha girado): lo que hace Kinovea.
//
// CUÁNDO FALLA: sobre ropa lisa no hay nada que seguir (no hay plantilla); si el
// punto se mueve más deprisa que el margen, el máximo cae en el borde de la
// búsqueda. Y LA CONFIANZA SOLA NO BASTA: medido con imágenes que no tienen nada
// que ver, en una ventana de búsqueda casi siempre hay algún sitio que «se
// parece» 0,8 o 0,9. Por eso cada paso se comprueba también de vuelta (Kalal,
// 2010): desde donde ha caído se busca hacia atrás, y si no vuelve al punto de
// partida es que ha saltado a otra cosa (la otra rodilla, otra pegatina).
// Ni así se pilla todo, y el visor lo dice: el entrenador mira y corrige. Con
// una pegatina en la articulación va mucho mejor.
//
// Las imágenes van en gris. La media y la varianza de cada ventana salen de una
// imagen integral, en tiempo constante; se calcula solo para la zona de
// búsqueda, no para el fotograma entero: con un vídeo reproduciéndose son
// treinta fotogramas por segundo, y la del fotograma entero eran varios megas
// de memoria en cada uno para usar unos pocos cientos de píxeles.

export interface Gris {
  w: number
  h: number
  /** Luminancia de cada píxel, 0-255. */
  v: Float32Array
}

/**
 * De RGBA (lo que da un canvas) a gris. `destino` deja reutilizar la memoria
 * de un fotograma que ya no hace falta.
 */
export function aGris(rgba: ArrayLike<number>, w: number, h: number, destino?: Float32Array): Gris {
  const v = destino && destino.length === w * h ? destino : new Float32Array(w * h)
  for (let i = 0, j = 0; i < v.length; i++, j += 4) v[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]
  return { w, h, v }
}

/** La suma de la ventana [x0, x1) × [y0, y1) en una imagen integral de ancho W. */
const suma = (s: Float64Array, W: number, x0: number, y0: number, x1: number, y1: number) =>
  s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0]

/** Por debajo de esta varianza (desviación de 2 niveles de gris) el recorte es liso: no hay nada que seguir. */
const VARIANZA_MINIMA = 4

/** Por debajo de esto, el punto se da por perdido. */
export const CONFIANZA_MINIMA = 0.6

/**
 * Lo que puede no volver al sitio, en píxeles de la imagen con la que se sigue.
 * Medido: de un fotograma al siguiente con la pierna girando hasta 10°, la vuelta
 * cae a menos de 1 píxel; cuando ha saltado a otra cosa, casi siempre a varios.
 */
export const ERROR_IDA_VUELTA = 2

/** Por debajo de esto se coge una plantilla nueva: el punto se sigue, pero ya no se parece tanto. */
export const RENOVAR_POR_DEBAJO = 0.85

export interface OpcionesSeguir {
  /** Medio lado del recorte que se sigue. 10 = 21 × 21 píxeles. */
  radio?: number
  /** Cuánto puede moverse entre un fotograma y el siguiente. */
  radioBusqueda?: number
}

/** El recorte que se busca, sin su media. El punto está en su centro más (ox, oy). */
export interface Plantilla {
  lado: number
  T: Float32Array
  norma: number
  ox: number
  oy: number
}

export interface Seguido {
  x: number
  y: number
  /** La correlación del mejor sitio, de −1 a 1. */
  confianza: number
  /** El mejor sitio está en el límite de la búsqueda: se ha ido más lejos. */
  enBorde: boolean
}

/** El recorte alrededor de (x, y). null si es liso o si el punto está pegado al borde. */
export function tomarPlantilla(g: Gris, x: number, y: number, radio = 10): Plantilla | null {
  const h = radio
  const cx = Math.round(x), cy = Math.round(y)
  const lado = 2 * h + 1, n = lado * lado
  if (!Number.isFinite(x) || !Number.isFinite(y) || cx - h < 0 || cy - h < 0 || cx + h >= g.w || cy + h >= g.h) return null
  /* Sin su media: así su producto con cualquier ventana ya es la covarianza,
     sin restarle a la ventana la suya. */
  const T = new Float32Array(n)
  let media = 0
  for (let j = 0; j < lado; j++) {
    for (let i = 0; i < lado; i++) {
      const p = g.v[(cy - h + j) * g.w + (cx - h + i)]
      T[j * lado + i] = p
      media += p
    }
  }
  media /= n
  let cuadrados = 0
  for (let k = 0; k < n; k++) { T[k] -= media; cuadrados += T[k] * T[k] }
  if (cuadrados < VARIANZA_MINIMA * n) return null
  return { lado, T, norma: Math.sqrt(cuadrados), ox: x - cx, oy: y - cy }
}

/** Dónde está la plantilla en la imagen g, buscando alrededor de donde estaba el punto (x, y). */
export function buscarPlantilla(g: Gris, pl: Plantilla, x: number, y: number, radioBusqueda = 18): Seguido | null {
  const R = radioBusqueda
  const lado = pl.lado, h = (lado - 1) / 2, n = lado * lado
  const cx = Math.round(x - pl.ox), cy = Math.round(y - pl.oy)
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null

  /* La imagen integral de la zona de búsqueda (de v y de v²). */
  const zx = Math.max(0, cx - R - h), zy = Math.max(0, cy - R - h)
  const zw = Math.min(g.w, cx + R + h + 1) - zx, zh = Math.min(g.h, cy + R + h + 1) - zy
  if (zw < lado || zh < lado) return null
  const W = zw + 1
  const s = new Float64Array(W * (zh + 1)), s2 = new Float64Array(W * (zh + 1))
  for (let y = 0; y < zh; y++) {
    let fila = 0, fila2 = 0
    const base = (zy + y) * g.w + zx
    for (let x = 0; x < zw; x++) {
      const p = g.v[base + x]
      fila += p
      fila2 += p * p
      s[(y + 1) * W + x + 1] = s[y * W + x + 1] + fila
      s2[(y + 1) * W + x + 1] = s2[y * W + x + 1] + fila2
    }
  }

  const ancho = 2 * R + 1
  const mapa = new Float32Array(ancho * ancho).fill(NaN)
  let mejor = -Infinity, bx = cx, by = cy
  for (let dy = -R; dy <= R; dy++) {
    const sy = cy + dy
    if (sy - h < 0 || sy + h >= g.h) continue
    for (let dx = -R; dx <= R; dx++) {
      const sx = cx + dx
      if (sx - h < 0 || sx + h >= g.w) continue
      const x0 = sx - h, y0 = sy - h
      const sum = suma(s, W, x0 - zx, y0 - zy, x0 - zx + lado, y0 - zy + lado)
      const sum2 = suma(s2, W, x0 - zx, y0 - zy, x0 - zx + lado, y0 - zy + lado)
      const varianza = sum2 - (sum * sum) / n
      if (varianza < VARIANZA_MINIMA * n) continue
      let dot = 0
      for (let j = 0; j < lado; j++) {
        const fila = (y0 + j) * g.w + x0, ft = j * lado
        for (let i = 0; i < lado; i++) dot += pl.T[ft + i] * g.v[fila + i]
      }
      const c = dot / (pl.norma * Math.sqrt(varianza))
      mapa[(dy + R) * ancho + (dx + R)] = c
      if (c > mejor) { mejor = c; bx = sx; by = sy }
    }
  }
  if (!Number.isFinite(mejor)) return null

  /* Por debajo del píxel: el vértice de la parábola por el máximo y sus vecinos. */
  const ix = bx - cx, iy = by - cy
  const en = (dx: number, dy: number) =>
    Math.abs(dx) > R || Math.abs(dy) > R ? NaN : mapa[(dy + R) * ancho + (dx + R)]
  const afina = (menos: number, mas: number) => {
    if (!Number.isFinite(menos) || !Number.isFinite(mas)) return 0
    const den = menos - 2 * mejor + mas
    return den < 0 ? Math.max(-0.5, Math.min(0.5, (menos - mas) / (2 * den))) : 0
  }
  return {
    x: bx + afina(en(ix - 1, iy), en(ix + 1, iy)) + pl.ox,
    y: by + afina(en(ix, iy - 1), en(ix, iy + 1)) + pl.oy,
    confianza: mejor,
    enBorde: Math.abs(ix) === R || Math.abs(iy) === R,
  }
}

/** ¿Se puede dar por bueno? */
export const seguidoBien = (s: Seguido | null): s is Seguido => !!s && s.confianza >= CONFIANZA_MINIMA && !s.enBorde

/** Dónde está en la imagen b el punto (x, y) de la imagen a, con una plantilla recién cogida. */
export function seguirPunto(a: Gris, b: Gris, x: number, y: number, o: OpcionesSeguir = {}): Seguido | null {
  const pl = tomarPlantilla(a, x, y, o.radio)
  return pl ? buscarPlantilla(b, pl, x, y, o.radioBusqueda) : null
}

/** Un punto mientras se sigue: dónde está y con qué recorte se le busca. */
export interface PuntoSeguido {
  x: number
  y: number
  plantilla: Plantilla
}

/**
 * Un fotograma más: del fotograma `anterior` (donde el punto estaba en s) al
 * fotograma g. Si el punto se pierde, `bien` es false y el punto se queda donde
 * estaba: quien llama decide qué hacer.
 */
export function avanzar(anterior: Gris, g: Gris, s: PuntoSeguido, o: OpcionesSeguir = {}): { s: PuntoSeguido; bien: boolean; confianza: number | null } {
  const perdido = (confianza: number | null) => ({ s, bien: false, confianza })
  const r = buscarPlantilla(g, s.plantilla, s.x, s.y, o.radioBusqueda)
  const confianza = r?.confianza ?? null
  if (!seguidoBien(r)) return perdido(confianza)
  /* La vuelta: lo que hay ahora donde ha caído, buscado en el fotograma de antes. */
  const aqui = tomarPlantilla(g, r.x, r.y, (s.plantilla.lado - 1) / 2)
  const vuelta = aqui ? buscarPlantilla(anterior, aqui, r.x, r.y, o.radioBusqueda) : null
  if (!vuelta || Math.hypot(vuelta.x - s.x, vuelta.y - s.y) > ERROR_IDA_VUELTA) return perdido(r.confianza)
  const plantilla = r.confianza < RENOVAR_POR_DEBAJO ? aqui! : s.plantilla
  return { s: { x: r.x, y: r.y, plantilla }, bien: true, confianza: r.confianza }
}
