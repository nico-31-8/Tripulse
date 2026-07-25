import { describe, it, expect } from 'vitest'
import { pruebaPorId, resumenSegmentos, PRUEBAS } from './pruebas'

describe('pruebaPorId', () => {
  it('encuentra una prueba por id', () => {
    expect(pruebaPorId('tri-olimpico')?.nombre).toContain('Olímpico')
  })
  it('null si no existe o id vacío', () => {
    expect(pruebaPorId('no-existe')).toBeNull()
    expect(pruebaPorId(null)).toBeNull()
  })
  it('todas las pruebas del catálogo tienen id, nombre y segmentos', () => {
    for (const p of PRUEBAS) {
      expect(p.id).toBeTruthy()
      expect(p.nombre).toBeTruthy()
      expect(Array.isArray(p.segmentos)).toBe(true)
    }
  })
})

describe('resumenSegmentos', () => {
  it('resume un triatlón con km y separadores', () => {
    const r = resumenSegmentos(pruebaPorId('tri-sprint')!)
    expect(r).toMatch(/km/)
    expect(r).toContain('·')
  })
})
