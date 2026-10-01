// ============================================================
// Los relojes del laboratorio: lo que se anuncia es lo que se pinta
// ============================================================
//
// LO QUE HABÍA, Y POR QUÉ ESTE FICHERO EXISTE. La previa del editor decía
// «⏱ Al pasarlo llevará reloj: cronómetro en «400 m»» y al pasarlo NO HABÍA
// NINGÚN CRONÓMETRO. La frase salía de `relojesDe`, que sí miraba las casillas
// sueltas; los relojes de verdad salían de `cronosDe`, que solo recorre las
// columnas de DENTRO de los bloques. Dos recorridos contestando a la misma
// pregunta, y el que hablaba no era el que pintaba.
//
// Un CSS de natación —el 400 y el 200, dos casillas sueltas cronometradas— caía
// justo ahí. Y un test que solo dura —un Cooper de 12 min— no tenía reloj ni
// salía anunciado: la única cuenta atrás que existía exigía una columna de
// velocidad, así que había que sacar el móvil.
//
// LA REGLA. `relojesDe` se monta con LAS MISMAS LISTAS que pinta la pantalla, y
// el último test de este fichero lee el código para comprobarlo: si alguien
// añade una familia de reloj a `relojesDe` y no la pinta, salta aquí.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  col, conRelojDe, contadoresSueltosDe, cronometradosDe, cronosDe, cronosSueltosDe,
  cuentaAtras, escalonAhora, escalonadosDe, finDe, relojesDe, SOLO_SUELTOS, type Bloque, type TestLab,
} from './lab-constructor'

const bloque = (b: Partial<Bloque> & { clave: string }): Bloque => ({
  etiqueta: '', modo: 'cerrado', veces: 1, duracion: 0, columnas: [], ...b,
})

/** El CSS: dos casillas sueltas, las dos cronometradas. */
const CSS: TestLab = {
  nombre: 'CSS', deporte: 'Natación',
  sueltos: [
    col({ clave: 't400', etiqueta: '400 m', unidad: 's', instrumento: 'crono-seg' }),
    col({ clave: 't200', etiqueta: '200 m', unidad: 's', instrumento: 'crono-seg' }),
  ],
  bloques: [], resultados: [],
}

/** El Cooper: doce minutos que hay que contar, y los metros al final. */
const COOPER: TestLab = {
  nombre: 'Cooper', deporte: 'Carrera', sueltos: [],
  bloques: [bloque({
    clave: 'c', etiqueta: 'Los 12 minutos', duracion: 720, veces: 1,
    columnas: [col({ clave: 'metros', etiqueta: 'Metros', unidad: 'm' })],
  })],
  resultados: [],
}

/** Un escalonado de verdad: dura Y canta velocidad. */
const VAM: TestLab = {
  nombre: 'VAM', deporte: 'Carrera', sueltos: [],
  bloques: [bloque({
    clave: 'e', etiqueta: 'Escalón', modo: 'abierto', veces: 20, duracion: 60,
    columnas: [
      col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada', tipo: 'progresion', desde: 8, paso: 0.5 }),
    ],
  })],
  resultados: [],
}

describe('las casillas sueltas también llevan instrumento', () => {
  it('un cronómetro suelto se ve', () => {
    expect(cronosSueltosDe(CSS).map(c => c.clave)).toEqual(['t400', 't200'])
  })

  it('un contador suelto se ve', () => {
    const t: TestLab = { ...CSS, sueltos: [col({ clave: 'vueltas', instrumento: 'contador' })] }
    expect(contadoresSueltosDe(t).map(c => c.clave)).toEqual(['vueltas'])
  })

  it('una casilla del protocolo NO lleva instrumento, aunque se lo hayan dejado puesto', () => {
    /* Al cambiarla a «la pones tú» el instrumento puede quedarse escrito. Si se
       mirara, aparecería un cronómetro para una casilla que ya viene rellena. */
    const t: TestLab = {
      ...CSS,
      sueltos: [col({ clave: 'pendiente', clase: 'dada', instrumento: 'crono-seg' })],
    }
    expect(cronosSueltosDe(t)).toEqual([])
    expect(relojesDe(t)).toEqual([])
  })

  it('a mano no es un reloj', () => {
    const t: TestLab = { ...CSS, sueltos: [col({ clave: 'metros', instrumento: 'mano' })] }
    expect(cronosSueltosDe(t)).toEqual([])
    expect(contadoresSueltosDe(t)).toEqual([])
  })
})

