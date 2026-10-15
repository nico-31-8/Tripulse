import { describe, it, expect } from 'vitest'
import { crearTemporada, planesExistentes } from './plan-macrociclo-volcado'
import { planDeTemporada } from './plan-macrociclo'

/** Doble de supabase que apunta lo que se le manda a cada tabla. */
/* Una inserción de golpe devuelve TODAS sus filas, cada una con su id, y
   cuenta cuántas veces se escribe en cada tabla. */
function sbFalso(fallos: Record<string, string> = {}) {
  const escrito: Record<string, any[]> = { macrociclo: [], mesociclo: [], microciclo: [] }
  const llamadas: Record<string, number> = { macrociclo: 0, mesociclo: 0, microciclo: 0 }
  let id = 100
  const api = (tabla: string) => ({
    insert: (filas: any) => {
      const arr = Array.isArray(filas) ? filas : [filas]
      llamadas[tabla]++
      if (fallos[tabla]) {
        const r = { data: null, error: { message: fallos[tabla] } }
        return { select: () => ({ single: async () => r, then: (f: any) => f(r) }), then: (f: any) => f(r) }
      }
      const conIds = arr.map(fila => ({ ...fila, id: ++id }))
      escrito[tabla].push(...conIds)
      const res: any = {}
      res.select = () => ({
        single: async () => ({ data: conIds[0], error: null }),
        then: (r: any) => r({ data: conIds, error: null }),
      })
      // insert() sin .select() se espera directamente
      res.then = (r: any) => r({ error: null })
      return res
    },
    select: () => ({ eq: () => ({ count: 0 }) }),
  })
  return { api: { from: api }, escrito, llamadas }
}

const temporada = planDeTemporada({ desde: '2026-01-05', objetivo: '2026-06-07', distancia: 'olimpico' })

describe('escribir la temporada', () => {
  it('crea el macro, sus mesos y una fila por semana', async () => {
    const { api, escrito } = sbFalso()
    const r = await crearTemporada(api, {
      idDeportista: 7, temporada, distancia: 'olimpico', nombre: '70.3 de Gijón',
    })
    expect(r.error).toBeNull()
    expect(escrito.macrociclo).toHaveLength(1)
    expect(escrito.mesociclo.length).toBe(temporada.bloques.length)
    expect(r.micros).toBe(temporada.semanas)
  })

  /* Eran un mesociclo y sus semanas, uno detrás de otro: con ocho bloques,
     dieciséis esperas. Ahora los mesociclos van de golpe y las semanas de todos
     en otra, y cada semana tiene que seguir colgando de SU bloque. */
  it('los bloques van de una vez y las semanas de todos en otra, cada una con su bloque', async () => {
    const { api, escrito, llamadas } = sbFalso()
    const r = await crearTemporada(api, { idDeportista: 7, temporada, distancia: 'olimpico', nombre: 'X' })
    expect(r.error).toBeNull()
    expect(llamadas).toEqual({ macrociclo: 1, mesociclo: 1, microciclo: 1 })
    expect(temporada.bloques.length).toBeGreaterThan(1)
    const mesoPorId = new Map(escrito.mesociclo.map((m: any) => [m.id, m]))
    for (const semana of escrito.microciclo) {
      const suyo = mesoPorId.get(semana.id_mesociclo)
      expect(suyo, semana.objetivo).toBeTruthy()
      expect(semana.objetivo.endsWith(' — ' + suyo.objetivo)).toBe(true)
    }
    expect(r.mesos).toBe(temporada.bloques.length)
  })

  /* Las politicas de RLS filtran por id_deportista, que esta desnormalizado en
     las tres tablas. Sin esa columna el mesociclo existe pero su propio dueno
     no lo puede leer. */
  it('pone id_deportista en las TRES tablas', async () => {
    const { api, escrito } = sbFalso()
    await crearTemporada(api, { idDeportista: 7, temporada, distancia: 'olimpico', nombre: 'X' })
    ;['macrociclo', 'mesociclo', 'microciclo'].forEach(t =>
      escrito[t].forEach((f: any) => expect(f.id_deportista, t).toBe(7)))
  })

  it('marca la semana de descarga como Recuperación', async () => {
    const { api, escrito } = sbFalso()
    await crearTemporada(api, { idDeportista: 7, temporada, distancia: 'olimpico', nombre: 'X' })
    expect(escrito.microciclo.some((m: any) => m.tipo === 'Recuperación')).toBe(true)
    expect(escrito.microciclo.some((m: any) => m.tipo === 'Carga')).toBe(true)
  })

  /* La UA es lo que dibuja quien planifica. Rellenarla con el patron haria que
     la cadena de semanas leyera su propia suposicion como si fuera decision. */
  it('deja la UA en blanco a proposito', async () => {
    const { api, escrito } = sbFalso()
    await crearTemporada(api, { idDeportista: 7, temporada, distancia: 'olimpico', nombre: 'X' })
    escrito.microciclo.forEach((m: any) => expect(m.ua_planificada).toBeNull())
  })

  it('una temporada imposible no escribe nada', async () => {
    const { api, escrito } = sbFalso()
    const mala = planDeTemporada({ desde: '2026-06-01', objetivo: '2026-01-01', distancia: 'medio' })
    const r = await crearTemporada(api, { idDeportista: 7, temporada: mala, distancia: 'medio', nombre: 'X' })
    expect(r.error).toMatch(/no se puede dibujar/)
    expect(escrito.macrociclo).toEqual([])
  })
})

