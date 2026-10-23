import { describe, it, expect } from 'vitest'
import { alinear, fotogramaMasBajo } from './alinear-videos'
import { indice, type Cuerpo, type Parte } from './cuerpo'

/* Un movimiento inventado, grabado por dos cámaras. Cada repetición baja y sube
   en 100 fotogramas; `prof` es lo que baja cada una. La cámara A empieza en el
   instante 0; la B, `adelanto` fotogramas antes (su fotograma k + adelanto es el
   k de A). Cada cámara ve las alturas a su escala y con su ruido. */

function azar(semilla: number) {
  let s = semilla >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 - 0.5 }
}

const campana = (u: number) => (Math.abs(u) >= 50 ? 0 : 0.5 * (1 + Math.cos(Math.PI * u / 50)))

interface Escena {
  centros: number[]
  prof: number[]
  /** Cuánto baja cada parte al fondo de la repetición, en píxeles de la cámara A. */
  recorrido: Partial<Record<Parte, number>>
}

const SENTADILLA: Escena = {
  centros: [60, 180, 300], prof: [0.95, 1, 0.97],
  recorrido: { hombro: 110, cadera: 120, rodilla: 15, muneca: 100, tobillo: 0 },
}
const ALTURA_BASE: Record<Parte, number> = {
  oreja: 150, hombro: 200, codo: 150, muneca: 100, cadera: 300, rodilla: 380, tobillo: 460, talon: 470, puntera: 470,
}

function profundidad(e: Escena, t: number) {
  let d = 0
  e.centros.forEach((c, i) => { d = Math.max(d, e.prof[i] * campana(t - c)) })
  return d
}

/** Los esqueletos de una cámara: fotogramas 0..n-1, el k en el instante k - adelanto. */
function grabar(e: Escena, o: {
  n: number; adelanto?: number; escala?: number; desplaza?: number; ruido?: number; semilla?: number
  falta?: number; espejo?: boolean
}): Record<number, Cuerpo> {
  const r = azar(o.semilla ?? 1)
  const out: Record<number, Cuerpo> = {}
  for (let k = 0; k < o.n; k++) {
    if (o.falta && k % o.falta === 0) continue
    const d = profundidad(e, k - (o.adelanto ?? 0))
    const c: Cuerpo = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0 }))
    for (const p of Object.keys(ALTURA_BASE) as Parte[]) {
      const yA = ALTURA_BASE[p] + (e.recorrido[p] ?? 0) * d
      for (const l of ['i', 'd'] as const) {
        const ancho = (l === 'i' ? -1 : 1) * (o.espejo ? -1 : 1) * 30
        c[indice(p, l)] = {
          x: 200 + ancho,
          y: (o.desplaza ?? 0) + (o.escala ?? 1) * yA + (o.ruido ?? 1.5) * 2 * r(),
          v: 0.9,
        }
      }
    }
    out[k] = c
  }
  return out
}

describe('alinear dos vídeos de la misma prueba', () => {
  it('encuentra cuántos fotogramas va por delante el vídeo que empezó antes', () => {
    const a = grabar(SENTADILLA, { n: 360, falta: 17 })
    const b = grabar(SENTADILLA, { n: 400, adelanto: 41, escala: 0.7, desplaza: 40, semilla: 7, falta: 13 })
    const al = alinear(a, b)
    expect(al).not.toBeNull()
    expect(Math.abs(al!.desfase - 41)).toBeLessThanOrEqual(1)
    expect(al!.parecido).toBeGreaterThan(0.9)
  })

  it('y si empezó después, el desfase sale negativo', () => {
    const a = grabar(SENTADILLA, { n: 360 })
    const b = grabar(SENTADILLA, { n: 330, adelanto: -23, escala: 1.3, semilla: 3 })
    const al = alinear(a, b)
    expect(al).not.toBeNull()
    expect(Math.abs(al!.desfase + 23)).toBeLessThanOrEqual(1)
  })

  it('no se va una repetición entera aunque las tres sean iguales', () => {
    const iguales: Escena = { ...SENTADILLA, prof: [1, 1, 1] }
    const a = grabar(iguales, { n: 360 })
    const b = grabar(iguales, { n: 380, adelanto: 17, escala: 0.8, semilla: 5 })
    expect(Math.abs(alinear(a, b)!.desfase - 17)).toBeLessThanOrEqual(1)
  })

  it('da igual que una cámara vea la izquierda y la derecha cambiadas (desde atrás)', () => {
    const a = grabar(SENTADILLA, { n: 360 })
    const b = grabar(SENTADILLA, { n: 360, adelanto: 30, espejo: true, semilla: 9 })
    expect(Math.abs(alinear(a, b)!.desfase - 30)).toBeLessThanOrEqual(1)
  })

  it('con solo un brazo y una pierna moviéndose (la elevación diagonal) también', () => {
    const diagonal: Escena = { centros: [70, 200, 330], prof: [1, 0.9, 1], recorrido: { muneca: -60, tobillo: -45 } }
    const a = grabar(diagonal, { n: 400 })
    const b = grabar(diagonal, { n: 420, adelanto: 52, escala: 0.6, semilla: 11 })
    const al = alinear(a, b)
    expect(al).not.toBeNull()
    expect(Math.abs(al!.desfase - 52)).toBeLessThanOrEqual(1)
  })

  it('no alinea dos movimientos que no se parecen', () => {
    const a = grabar(SENTADILLA, { n: 360 })
    const otro: Escena = { centros: [40, 95, 150, 205, 260, 315], prof: [1, 0.3, 1, 0.3, 1, 0.3], recorrido: { cadera: 120, hombro: -80, muneca: 140, rodilla: -60 } }
    const b = grabar(otro, { n: 360, semilla: 2 })
    expect(alinear(a, b)).toBeNull()
    expect(alinear(a, grabar({ centros: [], prof: [], recorrido: {} }, { n: 360, ruido: 20 }))).toBeNull()
  })

  it('no alinea si se solapan menos de un segundo y medio', () => {
    const a = grabar(SENTADILLA, { n: 60 })
    const b = grabar(SENTADILLA, { n: 60, adelanto: -30 })
    expect(alinear(a, b)).toBeNull()
  })

  it('sin esqueletos, nada', () => {
    expect(alinear({}, {})).toBeNull()
  })
})

describe('el fotograma más bajo', () => {
  it('es el fondo de la repetición más cercana, aunque esté lejos', () => {
    const a = grabar(SENTADILLA, { n: 360, ruido: 0 })
    expect(fotogramaMasBajo(a, 160)).toBe(180)
    expect(fotogramaMasBajo(a, 290)).toBe(300)
    expect(fotogramaMasBajo(a, 0)).toBe(60)
    expect(fotogramaMasBajo(a, 125)).toBe(180)
  })
  it('con ruido, el fondo cae en su repetición', () => {
    const a = grabar(SENTADILLA, { n: 360, ruido: 1.5, semilla: 4 })
    expect(Math.abs(fotogramaMasBajo(a, 10)! - 60)).toBeLessThanOrEqual(3)
  })
  it('null donde no hay esqueleto', () => {
    expect(fotogramaMasBajo({}, 10)).toBeNull()
  })
})
