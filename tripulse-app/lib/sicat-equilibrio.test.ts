import { describe, it, expect } from 'vitest'
import { diferencia, tramos, aPunto, tendencia, mediaPuntos, GRANULARIDADES } from './sicat-equilibrio'

describe('diferencia', () => {
  it('es la distancia entre el que más cuesta y el que menos', () => {
    expect(diferencia([10.2, 8.9, 9.3])).toBe(1.3)
  })

  /* El fallo que esto evita. Cada factor va de 1 a 4, así que el total va de 4 a 16
     y el 4 NO es «coste cero». Sin cero de verdad, un cociente no significa nada:
     8,9÷10,2 = 87 %, pero descontando el suelo = 79 %. Dos números y los dos
     arbitrarios. Una diferencia sí se puede afirmar. */
  it('NO es un cociente: el resultado no depende de dónde pongas el cero', () => {
    const d1 = diferencia([10.2, 8.9])
    const d2 = diferencia([10.2 - 4, 8.9 - 4])   // la misma distancia, otro origen
    expect(d1).toBe(d2)
  })

  it('con menos de dos valores no hay distancia que medir', () => {
    expect(diferencia([9])).toBeNull()
    expect(diferencia([null, null])).toBeNull()
    expect(diferencia([])).toBeNull()
  })

  it('ignora las disciplinas sin datos en vez de contarlas como cero', () => {
    expect(diferencia([10.2, null, 8.9])).toBe(1.3)
  })
})

describe('tramos', () => {
  const hoy = new Date('2026-08-11T12:00:00Z')

  it('devuelve del más antiguo al más reciente y acaba hoy', () => {
    const t = tramos('mes', 4, hoy)
    expect(t).toHaveLength(4)
    expect(t[3].hasta).toBe('2026-08-11')
    expect(t[0].desde! < t[3].desde!).toBe(true)
  })

  it('los tramos no se solapan ni dejan huecos', () => {
    const t = tramos('semana', 4, hoy)
    for (let i = 1; i < t.length; i++) {
      const finAnterior = new Date(t[i - 1].hasta!)
      const inicio = new Date(t[i].desde!)
      const dias = (inicio.getTime() - finAnterior.getTime()) / 86400000
      expect(dias).toBe(1)
    }
  })

  it('cada granularidad dura lo suyo', () => {
    for (const g of GRANULARIDADES) {
      const t = tramos(g.id, 2, hoy)
      const d = (new Date(t[1].hasta!).getTime() - new Date(t[1].desde!).getTime()) / 86400000
      expect(d).toBe(g.dias - 1)
    }
  })

  it('pone etiqueta a cada tramo', () => {
    expect(tramos('mes', 3, hoy).every(t => !!t.etiqueta)).toBe(true)
  })
})

const res = (nat: number | null, cic: number | null, car: number | null) => ({
  Natacion: { total: nat, sesiones: 5 }, Ciclismo: { total: cic, sesiones: 6 }, Carrera: { total: car, sesiones: 7 },
}) as any

describe('aPunto', () => {
  it('recoge puntos, sesiones y la diferencia', () => {
    const p = aPunto('ago', res(10.2, 8.9, 9.3))
    expect(p.puntos.Natacion).toBe(10.2)
    expect(p.sesiones.Ciclismo).toBe(6)
    expect(p.diferencia).toBe(1.3)
  })

  it('sin datos en una disciplina no inventa un cero', () => {
    const p = aPunto('ago', res(10.2, null, 9.3))
    expect(p.puntos.Ciclismo).toBeNull()
    expect(p.diferencia).toBe(0.9)
  })
})

describe('tendencia', () => {
  const serie = (...difs: number[]) => difs.map((d, i) => ({
    etiqueta: 't' + i, puntos: {}, sesiones: {}, diferencia: d,
  }))

  it('juntarse es que la diferencia BAJE', () => {
    const t = tendencia(serie(5.6, 4.7, 2.8, 1.3))
    expect(t.cambio).toBe(4.3)
    expect(t.texto).toMatch(/juntado/i)
  })

  /* Separarse no es necesariamente ir a peor: puede ser que uno haya mejorado
     mucho. El texto tiene que decirlo, no regañar. */
  it('al separarse avisa de que puede ser una mejora', () => {
    const t = tendencia(serie(1.3, 4.3))
    expect(t.cambio).toBe(-3)
    expect(t.texto).toMatch(/mejorado mucho/i)
  })

  it('un cambio minúsculo es «sigue igual»', () => {
    expect(tendencia(serie(2.0, 2.05)).texto).toMatch(/sigue igual/i)
  })

  it('con un solo tramo no se pronuncia', () => {
    expect(tendencia(serie(2.0)).cambio).toBeNull()
    expect(tendencia([]).cambio).toBeNull()
  })
})

describe('mediaPuntos', () => {
  it('promedia solo lo que hay', () => {
    expect(mediaPuntos(aPunto('x', res(10, 8, 9)))).toBe(9)
    expect(mediaPuntos(aPunto('x', res(10, null, 8)))).toBe(9)
    expect(mediaPuntos(aPunto('x', res(null, null, null)))).toBeNull()
  })
})
