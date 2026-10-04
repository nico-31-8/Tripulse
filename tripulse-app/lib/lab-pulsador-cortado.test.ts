// ============================================================
// El pulsador que se corta con los parciales
// ============================================================
//
// EL CASO, del entrenador: «¿hay alguna forma de que se guarde cuántas
// pulsaciones se han dado en cada parcial?». Es la pregunta de natación de toda
// la vida: los ciclos de brazo de CADA 25, no los del 100 entero. Los parciales
// ya parten el 100 en cuatro; faltaba que el pulsador se partiera igual.
//
// NO HAY QUE ELEGIRLO: si en el bloque hay parciales, el pulsador se corta. Y
// no se pierde nada por ello — el total sigue saliendo con `suma()`. Al revés
// sí: de un «27» no se sacan nunca los «6, 7, 7, 7», que es justo donde se ve
// que la brazada se alarga al final.

import { describe, it, expect } from 'vitest'
import {
  cajonAhora, calcular, col, fnB, medVacia, parcialQueCorta, pegasDe, seCorta,
  type Bloque, type TestLab,
} from './lab-constructor'

/** 4×25: el tiempo de cada 25 y los ciclos de cada 25. */
const bloque: Bloque = {
  clave: 'b', etiqueta: 'El 100', modo: 'cerrado', veces: 2, duracion: 0,
  columnas: [
    col({ clave: 'paso', etiqueta: 'Cada 25', unidad: 's', instrumento: 'parciales' }),
    col({ clave: 'ciclos', etiqueta: 'Ciclos', unidad: 'ud', instrumento: 'contador' }),
  ],
}
const NADO: TestLab = {
  nombre: '2×100 con ciclos', deporte: 'Natación', sueltos: [], bloques: [bloque],
  resultados: [
    { nombre: 'ciclos_por_25', unidad: 'ud', formula: [fnB('media', 'ciclos')] },
    { nombre: 'ciclos_total', unidad: 'ud', formula: [fnB('suma', 'ciclos')] },
    { nombre: 'paso_medio', unidad: 's', formula: [fnB('media', 'paso')] },
  ],
}

/** Dos cien, cuatro veinticincos cada uno. */
const NADADO = {
  paso: [['13', '14', '14', '15'], ['13', '14', '15', '16']],
  ciclos: [['6', '7', '7', '8'], ['6', '7', '8', '8']],
}

describe('cuándo se corta', () => {
  it('con parciales en el mismo bloque, sí', () => {
    expect(seCorta(bloque, bloque.columnas[1])).toBe(true)
    expect(parcialQueCorta(bloque)?.clave).toBe('paso')
  })

  it('sin parciales, el pulsador es un número por repetición como siempre', () => {
    const solo: Bloque = { ...bloque, columnas: [bloque.columnas[1]] }
    expect(seCorta(solo, solo.columnas[0])).toBe(false)
    expect(parcialQueCorta(solo)).toBeNull()
  })

  it('y los parciales no se cortan a sí mismos', () => {
    expect(seCorta(bloque, bloque.columnas[0])).toBe(false)
  })

  it('nace con un cajón vacío por repetición', () => {
    expect(medVacia(NADO).ciclos).toEqual([[], []])
  })
})

describe('EN QUÉ CAJÓN CAE LA PULSACIÓN', () => {
  it('antes del primer parcial, en el primero', () => {
    expect(cajonAhora([])).toBe(0)
  })

  it('marcados tres, en el cuarto — el 25 que se está nadando', () => {
    expect(cajonAhora(['13', '14', '14'])).toBe(3)
  })

  it('sale de los parciales y no de una cuenta aparte, que podría separarse', () => {
    expect(cajonAhora(undefined)).toBe(0)
    expect(cajonAhora('x')).toBe(0)
  })
})

describe('LO QUE SALE', () => {
  const pasar = (t: TestLab, datos: Record<string, unknown>) => {
    const vals = calcular(t, datos)
    const o: Record<string, number | null | string> = {}
    t.resultados.forEach((r, i) => { o[r.nombre] = vals[i].error ?? vals[i].valor })
    return o
  }

  it('los ciclos por 25 son la media de los OCHO cajones', () => {
    const r = pasar(NADO, NADADO)
    expect(r.ciclos_por_25).toBeCloseTo(57 / 8, 6)
  })

  it('Y EL TOTAL NO SE PIERDE: sale de sumarlos', () => {
    /* Es lo que hace que cortar no cueste nada. */
    expect(pasar(NADO, NADADO).ciclos_total).toBe(57)
  })

  it('un cajón sin pulsar es un hueco, no un cero', () => {
    /* No contar es distinto de contar cero: metido como cero, la media de
       ciclos bajaría sola por un 25 que nadie contó. */
    const r = pasar(NADO, { ...NADADO, ciclos: [['6', '', '7', '8'], ['6', '7', '8', '8']] })
    expect(r.ciclos_por_25).toBe('falta un número en «ciclos», repetición 1')
  })
})

describe('el montador', () => {
  it('deja guardarlo', () => {
    expect(pegasDe(NADO)).toEqual([])
  })

  it('y dentro de una calculada se puede cerrar la repetición', () => {
    /* Los ciclos del 100 entero, fila a fila: es un número POR REPETICIÓN que
       de otra forma no se puede sacar. */
    const conTotal: TestLab = {
      ...NADO,
      bloques: [{
        ...bloque,
        columnas: [...bloque.columnas,
          col({ clave: 'del100', clase: 'calculada', unidad: 'ud', formula: [fnB('suma', 'ciclos')] })],
      }],
      resultados: [{ nombre: 'mejor', unidad: 'ud', inverso: true, formula: [fnB('minimo', 'del100')] }],
    }
    expect(pegasDe(conTotal)).toEqual([])
    const vals = calcular(conTotal, NADADO)
    expect(vals[0].valor).toBe(28)
  })

  it('PERO NO EMPAREJARLO CON OTRA COLUMNA', () => {
    /* Ocho cajones contra dos repeticiones no son parejas. */
    const malo: TestLab = {
      ...NADO,
      bloques: [{ ...bloque, columnas: [...bloque.columnas, col({ clave: 'fc', unidad: 'ppm' })] }],
      resultados: [{ nombre: 'r', unidad: '', formula: [{ t: 'fn2', v: 'pendiente', x: 'ciclos', y: 'fc' }] }],
    }
    expect(pegasDe(malo).some(z => /UN número en cada repetición/.test(z.texto))).toBe(true)
  })
})
