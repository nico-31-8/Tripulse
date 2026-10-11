// ============================================================
// Las listas de «sus deportistas» pasan por el espacio del director
// ============================================================
//
// Un director puede entrar en el espacio de uno de sus entrenadores (ver
// lib/espacio). Desde ese momento, cada pantalla que lista «los deportistas
// del entrenador» tiene que pedir los de ESE entrenador, no los del que ha
// entrado. Si una pantalla se queda con `.eq('id_entrenador', user.id)`, el
// director ve allí a sus propios deportistas creyendo que mira los de otro, y
// cualquier cambio que haga cae donde no toca.
//
// ESTE TEST LEE EL CÓDIGO: cualquier consulta a `deportista` filtrada por
// `id_entrenador = user.id` tiene que ir por entrenadorEfectivo(user.id), o
// estar en la lista de abajo con su motivo. Una pantalla nueva que liste
// deportistas obliga a decidir.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { filtrarPorEspacio } from './espacio'

const RAIZ = path.resolve(__dirname, '..')

/* Las que se quedan con los deportistas PROPIOS a propósito. */
const SE_QUEDAN_CON_LOS_SUYOS: Record<string, string> = {
  'app/cobros/page.tsx': 'los cobros son del entrenador que entra; un director no ve los del otro',
  'app/comunicacion/page.tsx': 'el chat es entre un entrenador y sus deportistas; en un espacio está cerrado',
  'app/grupo/[id]/page.tsx': 'los grupos quedan fuera de la figura de director',
  'app/zonas-propias/page.tsx': 'las zonas propias son del entrenador que entra',
  'app/deportistas/page.tsx': 'dentro de un espacio pinta ListaEspacio; sus consultas son las de su equipo',
}

/* Las que tienen que pasar por el espacio. Si alguna deja de hacerlo, falla. */
const PASAN_POR_EL_ESPACIO = [
  'app/dashboard/page.tsx', 'app/carga/page.tsx', 'app/eco/page.tsx', 'app/indices/page.tsx',
  'app/planificacion-visual/page.tsx', 'app/wellness-entrenador/page.tsx', 'app/volumen/page.tsx',
  'app/tests/page.tsx', 'app/tests/dirigir/page.tsx', 'app/papelera/page.tsx',
  'app/laboratorio/page.tsx', 'app/tests-propios/page.tsx',
]

/** Las líneas donde se piden deportistas filtrados por «yo» (la consulta puede
 *  partirse en dos líneas: se mira cada línea con la anterior). */
