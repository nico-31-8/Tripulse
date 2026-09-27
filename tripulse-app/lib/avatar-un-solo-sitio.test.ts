// ============================================================
// El avatar de una persona: un color por nombre, en un solo sitio
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO. No hay fotos: a un deportista se le reconoce por su
// inicial sobre un degradado, y el degradado sale de su NOMBRE, así que es
// siempre el mismo. Eso es lo que lo hace útil —en una lista reconoces a alguien
// por el color antes de leer— y lo que obliga a que se decida en un sitio.
//
// LO QUE HABÍA. Las tres piezas (`GRADS`, `grad`, `inicial`) copiadas en CINCO
// pantallas, y en tres de ellas el MISMO componente `Avatar` entero. Más dos
// avatares suyos: el de `/volumen`, que era **siempre naranja** —la misma persona
// de un color en el volumen y de otro en el panel— y la inicial a mano en el
// directorio de la comunidad.
//
// LA REGLA. El color y la letra salen de `lib/avatar` (`coloresDe`, `inicialDe`,
// `fondoDe`), y el avatar de una persona se pinta con `components/Avatar`. Quien
// necesite un marcado propio —el panel le pone una sombra del color— usa las
// piezas, no las copia.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { coloresDe, inicialDe, fondoDe } from './avatar'

describe('el color de alguien sale de su nombre', () => {
  it('el mismo nombre da siempre el mismo par', () => {
    expect(coloresDe('Nicolás')).toEqual(coloresDe('Nicolás'))
    expect(fondoDe('Nicolás')).toBe(fondoDe('Nicolás'))
  })

  it('nombres distintos reparten', () => {
    const nombres = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fran', 'Gema', 'Hugo']
    const distintos = new Set(nombres.map(n => coloresDe(n)[0]))
    /* No se exige que los ocho caigan en ocho colores —eso sería casualidad— pero
       sí que no se apiñen todos en uno. */
    expect(distintos.size).toBeGreaterThan(3)
  })

  it('sin nombre no se rompe: la letra es «?» y el color, estable', () => {
    for (const vacio of [null, undefined, '', '   ']) {
      expect(inicialDe(vacio)).toBe('?')
      expect(coloresDe(vacio)).toEqual(coloresDe(null))
    }
  })

  it('la letra va en mayúscula y sin espacios delante', () => {
    expect(inicialDe('  nicolás')).toBe('N')
    expect(inicialDe('ángela')).toBe('Á')
  })
})

// ============================================================
// El guardián
// ============================================================

const RAIZ = path.resolve(__dirname, '..')

/** Quien puede llevar su propio degradado, y por qué. */
const PUEDEN: Record<string, string> = {
  'lib/avatar.ts': 'Es la casa: aquí viven los ocho pares y el degradado.',
  'components/ComunidadDirectorio.tsx': 'El ESCUDO de un club, no una persona: lleva el naranja de la marca mientras no suban su logo. La inicial sí sale del catálogo.',
}

/** Montar el degradado del avatar a mano. */
const DEGRADADO = /linear-gradient\(145deg/
/** Sacar la inicial de un nombre a mano (no confundir con poner en mayúscula una palabra). */
const INICIAL = /(?:trim\(\)\s*\[\s*0\s*\]\s*\?\.\s*toUpperCase|charAt\(\s*0\s*\)\s*\.\s*toUpperCase\(\)(?!\s*\+))/

function ficheros(): string[] {
  const out: string[] = []
  const recorre = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) recorre(p); continue }
      if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
    }
  }
  for (const c of ['app', 'lib', 'components']) recorre(path.join(RAIZ, c))
  return out
}

describe('el avatar no se copia', () => {
  const conDegradado: string[] = []
  const conInicial: string[] = []

  for (const f of ficheros()) {
    const rel = path.relative(RAIZ, f).split(path.sep).join('/')
    const src = fs.readFileSync(f, 'utf8')
    if (DEGRADADO.test(src) && !(rel in PUEDEN)) conDegradado.push(rel)
    if (INICIAL.test(src) && !(rel in PUEDEN)) conInicial.push(rel)
  }

  it('nadie monta su propio degradado de avatar', () => {
    expect(
      conDegradado,
      'Usa <Avatar> o fondoDe/coloresDe de lib/avatar en: ' + conDegradado.join(', '),
    ).toEqual([])
  })

  it('nadie saca su propia inicial', () => {
    expect(conInicial, 'Usa inicialDe de lib/avatar en: ' + conInicial.join(', ')).toEqual([])
  })

  it('el alambre está bien puesto', () => {
    expect(DEGRADADO.test("style={{ background: 'linear-gradient(145deg,' + c1 + ',' + c2 + ')' }}")).toBe(true)
    expect(INICIAL.test("(n || '?').trim()[0]?.toUpperCase()")).toBe(true)
    expect(INICIAL.test("(p.nombre || '?').trim().charAt(0).toUpperCase()")).toBe(true)
    /* Poner en mayúscula una PALABRA no es sacar una inicial. */
    expect(INICIAL.test('c.charAt(0).toUpperCase() + c.slice(1)')).toBe(false)
    /* Y otro degradado cualquiera tampoco es el del avatar. */
    expect(DEGRADADO.test("background: 'linear-gradient(180deg, #111, #000)'")).toBe(false)
  })
})
