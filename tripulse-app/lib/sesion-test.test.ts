// ============================================================
// Un día de test: lo que se guarda en la sesión
// ============================================================
//
// Lo que se sujeta aquí es que los DOS catálogos no se mezclen —la batería va
// por clave de texto y los tuyos por id numérico— y que lo guardado se lea
// siempre a la defensiva: una sesión con basura en esa columna tiene que
// comportarse como una sesión normal, no reventar la pantalla del jueves.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  claveDeTest, enlaceDelTest, leerTestDeSesion, mismoTest, nombreDelTest,
  testHecho, ultimaVezDelTest,
} from './sesion-test'
import { CATALOGO } from './catalogo-tests'
import { SIN_COPIAR } from './grupos-volcado'

describe('lo guardado se lee a la defensiva', () => {
  it('uno de la batería', () => {
    expect(leerTestDeSesion({ origen: 'bateria', clave: '6min' })).toEqual({ origen: 'bateria', clave: '6min' })
  })

  it('uno tuyo', () => {
    expect(leerTestDeSesion({ origen: 'propio', id: 12 })).toEqual({ origen: 'propio', id: 12 })
  })

  it('también si viene como texto, que es como lo devuelve a veces la base', () => {
    expect(leerTestDeSesion('{"origen":"propio","id":12}')).toEqual({ origen: 'propio', id: 12 })
  })

  it('nada, basura o medio escrito es una sesión normal', () => {
    for (const malo of [null, undefined, '', 'x', 42, {}, [], { origen: 'otro', id: 1 },
      { origen: 'bateria' }, { origen: 'bateria', clave: '  ' }, { origen: 'propio' },
      { origen: 'propio', id: 0 }, { origen: 'propio', id: -3 }, { origen: 'propio', id: 'doce' }]) {
      expect(leerTestDeSesion(malo), JSON.stringify(malo)).toBeNull()
    }
  })

  it('NO SE CONFUNDEN LOS DOS CATÁLOGOS', () => {
    /* El id 6 de tus tests y la clave «6min» de la batería no tienen nada que
       ver. Guardarlos en la misma casilla sin decir de dónde son es la forma
       segura de abrir el test que no era. */
    const bat = leerTestDeSesion({ origen: 'bateria', clave: '6min' })
    const mio = leerTestDeSesion({ origen: 'propio', id: 6 })
    expect(mismoTest(bat, mio)).toBe(false)
    expect(claveDeTest(bat!)).not.toBe(claveDeTest(mio!))
  })
})

describe('cómo se llama', () => {
  it('el de la batería sale del catálogo, sin consultar nada', () => {
    const uno = CATALOGO[0]
    expect(nombreDelTest({ origen: 'bateria', clave: uno.clave }, [])).toBe(uno.nombre)
  })

  it('el tuyo, de tu lista', () => {
    expect(nombreDelTest({ origen: 'propio', id: 12 }, [{ id: 12, nombre: 'Escalonado con lactato' }]))
      .toBe('Escalonado con lactato')
  })

  it('si ya no existe, se dice que no se sabe en vez de enseñar un hueco', () => {
    /* Lo archivaste o lo borraste. La pantalla tiene que poder avisar ANTES del
       jueves de que esa sesión promete un test que no está. */
    expect(nombreDelTest({ origen: 'propio', id: 99 }, [{ id: 12, nombre: 'x' }])).toBeNull()
    expect(nombreDelTest({ origen: 'bateria', clave: 'no-existe' }, [])).toBeNull()
  })
})

