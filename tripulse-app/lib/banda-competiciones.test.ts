import { describe, it, expect } from 'vitest'
import { filasBanda, posicionBandera, colocarBanderas, ANCHO_BANDERA } from './banda-competiciones'

describe('la bandera se planta en el día que cae', () => {
  /* 90 px de semana, el ancho por defecto del lienzo. */
  const B = { semanaW: 90, labelW: 56 }
  const inicio = (wi: number) => B.labelW + wi * B.semanaW

  it('el lunes a la izquierda y el domingo a la derecha, dentro de su semana', () => {
    const lunes = posicionBandera({ wi: 2, dia: 0 }, B)
    const domingo = posicionBandera({ wi: 2, dia: 6 }, B)
    expect(lunes).toBeGreaterThanOrEqual(inicio(2))
    expect(domingo).toBeLessThanOrEqual(inicio(3) - ANCHO_BANDERA)
    expect(domingo - lunes).toBeGreaterThan(B.semanaW / 2)
  })

  it('el miércoles cae por el medio', () => {
    const x = posicionBandera({ wi: 0, dia: 2 }, B) - inicio(0)
    expect(x).toBeGreaterThan(B.semanaW * 0.25)
    expect(x).toBeLessThan(B.semanaW * 0.55)
  })

  it('NUNCA se sale de su semana, ni con la columna estrecha', () => {
    /* Si la de domingo asomara por la derecha parecería de la semana
       siguiente, que es el único error que no se puede permitir aquí. */
    for (const semanaW of [40, 62, 90, 160]) {
      for (let dia = 0; dia <= 6; dia++) {
        const x = posicionBandera({ wi: 3, dia }, { semanaW, labelW: 56 })
        expect(x).toBeGreaterThanOrEqual(56 + 3 * semanaW)
        expect(x + ANCHO_BANDERA).toBeLessThanOrEqual(56 + 4 * semanaW)
      }
    }
  })

  it('un día fuera de rango no descoloca nada', () => {
    expect(posicionBandera({ wi: 0, dia: 99 }, B)).toBe(posicionBandera({ wi: 0, dia: 6 }, B))
    expect(posicionBandera({ wi: 0, dia: -2 }, B)).toBe(posicionBandera({ wi: 0, dia: 0 }, B))
  })
})

describe('banderas que se pisarían', () => {
  const B = { semanaW: 90, labelW: 56 }

  it('dos carreras el mismo día suben una a la fila de arriba', () => {
    const r = colocarBanderas([{ wi: 1, dia: 6, n: 'a' }, { wi: 1, dia: 6, n: 'b' }], B)
    expect(r.map(x => x.fila).sort()).toEqual([0, 1])
  })

  it('dos lejos se quedan las dos abajo', () => {
    const r = colocarBanderas([{ wi: 0, dia: 0, n: 'a' }, { wi: 4, dia: 3, n: 'b' }], B)
    expect(r.every(x => x.fila === 0)).toBe(true)
  })

  it('el sábado de una semana y el lunes de la siguiente no se tapan', () => {
    const r = colocarBanderas([{ wi: 0, dia: 5, n: 'sab' }, { wi: 1, dia: 0, n: 'lun' }], B)
    const [a, b] = r.sort((x, y) => x.left - y.left)
    if (a.fila === b.fila) expect(b.left - a.left).toBeGreaterThanOrEqual(ANCHO_BANDERA)
  })

  it('sin carreras, ninguna fila', () => {
    expect(colocarBanderas([], B)).toEqual([])
    expect(filasBanda(colocarBanderas([], B))).toBe(0)
  })

  it('la banda mide lo que la fila más alta', () => {
    const r = colocarBanderas([{ wi: 1, dia: 6 }, { wi: 1, dia: 6 }, { wi: 5, dia: 2 }], B)
    expect(filasBanda(r)).toBe(2)
  })

  it('no toca el array que le dan', () => {
    const entrada = [{ wi: 4, dia: 3 }, { wi: 1, dia: 0 }]
    colocarBanderas(entrada, B)
    expect(entrada.map(x => x.wi)).toEqual([4, 1])
  })
})
