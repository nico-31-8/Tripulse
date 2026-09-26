// ============================================================
// El icono y el nombre de una disciplina también salen de un solo sitio
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO, no lo ejecuta. Es el hermano de
// colores-disciplina.test.ts: el mismo problema con el emoji, con el nombre y
// con las tres letras de las casillas estrechas. Había VEINTITRÉS mapas y
// funciones repartidos por la app, y no decían lo mismo:
//
//   · La fuerza era 🏋️ en casi todas y 💪 en «Mis tests» y en el resumen de la
//     semana del dibujo.
//   · El nombre salía «Natacion» SIN TILDE en el resumen de la semana del
//     dibujo y en la pestaña de zonas del deportista, porque lo que se pintaba
//     era la clave con la que se guarda.
//   · Cinco pantallas traducían «Natacion» → «Natación» con su propio
//     `d === 'Natacion' ? 'Natación' : d`, y las que no lo hacían enseñaban la
//     clave.
//   · En la ficha del deportista, cualquier disciplina que no fuera natación o
//     ciclismo salía como «🏃 Carrera», porque el ternario acababa ahí.
//
// LA REGLA. El icono y el nombre salen de lib/disciplinas:
// `emojiDisciplina`, `etiquetaDisciplina`, `etiquetaConEmoji` («🏊 Natación») y
// `cortoDisciplina` («Nat»). Escribir el icono o el nombre al lado del nombre de
// una disciplina hace saltar este test.
//
// LO QUE NO MIRA: un emoji decorativo suelto (el 🏊 gigante de «no hay test de
// natación») no es una traducción, es un dibujo, y se queda donde está. Y un
// `Ciclismo: 'Ciclismo'` sin tilde ni emoji no se distingue de un dato normal;
// se caza por sus vecinos, que sí la llevan.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')
const CARPETAS = ['app', 'lib', 'components']

/** Donde SÍ vive, y por qué. */
const PUEDEN = ['lib/disciplinas.ts']

const IDS = ['Natacion', 'Natación', 'Ciclismo', 'Carrera', 'Fuerza', 'Brick', 'Hibrido', 'Híbrido']
/** Los iconos de las disciplinas, incluido el 💪 que se colaba como fuerza. */
const EMOJIS = '🏊|🚴|🏃|🏋️|🔀|⚡|💪'
/** Las tres letras de las casillas estrechas, enteras: 'Car' no es 'Carrera'. */
const CORTOS = 'Nat|Cic|Car|Fue|Brk|Hib'

/**
 * Qué disciplinas traduce este código a su icono o a su nombre: las que salen
 * como clave (`Natacion: '🏊'`) o comparadas (`d === 'Natacion' ? '🏊'`) con el
 * icono, el nombre con tilde o las tres letras al lado.
 *
 * PIDE DOS O MÁS por lo mismo que el de los colores: una palabra sola puede ser
 * otra cosa (en /fuerza, «Fuerza» es un tipo de ejercicio de la biblioteca).
 */
export function disciplinasTraducidas(src: string): Set<string> {
  const re = new RegExp(
    '(?:[\'"]?(' + IDS.join('|') + ')[\'"]?\\s*:|===\\s*[\'"](' + IDS.join('|') + ')[\'"]\\s*\\?)' +
    '[^\\n]{0,40}?[\'"`](?:[^\'"`\\n]*(?:' + EMOJIS + ')[^\'"`\\n]*|Natación|Híbrido|natación|híbrido|' + CORTOS + ')[\'"`]',
    'g',
  )
  const out = new Set<string>()
  for (const m of src.matchAll(re)) {
    const nombre = m[1] || m[2]
    out.add(nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
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

describe('el icono y el nombre de una disciplina no se copian', () => {
  it('nadie escribe su propio icono ni su propio nombre', () => {
    const culpables = ficheros()
      .map(f => path.relative(RAIZ, f).split(path.sep).join('/'))
      .filter(rel => !PUEDEN.includes(rel))
      .filter(rel => disciplinasTraducidas(fs.readFileSync(path.join(RAIZ, rel), 'utf8')).size >= 2)

    expect(
      culpables,
      'Usa emojiDisciplina / etiquetaDisciplina / etiquetaConEmoji / cortoDisciplina (lib/disciplinas) en: ' + culpables.join(', '),
    ).toEqual([])
  })

  it('el alambre está bien puesto: reconoce lo que había', () => {
    /* El mapa de emojis */
    expect(disciplinasTraducidas("const EMOJI = { Natacion: '🏊', Ciclismo: '🚴' }").size).toBe(2)
    /* El mapa con el emoji y el nombre juntos */
    expect(disciplinasTraducidas("  'Natacion': '🏊 Natación',\n  'Fuerza': '🏋️ Fuerza',").size).toBe(2)
    /* El mapa de tres letras */
    expect(disciplinasTraducidas("{ Natacion: 'Nat', Ciclismo: 'Cic', Carrera: 'Car' }").size).toBe(3)
    /* El ternario que traducía el nombre */
    expect(disciplinasTraducidas("d === 'Natacion' ? 'Natación' : d === 'Hibrido' ? 'Híbrido' : d").size).toBe(2)
    /* Y el que traducía el icono */
    expect(disciplinasTraducidas("t === 'Natacion' ? '🏊' : t === 'Ciclismo' ? '🚴' : '🏃'").size).toBe(2)
  })

  it('y no confunde lo que no es una traducción', () => {
    /* Un emoji de adorno en una pantalla vacía. */
    expect(disciplinasTraducidas("<div className=\"text-4xl mb-3\">🏊</div><p>No hay test de natación</p>").size).toBe(0)
    /* Un dato que se llama igual que la disciplina. */
    expect(disciplinasTraducidas("Carrera: { disciplina: 'Carrera', protocolo: 'Test de 6 minutos' },\n  Ciclismo: { disciplina: 'Ciclismo', protocolo: 'Ramp test' },").size).toBe(0)
    /* Las tres letras se piden enteras: 'Carrera' no es 'Car'. */
    expect(disciplinasTraducidas("{ Natacion: 'Natacion', Carrera: 'Carrera' }").size).toBe(0)
    /* Y un número detrás de la disciplina tampoco es un nombre. */
    expect(disciplinasTraducidas("h.bloque === 'Natacion' ? 4 : h.bloque === 'Fuerza' ? 3 : 2").size).toBe(0)
  })
})
