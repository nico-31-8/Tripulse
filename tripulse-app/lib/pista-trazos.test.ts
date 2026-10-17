import { describe, it, expect } from 'vitest'
import {
  centroDe, claveDe, corregir, derivadosDe, deshacerDesde, empezarPista, enFotograma, extremosDe, moverPunto, pasoDePista,
  serieDe, visiblesEn, type Pista, type TrazoVivo,
} from './pista-trazos'
import { nombresDe, textoRecorrido, textoValor, valorDe } from './trazos-fotograma'
import { anguloEnVertice } from './geometria-fotograma'

const P = (x: number, y = 0) => ({ x, y })

describe('la pista de un trazo', () => {
  const pista: Pista = {
    30: { p: [P(1)] },
    31: { p: [P(2)], desde: 30 },
    32: { p: [P(3)], desde: 31 },
  }

  it('en un fotograma seguido, su posición; fuera, la más cercana de antes, y si no la primera', () => {
    expect(enFotograma(pista, 31)!.p[0].x).toBe(2)
    expect(enFotograma(pista, 80)!.p[0].x).toBe(3)
    expect(enFotograma(pista, 5)!.p[0].x).toBe(1)
    expect(enFotograma({}, 5)).toBeNull()
  })

  it('el número de fotograma sale del tiempo, a 30 por segundo: el que empezó antes', () => {
    expect(claveDe(0, 30)).toBe(0)
    expect(claveDe(1.0333, 30)).toBe(31)
    expect(claveDe(1.05, 30)).toBe(31)
    /* El navegador da el tiempo redondeado: 0,66666 es el fotograma 20, no el 19. */
    expect(claveDe(0.66666, 30)).toBe(20)
  })

  it('para ver un fotograma se salta a su centro, y de ahí sale el mismo número', () => {
    for (const k of [0, 1, 20, 89]) expect(claveDe(centroDe(k, 30), 30)).toBe(k)
  })

  it('corregir un punto borra lo que se calculó a partir de él, hacia delante', () => {
    const c = corregir(pista, 31, [P(9)])
    expect(Object.keys(c).map(Number)).toEqual([30, 31])
    expect(c[31]).toEqual({ p: [P(9)] })
  })

  it('y también hacia atrás, si se siguió hacia atrás; lo que no dependía de él se queda', () => {
    const atras: Pista = {
      50: { p: [P(50)] },
      49: { p: [P(49)], desde: 50 },
      48: { p: [P(48)], desde: 49 },
      51: { p: [P(51)], desde: 50 },
    }
    const c = corregir(atras, 49, [P(0)])
    expect(Object.keys(c).map(Number).sort((a, b) => a - b)).toEqual([49, 50, 51])
    expect(c[49].desde).toBeUndefined()
  })

  it('un paso: cada punto donde lo encuentre, y apuntado de qué fotograma salió', () => {
    const r = pasoDePista(pista, 32, 33, (_, q) => P(q.x + 1))!
    expect(r.pista[33]).toEqual({ p: [P(4)], desde: 32 })
    expect(r.nuevosPerdidos).toBe(0)
  })

  it('un paso no se da sin fotograma de partida, ni sobre uno que ya se sabe', () => {
    expect(pasoDePista(pista, 40, 41, () => P(0))).toBeNull()
    expect(pasoDePista(pista, 31, 32, () => P(0))).toBeNull()
  })

  it('el punto que no encuentra se queda donde estaba, perdido; los demás siguen', () => {
    const dos: Pista = { 10: { p: [P(1), P(2)] } }
    const r = pasoDePista(dos, 10, 11, (j, q) => (j === 1 ? null : P(q.x + 5)))!
    expect(r.pista[11]).toEqual({ p: [P(6), P(2)], desde: 10, perdidos: [1] })
    expect(r.nuevosPerdidos).toBe(1)
    /* En el siguiente paso, el perdido ni se busca ni se vuelve a avisar. */
    const buscados: number[] = []
    const s = pasoDePista(r.pista, 11, 12, (j, q) => { buscados.push(j); return P(q.x + 5) })!
    expect(buscados).toEqual([0])
    expect(s.pista[12]).toEqual({ p: [P(11), P(2)], desde: 11, perdidos: [1] })
    expect(s.nuevosPerdidos).toBe(0)
  })

  it('arrastrar el perdido lo devuelve; si había dos y arrastra uno, el otro sigue perdido', () => {
    const t: TrazoVivo = { id: 9, tipo: 'linea', puntos: [P(0), P(0)], pista: { 5: { p: [P(1), P(2)], desde: 4, perdidos: [0, 1] }, 4: { p: [P(1), P(2)] } } }
    const m = moverPunto(t, 5, 1, P(7))
    expect(m.pista![5]).toEqual({ p: [P(1), P(7)], perdidos: [0] })
    expect(moverPunto(m, 5, 0, P(3)).pista![5]).toEqual({ p: [P(3), P(7)] })
  })
})

