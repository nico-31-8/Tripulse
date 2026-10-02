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
  alternar, leerPantalla, mover, moverA, pantallaDe, seccionesDeTest, tienePantalla,
  type Pantalla,
} from './lab-pantalla'
import { col, restanteDescanso, type TestLab } from './lab-constructor'

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

describe('arrastrar: mover hasta una posición', () => {
  const o: Parameters<typeof moverA>[0] = ['cuenta', 'parciales', 'pulsadores', 'guardar']

  it('hacia arriba', () => {
    expect(moverA(o, 'pulsadores', 0)).toEqual(['pulsadores', 'cuenta', 'parciales', 'guardar'])
  })

  it('HACIA ABAJO sin quedarse a uno, que es el fallo clásico', () => {
    /* Se saca primero y se mira el destino después: si se mirara antes, al
       arrastrar hacia abajo la sección caería una posición más arriba de
       donde la soltaste y parecería que el arrastre «no coge bien». */
    expect(moverA(o, 'cuenta', 2)).toEqual(['parciales', 'pulsadores', 'cuenta', 'guardar'])
    expect(moverA(o, 'cuenta', 3)).toEqual(['parciales', 'pulsadores', 'guardar', 'cuenta'])
  })

  it('soltarla donde estaba no cambia nada', () => {
    expect(moverA(o, 'parciales', 1)).toEqual(o)
  })

  it('fuera de rango se queda en el borde, y no se pierde ninguna', () => {
    expect(moverA(o, 'cuenta', 99)).toEqual(['parciales', 'pulsadores', 'guardar', 'cuenta'])
    expect(moverA(o, 'cuenta', -5)).toEqual(o)
    expect(moverA(o, 'noexiste' as 'cuenta', 1)).toEqual(o)
  })
})

describe('el cronómetro de descanso', () => {
  /* Es la primera cosa del laboratorio que NO apunta nada: un reloj aparte
     para cantar el descanso entre series. */
  const conDescanso: TestLab = {
    nombre: 'x', deporte: 'Carrera', sueltos: [], bloques: [], resultados: [], descanso: 120,
  }

  it('aparece como sección cuando el test lo lleva', () => {
    expect(seccionesDeTest(conDescanso)).toContain('descanso')
  })

  it('y no cuando no', () => {
    expect(seccionesDeTest({ ...conDescanso, descanso: undefined })).not.toContain('descanso')
    expect(seccionesDeTest({ ...conDescanso, descanso: 0 })).not.toContain('descanso')
  })

  it('se puede esconder y mover como las demás', () => {
    const r = pantallaDe(conDescanso, { orden: ['descanso', 'guardar'], ocultas: ['descanso'] })
    expect(r.todas).toEqual(['descanso', 'guardar'])
    expect(r.visibles).toEqual(['guardar'])
  })

  it('lo que queda se para en cero, no sigue a negativo', () => {
    /* Un número que baja de cero se lee mal a pie de pista, y que se acabó ya
       lo dice el pitido. */
    expect(restanteDescanso(120, 0)).toBe(120)
    expect(restanteDescanso(120, 60_000)).toBe(60)
    expect(restanteDescanso(120, 119_500)).toBe(1)
    expect(restanteDescanso(120, 120_000)).toBe(0)
    expect(restanteDescanso(120, 600_000)).toBe(0)
  })

  it('sin descanso puesto no hay cuenta que hacer', () => {
    expect(restanteDescanso(0, 5_000)).toBe(0)
  })
})
