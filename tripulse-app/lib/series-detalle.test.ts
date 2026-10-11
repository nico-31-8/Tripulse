import { describe, it, expect } from 'vitest'
import {
  leerDetalle, seriesIguales, ajustarSeries, valorComun, sonDistintas, resumenCampo,
  ponerEnTodas, ponerEnUna, igualarALaPrimera, seriesParaEditar, resumenParaFila, paraGuardar,
  seriesDe, tieneSeriesDistintas, textoRepsSeries, textoKgSeries, textoControlSeries,
  textoRepsTotalSeries, trozosSerie, repsDeCalculoPorSerie, segDeCalculoPorSerie,
  type SerieEditor,
} from './series-detalle'

const s = (reps: string, kg = '', rir = ''): SerieEditor => ({ reps, kg, rir })
const piramide = [s('12', '40', '3'), s('10', '45', '2'), s('8', '50', '1')]

describe('leerDetalle', () => {
  it('sin lista, o con una sola serie, no hay nada que repartir', () => {
    expect(leerDetalle(null)).toBeNull()
    expect(leerDetalle({ reps: 8 })).toBeNull()
    expect(leerDetalle([{ reps: 8 }])).toBeNull()
  })

  it('un valor raro se lee como «no prescrito», no como NaN', () => {
    const d = leerDetalle([{ reps: 'x', kg: -3, control: 2 }, { reps: 10, reps_max: 9, seg: 0 }])!
    expect(d[0]).toEqual({ reps: null, reps_max: null, seg: null, kg: null, control: '2' })
    // Un tope que no está por encima del mínimo no es un rango.
    expect(d[1].reps_max).toBeNull()
  })
})

describe('el editor', () => {
  it('las series nacen iguales a la fila', () => {
    expect(seriesIguales(3, s('8', '60', '2'))).toEqual([s('8', '60', '2'), s('8', '60', '2'), s('8', '60', '2')])
  })

  it('subir el número añade copiando la última; bajarlo quita las últimas', () => {
    expect(ajustarSeries(piramide, 4)).toEqual([...piramide, s('8', '50', '1')])
    expect(ajustarSeries(piramide, 2)).toEqual(piramide.slice(0, 2))
  })

  it('por debajo de 2 no recorta: mientras se teclea se pasa por «» y por «1»', () => {
    expect(ajustarSeries(piramide, 0)).toBe(piramide)
    expect(ajustarSeries(piramide, 1)).toBe(piramide)
    expect(ajustarSeries(piramide, NaN)).toBe(piramide)
  })

  it('una coma o un espacio no hacen distinta una serie', () => {
    const l = [s('8-10', '40', '1-2'), s('8 - 10', '40,0', '1 - 2')]
    expect(valorComun(l, 'reps')).toBe('8-10')
    expect(valorComun(l, 'kg')).toBe('40')
    expect(valorComun(l, 'rir')).toBe('1-2')
    expect(sonDistintas(l)).toBe(false)
  })

  it('por tiempo, «90» y «1:30» son lo mismo', () => {
    expect(valorComun([s('90'), s('1:30')], 'reps', true)).toBe('90')
  })

  it('el resumen de la fila: con barra, y «—» donde una serie no lleva', () => {
    expect(resumenCampo(piramide, 'reps')).toBe('12/10/8')
    expect(resumenCampo(piramide, 'kg')).toBe('40/45/50')
    expect(resumenCampo([s('8', '40'), s('8', '')], 'kg')).toBe('40/—')
    expect(resumenCampo([s('45'), s('90')], 'reps', true)).toBe('45/1:30')
  })

  it('arriba se cambian todas; abajo, una', () => {
    expect(ponerEnTodas(piramide, 'rir', '2').map(x => x.rir)).toEqual(['2', '2', '2'])
    expect(ponerEnUna(piramide, 1, 'kg', '47.5').map(x => x.kg)).toEqual(['40', '47.5', '50'])
    expect(igualarALaPrimera(piramide)).toEqual([piramide[0], piramide[0], piramide[0]])
  })
})

