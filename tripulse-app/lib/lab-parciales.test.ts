// ============================================================
// Parciales: marcar sin parar el reloj
// ============================================================
//
// EL CASO. «En vez de parar el cronómetro, que cuente el tiempo en el que pasó
// algo y siga corriendo, pero que quede anotado dónde se le dio.» Los mil de un
// 3×1000, los pasos de una prueba larga, dónde iba al kilómetro 2.
//
// SE PODÍA A MEDIAS: un bloque de repeticiones con cronómetro ya marca sin
// parar el reloj. Lo que no se podía es marcar SIN DECIR ANTES CUÁNTAS VECES,
// que es justo lo que hace falta cuando marcas lo que va pasando.
//
// LO QUE SE GUARDA ES EL PARCIAL, no el acumulado. El parcial es lo que se
// agrega —la media de los mil, el mejor mil— y el acumulado sale de sumar. Al
// revés se perdería: la media de unos acumulados no significa nada.
//
// Y LO QUE MÁS IMPORTA DE TODO ESTO: no hizo falta tocar el motor. Una casilla
// suelta mete su valor tal cual en las variables, así que una lista se agrega
// con las mismas funciones que una serie de un bloque. Los tres tests del
// final lo demuestran; si alguien cambia eso, saltan.

import { describe, it, expect } from 'vitest'
import {
  acumuladosDe, calcular, col, fnB, medVacia, parcialesDe, pegasDe, relojesDe,
  type TestLab,
} from './lab-constructor'
import { leerModelo, paraGuardar } from './lab-guardar'

/** Un 5×1000: se marca cada mil sin parar el reloj. */
const MILES: TestLab = {
  nombre: 'Series de mil', deporte: 'Carrera',
  sueltos: [col({ clave: 'p', etiqueta: 'Cada mil', unidad: 's', instrumento: 'parciales' })],
  bloques: [],
  resultados: [
    { nombre: 'cuantos', unidad: 'ud', formula: [fnB('cuantas', 'p')] },
    { nombre: 'media', unidad: 's', formula: [fnB('media', 'p')] },
    { nombre: 'mejor', unidad: 's', inverso: true, formula: [fnB('minimo', 'p')] },
    { nombre: 'total', unidad: 's', formula: [fnB('suma', 'p')] },
  ],
}

describe('una casilla que guarda una lista', () => {
  it('se reconoce', () => {
    expect(parcialesDe(MILES).map(c => c.clave)).toEqual(['p'])
  })

  it('nace como lista vacía, no como texto', () => {
    /* Arrancarla como texto haría que la primera marca tuviera que adivinar
       en qué se está escribiendo. */
    expect(medVacia(MILES).p).toEqual([])
  })

  it('y se anuncia antes de pasar el test', () => {
    expect(relojesDe(MILES)).toEqual(['parciales en «Cada mil»'])
  })

  it('sobrevive a guardarla y volver a leerla', () => {
    /* El lector es defensivo y degrada a «a mano» lo que no conoce: si se
       olvida de esta, un test guardado pierde sus parciales en silencio. */
    const fila = paraGuardar(MILES, 'entrenador-1')
    expect(leerModelo(fila.modelo, MILES.nombre, MILES.deporte)!.sueltos[0].instrumento).toBe('parciales')
  })
})