describe('un bloque que dura lleva reloj aunque no cante velocidad', () => {
  it('el Cooper sale en los cronometrados, no en los escalonados', () => {
    expect(cronometradosDe(COOPER).map(b => b.clave)).toEqual(['c'])
    expect(escalonadosDe(COOPER)).toEqual([])
  })

  it('la VAM sale en los escalonados, no en los cronometrados', () => {
    expect(escalonadosDe(VAM).map(b => b.clave)).toEqual(['e'])
    expect(cronometradosDe(VAM)).toEqual([])
  })

  it('un bloque sin duración no lleva reloj de ninguna clase', () => {
    /* El 6×100: se cronometra cada repetición, pero el bloque no dura nada
       por sí mismo. Su reloj es el de la columna, no el del bloque. */
    const t: TestLab = {
      nombre: '6x100', deporte: 'Natación', sueltos: [], resultados: [],
      bloques: [bloque({
        clave: 'r', veces: 6, duracion: 0,
        columnas: [col({ clave: 't100', unidad: 's', instrumento: 'crono-seg' })],
      })],
    }
    expect(conRelojDe(t)).toEqual([])
    expect(cronosDe(t).map(x => x.c.clave)).toEqual(['t100'])
  })

  it('CADA bloque con reloj cae en una lista y solo en una', () => {
    /* Son complementarias por construcción, y esto lo sujeta: si un día se
       separan, un bloque se quedaría sin reloj —o con dos— sin que fallara
       nada más. */
    const mezcla: TestLab = { ...VAM, bloques: [...VAM.bloques, ...COOPER.bloques] }
    const todos = conRelojDe(mezcla).map(b => b.clave).sort()
    const partido = [...escalonadosDe(mezcla), ...cronometradosDe(mezcla)].map(b => b.clave).sort()
    expect(partido).toEqual(todos)
    expect(new Set(partido).size).toBe(partido.length)
  })
})

