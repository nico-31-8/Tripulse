import { describe, it, expect, vi } from 'vitest'
import {
  fechaDeDia, domingoDe, microDelDia, volcarSemana, resumenVolcado, aplicarBloquesFuerza,
} from './plan-volcado'
import { formaDeSemana, type EntradaSemana } from './plan-semana'
import { colocarSemana } from './plan-colocacion'
import { rellenarSemana } from './plan-relleno'

/* Doble de supabase que registra lo que se le inserta. Tiene que FILTRAR de
   verdad: un doble que devuelve siempre lo mismo da verde sobre datos falsos. */
function fakeSb(opciones: { micros?: any[]; fallaSesion?: boolean } = {}) {
  const insertado: Record<string, any[]> = {}
  let siguienteId = 100
  const from = (tabla: string) => {
    const api: any = {}
    const filas = () => {
      if (tabla === 'macrociclo') return opciones.micros?.length ? [{ id: 1 }] : []
      if (tabla === 'mesociclo') return opciones.micros?.length ? [{ id: 1 }] : []
      if (tabla === 'microciclo') return opciones.micros || []
      return []
    }
    for (const m of ['select', 'eq', 'in', 'is', 'or', 'gte', 'lte', 'order', 'limit', 'not']) {
      api[m] = () => api
    }
    api.then = (res: any) => res({ data: filas(), error: null })
    api.single = async () => ({ data: filas()[0] ?? null, error: null })
    api.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null })
    api.insert = (fila: any) => {
      const arr = Array.isArray(fila) ? fila : [fila]
      insertado[tabla] = [...(insertado[tabla] || []), ...arr]
      const conId = arr.map((f, i) => ({ ...f, id: siguienteId++ }))
      const res: any = {
        select: () => ({
          single: async () => (opciones.fallaSesion && tabla === 'sesion')
            ? { data: null, error: { message: 'RLS' } }
            : { data: conId[0], error: null },
          then: (r: any) => r({ data: conId, error: null }),
        }),
        then: (r: any) => r({ data: conId, error: null }),
      }
      return res
    }
    return api
  }
  return { from, insertado }
}

const semanaDe = (p: Partial<EntradaSemana> = {}) => {
  const e: EntradaSemana = { horasSemana: 10, diasSemana: 6, distancia: 'medio', fase: 'pe-inicial', nivel: 'intermedio', ...p }
  const forma = formaDeSemana(e)
  return rellenarSemana({ forma, colocada: colocarSemana(forma, e.diasSemana), nivel: e.nivel, fase: e.fase })
}

const opts = (extra: any = {}) => ({
  idDeportista: 7,
  lunes: '2026-08-17',
  aplicarBloques: vi.fn(async () => null),
  bloquesDe: () => [{ zona: 'AEL', segundos: 3600 }],
  ...extra,
})

describe('las fechas', () => {
  /* Construir la fecha con `new Date()` local y volver a serializarla puede
     saltar un dia segun la zona horaria, y una sesion que aparece el domingo
     cuando debia ser el lunes no la ve nadie hasta que ya paso. */
  it('cada dia cae donde tiene que caer contando desde el lunes', () => {
    expect(fechaDeDia('2026-08-17', 'Lunes')).toBe('2026-08-17')
    expect(fechaDeDia('2026-08-17', 'Miércoles')).toBe('2026-08-19')
    expect(fechaDeDia('2026-08-17', 'Domingo')).toBe('2026-08-23')
    expect(domingoDe('2026-08-17')).toBe('2026-08-23')
  })

  it('cruza el cambio de mes sin descolocarse', () => {
    expect(fechaDeDia('2026-08-31', 'Miércoles')).toBe('2026-09-02')
    expect(fechaDeDia('2026-12-28', 'Domingo')).toBe('2027-01-03')
  })

  it('un dia que no existe no inventa una fecha', () => {
    expect(fechaDeDia('2026-08-17', 'Marte' as any)).toBe('2026-08-17')
  })
})