/**
 * Doble aparte para los caminos de fallo: necesita apuntar los DELETE y poder
 * fallar solo la primera vez, cosas que el doble de arriba no hace.
 */
function sbConFallos(opts: {
  microciclo?: (filas: any[]) => { error: any }
}) {
  const borrados: string[] = []
  let id = 200
  const from = (tabla: string) => ({
    insert: (filas: any) => {
      const arr = Array.isArray(filas) ? filas : [filas]
      if (tabla === 'microciclo' && opts.microciclo) {
        const r = opts.microciclo(arr)
        return { ...r, then: (f: any) => f(r) } as any
      }
      const conIds = arr.map(fila => ({ ...fila, id: ++id }))
      const res: any = {}
      res.select = () => ({
        single: async () => ({ data: conIds[0], error: null }),
        then: (f: any) => f({ data: conIds, error: null }),
      })
      res.then = (f: any) => f({ error: null })
      return res
    },
    select: () => ({
      eq: (_c: string, _v: any) => {
        const r = { data: [] as any[], error: null }
        return { ...r, then: (f: any) => f(r) }
      },
    }),
    delete: () => {
      borrados.push(tabla)
      const r = { error: null }
      const enc: any = { in: () => ({ ...r, then: (f: any) => f(r) }), eq: () => ({ ...r, then: (f: any) => f(r) }) }
      return enc
    },
  })
  return { api: { from }, borrados }
}

describe('cuando la base dice que no', () => {
  /* `microciclo.tipo` tiene un CHECK cuya lista NO está en el repo. Lo único
     probado es que «Carga» entra: es lo que inserta /mis-sesiones. */
  it('si el CHECK rechaza el tipo fino, reintenta con el seguro', async () => {
    const escritos: any[] = []
    const { api } = sbConFallos({
      // Un CHECK de verdad rechaza SIEMPRE, no solo la primera vez. Con un doble
      // que falla una sola vez, los bloques siguientes colarían el tipo fino y
      // el test pasaría sin comprobar nada.
      microciclo: filas => {
        if (filas.some(f => f.tipo !== 'Carga')) {
          return { error: { message: 'violates check constraint "microciclo_tipo_check"' } }
        }
        escritos.push(...filas)
        return { error: null }
      },
    })
    const r = await crearTemporada(api as any, { idDeportista: 1, temporada, distancia: 'olimpico', nombre: 'Test' } as any)
    expect(r.error).toBeNull()
    expect(escritos.length).toBeGreaterThan(0)
    expect(escritos.every(f => f.tipo === 'Carga')).toBe(true)
  })

  /* Medio plan creado Y la pantalla diciendo que ya tienes uno es la peor
     combinación: ni sirve ni deja crear otro. */
  it('un fallo a mitad deshace lo que llevaba creado', async () => {
    const { api, borrados } = sbConFallos({
      microciclo: () => ({ error: { message: 'algo se rompió' } }),
    })
    const r = await crearTemporada(api as any, { idDeportista: 1, temporada, distancia: 'olimpico', nombre: 'Test' } as any)
    expect(r.error).toMatch(/algo se rompió/)
    expect(r.idMacrociclo).toBeNull()
    /* Basta con borrar el macrociclo: sus bloques y sus semanas cuelgan de él
       con ON DELETE CASCADE y se van con él. */
    expect(borrados).toEqual(['macrociclo'])
  })
})
