import { describe, it, expect } from 'vitest'
import { tienePacing, idsConPacing, calcularObjetivos } from './pacing'

describe('tienePacing', () => {
  it('true para una prueba con pacing, false si no', () => {
    expect(tienePacing('tri-olimpico')).toBe(true)
    expect(tienePacing('no-existe')).toBe(false)
    expect(tienePacing(null)).toBe(false)
  })
  it('idsConPacing devuelve al menos una prueba', () => {
    expect(idsConPacing().length).toBeGreaterThan(0)
  })
})

describe('calcularObjetivos', () => {
  const tests = { vam: 15, css: 1.4, ftp: 250 }

  it('con todos los tests: filas con intensidad y sin faltantes', () => {
    const r = calcularObjetivos('tri-olimpico', tests, 35)
    expect(r).not.toBeNull()
    expect(r!.filas.length).toBe(3) // nadar · bici · correr
    expect(r!.faltanTests).toBe(false)
    expect(r!.filas.every(f => f.intensidad !== '—')).toBe(true)
    expect(r!.total).toMatch(/–/) // rango total "Xh–Yh"
  })

  it('la fila de natación da ritmo /100m y la de carrera /km', () => {
    const r = calcularObjetivos('tri-olimpico', tests, 35)!
    expect(r.filas.find(f => f.disc === 'Natación')!.intensidad).toMatch(/\/100m/)
    expect(r.filas.find(f => f.disc === 'Carrera')!.intensidad).toMatch(/\/km/)
    expect(r.filas.find(f => f.disc === 'Ciclismo')!.intensidad).toMatch(/W$/)
  })

  it('sin tests marca faltanTests y usa el % de fallback', () => {
    const r = calcularObjetivos('tri-olimpico', {}, 35)
    expect(r).not.toBeNull()
    expect(r!.faltanTests).toBe(true)
    expect(r!.filas.find(f => f.disc === 'Natación')!.intensidad).toMatch(/% CSS/)
  })

  it('todas las pruebas con pacing calculan sin reventar', () => {
    for (const id of idsConPacing()) {
      expect(calcularObjetivos(id, tests, 35)).not.toBeNull()
    }
  })

  it('id desconocido devuelve null', () => {
    expect(calcularObjetivos('no-existe', tests, 35)).toBeNull()
  })
})