describe('en que microciclo cae', () => {
  const micros = [{ id: 5, fecha_inicio: '2026-08-17', duracion_dias: 7 }]

  it('dentro de su semana, si', () => {
    expect(microDelDia(micros, '2026-08-17')?.id).toBe(5)
    expect(microDelDia(micros, '2026-08-23')?.id).toBe(5)
  })

  it('fuera, no: el dia siguiente ya es otra semana', () => {
    expect(microDelDia(micros, '2026-08-24')).toBeNull()
    expect(microDelDia(micros, '2026-08-16')).toBeNull()
  })

  it('sin microciclos no revienta', () => {
    expect(microDelDia([], '2026-08-17')).toBeNull()
    expect(microDelDia(null as any, '2026-08-17')).toBeNull()
  })
})

describe('el volcado', () => {
  /* Iban una detrás de otra: tres esperas por sesión, dieciocho en fila en una
     semana de seis. Ahora van a la vez; la más lenta termina la última y el
     parte sigue saliendo en el orden de la semana. */
  it('las sesiones de la semana se crean a la vez, y el parte sale en su orden', async () => {
    const s = semanaDe()
    const sb = fakeSb()
    const visto: string[] = []
    let primera = -1
    const aplicar = vi.fn(async (_sb: any, idSesion: number) => {
      if (primera < 0) primera = idSesion
      visto.push('entra ' + idSesion)
      await new Promise(r => setTimeout(r, idSesion === primera ? 15 : 0))
      visto.push('sale ' + idSesion)
      return null
    })
    const r = await volcarSemana(sb, opts({ relleno: s.relleno, aplicarBloques: aplicar }))
    const entradas = visto.filter(v => v.startsWith('entra')).length
    expect(entradas).toBeGreaterThan(1)
    expect(visto.slice(0, entradas).every(v => v.startsWith('entra'))).toBe(true)
    expect(visto.at(-1)).toBe('sale ' + primera)
    expect(r.parte.map(p => p.dia)).toEqual(s.relleno.map(x => x.dia))
  })

  it('crea una sesion por cada una de la semana, en su fecha', async () => {
    const s = semanaDe()
    const sb = fakeSb()
    const r = await volcarSemana(sb, opts({ relleno: s.relleno }))
    expect(r.creadas).toBe(s.relleno.length)
    expect(r.error).toBeNull()
    expect(sb.insertado.sesion).toHaveLength(s.relleno.length)
    sb.insertado.sesion.forEach((ses: any, i: number) => {
      expect(ses.fecha_sesion).toBe(fechaDeDia('2026-08-17', s.relleno[i].dia))
      expect(ses.estado).toBe('Planificada')
    })
  })

  /* Sin esto, un atleta sin mesociclo montado no podria recibir nada. Es el mismo
     camino que usa el calendario al pegar una plantilla en una semana sin planificar. */
  it('sin semana planificada entran como sesion LIBRE', async () => {
    const s = semanaDe()
    const sb = fakeSb()
    const r = await volcarSemana(sb, opts({ relleno: s.relleno }))
    expect(r.parte.every(p => !p.enSuPlan)).toBe(true)
    sb.insertado.sesion.forEach((ses: any) => {
      expect(ses.id_microciclo).toBeNull()
      expect(ses.id_deportista).toBe(7)
      expect(ses.origen).toBe('entrenador')
    })
  })

  /* Este test fijaba lo contrario -«sin id_deportista»- dando por hecho que la
     sesión de dentro del plan heredaba el dueño de su microciclo. No es así: la
     política de RLS mira `id_deportista` EN LA PROPIA FILA, así que con ese
     campo a null el insert no pasa el WITH CHECK y no se crea nada. Es lo que
     impedía al deportista volcar sus semanas. */
  it('entran en su microciclo Y con el dueño escrito', async () => {
    const s = semanaDe()
    const sb = fakeSb({ micros: [{ id: 5, fecha_inicio: '2026-08-17', duracion_dias: 7 }] })
    const r = await volcarSemana(sb, opts({ relleno: s.relleno }))
    expect(r.parte.every(p => p.enSuPlan)).toBe(true)
    sb.insertado.sesion.forEach((ses: any) => {
      expect(ses.id_microciclo).toBe(5)
      expect(ses.id_deportista).toBe(7)
    })
  })

  /* La fuerza se guarda distinto: repeticiones en vez de metros o tiempo.
     Usar aplicarBloques para ella crearia la sesion con las tareas vacias, que es
     peor que no crearla porque parece que esta. */
  it('la fuerza NO pasa por aplicarBloques', async () => {
    const s = semanaDe()
    const fuerza = s.relleno.filter(r => r.hueco.bloque === 'Fuerza')
    expect(fuerza.length, 'la prueba no vale sin fuerza en la semana').toBeGreaterThan(0)
    const aplicar = vi.fn(async () => null)
    const sb = fakeSb()
    await volcarSemana(sb, opts({ relleno: s.relleno, aplicarBloques: aplicar }))
    expect(aplicar).toHaveBeenCalledTimes(s.relleno.length - fuerza.length)
  })

  it('la fuerza escribe repeticiones, no distancias', async () => {
    const sb = fakeSb()
    const err = await aplicarBloquesFuerza(sb, 42, 'fue-fm')
    expect(err).toBeNull()
    expect(sb.insertado.tarea.length).toBeGreaterThan(0)
    expect(sb.insertado.p_repeticiones?.length).toBeGreaterThan(0)
    expect(sb.insertado.p_distancia).toBeUndefined()
    // El ejercicio sugerido va en el comentario, no como vinculo a la biblioteca.
    expect(sb.insertado.tarea[0].comentario).toContain('Sentadilla')
    expect(sb.insertado.tarea[0].disciplina).toBe('Fuerza')
  })

  it('los isométricos van por tiempo, que es como se miden', async () => {
    // La plancha de la adaptacion anatomica son 30 s, no repeticiones.
    const sb = fakeSb()
    await aplicarBloquesFuerza(sb, 42, 'fue-aa')
    expect(sb.insertado.p_duracion?.length).toBeGreaterThan(0)
  })

  it('una plantilla de fuerza que no existe se reporta', async () => {
    expect(await aplicarBloquesFuerza(fakeSb(), 1, 'no-existe')).toMatch(/No existe/)
  })
})

