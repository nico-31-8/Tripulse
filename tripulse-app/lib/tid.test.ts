import { describe, it, expect } from 'vitest'
import { bandaDeZona, distribucionTID, clasificarTID, veredictoTID } from './tid'

describe('bandaDeZona', () => {
  it('mapea las Zonas 2 a las 3 bandas de Seiler', () => {
    expect(bandaDeZona('AER')).toBe('baja')
    expect(bandaDeZona('AEL')).toBe('baja')
    expect(bandaDeZona('AEM')).toBe('media')   // ⚓MLSS
    expect(bandaDeZona('AEI')).toBe('media')   // ⚓CSS
    expect(bandaDeZona('PAE')).toBe('alta')    // ⚓vVO₂máx
    expect(bandaDeZona('PALA')).toBe('alta')   // alácticas cuentan como alta (decisión de producto)
  })
  it('mapea también las zonas clásicas', () => {
    expect(bandaDeZona('Z2')).toBe('baja')
    expect(bandaDeZona('Z4')).toBe('media')
    expect(bandaDeZona('Z6')).toBe('alta')
  })
  it('null si la zona es desconocida o vacía', () => {
    expect(bandaDeZona(null)).toBeNull()
    expect(bandaDeZona('')).toBeNull()
    expect(bandaDeZona('XXX')).toBeNull()
  })
})

describe('distribucionTID', () => {
  it('reparte minutos y calcula porcentajes', () => {
    const d = distribucionTID([
      { zona: 'AEL', minutos: 160 }, { zona: 'AEM', minutos: 20 }, { zona: 'PAE', minutos: 20 },
    ])
    expect(d.minutos).toBe(200)
    expect(d.pctBaja).toBe(80)
    expect(d.pctMedia).toBe(10)
    expect(d.pctAlta).toBe(10)
  })
  it('los minutos sin zona no entran en los porcentajes pero se contabilizan', () => {
    const d = distribucionTID([{ zona: 'AEL', minutos: 100 }, { zona: null, minutos: 50 }])
    expect(d.minutos).toBe(100)
    expect(d.sinZona).toBe(50)
    expect(d.pctBaja).toBe(100)
  })
  it('ignora minutos nulos o negativos', () => {
    const d = distribucionTID([{ zona: 'AEL', minutos: 0 }, { zona: 'AEM', minutos: null }])
    expect(d.minutos).toBe(0)
    expect(d.pctBaja).toBe(0)
  })
})

describe('clasificarTID', () => {
  const dist = (b: number, m: number, a: number) =>
    distribucionTID([{ zona: 'AEL', minutos: b }, { zona: 'AEM', minutos: m }, { zona: 'PAE', minutos: a }])

  it('polarizado: bimodal, la alta pesa más que la media', () => {
    expect(clasificarTID(dist(80, 5, 15))).toBe('polarizado')
  })
  it('piramidal: pirámide descendente, la media pesa más que la alta', () => {
    expect(clasificarTID(dist(78, 17, 5))).toBe('piramidal')
  })
  it('umbral: mucha banda media', () => {
    expect(clasificarTID(dist(50, 40, 10))).toBe('umbral')
  })
  it('umbral también si la banda baja se hunde', () => {
    expect(clasificarTID(dist(45, 30, 25))).toBe('umbral')
  })
  it('null sin minutos', () => {
    expect(clasificarTID(dist(0, 0, 0))).toBeNull()
  })
})

describe('veredictoTID', () => {
  const polarizada = distribucionTID([{ zona: 'AEL', minutos: 80 }, { zona: 'AEM', minutos: 5 }, { zona: 'PAE', minutos: 15 }])
  const piramidal = distribucionTID([{ zona: 'AEL', minutos: 78 }, { zona: 'AEM', minutos: 17 }, { zona: 'PAE', minutos: 5 }])

  it('sin objetivo declarado NO juzga, solo describe', () => {
    const v = veredictoTID(piramidal)
    expect(v.tono).toBe('info')
    expect(v.modelo).toBe('piramidal')
  })
  it('coincide con lo planificado → ok', () => {
    const v = veredictoTID(piramidal, 'piramidal')
    expect(v.tono).toBe('ok')
    expect(v.titulo).toContain('como estaba previsto')
  })
  it('se desvía de lo planificado → aviso que nombra ambos modelos', () => {
    const v = veredictoTID(polarizada, 'piramidal')
    expect(v.tono).toBe('aviso')
    expect(v.titulo).toContain('Polarizada')
    expect(v.titulo).toContain('piramidal')
  })
  it('la banda media NO se castiga si el bloque era de umbral', () => {
    const umbral = distribucionTID([{ zona: 'AEL', minutos: 50 }, { zona: 'AEM', minutos: 40 }, { zona: 'PAE', minutos: 10 }])
    expect(veredictoTID(umbral, 'umbral').tono).toBe('ok')
  })
  it('sin datos de zona lo dice claramente', () => {
    const v = veredictoTID(distribucionTID([{ zona: null, minutos: 90 }]))
    expect(v.modelo).toBeNull()
    expect(v.tono).toBe('info')
  })
})
