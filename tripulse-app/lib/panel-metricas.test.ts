import { describe, it, expect } from 'vitest'
import { calcularCargas, estadoTSB } from './panel-metricas'

describe('calcularCargas', () => {
  it('sin sesiones → array vacío', () => {
    expect(calcularCargas([])).toEqual([])
  })

  it('agrupa por día: dos sesiones el mismo día se suman', () => {
    const r = calcularCargas([
      { fecha_sesion: '2026-07-01', rpe_estimado: 6, duracion_minutos: 60 },
      { fecha_sesion: '2026-07-01', rpe_estimado: 4, duracion_minutos: 30 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].carga).toBe(6 * 60 + 4 * 30)
  })

  it('prioriza rpe_reportado sobre rpe_estimado', () => {
    const r = calcularCargas([{ fecha_sesion: '2026-07-01', rpe_reportado: 8, rpe_estimado: 3, duracion_minutos: 60 }])
    expect(r[0].carga).toBe(8 * 60)
  })

  it('una entrada por día, ordenadas; el TSB del primer día de carga es negativo', () => {
    const r = calcularCargas([
      { fecha_sesion: '2026-07-03', rpe_estimado: 5, duracion_minutos: 60 },
      { fecha_sesion: '2026-07-01', rpe_estimado: 5, duracion_minutos: 60 },
      { fecha_sesion: '2026-07-02', rpe_estimado: 5, duracion_minutos: 60 },
    ])
    expect(r).toHaveLength(3)
    expect(r[0].tsb).toBeLessThan(0) // ATL sube más rápido que CTL
  })
})

describe('estadoTSB', () => {
  it('mapea el TSB a su estado', () => {
    expect(estadoTSB(-40).label).toBe('Sobrecarga')
    expect(estadoTSB(-20).label).toBe('Carga productiva')
    expect(estadoTSB(0).label).toBe('En transición')
    expect(estadoTSB(10).label).toBe('Forma óptima')
    expect(estadoTSB(30).label).toBe('Desentrenando')
  })
})
