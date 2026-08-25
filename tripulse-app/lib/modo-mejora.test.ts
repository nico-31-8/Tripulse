import { describe, it, expect } from 'vitest'
import {
  seriesPrincipales, resumenUltimaVez, controlUltimaVez, volumenDe,
  haSuperado, serieAnterior, haceTexto,
} from './modo-mejora'

const SERIES = [
  { numero_serie: 1, peso_real: 80, repeticiones_reales: 8, control_real: 2, control_tipo: 'rir', ejercicio_numero: 1 },
  { numero_serie: 2, peso_real: 80, repeticiones_reales: 8, control_real: 2, control_tipo: 'rir', ejercicio_numero: 1 },
  { numero_serie: 3, peso_real: 75, repeticiones_reales: 6, control_real: 1, control_tipo: 'rir', ejercicio_numero: 1 },
]

describe('seriesPrincipales', () => {
  it('deja fuera las del encadenado de una superserie', () => {
    /* Si entraran, «la última vez» sumaría press banca dentro de la sentadilla. */
    const conEncadenado = [...SERIES, { numero_serie: 1, peso_real: 40, repeticiones_reales: 10, ejercicio_numero: 2 }]
    expect(seriesPrincipales(conEncadenado)).toHaveLength(3)
  })

  it('sin ejercicio_numero se asume el principal, que es lo que hay en lo antiguo', () => {
    expect(seriesPrincipales([{ peso_real: 50 }])).toHaveLength(1)
  })

  it('sin series, lista vacía', () => {
    expect(seriesPrincipales(null)).toEqual([])
  })
})

describe('resumenUltimaVez', () => {
  it('peso por reps, serie a serie', () => {
    expect(resumenUltimaVez(SERIES)).toBe('80×8 · 80×8 · 75×6')
  })

  it('sin peso, solo las reps: el peso corporal no es cero', () => {
    expect(resumenUltimaVez([{ repeticiones_reales: 12, ejercicio_numero: 1 }])).toBe('12 reps')
  })

  it('por tiempo enseña segundos, que es lo que hay que superar', () => {
    const porTiempo = [
      { numero_serie: 1, tiempo_real: 45, ejercicio_numero: 1 },
      { numero_serie: 2, tiempo_real: 40, peso_real: 10, ejercicio_numero: 1 },
    ]
    expect(resumenUltimaVez(porTiempo, true)).toBe('45s · 10kg·40s')
  })

  it('lo que falta sale como interrogante, no como cero', () => {
    expect(resumenUltimaVez([{ peso_real: 80, ejercicio_numero: 1 }])).toBe('80×?')
  })
})

describe('controlUltimaVez', () => {
  it('un solo valor si todas coinciden', () => {
    expect(controlUltimaVez(SERIES.slice(0, 2))).toEqual({ etiqueta: 'RIR', valor: '2' })
  })

  it('un rango si no', () => {
    expect(controlUltimaVez(SERIES)).toEqual({ etiqueta: 'RIR', valor: '1-2' })
  })

  it('la etiqueta es la de AQUEL día, no la de hoy', () => {
    /* Si aquel día se anotó en RPE, poner «RIR 8» encima sería mentir sobre el
       histórico aunque hoy prescribas RIR. */
    const enRpe = [{ numero_serie: 1, control_real: 8, control_tipo: 'rpe', ejercicio_numero: 1 }]
    expect(controlUltimaVez(enRpe).etiqueta).toBe('RPE')
  })

  it('sin control anotado, valor vacío pero etiqueta igual', () => {
    expect(controlUltimaVez([{ numero_serie: 1, peso_real: 80, ejercicio_numero: 1 }])).toEqual({ etiqueta: 'RIR', valor: '' })
  })
})

describe('volumenDe', () => {
  it('kg por reps, sumado', () => {
    expect(volumenDe(SERIES)).toBe(80 * 8 + 80 * 8 + 75 * 6)
  })

  it('en los de tiempo son los segundos, no kg×reps', () => {
    /* Con la fórmula de reps, un ejercicio por tiempo daría 0 siempre y el aviso
       de «lo has superado» no saltaría nunca. */
    const porTiempo = [{ tiempo_real: 45, ejercicio_numero: 1 }, { tiempo_real: 40, ejercicio_numero: 1 }]
    expect(volumenDe(porTiempo, true)).toBe(85)
    expect(volumenDe(porTiempo, false)).toBe(0)
  })

  it('sin nada, cero', () => {
    expect(volumenDe([])).toBe(0)
    expect(volumenDe(null)).toBe(0)
  })
})

describe('haSuperado', () => {
  it('igualar cuenta como superar', () => {
    expect(haSuperado(1000, 1000)).toBe(true)
    expect(haSuperado(1000, 1200)).toBe(true)
    expect(haSuperado(1000, 999)).toBe(false)
  })

  it('sin última vez no hay nada que superar', () => {
    expect(haSuperado(0, 500)).toBe(false)
  })
})

describe('serieAnterior', () => {
  it('la misma serie de la vez pasada', () => {
    expect(serieAnterior(SERIES, 3)?.peso_real).toBe(75)
    expect(serieAnterior(SERIES, 9)).toBeUndefined()
  })
})

describe('haceTexto', () => {
  it('en cristiano', () => {
    expect(haceTexto(0)).toBe('hoy')
    expect(haceTexto(1)).toBe('ayer')
    expect(haceTexto(5)).toBe('hace 5 días')
    expect(haceTexto(null)).toBe('')
  })
})
