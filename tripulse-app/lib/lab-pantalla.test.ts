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
  alternar, leerPantalla, mover, moverA, pantallaDe, seccionesDeTest, tienePantalla, tieneReloj,
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
    /* EL RELOJ ES UNA SECCIÓN MÁS, y va la primera de serie. Se metió aquí
       para poder bajarlo: al pasar el test lo que se mira sin parar es la
       tabla, que en el móvil queda debajo de todo. */
    expect(seccionesDeTest(TEST)).toEqual(['reloj', 'cuenta', 'parciales', 'pulsadores', 'guardar'])
  })

  it('un test sin relojes solo tiene guardar', () => {
    expect(seccionesDeTest({ nombre: 'y', deporte: 'Otro', sueltos: [col({ clave: 'a' })], bloques: [], resultados: [] }))
      .toEqual(['guardar'])
  })

  it('UN PULSADOR NO PIDE RELOJ: contar flexiones no mide tiempo', () => {
    /* Por eso no vale preguntarle a `relojesDe`, que cuenta los pulsadores
       entre los relojes: saldría la sección del reloj en un test que no lo
       lleva, con su «Empezar» sin nada que arrancar. */
    const soloPulsador: TestLab = {
      nombre: 'z', deporte: 'Fuerza', bloques: [], resultados: [],
      sueltos: [col({ clave: 'n', instrumento: 'contador' })],
    }
    expect(tieneReloj(soloPulsador)).toBe(false)
    expect(seccionesDeTest(soloPulsador)).toEqual(['pulsadores', 'guardar'])
  })
})