describe('cuando algo falla', () => {
  /* Que una sesion falle no puede dejar la semana a medias sin decir cual. */
  it('no se para en el primer fallo y devuelve el parte', async () => {
    const s = semanaDe()
    const r = await volcarSemana(fakeSb({ fallaSesion: true }), opts({ relleno: s.relleno }))
    expect(r.creadas).toBe(0)
    expect(r.parte).toHaveLength(s.relleno.length)
    expect(r.parte.every(p => !p.ok && p.error === 'RLS')).toBe(true)
    expect(r.error).toMatch(/ninguna/i)
  })

  it('sin deportista, sin semana o sin sesiones no escribe nada', async () => {
    const sb = fakeSb()
    expect((await volcarSemana(sb, opts({ relleno: [], idDeportista: 0 }))).error).toMatch(/deportista/i)
    expect((await volcarSemana(sb, opts({ relleno: [], lunes: '' }))).error).toMatch(/semana/i)
    expect((await volcarSemana(sb, opts({ relleno: [] }))).error).toMatch(/vacía/i)
    expect(sb.insertado.sesion).toBeUndefined()
  })

  it('el resumen dice cuántas, cuáles libres y cuáles fallaron', async () => {
    const s = semanaDe()
    const r = await volcarSemana(fakeSb(), opts({ relleno: s.relleno }))
    const txt = resumenVolcado(r)
    expect(txt).toMatch(/sesión\(es\) creadas/)
    expect(txt).toMatch(/sesión libre/)
  })
})

/* Un doble que SE ACUERDA de lo que se le escribe y filtra de verdad por
   deportista, fechas y papelera. Con el de arriba —que contesta siempre «no hay
   nada»— una segunda pasada ni siquiera se puede plantear. */
