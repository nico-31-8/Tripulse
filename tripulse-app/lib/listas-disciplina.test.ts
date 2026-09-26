// ============================================================
// Las listas de disciplinas salen del catálogo, no de la memoria
// ============================================================
//
// Dos partes: las listas que ahora se derivan (y lo que garantizan), y un
// guardián que LEE EL CÓDIGO para que no vuelva a aparecer una escrita a mano.
//
// LO QUE PASÓ. `app/mesociclo/[id]/vista` tenía
// `['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']`, y con esa lista hacía el
// recuento de sesiones por disciplina del mesociclo: **una sesión híbrida no
// aparecía en el desglose**. Exactamente lo que les pasó a los bricks cuando se
// añadieron. Y había cinco listas más, una de ellas decidiendo qué disciplina se
// acepta de un reloj.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TODAS, HIBRIDO } from './disciplinas'
import { DISCIPLINAS_CON_PLANTILLA, PLANTILLAS } from './plantillas'
import { DEPORTES_TEST, OTRO_DEPORTE } from './test-definicion'

describe('las disciplinas que tienen plantilla', () => {
  it('son exactamente las que aparecen en las plantillas', () => {
    const enPlantillas = new Set(PLANTILLAS.map(p => p.disciplina))
    expect([...DISCIPLINAS_CON_PLANTILLA].sort()).toEqual([...enPlantillas].sort())
  })

  it('vienen en el orden del catálogo', () => {
    const esperado = TODAS.filter(d => DISCIPLINAS_CON_PLANTILLA.includes(d))
    expect(DISCIPLINAS_CON_PLANTILLA).toEqual(esperado)
  })

  /* Hoy son las tres de resistencia. No se escribe como dato esperado —eso
     volvería a ser la lista a mano— sino como lo que garantiza: que ninguna
     disciplina sin plantilla se ofrezca, porque el desplegable dejaría elegir
     un deporte y luego no tendría ni un entrenamiento que enseñar. */
  it('ninguna se ofrece sin tener al menos una plantilla', () => {
    for (const d of DISCIPLINAS_CON_PLANTILLA) {
      expect(PLANTILLAS.some(p => p.disciplina === d), d).toBe(true)
    }
  })
})

describe('los deportes de un test propio', () => {
  it('son los del catálogo que se miden, y «Otro» al final', () => {
    expect(DEPORTES_TEST[DEPORTES_TEST.length - 1]).toBe(OTRO_DEPORTE)
    for (const d of DEPORTES_TEST.slice(0, -1)) expect(TODAS, d).toContain(d)
  })

  /* Un brick se cronometra por segmentos y un híbrido es fuerza con cardio:
     ninguno tiene UNA marca que medir. */
  it('sin Brick ni Híbrido', () => {
    expect(DEPORTES_TEST).not.toContain('Brick')
    expect(DEPORTES_TEST).not.toContain(HIBRIDO)
  })

  /* Es lo que se guarda en `test_definicion.deporte`, y /laboratorio lo
     escribía con tilde mientras /tests-propios lo escribía sin ella. */
  it('son ids del catálogo, no etiquetas con tilde', () => {
    expect(DEPORTES_TEST).toContain('Natacion')
    expect(DEPORTES_TEST).not.toContain('Natación')
  })

  it('no se repite ninguno', () => {
    expect(new Set(DEPORTES_TEST).size).toBe(DEPORTES_TEST.length)
  })
})

// ============================================================
// El guardián: nadie escribe su propia lista
// ============================================================

const RAIZ = path.resolve(__dirname, '..')
const CARPETAS = ['app', 'lib', 'components']

/**
 * Las listas largas que SÍ pueden estar escritas, y por qué. Cada una tiene un
 * motivo de deporte, no es una copia del catálogo.
 */
const PUEDEN: Record<string, string> = {
  'lib/disciplinas.ts': 'Es el catálogo: aquí viven TODAS, DEPORTES y los perfiles de deportista.',
  'lib/orden-chips.ts': 'Un ORDEN, no una lista de quién existe: los chips se apilan fuerza primero y carrera al final, y ese orden lo decidió el usuario.',
  'lib/catalogo-tests.ts': 'Los tests hablan de «Triatlón», que no es una disciplina que se programe: es otro vocabulario.',
  'lib/plan-semana.ts': 'El planificador de semanas reparte entre los cuatro deportes y no genera híbridos ni bricks.',
  'lib/plan-colocacion.ts': 'Los mismos cuatro bloques del planificador de semanas.',
  'lib/propuesta-sesion.ts': 'La propuesta del asistente: los cuatro deportes que sabe proponer.',
  'app/apuntar/page.tsx': 'Lo que el DEPORTISTA puede apuntarse. Sin Brick a propósito (cada bloque es de un deporte y la atribución lo necesita), y sin Híbrido porque lo programa el entrenador.',
  'components/PlanPeriodizacion.tsx': 'Las disciplinas que TOCA cada fase de la periodización: es contenido de la tabla, no la lista de las que existen.',
}

