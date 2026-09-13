import { describe, it, expect } from 'vitest'
import { sesionLarga, TOPE_SESION_LARGA } from './progresion'

const HOY = '2026-09-11'
const s = (fecha: string, minutos: number | null) => ({ fecha_sesion: fecha, minutos })

describe('sesionLarga — la regla del 110 % (Máster, L4.3)', () => {
  it('el tope es el 110 %', () => {
    expect(TOPE_SESION_LARGA).toBe(1.1)
  })

  it('la larga de esta semana dentro del 110 % de la del mes: no excede', () => {
    const r = sesionLarga([s('2026-09-10', 105), s('2026-08-25', 100)], HOY)!
    expect(r).toMatchObject({ ultimaSemana: 105, mesAnterior: 100, excede: false })
  })

  it('por encima del 110 %: excede', () => {
    const r = sesionLarga([s('2026-09-09', 120), s('2026-08-20', 100), s('2026-08-28', 90)], HOY)!
    expect(r.excede).toBe(true)
    expect(r.ratio).toBe(1.2)
  })

  it('justo el 110 % todavía vale', () => {
    expect(sesionLarga([s('2026-09-11', 110), s('2026-08-30', 100)], HOY)!.excede).toBe(false)
  })

  it('la semana son los 7 días hasta hoy; el mes, los 30 anteriores', () => {
    // El 4 de septiembre ya es «mes anterior» (7 días antes de hoy).
    const r = sesionLarga([s('2026-09-05', 60), s('2026-09-04', 200)], HOY)!
    expect(r.ultimaSemana).toBe(60)
    expect(r.mesAnterior).toBe(200)
    // Y lo de hace más de 37 días no cuenta.
    expect(sesionLarga([s('2026-09-10', 60), s('2026-07-20', 30)], HOY)).toBeNull()
  })

  it('sin con qué comparar, no se sabe: un atleta que empieza no se pasa de nada', () => {
    expect(sesionLarga([s('2026-09-10', 90)], HOY)).toBeNull()
    expect(sesionLarga([s('2026-08-20', 90)], HOY)).toBeNull()
    expect(sesionLarga([], HOY)).toBeNull()
  })

  it('las sesiones sin minutos no cuentan', () => {
    expect(sesionLarga([s('2026-09-10', null), s('2026-08-20', 100)], HOY)).toBeNull()
  })
})
