// ============================================================
// «m:ss» se escribe en un solo sitio
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO, no lo ejecuta. Había NUEVE declaraciones de `mmss` y
// tres comportamientos distintos bajo el mismo nombre:
//
//   1. `lib/duracion-carga` NO redondeaba → «1:30.5» en cuanto le llegaban
//      segundos con decimales, y a los ritmos les llegan siempre
//      (3600/velocidad casi nunca es entero).
//   2. Seis copias hacían `Math.round(seg % 60)`: redondeaban los segundos SIN
//      arrastrar el minuto, así que 239,7 s salían como **«3:60»**. Uno de cada
//      ciento veinte ritmos cae ahí.
//   3. `BloqueRegistro` tomaba MILISEGUNDOS con el mismo nombre.
//
// Y en el sentido contrario, tres `mmssASegundos` idénticas.
//
// Ya pasó una vez con `segAMmss` (agosto de 2026): «cuatro copias, dos
// comportamientos». Se consolidó y volvieron a aparecer copias con otro nombre.
// De ahí este test.
//
// LA REGLA. El formato vive en `lib/medicion` (`mmss`, `mmssCorto`) junto a su
// inversa (`mmssASegundos`), en un fichero que no importa nada para que lo pueda
// pedir hasta `lib/zonas`. `lib/duracion-carga` las reexporta porque media app
// las pide ahí. Escribir otra hace saltar este test.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')
const CARPETAS = ['app', 'lib', 'components']

/** Donde SÍ vive, y por qué. */
const PUEDEN: Record<string, string> = {
  'lib/medicion.ts': 'Es la casa: el formato y su inversa, juntos y en una hoja sin importaciones.',
}

/**
 * Escribir «m:ss» a mano: unos segundos a dos cifras justo detrás de un DOS
 * PUNTOS.
 *
 * SE BUSCA POR LA FORMA, NO POR EL NOMBRE, y esa es la lección: la primera
 * versión de este alambre buscaba `Math.floor(x / 60) + ':'` y se le escaparon
 * ONCE sitios que lo escribían con plantillas —`${min}:${seg.toString()
 * .padStart(2, '0')}`— y ninguno se llamaba `mmss`. Entre ellos, cinco con el
 * «3:60» vivo: los ritmos de /zonas, los del rótulo del «@» y los de /pacing.
 *
 * EL DOS PUNTOS ES LO QUE LO HACE PRECISO. Un «2h05» también pega dos cifras con
 * `padStart`, pero no es un m:ss: es otra familia (horas y minutos), con sus
 * propias copias, y va en su tanda. Pedir el «:» delante deja fuera esa familia
 * y también las fechas («2026-09»).
 */
const A_MANO = /(?:['"]:['"]|\}:)[^\n]{0,40}padStart\(\s*2\s*,\s*['"]0['"]\s*\)/

/** Y en el sentido contrario: partir por «:» y multiplicar por 60. */
const AL_REVES = /\*\s*60\s*\+\s*\(?\s*parseInt/

function ficheros(): string[] {
  const out: string[] = []
  const recorre = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) recorre(p); continue }
      if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
    }
  }
  for (const c of CARPETAS) recorre(path.join(RAIZ, c))
  return out
}

describe('«m:ss» no se escribe a mano', () => {
  const culpables: string[] = []
  const alReves: string[] = []
  const permitidosSinUsar = new Set(Object.keys(PUEDEN))

  for (const f of ficheros()) {
    const rel = path.relative(RAIZ, f).split(path.sep).join('/')
    const src = fs.readFileSync(f, 'utf8')
    const escribe = A_MANO.test(src)
    const lee = AL_REVES.test(src)
    if (escribe) permitidosSinUsar.delete(rel)
    if (escribe && !(rel in PUEDEN)) culpables.push(rel)
    if (lee && rel !== 'lib/medicion.ts') alReves.push(rel)
  }

  it('nadie compone su propio «m:ss»', () => {
    expect(
      culpables,
      'Usa mmss / mmssCorto de lib/medicion en: ' + culpables.join(', '),
    ).toEqual([])
  })

  it('ni su propio lector de «m:ss»', () => {
    expect(
      alReves,
      'Usa mmssASegundos de lib/medicion en: ' + alReves.join(', '),
    ).toEqual([])
  })

  it('la lista de permitidos no se queda con fantasmas', () => {
    expect([...permitidosSinUsar]).toEqual([])
  })

  it('el alambre está bien puesto: caza las cuatro formas que había', () => {
    const caza = (s: string) => A_MANO.test(s)
    /* 1. La que no redondeaba (tres líneas, el minuto en su variable). */
    expect(caza("return min + ':' + String(s).padStart(2, '0')")).toBe(true)
    /* 2. La que redondeaba los segundos sin arrastrar el minuto: el «3:60». */
    expect(caza("Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0')")).toBe(true)
    /* 3. La de milisegundos, con el mismo nombre. */
    expect(caza("return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')")).toBe(true)
    /* 4. Y la que se escapó la primera vez: con plantilla y sin llamarse mmss. */
    expect(caza("return `${min}:${seg.toString().padStart(2, '0')} /km`")).toBe(true)
    /* El sentido contrario. */
    expect(AL_REVES.test("if (p.length === 2) return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0)")).toBe(true)

    /* Y lo que NO es un m:ss se queda fuera: */
    expect(caza('const horas = Math.floor(minutos / 60)')).toBe(false)
    /* horas y minutos («2h05»), que son otra familia */
    expect(caza("return h + 'h' + (m ? String(m).padStart(2, '0') : '')")).toBe(false)
    expect(caza("return `${h}h${String(m).padStart(2, '0')}`")).toBe(false)
    /* y una fecha */
    expect(caza('año + "-" + String(mes + 1).padStart(2, "0")')).toBe(false)
    expect(AL_REVES.test('const total = minutos * 60 + segundos')).toBe(false)
  })
})
