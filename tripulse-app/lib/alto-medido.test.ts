// ============================================================
// Un alto escrito a mano es una bomba de relojería
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO. Los desplegables de la app (`.tp-collapse`) se abren
// animando `max-height`, porque la altura automática no se puede animar. Eso
// obliga a dar un número, y el número se ponía a ojo: 460 px en el CSS, 920 en
// ECO, 420 en la ficha del deportista.
//
// LO QUE PASÓ (septiembre de 2026). `.tp-collapse` lleva `overflow: hidden`, así
// que el día que el contenido pasa de ese número **desaparece sin dejar rastro**:
// ni barra de desplazamiento, ni puntos suspensivos, ni nada que diga que falta
// algo. Al pasar las herramientas del panel a una sola columna en el móvil, las
// ocho dejaron de caber en 460 px y **«Tests propios» y «Zonas propias» dejaron
// de existir**. Lo dijo el usuario, no el código: «los test propios ahora no
// puedo acceder».
//
// LA REGLA. El alto se MIDE con `useAltoDeContenido` (lib/alto-desplegable) y se
// pasa por `style`. En el CSS no queda ningún número: el respaldo es
// `max-height: none`, que pierde la animación pero no el contenido.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')

describe('el alto de un desplegable se mide, no se adivina', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'app', 'globals.css'), 'utf8')

  it('el CSS no lleva ningún alto a mano en `.tp-collapse`', () => {
    /* La línea de `.open`: si alguien vuelve a poner «max-height: 460px» aquí,
       vuelve la bomba para todo el que no mida. */
    const linea = css.split('\n').find(l => l.includes('.tp-collapse.open')) || ''
    expect(linea, linea).toMatch(/max-height:\s*none/)
    expect(linea).not.toMatch(/max-height:\s*\d/)
  })

  /** Los ficheros que abren un `.tp-collapse`. */
  const conCollapse = (() => {
    const out: string[] = []
    const recorre = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) recorre(p); continue }
        if (!/\.tsx$/.test(e.name) || /\.test\.tsx$/.test(e.name)) continue
        if (fs.readFileSync(p, 'utf8').includes('tp-collapse')) {
          out.push(path.relative(RAIZ, p).split(path.sep).join('/'))
        }
      }
    }
    for (const c of ['app', 'components']) recorre(path.join(RAIZ, c))
    return out
  })()

  it('hay desplegables (si no, este test no guarda nada)', () => {
    expect(conCollapse.length).toBeGreaterThan(0)
  })

  it('todos miden su alto con useAltoDeContenido', () => {
    const sinMedir = conCollapse.filter(rel => {
      const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8')
      /* Se permite el fichero que solo lo NOMBRA para explicar por qué no lo usa
         (el de /volumen dice que una gráfica dentro mide 0 px con max-height). */
      if (!/className=\{?'?[^'"`\n]*tp-collapse/.test(src)) return false
      return !src.includes('useAltoDeContenido')
    })
    expect(
      sinMedir,
      'Mide el alto con useAltoDeContenido (lib/alto-desplegable) en: ' + sinMedir.join(', '),
    ).toEqual([])
  })

  it('y le pasan el alto por style, que es lo que gana al CSS', () => {
    for (const rel of conCollapse) {
      const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8')
      if (!src.includes('useAltoDeContenido')) continue
      expect(src, rel).toMatch(/style=\{\{\s*maxHeight:/)
    }
  })
})
