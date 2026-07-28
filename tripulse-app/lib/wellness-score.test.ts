import { describe, it, expect } from 'vitest'
import { bienestar, colorBienestar, estadoBienestar } from './wellness-score'

describe('bienestar', () => {
  it('invierte el malestar guardado', () => {
    expect(bienestar(0)).toBe(100)   // malestar 0 → bienestar perfecto
    expect(bienestar(82)).toBe(18)   // malestar alto → bienestar bajo
    expect(bienestar(100)).toBe(0)
  })
  it('null si no hay dato', () => {
    expect(bienestar(null)).toBeNull()
    expect(bienestar(undefined)).toBeNull()
  })
})

describe('estadoBienestar / colorBienestar', () => {
  it('respeta los cortes clásicos del malestar (25/50/75) ya invertidos', () => {
    // malestar 25 → bienestar 75 → sigue siendo Óptimo
    expect(estadoBienestar(bienestar(25)!)).toBe('Óptimo')
    expect(estadoBienestar(bienestar(50)!)).toBe('Aceptable')
    expect(estadoBienestar(bienestar(75)!)).toBe('Deteriorado')
    expect(estadoBienestar(bienestar(90)!)).toBe('Crítico')
  })
  it('el color acompaña al estado', () => {
    expect(colorBienestar(80)).toBe('#22c55e')
    expect(colorBienestar(10)).toBe('#ef4444')
  })
})
