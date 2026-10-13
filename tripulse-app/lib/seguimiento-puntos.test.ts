import { describe, it, expect } from 'vitest'
import {
  aGris, avanzar, buscarPlantilla, RENOVAR_POR_DEBAJO, seguidoBien, seguirPunto, tomarPlantilla, type Gris,
} from './seguimiento-puntos'

/* Una imagen de prueba: manchas de luz de tamaños y sitios al azar (con semilla,
   para que salga siempre la misma). Sin patrón que se repita, que haría que el
   punto encajara en dos sitios a la vez. Se puede desplazar por debajo del
   píxel y girar alrededor de un punto, que es como se mueve una rodilla. */
function azar(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Mancha { x: number; y: number; s: number; a: number }

function manchas(w: number, h: number, cuantas: number, semilla: number): Mancha[] {
  const r = azar(semilla)
  return Array.from({ length: cuantas }, () => ({ x: r() * w, y: r() * h, s: 2 + r() * 5, a: (r() - 0.5) * 160 }))
}

interface Mov { dx?: number; dy?: number; giro?: number; cx?: number; cy?: number; brillo?: number; suma?: number }

/** Los valores de gris, sin pasar todavía a imagen: para poder retocarlos. */
function valores(w: number, h: number, ms: Mancha[], m: Mov = {}): Float32Array {
  const { dx = 0, dy = 0, giro = 0, cx = w / 2, cy = h / 2, brillo = 1, suma = 0 } = m
  const c = Math.cos(giro), s = Math.sin(giro)
  const v = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xr = c * (x - cx) + s * (y - cy) + cx, yr = -s * (x - cx) + c * (y - cy) + cy
      let p = 128
      for (const k of ms) {
        const ex = xr - dx - k.x, ey = yr - dy - k.y
        p += k.a * Math.exp(-(ex * ex + ey * ey) / (2 * k.s * k.s))
      }
      v[y * w + x] = p * brillo + suma
    }
  }
  return v
}

function aImagen(v: Float32Array, w: number, h: number): Gris {
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < v.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v[i]
    rgba[i * 4 + 3] = 255
  }
  return aGris(rgba, w, h)
}

const imagen = (w: number, h: number, ms: Mancha[], m: Mov = {}) => aImagen(valores(w, h, ms, m), w, h)

const M = manchas(120, 120, 140, 7)

describe('seguir un punto de un fotograma al siguiente', () => {
  it('encuentra el punto movido unos píxeles, por debajo del píxel', () => {
    const a = imagen(120, 120, M)
    const b = imagen(120, 120, M, { dx: 4.4, dy: -2.7 })
    const s = seguirPunto(a, b, 60, 60)!
    expect(Math.hypot(s.x - 64.4, s.y - 57.3)).toBeLessThan(0.3)
    expect(s.confianza).toBeGreaterThan(0.95)
    expect(seguidoBien(s)).toBe(true)
  })

  it('el punto que no se ha movido se queda donde está', () => {
    const a = imagen(120, 120, M)
    const s = seguirPunto(a, a, 50.3, 70.6)!
    expect(Math.hypot(s.x - 50.3, s.y - 70.6)).toBeLessThan(0.1)
    expect(s.confianza).toBeCloseTo(1, 5)
  })

  it('no le afecta que el fotograma esté más claro o con más contraste', () => {
    const a = imagen(120, 120, M)
    const b = imagen(120, 120, M, { dx: 3, dy: 2, brillo: 0.8, suma: 30 })
    const s = seguirPunto(a, b, 60, 60)!
    expect(Math.hypot(s.x - 63, s.y - 62)).toBeLessThan(0.3)
    expect(s.confianza).toBeGreaterThan(0.95)
  })

  it('sobre una zona lisa no hay nada que seguir', () => {
    const liso = imagen(120, 120, [])
    expect(tomarPlantilla(liso, 60, 60)).toBeNull()
    expect(seguirPunto(liso, liso, 60, 60)).toBeNull()
  })

  it('pegado al borde de la imagen no se puede coger el recorte', () => {
    const a = imagen(120, 120, M)
    expect(tomarPlantilla(a, 5, 60)).toBeNull()
    expect(tomarPlantilla(a, 60, 115)).toBeNull()
    expect(tomarPlantilla(a, NaN, 60)).toBeNull()
  })

  it('si se mueve más que el margen de búsqueda, no lo da por bueno', () => {
    const a = imagen(120, 120, M)
    const b = imagen(120, 120, M, { dx: 30 })
    expect(seguidoBien(seguirPunto(a, b, 45, 60, { radioBusqueda: 12 }))).toBe(false)
  })

  it('cerca del borde, con la zona de búsqueda recortada, también lo encuentra', () => {
    const a = imagen(120, 120, M)
    const b = imagen(120, 120, M, { dx: -2.5, dy: 1.5 })
    const s = seguirPunto(a, b, 13, 106)!
    expect(Math.hypot(s.x - 10.5, s.y - 107.5)).toBeLessThan(0.3)
  })

  it('el gris de un fotograma puede ir en la memoria de otro que ya no hace falta', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(200)
    const destino = new Float32Array(16)
    expect(aGris(rgba, 4, 4, destino).v).toBe(destino)
    expect(destino[5]).toBeCloseTo(200, 3)
    expect(aGris(rgba, 4, 4, new Float32Array(3)).v).toHaveLength(16)
  })

  it('el recorte cogido entre dos píxeles sigue al punto, no al píxel', () => {
    const a = imagen(120, 120, M)
    const pl = tomarPlantilla(a, 60.4, 59.6)!
    const s = buscarPlantilla(imagen(120, 120, M, { dx: 2, dy: 3 }), pl, 60.4, 59.6)!
    expect(Math.hypot(s.x - 62.4, s.y - 62.6)).toBeLessThan(0.3)
  })
})

