// ============================================================
// Geometría sobre un fotograma
// ============================================================
//
// Las medidas del analizador de vídeo: el ángulo en un vértice, cuánto se
// separa una línea de la vertical o de la horizontal, y una distancia contada
// en palmas del propio deportista. Todo en coordenadas de la IMAGEN: x hacia la
// derecha, y hacia ABAJO, en píxeles del fotograma (no de la pantalla, que
// cambia con el zum).
//
// Es geometría plana a propósito. Una cámara mide bien el plano sagital (de
// perfil) y mal el frontal (de frente): ver Motricidad en la biblioteca. Por eso
// estas cuentas no deciden nada; ayudan a ver y dejan el número escrito.

export interface Punto { x: number; y: number }

const GRADOS = 180 / Math.PI

const valido = (...ps: Punto[]) => ps.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))

/** El ángulo en el vértice `v` entre las rectas v→a y v→b, de 0 a 180°. */
export function anguloEnVertice(a: Punto, v: Punto, b: Punto): number | null {
  if (!valido(a, v, b)) return null
  const ax = a.x - v.x, ay = a.y - v.y, bx = b.x - v.x, by = b.y - v.y
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by)
  if (!la || !lb) return null
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)))
  return Math.acos(cos) * GRADOS
}

/*
 * EL SUELO. Si el móvil no estaba recto, la vertical de la imagen no es la del
 * mundo, y todo lo que se mide «frente a la vertical» o «a la horizontal» sale
 * torcido lo mismo que el móvil. Por eso esas medidas aceptan la inclinación del
 * suelo (en radianes; 0 = móvil recto) y se miden con el suelo como horizontal.
 */

/** Lo inclinada que está una recta (el suelo) frente a la horizontal de la imagen, en radianes, entre -90° y 90°. */
export function inclinacionDe(a: Punto, b: Punto): number {
  if (!valido(a, b) || (a.x === b.x && a.y === b.y)) return 0
  let t = Math.atan2(b.y - a.y, b.x - a.x)
  if (t > Math.PI / 2) t -= Math.PI
  if (t <= -Math.PI / 2) t += Math.PI
  return t
}

/** Un desplazamiento visto con el suelo como horizontal: se gira lo que esté inclinado el suelo. */
export function enEjesDelSuelo(dx: number, dy: number, inclinacion = 0): Punto {
  const c = Math.cos(inclinacion), s = Math.sin(inclinacion)
  return { x: dx * c + dy * s, y: -dx * s + dy * c }
}

/** Lo que se separa la recta p–q de la vertical (la del suelo, si se da su inclinación), de 0 a 90°. */
export function frenteAVertical(p: Punto, q: Punto, inclinacion = 0): number | null {
  if (!valido(p, q)) return null
  const d = enEjesDelSuelo(q.x - p.x, q.y - p.y, inclinacion)
  const dx = Math.abs(d.x), dy = Math.abs(d.y)
  if (!dx && !dy) return null
  return Math.atan2(dx, dy) * GRADOS
}

/** Lo que se separa la recta p–q de la horizontal (la del suelo, si se da su inclinación), de 0 a 90°. */
export function frenteAHorizontal(p: Punto, q: Punto, inclinacion = 0): number | null {
  const v = frenteAVertical(p, q, inclinacion)
  return v == null ? null : 90 - v
}

/**
 * La distancia p–q en palmas: la palma se mide en el mismo fotograma (del
 * pliegue de la muñeca a la punta del dedo corazón), así que no hace falta
 * saber a cuántos metros estaba la cámara.
 */
export function enPalmas(p: Punto, q: Punto, palmaA: Punto, palmaB: Punto): number | null {
  if (!valido(p, q, palmaA, palmaB)) return null
  const palma = Math.hypot(palmaB.x - palmaA.x, palmaB.y - palmaA.y)
  if (!palma) return null
  return Math.hypot(q.x - p.x, q.y - p.y) / palma
}

/**
 * Cuánto se aparta el punto p de la recta a–b, en píxeles. Con signo: los puntos
 * del mismo lado de la recta dan el mismo signo, así que comparando con un punto
 * de referencia (la línea media del cuerpo) se sabe si la rodilla se va hacia
 * dentro o hacia fuera, aunque la recta no sea vertical.
 */
export function desvioDeLinea(a: Punto, b: Punto, p: Punto): number | null {
  if (!valido(a, b, p)) return null
  const dx = b.x - a.x, dy = b.y - a.y
  const l = Math.hypot(dx, dy)
  if (!l) return null
  return ((p.x - a.x) * dy - (p.y - a.y) * dx) / l
}

/** Para enseñar: grados enteros. */
export const enGrados = (g: number | null): string => g == null ? '—' : Math.round(g) + '°'
