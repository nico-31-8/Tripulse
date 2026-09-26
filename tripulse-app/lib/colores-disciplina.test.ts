// ============================================================
// El color de una disciplina se decide en UN solo sitio
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO, no lo ejecuta. El color de las disciplinas estaba
// escrito CUARENTA veces en veintisiete ficheros, y de cinco formas distintas:
// mapas en hex, mapas de clases de Tailwind, funciones con una fila de `if`,
// ternarios encadenados y listas de leyenda. Y no decían lo mismo:
//
//   · La natación tenía CUATRO azules (#60a5fa, #3b82f6, #38bdf8, #3B82F6)
//     según la pantalla.
//   · El brick era naranja (#F97316) en un mapa y morado (#A855F7) en otros
//     dos del MISMO fichero (el dibujo).
//   · La carrera era roja en la ficha de la actividad del reloj y verde en
//     todas las demás.
//   · En el calendario, el punto de una sesión era bg-blue-500 en un sitio y
//     bg-blue-800 en otro.
//   · En «Mis sesiones», la misma etiqueta de disciplina se pintaba de dos
//     maneras según el panel.
//
// Y LO QUE COSTABA: al añadir Híbrido hubo que ir sitio por sitio metiéndolo.
// Los que se olvidaron pintaban el híbrido del gris de «no sé qué es esto», sin
// dar ningún error. La próxima disciplina haría lo mismo.
//
// LA REGLA. El color de una disciplina sale de lib/disciplinas:
// `colorDisciplina` si se pinta con `style`, y `claseDisciplina` (el color a
// secas) / `chipDisciplina` (la etiqueta) / `botonDisciplina` (lo que se pulsa)
// si se pinta con `className`. Escribir un color al lado del nombre de una
// disciplina hace saltar este test.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')
const CARPETAS = ['app', 'lib', 'components']

/**
 * Donde SÍ vive el color, y por qué.
 *
 * El catálogo no necesita estar mientras siga siendo una lista de disciplinas
 * (`{ id: 'Natacion', color: '#60a5fa' }`) y no un mapa con el nombre por
 * clave, pero se permite para poder reescribirlo sin pelearse con este test.
 */
const PUEDEN = ['lib/disciplinas.ts']

const NOMBRES = ['Natacion', 'Natación', 'Ciclismo', 'Carrera', 'Fuerza', 'Brick', 'Hibrido', 'Híbrido']

/**
 * Un color de verdad: en hex ('#a855f7') o en clases de Tailwind
 * ('bg-purple-500', 'text-blue-300', 'border-red-700'…).
 *
 * LOS GRISES NO CUENTAN. Ningún gris es el color de una disciplina, y en cambio
 * salen en cualquier línea: sin esta exclusión, un `focus:ring-orange-500` en la
 * misma línea que un `disc === 'Brick'` haría saltar el test sin motivo.
 */
const HUES = 'blue|sky|cyan|teal|emerald|green|lime|yellow|amber|orange|red|rose|pink|fuchsia|purple|violet|indigo'
const COLOR = '(#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b|(bg|text|border|from|via|to|ring|fill|stroke|decoration)-(' + HUES + ')-[0-9]{2,3})'

/**
 * Qué disciplinas colorea este código: las que salen en la MISMA LÍNEA que un
 * color. Así se cazan las cinco formas que tenía (mapa, clases, `if`, ternario
 * y lista), sin tener que adivinar cómo se escribirá la sexta.
 *
 * PIDE DOS O MÁS, y no es por pereza: «Fuerza» también es un TIPO de ejercicio
 * de la biblioteca (Fuerza, Movilidad, Técnica, Rehab, Complejos, Funcional), y
 * el mapa de /fuerza colorea el tipo, no la disciplina. Un mapa de disciplinas
 * las colorea varias; uno de tipos solo repite esa palabra.
 *
 * Los mapas de otra cosa —el emoji, el nombre corto, los metros de cada
 * segmento— no cuentan: su valor no es un color.
 */
