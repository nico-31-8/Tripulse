import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

import { costeSesion, factorSicatZona } from './sicat-zonas'
import type { SicatZonasResultado, CeldaZona } from './sicat-zonas'

// costeSesion(d0, d24, d48, hrvDiaSiguiente, hrvBasal, rpe) → 0-100.
// Compone DOMS (40%) + caída de HRV (35%) + RPE (25%). Lo delicado es que los pesos
// se REDISTRIBUYEN cuando falta una señal: un atleta que no lleva HRV no puede salir
// artificialmente barato solo por no tener el dato.

describe('costeSesion — dirección de cada señal', () => {
  it('más DOMS → más coste', () => {
    expect(costeSesion(6, 6, 6, null, 0, null)!).toBeGreaterThan(costeSesion(1, 1, 1, null, 0, null)!)
  })
  it('más RPE → más coste', () => {
    expect(costeSesion(null, null, null, null, 0, 9)!).toBeGreaterThan(costeSesion(null, null, null, null, 0, 3)!)
  })
  it('más caída de HRV → más coste', () => {
    const caidaFuerte = costeSesion(null, null, null, 51, 60, null)!  // -15%
    const caidaLeve = costeSesion(null, null, null, 58, 60, null)!    // -3%
    expect(caidaFuerte).toBeGreaterThan(caidaLeve)
  })
  it('HRV POR ENCIMA de la basal no genera coste negativo', () => {
    expect(costeSesion(null, null, null, 80, 60, null)).toBe(0)
  })
  it('la caída de HRV satura en el -15%: peor que eso ya es el máximo', () => {
    expect(costeSesion(null, null, null, 51, 60, null)).toBe(100)  // -15%
    expect(costeSesion(null, null, null, 30, 60, null)).toBe(100)  // -50%
  })
})

describe('costeSesion — escala y extremos', () => {
  it('el suelo de la escala es 0 y el techo 100', () => {
    expect(costeSesion(1, 1, 1, null, 0, null)).toBe(0)
    expect(costeSesion(7, 7, 7, null, 0, null)).toBe(100)
  })
  it('DOMS usa la escala 1-7 del wellness: 1 es "nada", no "poco"', () => {
    expect(costeSesion(1, 1, 1, null, 0, null)).toBe(0)
  })
  it('el DOMS que persiste a 24/48h pesa más que el inmediato', () => {
    const soloInmediato = costeSesion(7, 1, 1, null, 0, null)!
    const persistente = costeSesion(1, 7, 7, null, 0, null)!
    expect(persistente).toBeGreaterThan(soloInmediato)
  })
})

describe('costeSesion — señales que faltan', () => {
  it('sin ninguna señal devuelve null (no un cero que parezca "sesión gratis")', () => {
    expect(costeSesion(null, null, null, null, 0, null)).toBeNull()
  })
  it('sin HRV basal la señal de HRV no entra', () => {
    expect(costeSesion(null, null, null, 40, 0, null)).toBeNull()
  })
  it('los pesos se redistribuyen: una sola señal al máximo da 100, no su peso', () => {
    // si NO se redistribuyeran, solo RPE daría 25 en vez de 100
    expect(costeSesion(null, null, null, null, 0, 10)).toBe(100)
    expect(costeSesion(7, 7, 7, null, 0, null)).toBe(100)
  })
  it('dos señales al máximo siguen dando 100', () => {
    expect(costeSesion(7, 7, 7, 51, 60, 10)).toBe(100)
  })
  it('una señal al máximo y otra a cero queda en medio, ponderado', () => {
    // DOMS máx (w .40) + RPE cero (w .25) → (1*.40 + 0*.25) / .65 = .615
    expect(costeSesion(7, 7, 7, null, 0, 0)).toBeCloseTo(61.5, 1)
  })
  it('con solo DOMS parcial (sin 24/48h) el peso del DOMS no se pierde', () => {
    expect(costeSesion(7, null, null, null, 0, null)).toBe(100)
  })
})

describe('factorSicatZona — cuándo fiarse de una celda', () => {
  const celda = (disciplina: string, zona: string, n: number, multiplicador: number): CeldaZona =>
    ({ disciplina: disciplina as any, zona, n, costeMedio: 50, multiplicador,
       confianza: n >= 5 ? 'alta' : n >= 3 ? 'media' : 'baja' })

  const res: SicatZonasResultado = {
    celdas: [
      celda('Carrera', 'PAE', 6, 1.35),
      celda('Ciclismo', 'AEL', 4, 0.8),
      celda('Natacion', 'CLA', 2, 2.5),   // pocas muestras: no fiable
    ],
    costeMedioGlobal: 50, nSesiones: 12,
  }

  it('devuelve el multiplicador de la celda cuando hay muestras suficientes', () => {
    expect(factorSicatZona('Carrera', 'PAE', res)).toBe(1.35)
    expect(factorSicatZona('Ciclismo', 'AEL', res)).toBe(0.8)
  })
  it('con menos de 3 muestras devuelve null para que el consumidor caiga al SICAT de disciplina', () => {
    expect(factorSicatZona('Natacion', 'CLA', res)).toBeNull()
  })
  it('una celda que no existe devuelve null, no un 1 silencioso', () => {
    expect(factorSicatZona('Carrera', 'AER', res)).toBeNull()
  })
  it('no cruza disciplinas: misma zona en otro deporte es otra celda', () => {
    expect(factorSicatZona('Ciclismo', 'PAE', res)).toBeNull()
  })
  it('sin resultado devuelve null', () => {
    expect(factorSicatZona('Carrera', 'PAE', null)).toBeNull()
  })
})
