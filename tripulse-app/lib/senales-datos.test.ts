import { describe, it, expect } from 'vitest'
import { todasLasFilas, nochesDelRelojActual, cargarNochesDeVarios, type FilaNoche } from './senales-datos'
import { sumarDias } from './fechas'

// Las noches del reloj para las señales (2026-10-20): una consulta para todo el
// equipo, por páginas, y de cada uno las de su reloj de ahora.

const HOY = '2026-10-20'

const fila = (proveedor: string, fecha: string, tipo: string, datos: object, id_deportista = 7): FilaNoche =>
  ({ id_deportista, tipo, fecha, proveedor, datos })

describe('todasLasFilas — de mil en mil', () => {
  it('pide páginas hasta que una viene corta', async () => {
    const datos = Array.from({ length: 2345 }, (_, i) => i)
    const pedidas: [number, number][] = []
    const filas = await todasLasFilas<number>(async (a, b) => {
      pedidas.push([a, b])
      return { data: datos.slice(a, b + 1), error: null }
    })
    expect(filas).toEqual(datos)
    expect(pedidas).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('con mil justas pide una más, para saber que no hay más', async () => {
    const datos = Array.from({ length: 1000 }, (_, i) => i)
    let veces = 0
    const filas = await todasLasFilas<number>(async (a, b) => { veces++; return { data: datos.slice(a, b + 1), error: null } })
    expect(filas).toHaveLength(1000)
    expect(veces).toBe(2)
  })

  it('si una página falla, se queda con lo que ya tiene', async () => {
    const filas = await todasLasFilas<number>(async a =>
      (a === 0 ? { data: Array(1000).fill(1), error: null } : { data: null, error: { message: 'sin red' } }))
    expect(filas).toHaveLength(1000)
  })
})

describe('nochesDelRelojActual — las de su reloj de ahora', () => {
  it('si cambió de marca, solo las de la marca de la noche más reciente', () => {
    const n = nochesDelRelojActual([
      fila('coros', '2026-10-01', 'recarga', { rmssd_ms: 40 }),
      fila('polar', '2026-10-10', 'recarga', { rmssd_ms: 60 }),
      fila('polar', '2026-10-09', 'sueno', { dormido_min: 420 }),
    ])
    expect(n.map(x => x.fecha)).toEqual(['2026-10-10', '2026-10-09'])
    expect(n[0].hrv).toBe(60)
    expect(n[1].dormidoMin).toBe(420)
  })

  it('sin filas, sin noches', () => {
    expect(nochesDelRelojActual([])).toEqual([])
  })
})

describe('cargarNochesDeVarios — la consulta', () => {
  interface Consulta {
    select(c: string): Consulta
    in(c: string, v: unknown[]): Consulta
    gte(c: string, v: string): Consulta
    lte(c: string, v: string): Consulta
    order(c: string, o?: unknown): Consulta
    range(a: number, b: number): Promise<{ data: FilaNoche[]; error: null }>
  }

  /** Un Supabase de mentira que filtra de verdad y, como el de verdad, no da más de 1000 filas. */
  function doble(filas: FilaNoche[]) {
    const pedido: Record<string, unknown> = { paginas: 0 }
    const sb = {
      from: (tabla: string) => {
        pedido.tabla = tabla
        let sel = [...filas]
        const campo = (f: FilaNoche, c: string) => (f as unknown as Record<string, unknown>)[c]
        const q: Consulta = {
          select: c => { pedido.select = c; return q },
          in: (c, v) => { pedido[c] = v; sel = sel.filter(f => v.includes(campo(f, c))); return q },
          gte: (c, v) => { pedido.desde = v; sel = sel.filter(f => String(campo(f, c)) >= v); return q },
          lte: (c, v) => { pedido.hasta = v; sel = sel.filter(f => String(campo(f, c)) <= v); return q },
          order: () => q,
          range: async (a, b) => {
            pedido.paginas = (pedido.paginas as number) + 1
            return { data: sel.slice(a, Math.min(b + 1, a + 1000)), error: null }
          },
        }
        return q
      },
    }
    return { pedido, sb }
  }

  it('pide el sueño y la recarga de sus cuatro semanas, por páginas, y las reparte por deportista', async () => {
    /* 1.200 filas de una sola deportista: más de lo que Supabase da de una vez. */
    const muchas = Array.from({ length: 1200 }, (_, i) =>
      fila('coros', sumarDias(HOY, -(i % 28)), i % 2 ? 'sueno' : 'recarga', { rmssd_ms: 50, dormido_min: 420 }))
    const { pedido, sb } = doble([
      ...muchas,
      fila('polar', HOY, 'recarga', { rmssd_ms: 60 }, 8),
      fila('polar', HOY, 'entreno', { distancia_m: 10000 }, 8),
      fila('polar', sumarDias(HOY, -40), 'recarga', { rmssd_ms: 90 }, 8),
      fila('polar', HOY, 'recarga', { rmssd_ms: 70 }, 9),
    ])
    const r = await cargarNochesDeVarios(sb, [7, 8], HOY)

    expect(pedido).toMatchObject({
      tabla: 'reloj_medicion', id_deportista: [7, 8], tipo: ['sueno', 'recarga'],
      desde: sumarDias(HOY, -28), hasta: HOY, paginas: 2,
    })
    expect(String(pedido.select)).toContain('datos')
    expect(r.get(7)).toHaveLength(28)
    /* La de hace 40 días y el entreno no entran; la de otro deportista, tampoco. */
    expect(r.get(8)!.map(n => n.hrv)).toEqual([60])
    expect(r.has(9)).toBe(false)
  })

  it('sin deportistas, ni pregunta', async () => {
    const { pedido, sb } = doble([])
    expect((await cargarNochesDeVarios(sb, [], HOY)).size).toBe(0)
    expect(pedido.tabla).toBeUndefined()
  })
})
