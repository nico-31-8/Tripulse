import { describe, it, expect } from 'vitest'
import { recomendarRecuperacion, type ContextoRecuperacion } from './recuperacion'

const ctx = (o: Partial<ContextoRecuperacion> = {}): ContextoRecuperacion => ({
  duracionMin: 60, rpeReal: 5, disciplina: 'Carrera', ayuno: false,
  pesoKg: 70, otraSesionHoy: false, diasHastaComp: null, ...o,
})

describe('recomendarRecuperacion', () => {
  it('sesión suave → nivel mínima, sin macros', () => {
    const r = recomendarRecuperacion(ctx({ rpeReal: 3, duracionMin: 45 }))
    expect(r.nivel).toBe('minima')
    expect(r.carboG).toBeNull()
    expect(r.proteinaG).toBeNull()
  })

  it('sesión dura (RPE alto) → nivel alta con macros por peso', () => {
    const r = recomendarRecuperacion(ctx({ rpeReal: 8, duracionMin: 120, pesoKg: 70 }))
    expect(r.nivel).toBe('alta')
    expect(r.carboG).toBe(Math.round(70 * 1.2))
    expect(r.proteinaG!).toBeGreaterThanOrEqual(20)
    expect(r.proteinaG!).toBeLessThanOrEqual(25)
  })

  it('sesión media → nivel estándar', () => {
    const r = recomendarRecuperacion(ctx({ rpeReal: 5, duracionMin: 90 }))
    expect(r.nivel).toBe('estandar')
    expect(r.carboG).toBe(70)
  })

  it('en ayunas fuerza nivel alta y añade el aviso', () => {
    const r = recomendarRecuperacion(ctx({ rpeReal: 4, duracionMin: 50, ayuno: true }))
    expect(r.nivel).toBe('alta')
    expect(r.extra.some(e => /ayunas/i.test(e))).toBe(true)
  })

  it('doble sesión hoy sube una sesión suave a estándar', () => {
    const r = recomendarRecuperacion(ctx({ rpeReal: 3, duracionMin: 45, otraSesionHoy: true }))
    expect(r.nivel).toBe('estandar')
  })

  it('sin peso no da gramos aunque no sea suave', () => {
    const r = recomendarRecuperacion(ctx({ rpeReal: 8, duracionMin: 120, pesoKg: null }))
    expect(r.carboG).toBeNull()
  })

  it('competición cercana añade aviso', () => {
    const r = recomendarRecuperacion(ctx({ diasHastaComp: 1 }))
    expect(r.extra.some(e => /ompetici/.test(e))).toBe(true)
  })
})
