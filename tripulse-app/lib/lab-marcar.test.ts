// Tocar la casilla para marcar. Lo que se sujeta aquí no es el gesto —eso se
// ve— sino las dos cosas que harían perder un test entero sin avisar: que una
// marca buena se pise por un dedo gordo, y que el tiempo de cada repetición
// deje de ser la resta con la anterior DE ESA PERSONA.

import { describe, it, expect } from 'vitest'
import { deshacer, marcaEn, parcialAhora, primeroLibre, ultimaMarca } from './lab-marcar'

describe('la última marca', () => {
  it('es la más grande, no la de la fila de antes', () => {
    /* Tocaste la 1.ª y la 4.ª: el trozo siguiente empieza donde acabó la 4.ª. */
    expect(ultimaMarca([1000, undefined, undefined, 7000])).toBe(7000)
  })

  it('sin marcar nada es cero, que es la salida', () => {
    expect(ultimaMarca([])).toBe(0)
    expect(ultimaMarca(undefined)).toBe(0)
    expect(ultimaMarca([undefined, undefined])).toBe(0)
  })
})

describe('la primera libre', () => {
  it('es el hueco, aunque haya marcas detrás', () => {
    expect(primeroLibre([1000, undefined, 3000], 3)).toBe(1)
  })
  it('y -1 cuando están todas', () => {
    expect(primeroLibre([1000, 2000], 2)).toBe(-1)
  })
  it('en una tabla vacía es la primera', () => {
    expect(primeroLibre(undefined, 4)).toBe(0)
  })
})

describe('lo que se apunta al tocar una casilla', () => {
  it('la primera guarda desde la salida', () => {
    const r = marcaEn([], 0, 95_400, false)
    expect(r!.valor).toBe('95.4')
    expect(r!.abs[0]).toBe(95_400)
  })

  it('LA SEGUNDA GUARDA SU TROZO, no lo que lleva el reloj', () => {
    /* Es lo único que de verdad importa: si guardara el acumulado, un 6×100
       daría seis tiempos crecientes y la media no significaría nada. */
    const r = marcaEn([95_400], 1, 190_000, false)
    expect(r!.valor).toBe('94.6')
  })

  it('tocando una fila saltada, el trozo empieza en la última marca', () => {
    const r = marcaEn([10_000, undefined, undefined], 2, 25_000, false)
    expect(r!.valor).toBe('15')
    expect(r!.abs).toEqual([10_000, undefined, 25_000])
  })

  it('en minutos son dos decimales, que es como se lee un 20 minutos', () => {
    expect(marcaEn([], 0, 1_200_000, true)!.valor).toBe('20')
    expect(marcaEn([], 0, 1_221_000, true)!.valor).toBe('20.35')
  })

  it('UNA CASILLA YA MARCADA NO SE PISA', () => {
    /* A pie de pista se toca mirando al atleta, no a la pantalla. Que un dedo
       gordo borre una marca buena no se perdona: para cambiarla se escribe. */
    expect(marcaEn([95_400], 0, 190_000, false)).toBeNull()
  })

  it('ni se apunta una repetición de cero', () => {
    expect(marcaEn([95_400], 1, 95_400, false)).toBeNull()
    expect(marcaEn([95_400], 1, 90_000, false)).toBeNull()
  })

  it('una fila que no existe no apunta nada', () => {
    expect(marcaEn([], -1, 1000, false)).toBeNull()
    expect(marcaEn([], 1.5, 1000, false)).toBeNull()
  })

  it('NO TOCA LO QUE LE DAN: devuelve una lista nueva', () => {
    /* La lista vive en un ref: cambiarla por dentro dejaría a React sin
       enterarse y la tabla pintaría lo de antes. */
    const antes: (number | undefined)[] = [1000]
    const r = marcaEn(antes, 1, 2000, false)
    expect(antes).toEqual([1000])
    expect(r!.abs).toEqual([1000, 2000])
  })
})

describe('deshacer', () => {
  it('quita la última marcada, no la última fila', () => {
    const r = deshacer([1000, undefined, 5000])
    expect(r.k).toBe(2)
    expect(r.abs).toEqual([1000, undefined, undefined])
  })

  it('sin nada marcado no hay nada que deshacer', () => {
    expect(deshacer([]).k).toBe(-1)
    expect(deshacer(undefined).k).toBe(-1)
  })

  it('y después se puede volver a marcar esa misma', () => {
    /* Si deshacer no liberase la casilla, corregir una marca mala sería
       imposible sin empezar el test de nuevo. */
    const d = deshacer([1000, 5000])
    expect(marcaEn(d.abs, 1, 6000, false)!.valor).toBe('5')
  })
})

describe('el parcial que se marca ahora', () => {
  it('el primero es todo lo que lleva el reloj', () => {
    expect(parcialAhora([], 95_400)).toBe(95.4)
  })

  it('y los siguientes, LO QUE HA PASADO DESDE EL ÚLTIMO', () => {
    expect(parcialAhora(['95.4'], 190_000)).toBe(94.6)
    expect(parcialAhora(['95.4', '94.6'], 280_000)).toBe(90)
  })

  it('CONTRA TODAS LAS MARCAS, no contra las de su fila', () => {
    /* Dentro de un bloque el reloj no se para entre serie y serie: el primer
       paso de la 2.ª empieza donde acabó el último de la 1.ª. Midiéndolo
       contra el principio de su propia fila se comería la serie anterior. */
    const seriePrimera = ['15', '15.5', '16', '15.5']
    expect(parcialAhora(seriePrimera, 77_000)).toBe(15)
  })

  it('los huecos no cuentan como marcas de cero', () => {
    expect(parcialAhora(['15', '', null, '15'], 45_000)).toBe(15)
    expect(parcialAhora(null, 10_000)).toBe(10)
  })

  it('sin que haya pasado tiempo no se marca nada', () => {
    expect(parcialAhora(['95.4'], 95_400)).toBeNull()
    expect(parcialAhora(['95.4'], 90_000)).toBeNull()
  })
})