/**
 * Una lista de disciplinas escrita a mano, **de cuatro o más**.
 *
 * EL UMBRAL NO ES PEREZA. Dos o tres nombres son un subconjunto con un motivo de
 * deporte —un brick solo encadena resistencia, las zonas propias necesitan una
 * referencia (VAM, FTP, CSS) y solo esas tres la tienen—. Cuatro o más significa
 * «todas las que hay», y ESA es la que se queda vieja: es la que se comía el
 * híbrido en el mesociclo y el brick en el filtro del dibujo.
 */
const IDS = ['Natacion', 'Natación', 'Ciclismo', 'Carrera', 'Fuerza', 'Brick', 'Hibrido', 'Híbrido']
const UNO = '[\'"](?:' + IDS.join('|') + ')[\'"]'
const COMO_LISTA = '\\[\\s*' + UNO + '(?:\\s*,\\s*' + UNO + '){3}'

/**
 * Y LA MISMA LISTA DISFRAZADA DE CLAVES. Esto lo encontró el rebarrido, no la
 * primera búsqueda: en /volumen había cuatro cubos
 * `{ Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0 }` y dos se habían quedado
 * sin híbrido. El acumulador descarta lo que no tiene casilla, así que la carga
 * híbrida desaparecía de las barras y seguía contando en el total: las barras no
 * sumaban el total y nada avisaba.
 */
const CLAVE = '[\'"]?(?:' + IDS.join('|') + ')[\'"]?\\s*:'
const COMO_CLAVES = CLAVE + '[^\\n]{0,40}?(?:' + CLAVE + '[^\\n]{0,40}?){3}'

const LISTA = new RegExp(COMO_LISTA + '|' + COMO_CLAVES)

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

describe('la lista de disciplinas no se escribe a mano', () => {
  const culpables: string[] = []
  const permitidosSinUsar = new Set(Object.keys(PUEDEN))

  for (const f of ficheros()) {
    const r = path.relative(RAIZ, f).split(path.sep).join('/')
    if (!LISTA.test(fs.readFileSync(f, 'utf8'))) continue
    permitidosSinUsar.delete(r)
    if (r in PUEDEN) continue
    culpables.push(r)
  }

  it('nadie escribe su propia lista de disciplinas', () => {
    expect(
      culpables,
      'Usa TODAS / DEPORTES del catálogo, o una lista derivada con su motivo, en: ' + culpables.join(', '),
    ).toEqual([])
  })

  it('la lista de permitidos no se queda con fantasmas', () => {
    /* Un permiso que ya no hace falta es una puerta abierta para el siguiente. */
    expect([...permitidosSinUsar]).toEqual([])
  })

  it('el alambre está bien puesto', () => {
    const caza = (s: string) => LISTA.test(s)
    /* Las que se quedan viejas: cuatro o más. */
    expect(caza("const D = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']")).toBe(true)
    expect(caza('["Carrera","Ciclismo","Natación","Fuerza","Otro"]')).toBe(true)
    expect(caza("useState<string[]>(['Natacion','Ciclismo','Carrera','Fuerza','Hibrido'])")).toBe(true)
    /* Y la misma lista disfrazada de claves de un objeto. */
    expect(caza('{ periodo: k, Natacion: 0, Ciclismo: 0, Carrera: 0, Fuerza: 0, total: 0 }')).toBe(true)
    expect(caza("{ 'Natacion': '#3b82f6', 'Ciclismo': '#eab308', 'Carrera': '#22c55e', 'Fuerza': '#ef4444' }")).toBe(true)
    /* Los subconjuntos con motivo, no: */
    expect(caza("['Natacion', 'Ciclismo', 'Carrera']")).toBe(false)
    expect(caza("['Carrera', 'Fuerza']")).toBe(false)
    expect(caza("['Fuerza']")).toBe(false)
    expect(caza('{ Natacion: 0, Ciclismo: 0, Carrera: 0 }')).toBe(false)
  })
})
