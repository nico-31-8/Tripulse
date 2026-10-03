// ============================================================
// El reloj se declara ANTES de que nadie lo lea
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO.
//
// LO QUE PASÓ (3 de octubre de 2026). La pantalla de pasar un test tiene UN
// SOLO RELOJ: `const ms = ...`. Al unificarlo quedó declarado diez líneas por
// DEBAJO de `seAcaboElTiempo`, que lo lee. Una variable leída antes de existir
// no es un número raro: es un `ReferenceError` que tumba la pantalla entera.
//
// NO LO VIO NADIE, y por dos motivos que se repiten:
//
// 1. TypeScript no lo ve cuando la lectura está dentro de una función que se
//    le pasa a otra —aquí, el `bl => ...` de un `.some()`—, porque no puede
//    saber cuándo se ejecuta.
// 2. Y `.some()` NO LLAMA A NADA con la lista vacía. Así que solo estallaba en
//    los tests que llevan cuenta atrás: todos los demás iban bien, y el fallo
//    esperó a que alguien montase el primero con reloj.
//
// La regla de ESLint que lo caza (`no-use-before-define`) suelta 114 avisos en
// la app, casi todos de funciones de `useCallback` citadas desde un efecto de
// arriba, que es seguro. Encenderla entera sería ruido; esto mira solo el
// reloj compartido, que lo lee media pantalla.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')

/** El código sin comentarios: un `ms` dentro de una explicación no cuenta. */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
}

/** El cuerpo de una función de primer nivel, hasta la siguiente. */
function cuerpoDe(src: string, nombre: string): string {
  const i = src.indexOf('function ' + nombre + '(')
  expect(i, 'no encuentro function ' + nombre).toBeGreaterThan(-1)
  const j = src.indexOf('\nfunction ', i + 1)
  return src.slice(i, j === -1 ? undefined : j)
}

describe('el reloj del laboratorio', () => {
  const src = soloCodigo(fs.readFileSync(path.join(RAIZ, 'app', 'laboratorio', 'page.tsx'), 'utf8'))

  it('SE DECLARA ANTES DE LEERLO, o la pantalla no llega a pintarse', () => {
    const cuerpo = cuerpoDe(src, 'Pasar')
    const declara = cuerpo.indexOf('const ms = ')
    expect(declara, 'Pasar ya no declara `ms`').toBeGreaterThan(-1)

    /* La primera vez que aparece `ms` tiene que ser declarándolo. */
    const primera = cuerpo.search(/\bms\b/)
    expect(
      primera,
      'algo lee `ms` antes de que exista: súbelo. Lo que lo lee está en la línea '
      + (cuerpo.slice(0, primera).split('\n').length) + ' de `Pasar`.',
    ).toBe(declara + 'const '.length)
  })

  it('y hay uno solo, que es de lo que iba todo esto', () => {
    /* Dos relojes en la misma pantalla es que una cuenta atrás y unos parciales
       midan tiempos distintos del mismo test. */
    const cuerpo = cuerpoDe(src, 'Pasar')
    expect(cuerpo.split('const ms = ')).toHaveLength(2)
  })

  it('Y SE CANTA UNA VEZ: dos veces el mismo número son dos relojes', () => {
    /* Lo vio el usuario: «claude porque hay dos relojes, explícame». La sección
       de un cronómetro de bloque volvía a pintar `crono(ms)` —el MISMO número
       que el de arriba— porque venía de cuando cada sección tenía su reloj.
       Repetirlo no es que sobre: es decir que son dos y que miden cosas
       distintas, y en un test eso se cree. */
    expect(src.split('crono(ms)')).toHaveLength(2)
  })
})
