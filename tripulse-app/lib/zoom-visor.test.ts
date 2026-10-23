import { describe, it, expect } from 'vitest'
import { desplazar, encajar, factorRueda, pasosRueda, pellizco, SIN_ZOOM, zoomEn, ZOOM_MAX, type Zoom } from './zoom-visor'

const W = 400, H = 600
/** Qué punto del vídeo (sin zoom) se ve en (cx, cy) de la caja. */
const debajo = (zm: Zoom, cx: number, cy: number) => ({ x: (cx - zm.x) / zm.z, y: (cy - zm.y) / zm.z })

describe('el zoom del visor', () => {
  it('acercar deja quieto lo que hay bajo el ratón', () => {
    const z1 = zoomEn(SIN_ZOOM, 2, 100, 150, W, H)
    expect(z1.z).toBe(2)
    expect(debajo(z1, 100, 150)).toEqual({ x: 100, y: 150 })
    const z2 = zoomEn(z1, 1.5, 300, 420, W, H)
    const antes = debajo(z1, 300, 420), ahora = debajo(z2, 300, 420)
    expect(ahora.x).toBeCloseTo(antes.x)
    expect(ahora.y).toBeCloseTo(antes.y)
  })

  it('nunca deja un borde vacío ni aleja más allá del vídeo entero', () => {
    expect(encajar({ z: 0.5, x: 30, y: -10 }, W, H)).toEqual(SIN_ZOOM)
    expect(encajar({ z: 2, x: 50, y: -2000 }, W, H)).toEqual({ z: 2, x: 0, y: -600 })
    const cerca = zoomEn(SIN_ZOOM, 3, 0, 0, W, H)
    expect(zoomEn(cerca, 0.01, 200, 300, W, H)).toEqual(SIN_ZOOM)
    expect(zoomEn(SIN_ZOOM, 100, 200, 300, W, H).z).toBe(ZOOM_MAX)
  })

  it('arrastrar mueve lo que se ve, hasta el borde', () => {
    const z = zoomEn(SIN_ZOOM, 2, 200, 300, W, H)
    expect(desplazar(z, 50, 0, W, H).x).toBe(z.x + 50)
    expect(desplazar(z, 5000, 5000, W, H)).toEqual({ z: 2, x: 0, y: 0 })
    expect(desplazar(SIN_ZOOM, 80, 80, W, H)).toEqual(SIN_ZOOM)
  })

  it('pellizcar: el zoom sigue a los dedos, y lo que había entre ellos va con su centro', () => {
    const inicio = { zoom: SIN_ZOOM, a: { x: 150, y: 300 }, b: { x: 250, y: 300 } }
    const z = pellizco(inicio, { x: 100, y: 320 }, { x: 300, y: 320 }, W, H)
    expect(z.z).toBe(2)
    expect(debajo(z, 200, 320)).toEqual({ x: 200, y: 300 })
  })

  it('Ctrl + rueda hacia arriba acerca y hacia abajo aleja', () => {
    expect(factorRueda(-100)).toBeGreaterThan(1)
    expect(factorRueda(100)).toBeLessThan(1)
    expect(factorRueda(-100) * factorRueda(100)).toBeCloseTo(1)
  })
})

describe('la rueda pasa fotogramas', () => {
  it('una muesca, un fotograma: hacia abajo adelante, hacia arriba atrás', () => {
    expect(pasosRueda(0, 100, 0)).toEqual({ pasos: 1, resto: 0 })
    expect(pasosRueda(0, -100, 0)).toEqual({ pasos: -1, resto: 0 })
    expect(pasosRueda(0, 120, 0)).toEqual({ pasos: 1, resto: 0 })
  })

  it('un giro rápido mueve varios, y los giros pequeños se suman', () => {
    expect(pasosRueda(0, 300, 0).pasos).toBe(3)
    let r = { pasos: 0, resto: 0 }
    const pasos: number[] = []
    for (const d of [30, 30, 30, 30]) { r = pasosRueda(r.resto, d, 0); pasos.push(r.pasos) }
    expect(pasos).toEqual([0, 0, 0, 1])
  })

  it('en líneas (otros navegadores), uno por giro', () => {
    expect(pasosRueda(0, 3, 1)).toEqual({ pasos: 1, resto: 0 })
    expect(pasosRueda(40, -3, 1)).toEqual({ pasos: -1, resto: 0 })
  })
})
