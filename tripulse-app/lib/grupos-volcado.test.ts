import { describe, it, expect } from 'vitest'
import {
  limpiar, volcar, resumenVolcado, volcadoPrevio, apartarVolcadoPrevio, sesionesQueLeFaltan,
} from './grupos-volcado'

describe('sesionesQueLeFaltan', () => {
  const delGrupo = [
    { id: 1, fecha_sesion: '2026-03-04', disciplina: 'Carrera' },
    { id: 2, fecha_sesion: '2026-03-06', disciplina: 'Natacion' },
    { id: 3, fecha_sesion: '2026-03-08', disciplina: 'Carrera' },
  ]

  it('deja fuera las que ya tiene', () => {
    const r = sesionesQueLeFaltan(delGrupo, [{ fecha_sesion: '2026-03-06', disciplina: 'Natacion' }])
    expect(r.map(s => s.id)).toEqual([1, 3])
  })

  it('sin nada previo, le faltan todas', () => {
    expect(sesionesQueLeFaltan(delGrupo, [])).toHaveLength(3)
  })

  /* Mismo día pero otro deporte es otro entrenamiento: no se descarta. */
  it('el mismo día con otro deporte sigue faltando', () => {
    const r = sesionesQueLeFaltan(delGrupo, [{ fecha_sesion: '2026-03-04', disciplina: 'Natacion' }])
    expect(r.map(s => s.id)).toEqual([1, 2, 3])
  })

  it('la fecha con hora se compara igual', () => {
    const r = sesionesQueLeFaltan(delGrupo, [{ fecha_sesion: '2026-03-04T00:00:00Z', disciplina: 'Carrera' }])
    expect(r.map(s => s.id)).toEqual([2, 3])
  })

  it('aguanta nulos', () => {
    expect(sesionesQueLeFaltan(null as any, [])).toEqual([])
    expect(sesionesQueLeFaltan(delGrupo, null as any)).toHaveLength(3)
  })
})

/* Cliente para las dos funciones de "ya volcado". Devuelve lo que se le diga por
   tabla, y apunta las operaciones. */
function sbPrevio(porTabla: Record<string, any[]>) {
  const ops: any[] = []
  return {
    ops,
    from(tabla: string) {
      return {
        select() {
          const q: any = {}
          q.eq = () => q; q.in = () => q; q.gte = () => q; q.lte = () => q; q.or = () => q
          q.then = (r: any) => Promise.resolve({ data: porTabla[tabla] || [], error: null }).then(r)
          return q
        },
        update(valores: any) {
          const q: any = {}
          q.in = (_c: string, ids: any[]) => { ops.push({ op: 'update', tabla, valores, ids }); return Promise.resolve({ error: null }) }
          return q
        },
      }
    },
  }
}

describe('volcadoPrevio', () => {
  it('separa lo que sigue planificado de lo que ya se entrenó', async () => {
    const sb = sbPrevio({
      grupo_entreno_emision: [{ id: 'e1' }],
      sesion: [
        { id: 1, estado: 'Planificada', id_deportista: 10 },
        { id: 2, estado: 'Planificada', id_deportista: 11 },
        { id: 3, estado: 'Realizada', id_deportista: 10 },
      ],
    })
    const r = await volcadoPrevio(sb, 'g1', [10, 11], '2026-03-01', '2026-03-07')
    expect(r.planificadas).toEqual([1, 2])
    expect(r.realizadas).toBe(1)
    expect(r.personas).toBe(2)
  })

  it('si el grupo no ha volcado nunca, no hay nada', async () => {
    const sb = sbPrevio({ grupo_entreno_emision: [] })
    expect(await volcadoPrevio(sb, 'g1', [10], '2026-03-01', '2026-03-07'))
      .toEqual({ planificadas: [], realizadas: 0, personas: 0 })
  })

  it('sin miembros no consulta nada', async () => {
    const sb = sbPrevio({})
    const r = await volcadoPrevio(sb, 'g1', [], '2026-03-01', '2026-03-07')
    expect(r.planificadas).toEqual([])
  })

  /* Una cancelada tampoco se reemplaza: solo lo que sigue planificado. */
  it('una cancelada no cuenta como reemplazable', async () => {
    const sb = sbPrevio({
      grupo_entreno_emision: [{ id: 'e1' }],
      sesion: [{ id: 5, estado: 'Cancelada', id_deportista: 10 }],
    })
    const r = await volcadoPrevio(sb, 'g1', [10], '2026-03-01', '2026-03-07')
    expect(r.planificadas).toEqual([])
    expect(r.realizadas).toBe(1)
  })
})

