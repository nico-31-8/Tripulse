// ============================================================
// El desplegable de grupo muscular se escribe en un solo sitio
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO, no lo ejecuta. El mismo desplegable estaba copiado
// SIETE veces —la tabla de fuerza (fila, encadenado y los por defecto de la
// sesión), el modal de la ficha (fila y encadenado), el editor de bloques y el
// alta de ejercicio propio de la lupa—, cada una con su
// `[...new Set(bib.map(e => e.grupo_muscular))]`. Agrupar la lista en familias
// en seis de las siete y olvidar la séptima no da ningún error: simplemente
// hay una pantalla donde sigue saliendo la lista larga.
//
// LA REGLA. Para elegir un grupo muscular se usa <SelectorGrupo>
// (components/SelectorGrupo), que es quien conoce las familias
// (lib/familias-grupo). Montar la lista a mano hace saltar este test.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')
const CARPETAS = ['app', 'lib', 'components']

/** Donde SÍ se puede montar la lista, y por qué. */
const PUEDEN: Record<string, string> = {
  'components/SelectorGrupo.tsx': 'Es el desplegable. Aquí vive la lista.',
  'lib/ejercicio-propio.ts': 'Es de donde sale la lista de grupos; no pinta nada.',
}

/** Montar la lista de grupos. */
const LISTA = [
  /new Set\([^\n]*grupo_muscular/,
  /gruposExistentes\s*\(/,
]

/** Pintar un desplegable. */
const PINTA = /<option|<optgroup|<select/

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

describe('la lista de grupos musculares no se copia', () => {
  const culpables: string[] = []
  const permitidosSinUsar = new Set(Object.keys(PUEDEN))

  for (const f of ficheros()) {
    const rel = path.relative(RAIZ, f).split(path.sep).join('/')
    const src = fs.readFileSync(f, 'utf8')
    if (!LISTA.some(r => r.test(src))) continue
    permitidosSinUsar.delete(rel)
    if (rel in PUEDEN) continue
    if (PINTA.test(src)) culpables.push(rel)
  }

  it('nadie monta su propio desplegable de grupos', () => {
    expect(culpables, 'Usa <SelectorGrupo> en vez de escribir la lista: ' + culpables.join(', ')).toEqual([])
  })

  it('la lista de permitidos no se queda con fantasmas', () => {
    /* Un permiso que ya no hace falta es una puerta abierta para el siguiente. */
    expect([...permitidosSinUsar]).toEqual([])
  })
})
