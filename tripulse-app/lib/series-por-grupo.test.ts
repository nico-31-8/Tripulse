import { describe, it, expect } from 'vitest'
import { seriesPorGrupo, totalSeries, porcentajeDe, SIN_CLASIFICAR } from './series-por-grupo'

describe('series por grupo', () => {
  it('suma las de cada grupo', () => {
    expect(seriesPorGrupo([
      { grupo_muscular: 'Glúteos', series: 3 },
      { grupo_muscular: 'Glúteos', series: 4 },
      { grupo_muscular: 'Core', series: 2 },
    ])).toEqual([
      { grupo: 'Glúteos', series: 7 },
      { grupo: 'Core', series: 2 },
    ])
  })

  /* El fallo que unifica esta función: /volumen tiraba los ejercicios sin grupo
     y el canvas los guardaba. En /volumen el total salía menor que el de verdad
     sin que nada lo dijera. */
  it('un ejercicio sin grupo NO desaparece: va a «Sin clasificar»', () => {
    const r = seriesPorGrupo([{ grupo_muscular: null, series: 5 }])
    expect(r).toEqual([{ grupo: SIN_CLASIFICAR, series: 5 }])
  })

  it('un grupo en blanco cuenta igual que ninguno', () => {
    expect(seriesPorGrupo([{ grupo_muscular: '   ', series: 2 }])[0].grupo).toBe(SIN_CLASIFICAR)
  })

  it('los espacios de los lados no parten un grupo en dos', () => {
    const r = seriesPorGrupo([
      { grupo_muscular: 'Core', series: 2 },
      { grupo_muscular: ' Core ', series: 3 },
    ])
    expect(r).toEqual([{ grupo: 'Core', series: 5 }])
  })

  /* La otra mitad de la divergencia: el canvas contaba 1 cuando no había
     número. Inventarse un dato es peor que enseñar el hueco. */
  it('sin número de series cuenta 0, no 1', () => {
    expect(seriesPorGrupo([{ grupo_muscular: 'Core', series: null }]))
      .toEqual([{ grupo: 'Core', series: 0 }])
  })

  it('el grupo sigue saliendo aunque sume cero, para que se vea el hueco', () => {
    expect(seriesPorGrupo([{ grupo_muscular: 'Core', series: null }]).length).toBe(1)
  })

  it('un número negativo o una cadena no cuentan', () => {
    expect(seriesPorGrupo([
      { grupo_muscular: 'Core', series: -3 },
      { grupo_muscular: 'Core', series: 'tres' as any },
      { grupo_muscular: 'Core', series: 2 },
    ])[0].series).toBe(2)
  })

  it('a igualdad de series, el orden es por nombre y no el de la base', () => {
    const r = seriesPorGrupo([
      { grupo_muscular: 'Zancadas', series: 3 },
      { grupo_muscular: 'Abdomen', series: 3 },
    ])
    expect(r.map(g => g.grupo)).toEqual(['Abdomen', 'Zancadas'])
  })

  it('sin ejercicios no hay grupos', () => {
    expect(seriesPorGrupo([])).toEqual([])
    expect(seriesPorGrupo(null)).toEqual([])
  })
})

describe('total y porcentajes', () => {
  it('el total es la suma', () => {
    expect(totalSeries(seriesPorGrupo([
      { grupo_muscular: 'Core', series: 3 },
      { grupo_muscular: 'Glúteos', series: 5 },
    ]))).toBe(8)
  })

  it('el porcentaje no divide por cero', () => {
    expect(porcentajeDe(0, 0)).toBe(0)
  })

  it('los porcentajes salen sobre el total', () => {
    expect(porcentajeDe(2, 8)).toBe(25)
  })
})
