// ============================================================
// El planificador recibe lo que tiene que saber del deportista
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO, no lo ejecuta. Lo que falló el 2026-10-18 no fue
// una cuenta mal hecha: las pantallas que generan semanas no le pasaban al
// motor ni las disciplinas del deportista ni sus competiciones —el
// planificador del entrenador ni siquiera pedía `disciplinas` a la base—, y el
// motor, sin ese dato, planificaba un triatlón. Los tests de lib/ no ven las
// pantallas, así que esto vigila el cable.
//
// LA REGLA. Un bloque se genera con `semanaDelBloque` (lib/plan-bloque), que es
// donde viven las disciplinas y los días de carrera. Montar la semana a mano
// en una pantalla —forma → colocación → relleno— hace saltar este test.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')
/* Sin comentarios: la primera versión de este test daba por bueno un fichero
   porque un COMENTARIO decía «sus competiciones:». */
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"])\/\/.*$/gm, '$1')

/** Lo que va entre los paréntesis de cada llamada a `fn(`. */
function argumentos(src: string, fn: string): string[] {
  const out: string[] = []
  let i = src.indexOf(fn + '(')
  while (i >= 0) {
    let j = i + fn.length + 1, prof = 1
    while (j < src.length && prof > 0) {
      if (src[j] === '(') prof++
      else if (src[j] === ')') prof--
      j++
    }
    out.push(src.slice(i + fn.length + 1, j - 1))
    i = src.indexOf(fn + '(', j)
  }
  return out
}

/** Las pantallas que generan un bloque entero. */
const BLOQUES = [
  'components/PlanificarMesociclo.tsx',
  'components/CadenaMesociclo.tsx',
  'components/MisSemanas.tsx',
]

describe('quien genera un bloque pasa por semanaDelBloque', () => {
  it.each(BLOQUES)('%s no monta las semanas por su cuenta', f => {
    const src = leer(f)
    expect(src).toMatch(/semanaDelBloque\(/)
    expect(src).not.toMatch(/formaDeSemana\(/)
    expect(src).not.toMatch(/colocarSemana\(/)
  })

  it.each(BLOQUES)('%s le pasa las disciplinas del deportista y sus competiciones', f => {
    const src = leer(f)
    expect(src).toMatch(/disciplinas:\s*(dep\.)?disciplinas\b/)
    const llamadas = argumentos(src, 'semanaDelBloque')
    expect(llamadas.length).toBeGreaterThan(0)
    llamadas.forEach(a => expect(a).toMatch(/\bcompeticiones\b/))
  })

  it('«Mi plan» le da a MisSemanas las disciplinas de la ficha, en los dos sitios donde la pinta', () => {
    const src = leer('app/mi-plan/page.tsx')
    const usos = src.match(/<MisSemanas[\s\S]*?\/>/g) || []
    expect(usos.length).toBeGreaterThan(0)
    usos.forEach(u => expect(u).toMatch(/disciplinas=\{dep\.disciplinas\}/))
  })
})

describe('el planificador de una semana', () => {
  it('pide las disciplinas del deportista a la base y se las da al reparto', () => {
    const src = leer('app/planificador/page.tsx')
    expect(src).toMatch(/from\('deportista'\)\.select\('[^']*\bdisciplinas\b/)
    expect(src).toMatch(/disciplinas: dep\?\.disciplinas/)
  })
})

describe('sumar a una semana que ya tiene sesiones', () => {
  /* Volcar no suma salvo que se pida. Lo pide solo la semana suelta, y solo
     después de haber enseñado cuántas hay: un bloque entero no puede, que es
     justo como se duplicaron las del 18-10. */
  it('solo lo pide el planificador de una semana', () => {
    const quienes = [...BLOQUES, 'app/planificador/page.tsx', 'app/mi-plan/page.tsx']
      .filter(f => /\bsumar\s*:/.test(leer(f)))
    expect(quienes).toEqual(['app/planificador/page.tsx'])
  })
})
