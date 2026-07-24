import { describe, it, expect } from 'vitest'
import { analizarWellness, type RegistroWellness } from './wellness-analisis'

// Un día "bueno" por defecto; se sobreescribe lo que haga falta para cada caso.
const dia = (fecha: string, o: Partial<RegistroWellness> = {}): RegistroWellness => ({
  fecha, calidad_sueno: 2, horas_sueno: 8, fatiga: 2, estres: 2,
  dolor_muscular: 2, animo: 6, motivacion: 6, ...o,
})

describe('analizarWellness', () => {
  it('con menos de 3 registros no calcula readiness', () => {
    const r = analizarWellness([dia('2026-07-01'), dia('2026-07-02')])
    expect(r.readiness).toBeNull()
    expect(r.metricas).toHaveLength(0)
    expect(r.conclusiones.some(c => c.tipo === 'info')).toBe(true)
  })

  it('con días buenos → readiness óptimo y una conclusión positiva', () => {
    const r = analizarWellness([dia('2026-07-01'), dia('2026-07-02'), dia('2026-07-03')])
    expect(r.readiness).not.toBeNull()
    expect(r.readiness!.nivel).toBe('optimo')
    expect(r.conclusiones.some(c => c.tipo === 'positivo')).toBe(true)
  })

  it('con días malos (fatiga/dolor altos, poco sueño) → readiness alerta con avisos', () => {
    const malo = (f: string) => dia(f, { fatiga: 7, dolor_muscular: 7, horas_sueno: 5, calidad_sueno: 6, estres: 6 })
    const r = analizarWellness([malo('2026-07-01'), malo('2026-07-02'), malo('2026-07-03')])
    expect(r.readiness!.nivel).toBe('alerta')
    expect(r.conclusiones.some(c => c.tipo === 'rojo' || c.tipo === 'ambar')).toBe(true)
  })

  it('nunca devuelve más de 6 conclusiones', () => {
    const malo = (f: string) => dia(f, { fatiga: 7, dolor_muscular: 7, horas_sueno: 4, calidad_sueno: 7, estres: 7, animo: 1, motivacion: 1 })
    const r = analizarWellness([1, 2, 3, 4].map(i => malo('2026-07-0' + i)))
    expect(r.conclusiones.length).toBeLessThanOrEqual(6)
  })
})
