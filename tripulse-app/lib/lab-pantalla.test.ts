// ============================================================
// La pantalla de pasar el test, a tu gusto
// ============================================================
//
// Lo que se sujeta aquí no es el orden —eso se ve—, sino lo que se rompería
// EN SILENCIO: que un reloj añadido después de ordenar la pantalla no
// aparezca, que un hueco de algo borrado se quede ahí, y que alguien esconda
// el trozo de guardar y se quede con una pantalla desde la que no se puede
// apuntar nada.

import { describe, it, expect } from 'vitest'
import {
  alternar, leerPantalla, mover, pantallaDe, seccionesDeTest, tienePantalla,
  type Pantalla,
} from './lab-pantalla'
import { col, type TestLab } from './lab-constructor'

/** Un test con cuenta atrás, parciales y pulsador. */
const TEST: TestLab = {
  nombre: 'x', deporte: 'Carrera',
  sueltos: [
    col({ clave: 'p', instrumento: 'parciales' }),
    col({ clave: 'n', instrumento: 'contador' }),
  ],
  bloques: [{
    clave: 'b', etiqueta: '', modo: 'cerrado', veces: 1, duracion: 60, columnas: [],
  }],
  resultados: [],
}

describe('qué secciones tiene un test', () => {
  it('las que tiene de verdad, y guardar siempre', () => {
    expect(seccionesDeTest(TEST)).toEqual(['cuenta', 'parciales', 'pulsadores', 'guardar'])
  })

  it('un test sin relojes solo tiene guardar', () => {
    expect(seccionesDeTest({ nombre: 'y', deporte: 'Otro', sueltos: [col({ clave: 'a' })], bloques: [], resultados: [] }))
      .toEqual(['guardar'])
  })
})

describe('lo guardado se cuadra con lo que el test tiene HOY', () => {
  it('sin nada guardado, el orden es el de serie', () => {
    expect(pantallaDe(TEST).todas).toEqual(['cuenta', 'parciales', 'pulsadores', 'guardar'])
  })

  it('manda el orden guardado', () => {
    const g: Pantalla = { orden: ['pulsadores', 'cuenta', 'parciales', 'guardar'], ocultas: [] }
    expect(pantallaDe(TEST, g).todas).toEqual(['pulsadores', 'cuenta', 'parciales', 'guardar'])
  })

  it('UNA SECCIÓN NUEVA NO QUEDA INVISIBLE: va al final', () => {
    /* Ordenaste la pantalla y después le añadiste un pulsador. Si solo se
       pintara lo guardado, el pulsador no aparecería y parecería que no se ha
       creado. */
    const g: Pantalla = { orden: ['cuenta', 'parciales', 'guardar'], ocultas: [] }
    const r = pantallaDe(TEST, g)
    expect(r.todas).toEqual(['cuenta', 'parciales', 'guardar', 'pulsadores'])
    expect(r.visibles).toContain('pulsadores')
  })

  it('lo guardado que ya no existe se ignora', () => {
    const g: Pantalla = { orden: ['escalones', 'cuenta', 'parciales', 'pulsadores', 'guardar'], ocultas: [] }
    expect(pantallaDe(TEST, g).todas).not.toContain('escalones')
  })

  it('lo escondido no se pinta, pero sigue estando para volver a enseñarlo', () => {
    const g: Pantalla = { orden: [], ocultas: ['parciales'] }
    const r = pantallaDe(TEST, g)
    expect(r.todas).toContain('parciales')
    expect(r.visibles).not.toContain('parciales')
  })

  it('GUARDAR NO SE PUEDE ESCONDER, ni aunque venga escondido de la base', () => {
    /* Una pantalla desde la que no se puede apuntar la medición no es una
       pantalla configurada: es una rota. */
    const r = pantallaDe(TEST, { orden: [], ocultas: ['guardar'] })
    expect(r.visibles).toContain('guardar')
    expect(alternar([], 'guardar')).toEqual([])
  })
})

describe('mover y esconder', () => {
  const o: Parameters<typeof mover>[0] = ['cuenta', 'parciales', 'pulsadores', 'guardar']

  it('sube y baja', () => {
    expect(mover(o, 'parciales', -1)).toEqual(['parciales', 'cuenta', 'pulsadores', 'guardar'])
    expect(mover(o, 'parciales', 1)).toEqual(['cuenta', 'pulsadores', 'parciales', 'guardar'])
  })

  it('en los extremos no pasa nada, y no se pierde ninguna', () => {
    expect(mover(o, 'cuenta', -1)).toEqual(o)
    expect(mover(o, 'guardar', 1)).toEqual(o)
    expect(mover(o, 'noexiste' as 'cuenta', -1)).toEqual(o)
  })

  it('esconder es un interruptor', () => {
    expect(alternar([], 'parciales')).toEqual(['parciales'])
    expect(alternar(['parciales'], 'parciales')).toEqual([])
  })
})

describe('lo guardado se lee a la defensiva', () => {
  it('las claves inventadas se tiran', () => {
    expect(leerPantalla({ orden: ['cuenta', 'inventada', 42], ocultas: ['pulsadores', null] }))
      .toEqual({ orden: ['cuenta'], ocultas: ['pulsadores'] })
  })

  it('las repetidas también', () => {
    expect(leerPantalla({ orden: ['cuenta', 'cuenta'] }).orden).toEqual(['cuenta'])
  })

  it('basura entera es una pantalla sin tocar', () => {
    for (const malo of [null, undefined, 'x', 42, []]) {
      expect(leerPantalla(malo), JSON.stringify(malo)).toEqual({ orden: [], ocultas: [] })
    }
  })

  it('una pantalla sin tocar no ocupa sitio al guardar', () => {
    expect(tienePantalla({ orden: [], ocultas: [] })).toBe(false)
    expect(tienePantalla({ orden: ['cuenta'], ocultas: [] })).toBe(true)
    expect(tienePantalla(null)).toBe(false)
  })
})