describe('la cuenta atrás sabe acabarse', () => {
  const COOPER_BL = COOPER.bloques[0]

  it('al empezar quedan los doce minutos enteros', () => {
    const c = cuentaAtras(COOPER_BL, 0)
    expect(c).toMatchObject({ pasadas: 0, rep: 1, restante: 720, fin: false })
  })

  it('un segundo antes del final queda un segundo', () => {
    expect(cuentaAtras(COOPER_BL, 719_000).restante).toBe(1)
  })

  it('EN EL 12:00 SE ACABA, no vuelve a empezar', () => {
    /* ESTE ES EL FALLO QUE TRAJO A `cuentaAtras` AL MUNDO, y por eso el test
       enseña las dos cuentas juntas. `escalonAhora` recorta la repetición al
       tope del protocolo: a los doce minutos sigue diciendo «la 1.ª», así que
       con él no hay final que detectar y el reloj volvía a 12:00 en silencio. */
    expect(escalonAhora(COOPER_BL, 720_000)).toBe(1)

    const c = cuentaAtras(COOPER_BL, 720_000)
    expect(c.fin).toBe(true)
    expect(c.restante).toBe(0)
    expect(c.pasadas).toBe(1)
  })

  it('y sigue acabado aunque el reloj se quede andando', () => {
    /* Nadie para el reloj al acabar: se guarda el dato y luego ya. Sin esto,
       a los veinticuatro minutos cantaría otro final. */
    const c = cuentaAtras(COOPER_BL, 1_440_000)
    expect(c.fin).toBe(true)
    expect(c.pasadas).toBe(2)
  })

  it('con varias repeticiones va diciendo en cuál va', () => {
    const bl = bloque({ clave: 'x', veces: 3, duracion: 60 })
    expect(cuentaAtras(bl, 59_000)).toMatchObject({ rep: 1, restante: 1 })
    expect(cuentaAtras(bl, 60_000)).toMatchObject({ rep: 2, restante: 60 })
    expect(cuentaAtras(bl, 179_000)).toMatchObject({ rep: 3, restante: 1 })
    expect(cuentaAtras(bl, 180_000).fin).toBe(true)
  })

  it('un abierto no se acaba: sigue contando repeticiones', () => {
    const bl = bloque({ clave: 'x', modo: 'abierto', veces: 3, duracion: 60 })
    expect(cuentaAtras(bl, 600_000)).toMatchObject({ rep: 11, fin: false })
  })

  it('con tramos canta LO QUE QUEDA DEL TRAMO, que es lo que sirve', () => {
    const bl = bloque({
      clave: 'x', veces: 2, duracion: 0,
      tramos: [{ nombre: 'Corre', segundos: 30 }, { nombre: 'Anda', segundos: 15 }],
    })
    expect(cuentaAtras(bl, 10_000)).toMatchObject({ tramo: 'Corre', restante: 20, rep: 1 })
    expect(cuentaAtras(bl, 35_000)).toMatchObject({ tramo: 'Anda', restante: 10 })
    expect(cuentaAtras(bl, 45_000)).toMatchObject({ tramo: 'Corre', restante: 30, rep: 2 })
    expect(cuentaAtras(bl, 90_000).fin).toBe(true)
  })

  it('un bloque sin duración no cuenta nada', () => {
    expect(cuentaAtras(bloque({ clave: 'x', veces: 6 }), 10_000))
      .toMatchObject({ restante: 0, fin: false })
  })
})

describe('un cerrado que se acaba, se acaba', () => {
  it('pasada la última repetición, se acabó', () => {
    const bl = bloque({ clave: 'c', veces: 3, duracion: 60 })
    expect(finDe(bl, 3)).toBe(false)
    expect(finDe(bl, 4)).toBe(true)
  })

  it('un abierto no se acaba nunca: cuántas hubo ES el dato', () => {
    const bl = bloque({ clave: 'e', modo: 'abierto', veces: 20, duracion: 60 })
    expect(finDe(bl, 21)).toBe(false)
    expect(finDe(bl, 99)).toBe(false)
  })
})

describe('no se ofrece lo que no se pinta', () => {
  /* El fallo que ya ha pasado dos veces en esta pantalla: un instrumento que
     se puede elegir y luego no aparece. El pulsador y los parciales se pintan
     recorriendo las casillas SUELTAS, así que dentro de un bloque no existen
     — y el editor no los ofrece ahí. Esto comprueba las dos mitades. */
  const suelto = (inst: 'contador' | 'parciales'): TestLab => ({
    nombre: 'x', deporte: 'Carrera', bloques: [], resultados: [],
    sueltos: [col({ clave: 'c', etiqueta: 'Eso', instrumento: inst })],
  })
  const enBloque = (inst: 'contador' | 'parciales'): TestLab => ({
    nombre: 'x', deporte: 'Carrera', sueltos: [], resultados: [],
    bloques: [bloque({ clave: 'b', veces: 3, columnas: [col({ clave: 'c', etiqueta: 'Eso', instrumento: inst })] })],
  })

  for (const inst of SOLO_SUELTOS) {
    it('«' + inst + '» se anuncia suelto y NO dentro de un bloque', () => {
      expect(relojesDe(suelto(inst as 'contador')).length, 'suelto').toBe(1)
      expect(relojesDe(enBloque(inst as 'contador')), 'en un bloque').toEqual([])
    })
  }

  it('y la pantalla filtra con ESA lista, no con una suya', () => {
    const RAIZ = path.resolve(__dirname, '..')
    const src = fs.readFileSync(path.join(RAIZ, 'app', 'laboratorio', 'page.tsx'), 'utf8')
    expect(src, 'el editor no usa SOLO_SUELTOS para filtrar').toContain('SOLO_SUELTOS.includes(k)')
  })
})