describe('apartarVolcadoPrevio', () => {
  /* Aparta, no borra: `eliminada` es el borrado suave y la papelera las recupera.
     Reemplazar no puede significar perder trabajo. */
  it('las marca como eliminadas en vez de borrarlas', async () => {
    const sb = sbPrevio({})
    expect(await apartarVolcadoPrevio(sb, [1, 2])).toBeNull()
    expect(sb.ops).toEqual([{ op: 'update', tabla: 'sesion', valores: { eliminada: true }, ids: [1, 2] }])
  })

  it('con la lista vacía no toca nada', async () => {
    const sb = sbPrevio({})
    expect(await apartarVolcadoPrevio(sb, [])).toBeNull()
    expect(sb.ops).toHaveLength(0)
  })
})

describe('limpiar', () => {
  /* El fallo que esto evita: al copiar con {...resto}, cada fila arrastra el
     id_deportista de la FICHA DEL GRUPO. La copia acabaría siendo del grupo y no de
     la persona, y como la RLS mira justo esa columna, el atleta no vería su propia
     sesión. Nada falla a la vista. */
  it('quita el id_deportista, que es el que arruina la copia', () => {
    expect(limpiar({ id_deportista: 99, disciplina: 'Carrera' })).toEqual({ disciplina: 'Carrera' })
  })

  /* En modo entreno el ritmo guardado LE GANA al calculado: copiarlo le mostraría a
     todos el ritmo de otro. */
  it('quita el ritmo_objetivo', () => {
    expect(limpiar({ metros_planeados: 1000, ritmo_objetivo: '4:12' })).toEqual({ metros_planeados: 1000 })
  })

  it('quita lo que pasó y deja lo que se planeó', () => {
    const r = limpiar({
      id: 7, created_at: 'x', id_sesion: 3, id_microciclo: 4, id_emision: 'e',
      estado: 'Realizada', rpe_reportado: 9, duracion_real: 61, eliminada: true,
      sensacion_tecnica: 4, disciplina: 'Natacion', zona_entrenamiento: 'AEM', series: 4,
    })
    expect(r).toEqual({ disciplina: 'Natacion', zona_entrenamiento: 'AEM', series: 4 })
  })

  it('con null o vacío no revienta', () => {
    expect(limpiar(null)).toEqual({})
    expect(limpiar({})).toEqual({})
  })
})

function sbFalso(opciones: { fallaSesionN?: number } = {}) {
  const ops: any[] = []
  let n = 100, nSes = 0
  const datos: Record<string, any[]> = {
    sesion: [{ id: 1, fecha_sesion: '2026-03-04', disciplina: 'Carrera', id_deportista: 99, estado: 'Planificada' }],
    tarea: [{ id: 11, id_sesion: 1, orden: 1, zona_entrenamiento: 'AEM', id_deportista: 99 }],
    p_distancia: [{ id: 21, id_tarea: 11, metros_planeados: 1000, ritmo_objetivo: '4:12', id_deportista: 99 }],
    p_duracion: [], p_repeticiones: [], ejercicios: [],
  }
  const api = (tabla: string) => ({
    insert(v: any) {
      ops.push({ op: 'insert', tabla, v })
      if (Array.isArray(v)) return Promise.resolve({ error: null })
      return {
        select: () => ({
          single: () => {
            if (tabla === 'grupo_entreno_emision') return Promise.resolve({ data: { id: 'e1' }, error: null })
            if (tabla === 'sesion') {
              nSes++
              if (nSes === opciones.fallaSesionN) return Promise.resolve({ data: null, error: { message: 'RLS' } })
            }
            return Promise.resolve({ data: { id: ++n }, error: null })
          },
        }),
      }
    },
    delete() { return { eq: (_c: string, val: any) => { ops.push({ op: 'delete', tabla, val }); return Promise.resolve({ error: null }) } } },
    select() {
      const q: any = {}
      q.eq = () => q; q.in = () => q; q.gte = () => q; q.lte = () => q; q.or = () => q; q.order = () => q
      q.then = (r: any) => Promise.resolve({ data: datos[tabla] || [], error: null }).then(r)
      return q
    },
  })
  return { ops, from: (t: string) => api(t) }
}