describe('lo guardado se cuadra con lo que el test tiene HOY', () => {
  it('sin nada guardado, el orden es el de serie', () => {
    expect(pantallaDe(TEST).todas).toEqual(['reloj', 'cuenta', 'parciales', 'pulsadores', 'guardar'])
  })

  it('manda el orden guardado', () => {
    const g: Pantalla = { orden: ['pulsadores', 'cuenta', 'parciales', 'reloj', 'guardar'], ocultas: [] }
    expect(pantallaDe(TEST, g).todas).toEqual(['pulsadores', 'cuenta', 'parciales', 'reloj', 'guardar'])
  })

  it('UNA SECCIÓN NUEVA NO QUEDA INVISIBLE: va al final', () => {
    /* Ordenaste la pantalla y después le añadiste un pulsador. Si solo se
       pintara lo guardado, el pulsador no aparecería y parecería que no se ha
       creado. */
    const g: Pantalla = { orden: ['reloj', 'cuenta', 'parciales', 'guardar'], ocultas: [] }
    const r = pantallaDe(TEST, g)
    expect(r.todas).toEqual(['reloj', 'cuenta', 'parciales', 'guardar', 'pulsadores'])
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

describe('CON UNA SOLA PERSONA, los botones por persona sobran', () => {
  /* Lo vio el entrenador en cuanto funcionó la tabla: «si ya se puede pulsar
     abajo en la tabla, eso sobra no?». Y sobra, pero solo cuando es uno: la
     tabla enseña a UNA persona, así que con un grupo esas filas son lo único
     que deja marcar a seis sin ir cambiando de atleta a mitad de serie. */
  const conTodo: TestLab = {
    nombre: 'x', deporte: 'Carrera',
    sueltos: [col({ clave: 'p', instrumento: 'parciales' }), col({ clave: 'n', instrumento: 'contador' })],
    bloques: [{ clave: 'b', etiqueta: '', modo: 'cerrado', veces: 3, duracion: 60, columnas: [] }],
    resultados: [], descanso: 90,
  }

  it('con una persona se caen, y queda lo que no se repite', () => {
    const r = pantallaDe(conTodo, null, 1)
    expect(r.visibles).toEqual(['reloj', 'cuenta', 'descanso', 'guardar'])
  })

  it('EL RELOJ NO SE CAE NUNCA, ni se puede esconder', () => {
    /* Sin él no se puede ni empezar, haya una persona o diez. */
    expect(pantallaDe(conTodo, { orden: [], ocultas: ['reloj'] }, 1).visibles).toContain('reloj')
    expect(alternar([], 'reloj')).toEqual([])
  })

  it('con nadie todavía, igual', () => {
    expect(pantallaDe(conTodo, null, 0).visibles).not.toContain('pulsadores')
  })

  it('CON DOS VUELVEN, que es cuando sirven de algo', () => {
    const r = pantallaDe(conTodo, null, 2)
    expect(r.visibles).toContain('parciales')
    expect(r.visibles).toContain('pulsadores')
  })

  it('SIN DECIR CUÁNTOS SE DIBUJA ENTERA, y de eso depende poder configurarla', () => {
    /* NO es un detalle: el editor es el único sitio donde se ordena y se
       esconde, y al montar el test solo hay una persona de mentira. Si allí se
       cayeran las secciones, no quedaría más que «guardar» — y el botón de
       ordenar, que solo sale con más de una sección, tampoco. Haciendo que
       sobraran con una persona me cargué la única forma de configurarla, y el
       entrenador lo notó enseguida: «¿cómo se editaba la pantalla para mover
       las cosas de sitio?». */
    const r = pantallaDe(conTodo)
    expect(r.visibles).toContain('pulsadores')
    expect(r.todas.length).toBeGreaterThan(1)
  })

  it('LA CUENTA ATRÁS Y EL DESCANSO NO SE CAEN NUNCA', () => {
    /* Esos cantan un número que no sale en ningún otro sitio: quitarlos
       dejaría a quien pasa el test sin saber cuánto queda. */
    const r = pantallaDe(conTodo, null, 1)
    expect(r.visibles).toContain('cuenta')
    expect(r.visibles).toContain('descanso')
  })

  it('y tampoco se puede quedar sin guardar', () => {
    expect(pantallaDe(conTodo, null, 1).visibles).toContain('guardar')
  })
})

describe('QUÉ SE VE AHORA y QUÉ SE PUEDE ORDENAR son dos preguntas', () => {
  /* Este se escribe por un fallo cometido DOS VECES en una tarde. Con una sola
     persona las secciones de botón por persona no se dibujan; el engranaje
     listaba lo dibujado, así que se quedó sin nada que ordenar y desapareció
     —«¿cómo se editaba la pantalla para mover las cosas de sitio?»—. Al
     devolverlas para recuperarlo, volvieron a la pantalla las filas que se
     acababan de quitar: «¿por qué vuelve a salir esto? ¿no lo quitamos?».

     Lo que se puede ordenar es del TEST; lo que se ve, de quién lo pasa. */
  const conTodo: TestLab = {
    nombre: 'x', deporte: 'Carrera',
    sueltos: [col({ clave: 'n', instrumento: 'contador' })],
    bloques: [{ clave: 'b', etiqueta: '', modo: 'cerrado', veces: 3, duracion: 0, columnas: [] }],
    resultados: [],
  }

  it('con una persona no se dibujan, PERO SE SIGUEN PUDIENDO ORDENAR', () => {
    const r = pantallaDe(conTodo, null, 1)
    expect(r.visibles).not.toContain('pulsadores')
    expect(r.delTest).toContain('pulsadores')
  })

  it('y así el engranaje nunca se queda sin nada que ordenar', () => {
    /* El botón sale cuando hay más de una sección que mover. Mirando lo
       dibujado, con una persona se quedaba en «guardar» y no salía. */
    expect(pantallaDe(conTodo, null, 1).delTest.length).toBeGreaterThan(1)
  })

  it('el orden guardado manda en las dos listas', () => {
    const g: Pantalla = { orden: ['guardar', 'pulsadores'], ocultas: [] }
    const r = pantallaDe(conTodo, g, 1)
    expect(r.delTest).toEqual(['guardar', 'pulsadores'])
    expect(r.todas).toEqual(['guardar'])
  })

  it('con dos, lo que se ve y lo que se ordena vuelven a ser lo mismo', () => {
    const r = pantallaDe(conTodo, null, 2)
    expect(r.todas).toEqual(r.delTest)
  })
})
