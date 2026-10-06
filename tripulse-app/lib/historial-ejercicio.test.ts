// ============================================================
// El historial de un ejercicio
// ============================================================
//
// EL CASO QUE LO DECIDE TODO, y es real. El hip thrust de un atleta:
//
//     20 ago · 50 kg · 5 · 5 · 5 · 5
//     28 ago · 50 kg · 7 · 7 · 7 · 7
//      7 sep · 50 kg · 7 · 9 · 10
//
// Progresó, y el peso no se movió un kilo. Si esto se midiera con «el peso
// máximo del día» —que es lo que uno hace sin pensar— diría 50, 50, 50: no
// progresa. El primer test es ese, con sus números.

import { describe, it, expect } from 'vitest'
import {
  claveDeEjercicio, historialPorDia, queCambio, type SerieAnotada,
} from './historial-ejercicio'

const s = (fecha: string, peso: number | null, reps: number | null, extra: Partial<SerieAnotada> = {}): SerieAnotada =>
  ({ fecha, peso, reps, ...extra })

/** El hip thrust de verdad. */
const HIP = [
  ...[5, 5, 5, 5].map(r => s('2026-08-20', 50, r)),
  ...[7, 7, 7, 7].map(r => s('2026-08-28', 50, r)),
  ...[7, 9, 10].map(r => s('2026-09-07', 50, r)),
]

describe('EL PESO SOLO MENTIRÍA', () => {
  const dias = historialPorDia(HIP)

  it('el peso es el mismo los tres días', () => {
    expect(dias.map(d => d.pesoTop)).toEqual([50, 50, 50])
  })

  it('y las repeticiones enseñan la progresión', () => {
    /* 26 → 28 → 20. El 7 de septiembre hizo una serie menos pero más reps por
       serie: por eso hace falta ver las dos cosas y no un número solo. */
    expect(dias.map(d => d.reps)).toEqual([26, 28, 20])
  })

  it('las series de cada día se conservan, no solo el resumen', () => {
    expect(dias[0].series.map(x => x.reps)).toEqual([7, 9, 10])
  })

  it('el trabajo total es peso × reps de cada serie', () => {
    expect(dias.find(d => d.fecha === '2026-08-28')!.trabajo).toBe(50 * 7 * 4)
  })
})

describe('el orden y el agrupado', () => {
  it('del más reciente al más antiguo', () => {
    expect(historialPorDia(HIP).map(d => d.fecha))
      .toEqual(['2026-09-07', '2026-08-28', '2026-08-20'])
  })

  it('POR DÍA, no por sesión', () => {
    /* Dos sesiones el mismo día con el mismo ejercicio son el mismo estímulo:
       partirlas en dos puntos haría ver una caída donde solo hubo un descanso
       de dos horas. */
    const r = historialPorDia([s('2026-10-01', 40, 10), s('2026-10-01', 40, 8)])
    expect(r).toHaveLength(1)
    expect(r[0].reps).toBe(18)
  })

  it('la fecha con hora se corta al día', () => {
    expect(historialPorDia([s('2026-10-01T18:30:00Z', 40, 10)])[0].fecha).toBe('2026-10-01')
  })

  it('sin fecha no se cuenta: no hay dónde ponerlo', () => {
    expect(historialPorDia([s('', 40, 10)])).toEqual([])
  })
})

describe('las series a medias', () => {
  it('una sin peso no suma trabajo, pero sus reps sí cuentan', () => {
    /* Sumar a medias sería inventar; tirar la serie entera escondería que hizo
       diez repeticiones. */
    const d = historialPorDia([s('2026-10-01', null, 10), s('2026-10-01', 20, 5)])[0]
    expect(d.reps).toBe(15)
    expect(d.trabajo).toBe(100)
  })

  it('un día sin ningún peso no inventa un pesoTop', () => {
    expect(historialPorDia([s('2026-10-01', null, 10)])[0].pesoTop).toBeNull()
  })

  it('el peso en texto se lee igual, que así vuelve de la base', () => {
    expect(historialPorDia([s('2026-10-01', '22.5' as unknown as number, 8)])[0].pesoTop).toBe(22.5)
  })
})

