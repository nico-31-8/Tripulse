import { describe, it, expect } from 'vitest'
import { baseEnMemoria } from './base-en-memoria'
import {
  leerAnamnesis, leerAnamnesisDeVarios, vigentePorDeportista, guardarAnamnesis, guardadorDeAnamnesis,
} from './anamnesis-vigente'

/* Las de la deportista 20 en el orden en que la base quiera devolverlas: el
   lector no puede fiarse de ese orden. */
const CINCO = [
  { id: 12, id_deportista: 20, estado: 'enviada', volumen_semanal: 'Menos de 5h' },
  { id: 10, id_deportista: 20, estado: 'borrador', volumen_semanal: null },
  { id: 14, id_deportista: 20, estado: 'borrador', volumen_semanal: '5–8h' },
  { id: 11, id_deportista: 20, estado: 'borrador', volumen_semanal: 'Menos de 5h' },
  { id: 13, id_deportista: 20, estado: 'borrador', volumen_semanal: '5–8h' },
]
const filasDe = (base: ReturnType<typeof baseEnMemoria>, dep: number) =>
  base.tablas.anamnesis.filter(f => f.id_deportista === dep)
const cuantas = (base: ReturnType<typeof baseEnMemoria>, op: string) =>
  base.peticiones.filter(p => p.tabla === 'anamnesis' && p.op === op).length

describe('leer: la anamnesis vigente es la más reciente', () => {
  it('con cinco filas da una, la de id más alto, no ninguna', async () => {
    const { data, error } = await leerAnamnesis(baseEnMemoria({ anamnesis: CINCO }), 20)
    expect(error).toBeNull()
    expect(data?.id).toBe(14)
    expect(data?.volumen_semanal).toBe('5–8h')
  })

  it('pide solo las columnas que se le dicen', async () => {
    const { data } = await leerAnamnesis(baseEnMemoria({ anamnesis: CINCO }), 20, 'volumen_semanal')
    expect(data).toEqual({ volumen_semanal: '5–8h' })
  })

  it('solo mira a ese deportista', async () => {
    const base = baseEnMemoria({ anamnesis: [...CINCO, { id: 99, id_deportista: 21, volumen_semanal: '8–12h' }] })
    expect((await leerAnamnesis(base, 20)).data?.id).toBe(14)
  })

  it('sin anamnesis: null y sin error', async () => {
    expect(await leerAnamnesis(baseEnMemoria({ anamnesis: [] }), 20)).toEqual({ data: null, error: null })
  })

  it('si la base falla lo dice: no es lo mismo que no tener', async () => {
    const base = baseEnMemoria({ anamnesis: CINCO })
    base.falla('anamnesis', 'select', { message: 'sin red' })
    const r = await leerAnamnesis(base, 20)
    expect(r.data).toBeNull()
    expect(r.error?.message).toBe('sin red')
  })
})

describe('leer de varios: la vigente de cada uno', () => {
  it('se queda con el id más alto de cada deportista, en cualquier orden', () => {
    const m = vigentePorDeportista([CINCO[2], { id: 3, id_deportista: 15 }, CINCO[1], CINCO[0]])
    expect(m.get(20)?.id).toBe(14)
    expect(m.get(15)?.id).toBe(3)
    expect(vigentePorDeportista(null).size).toBe(0)
  })

  it('trae las columnas pedidas y las que hacen falta para elegir', async () => {
    const base = baseEnMemoria({ anamnesis: [...CINCO, { id: 3, id_deportista: 15, volumen_semanal: '8–12h' }] })
    const m = await leerAnamnesisDeVarios(base, [20, 15], 'volumen_semanal')
    expect(m.get(20)).toEqual({ id: 14, id_deportista: 20, volumen_semanal: '5–8h' })
    expect(m.get(15)?.volumen_semanal).toBe('8–12h')
  })
})

