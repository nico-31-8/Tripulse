import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

import { costeSesion, factorSicatZona, conZonaPico, zonaDeCoste } from './sicat-zonas'
import { expandirEnBloques } from './atribucion'
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

// La HRV del reloj de la noche siguiente, solo como respaldo (20-10-2026): llega
// en tanto por uno de la base de su reloj (lib/sicat-hrv) y pesa como la caída
// de la mañana frente a su basal.
describe('costeSesion — la HRV del reloj como respaldo', () => {
  it('sin HRV de la mañana, la caída del reloj frente a su base pesa igual', () => {
    expect(costeSesion(null, null, null, null, 60, null, 0.85)).toBe(100)  // -15%
    expect(costeSesion(null, null, null, null, 0, null, 0.97)).toBe(costeSesion(null, null, null, 58.2, 60, null))  // -3%
  })
  it('por encima de su base no genera coste', () => {
    expect(costeSesion(null, null, null, null, 60, null, 1.2)).toBe(0)
  })
  it('la de la mañana manda si la hay', () => {
    expect(costeSesion(null, null, null, 60, 60, null, 0.5)).toBe(0)
  })
  it('sin basal, la de la mañana no se puede comparar y cuenta la del reloj', () => {
    expect(costeSesion(null, null, null, 40, 0, null, 0.85)).toBe(100)
  })
  it('sin ninguna de las dos, como antes: la HRV no pesa', () => {
    expect(costeSesion(null, null, null, null, 60, 6, null)).toBe(costeSesion(null, null, null, null, 60, 6))
    expect(costeSesion(null, null, null, null, 60, 6, 0)).toBe(costeSesion(null, null, null, null, 60, 6))
  })
})

/*
  LA MISMA SESIÓN PESA LO MISMO EN LAS TRES PANTALLAS (con «ponderar por zona»,
  21-10-2026). /carga y /volumen multiplican la sesión entera por el factor de
  su zona pico; el desglose por disciplina la reparte en bloques, y ponderaba
  cada uno con la zona de SU tarea. Como el factor sale de sesiones enteras
  agrupadas por su zona pico (calcularSicatZonas), lo coherente es lo primero.
*/
describe('la misma sesión pesa lo mismo en /carga, /volumen y el desglose', () => {
  /* 60′ de carrera a RPE 6 = 360 UA: 45′ en AEL y 15′ en PLA. */
  const sesion = { id: 7, fecha_sesion: '2026-10-01', disciplina: 'Carrera', duracion_minutos: 60, rpe_reportado: 6 }
  const tareas = [
    { id: 1, id_sesion: 7, orden: 1, series: 1, disciplina: 'Carrera', zona_entrenamiento: 'AEL', zona_copia: null, p_duracion: [{ tiempo_planeado: 2700 }] },
    { id: 2, id_sesion: 7, orden: 2, series: 1, disciplina: 'Carrera', zona_entrenamiento: 'PLA', zona_copia: null, p_duracion: [{ tiempo_planeado: 900 }] },
  ]
  const celda = (zona: string, multiplicador: number): CeldaZona =>
    ({ disciplina: 'Carrera', zona, n: 5, costeMedio: 50 * multiplicador, multiplicador, confianza: 'alta' })
  const zonas: SicatZonasResultado = { celdas: [celda('PLA', 1.4), celda('AEL', 0.8)], costeMedioGlobal: 50, nSesiones: 10 }
  const factor = (disciplina: string, zona: string | null) => (zona ? factorSicatZona(disciplina, zona, zonas) : null) ?? 1
  const [conPico] = conZonaPico([sesion], tareas)

  it('/carga y /volumen: la sesión entera, con el factor de su zona pico', () => {
    expect(conPico.zonaPico).toBe('PLA')
    expect(6 * 60 * factor('Carrera', conPico.zonaPico)).toBeCloseTo(504, 6)
  })

  it('el desglose, bloque a bloque con la zona con la que se midió su coste: lo mismo', () => {
    const bloques = expandirEnBloques([sesion], tareas, { estimar: false })
    expect(bloques.map(b => [b.zona, b.minutos, b.ua])).toEqual([['AEL', 45, 270], ['PLA', 15, 90]])
    expect(bloques.reduce((a, b) => a + b.ua * factor(b.disciplina, zonaDeCoste(conPico, b)), 0)).toBeCloseTo(504, 6)
    /* Con la zona de cada tarea, como lo hacía, salían 342: otra cifra para la misma sesión. */
    expect(bloques.reduce((a, b) => a + b.ua * factor(b.disciplina, b.zona), 0)).toBeCloseTo(342, 6)
  })

  it('en un brick, cada bloque con la suya: así lo mide el SICAT', () => {
    expect(zonaDeCoste({ disciplina: 'Brick', zonaPico: 'PLA' }, { zona: 'AEL' })).toBe('AEL')
    expect(zonaDeCoste({ disciplina: 'Carrera', zonaPico: 'PLA' }, { zona: 'AEL' })).toBe('PLA')
    /* Sin saber de qué sesión es, ninguna: se cae al factor del deporte. */
    expect(zonaDeCoste(undefined, { zona: 'AEL' })).toBeNull()
  })
})
