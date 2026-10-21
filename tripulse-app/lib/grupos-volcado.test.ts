import { describe, it, expect } from 'vitest'
import {
  volcar, resumenVolcado, volcadoPrevio, apartarVolcadoPrevio, sesionesQueLeFaltan,
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

/* Cliente de mentira para volcar: lee el grupo (con las hijas anidadas en cada
   tarea, como las devuelve PostgREST) y apunta cada inserción. Las inserciones
   son de golpe: `v` es la lista de filas. */
function sbFalso(opciones: { fallaSesionN?: number; datos?: Record<string, unknown[]> } = {}) {
  const ops: any[] = []
  let n = 100, nSes = 0
  const datos: Record<string, any[]> = {
    sesion: [{ id: 1, fecha_sesion: '2026-03-04', disciplina: 'Carrera', id_deportista: 99, estado: 'Planificada', origen: 'entrenador', test: { origen: 'bateria', clave: '6min' } }],
    tarea: [{
      id: 11, id_sesion: 1, orden: 1, zona_entrenamiento: 'AEM', id_deportista: 99,
      p_distancia: [{ id: 21, id_tarea: 11, metros_planeados: 1000, ritmo_objetivo: '4:12', id_deportista: 99 }],
      p_duracion: [], p_repeticiones: [], ejercicios: [],
    }],
    ...opciones.datos,
  }
  const api = (tabla: string) => ({
    insert(v: any) {
      ops.push({ op: 'insert', tabla, v })
      const filas = Array.isArray(v) ? v : [v]
      const resp = () => {
        if (tabla === 'sesion') {
          nSes++
          if (nSes === opciones.fallaSesionN) return { data: null, error: { message: 'RLS' } }
        }
        return { data: filas.map(() => ({ id: ++n })), error: null }
      }
      return {
        select: () => {
          if (tabla === 'grupo_entreno_emision') return { single: () => Promise.resolve({ data: { id: 'e1' }, error: null }) }
          return Promise.resolve(resp())
        },
        then: (r: any, j: any) => Promise.resolve({ error: null }).then(r, j),
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
  /* Un mapa por deportista, que es lo que pide `volcar` ahora. Antes era una
     función por persona y se llamaba dentro del bucle: con ocho miembros, ocho
     llamadas, y cada una eran tres consultas encadenadas. */
  microsDeTodos: async (ids: number[]) =>
    new Map(ids.map(id => [id, [{ id: 30, fecha_inicio: '2026-03-02', duracion_dias: 7 }]])),
  microDelDia: (ms: any[]) => ms[0] || null,
}
const MIEMBROS = [{ id_deportista: 1, nombre: 'Ana' }, { id_deportista: 2, nombre: 'Luis' }]
const inserciones = (sb: any, tabla: string) => sb.ops.filter((o: any) => o.op === 'insert' && o.tabla === tabla)

describe('volcar', () => {
  /* El fallo que esto evita: al copiar con {...resto}, cada fila arrastra el
     id_deportista de la FICHA DEL GRUPO. La copia acabaría siendo del grupo y no de
     la persona, y como la RLS mira justo esa columna, el atleta no vería su propia
     sesión. Nada falla a la vista. */
  it('copia la sesión a cada miembro con SU id_deportista, no el del grupo', async () => {
    const sb = sbFalso()
    const r = await volcar(sb, { ...BASE, miembros: MIEMBROS })
    expect(r.error).toBeNull()
    const ses = inserciones(sb, 'sesion')
    expect(ses.map((s: any) => s.v[0].id_deportista)).toEqual([1, 2])
    expect(ses.every((s: any) => s.v[0].id_deportista !== 99)).toBe(true)
  })

  it('las tareas y sus hijas también van al dueño correcto', async () => {
    const sb = sbFalso()
    await volcar(sb, { ...BASE, miembros: [MIEMBROS[0]] })
    const [tar] = inserciones(sb, 'tarea')
    expect(tar.v[0].id_deportista).toBe(1)
    const [pd] = inserciones(sb, 'p_distancia')
    expect(pd.v[0].id_deportista).toBe(1)
    expect(pd.v[0].metros_planeados).toBe(1000)
  })

  /* En modo entreno el ritmo guardado LE GANA al calculado: copiarlo le mostraría a
     todos el ritmo de otro. */
  it('no arrastra el ritmo del grupo', async () => {
    const sb = sbFalso()
    await volcar(sb, { ...BASE, miembros: [MIEMBROS[0]] })
    const [pd] = inserciones(sb, 'p_distancia')
    expect(pd.v[0]).not.toHaveProperty('ritmo_objetivo')
  })

  /* Un día de test del grupo llega a cada miembro: la lista es de lo que NO se copia. */
  it('el test del día viaja con la sesión', async () => {
    const sb = sbFalso()
    await volcar(sb, { ...BASE, miembros: [MIEMBROS[0]] })
    expect(inserciones(sb, 'sesion')[0].v[0].test).toEqual({ origen: 'bateria', clave: '6min' })
  })

  it('todas las copias comparten la misma emisión', async () => {
    const sb = sbFalso()
    await volcar(sb, { ...BASE, miembros: MIEMBROS })
    expect(inserciones(sb, 'sesion').every((s: any) => s.v[0].id_emision === 'e1')).toBe(true)
  })

  it('quien no tiene semana la recibe igual, como sesión libre', async () => {
    const sb = sbFalso()
    const r = await volcar(sb, { ...BASE, miembros: [MIEMBROS[0]], microDelDia: () => null })
    const [ses] = inserciones(sb, 'sesion')
    expect(ses.v[0].id_microciclo).toBeNull()
    expect(ses.v[0].origen).toBe('entrenador')
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

  /* Lo que hacía esperar al entrenador: una escritura por sesión, otra por tarea…
     y todo persona tras persona. Ahora cada persona son tres escrituras —sesiones,
     tareas, lo que cuelga— sea la semana que sea. */
  it('una escritura por tabla y persona, no una por fila', async () => {
    const sb = sbFalso()
    await volcar(sb, {
      ...BASE, miembros: MIEMBROS,
      sesiones: [{ id: 1, fecha_sesion: '2026-03-04', disciplina: 'Carrera' }, { id: 1, fecha_sesion: '2026-03-04', disciplina: 'Carrera' }],
    })
    expect(inserciones(sb, 'sesion')).toHaveLength(2)
    expect(inserciones(sb, 'sesion').every((s: any) => s.v.length === 2)).toBe(true)
    expect(inserciones(sb, 'tarea')).toHaveLength(2)
    expect(inserciones(sb, 'p_distancia')).toHaveLength(2)
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

/*
  Volcar hacía lo mismo que emitir: una llamada de microciclos POR MIEMBRO, y cada
  una eran tres consultas encadenadas. Con ocho personas y una semana de seis
  sesiones, el entrenador esperaba mirando la pantalla.
*/
describe('las semanas de los miembros se piden UNA vez', () => {
  it('una sola llamada, con todos los ids dentro', async () => {
    const sb = sbFalso()
    let llamadas = 0
    let recibidos: number[] = []
    await volcar(sb, {
      ...BASE, miembros: MIEMBROS,
      microsDeTodos: async (ids: number[]) => {
        llamadas++
        recibidos = ids
        return new Map(ids.map(id => [id, [{ id: 30, fecha_inicio: '2026-03-02', duracion_dias: 7 }]]))
      },
    })
    expect(llamadas).toBe(1)
    expect(recibidos).toEqual([1, 2])
  })

  it('quien no está en el mapa entra como sesión libre, no se queda fuera', async () => {
    const sb = sbFalso()
    await volcar(sb, {
      ...BASE, miembros: MIEMBROS,
      /* Solo Ana tiene plan. Luis no está en el mapa: eso NO es un error, su
         sesión tiene que entrar igual y colgar de él directamente. */
      microsDeTodos: async () =>
        new Map([[1, [{ id: 30, fecha_inicio: '2026-03-02', duracion_dias: 7 }]]]),
    })
    const ses = sb.ops.filter((o: any) => o.op === 'insert' && o.tabla === 'sesion')
    expect(ses).toHaveLength(2)
    expect(ses[0].v[0].id_microciclo).toBe(30)
    expect(ses[1].v[0].id_microciclo).toBeNull()
    expect(ses[1].v[0].id_deportista).toBe(2)
  })
})

/*
  Las zonas propias (20-10-2026). Cada tarea congela su zona con los porcentajes
  de quien la recibe, y en el grupo esa es la ficha: copiada tal cual, todos
  recibirían los del grupo. Aquí, una tarea de UMB mandada entera (del 95 al 105 %
  del VT2); Ana tiene los suyos (93–100) y Luis no.
*/
describe('las zonas propias llegan con los porcentajes de cada uno', () => {
  const VT2 = 'propia:9:1'
  const lim = (pct: number) => ({ ref: VT2, pct, corto: 'VT2' })
  const COPIA = {
    sigla: 'UMB', nombre: 'Umbral', color: '#f97316', rpe: 7, nivel: 4,
    pctMin: 95, pctMax: 105, refId: VT2, refEtiqueta: 'VT2',
    fuente: 'clasif:5', clasificacion: 'Laboratorio', desde: lim(95), hasta: lim(105),
  }
  const datos = (copia: typeof COPIA) => ({
    tarea: [{
      id: 11, id_sesion: 1, orden: 1, zona_entrenamiento: 'UMB', zona_copia: copia, id_deportista: 99,
      p_distancia: [], p_duracion: [], p_repeticiones: [], ejercicios: [],
    }],
    zona_entrenador: [{
      id: 14, id_clasificacion: 5, deporte: 'Carrera', sigla: 'UMB', nombre: 'Umbral',
      desde: { ref: VT2, pct: 95 }, hasta: { ref: VT2, pct: 105 }, archivada: false,
    }],
    zona_ajuste: [{ id_zona: 14, id_deportista: 1, desde: { ref: VT2, pct: 93 }, hasta: { ref: VT2, pct: 100 } }],
  })
  /* La copia que recibió cada uno, por su id_deportista: van en paralelo. */
  const copiaDeCada = (sb: ReturnType<typeof sbFalso>) => new Map(inserciones(sb, 'tarea').map((t: { v: Record<string, unknown>[] }) => [t.v[0].id_deportista, t.v[0].zona_copia]))

  it('Ana la recibe con los suyos y Luis con los de la plantilla', async () => {
    const sb = sbFalso({ datos: datos(COPIA) })
    const r = await volcar(sb, { ...BASE, miembros: MIEMBROS })
    expect(r.error).toBeNull()
    const cada = copiaDeCada(sb)
    expect(cada.get(1)).toEqual({ ...COPIA, pctMin: 93, pctMax: 100, desde: lim(93), hasta: lim(100) })
    expect(cada.get(2)).toEqual(COPIA)
  })

  it('lo afinado a mano llega igual a todos', async () => {
    const afinada = { ...COPIA, pctMin: 98, pctMax: 100, desde: lim(98), hasta: lim(100) }
    const sb = sbFalso({ datos: datos(afinada) })
    await volcar(sb, { ...BASE, miembros: MIEMBROS })
    const cada = copiaDeCada(sb)
    expect(cada.get(1)).toEqual(afinada)
    expect(cada.get(2)).toEqual(afinada)
  })

  /* Mejor los del grupo que dejar a alguien sin su semana. */
  it('si no se pueden leer sus zonas, se copia como antes', async () => {
    const sb = sbFalso({ datos: datos(COPIA) })
    const de = sb.from
    sb.from = (t: string) => { if (t === 'zona_ajuste') throw new Error('caída'); return de(t) }
    const r = await volcar(sb, { ...BASE, miembros: MIEMBROS })
    expect(r.error).toBeNull()
    expect(copiaDeCada(sb).get(1)).toEqual(COPIA)
  })

  /* Lo normal es que ninguna tarea lleve una zona propia: ni una consulta de más. */
  it('sin zonas propias en las tareas, no pregunta nada más', async () => {
    const sb = sbFalso()
    const tablas: string[] = []
    const de = sb.from
    sb.from = (t: string) => { tablas.push(t); return de(t) }
    await volcar(sb, { ...BASE, miembros: MIEMBROS })
    expect(tablas).not.toContain('zona_entrenador')
    expect(tablas).not.toContain('zona_ajuste')
  })
})
