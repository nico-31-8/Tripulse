import { describe, it, expect } from 'vitest'
import { cargaPlanificada, cargaReal, minutosCarga } from './duracion-carga'
import type { ResultadoDuracion } from './duracion'

const est = (minutos: number): ResultadoDuracion =>
  ({ minutos, estimable: true } as ResultadoDuracion)

describe('minutos que entran en la carga', () => {
  it('manda lo cronometrado, luego lo manual, luego la estimación', () => {
    expect(minutosCarga({ duracion_real: 55, duracion_minutos: 60 }, est(45))).toBe(55)
    expect(minutosCarga({ duracion_minutos: 60 }, est(45))).toBe(60)
    expect(minutosCarga({}, est(45))).toBe(45)
    expect(minutosCarga({})).toBe(0)
  })
})

describe('carga de una sesión', () => {
  /* EL FALLO QUE ARREGLA ESTO: el lienzo hacía (rpe||0) * (duracion_minutos||0),
     así que una sesión sin RPE escrito y sin duración a mano valía 0. Como casi
     ninguna lleva duración manual, la capa «Programado» salía a 0 con 18
     sesiones en el calendario. */
  it('una sesión sin RPE ni duración manual NO vale cero', () => {
    const s = { rpe_estimado: null, duracion_minutos: null }
    expect(cargaPlanificada(s, est(50))).toBe(5 * 50)
  })

  it('con RPE puesto, manda el suyo', () => {
    expect(cargaPlanificada({ rpe_estimado: 7 }, est(60))).toBe(420)
  })

  /* Lo planificado es lo que MANDÓ el entrenador. Si el atleta lo hizo más duro
     de lo previsto, eso es «realizado» y va en la otra. */
  it('lo planificado ignora el RPE que reportó el atleta', () => {
    const s = { rpe_estimado: 5, rpe_reportado: 9, duracion_minutos: 60 }
    expect(cargaPlanificada(s)).toBe(300)
    expect(cargaReal(s)).toBe(540)
  })

  it('sin reportar, lo real cae al previsto', () => {
    expect(cargaReal({ rpe_estimado: 6, duracion_minutos: 30 })).toBe(180)
  })

  it('sin nada de nada, el 5 por defecto — el mismo que el resto de la app', () => {
    expect(cargaReal({ duracion_minutos: 40 })).toBe(200)
  })

  it('sin sesión, cero', () => {
    expect(cargaPlanificada(null)).toBe(0)
    expect(cargaReal(undefined)).toBe(0)
  })

  it('sin minutos por ningún lado, cero aunque haya RPE', () => {
    // Un RPE suelto no es carga: hace falta tiempo.
    expect(cargaPlanificada({ rpe_estimado: 8 })).toBe(0)
  })
})
