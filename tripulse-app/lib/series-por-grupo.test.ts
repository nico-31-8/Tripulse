import { describe, it, expect } from 'vitest'
import {
  seriesPorGrupo, totalSeries, porcentajeDe, seriesTexto, periodoTexto, bandaDe, bandasDe, SIN_CLASIFICAR,
} from './series-por-grupo'

describe('series por grupo', () => {
  it('suma las de cada grupo', () => {
    expect(seriesPorGrupo([
      { grupo_muscular: 'Glúteos', series: 3 },
      { grupo_muscular: 'Glúteos', series: 4 },
      { grupo_muscular: 'Core', series: 2 },
    ]).map(g => [g.grupo, g.series])).toEqual([['Glúteos', 7], ['Core', 2]])
  })

  /* El fallo que unifica esta función: /volumen tiraba los ejercicios sin grupo
     y el canvas los guardaba. En /volumen el total salía menor que el de verdad
     sin que nada lo dijera. */
  it('un ejercicio sin grupo NO desaparece: va a «Sin clasificar»', () => {
    const r = seriesPorGrupo([{ grupo_muscular: null, series: 5 }])
    expect(r.map(g => [g.grupo, g.series])).toEqual([[SIN_CLASIFICAR, 5]])
  })

  it('un grupo en blanco cuenta igual que ninguno', () => {
    expect(seriesPorGrupo([{ grupo_muscular: '   ', series: 2 }])[0].grupo).toBe(SIN_CLASIFICAR)
  })

  it('los espacios de los lados no parten un grupo en dos', () => {
    const r = seriesPorGrupo([
      { grupo_muscular: 'Core', series: 2 },
      { grupo_muscular: ' Core ', series: 3 },
    ])
    expect(r.map(g => [g.grupo, g.series])).toEqual([['Core', 5]])
  })

  /* La otra mitad de la divergencia: el canvas contaba 1 cuando no había
     número. Inventarse un dato es peor que enseñar el hueco. */
  it('sin número de series cuenta 0, no 1', () => {
    expect(seriesPorGrupo([{ grupo_muscular: 'Core', series: null }])[0].series).toBe(0)
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

describe('por semana, que es la unidad en la que se piensa', () => {
  const ocho = [{ grupo_muscular: 'Glúteos', series: 8 }]

  it('sin decir el periodo se supone una semana: el número no cambia', () => {
    expect(seriesPorGrupo(ocho)[0].porSemana).toBe(8)
  })

  /* El fallo que arregla esto: las mismas 8 series se veían igual eligiendo 2
     semanas o 8, y son cuatro veces menos trabajo. */
  it('las mismas series dan la mitad si el periodo es el doble', () => {
    expect(seriesPorGrupo(ocho, 14)[0].porSemana).toBe(4)
    expect(seriesPorGrupo(ocho, 28)[0].porSemana).toBe(2)
    expect(seriesPorGrupo(ocho, 56)[0].porSemana).toBe(1)
  })

  it('el total del periodo se conserva al lado', () => {
    expect(seriesPorGrupo(ocho, 56)[0].series).toBe(8)
  })

  it('se redondea a un decimal', () => {
    expect(seriesPorGrupo([{ grupo_muscular: 'Core', series: 5 }], 56)[0].porSemana).toBe(0.6)
  })

  it('un periodo de menos de una semana no multiplica el número', () => {
    /* Dividir por 0,4 semanas convertiría 8 series en 20. */
    expect(seriesPorGrupo(ocho, 3)[0].porSemana).toBe(8)
  })

  it('un periodo de cero o basura se trata como una semana', () => {
    expect(seriesPorGrupo(ocho, 0)[0].porSemana).toBe(8)
    expect(seriesPorGrupo(ocho, NaN)[0].porSemana).toBe(8)
  })
})

describe('cómo se escriben', () => {
  it('un número redondo va sin decimal', () => {
    expect(seriesTexto(5)).toBe('5')
  })

  it('el decimal va con coma, no con punto', () => {
    expect(seriesTexto(2.5)).toBe('2,5')
  })

  /* Sin el periodo delante, «2,5 series/semana» de un año se lee igual que uno
     de dos semanas, y no dicen lo mismo. */
  it('el periodo se dice con todas las letras', () => {
    expect(periodoTexto(14)).toBe('últimas 2 semanas')
    expect(periodoTexto(56)).toBe('últimas 8 semanas')
    expect(periodoTexto(7)).toBe('última semana')
    expect(periodoTexto(365)).toBe('último año')
  })
})

describe('las bandas de referencia', () => {
  it('clasifican por las series de UNA semana', () => {
    expect(bandaDe(1.25).label).toBe('Mantenimiento')
    expect(bandaDe(6).label).toBe('Desarrollo')
    expect(bandaDe(10).label).toBe('Carga alta')
    expect(bandaDe(15).label).toBe('Sobrevolumen')
  })

  it('los bordes caen donde dice la tarjeta', () => {
    expect(bandaDe(3.9).label).toBe('Mantenimiento')
    expect(bandaDe(4).label).toBe('Desarrollo')
    expect(bandaDe(8).label).toBe('Carga alta')
    expect(bandaDe(12).label).toBe('Sobrevolumen')
  })

  /* El fallo: la lista clasificaba con el TOTAL del periodo contra unos
     umbrales que son semanales. Con 4 semanas elegidas, 5 series salían como
     «Desarrollo» en verde cuando son 1,25 por semana. */
  it('cinco series en cuatro semanas son mantenimiento, no desarrollo', () => {
    const g = seriesPorGrupo([{ grupo_muscular: 'Tobillo y pie', series: 5 }], 28)[0]
    expect(g.series).toBe(5)
    expect(g.porSemana).toBe(1.3)
    expect(bandaDe(g.porSemana).label).toBe('Mantenimiento')
  })

  it('cero series es mantenimiento y no revienta', () => {
    expect(bandaDe(0).label).toBe('Mantenimiento')
    expect(bandaDe(NaN).label).toBe('Mantenimiento')
  })
})

describe('el objetivo cambia lo que significa el mismo número', () => {
  /* El motivo de que exista el botón: 12 series de cuádriceps son el techo de
     un triatleta y una semana corta de quien busca hipertrofia. */
  it('doce series son carga alta en resistencia y aún poco en hipertrofia', () => {
    expect(bandaDe(12, 'resistencia').id).toBe('sobrevolumen')
    expect(bandaDe(11.9, 'resistencia').id).toBe('carga-alta')
    expect(bandaDe(12, 'hipertrofia').id).toBe('desarrollo')
  })

  it('seis series son desarrollo entrenando triatlón y quedarse corto en hipertrofia', () => {
    expect(bandaDe(6, 'resistencia').id).toBe('desarrollo')
    expect(bandaDe(6, 'hipertrofia').id).toBe('mantenimiento')
  })

  it('en hipertrofia hace falta pasarse de 26 para que salte el aviso', () => {
    expect(bandaDe(25, 'hipertrofia').id).toBe('carga-alta')
    expect(bandaDe(27, 'hipertrofia').id).toBe('sobrevolumen')
  })

  it('sin decir objetivo se usa resistencia, que es de lo que va la app', () => {
    expect(bandaDe(12).id).toBe(bandaDe(12, 'resistencia').id)
  })

  it('un objetivo que no existe no revienta: cae en el primero', () => {
    expect(bandaDe(6, 'lo-que-sea').id).toBe('desarrollo')
    expect(bandasDe('lo-que-sea').length).toBe(4)
  })

  it('los dos juegos tienen las mismas cuatro bandas, para que el color case', () => {
    const ids = (o: string) => bandasDe(o).map(b => b.id)
    expect(ids('hipertrofia')).toEqual(ids('resistencia'))
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