describe('el botón abre el test montado', () => {
  it('uno de la batería va a dirigir tests, con la gente y el día', () => {
    expect(enlaceDelTest({ origen: 'bateria', clave: 'navette' }, { deportistas: [35], fecha: '2026-10-08' }))
      .toBe('/tests/dirigir?dep=35&fecha=2026-10-08&test=navette')
  })

  it('uno tuyo va al laboratorio', () => {
    expect(enlaceDelTest({ origen: 'propio', id: 12 }, { deportistas: [35], fecha: '2026-10-08' }))
      .toBe('/laboratorio?dep=35&fecha=2026-10-08&test=12')
  })

  it('UN GRUPO ENTERO CABE EN EL ENLACE', () => {
    /* Las dos pantallas saben pasar el test a varios a la vez, así que un día
       de test de un grupo se abre con todos dentro de una vez. */
    expect(enlaceDelTest({ origen: 'propio', id: 12 }, { deportistas: [1, 2, 3], fecha: '2026-10-08' }))
      .toContain('dep=1%2C2%2C3')
  })

  it('sin gente ni fecha sigue siendo un enlace válido', () => {
    expect(enlaceDelTest({ origen: 'bateria', clave: 'cmj' }, {})).toBe('/tests/dirigir?test=cmj')
    expect(enlaceDelTest({ origen: 'propio', id: 4 }, { deportistas: [0, NaN] })).toBe('/laboratorio?test=4')
  })
})

describe('si ya está hecho', () => {
  const meds = [
    { id_definicion: 12, fecha: '2026-06-12' },
    { id_definicion: 12, fecha: '2026-10-08' },
    { id_definicion: 5, fecha: '2026-10-08' },
  ]

  it('de los tuyos se sabe: hay medición de ese test ese día', () => {
    expect(testHecho({ origen: 'propio', id: 12 }, '2026-10-08', meds)).toBe(true)
    expect(testHecho({ origen: 'propio', id: 12 }, '2026-10-09', meds)).toBe(false)
    expect(testHecho({ origen: 'propio', id: 7 }, '2026-10-08', meds)).toBe(false)
  })

  it('DE LA BATERÍA NO SE SABE, y se dice que no se sabe', () => {
    /* Sus tablas no dejan escrito cuál de los diecisiete fue. Un ✅ inventado
       ahí es peor que no tener ninguno: un test dado por hecho no se repite. */
    expect(testHecho({ origen: 'bateria', clave: '6min' }, '2026-10-08', meds)).toBeNull()
  })

  it('la última vez es la más reciente ANTES de ese día', () => {
    expect(ultimaVezDelTest({ origen: 'propio', id: 12 }, '2026-10-08', meds)).toBe('2026-06-12')
    /* La de ese mismo día no cuenta como «la anterior»: es esta. */
    expect(ultimaVezDelTest({ origen: 'propio', id: 12 }, '2026-06-12', meds)).toBeNull()
    expect(ultimaVezDelTest({ origen: 'bateria', clave: '6min' }, '2026-10-08', meds)).toBeNull()
  })
})

// ------------------------------------------------------------
// EL ALAMBRE
// ------------------------------------------------------------

describe('al grupo se le puede poner', () => {
  it('el test viaja al volcar, porque la lista es de lo que NO se copia', () => {
    /* Un día de test de un grupo llega a cada miembro porque `limpiar` copia
       todo lo que no esté en `SIN_COPIAR`. Si alguien mete ahí «test» pensando
       que es un dato de la ficha del grupo, el volcado dejaría a todos sin
       test y la pantalla del grupo seguiría enseñándolo. */
    expect(SIN_COPIAR.has('test')).toBe(false)
  })
})

describe('un solo sitio decide qué test lleva una sesión', () => {
  it('nadie lee «sesion.test» por su cuenta', () => {
    /* La columna es jsonb y puede traer basura o un modelo viejo. Quien la lea
       sin pasar por `leerTestDeSesion` se come el caso raro sin enterarse. */
    const RAIZ = path.resolve(__dirname, '..')
    const malas: string[] = []
    const recorre = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) { recorre(p); continue }
        if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue
        const src = fs.readFileSync(p, 'utf8')
        /* Usar el campo sin el lector: `s.test` / `sesion.test` / `.test?.` */
        if (/\b(sesion|ses|s|src)\.test\b/.test(src) && !/leerTestDeSesion/.test(src)) {
          malas.push(path.relative(RAIZ, p))
        }
      }
    }
    for (const c of ['app', 'components']) recorre(path.join(RAIZ, c))
    expect(malas, 'leen sesion.test a pelo: ' + malas.join(', ')).toEqual([])
  })
})