describe('guardar: se actualiza la que hay, no se crea otra', () => {
  it('con una fila, la actualiza', async () => {
    const base = baseEnMemoria({ anamnesis: [{ id: 3, id_deportista: 20, estado: 'enviada', dias_semana: '1–2 días' }] })
    const r = await guardarAnamnesis(base, 20, { dias_semana: '3–4 días' })
    expect(r).toEqual({ id: 3, error: null })
    expect(base.tablas.anamnesis).toEqual([{ id: 3, id_deportista: 20, estado: 'enviada', dias_semana: '3–4 días' }])
    expect(cuantas(base, 'insert')).toBe(0)
  })

  it('con varias, escribe en la vigente y deja las demás como estaban', async () => {
    const base = baseEnMemoria({ anamnesis: CINCO })
    const r = await guardarAnamnesis(base, 20, { volumen_semanal: '8–12h' })
    expect(r.id).toBe(14)
    expect(filasDe(base, 20)).toHaveLength(5)
    expect(filasDe(base, 20).find(f => f.id === 14)?.volumen_semanal).toBe('8–12h')
    expect(filasDe(base, 20).find(f => f.id === 13)?.volumen_semanal).toBe('5–8h')
  })

  it('solo sin ninguna crea una, con lo de alCrear, y lo que se guarda manda', async () => {
    const base = baseEnMemoria({ anamnesis: [] })
    const r = await guardarAnamnesis(base, 20, { dias_semana: '3–4 días' }, { alCrear: { estado: 'borrador' } })
    expect(r.error).toBeNull()
    expect(filasDe(base, 20)).toEqual([{ id: r.id, id_deportista: 20, estado: 'borrador', dias_semana: '3–4 días' }])

    const otra = baseEnMemoria({ anamnesis: [] })
    await guardarAnamnesis(otra, 20, { estado: 'enviada' }, { alCrear: { estado: 'borrador' } })
    expect(filasDe(otra, 20)[0].estado).toBe('enviada')
  })

  it('si no se puede saber si hay, NO inserta: un error no es «no hay fila»', async () => {
    // Exactamente el fallo: el error de leer se tomaba por «no tiene» y se creaba otra.
    const base = baseEnMemoria({ anamnesis: CINCO })
    base.falla('anamnesis', 'select', { message: 'sin red' })
    const r = await guardarAnamnesis(base, 20, { volumen_semanal: '8–12h' }, { alCrear: { estado: 'borrador' } })
    expect(r.error).toBe('sin red')
    expect(cuantas(base, 'insert')).toBe(0)
    expect(filasDe(base, 20)).toHaveLength(5)
  })

  it('con el id que cargó la pantalla, escribe en esa fila', async () => {
    const base = baseEnMemoria({ anamnesis: CINCO })
    const r = await guardarAnamnesis(base, 20, { volumen_semanal: '8–12h' }, { id: 14 })
    expect(r).toEqual({ id: 14, error: null })
    expect(cuantas(base, 'select')).toBe(0)
  })

  it('si la fila que cargó ya no está, no escribe en otra: avisa', async () => {
    /* La pantalla tiene en el formulario lo de ESA fila. Escribirlo en otra
       (la que quedó tras limpiar las repetidas) la pisaría entera. */
    const base = baseEnMemoria({ anamnesis: [{ id: 12, id_deportista: 20, estado: 'enviada', peso: 58 }] })
    const r = await guardarAnamnesis(base, 20, { peso: null, volumen_semanal: '5–8h' }, { id: 14 })
    expect(r.error).toMatch(/recarga/i)
    expect(base.tablas.anamnesis).toEqual([{ id: 12, id_deportista: 20, estado: 'enviada', peso: 58 }])
    expect(cuantas(base, 'insert')).toBe(0)
  })

  it('un id de otro deportista no se toca', async () => {
    const base = baseEnMemoria({ anamnesis: [{ id: 5, id_deportista: 21, peso: 70 }] })
    const r = await guardarAnamnesis(base, 20, { peso: 1 }, { id: 5 })
    expect(r.error).not.toBeNull()
    expect(base.tablas.anamnesis[0].peso).toBe(70)
  })

  it('si la base rechaza el guardado, lo dice', async () => {
    const base = baseEnMemoria({ anamnesis: CINCO })
    base.falla('anamnesis', 'update', { message: 'permiso denegado' })
    expect((await guardarAnamnesis(base, 20, { peso: 60 })).error).toBe('permiso denegado')
  })
})

describe('el guardador de una pantalla que guarda sola', () => {
  it('dos guardados a la vez dejan UNA fila, con lo último', async () => {
    // Sin cola, los dos preguntan «¿hay fila?» antes de que el primero la cree,
    // los dos oyen que no y los dos insertan: las filas 10 y 11.
    const base = baseEnMemoria({ anamnesis: [] })
    const g = guardadorDeAnamnesis(base, 20)
    const [a, b] = await Promise.all([
      g.guardar({ nombre_completo: 'Ana' }, { estado: 'borrador' }),
      g.guardar({ nombre_completo: 'Ana Pérez' }, { estado: 'borrador' }),
    ])
    expect(filasDe(base, 20)).toHaveLength(1)
    expect(filasDe(base, 20)[0].nombre_completo).toBe('Ana Pérez')
    expect(a.id).toBe(b.id)
    expect(g.id).toBe(a.id)
  })

  it('arranca con la fila que cargó la pantalla', async () => {
    const base = baseEnMemoria({ anamnesis: CINCO })
    const g = guardadorDeAnamnesis(base, 20, 14)
    await g.guardar({ peso: 60 })
    expect(filasDe(base, 20).find(f => f.id === 14)?.peso).toBe(60)
    expect(cuantas(base, 'select')).toBe(0)
  })

  it('un guardado que falla no atasca a los siguientes', async () => {
    const base = baseEnMemoria({ anamnesis: [] })
    const g = guardadorDeAnamnesis(base, 20)
    base.falla('anamnesis', 'insert', { message: 'sin red' })
    const primero = g.guardar({ peso: 60 }, { estado: 'borrador' })
    expect((await primero).error).toBe('sin red')
    base.falla('anamnesis', 'insert', null)
    const segundo = await g.guardar({ peso: 61 }, { estado: 'borrador' })
    expect(segundo.error).toBeNull()
    expect(filasDe(base, 20)).toEqual([{ id: segundo.id, id_deportista: 20, estado: 'borrador', peso: 61 }])
  })
})
