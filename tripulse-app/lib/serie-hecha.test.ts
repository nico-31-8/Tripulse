import { describe, it, expect } from 'vitest'
import { tieneDatos, seriesHechas, serieEscrita } from './serie-hecha'

describe('cuándo una serie está hecha', () => {
  it('con cualquier dato anotado, o marcada', () => {
    expect(tieneDatos({ peso_real: 40, completada: false })).toBe(true)
    expect(tieneDatos({ peso_real: '40', completada: false })).toBe(true)
    expect(tieneDatos({ repeticiones_reales: 10 })).toBe(true)
    expect(tieneDatos({ tiempo_real: 45 })).toBe(true)
    expect(tieneDatos({ control_real: 2 })).toBe(true)
    expect(tieneDatos({ completada: true })).toBe(true)
  })

  it('sin nada y sin marcar, no', () => {
    expect(tieneDatos({ completada: false })).toBe(false)
    expect(tieneDatos({ peso_real: null, repeticiones_reales: null })).toBe(false)
    /* Lo que queda en la pantalla al borrar una casilla. */
    expect(tieneDatos({ peso_real: '', repeticiones_reales: '' })).toBe(false)
    expect(tieneDatos(null)).toBe(false)
  })
})

describe('cuántas series hizo', () => {
  /* Lo que hay de verdad en la base: el peso puesto, el circulito sin tocar. */
  it('las del peso puesto y sin marcar cuentan todas', () => {
    expect(seriesHechas([
      { numero_serie: 1, peso_real: '40', completada: false },
      { numero_serie: 2, peso_real: '40', completada: false },
      { numero_serie: 3, peso_real: '40', completada: false },
    ])).toBe(3)
  })

  it('una serie de superserie son dos filas, pero una serie', () => {
    expect(seriesHechas([
      { numero_serie: 1, peso_real: 60 }, { numero_serie: 1, peso_real: 20 },
      { numero_serie: 2, peso_real: 60 }, { numero_serie: 2, peso_real: 20 },
    ])).toBe(2)
  })

  it('un drop set con solo el segundo escalón anotado también es una serie', () => {
    expect(seriesHechas([{ numero_serie: 1 }, { numero_serie: 1, repeticiones_reales: 8 }])).toBe(1)
  })

  it('las que no tienen nada no cuentan', () => {
    expect(seriesHechas([{ numero_serie: 1, peso_real: 40 }, { numero_serie: 2 }])).toBe(1)
    expect(seriesHechas([])).toBe(0)
    expect(seriesHechas(undefined)).toBe(0)
  })
})

describe('una serie de resistencia a medio anotar', () => {
  /* Allí todo es texto: «4:30» leído como número sería cero. */
  it('con un ritmo o un tiempo escritos, está hecha', () => {
    expect(serieEscrita({ ritmo: '4:30' })).toBe(true)
    expect(serieEscrita({ tiempo: '1:25' })).toBe(true)
    expect(serieEscrita({ metros: '400' })).toBe(true)
    expect(serieEscrita({ sensacion: '3' })).toBe(true)
    expect(serieEscrita({ completada: true })).toBe(true)
  })

  it('en blanco y sin marcar, no', () => {
    expect(serieEscrita({})).toBe(false)
    expect(serieEscrita({ ritmo: '  ', completada: false })).toBe(false)
    expect(serieEscrita(undefined)).toBe(false)
  })
})