describe('EL MONTADOR LA TRATA COMO UNA SERIE', () => {
  /* Esto es lo que casi se me escapa: `calcular` agregaba la lista sin
     problema, pero `pegasDe` —el que decide si el test se puede guardar— miraba
     «¿tiene bloque?» para saber si algo se repite. Los parciales no tienen
     bloque, así que rechazaba media(p) con un «se mide una sola vez» que era
     mentira, y el test no se habría podido guardar nunca. */
  it('deja guardar un test con media(), cuantas() y demás sobre parciales', () => {
    expect(pegasDe(MILES)).toEqual([])
  })

  it('y al revés: usar la lista a pelo se rechaza, y se dice por qué', () => {
    const malo: TestLab = {
      ...MILES,
      resultados: [{ nombre: 'x', unidad: 's', formula: [{ t: 'var', v: 'p' }] }],
    }
    const pegas = pegasDe(malo)
    expect(pegas).toHaveLength(1)
    expect(pegas[0].texto).toContain('LISTA de parciales')
  })

  it('las de dos columnas siguen pidiendo un bloque, y se explica', () => {
    /* Emparejar dos listas por posición daría una recta impecable entre dos
       cosas que no pasaron a la vez. */
    const malo: TestLab = {
      nombre: 'x', deporte: 'Carrera',
      sueltos: [
        col({ clave: 'p', instrumento: 'parciales' }),
        col({ clave: 'q', instrumento: 'parciales' }),
      ],
      bloques: [],
      resultados: [{ nombre: 'r', unidad: '', formula: [{ t: 'fn2', v: 'pendiente', x: 'p', y: 'q' }] }],
    }
    expect(pegasDe(malo).some(z => /de un BLOQUE/.test(z.texto))).toBe(true)
  })

  it('y dentro de una columna calculada tampoco cabe una lista', () => {
    const malo: TestLab = {
      nombre: 'x', deporte: 'Carrera',
      sueltos: [col({ clave: 'p', instrumento: 'parciales' })],
      bloques: [{
        clave: 'b', etiqueta: '', modo: 'cerrado', veces: 2, duracion: 0,
        columnas: [
          col({ clave: 'kg' }),
          col({ clave: 'calc', clase: 'calculada', formula: [{ t: 'var', v: 'kg' }, { t: 'op', v: '*' }, { t: 'var', v: 'p' }] }),
        ],
      }],
      resultados: [{ nombre: 'r', unidad: '', formula: [fnB('media', 'calc')] }],
    }
    expect(pegasDe(malo).some(z => /lista de parciales/.test(z.texto))).toBe(true)
  })
})

describe('el acumulado sale de los parciales', () => {
  it('cada marca es la suma de lo anterior', () => {
    /* Lo que se enseña al marcar: 4:35, 9:12, 14:00. */
    expect(acumuladosDe([275, 277, 288])).toEqual([275, 552, 840])
  })

  it('lo que no es un número no cuenta ni rompe', () => {
    expect(acumuladosDe(['300', '', null, '250'])).toEqual([300, 550])
    expect(acumuladosDe(null)).toEqual([])
    expect(acumuladosDe('x')).toEqual([])
  })
})

describe('EL MOTOR AGREGA LA LISTA SIN TOCARLO', () => {
  const pasar = (t: TestLab, datos: Record<string, unknown>) => {
    const vals = calcular(t, datos)
    const o: Record<string, number | null> = {}
    t.resultados.forEach((r, i) => { o[r.nombre] = vals[i].valor })
    return o
  }

  it('cuenta, promedia, saca el mejor y suma', () => {
    const r = pasar(MILES, { p: [275, 277, 288, 281] })
    expect(r.cuantos).toBe(4)
    expect(r.media).toBeCloseTo(280.25, 6)
    expect(r.mejor).toBe(275)
    expect(r.total).toBe(1121)
  })

  it('con un solo parcial también, que es el caso del que se para en el primero', () => {
    const r = pasar(MILES, { p: [275] })
    expect(r.cuantos).toBe(1)
    expect(r.media).toBe(275)
  })

  it('SIN MARCAR NINGUNO SE DICE QUÉ FALTA, no «no es un número»', () => {
    /* El motivo es lo que le dice al entrenador qué hacer: una lista vacía
       llegando a la fórmula daba un error que no explicaba nada. */
    const vals = calcular(MILES, { p: [] })
    expect(vals[0].valor).toBeNull()
    expect(vals[0].error).toContain('todavía no tiene ningún parcial')
  })
})
