// ============================================================
// En el laboratorio, una casilla vacía no es un cero
// ============================================================
//
// LA TRAMPA. `Number('')`, `Number(null)` y `Number([])` valen 0. Y
// `Number.isFinite(Number(''))` es VERDADERO, porque 0 es finito: así que la
// comprobación que parece protegerte deja pasar el vacío convertido en cero.
// En este proyecto ha mordido más de cuatro veces.
//
// LO QUE SE ENCONTRÓ (revisión de octubre, tanda 2), en el laboratorio, que es
// el fichero que más cambió desde septiembre y donde una casilla vacía es lo
// normal —alguien que no hizo una repetición—:
//
//   · Una columna que arranca de otra casilla (la velocidad de una VAM sale de
//     «Empieza en») se calculaba ENTERA desde 0 si esa casilla estaba vacía,
//     aunque la plantilla traía escrito el respaldo (`desde: 8`).
//   · Una lista con la primera etiqueta en blanco pasaba por lista de
//     velocidades, y el reloj cantaba 0 km/h.
//   · En el editor de fórmulas, los botones de poner un número metían un 0 con
//     la casilla vacía.
//
// ESTE TEST LEE EL CÓDIGO y no deja volver a escribir esas formas.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')

describe('en el laboratorio, una casilla vacía no es un cero', () => {
  const motor = leer('lib', 'lab-constructor.ts')
  const pantalla = leer('app', 'laboratorio', 'page.tsx')

  it('una columna que arranca de otra casilla no la lee a pelo', () => {
    /* Era `c.desdeRef ? Number(datos[c.desdeRef]) : Number(c.desde)`. */
    expect(motor).not.toMatch(/Number\(datos\[c\.(desde|paso)Ref\]\)/)
    expect(motor).toContain('function deCasillaOFijo')
  })

  it('«es un número» no se pregunta con isFinite(Number(...)) a secas', () => {
    /* `isFinite(Number(''))` es verdadero. Hay que mirar el vacío antes. */
    expect(motor).not.toMatch(/Number\.isFinite\(Number\(valorDado\(/)
  })

  it('lo que se teclea en el editor de fórmulas pasa por numeroONada', () => {
    expect(pantalla).not.toMatch(/Number\(String\((numero|aValor)\)\.replace\(',', '\.'\)\)/)
    expect(pantalla).toContain('numeroONada(')
  })
})
