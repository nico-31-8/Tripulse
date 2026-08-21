import { describe, it, expect } from 'vitest'
import { testsDelPlan, minutosDeTests, TESTS, type SemanaParaTest } from './plan-tests'
import { sumarDias } from './desplazar'

const LUNES = '2026-01-05'

/** 16 semanas en bloques de 4, con la descarga la última de cada uno. */
const plan = (n = 16): SemanaParaTest[] =>
  Array.from({ length: n }, (_, i) => ({
    lunes: sumarDias(LUNES, i * 7),
    n: i,
    tipoMeso: 'Acumulación',
    esDescarga: i % 4 === 3,
    primeraDelBloque: i % 4 === 0,
  }))

describe('cuándo toca testarse', () => {
  it('la primera semana lleva los tres: sin ellos no hay zonas de partida', () => {
    const t = testsDelPlan(plan(), null)
    expect(t[0].n).toBe(0)
    expect(t[0].tests.map(x => x.disciplina).sort()).toEqual(['Carrera', 'Ciclismo', 'Natacion'])
  })

  /* B1-12 §5.2: testar en semana de carga máxima mide el cansancio, no la
     forma — y el error se realimenta, porque se recortan las zonas y el atleta
     entrena aún más flojo. */
  it('todos los tests caen en semana de descarga, nunca en una dura', () => {
    const semanas = plan()
    const t = testsDelPlan(semanas, null)
    t.slice(1).forEach(e => {
      const s = semanas.find(x => x.lunes === e.lunes)!
      expect(s.esDescarga, 'semana ' + e.n).toBe(true)
    })
  })

  it('la natación se revisa más a menudo que la bici y la carrera', () => {
    const t = testsDelPlan(plan(20), null)
    const conNat = t.filter(e => e.tests.some(x => x.disciplina === 'Natacion')).length
    const conCar = t.filter(e => e.tests.some(x => x.disciplina === 'Carrera')).length
    expect(conNat).toBeGreaterThan(conCar)
  })
})

describe('el silencio antes de la carrera', () => {
  /* B1-12 §5.1: durante el tapering, ningún test máximo. Es exactamente lo
     contrario de lo que se busca ahí. */
  it('no programa nada en las tres semanas previas', () => {
    const semanas = plan(16)
    const carrera = sumarDias(LUNES, 15 * 7 + 6)
    const t = testsDelPlan(semanas, carrera)
    t.forEach(e => {
      const dias = Math.round((new Date(carrera + 'T00:00:00Z').getTime() - new Date(e.lunes + 'T00:00:00Z').getTime()) / 86400000)
      expect(dias, 'semana ' + e.n).toBeGreaterThan(21)
    })
  })

  it('sí programa la última calibración unas seis semanas antes', () => {
    const semanas = plan(16)
    const carrera = sumarDias(LUNES, 15 * 7 + 6)
    const t = testsDelPlan(semanas, carrera)
    const seis = t.find(e => {
      const d = Math.round((new Date(carrera + 'T00:00:00Z').getTime() - new Date(e.lunes + 'T00:00:00Z').getTime()) / 86400000)
      return d >= 35 && d <= 48
    })
    expect(seis).toBeTruthy()
  })

  it('sin fecha de carrera no se calla nada', () => {
    expect(testsDelPlan(plan(), null).length).toBeGreaterThan(1)
  })
})

describe('detalles que evitan líos', () => {
  it('no mete dos encargos en la misma semana', () => {
    const t = testsDelPlan(plan(24), sumarDias(LUNES, 23 * 7 + 6))
    expect(new Set(t.map(e => e.lunes)).size).toBe(t.length)
  })

  it('van en orden', () => {
    const t = testsDelPlan(plan(24), null)
    t.forEach((e, i) => { if (i) expect(e.lunes > t[i - 1].lunes).toBe(true) })
  })

  it('un plan vacío no da tests', () => {
    expect(testsDelPlan([], null)).toEqual([])
  })

  /* Los minutos se descuentan del volumen: sumarlos por encima convertiría la
     semana de descarga en una normal, que es la única en la que no se puede. */
  it('suma los minutos que se van en testarse', () => {
    expect(minutosDeTests({ lunes: LUNES, n: 0, motivo: '', tests: [TESTS.Carrera, TESTS.Natacion] }))
      .toBe(TESTS.Carrera.minutos + TESTS.Natacion.minutos)
    expect(minutosDeTests(undefined)).toBe(0)
  })
})
