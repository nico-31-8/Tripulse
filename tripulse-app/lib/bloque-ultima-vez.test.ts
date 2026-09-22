import { describe, it, expect } from 'vitest'
import { elegirUltimaVez, type BloqueHecho } from './bloque-ultima-vez'

const amrap = { formato: 'amrap', ejercicios: [{ nombre: 'Burpees' }, { cardio_modo: 'remo', tipo_serie: 'Cardio' }] }
const hecho = (fecha: string, resultado: unknown, cambios: Partial<BloqueHecho> = {}): BloqueHecho =>
  ({ fecha, formato: 'amrap', resultado, ejercicios: amrap.ejercicios, ...cambios })

describe('la última vez que hizo este bloque', () => {
  it('la más reciente de antes de hoy, con los días que han pasado', () => {
    const r = elegirUltimaVez(amrap, [
      hecho('2026-09-01', { rondas: 5 }),
      hecho('2026-09-15', { rondas: 6, reps: 8 }),
    ], '2026-09-22')
    expect(r).toEqual({ fecha: '2026-09-15', dias: 7, resultado: expect.objectContaining({ rondas: 6, reps: 8 }) })
  })

  it('solo el mismo bloque: mismo formato y mismos ejercicios', () => {
    expect(elegirUltimaVez(amrap, [hecho('2026-09-15', { rondas: 6 }, { formato: 'emom' })], '2026-09-22')).toBeNull()
    expect(elegirUltimaVez(amrap, [hecho('2026-09-15', { rondas: 6 }, { ejercicios: [{ nombre: 'Burpees' }] })], '2026-09-22')).toBeNull()
  })

  it('sin resultado no cuenta, y lo de hoy tampoco', () => {
    expect(elegirUltimaVez(amrap, [hecho('2026-09-15', null), hecho('2026-09-22', { rondas: 9 })], '2026-09-22')).toBeNull()
  })

  /* Los kilos cambian; el bloque sigue siendo el mismo. */
  it('aunque cambien las cantidades o el orden', () => {
    const r = elegirUltimaVez(amrap, [hecho('2026-09-15', { rondas: 6 }, {
      ejercicios: [{ cardio_modo: 'remo', tipo_serie: 'Cardio', cardio_valor: 20 }, { nombre: 'Burpees', cantidad: 12 }],
    })], '2026-09-22')
    expect(r?.resultado.rondas).toBe(6)
  })
})
