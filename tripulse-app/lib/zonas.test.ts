import { describe, it, expect } from 'vitest'
import {
  zonaResistencia, prescripcion, pctVamZona, velNatacionZona,
  tablaIntensidades, cargaZona, ZONAS_RESISTENCIA,
} from './zonas'

describe('zonaResistencia', () => {
  it('encuentra una zona por sigla', () => {
    expect(zonaResistencia('AER')?.sigla).toBe('AER')
  })
  it('devuelve null para sigla desconocida o vacía', () => {
    expect(zonaResistencia('NOPE')).toBeNull()
    expect(zonaResistencia(null)).toBeNull()
  })
})

describe('prescripcion — natación (regresión del bug de ritmo)', () => {
  const aer = zonaResistencia('AER')!  // CSS +20s o más lento (borde abierto)
  const aem = zonaResistencia('AEM')!  // CSS +4–8s (rango)

  it('con CSS calcula un ritmo concreto por 100m, NO la etiqueta relativa', () => {
    const r = prescripcion(aer, 'Natacion', { css: 1.4 })
    expect(r).toMatch(/\/100m/)
    expect(r).not.toBe(aer.css) // ya no devuelve "CSS +20s o más lento"
  })
  it('AER (borde abierto) da un ritmo con ">"', () => {
    expect(prescripcion(aer, 'Natacion', { css: 1.4 })).toMatch(/^>/)
  })
  it('acepta la disciplina escrita con acento (Natación)', () => {
    expect(prescripcion(aem, 'Natación', { css: 1.4 })).toMatch(/\/100m/)
  })
  it('sin CSS cae a la etiqueta relativa del catálogo', () => {
    expect(prescripcion(aer, 'Natacion', {})).toBe(aer.css)
  })
})

describe('prescripcion — carrera y ciclismo', () => {
  const aem = zonaResistencia('AEM')!

  it('carrera con VAM da ritmo /km; sin VAM da % VAM', () => {
    expect(prescripcion(aem, 'Carrera', { vam: 15 })).toMatch(/\/km/)
    expect(prescripcion(aem, 'Carrera', {})).toMatch(/% VAM/)
  })
  it('ciclismo con FTP da vatios; sin FTP da % FTP', () => {
    expect(prescripcion(aem, 'Ciclismo', { ftp: 250 })).toMatch(/W$/)
    expect(prescripcion(aem, 'Ciclismo', {})).toMatch(/% FTP/)
  })
})

describe('velNatacionZona', () => {
  it('una zona más lenta que el CSS da una velocidad menor que el CSS', () => {
    const css = 1.4
    const v = velNatacionZona('AER', css) // AER = CSS+20 → más lento
    expect(v).not.toBeNull()
    expect(v!).toBeLessThan(css)
  })
  it('las zonas de sprint (sin desfase) devuelven null', () => {
    expect(velNatacionZona('PLA', 1.4)).toBeNull()
    expect(velNatacionZona('CALA', 1.4)).toBeNull()
  })
  it('sin CSS válido devuelve null', () => {
    expect(velNatacionZona('AER', 0)).toBeNull()
  })
})

describe('pctVamZona', () => {
  it('devuelve un % para una zona con bordes', () => {
    expect(pctVamZona('AEM')!).toBeGreaterThan(0)
  })
  it('null para sigla desconocida', () => {
    expect(pctVamZona('NOPE')).toBeNull()
  })
})

describe('cargaZona', () => {
  it('mapea una sigla Zonas2 a nivel/RPE dentro de rango', () => {
    const c = cargaZona('AEM')
    expect(c.nivel).toBeGreaterThanOrEqual(1)
    expect(c.nivel).toBeLessThanOrEqual(7)
    expect(c.rpe).toBeGreaterThan(0)
  })
  it('mapea el sistema clásico Z1–Z7', () => {
    expect(cargaZona('Z3').nivel).toBe(3)
  })
  it('sigla desconocida cae al fallback (nivel 2)', () => {
    expect(cargaZona('???').nivel).toBe(2)
  })
})

describe('tablaIntensidades', () => {
  it('devuelve las 9 zonas de resistencia con sus columnas', () => {
    const t = tablaIntensidades({ vam: 15, css: 1.4, ftp: 250 }, 190)
    expect(t).toHaveLength(ZONAS_RESISTENCIA.length)
    for (const col of ['sigla', 'natacion', 'carrera', 'ciclismo', 'fc', 'rpe']) {
      expect(t[0]).toHaveProperty(col)
    }
  })
  it('con CSS, la natación de una zona con desfase muestra ritmo /100m', () => {
    const t = tablaIntensidades({ css: 1.4 }, null)
    expect(t.find(r => r.sigla === 'AEM')!.natacion).toMatch(/\/100m/)
  })
})