describe('lo que se anuncia', () => {
  it('el CSS anuncia sus dos cronómetros', () => {
    const r = relojesDe(CSS)
    expect(r).toHaveLength(2)
    expect(r[0]).toContain('cronómetro')
    expect(r[0]).toContain('400 m')
    expect(r[1]).toContain('200 m')
  })

  it('el Cooper anuncia su cuenta atrás', () => {
    const r = relojesDe(COOPER)
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('cuenta atrás')
    expect(r[0]).toContain('720 s')
  })

  it('un test sin nada que contar no anuncia reloj', () => {
    const t: TestLab = {
      nombre: 'FTP 20', deporte: 'Ciclismo', bloques: [], resultados: [],
      sueltos: [col({ clave: 'p20', instrumento: 'mano' })],
    }
    expect(relojesDe(t)).toEqual([])
  })
})

// ------------------------------------------------------------
// EL ALAMBRE: este test lee el código
// ------------------------------------------------------------

const RAIZ = path.resolve(__dirname, '..')
const FUENTE = fs.readFileSync(path.join(RAIZ, 'lib', 'lab-constructor.ts'), 'utf8')
const PAGINA = fs.readFileSync(path.join(RAIZ, 'app', 'laboratorio', 'page.tsx'), 'utf8')

describe('lo que se anuncia es lo que se pinta', () => {
  it('la pantalla usa TODAS las listas con las que se monta el anuncio', () => {
    /* La lista no se escribe a mano aquí: se saca del cuerpo de `relojesDe`.
       Así, quien meta una familia nueva de reloj en el anuncio tiene que
       pintarla, y quien la pinte sin anunciarla deja la previa mintiendo —que
       es exactamente lo que pasó con el cronómetro de las casillas sueltas. */
    const i = FUENTE.indexOf('export function relojesDe(')
    expect(i).toBeGreaterThan(0)
    const cuerpo = FUENTE.slice(i, FUENTE.indexOf('\n}', i))

    const listas = [...new Set([...cuerpo.matchAll(/\b(\w+De)\(/g)].map(m => m[1]))]
      .filter(n => n !== 'duracionDe')   // no es una lista de relojes: es cuánto dura uno

    expect(listas.length).toBeGreaterThan(2)
    for (const n of listas) {
      expect(PAGINA, 'la pantalla de pasar el test no usa ' + n).toContain(n + '(test)')
    }
  })

  it('la sección «el reloj» de un bloque conoce los DOS relojes', () => {
    /* Un bloque puede llevar dos relojes que no hacen lo mismo: el del
       protocolo —cada tanto pasa solo— y el cronómetro, que lo lleva el
       entrenador y hace que la repetición dure lo que dure. El segundo se
       enciende en la columna, así que la sección que se llama EL RELOJ llegó a
       decir «este bloque no lleva reloj» con el cronómetro puesto dos dedos más
       arriba. Si alguien la deja otra vez mirando solo la duración, esto salta. */
    const i = PAGINA.indexOf('function RelojBloque(')
    expect(i).toBeGreaterThan(0)
    const cuerpo = PAGINA.slice(i, PAGINA.indexOf('\n}\n', i))
    expect(cuerpo).toContain('duracion')
    expect(cuerpo).toMatch(/instrumento\.indexOf\('crono'\)/)
  })

  it('la pantalla no decide por su cuenta qué bloques llevan reloj', () => {
    /* Filtrar los bloques a mano en la pantalla es como volvió a nacer este
       fallo la primera vez. Si hace falta otro corte, se le pone nombre y se
       pone aquí al lado de los demás. */
    expect(PAGINA).not.toMatch(/bloques\.filter\([^)]*duracion/)
  })
})
