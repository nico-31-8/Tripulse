// ============================================================
// Las sesiones de alguien se piden por su id, no por su plan
// ============================================================
//
// ESTE TEST LEE EL CÓDIGO. Es la familia de bugs más caras de este proyecto y ya
// va por la tercera vuelta:
//
//   · Julio de 2026: «las sesiones libres no se manejaban bien en muchos
//     sitios» — ficha de sesión, mis-análisis, /volumen, /carga.
//   · Agosto de 2026: la cadena `macrociclo → mesociclo → microciclo` estaba en
//     CATORCE pantallas, y «casi siempre traía el mismo daño colateral: las
//     sesiones que el atleta se añade quedaban fuera». Era el mismo bug catorce
//     veces, uno por sitio donde alguien copió la cadena.
//   · Septiembre de 2026 (esto): quedaban NUEVE sitios pidiendo las sesiones por
//     `in('id_microciclo', …)`. Seis eran la pareja «las del plan + las libres»
//     —correcta pero con dos viajes— y dos eran el bug otra vez:
//
//       - Los ÍNDICES del panel del entrenador miraban solo las del plan, sin la
//         consulta de las libres que sí tenían las otras cuatro métricas. Un
//         atleta sin plan no tenía índices en absoluto.
//       - La gráfica de PERIODIZACIÓN no contaba como «carga real» lo que el
//         atleta se añade, así que la barra de lo hecho salía por debajo.
//
// LA REGLA. Para saber qué ha entrenado alguien se pregunta por
// `eq('id_deportista', …)`. La sesión lo lleva desde la Fase A y su política RLS
// garantiza que está relleno: una fila sin dueño no la ve nadie. Pedirlas por
// microciclo solo vale cuando el ALCANCE es el plan —borrar sus sesiones,
// rehacerlo, o mirar un mesociclo concreto—, y eso va abajo con su motivo.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(__dirname, '..')

/** Donde el alcance SÍ es el plan, y por qué. */
const PUEDEN: Record<string, string> = {
  'app/mesociclo/[id]/vista/page.tsx': 'Es la vista de UN mesociclo: sus sesiones son, por definición, las de sus microciclos. Una sesión libre no está en ningún mesociclo.',
  'app/planificacion-visual/[id]/bloques/page.tsx': 'BORRA las sesiones del plan que se deshace. Por deportista se llevaría por delante las que él se añadió.',
  'app/planificacion-visual/[id]/dibujo/page.tsx': 'Lo mismo: borrar las sesiones de los microciclos que desaparecen del lienzo.',
  'lib/plan-rehacer.ts': 'Rehacer un plan: mira y toca las sesiones DE ese plan, no las del atleta.',
}

/** Pedir sesiones por microciclo. */
const POR_CADENA = /from\(\s*['"]sesion['"]\s*\)[\s\S]{0,400}?\.in\(\s*['"]id_microciclo['"]/

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

describe('la cadena del microciclo', () => {
  const culpables: string[] = []
  const permitidosSinUsar = new Set(Object.keys(PUEDEN))

  for (const f of ficheros()) {
    const rel = path.relative(RAIZ, f).split(path.sep).join('/')
    if (!POR_CADENA.test(fs.readFileSync(f, 'utf8'))) continue
    permitidosSinUsar.delete(rel)
    if (rel in PUEDEN) continue
    culpables.push(rel)
  }

  it('nadie pide las sesiones de alguien pasando por su plan', () => {
    expect(
      culpables,
      'Pide por eq(\'id_deportista\', …) —las trae todas, plan y libres— en: ' + culpables.join(', '),
    ).toEqual([])
  })

  it('la lista de permitidos no se queda con fantasmas', () => {
    expect([...permitidosSinUsar]).toEqual([])
  })

  /* Y la otra punta del patrón: quien ya pregunta por el deportista no necesita
     además la consulta de «las libres». Si vuelve a aparecer un
     `is('id_microciclo', null)` es que alguien ha reconstruido la pareja. */
  it('y nadie vuelve a montar la pareja «las del plan + las libres»', () => {
    const conLibres = ficheros()
      .map(f => path.relative(RAIZ, f).split(path.sep).join('/'))
      .filter(rel => /is\(\s*['"]id_microciclo['"]\s*,\s*null\s*\)/.test(fs.readFileSync(path.join(RAIZ, rel), 'utf8')))
    expect(
      conLibres,
      'eq(\'id_deportista\') ya trae las libres; sobra la consulta aparte en: ' + conLibres.join(', '),
    ).toEqual([])
  })

  it('el alambre está bien puesto', () => {
    expect(POR_CADENA.test("supabase.from('sesion').select(sel).in('id_microciclo', microIds)")).toBe(true)
    expect(POR_CADENA.test("from('sesion')\n  .select('id, disciplina')\n  .or(VIVAS).in('id_microciclo', ids)")).toBe(true)
    /* Pedir OTRA tabla por microciclo no es esto (las tareas de un plan, por ejemplo). */
    expect(POR_CADENA.test("from('tarea').select('id').in('id_microciclo', ids)")).toBe(false)
    /* Ni pedir las sesiones por deportista. */
    expect(POR_CADENA.test("from('sesion').select(sel).eq('id_deportista', dep.id)")).toBe(false)
  })
})