describe('paraGuardar', () => {
  const fila = s('8', '60', '2')

  it('sin lista, la fila tal cual', () => {
    expect(paraGuardar(null, 3, false, fila)).toEqual({ detalle: null, fila })
  })

  it('con todas iguales no se guarda lista: manda la fila, como siempre', () => {
    expect(paraGuardar(seriesIguales(3, fila), 3, false, s('', '', ''))).toEqual({ detalle: null, fila })
  })

  it('con una serie no hay nada que repartir: manda la primera', () => {
    expect(paraGuardar(piramide, 1, false, fila)).toEqual({ detalle: null, fila: piramide[0] })
  })

  it('una pirámide: la lista, y la fila con el resumen', () => {
    const r = paraGuardar(piramide, 3, false, fila)
    expect(r.detalle).toEqual([
      { reps: 12, kg: 40, control: '3' },
      { reps: 10, kg: 45, control: '2' },
      { reps: 8, kg: 50, control: '1' },
    ])
    // Lo que lee quien no sabe de la lista: cierto, aunque menos preciso.
    expect(r.fila).toEqual({ reps: '8-12', kg: '', rir: '1-3' })
  })

  it('el peso que no cambia se queda en la fila', () => {
    const r = paraGuardar([s('12', '40'), s('10', '40')], 2, false, fila)
    expect(r.fila.kg).toBe('40')
  })

  it('con rangos por serie, el resumen va del menor al mayor', () => {
    const r = paraGuardar([s('10-12'), s('8-10'), s('6-8')], 3, false, fila)
    expect(r.detalle![0]).toEqual({ reps: 10, reps_max: 12 })
    expect(r.fila.reps).toBe('6-12')
  })

  it('por tiempo: segundos por serie, y la media en la fila', () => {
    const r = paraGuardar([s('45', '24', '7'), s('40', '28', '8'), s('1:00', '32', '9')], 3, true, fila)
    expect(r.detalle!.map(x => x.seg)).toEqual([45, 40, 60])
    // 145 / 3 = 48,3 → 48: series × media = lo que dura de verdad.
    expect(r.fila.reps).toBe('48')
  })

  it('si el número de series cambió, se guarda al número nuevo', () => {
    expect(paraGuardar(piramide, 4, false, fila).detalle).toHaveLength(4)
  })

  it('ida y vuelta: lo guardado vuelve al editor igual', () => {
    const r = paraGuardar([s('10-12', '40', '1-2'), s('8', '42.5', '0')], 2, false, fila)
    expect(seriesParaEditar(r.detalle, false)).toEqual([s('10-12', '40', '1-2'), s('8', '42.5', '0')])
    const t = paraGuardar([s('45'), s('90')], 2, true, fila)
    expect(seriesParaEditar(t.detalle, true)).toEqual([s('45'), s('1:30')])
  })
})

describe('resumenParaFila', () => {
  it('el control: del menor al mayor, también con rangos', () => {
    expect(resumenParaFila([{ control: '1-2' }, { control: '0-1' }]).control).toBe('0-2')
    expect(resumenParaFila([{ control: '70' }, { control: '75' }]).control).toBe('70-75')
    expect(resumenParaFila([{ control: '2' }, { control: '2' }]).control).toBe('2')
  })
})