describe('los trazos del visor con su pista', () => {
  const angulo: TrazoVivo = { id: 1, tipo: 'angulo', puntos: [P(0, 0), P(10, 0), P(10, 10)] }
  const plomada: TrazoVivo = { id: 2, tipo: 'plomada', puntos: [P(5)] }

  it('se siguen las líneas, los ángulos y las distancias; la plomada no', () => {
    expect(empezarPista(angulo, 30).pista).toEqual({ 30: { p: angulo.puntos } })
    expect(empezarPista(plomada, 30).pista).toBeUndefined()
    const ya = { ...angulo, pista: { 3: { p: [] } } }
    expect(empezarPista(ya, 30)).toBe(ya)
  })

  it('lo visible en cada fotograma: el seguido en su sitio, lo demás quieto', () => {
    const seguido: TrazoVivo = { ...angulo, pista: { 30: { p: angulo.puntos }, 31: { p: [P(1, 0), P(11, 0), P(11, 10)], desde: 30 } } }
    const v = visiblesEn([seguido, plomada], 31)
    expect(v[0]).toEqual({ tipo: 'angulo', puntos: [P(1, 0), P(11, 0), P(11, 10)] })
    expect(v[1]).toEqual({ tipo: 'plomada', puntos: [P(5)] })
    expect('id' in v[0]).toBe(false)
  })

  it('mover un punto: en uno seguido corrige ese fotograma; en uno quieto, el trazo', () => {
    const seguido: TrazoVivo = { ...angulo, pista: { 30: { p: angulo.puntos }, 31: { p: angulo.puntos, desde: 30 } } }
    const m = moverPunto(seguido, 30, 1, P(20, 20))
    expect(m.pista![30].p[1]).toEqual(P(20, 20))
    expect(m.pista![31]).toBeUndefined()
    expect(m.puntos).toBe(angulo.puntos)
    expect(moverPunto(plomada, 30, 0, P(7)).puntos).toEqual([P(7)])
  })

  it('mover un punto donde no había pista deja ese fotograma con lo que se veía', () => {
    const seguido: TrazoVivo = { ...angulo, pista: { 30: { p: angulo.puntos } } }
    const m = moverPunto(seguido, 40, 0, P(-5, 0))
    expect(m.pista![40].p).toEqual([P(-5, 0), P(10, 0), P(10, 10)])
    expect(m.pista![30]).toBeDefined()
  })
})

describe('el ángulo a lo largo del vídeo', () => {
  it('una serie por fotograma, en orden, sin los perdidos; y su mínimo y su máximo', () => {
    const pista: Pista = {
      32: { p: [P(0, 0), P(10, 0), P(10, 10)], desde: 31 },
      30: { p: [P(0, 0), P(10, 0), P(20, 0)] },
      31: { p: [P(0, 0), P(10, 0), P(15, 8.66)], desde: 30 },
      33: { p: [P(0, 0), P(10, 0), P(0, 1)], desde: 32, perdidos: [2] },
    }
    const s = serieDe(pista, p => anguloEnVertice(p[0], p[1], p[2]))
    expect(s.map(x => x.clave)).toEqual([30, 31, 32])
    expect(s.map(x => Math.round(x.valor))).toEqual([180, 120, 90])
    const e = extremosDe(s)!
    expect(e.min).toEqual({ clave: 32, valor: s[2].valor })
    expect(e.max.clave).toBe(30)
    expect(extremosDe([])).toBeNull()
  })
})

describe('nombres y valores de lo que se mide', () => {
  it('numerados por tipo, como en las medidas; lo que no mide va vacío', () => {
    expect(nombresDe([
      { tipo: 'angulo', puntos: [P(0), P(1), P(2)] },
      { tipo: 'plomada', puntos: [P(0)] },
      { tipo: 'angulo', puntos: [P(0), P(1), P(2)] },
      { tipo: 'linea', puntos: [P(0), P(1)] },
      { tipo: 'angulo', puntos: [P(0), P(1)] },
    ])).toEqual(['Ángulo 1', '', 'Ángulo 2', 'Línea 1', ''])
  })

  it('el valor en número y en texto, y lo recorrido', () => {
    const palma = { tipo: 'palma' as const, puntos: [P(0, 0), P(0, 100)] }
    const d = { tipo: 'distancia' as const, puntos: [P(0, 0), P(150, 0)] }
    expect(valorDe(d, [palma, d])).toBeCloseTo(1.5)
    expect(valorDe(d, [d])).toBeNull()
    expect(valorDe({ tipo: 'linea', puntos: [P(0, 0), P(10, 10)] }, [])).toBeCloseTo(45)
    expect(textoValor('angulo', 92.4)).toBe('92°')
    expect(textoValor('distancia', 1.46)).toBe('1,5 palmas')
    expect(textoRecorrido('angulo', 78.2, 171.6)).toBe('de 78° a 172°')
    expect(textoRecorrido('linea', 4, 31)).toBe('de 4° a 31° de la vertical')
    expect(textoRecorrido('distancia', 1.2, 3.44)).toBe('de 1,2 a 3,4 palmas')
  })
})

describe('deshacer desde un fotograma', () => {
  /* El 10 lo puso el entrenador; del 11 al 13 se siguieron desde él, y el 20 es otra corrección con su 21. */
  const pista: Pista = {
    10: { p: [{ x: 0, y: 0 }] },
    11: { p: [{ x: 1, y: 0 }], desde: 10 }, 12: { p: [{ x: 2, y: 0 }], desde: 11 }, 13: { p: [{ x: 3, y: 0 }], desde: 12 },
    9: { p: [{ x: -1, y: 0 }], desde: 10 },
    20: { p: [{ x: 9, y: 9 }] }, 21: { p: [{ x: 9, y: 8 }], desde: 20 },
  }

  it('lo que salió de un fotograma, en los dos sentidos', () => {
    expect([...derivadosDe(pista, 10)].sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13])
    expect([...derivadosDe(pista, 12)].sort((a, b) => a - b)).toEqual([12, 13])
  })

  it('quita la corrección y lo seguido de ella; la otra se queda', () => {
    expect(Object.keys(deshacerDesde(pista, 10)).map(Number)).toEqual([20, 21])
  })

  it('un fotograma sin sitio propio no quita nada', () => {
    expect(deshacerDesde(pista, 15)).toBe(pista)
  })
})
