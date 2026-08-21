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