describe('seguir a lo largo del vídeo', () => {
  it('veinte fotogramas moviéndose, sin irse deslizando', () => {
    let antes = imagen(140, 140, M)
    let s = { x: 50, y: 50, plantilla: tomarPlantilla(antes, 50, 50)! }
    for (let f = 1; f <= 20; f++) {
      const g = imagen(140, 140, M, { dx: 1.7 * f, dy: 0.9 * f })
      const r = avanzar(antes, g, s)
      expect(r.bien).toBe(true)
      s = r.s
      antes = g
    }
    expect(Math.hypot(s.x - (50 + 34), s.y - (50 + 18))).toBeLessThan(0.6)
  })

  it('una pierna que gira poco a poco: sigue a la rodilla', () => {
    /* 3° por fotograma alrededor de la cadera (40, 40); la rodilla en (70, 70). */
    let antes = imagen(140, 140, M, { cx: 40, cy: 40 })
    let s = { x: 70, y: 70, plantilla: tomarPlantilla(antes, 70, 70)! }
    for (let f = 1; f <= 8; f++) {
      const g = imagen(140, 140, M, { giro: (3 * f * Math.PI) / 180, cx: 40, cy: 40 })
      const r = avanzar(antes, g, s)
      expect(r.bien).toBe(true)
      s = r.s
      antes = g
    }
    /* La imagen gira 24°: la rodilla ha dado un arco alrededor de la cadera. */
    const a = (24 * Math.PI) / 180
    const esperado = { x: 40 + Math.cos(a) * 30 - Math.sin(a) * 30, y: 40 + Math.sin(a) * 30 + Math.cos(a) * 30 }
    expect(Math.hypot(s.x - esperado.x, s.y - esperado.y)).toBeLessThan(1.5)
  })

  it('mientras se parece, se busca con la misma plantilla; cuando no, se coge otra', () => {
    const a = imagen(120, 120, M)
    const pl = tomarPlantilla(a, 60, 60)!
    const quieto = avanzar(a, imagen(120, 120, M, { dx: 2, dy: 1 }), { x: 60, y: 60, plantilla: pl })
    expect(quieto.bien).toBe(true)
    expect(quieto.s.plantilla).toBe(pl)

    /* Le cae una sombra encima: la sigue, pero ya no se parece tanto y la renueva. */
    const v = valores(120, 120, M, { dx: 1, dy: 1 })
    for (let y = 0; y < 120; y++) {
      for (let x = 0; x < 120; x++) v[y * 120 + x] -= 100 * Math.exp(-((x - 64) ** 2 + (y - 57) ** 2) / (2 * 5 ** 2))
    }
    const sombra = avanzar(a, aImagen(v, 120, 120), { x: 60, y: 60, plantilla: pl })
    expect(sombra.bien).toBe(true)
    expect(sombra.confianza!).toBeLessThan(RENOVAR_POR_DEBAJO)
    expect(sombra.s.plantilla).not.toBe(pl)
    expect(Math.hypot(sombra.s.x - 61, sombra.s.y - 61)).toBeLessThan(1)
  })

  it('dos sitios parecidos y el bueno se tapa: la confianza no se entera, la vuelta sí', () => {
    /* Una pegatina en (40, 60) y otra casi igual a 22 píxeles (la otra rodilla). */
    const w = 120, h = 120
    const v = valores(w, h, M)
    for (let y = 48; y <= 72; y++) {
      for (let x = 28; x <= 52; x++) v[y * w + x + 22] = v[y * w + x] + (Math.hypot(x - 44, y - 56) < 3 ? 25 : 0)
    }
    const a = aImagen(v, w, h)
    /* En el fotograma siguiente algo liso tapa la buena. */
    const tapada = Float32Array.from(v)
    for (let y = 48; y <= 72; y++) for (let x = 28; x <= 52; x++) tapada[y * w + x] = 128
    const b = aImagen(tapada, w, h)

    const pl = tomarPlantilla(a, 40, 60)!
    const ida = buscarPlantilla(b, pl, 40, 60, 24)!
    expect(seguidoBien(ida)).toBe(true)
    expect(ida.confianza).toBeGreaterThan(RENOVAR_POR_DEBAJO)
    expect(ida.x).toBeGreaterThan(55)

    const r = avanzar(a, b, { x: 40, y: 60, plantilla: pl }, { radioBusqueda: 24 })
    expect(r.bien).toBe(false)
  })

  it('el punto perdido se queda donde estaba', () => {
    const a = imagen(120, 120, M)
    const pl = tomarPlantilla(a, 60, 60)!
    const r = avanzar(a, imagen(120, 120, M, { dx: 40 }), { x: 60, y: 60, plantilla: pl })
    expect(r.bien).toBe(false)
    expect(r.s).toEqual({ x: 60, y: 60, plantilla: pl })
  })
})
