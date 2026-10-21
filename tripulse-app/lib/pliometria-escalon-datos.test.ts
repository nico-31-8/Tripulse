import { describe, it, expect } from 'vitest'
import { semanasConFuerza, datosDeLaApp, esSentadilla, leerComprobaciones } from './pliometria-escalon-datos'

// De dónde salen los datos con los que se recomienda el escalón: las filas tal
// cual llegan de la base (las columnas, comprobadas en la base el 21-10-2026).

describe('las semanas con fuerza', () => {
  const hoy = '2026-10-21'
  it('cuenta los bloques de siete días con alguna sesión de fuerza hecha', () => {
    expect(semanasConFuerza([
      { fecha_sesion: '2026-10-20', disciplina: 'Fuerza' },
      { fecha_sesion: '2026-10-19', disciplina: 'Fuerza' },
      { fecha_sesion: '2026-10-12', disciplina: 'Hibrido' },
      { fecha_sesion: '2026-10-02', disciplina: 'Fuerza' },
      { fecha_sesion: '2026-09-26', disciplina: 'Fuerza' },
    ], hoy)).toBe(4)
  })

  it('no cuentan las de resistencia, las borradas ni las de hace más de 4 semanas', () => {
    expect(semanasConFuerza([
      { fecha_sesion: '2026-10-20', disciplina: 'Carrera' },
      { fecha_sesion: '2026-10-19', disciplina: 'Fuerza', eliminada: true },
      { fecha_sesion: '2026-09-20', disciplina: 'Fuerza' },
    ], hoy)).toBe(0)
  })
})

describe('qué sentadilla cuenta', () => {
  it('la de dos piernas, no la búlgara, la goblet ni la saltada', () => {
    expect(esSentadilla('Sentadilla trasera')).toBe(true)
    expect(esSentadilla('Back squat')).toBe(true)
    expect(esSentadilla('Sentadilla búlgara')).toBe(false)
    expect(esSentadilla('Goblet squat')).toBe(false)
    expect(esSentadilla('Jump squat')).toBe(false)
    expect(esSentadilla('Peso muerto')).toBe(false)
  })
})

describe('los datos de la app', () => {
  const base = { fuerza: [], peso: null, sesiones: [], hoy: '2026-10-21' }

  it('el drop jump más reciente: el cajón en el protocolo y el contacto en lo medido, como texto', () => {
    const d = datosDeLaApp({
      ...base,
      campo: [
        { clave: 'dropjump', fecha: '2026-09-10', protocolo: { caja: '40' }, brutos: { contacto: '300' }, resultados: { salto: 20, rsi: 0.67 } },
        { clave: 'dropjump', fecha: '2026-10-12', protocolo: { caja: '30' }, brutos: { contacto: '270', salto: '24' }, resultados: { salto: 24, rsi: 0.89 } },
        { clave: 'bosco', fecha: '2026-10-05', resultados: { cmj: 31.4, sj: 28 } },
      ],
    })
    expect(d.caja).toBe(30)
    expect(d.contacto).toBe(270)
    expect(d.rsi).toBe(0.89)
    expect(d.cmj).toBe(31.4)
    expect(d.fechas).toEqual({ dropjump: '2026-10-12', cmj: '2026-10-05' })
  })

  it('el 1RM de la sentadilla más reciente y el peso, aunque lleguen como texto', () => {
    const d = datosDeLaApp({
      ...base,
      campo: [],
      fuerza: [
        { ejercicio: 'Sentadilla trasera', rm_estimado: '70', fecha: '2026-08-01' },
        { ejercicio: 'Sentadilla búlgara', rm_estimado: '40', fecha: '2026-10-15' },
        { ejercicio: 'Sentadilla trasera', rm_estimado: '76', fecha: '2026-10-01' },
      ],
      peso: '58',
    })
    expect(d.sentadilla).toBe(76)
    expect(d.peso).toBe(58)
  })

  it('sin tests, todo a null y cero semanas', () => {
    const d = datosDeLaApp({ ...base, campo: [] })
    expect([d.caja, d.contacto, d.rsi, d.cmj, d.sentadilla, d.peso, d.semanasFuerza]).toEqual([null, null, null, null, null, null, 0])
  })
})

describe('las comprobaciones guardadas', () => {
  it('se queda con lo que tiene la forma que toca', () => {
    expect(leerComprobaciones({ eqPie: true, silencio: false, asimetria: 6, raro: 'sí', otra: 3 })).toEqual({ eqPie: true, silencio: false, asimetria: 6 })
    expect(leerComprobaciones(null)).toEqual({})
    expect(leerComprobaciones([true])).toEqual({})
  })
})