describe('seriesDe', () => {
  const uniforme = { series: 3, repeticiones: 8, repeticiones_max: 10, intensidad: 60, control_valor: '2' }

  it('sin lista: todas iguales desde las columnas de siempre', () => {
    expect(seriesDe(uniforme)).toEqual(Array(3).fill({ reps: '8-10', seg: null, kg: 60, control: '2' }))
    expect(seriesDe({ series: 2 }, { segFila: 40 })[1].seg).toBe(40)
  })

  it('con lista: cada serie la suya', () => {
    const ej = { ...uniforme, series_detalle: [{ reps: 12, kg: 40, control: '3' }, { reps: 10, kg: 45 }] }
    expect(seriesDe(ej)).toEqual([
      { reps: '12', seg: null, kg: 40, control: '3' },
      { reps: '10', seg: null, kg: 45, control: '' },
    ])
    expect(tieneSeriesDistintas(ej)).toBe(true)
    expect(tieneSeriesDistintas(uniforme)).toBe(false)
  })

  it('si la tarea tiene más series que la lista, las que sobran llevan el resumen', () => {
    const ej = { ...uniforme, series_detalle: [{ reps: 12 }, { reps: 10 }] }
    expect(seriesDe(ej, { n: 3 })[2]).toEqual({ reps: '8-10', seg: null, kg: 60, control: '2' })
  })

  it('el encadenado lee sus propias columnas y su propia lista', () => {
    const ej = {
      series: 3, repeticiones: 6, encadenado_series: 3, encadenado_repeticiones: 12, encadenado_intensidad: 25,
      encadenado_series_detalle: [{ reps: 12, kg: 25 }, { reps: 10, kg: 27.5 }, { reps: 8, kg: 30 }],
    }
    expect(seriesDe(ej, { encadenado: true }).map(x => x.kg)).toEqual([25, 27.5, 30])
    expect(seriesDe({ ...ej, encadenado_series_detalle: null }, { encadenado: true })[0])
      .toEqual({ reps: '12', seg: null, kg: 25, control: '' })
    expect(tieneSeriesDistintas(ej, true)).toBe(true)
  })
})

describe('los textos', () => {
  const vistas = seriesDe({ series_detalle: [{ reps: 12, kg: 40, control: '3' }, { reps: 10, kg: 45, control: '2' }, { reps: 8, kg: 50, control: '1' }] })

  it('con barra cuando cambian; uno solo cuando no', () => {
    expect(textoRepsSeries(vistas, false)).toBe('12/10/8')
    expect(textoKgSeries(vistas)).toBe('40/45/50 kg')
    expect(textoControlSeries(vistas, 'rir')).toBe('RIR 3/2/1')
    expect(textoControlSeries(vistas, 'pct1rm')).toBe('3/2/1 % 1RM')
    const tiempo = seriesDe({ series_detalle: [{ seg: 40, kg: 24 }, { seg: 40, kg: 28 }] })
    expect(textoRepsSeries(tiempo, true)).toBe('40 s')
    expect(textoKgSeries(tiempo)).toBe('24/28 kg')
  })

  it('una serie sin peso sale «—», y sin ninguno no sale nada', () => {
    expect(textoKgSeries(seriesDe({ series_detalle: [{ reps: 6, kg: 10 }, { reps: 6 }] }))).toBe('10/— kg')
    expect(textoKgSeries(seriesDe({ series_detalle: [{ reps: 6 }, { reps: 6 }] }))).toBe('')
  })

  it('el total suma serie a serie, con rangos', () => {
    expect(textoRepsTotalSeries(vistas)).toBe('30')
    expect(textoRepsTotalSeries(seriesDe({ series_detalle: [{ reps: 10, reps_max: 12 }, { reps: 8 }] }))).toBe('18-20')
  })

  it('una serie en una línea, sin los trozos que no se prescribieron', () => {
    expect(trozosSerie(vistas[0], 'rir', false).filter(Boolean).join(' · ')).toBe('12 reps · 40 kg · RIR 3')
    expect(trozosSerie({ reps: '', seg: 40, kg: null, control: '7' }, 'rpe', true).filter(Boolean).join(' · ')).toBe('40 s · RPE 7')
  })
})

describe('las cuentas de la duración', () => {
  it('series × media = lo que suman todas', () => {
    const ej = { series: 3, series_detalle: [{ reps: 12 }, { reps: 10 }, { reps: 8, reps_max: 10 }] }
    // (12 + 10 + 9) / 3
    expect(repsDeCalculoPorSerie(ej) * 3).toBeCloseTo(31)
    expect(repsDeCalculoPorSerie({ repeticiones: 8, repeticiones_max: 10 })).toBe(9)
  })

  it('por tiempo, igual con los segundos', () => {
    expect(segDeCalculoPorSerie({ series_detalle: [{ seg: 45 }, { seg: 30 }] }, 38)).toBe(37.5)
    expect(segDeCalculoPorSerie({ series_detalle: null }, 38)).toBe(38)
  })
})
