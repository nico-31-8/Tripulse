// ============================================================
// Las consultas que cuentan no pueden olvidarse de nada
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO, no lo ejecuta. Existe por un fallo concreto: el
// cardio de las sesiones de fuerza se desplegó contando bien en el calendario
// y en la atribución, pero dos pantallas —el lienzo de periodización y la
// página de volumen— pedían los ejercicios con una lista de columnas escrita a
// mano, sin las del cardio. No fallaba nada: contaban el cardio como si no
// existiera, y la duración y la carga salían cortas justo ahí.
//
// Una consulta que se olvida de una columna no da error, da un cero. Así que la
// única forma de cazarla antes de que llegue a un atleta es mirar las
// consultas. Con los bloques de las tareas pasa exactamente lo mismo, y peor:
// un sitio que no los pida deja el volumen en un tercio.
//
// LA REGLA. Toda consulta a `tarea` que pida `series` tiene que pedir también
// `bloques`, y toda consulta a `ejercicios` que pida `repeticiones` —que es la
// que se usa para estimar duración— tiene que pedir el cardio. Las que usan `*`
// ya lo traen todo.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { SELECT_EJERCICIOS_CONTEO } from './cardio-fuerza'

const RAIZ = path.resolve(__dirname, '..')
const CARPETAS = ['app', 'lib', 'components']

/** Todos los .ts y .tsx de la aplicación, sin los tests. */
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

interface Consulta { fichero: string; columnas: string }

/** Las columnas literales que se piden a una tabla, fichero a fichero. */
function consultasA(tabla: string): Consulta[] {
  const re = new RegExp("from\\(\\s*'" + tabla + "'\\s*\\)\\s*\\.select\\(\\s*'([^']*)'", 'g')
  const out: Consulta[] = []
  for (const f of ficheros()) {
    const texto = fs.readFileSync(f, 'utf8')
    for (const m of texto.matchAll(re)) {
      out.push({ fichero: path.relative(RAIZ, f).split(path.sep).join('/'), columnas: m[1] })
    }
  }
  return out
}

/**
 * Las que piden `series` sin necesitar los bloques, y por qué.
 *
 * Cada entrada tiene que decir su motivo: una lista de excepciones sin motivos
 * acaba siendo el sitio donde se esconde el siguiente olvido.
 */
const TAREA_SIN_BLOQUES: Record<string, string> = {
  'app/apuntar/page.tsx':
    'lee las sesiones que apunta el propio atleta, que se crean sin bloques',
}

/** Las que piden `repeticiones` sin necesitar el cardio, y por qué. */
const EJERCICIOS_SIN_CARDIO: Record<string, string> = {
  'app/apuntar/page.tsx':
    'corrige las sesiones de fuerza que apunta el propio atleta, que no pueden llevar líneas de cardio',
}

describe('las consultas que cuentan', () => {
  it('encuentra consultas que mirar (si no, el test no estaría mirando nada)', () => {
    expect(consultasA('tarea').length).toBeGreaterThan(5)
    expect(consultasA('ejercicios').length).toBeGreaterThan(3)
  })

  /* 3 × (2 × 400) son 2.400 m. Una consulta que pida las series y no los
     bloques cuenta 800, y no da ningún error: da un volumen a un tercio. */
  it('toda consulta a tarea que pide series pide también los bloques', () => {
    const malas = consultasA('tarea')
      .filter(c => !c.columnas.trim().startsWith('*'))
      .filter(c => /\bseries\b/.test(c.columnas) && !/\bbloques\b/.test(c.columnas))
      .filter(c => !TAREA_SIN_BLOQUES[c.fichero])
      .map(c => c.fichero + ' → ' + c.columnas)
    expect(malas).toEqual([])
  })

  /* El fallo que dio origen a este test: sin el cardio, la duración de una
     línea de remo sale cero y la carga de la sesión, corta. */
  it('toda consulta a ejercicios que pide repeticiones pide también el cardio', () => {
    const malas = consultasA('ejercicios')
      .filter(c => !c.columnas.trim().startsWith('*'))
      .filter(c => /\brepeticiones\b/.test(c.columnas) && !/\bcardio_modo\b/.test(c.columnas))
      .filter(c => !EJERCICIOS_SIN_CARDIO[c.fichero])
      .map(c => c.fichero + ' → ' + c.columnas)
    expect(malas).toEqual([])
  })

  it('la lista compartida del cardio trae todo lo que hace falta para contar', () => {
    for (const col of ['id_tarea', 'repeticiones', 'cardio_modo', 'cardio_medida', 'cardio_valor', 'cardio_zona']) {
      expect(SELECT_EJERCICIOS_CONTEO).toContain(col)
    }
  })

  it('cada excepción sigue existiendo, para que la lista no se pudra', () => {
    for (const f of [...Object.keys(TAREA_SIN_BLOQUES), ...Object.keys(EJERCICIOS_SIN_CARDIO)]) {
      expect(fs.existsSync(path.join(RAIZ, f)), f).toBe(true)
    }
  })
})
