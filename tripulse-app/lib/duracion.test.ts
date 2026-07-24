import { describe, it, expect } from 'vitest'
import { calcularDuracionEstimada, type TareaDuracion, type TestsDeportista } from './duracion'

const tests: TestsDeportista = { vam: 15, css: 1.4, ftp: 250 }

describe('calcularDuracionEstimada', () => {
  it('sin tareas → no estimable, 0 minutos', () => {
    const r = calcularDuracionEstimada([], tests)
    expect(r.estimable).toBe(false)
    expect(r.segundos).toBe(0)
    expect(r.minutos).toBe(0)
  })

  it('tarea de fuerza con reps → estimable y minutos coherentes', () => {
    const t: TareaDuracion = { disciplina: 'Fuerza', series: 3, descanso_segundos: 60, ejercicios: [{ repeticiones: 10 }] }
    const r = calcularDuracionEstimada([t], tests)
    expect(r.estimable).toBe(true)
    expect(r.minutos).toBeGreaterThan(0)
    expect(r.minutos).toBe(Math.round(r.segundos / 60))
  })

  it('dos tareas de fuerza suman más que el doble de una (transición entre ejercicios)', () => {
    const t = (): TareaDuracion => ({ disciplina: 'Fuerza', series: 3, descanso_segundos: 60, ejercicios: [{ repeticiones: 10 }] })
    const uno = calcularDuracionEstimada([t()], tests).segundos
    const dos = calcularDuracionEstimada([t(), t()], tests).segundos
    expect(dos).toBeGreaterThan(uno * 2)
  })

  it('tarea con tiempo planeado → estimable directamente', () => {
    const t: TareaDuracion = { disciplina: 'Carrera', series: 1, p_duracion: [{ tiempo_planeado: 1800 }] }
    const r = calcularDuracionEstimada([t], tests)
    expect(r.estimable).toBe(true)
    expect(r.segundos).toBe(1800)
  })

  it('carrera por distancia sin VAM → marca faltanTests', () => {
    const t: TareaDuracion = { disciplina: 'Carrera', series: 1, p_distancia: [{ metros_planeados: 5000 }] }
    const r = calcularDuracionEstimada([t], {})
    expect(r.faltanTests).toBe(true)
    expect(r.estimable).toBe(false)
  })

  it('ciclismo por distancia → marca avisoCiclismo (no estimable por metros)', () => {
    const t: TareaDuracion = { disciplina: 'Ciclismo', series: 1, p_distancia: [{ metros_planeados: 20000 }] }
    const r = calcularDuracionEstimada([t], {})
    expect(r.avisoCiclismo).toBe(true)
  })
})
