// ============================================================
// El zoom del visor y la rueda del ratón
// ============================================================
//
// Pedido el 22-10-2026: «dar la posibilidad de hacer zoom en un vídeo para ver
// de cerca, y que con la rueda del ratón se puedan mover fotogramas». Como en
// Kinovea: la rueda pasa fotogramas (hacia abajo, adelante) y Ctrl + rueda
// acerca o aleja alrededor de donde apuntas. El pellizco del panel táctil llega
// al navegador como Ctrl + rueda, así que también vale; en el móvil, se
// pellizca con dos dedos.
//
// La caja del vídeo no cambia de tamaño: lo de dentro (el vídeo y el dibujo) se
// escala y se desplaza, y siempre cubre la caja: no se puede alejar más allá del
// vídeo entero ni dejar un borde vacío. Todo en píxeles de la caja.

import type { Punto } from './geometria-fotograma'

/** z: cuántas veces más grande; x, y: dónde queda la esquina de arriba a la izquierda del vídeo. */
export interface Zoom { z: number; x: number; y: number }

export const SIN_ZOOM: Zoom = { z: 1, x: 0, y: 0 }
export const ZOOM_MAX = 8
/** Con Ctrl + rueda, cuánto acerca cada píxel de giro: una muesca (100) es un 22 % más. */
const SENSIBILIDAD = 0.002
/** Píxeles de rueda por fotograma: una muesca de ratón son 100 (en algunos, 120). */
export const RUEDA_POR_FOTOGRAMA = 100

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Que el vídeo cubra siempre la caja: ni más pequeño que ella ni con un borde vacío. */
export function encajar(zm: Zoom, w: number, h: number): Zoom {
  const z = limitar(zm.z, 1, ZOOM_MAX)
  return { z, x: limitar(zm.x, w - w * z, 0), y: limitar(zm.y, h - h * z, 0) }
}

/** Acerca (factor mayor que 1) o aleja alrededor del punto (cx, cy) de la caja: lo que hay en ese punto no se mueve. */
export function zoomEn(zm: Zoom, factor: number, cx: number, cy: number, w: number, h: number): Zoom {
  const z = limitar(zm.z * factor, 1, ZOOM_MAX)
  const ux = (cx - zm.x) / zm.z, uy = (cy - zm.y) / zm.z
  return encajar({ z, x: cx - ux * z, y: cy - uy * z }, w, h)
}

/** El factor de un giro de rueda con Ctrl (y del pellizco del panel táctil, que llega igual). */
export const factorRueda = (deltaY: number) => Math.exp(-deltaY * SENSIBILIDAD)

/** Arrastrar: mueve lo que se ve, sin dejar bordes vacíos. */
export function desplazar(zm: Zoom, dx: number, dy: number, w: number, h: number): Zoom {
  return encajar({ ...zm, x: zm.x + dx, y: zm.y + dy }, w, h)
}

/** Pellizcar con dos dedos: el zoom sigue a la separación de los dedos, y lo que había entre ellos, a su centro. */
export function pellizco(inicio: { zoom: Zoom; a: Punto; b: Punto }, a: Punto, b: Punto, w: number, h: number): Zoom {
  const d0 = Math.hypot(inicio.b.x - inicio.a.x, inicio.b.y - inicio.a.y) || 1
  const d1 = Math.hypot(b.x - a.x, b.y - a.y)
  const m0 = { x: (inicio.a.x + inicio.b.x) / 2, y: (inicio.a.y + inicio.b.y) / 2 }
  const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const z = limitar(inicio.zoom.z * d1 / d0, 1, ZOOM_MAX)
  const ux = (m0.x - inicio.zoom.x) / inicio.zoom.z, uy = (m0.y - inicio.zoom.y) / inicio.zoom.z
  return encajar({ z, x: m1.x - ux * z, y: m1.y - uy * z }, w, h)
}

/**
 * Cuántos fotogramas mueve un giro de rueda: uno por muesca, hacia abajo
 * adelante; si el ratón manda varias muescas juntas (un giro rápido), varios.
 * Lo que no llega a una muesca (el panel táctil manda giros pequeños) se va
 * sumando en `resto`. En líneas o páginas (otros navegadores), uno por giro.
 */
export function pasosRueda(acumulado: number, deltaY: number, deltaMode: number): { pasos: number; resto: number } {
  if (deltaMode !== 0) return { pasos: Math.sign(deltaY), resto: 0 }
  const total = acumulado + deltaY
  if (Math.abs(total) < RUEDA_POR_FOTOGRAMA) return { pasos: 0, resto: total }
  return { pasos: Math.sign(total) * Math.max(1, Math.round(Math.abs(total) / RUEDA_POR_FOTOGRAMA)), resto: 0 }
}
