import { describe, it, expect } from 'vitest'
import { colocarBanda, filasBanda, anchoEtiqueta, columnasPorSemana } from './banda-competiciones'

/* 12 semanas de 62 px + 56 de margen = 800. Las medidas reales del lienzo. */
const M = { semanaW: 62, labelW: 56, anchoTotal: 800 }

const c = (wi: number, nombre: string) => ({ wi, nombre })

describe('colocarBanda', () => {
  it('sin competiciones no ocupa ninguna fila', () => {
    expect(filasBanda(colocarBanda([], M))).toBe(0)
  })

  it('una sola va en la fila 0, en la columna de su semana', () => {
    const [x] = colocarBanda([c(3, 'Ironman')], M)
    expect(x.fila).toBe(0)
    expect(x.left).toBe(56 + 3 * 62)
  })

  it('dos separadas comparten fila', () => {
    const r = colocarBanda([c(0, 'A'), c(9, 'B')], M)
    expect(r.map(x => x.fila)).toEqual([0, 0])
  })

  it('dos en semanas seguidas NO se pisan: la segunda baja de fila', () => {
    const r = colocarBanda([c(2, 'Triatlón Media Distancia Vitoria'), c(3, 'Acuatlón')], M)
    expect(r.map(x => x.fila)).toEqual([0, 1])
  })

  it('tres pegadas usan tres filas', () => {
    const r = colocarBanda([c(2, 'Uno largo de verdad'), c(3, 'Dos largo de verdad'), c(4, 'Tres largo')], M)
    expect(filasBanda(r)).toBe(3)
  })

  it('reutiliza la fila 0 en cuanto vuelve a haber hueco', () => {
    const r = colocarBanda([c(0, 'Uno'), c(1, 'Dos'), c(11, 'Tres')], M)
    expect(r.map(x => x.fila)).toEqual([0, 1, 0])
  })

  it('las ordena por semana aunque lleguen desordenadas', () => {
    const r = colocarBanda([c(9, 'Tarde'), c(1, 'Pronto')], M)
    expect(r.map(x => x.item.nombre)).toEqual(['Pronto', 'Tarde'])
  })

  /* EL CASO QUE MOTIVA EL RECORTE: la carrera de la última semana. Sin él, la
     etiqueta empieza en la última columna y se sale del lienzo por la derecha. */
  it('la de la última semana no se sale del lienzo', () => {
    const [x] = colocarBanda([c(11, 'Triatlón Media Distancia Vitoria')], M)
    expect(x.left + x.ancho).toBeLessThanOrEqual(M.anchoTotal)
    expect(x.left).toBeLessThan(56 + 11 * 62)
  })

  it('aunque el nombre sea larguísimo, nunca invade la columna de etiquetas', () => {
    const [x] = colocarBanda([c(11, 'x'.repeat(400))], M)
    expect(x.left).toBeGreaterThanOrEqual(M.labelW)
  })

  it('no modifica el array que recibe', () => {
    const entrada = [c(9, 'Tarde'), c(1, 'Pronto')]
    colocarBanda(entrada, M)
    expect(entrada.map(x => x.nombre)).toEqual(['Tarde', 'Pronto'])
  })
})

describe('anchoEtiqueta', () => {
  it('un nombre corto no baja del mínimo legible', () => {
    expect(anchoEtiqueta('A')).toBe(96)
    expect(anchoEtiqueta('')).toBe(96)
  })

  it('crece con el nombre', () => {
    expect(anchoEtiqueta('Triatlón Media Distancia Vitoria')).toBeGreaterThan(anchoEtiqueta('10k'))
  })
})

describe('columnasPorSemana', () => {
  const p = (x: { pr: string }) => x.pr

  it('una carrera, una columna', () => {
    expect(columnasPorSemana([{ wi: 4, pr: 'B' }], p).map(x => x.wi)).toEqual([4])
  })

  /* EL CASO REAL: cuatro carreras el mismo día pintaban cuatro columnas
     translúcidas encima de la otra y esa semana salía casi opaca. */
  it('cuatro en la misma semana dan UNA columna', () => {
    const r = columnasPorSemana([
      { wi: 9, pr: 'B' }, { wi: 9, pr: 'B' }, { wi: 9, pr: 'B' }, { wi: 9, pr: 'B' },
    ], p)
    expect(r).toHaveLength(1)
  })

  it('en una semana compartida manda la más importante', () => {
    const r = columnasPorSemana([{ wi: 2, pr: 'C' }, { wi: 2, pr: 'A' }, { wi: 2, pr: 'B' }], p)
    expect(r).toHaveLength(1)
    expect(r[0].comp.pr).toBe('A')
  })

  it('el orden de llegada no cambia quién manda', () => {
    const r = columnasPorSemana([{ wi: 2, pr: 'A' }, { wi: 2, pr: 'C' }], p)
    expect(r[0].comp.pr).toBe('A')
  })

  it('devuelve las semanas ordenadas', () => {
    const r = columnasPorSemana([{ wi: 7, pr: 'B' }, { wi: 1, pr: 'B' }, { wi: 4, pr: 'B' }], p)
    expect(r.map(x => x.wi)).toEqual([1, 4, 7])
  })

  it('sin carreras, sin columnas', () => {
    expect(columnasPorSemana([] as { wi: number; pr: string }[], p)).toEqual([])
  })
})
