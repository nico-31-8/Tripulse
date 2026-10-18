// ============================================================
// Con la anamnesis repetida, todos se quedaban sin anamnesis
// ============================================================
//
// EL FALLO (2026-10-18). La deportista 20 tenía CINCO filas en `anamnesis`
// (ids 10–14). Todos los que la leían usaban `.maybeSingle()`, y con más de una
// fila eso no devuelve la primera: devuelve un error y `data` a null. Nadie
// miraba el error, así que para la app no tenía anamnesis: el planificador le
// ponía 8 h / 5 días por defecto en vez de sus «5–8 h, 3–4 días», sus zonas
// perdían la FC de reposo y el asistente decía que no la había rellenado.
// Y /alta, al no ver ninguna, insertaba otra: el bucle se alimentaba solo.
//
// La primera mitad prueba a los que leen con filas repetidas; la segunda LEE EL
// CÓDIGO y exige que la tabla solo se toque desde lib/anamnesis-vigente.

import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { baseEnMemoria } from './base-en-memoria'
import { cargarReferencias, cargarReferenciasDeVarios } from './referencia-zona'

// asistente importa supabase a nivel de módulo: sin esto revienta sin env vars.
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./sicat-zonas', () => ({ conZonaPico: (s: unknown[]) => s }))
const { construirContextoTexto } = await import('./asistente')

/* Cinco filas de la misma deportista, con sus ids (los valores son de mentira),
   en el orden en que la base las devuelva: no tiene por qué ser el de los ids.
   La vigente es la 14, la más reciente. */
const REPETIDAS = [
  { id: 12, id_deportista: 20, estado: 'enviada', fc_reposo: 60, dias_semana: 3 },
  { id: 10, id_deportista: 20, estado: 'borrador', fc_reposo: 61, dias_semana: null },
  { id: 14, id_deportista: 20, estado: 'enviada', fc_reposo: 52, dias_semana: 4 },
  { id: 11, id_deportista: 20, estado: 'borrador', fc_reposo: 62, dias_semana: 3 },
  { id: 13, id_deportista: 20, estado: 'borrador', fc_reposo: 63, dias_semana: 3 },
]

describe('lo que hace maybeSingle() con dos filas (por eso se perdía)', () => {
  it('no devuelve la primera: devuelve error y data null', async () => {
    const base = baseEnMemoria({ anamnesis: REPETIDAS })
    const r = await base.from('anamnesis').select('*').eq('id_deportista', 20).maybeSingle()
    expect(r.data).toBeNull()
    expect(r.error?.code).toBe('PGRST116')
  })
})

describe('con filas repetidas, los que leen la anamnesis la siguen viendo', () => {
  it('las zonas cogen la FC de reposo de la más reciente', async () => {
    // Sin wellness, la FC de reposo sale de la anamnesis (lib/frecuencia-cardiaca).
    const base = baseEnMemoria({
      deportista: [{ id: 20, fc_maxima: 190, sistema_zonas: 1, nombre: 'Corredora' }],
      anamnesis: REPETIDAS,
    })
    const refs = await cargarReferencias(base, 20)
    expect(refs.fcReposo).toBe(52)
  })

  it('la hoja de varios coge la más reciente de cada uno, venga en el orden que venga', async () => {
    const base = baseEnMemoria({
      deportista: [
        { id: 20, fc_maxima: 190, sistema_zonas: 1, nombre: 'Corredora' },
        { id: 15, fc_maxima: 185, sistema_zonas: 1, nombre: 'Otro' },
      ],
      // La última que llega de la 20 es una vieja: quedarse con «la última que
      // pasa» era quedarse con la que tocara.
      anamnesis: [REPETIDAS[2], { id: 3, id_deportista: 15, fc_reposo: 48 }, REPETIDAS[1]],
    })
    const refs = await cargarReferenciasDeVarios(base, [20, 15])
    expect(refs.get(20)?.fcReposo).toBe(52)
    expect(refs.get(15)?.fcReposo).toBe(48)
  })

  it('el asistente del entrenador lee lo que declaró, no «sin rellenar»', async () => {
    const base = baseEnMemoria({ anamnesis: REPETIDAS })
    const ctx = await construirContextoTexto(base, { id: 20, nombre: 'Corredora' })
    expect(ctx).not.toContain('SIN RELLENAR')
    expect(ctx).toContain('4 días/semana')
  })
})

// ============================================================
// El guardián: solo un sitio habla con la tabla
// ============================================================

const RAIZ = path.resolve(__dirname, '..')
const CARPETAS = ['app', 'lib', 'components']
const EL_SITIO = 'lib/anamnesis-vigente.ts'
const A_LA_TABLA = /\.from\(\s*['"`]anamnesis['"`]\s*\)/g

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

describe('el guardián', () => {
  it('reconoce una consulta a la tabla escrita de cualquier forma', () => {
    for (const s of [
      "supabase.from('anamnesis').select('*')",
      'sb.from("anamnesis").insert(x)',
      "sb.from(\n  'anamnesis'\n)",
    ]) expect(s.match(A_LA_TABLA), s).toHaveLength(1)
    expect("from('anamnesis_vieja')".match(A_LA_TABLA)).toBeNull()
  })

  it(`nadie lee ni escribe la anamnesis fuera de ${EL_SITIO}`, () => {
    /* Leer con maybeSingle es quedarse sin nada en cuanto haya dos filas, e
       insertar «porque no hay» es crear la segunda. Las dos cosas se hacen en
       un solo sitio, y ese sitio sabe qué hacer con las repetidas. */
    const fuera: string[] = []
    for (const f of ficheros()) {
      const rel = path.relative(RAIZ, f).split(path.sep).join('/')
      if (rel === EL_SITIO) continue
      const n = fs.readFileSync(f, 'utf8').match(A_LA_TABLA)?.length ?? 0
      if (n) fuera.push(`${rel} (${n})`)
    }
    expect(fuera).toEqual([])
  })

  it('la ficha larga guarda en cola: dos autoguardados no se cruzan', () => {
    /* Las filas 10 y 11 nacieron a 1,5 s: un autoguardado en vuelo, la persona
       tecleando, y el siguiente salió con el id todavía a null. */
    const texto = fs.readFileSync(path.join(RAIZ, 'app/anamnesis/page.tsx'), 'utf8')
    expect(/guardadorDeAnamnesis\(/.test(texto), 'app/anamnesis/page.tsx no guarda con guardadorDeAnamnesis').toBe(true)
  })
})
