import { describe, it, expect, vi } from 'vitest'

// sicat.ts crea el cliente de Supabase al importarse y sin env vars revienta.
// Estos tests solo tocan las funciones puras, así que basta con un doble vacío.
vi.mock('./supabase', () => ({ supabase: {} }))

import { calcularF1, calcularF2, calcularF3, calcularF4, calcularCorrectorHRV, factorSicat } from './sicat'
import type { SicatResultado, FactorSicatDisc } from './sicat'

// Los cuatro factores del SICAT viven en una escala 1-4 donde MÁS ES MÁS COSTOSO.
// Esa dirección es lo primero que hay que blindar: si algún día se invierte, la app
// no rompe, solo aconseja al revés (el mismo fallo silencioso que tuvo el wellness).

describe('F1 — dificultad técnica', () => {
  const fila = (sensacion: number | null) => ({ sensacion_tecnica: sensacion })

  it('poca sensación técnica → MÁS coste (F1 alto)', () => {
    expect(calcularF1([fila(1)], null)).toBe(4)
  })
  it('mucha sensación técnica → MENOS coste (F1 bajo)', () => {
    expect(calcularF1([fila(4)], null)).toBe(1)
  })
  it('promedia la sensación del atleta con la valoración del entrenador', () => {
    // atleta 4 (se siente cómodo) + entrenador 2 (le ve fallos) → media 3 → 5-3 = 2
    expect(calcularF1([fila(4)], 2)).toBe(2)
  })
  it('con solo una de las dos fuentes usa esa', () => {
    expect(calcularF1([fila(2)], null)).toBe(calcularF1([], 2))
  })
  it('sin ninguna fuente devuelve null, no un valor inventado', () => {
    expect(calcularF1([], null)).toBeNull()
    expect(calcularF1([fila(null)], null)).toBeNull()
  })
  it('queda acotado a 1-4 aunque entren valores fuera de escala', () => {
    expect(calcularF1([fila(9)], null)).toBe(1)
    expect(calcularF1([fila(-5)], null)).toBe(4)
  })
})

describe('F2 — DOMS (dolor muscular)', () => {
  const fila = (d0: number, d24?: number | null, d48?: number | null) =>
    ({ dolor_muscular: d0, dolor_24h: d24 ?? null, dolor_48h: d48 ?? null })

  it('más dolor → más coste', () => {
    const bajo = calcularF2([fila(1, 1, 1)])!
    const alto = calcularF2([fila(6, 6, 6)])!
    expect(alto).toBeGreaterThan(bajo)
  })
  it('el dolor a 24h y 48h pesa más que el inmediato', () => {
    // mismo dolor total repartido distinto: el que persiste debe costar más
    const soloInmediato = calcularF2([fila(7, 1, 1)])!
    const persistente = calcularF2([fila(1, 7, 7)])!
    expect(persistente).toBeGreaterThan(soloInmediato)
  })
  it('sin DOMS a 24/48h se arrastra el inmediato (no se cuenta como cero)', () => {
    expect(calcularF2([fila(5, null, null)])).toBe(calcularF2([fila(5, 5, 5)]))
  })
  it('sin dato de dolor devuelve null', () => {
    expect(calcularF2([])).toBeNull()
    expect(calcularF2([{ dolor_muscular: null }])).toBeNull()
  })
  it('acotado a 1-4', () => {
    expect(calcularF2([fila(7, 7, 7)])).toBeLessThanOrEqual(4)
    expect(calcularF2([fila(1, 1, 1)])).toBeGreaterThanOrEqual(1)
  })
})

describe('F3 — degradación técnica en sesiones duras', () => {
  const dura = (sensacion: number | null) => ({ rpe_reportado: 9, sensacion_tecnica: sensacion })
  const suave = (sensacion: number | null) => ({ rpe_reportado: 4, sensacion_tecnica: sensacion })

  it('sin sesiones duras el factor es neutro (1)', () => {
    expect(calcularF3([suave(1), suave(2)])).toBe(1)
  })
  it('aguanta la técnica en duro → 1', () => {
    expect(calcularF3([dura(4), dura(4)])).toBe(1)
  })
  it('se le cae la técnica en duro → 4', () => {
    expect(calcularF3([dura(1), dura(1)])).toBe(4)
  })
  it('solo miran las sesiones duras, las suaves no diluyen', () => {
    expect(calcularF3([dura(1), suave(1), suave(1)])).toBe(4)
  })

  // El caso que motivó el test: en Supabase `sensacion_tecnica` es nullable y en JS
  // `null < 3` es TRUE (null → 0). Una sesión dura sin sensación reportada se contaba
  // como "técnica degradada" e inflaba el SICAT sin que nadie lo viera.
  it('una sesión dura SIN sensación reportada no cuenta como degradada', () => {
    expect(calcularF3([dura(null), dura(null)])).toBe(1)
  })
  it('las duras sin dato no diluyen ni inflan: solo puntúan las que sí lo tienen', () => {
    // 1 de 2 con dato está degradada → 50% → 1 + round(0.5*3) = 3
    expect(calcularF3([dura(1), dura(4), dura(null)])).toBe(3)
  })
})

