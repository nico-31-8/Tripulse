import { describe, it, expect } from 'vitest'
import { analizarWellness, type RegistroWellness, compararDia, loQueFueMal, separarFuentes } from './wellness-analisis'

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

/* ============================================================
   Lo que llega del reloj: series propias, sin mezclar
   ============================================================
   La HRV nocturna del reloj (RMSSD de 4 h de sueño) y la que se mide al
   despertar dan números distintos a la misma persona. Si compartieran serie,
   conectar el reloj haría que la semana saliera «fuera de su normal» sin que
   el atleta hubiera cambiado nada. */
describe('lo que llega del reloj', () => {
  const f = (i: number) => '2026-06-' + String(i).padStart(2, '0')

  /* Dos semanas a mano: HRV de la mañana ~62 ms, FC en reposo ~50, 8 h de sueño. */
  const aMano = Array.from({ length: 14 }, (_, i) =>
    dia(f(i + 1), { hrv: 60 + (i % 5), fc_reposo: 49 + (i % 3), horas_sueno: 7.5 + (i % 2) * 0.5 }))

  /* Y una semana con Polar: HRV nocturna ~45, FC nocturna ~48, 7,2 h de sueño real. */
  const conReloj = Array.from({ length: 7 }, (_, i) =>
    dia(f(i + 15), { hrv: null, fc_reposo: null, hrv_noche: 44 + (i % 3), fc_noche: 48, horas_sueno: 7.2, sueno_del_reloj: true }))

  /* LA PRUEBA QUE JUSTIFICA TODO: el día que conecta el reloj, nada se sale. */
  it('conectar el reloj NO dispara alarmas: la HRV nocturna no se compara con la de la mañana', () => {
    const r = analizarWellness([...aMano, ...conReloj])
    expect(r.metricas.filter(m => m.fuera).map(m => m.key)).toEqual([])
    expect(r.readiness!.nivel).toBe('optimo')
  })

  /* Y el control: los mismos números metidos en la columna de siempre sí
     saltan. Es exactamente lo que pasaría sin series separadas. */
  it('control: esos mismos números en la columna de la mañana SÍ saltarían', () => {
    const mezclado = conReloj.map(r => ({ ...r, hrv: r.hrv_noche, hrv_noche: null }))
    const r = analizarWellness([...aMano, ...mezclado])
    expect(r.metricas.find(m => m.key === 'hrv')?.fuera).toBe(true)
  })

  it('la HRV nocturna sí avisa cuando cae respecto a SU propia normal', () => {
    const base = Array.from({ length: 14 }, (_, i) =>
      dia(f(i + 1), { hrv_noche: 50 + (i % 3), fc_noche: 48, horas_sueno: 7.5, sueno_del_reloj: true }))
    const caida = Array.from({ length: 7 }, (_, i) =>
      dia(f(i + 15), { hrv_noche: 37 + (i % 2), fc_noche: 48, horas_sueno: 7.5, sueno_del_reloj: true }))
    const r = analizarWellness([...base, ...caida])
    const m = r.metricas.find(x => x.key === 'hrv_noche')!
    expect(m.fuera).toBe(true)
    expect(r.conclusiones.some(c => c.texto.startsWith('HRV nocturna'))).toBe(true)
  })

  it('la FC nocturna avisa cuando sube respecto a su propia normal', () => {
    const base = Array.from({ length: 14 }, (_, i) =>
      dia(f(i + 1), { fc_noche: 47 + (i % 2), sueno_del_reloj: true, horas_sueno: 7.5 }))
    const sube = Array.from({ length: 7 }, (_, i) =>
      dia(f(i + 15), { fc_noche: 55, sueno_del_reloj: true, horas_sueno: 7.5 }))
    const r = analizarWellness([...base, ...sube])
    expect(r.metricas.find(x => x.key === 'fc_noche')!.fuera).toBe(true)
  })

  it('las horas del reloj van a su serie; las corregidas a mano se quedan en la de siempre', () => {
    const delReloj = separarFuentes({ fecha: f(1), horas_sueno: 7.2, sueno_del_reloj: true })
    expect(delReloj.horas_sueno).toBeNull()
    expect((delReloj as any).horas_sueno_reloj).toBe(7.2)

    const corregida = separarFuentes({ fecha: f(1), horas_sueno: 8, sueno_del_reloj: false })
    expect(corregida.horas_sueno).toBe(8)
    expect((corregida as any).horas_sueno_reloj).toBeUndefined()
  })

  it('separar no toca el registro de quien llama', () => {
    const original = { fecha: f(1), horas_sueno: 7.2, sueno_del_reloj: true }
    separarFuentes(original)
    expect(original.horas_sueno).toBe(7.2)
  })

  it('las noches cortas cuentan también las del reloj', () => {
    const cortas = Array.from({ length: 4 }, (_, i) =>
      dia(f(i + 1), { horas_sueno: 6.3, sueno_del_reloj: true }))
    const r = analizarWellness(cortas)
    expect(r.conclusiones.some(c => /noches por debajo de 7h/.test(c.texto))).toBe(true)
  })

  it('con reloj ya no sale el recordatorio de «sin HRV ni FC»', () => {
    const r = analizarWellness(conReloj)
    expect(r.conclusiones.some(c => c.texto.startsWith('Sin HRV ni FC'))).toBe(false)
  })

  it('sin nada objetivo, el recordatorio sí sale, y ya menciona el reloj', () => {
    const r = analizarWellness([dia(f(1)), dia(f(2)), dia(f(3))])
    const aviso = r.conclusiones.find(c => c.texto.startsWith('Sin HRV ni FC'))
    expect(aviso?.texto).toMatch(/reloj/)
  })

  it('un día suelto del reloj se compara con los días del reloj, no con los de a mano', () => {
    const historial = [...aMano, ...Array.from({ length: 7 }, (_, i) =>
      dia(f(i + 15), { hrv_noche: 50 + (i % 3), sueno_del_reloj: true, horas_sueno: 7.4 }))]
    const hoy = dia('2026-06-25', { hrv_noche: 36, sueno_del_reloj: true, horas_sueno: 7.3 })
    const m = compararDia(hoy, historial)
    expect(m.find(x => x.key === 'hrv_noche')?.fuera).toBe(true)
    expect(m.find(x => x.key === 'hrv')).toBeUndefined()
    expect(m.find(x => x.key === 'horas_sueno')).toBeUndefined()
    expect(m.find(x => x.key === 'horas_sueno_reloj')).toBeDefined()
  })
})
