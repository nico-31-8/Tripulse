import { describe, it, expect } from 'vitest'
import {
  ajustesDe, conPuestos, correccionesDe, corregirPunto, deshacerCorreccion, propagar, COINCIDE_SEGUIDOS,
  type OpcionesPropagar, type PistasCuerpo,
} from './corregir-esqueleto'
import type { PuntoCuerpo } from './cuerpo'

const RODILLA = 26
const TOBILLO = 28

/** Un seguimiento de mentira: el punto avanza 2 px por fotograma y se pierde en los fotogramas que se digan. */
function opciones(o: Partial<OpcionesPropagar> & { pierdeEn?: number[]; detector?: Record<number, PuntoCuerpo> } = {}): OpcionesPropagar {
  const pierde = new Set(o.pierdeEn ?? [])
  return {
    inicio: 10, paso: 1, primero: 0, ultimo: 30,
    ocupado: () => false,
    seguir: async k => (pierde.has(k) ? null : { x: 100 + 2 * k, y: 200 }),
    detectado: k => o.detector?.[k],
    tolerancia: 10,
    parar: () => false,
    ...o,
  }
}

describe('propagar: hasta dónde se sigue un punto corregido', () => {
  it('hasta que se pierde: lo seguido se queda, y dice dónde se perdió', async () => {
    const r = await propagar(opciones({ pierdeEn: [14] }))
    expect(r.fin).toBe('perdido')
    expect(r.en).toBe(14)
    expect(r.puestos.map(p => p.clave)).toEqual([11, 12, 13])
    /* Cada fotograma sabe de cuál salió: así «deshacer» quita justo lo suyo. */
    expect(r.puestos.map(p => p.desde)).toEqual([10, 11, 12])
  })

  it('hacia atrás igual', async () => {
    const r = await propagar(opciones({ paso: -1, pierdeEn: [7] }))
    expect(r.puestos.map(p => p.clave)).toEqual([9, 8])
    expect(r.puestos.map(p => p.desde)).toEqual([10, 9])
    expect(r).toMatchObject({ fin: 'perdido', en: 7 })
  })

  it('cuando la app y el seguimiento vuelven a coincidir unos fotogramas seguidos, el punto vuelve a la app', async () => {
    const detector: Record<number, PuntoCuerpo> = {}
    for (let k = 13; k <= 30; k++) detector[k] = { x: 100 + 2 * k + 3, y: 202, v: 0.9 }
    const r = await propagar(opciones({ detector }))
    expect(r.fin).toBe('coincide')
    expect(r.en).toBe(12 + COINCIDE_SEGUIDOS)
  })

  it('un punto que la app ve mal no cuenta como coincidir, aunque caiga cerca', async () => {
    const detector: Record<number, PuntoCuerpo> = {}
    for (let k = 11; k <= 30; k++) detector[k] = { x: 100 + 2 * k, y: 200, v: 0.3 }
    expect((await propagar(opciones({ detector }))).fin).toBe('borde')
  })

  it('coincidir a ratos no basta: tienen que ser seguidos', async () => {
    const detector: Record<number, PuntoCuerpo> = {}
    for (let k = 11; k <= 30; k++) detector[k] = { x: 100 + 2 * k + (k % 3 === 0 ? 50 : 0), y: 200, v: 0.9 }
    expect((await propagar(opciones({ detector }))).fin).toBe('borde')
  })

  it('se para antes de otro fotograma que ya tenía sitio (otra corrección)', async () => {
    const r = await propagar(opciones({ ocupado: k => k === 13 }))
    expect(r).toMatchObject({ fin: 'ocupado', en: 13 })
    expect(r.puestos.map(p => p.clave)).toEqual([11, 12])
  })

  it('al final del vídeo, y si el entrenador lo para', async () => {
    const r = await propagar(opciones({ inicio: 27 }))
    expect(r).toMatchObject({ fin: 'borde', en: 30 })
    expect(r.puestos.map(p => p.clave)).toEqual([28, 29, 30])
    let n = 0
    const parado = await propagar(opciones({ parar: () => ++n > 2 }))
    expect(parado.fin).toBe('parado')
    expect(parado.puestos.map(p => p.clave)).toEqual([11, 12])
  })
})

describe('la pista de cada punto corregido', () => {
  const p = (x: number) => ({ x, y: 0 })

  it('lo seguido va encima del detector solo donde tiene sitio', () => {
    let ps: PistasCuerpo = corregirPunto({}, RODILLA, 10, p(50))
    ps = conPuestos(ps, RODILLA, [{ clave: 11, p: p(52), desde: 10 }, { clave: 9, p: p(48), desde: 10 }])
    expect(ajustesDe(ps)).toEqual({ 9: { [RODILLA]: p(48) }, 10: { [RODILLA]: p(50) }, 11: { [RODILLA]: p(52) } })
  })

  it('cada corrección, con el tramo que salió de ella', () => {
    let ps: PistasCuerpo = corregirPunto({}, RODILLA, 10, p(50))
    ps = conPuestos(ps, RODILLA, [{ clave: 11, p: p(52), desde: 10 }, { clave: 12, p: p(54), desde: 11 }, { clave: 9, p: p(48), desde: 10 }])
    ps = corregirPunto(ps, TOBILLO, 40, p(5))
    expect(correccionesDe(ps)).toEqual([
      { punto: RODILLA, fotograma: 10, desde: 9, hasta: 12 },
      { punto: TOBILLO, fotograma: 40, desde: 40, hasta: 40 },
    ])
  })

  it('corregir encima de un tramo seguido borra solo lo que se siguió a partir de ahí', () => {
    let ps: PistasCuerpo = corregirPunto({}, RODILLA, 10, p(50))
    ps = conPuestos(ps, RODILLA, [11, 12, 13, 14].map(k => ({ clave: k, p: p(40 + 2 * k), desde: k - 1 })))
    ps = corregirPunto(ps, RODILLA, 12, p(99))
    expect(Object.keys(ps[RODILLA]).map(Number)).toEqual([10, 11, 12])
    expect(correccionesDe(ps).map(c => c.fotograma)).toEqual([10, 12])
  })

  it('deshacer quita esa corrección y su tramo, y nada más', () => {
    let ps: PistasCuerpo = corregirPunto({}, RODILLA, 10, p(50))
    ps = conPuestos(ps, RODILLA, [{ clave: 11, p: p(52), desde: 10 }])
    ps = corregirPunto(ps, RODILLA, 30, p(70))
    ps = conPuestos(ps, RODILLA, [{ clave: 31, p: p(72), desde: 30 }])
    ps = deshacerCorreccion(ps, RODILLA, 10)
    expect(Object.keys(ps[RODILLA]).map(Number)).toEqual([30, 31])
    /* Sin correcciones, el punto deja de tener pista: vuelve entero a la app. */
    expect(deshacerCorreccion(ps, RODILLA, 30)).toEqual({})
  })

  it('lo seguido no pisa lo que ya tenía sitio', () => {
    let ps: PistasCuerpo = corregirPunto({}, RODILLA, 10, p(50))
    ps = conPuestos(ps, RODILLA, [{ clave: 10, p: p(0), desde: 9 }])
    expect(ps[RODILLA][10]).toEqual({ p: [p(50)] })
  })
})