describe('el esfuerzo anotado', () => {
  it('se marca el día que lo lleva', () => {
    const r = historialPorDia([s('2026-10-01', 50, 8, { control: 2, controlTipo: 'rir' })])
    expect(r[0].conControl).toBe(true)
    expect(r[0].series[0].controlTipo).toBe('rir')
  })

  it('y el que no, también se sabe', () => {
    /* Sin esfuerzo, 50 × 10 no dice si fue fácil o si no pudo con más. Que se
       vea cuál es cuál evita comparar dos días que no son comparables. */
    expect(historialPorDia([s('2026-10-01', 50, 10)])[0].conControl).toBe(false)
  })
})

describe('qué cambió desde la vez anterior', () => {
  it('LA DICE EN REPETICIONES CUANDO EL PESO NO SE MUEVE', () => {
    /* El caso del hip thrust. Diciendo solo «mismo peso» se perdería la
       progresión entera. */
    const dias = historialPorDia([
      ...[5, 5, 5, 5].map(r => s('2026-08-20', 50, r)),
      ...[7, 7, 7, 7].map(r => s('2026-08-28', 50, r)),
    ])
    expect(queCambio(dias)).toBe('mismo peso, +8 repeticiones')
  })

  it('CON OTRO NÚMERO DE SERIES NO SE JUZGA, se dice', () => {
    /* El caso real del 7 de septiembre: de 4×7 (28 reps) a 7+9+10 (26). La
       resta diría «menos repeticiones» y lo que hizo fue subir de 7 a 10 por
       serie. Comparar totales con distinto número de series es inventarse un
       retroceso. */
    const dias = historialPorDia([
      ...[7, 7, 7, 7].map(r => s('2026-08-28', 50, r)),
      ...[7, 9, 10].map(r => s('2026-09-07', 50, r)),
    ])
    expect(queCambio(dias)).toBe('mismo peso, 3 series en vez de 4')
  })

  it('y en kilos cuando se mueve', () => {
    const dias = historialPorDia([s('2026-08-20', 50, 5), s('2026-08-28', 55, 5)])
    expect(queCambio(dias)).toBe('+5 kg')
  })

  it('a la baja también', () => {
    const dias = historialPorDia([s('2026-08-20', 55, 5), s('2026-08-28', 50, 5)])
    expect(queCambio(dias)).toBe('−5 kg')
  })

  it('con un solo día no hay nada que comparar', () => {
    expect(queCambio(historialPorDia([s('2026-08-20', 50, 5)]))).toBeNull()
    expect(queCambio([])).toBeNull()
  })

  it('y si no cambió nada, lo dice', () => {
    const dias = historialPorDia([s('2026-08-20', 50, 5), s('2026-08-28', 50, 5)])
    expect(queCambio(dias)).toBe('igual que la vez anterior')
  })
})

describe('qué cuenta como «el mismo ejercicio» entre semanas', () => {
  /* El enlace a la biblioteca manda y el nombre es el respaldo: 369 de 402
     prescripciones lo llevan, y las 33 que no son las escritas a mano. */
  it('con enlace, el enlace', () => {
    expect(claveDeEjercicio({ ejercicio_id: 7, nombre: 'Sentadilla' })).toBe('bib:7')
  })

  it('RENOMBRARLO NO PARTE EL HISTORIAL', () => {
    expect(claveDeEjercicio({ ejercicio_id: 7, nombre: 'Sentadilla trasera' }))
      .toBe(claveDeEjercicio({ ejercicio_id: 7, nombre: 'Sentadilla' }))
  })

  it('sin enlace, el nombre, sin mayúsculas ni espacios', () => {
    expect(claveDeEjercicio({ nombre: '  Press Banca ' })).toBe('nom:press banca')
  })

  it('y los dos no se confunden entre sí', () => {
    expect(claveDeEjercicio({ ejercicio_id: 7 })).not.toBe(claveDeEjercicio({ nombre: '7' }))
  })
})