export function disciplinasConColor(src: string): Set<string> {
  /* Con comillas o sin ellas: media app las escribía como clave desnuda
     (`{ Natacion: '#3b82f6' }`) y la otra media entre comillas. */
  const nom = new RegExp('\\b(' + NOMBRES.join('|') + ')\\b', 'g')
  const col = new RegExp(COLOR)
  const out = new Set<string>()
  for (const linea of src.split('\n')) {
    if (!col.test(linea)) continue
    for (const m of linea.matchAll(nom)) out.add(m[1].normalize('NFD').replace(/[̀-ͯ]/g, ''))
  }
  return out
}

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

describe('el color de una disciplina no se copia', () => {
  it('nadie escribe su propio color de disciplina', () => {
    const culpables = ficheros()
      .map(f => path.relative(RAIZ, f).split(path.sep).join('/'))
      .filter(rel => !PUEDEN.includes(rel))
      .filter(rel => disciplinasConColor(fs.readFileSync(path.join(RAIZ, rel), 'utf8')).size >= 2)

    expect(
      culpables,
      'Usa colorDisciplina / claseDisciplina / chipDisciplina / botonDisciplina (lib/disciplinas) en: ' + culpables.join(', '),
    ).toEqual([])
  })

  it('el alambre está bien puesto: reconoce las cinco formas que había', () => {
    /* Si un cambio en la expresión dejara de cazar lo que ya pasó, el test
       pasaría siempre y no guardaría nada. Una de cada forma: */
    /* 1. el mapa en hex */
    expect(disciplinasConColor("const C = { Natacion: '#3B82F6', Ciclismo: '#EAB308' }").size).toBe(2)
    /* 2. el mapa de clases */
    expect(disciplinasConColor("  'Natación': 'bg-blue-900 text-blue-300 border-blue-700',\n  'Carrera': 'bg-green-900 text-green-300 border-green-700',").size).toBe(2)
    /* 3. la función con ifs */
    expect(disciplinasConColor("if (d === 'Ciclismo') return 'bg-yellow-900 text-yellow-300'\nif (d === 'Fuerza') return 'bg-red-900 text-red-300'").size).toBe(2)
    /* 4. el ternario encadenado */
    expect(disciplinasConColor("d === 'Ciclismo' ? 'bg-yellow-400' : d === 'Hibrido' ? 'bg-pink-400' : 'bg-red-400'").size).toBe(2)
    /* 5. la lista de leyenda */
    expect(disciplinasConColor("{l:'Natación',k:'Natacion',c:'#3B82F6'},{l:'Brick',k:'Brick',c:'#A855F7'}").size).toBe(2)
    /* La tilde y la falta de tilde son la misma disciplina. */
    expect(disciplinasConColor("{ Natacion: '#3B82F6', 'Natación': '#3B82F6' }").size).toBe(1)
  })

  it('y no confunde lo que no es un color de disciplina', () => {
    expect(disciplinasConColor("const EMOJI = { Natacion: '🏊', Ciclismo: '🚴' }").size).toBe(0)
    expect(disciplinasConColor("const CORTO = { Natacion: 'Nat', Carrera: 'Car' }").size).toBe(0)
    /* El tipo de ejercicio de la biblioteca (/fuerza): «Fuerza» aquí no es la
       disciplina, y su verde azulado es a propósito. */
    expect(disciplinasConColor("const CLASE_TIPO = { 'Fuerza': 'bg-teal-900 text-teal-300', 'Movilidad': 'bg-purple-900 text-purple-300' }").size).toBeLessThan(2)
    /* Una lista de nombres con un color cualquiera cerca tampoco es un mapa. */
    expect(disciplinasConColor("{['Carrera','Natacion','Ciclismo'].map(disc => (\n  <div className=\"focus:ring-orange-500\">\n))}").size).toBe(0)
  })
})
