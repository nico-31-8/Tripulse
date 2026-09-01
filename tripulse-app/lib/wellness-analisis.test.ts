import { describe, it, expect } from 'vitest'
import { analizarWellness, type RegistroWellness, compararDia, loQueFueMal } from './wellness-analisis'

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

describe('compararDia — un día contra lo normal de ese atleta', () => {
  /* Historial tranquilo: fatiga 3, sueño 7,5 h. Nueve registros, suficiente
     para que haya línea base (pide 5 como mínimo). */
  const historial = Array.from({ length: 9 }, (_, i) => ({
    fecha: '2026-08-0' + (i + 1),
    fatiga: 3, horas_sueno: 7.5, animo: 5, calidad_sueno: 3, estres: 2, dolor_muscular: 2, motivacion: 5,
  })) as any[]

  const dia = (extra: any) => ({ fecha: '2026-08-20', fatiga: 3, horas_sueno: 7.5, animo: 5, calidad_sueno: 3, estres: 2, dolor_muscular: 2, motivacion: 5, ...extra })
  const de = (m: any[], key: string) => m.find(x => x.key === key)

  it('un día igual que su normal no marca nada', () => {
    const m = compararDia(dia({}), historial)
    expect(m.every(x => x.respecto === 'igual')).toBe(true)
    expect(loQueFueMal(m)).toHaveLength(0)
  })

  it('la fatiga alta sale como PEOR, porque en fatiga menos es mejor', () => {
    const m = compararDia(dia({ fatiga: 6 }), historial)
    expect(de(m, 'fatiga').respecto).toBe('peor')
    expect(de(m, 'fatiga').fuera).toBe(true)
  })

  it('el ánimo alto sale como MEJOR: ahí más es mejor', () => {
    const m = compararDia(dia({ animo: 7 }), historial)
    expect(de(m, 'animo').respecto).toBe('mejor')
    expect(de(m, 'animo').fuera).toBe(false)
  })

  it('dormir poco es peor aunque su media fuera baja', () => {
    expect(de(compararDia(dia({ horas_sueno: 5 }), historial), 'horas_sueno').respecto).toBe('peor')
  })

  /* Si el propio día entrara en su base, un día malo tiraría de su referencia y
     parecería menos malo de lo que fue. */
  it('el día que se compara no cuenta en su propia base', () => {
    const conElDentro = [...historial, dia({ fatiga: 7 })]
    const m = compararDia(dia({ fatiga: 7 }), conElDentro)
    expect(de(m, 'fatiga').base).toBe(3)
  })

  it('sin historial suficiente no se inventa una base', () => {
    const m = compararDia(dia({ fatiga: 6 }), historial.slice(0, 3))
    expect(de(m, 'fatiga').base).toBeNull()
  })

  it('pero los umbrales absolutos siguen avisando sin base', () => {
    const m = compararDia(dia({ fatiga: 6 }), [])
    expect(de(m, 'fatiga').fuera).toBe(true)
  })

  it('una métrica sin dato ese día no aparece', () => {
    const m = compararDia(dia({ hrv: null }), historial)
    expect(de(m, 'hrv')).toBeUndefined()
  })

  it('sin registro, nada', () => {
    expect(compararDia(null, historial)).toEqual([])
  })

  it('loQueFueMal deja solo lo que se salió', () => {
    const m = compararDia(dia({ fatiga: 6, animo: 7 }), historial)
    expect(loQueFueMal(m).map(x => x.key)).toEqual(['fatiga'])
  })
})
