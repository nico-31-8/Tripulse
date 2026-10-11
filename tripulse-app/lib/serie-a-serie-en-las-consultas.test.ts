// ============================================================
// Serie a serie: ninguna consulta se deja la lista de series
// ============================================================
//
// Las series distintas de un ejercicio viven en `ejercicios.series_detalle` (y
// `encadenado_series_detalle` para el segundo de una superserie). Las columnas
// de siempre guardan solo el resumen («8-12»), así que una consulta que pida
// `repeticiones` y se olvide de la lista NO FALLA: enseña el resumen, y el
// deportista ve «8-12 reps» donde su entrenador le mandó 12, 10 y 8. O la
// duración sale contada con el resumen y la carga se desvía. Es el mismo fallo
// silencioso que dejó 89 series invisibles con la superserie
// (lib/superserie-en-el-volumen.test.ts), así que se vigila igual: leyendo el
// código.
//
// LA REGLA: toda lista de columnas de `ejercicios` escrita a mano que pida
// `repeticiones` pide también `series_detalle`; y si pide
// `encadenado_repeticiones`, también `encadenado_series_detalle`. Las que piden
// `*` ya la traen.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { SELECT_EJERCICIOS_CONTEO } from './cardio-fuerza'

const RAIZ = path.resolve(__dirname, '..')

/* Las que piden repeticiones y no necesitan la lista, con su porqué. */
const NO_LA_NECESITAN: Record<string, string> = {
  /* Las sesiones que se apunta el propio deportista: ahí `repeticiones` es lo
     que HIZO (lib/registro-fuerza), no una prescripción, y no hay serie a serie. */
  'app/apuntar/page.tsx': 'sesiones apuntadas por el deportista',
}

function ficheros(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) out.push(...ficheros(rel)) }
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(rel.split(path.sep).join('/'))
  }
  return out
}

/**
 * Las listas de columnas de `ejercicios` que hay en un fichero: las del
 * `from('ejercicios').select('…')` y las anidadas `ejercicios(…)` dentro del
 * select de otra tabla. Los literales partidos con `' +` se juntan antes, que
 * es como escribe el panel de la semana la suya.
 */
function listas(src: string): string[] {
  const junto = src.replace(/'\s*\+\s*\n?\s*'/g, '')
  const out: string[] = []
  let i = junto.indexOf("from('ejercicios')")
  while (i >= 0) {
    const m = /\.select\(\s*'([^']*)'/.exec(junto.slice(i, i + 600))
    if (m) out.push(m[1])
    i = junto.indexOf("from('ejercicios')", i + 1)
  }
  for (const m of junto.matchAll(/[^_\w]ejercicios\(([^)]*)\)/g)) {
    if (m[1].trim() && m[1].trim() !== '*' && /[a-z_]/.test(m[1])) out.push(m[1])
  }
  return out
}

const columnas = (lista: string) => lista.split(',').map(c => c.trim())

describe('serie a serie en las consultas', () => {
  const todos = [...ficheros('app'), ...ficheros('lib'), ...ficheros('components')]

  it('quien pide las repeticiones pide también la lista de series', () => {
    const malos: string[] = []
    for (const f of todos) {
      if (NO_LA_NECESITAN[f]) continue
      const src = fs.readFileSync(path.join(RAIZ, f), 'utf8')
      for (const l of listas(src)) {
        const c = columnas(l)
        if (c.includes('repeticiones') && !c.includes('series_detalle')) malos.push(f + ' → falta series_detalle')
        if (c.includes('encadenado_repeticiones') && !c.includes('encadenado_series_detalle')) malos.push(f + ' → falta encadenado_series_detalle')
      }
    }
    expect(malos, malos.join(' | ')).toEqual([])
  })

  it('la lista compartida de la duración también la lleva (y el tope del rango)', () => {
    const c = columnas(SELECT_EJERCICIOS_CONTEO)
    expect(c).toContain('series_detalle')
    expect(c).toContain('repeticiones_max')
  })

  it('el lector encuentra las listas que de verdad hay', () => {
    /* Si un cambio de formato dejara a `listas` sin ver nada, el test de arriba
       pasaría vigilando el aire. Estas tres existen y piden repeticiones. */
    for (const f of ['app/sesion/[id]/page.tsx', 'components/PanelSemana.tsx', 'app/volumen/page.tsx']) {
      const src = fs.readFileSync(path.join(RAIZ, f), 'utf8')
      expect(listas(src).some(l => columnas(l).includes('repeticiones')), f).toBe(true)
    }
  })

  it('las excepciones siguen existiendo', () => {
    for (const f of Object.keys(NO_LA_NECESITAN)) expect(fs.existsSync(path.join(RAIZ, f)), f).toBe(true)
  })
})