const BASE = {
  idGrupo: 'g1', nombre: 'Semana 1',
  sesiones: [{ id: 1, fecha_sesion: '2026-03-04', disciplina: 'Carrera' }],
  microsDe: async () => [{ id: 30, fecha_inicio: '2026-03-02', duracion_dias: 7 }],
  microDelDia: (ms: any[]) => ms[0] || null,
}
const MIEMBROS = [{ id_deportista: 1, nombre: 'Ana' }, { id_deportista: 2, nombre: 'Luis' }]

describe('volcar', () => {
  it('copia la sesión a cada miembro con SU id_deportista, no el del grupo', async () => {
    const sb = sbFalso()
    const r = await volcar(sb, { ...BASE, miembros: MIEMBROS })
    expect(r.error).toBeNull()
    const ses = sb.ops.filter(o => o.op === 'insert' && o.tabla === 'sesion')
    expect(ses.map(s => s.v.id_deportista)).toEqual([1, 2])
    expect(ses.every(s => s.v.id_deportista !== 99)).toBe(true)
  })

  it('las tareas y sus hijas también van al dueño correcto', async () => {
    const sb = sbFalso()
    await volcar(sb, { ...BASE, miembros: [MIEMBROS[0]] })
    const tar = sb.ops.find(o => o.op === 'insert' && o.tabla === 'tarea')
    expect(tar.v.id_deportista).toBe(1)
    const pd = sb.ops.find(o => o.op === 'insert' && o.tabla === 'p_distancia')
    expect(pd.v[0].id_deportista).toBe(1)
    expect(pd.v[0].metros_planeados).toBe(1000)
  })

  it('no arrastra el ritmo del grupo', async () => {
    const sb = sbFalso()
    await volcar(sb, { ...BASE, miembros: [MIEMBROS[0]] })
    const pd = sb.ops.find(o => o.op === 'insert' && o.tabla === 'p_distancia')
    expect(pd.v[0].ritmo_objetivo).toBeUndefined()
  })

  it('todas las copias comparten la misma emisión', async () => {
    const sb = sbFalso()
    await volcar(sb, { ...BASE, miembros: MIEMBROS })
    const ses = sb.ops.filter(o => o.op === 'insert' && o.tabla === 'sesion')
    expect(ses.every(s => s.v.id_emision === 'e1')).toBe(true)
  })

  it('quien no tiene semana la recibe igual, como sesión libre', async () => {
    const sb = sbFalso()
    const r = await volcar(sb, { ...BASE, miembros: [MIEMBROS[0]], microDelDia: () => null })
    const ses = sb.ops.find(o => o.op === 'insert' && o.tabla === 'sesion')
    expect(ses.v.id_microciclo).toBeNull()
    expect(ses.v.origen).toBe('entrenador')
    expect(r.resultados[0].enSuPlan).toBe(0)
    expect(r.resultados[0].creadas).toBe(1)
  })

  it('si falla uno, los demás la reciben', async () => {
    const sb = sbFalso({ fallaSesionN: 1 })
    const r = await volcar(sb, { ...BASE, miembros: MIEMBROS })
    expect(r.resultados[0].creadas).toBe(0)
    expect(r.resultados[0].fallos).toBe(1)
    expect(r.resultados[1].creadas).toBe(1)
  })

  it('sin sesiones ni miembros no abre emisión', async () => {
    const sb = sbFalso()
    expect((await volcar(sb, { ...BASE, sesiones: [], miembros: MIEMBROS })).error).toMatch(/nada que volcar/i)
    expect((await volcar(sb, { ...BASE, miembros: [] })).error).toMatch(/nadie/i)
    expect(sb.ops).toHaveLength(0)
  })
})

describe('resumenVolcado', () => {
  it('cuenta sesiones, personas y las que van sin semana', () => {
    const t = resumenVolcado([
      { id_deportista: 1, nombre: 'Ana', creadas: 3, fallos: 0, enSuPlan: 3 },
      { id_deportista: 2, nombre: 'Luis', creadas: 3, fallos: 0, enSuPlan: 0 },
      { id_deportista: 3, nombre: 'Eva', creadas: 0, fallos: 3, enSuPlan: 0 },
    ])
    expect(t).toContain('6 sesiones creadas en 2 de 3')
    expect(t).toContain('3 sin semana planificada')
  })
})