export function listasDeLosMios(codigo: string): number[] {
  const lineas = codigo.split(/\r?\n/)
  const malas: number[] = []
  lineas.forEach((l, i) => {
    if (!/\.eq\(\s*['"]id_entrenador['"]\s*,\s*user\.id\s*\)/.test(l)) return
    const ventana = (lineas[i - 1] || '') + '\n' + l
    if (/from\(\s*['"]deportista['"]\s*\)/.test(ventana)) malas.push(i + 1)
  })
  return malas
}

/* LA OTRA FORMA DE ESCRIBIRLO (salió el 2026-10-10 en el planificador): pedir
   deportistas SIN filtrar y fiarse de la RLS. A un entrenador normal le da lo
   suyo; a un director, también lo que otros le han abierto, mezclado. Cada
   lista así tiene que estar aquí y acotar en el cliente con filtrarPorEspacio. */
const SE_FIAN_DE_LA_RLS: Record<string, string> = {
  'app/planificador/page.tsx': 'pide sin filtrar para no perder las fichas de grupo y acota con filtrarPorEspacio',
}

/** Las sentencias que piden deportistas sin filtrar por id, entrenador, cuenta
 *  ni grupo (las altas, que devuelven lo insertado, no cuentan). */
export function listasSinFiltro(codigo: string): number[] {
  const malas: number[] = []
  const re = /from\(\s*['"]deportista['"]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(codigo))) {
    let resto = codigo.slice(m.index, m.index + 400)
    const fin = resto.indexOf(';')
    if (fin > 0) resto = resto.slice(0, fin)
    if (!/\.select\(/.test(resto) || /\.(insert|upsert|update)\(/.test(resto)) continue
    if (/\.(eq|in|match)\(\s*['"](id|id_entrenador|id_usuario|id_grupo)['"]/.test(resto)) continue
    malas.push(codigo.slice(0, m.index).split('\n').length)
  }
  return malas
}

function todos(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) out.push(...todos(p)) }
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

describe('las listas de deportistas y el espacio del director', () => {
  it('el detector caza el patrón viejo, en una línea o partido en dos', () => {
    expect(listasDeLosMios(`const { data } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)`)).toEqual([1])
    expect(listasDeLosMios(`supabase.from('deportista').select('id')\n  .eq('id_entrenador', user.id).order('nombre')`)).toEqual([2])
    expect(listasDeLosMios(`supabase.from('deportista').select('*').eq('id_entrenador', entrenadorEfectivo(user.id))`)).toEqual([])
    expect(listasDeLosMios(`supabase.from('test_definicion').select('*').eq('id_entrenador', user.id)`)).toEqual([])
  })

  it('ninguna pantalla pide «mis deportistas» a mano fuera de las que se quedan con los suyos', () => {
    const fallos: string[] = []
    for (const f of [...todos(path.join(RAIZ, 'app')), ...todos(path.join(RAIZ, 'components'))]) {
      const rel = path.relative(RAIZ, f).split(path.sep).join('/')
      if (SE_QUEDAN_CON_LOS_SUYOS[rel]) continue
      const malas = listasDeLosMios(fs.readFileSync(f, 'utf8'))
      if (malas.length) fallos.push(rel + ':' + malas.join(','))
    }
    expect(fallos).toEqual([])
  })

  it('las pantallas del espacio siguen pasando por entrenadorEfectivo', () => {
    for (const rel of PASAN_POR_EL_ESPACIO) {
      const codigo = fs.readFileSync(path.join(RAIZ, rel), 'utf8')
      expect(codigo, rel).toMatch(/\.eq\(\s*['"]id_entrenador['"]\s*,\s*entrenadorEfectivo\(user\.id\)\s*\)/)
    }
  })

  it('la lista de las que se quedan con los suyos no tiene ficheros que ya no existen', () => {
    for (const rel of Object.keys(SE_QUEDAN_CON_LOS_SUYOS)) {
      expect(fs.existsSync(path.join(RAIZ, rel)), rel).toBe(true)
    }
  })

  it('el detector de listas sin filtro caza el patrón y deja pasar las altas', () => {
    expect(listasSinFiltro(`const { data } = await supabase.from('deportista').select('id, nombre').order('nombre')`)).toEqual([1])
    expect(listasSinFiltro(`supabase.from('deportista').select('*').eq('id', 7).single()`)).toEqual([])
    expect(listasSinFiltro(`supabase.from('deportista').insert({ nombre }).select('id').single()`)).toEqual([])
  })

  it('ninguna lista de deportistas se fía solo de la RLS sin estar apuntada y acotada', () => {
    const fallos: string[] = []
    for (const f of [...todos(path.join(RAIZ, 'app')), ...todos(path.join(RAIZ, 'components')), ...todos(path.join(RAIZ, 'lib'))]) {
      const rel = path.relative(RAIZ, f).split(path.sep).join('/')
      const codigo = fs.readFileSync(f, 'utf8')
      const malas = listasSinFiltro(codigo)
      if (!malas.length) continue
      if (SE_FIAN_DE_LA_RLS[rel] && /filtrarPorEspacio\(/.test(codigo)) continue
      fallos.push(rel + ':' + malas.join(','))
    }
    expect(fallos).toEqual([])
  })
})

describe('filtrarPorEspacio', () => {
  const filas = [
    { id: 1, id_entrenador: 'yo' },
    { id: 2, id_entrenador: null },
    { id: 3, id_entrenador: 'laura' },
    { id: 4, id_entrenador: 'otro' },
  ]
  it('fuera de un espacio: lo suyo y las fichas de grupo, como antes de los directores', () => {
    expect(filtrarPorEspacio(filas, 'yo', null).map(f => f.id)).toEqual([1, 2])
  })
  it('dentro del espacio de Laura: solo los de Laura', () => {
    expect(filtrarPorEspacio(filas, 'yo', 'laura').map(f => f.id)).toEqual([3])
  })
})
