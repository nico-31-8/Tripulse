import { describe, it, expect } from 'vitest'
import { adaptar, horasAdaptadas, type SesionVista } from './plan-adaptacion'
import { sumarDias } from './desplazar'

const L = '2026-08-03'

/** n sesiones repartidas en `semanas`, con las `hechas` primeras realizadas. */
function ses(n: number, hechas: number, semanas = 2, rpe?: { esperado: number; reportado: number }): SesionVista[] {
  return Array.from({ length: n }, (_, i) => ({
    fecha: sumarDias(L, Math.floor((i / n) * semanas * 7)),
    estado: i < hechas ? 'Realizada' : 'Planificada',
    rpeEsperado: rpe?.esperado ?? null,
    rpeReportado: i < hechas ? (rpe?.reportado ?? null) : null,
  }))
}

describe('no tocar nada sin motivo', () => {
  /* Una semana mala es una gripe, un viaje o un niño malo. Dos seguidas ya es
     una tendencia. */
  it('con una sola semana no se ajusta', () => {
    const a = adaptar(ses(6, 2, 1), 6)
    expect(a.factorHoras).toBe(1)
    expect(a.aplicado).toEqual([])
  })

  it('con muy pocas sesiones tampoco', () => {
    expect(adaptar(ses(3, 1, 2), 6).factorHoras).toBe(1)
  })

  it('sin sesiones no revienta', () => {
    const a = adaptar([], 6)
    expect(a.factorHoras).toBe(1)
    expect(a.adherencia).toBeNull()
  })

  it('cumpliendo el plan, no se toca', () => {
    const a = adaptar(ses(12, 12, 2), 6)
    expect(a.factorHoras).toBe(1)
    expect(a.aplicado).toEqual([])
  })
})

describe('cuando no llega', () => {
  /* Un plan que no se sigue es peor que uno más pequeño que sí. */
  it('adherencia baja baja el volumen y lo explica', () => {
    const a = adaptar(ses(12, 5, 2), 6)
    expect(a.adherencia).toBe(42)
    expect(a.factorHoras).toBe(0.8)
    expect(a.aplicado.join(' ')).toMatch(/prefiero uno más corto que hagas entero/)
  })

  it('sugiere los días que de verdad entrena', () => {
    const a = adaptar(ses(12, 6, 2), 6)
    expect(a.diasSugeridos).toBe(3)
  })

  /* No se recorta hasta lo que hace exactamente: se baja un escalón y se vuelve
     a mirar. De golpe sería cambiar un problema por otro. */
  it('el recorte es de un escalón, no hasta el suelo', () => {
    const a = adaptar(ses(20, 2, 2), 6)
    expect(a.factorHoras).toBeGreaterThanOrEqual(0.8)
  })

  it('dejarse alguna afloja menos', () => {
    const a = adaptar(ses(10, 7, 2), 6)
    expect(a.factorHoras).toBe(0.9)
  })
})

describe('cuando le cuesta más de lo previsto', () => {
  it('baja la carga y avisa de que se vuelve a mirar', () => {
    const a = adaptar(ses(12, 12, 2, { esperado: 5, reportado: 8 }), 6)
    expect(a.factorHoras).toBeLessThanOrEqual(0.85)
    expect(a.aplicado.join(' ')).toMatch(/costando más de lo que tocaba/)
  })

  it('se queda con el recorte mayor, no los suma', () => {
    // Poca adherencia Y RPE alto no deben multiplicarse hasta dejarlo en nada.
    const a = adaptar(ses(12, 4, 2, { esperado: 5, reportado: 9 }), 6)
    expect(a.factorHoras).toBeGreaterThanOrEqual(0.8)
  })
})

describe('subir no se hace solo', () => {
  /* LA REGLA QUE MÁS IMPORTA. Un plan que se endurece por su cuenta es la forma
     más rápida de lesionar a alguien que iba bien. */
  it('si va sobrado, se PROPONE y no se aplica', () => {
    const a = adaptar(ses(12, 12, 2, { esperado: 8, reportado: 5 }), 6)
    expect(a.factorHoras).toBe(1)
    expect(a.aplicado).toEqual([])
    expect(a.propuesto.join(' ')).toMatch(/Dímelo y lo ajusto/)
  })

  it('y solo si además lo está haciendo todo', () => {
    // Va sobrado en lo que hace, pero se salta la mitad: eso no es ir sobrado.
    const a = adaptar(ses(12, 6, 2, { esperado: 8, reportado: 5 }), 6)
    expect(a.propuesto).toEqual([])
  })
})

describe('las horas resultantes', () => {
  it('se redondean a media hora', () => {
    expect(horasAdaptadas(10, adaptar(ses(12, 5, 2), 6))).toBe(8)
    expect(horasAdaptadas(9, adaptar(ses(10, 7, 2), 6))).toBe(8)
  })

  it('sin ajuste, las mismas', () => {
    expect(horasAdaptadas(10, adaptar(ses(12, 12, 2), 6))).toBe(10)
  })
})