describe('F4 — coste cardiovascular', () => {
  const fila = (fc: number, rpe: number) => ({ fc_media: fc, rpe_reportado: rpe })

  it('más FC relativa y más RPE → más coste', () => {
    expect(calcularF4([fila(170, 9)], 180)!).toBeGreaterThan(calcularF4([fila(120, 3)], 180)!)
  })
  it('sin FC de referencia devuelve null (no divide por cero)', () => {
    expect(calcularF4([fila(150, 7)], 0)).toBeNull()
  })
  it('sin filas con FC y RPE devuelve null', () => {
    expect(calcularF4([{ fc_media: null, rpe_reportado: 7 }], 180)).toBeNull()
    expect(calcularF4([], 180)).toBeNull()
  })
  it('acotado a 1-4 incluso con datos extremos', () => {
    expect(calcularF4([fila(200, 10)], 100)).toBe(4)
    expect(calcularF4([fila(50, 1)], 200)).toBe(1)
  })
})

describe('corrector HRV', () => {
  it('HRV por debajo de la basal → corrector > 1 (la sesión costó más)', () => {
    expect(calcularCorrectorHRV([{ hrv_dia: 40 }], 60)).toBeGreaterThan(1)
  })
  it('HRV por encima de la basal → corrector < 1', () => {
    expect(calcularCorrectorHRV([{ hrv_dia: 80 }], 60)).toBeLessThan(1)
  })
  it('HRV igual a la basal → neutro', () => {
    expect(calcularCorrectorHRV([{ hrv_dia: 60 }], 60)).toBe(1)
  })
  it('sin datos o sin basal → neutro, nunca penaliza por ausencia', () => {
    expect(calcularCorrectorHRV([], 60)).toBe(1)
    expect(calcularCorrectorHRV([{ hrv_dia: 40 }], 0)).toBe(1)
  })
  it('acepta la entrada manual de la tarea como respaldo del wellness', () => {
    expect(calcularCorrectorHRV([{ hrv_del_dia: 40 }], 60))
      .toBe(calcularCorrectorHRV([{ hrv_dia: 40 }], 60))
  })
})

describe('factorSicat — ponderación de la carga', () => {
  const disc = (porcentaje: number | null): FactorSicatDisc =>
    ({ sesiones: 5, f1: 2, f2: 2, f3: 2, f4: 2, total: 8, corrector: 1, porcentaje })
  const res = { Natacion: disc(100), Ciclismo: disc(70), Carrera: disc(null) } as unknown as SicatResultado

  it('la disciplina más costosa pondera 1', () => {
    expect(factorSicat('Natacion', res)).toBe(1)
  })
  it('una disciplina más barata pondera menos', () => {
    expect(factorSicat('Ciclismo', res)).toBe(0.7)
  })
  it('sin porcentaje calculado cae a neutro (1), no a cero', () => {
    expect(factorSicat('Carrera', res)).toBe(1)
  })
  it('Fuerza queda fuera del modelo → neutro', () => {
    expect(factorSicat('Fuerza', res)).toBe(1)
  })
  it('sin resultado SICAT → neutro', () => {
    expect(factorSicat('Natacion', null)).toBe(1)
  })
})

// ------------------------------------------------------------
// FC umbral — criterio único en toda la app
// ------------------------------------------------------------
// El resto de la app (/indices, tareas-tabla, panel-metricas, calendario, bloques)
// estima la FC umbral como el 85% de la máxima. calcularSICAT usaba la máxima a
// secas aunque la variable ya se llamaba fcUmbral, así que F4 salía sistemáticamente
// más bajo solo en el SICAT. Este test fija el criterio.
describe('F4 y la FC umbral', () => {
  const FC_MAX = 190
  const UMBRAL = FC_MAX * 0.85    // 161,5 ppm

  it('la misma sesión cuesta más medida contra el umbral que contra la máxima', () => {
    // 140 ppm es el 74% de la máxima pero el 87% del umbral: no es el mismo esfuerzo.
    const filas = [{ fc_media: 140, rpe_reportado: 5 }]
    expect(calcularF4(filas, UMBRAL)).toBe(3)
    expect(calcularF4(filas, FC_MAX)).toBe(2)
  })

  it('dividir por la máxima infravalora el coste de forma sistemática', () => {
    const filas = [{ fc_media: 145, rpe_reportado: 4 }]
    expect(calcularF4(filas, UMBRAL)!).toBeGreaterThan(calcularF4(filas, FC_MAX)!)
  })

  it('sigue acotado a 1-4 con el umbral nuevo', () => {
    expect(calcularF4([{ fc_media: 200, rpe_reportado: 10 }], UMBRAL)).toBe(4)
    expect(calcularF4([{ fc_media: 60, rpe_reportado: 1 }], UMBRAL)).toBe(1)
  })
})