function baseDeDatos(inicial: { sesion?: any[]; competicion?: any[]; falla?: string } = {}) {
  const tablas: Record<string, any[]> = {
    sesion: [...(inicial.sesion || [])],
    competicion: [...(inicial.competicion || [])],
  }
  let id = 1000
  const from = (tabla: string) => {
    const filtros: ((f: any) => boolean)[] = []
    const q: any = {}
    q.select = () => q
    q.order = () => q
    q.limit = () => q
    q.eq = (c: string, v: any) => { filtros.push(f => f[c] === v); return q }
    q.gte = (c: string, v: any) => { filtros.push(f => String(f[c]) >= String(v)); return q }
    q.lte = (c: string, v: any) => { filtros.push(f => String(f[c]) <= String(v)); return q }
    q.or = (expr: string) => { if (expr.includes('eliminada')) filtros.push(f => !f.eliminada); return q }
    q.then = (res: any, rej: any) => Promise.resolve(inicial.falla === tabla
      ? { data: null, error: { message: 'sin conexión' } }
      : { data: (tablas[tabla] || []).filter(f => filtros.every(p => p(f))), error: null }).then(res, rej)
    q.insert = (filas: any) => {
      const arr = (Array.isArray(filas) ? filas : [filas]).map(f => ({ ...f, id: id++ }))
      tablas[tabla] = [...(tablas[tabla] || []), ...arr]
      const hecho = { data: arr, error: null }
      return {
        select: () => ({ single: async () => ({ data: arr[0], error: null }), then: (r: any) => r(hecho) }),
        then: (r: any) => r(hecho),
      }
    }
    return q
  }
  return { from, tablas }
}

const enLaSemana = (db: ReturnType<typeof baseDeDatos>, lunes: string) =>
  db.tablas.sesion.filter(s => s.id_deportista === 7 && !s.eliminada &&
    s.fecha_sesion >= lunes && s.fecha_sesion <= domingoDe(lunes))

describe('una segunda pasada no duplica', () => {
  /* LO QUE PASÓ EL 2026-10-18. «Mi plan» llenó solo las semanas del 26-10 y
     del 02-11; minuto y medio después, «Generar mis sesiones» volcó el bloque
     entero encima y esas dos semanas quedaron con todo dos veces. Contar lo que
     hay (loQueYaHay) servía para avisar, pero volcar no lo miraba. */
  it('una semana que ya tiene sesiones no se vuelve a llenar', async () => {
    const db = baseDeDatos()
    const relleno = semanaDe().relleno
    const r1 = await volcarSemana(db, opts({ lunes: '2026-11-02', relleno }))
    const r2 = await volcarSemana(db, opts({ lunes: '2026-11-02', relleno }))
    expect(r1.creadas).toBe(relleno.length)
    expect(r2.creadas).toBe(0)
    expect(enLaSemana(db, '2026-11-02')).toHaveLength(relleno.length)
  })

  it('y lo dice: cuántas había y que no se tocó', async () => {
    const db = baseDeDatos()
    const relleno = semanaDe().relleno
    await volcarSemana(db, opts({ lunes: '2026-11-02', relleno }))
    const r2 = await volcarSemana(db, opts({ lunes: '2026-11-02', relleno }))
    expect(r2.yaHabia).toBe(relleno.length)
    expect(resumenVolcado(r2)).toMatch(/ya ten[ií]a/i)
  })

  /* La semana del 19-10 tenía las cuatro que el entrenador puso a mano el 16;
     la segunda pasada le sumó seis. */
  it('la semana con lo que puso el entrenador a mano tampoco se toca', async () => {
    const aMano = ['2026-10-20', '2026-10-22', '2026-10-24', '2026-10-25'].map((fecha_sesion, i) => ({
      id: 717 + i, id_deportista: 7, fecha_sesion, disciplina: 'Carrera', eliminada: false,
    }))
    const db = baseDeDatos({ sesion: aMano })
    const r = await volcarSemana(db, opts({ lunes: '2026-10-19', relleno: semanaDe().relleno }))
    expect(r.creadas).toBe(0)
    expect(enLaSemana(db, '2026-10-19')).toHaveLength(4)
  })

  it('las de la papelera no cuentan: vaciada la semana, se vuelve a llenar', async () => {
    const tiradas = [{ id: 1, id_deportista: 7, fecha_sesion: '2026-11-03', eliminada: true }]
    const db = baseDeDatos({ sesion: tiradas })
    const relleno = semanaDe().relleno
    const r = await volcarSemana(db, opts({ lunes: '2026-11-02', relleno }))
    expect(r.creadas).toBe(relleno.length)
  })

  it('las de otro deportista tampoco', async () => {
    const ajenas = [{ id: 1, id_deportista: 8, fecha_sesion: '2026-11-03', eliminada: false }]
    const db = baseDeDatos({ sesion: ajenas })
    const relleno = semanaDe().relleno
    expect((await volcarSemana(db, opts({ lunes: '2026-11-02', relleno }))).creadas).toBe(relleno.length)
  })

  /* Sumar sigue siendo posible, pero hay que pedirlo: es el planificador de una
     semana, después de enseñar cuántas hay. */
  it('solo si se pide sumar, suma', async () => {
    const db = baseDeDatos()
    const relleno = semanaDe().relleno
    await volcarSemana(db, opts({ lunes: '2026-11-02', relleno }))
    const r2 = await volcarSemana(db, opts({ lunes: '2026-11-02', relleno, sumar: true }))
    expect(r2.creadas).toBe(relleno.length)
    expect(enLaSemana(db, '2026-11-02')).toHaveLength(relleno.length * 2)
  })

  /* Si no se puede saber qué hay, no se escribe: duplicar una semana entera es
     peor que tener que pulsar otra vez. */
  it('si no se puede comprobar lo que hay, no se escribe nada', async () => {
    const db = baseDeDatos({ falla: 'sesion' })
    const r = await volcarSemana(db, opts({ lunes: '2026-11-02', relleno: semanaDe().relleno }))
    expect(r.creadas).toBe(0)
    expect(r.error).toMatch(/comprobar/i)
    expect(db.tablas.sesion).toEqual([])
  })
})

describe('el día de una competición', () => {
  const NOVO_MESOIRO = { id: 34, id_deportista: 7, fecha: '2026-11-22', nombre: 'Novo Mesoiro', prioridad: 'B', tipo: '' }

  /* La red de debajo. El bloque ya no planifica ese día (lib/plan-bloque), pero
     la semana suelta del planificador se monta antes de elegir las fechas, y
     esto es lo único que escribe: aquí no se puede colar. */
  it('no se escribe ninguna sesión ese día, y el parte dice por qué', async () => {
    const db = baseDeDatos({ competicion: [NOVO_MESOIRO] })
    const relleno = semanaDe().relleno
    expect(relleno.some(x => x.dia === 'Domingo'), 'la prueba necesita algo el domingo').toBe(true)
    const r = await volcarSemana(db, opts({ lunes: '2026-11-16', relleno }))
    expect(db.tablas.sesion.filter(s => s.fecha_sesion === '2026-11-22')).toEqual([])
    const domingo = r.parte.filter(p => p.dia === 'Domingo')
    expect(domingo.length).toBeGreaterThan(0)
    domingo.forEach(p => {
      expect(p.ok).toBe(false)
      expect(p.error).toMatch(/Novo Mesoiro/)
    })
    expect(r.creadas).toBe(relleno.filter(x => x.dia !== 'Domingo').length)
  })

  it('la competición de otro deportista no quita nada', async () => {
    const db = baseDeDatos({ competicion: [{ ...NOVO_MESOIRO, id_deportista: 8 }] })
    const relleno = semanaDe().relleno
    expect((await volcarSemana(db, opts({ lunes: '2026-11-16', relleno }))).creadas).toBe(relleno.length)
  })
})

describe('lo que se escribe en la tabla sesion', () => {
  /* ESTE TEST NACE DE UN FALLO REAL. El volcado escribia `nombre`, una columna
     que NO existe: PostgREST devolvia "Could not find the 'nombre' column of
     'sesion' in the schema cache" y no se creaba ni una sesion. Los dobles de
     test aceptan cualquier campo, asi que en verde no se veia nada.

     El esquema completo no esta en el repo, asi que lo unico que se puede
     vigilar desde aqui es que no se inventen columnas nuevas sin querer: si
     alguien anade una, este test se cae y le obliga a comprobar que existe. */
  it('solo escribe columnas que se sabe que existen', async () => {
    const permitidas = new Set([
      'id_microciclo', 'id_deportista', 'origen', 'disciplina', 'fecha_sesion', 'estado',
    ])
    const sb = fakeSb({ micros: [{ id: 5, fecha_inicio: '2026-08-17', duracion_dias: 7 }] })
    await volcarSemana(sb, opts({ relleno: semanaDe().relleno }))
    expect(sb.insertado.sesion.length).toBeGreaterThan(0)
    sb.insertado.sesion.forEach((ses: any) => {
      Object.keys(ses).forEach(k => expect(permitidas, 'columna inventada: ' + k).toContain(k))
    })
  })
})
