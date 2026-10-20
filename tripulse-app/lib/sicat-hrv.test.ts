import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ratiosDelReloj, ratiosDelRelojEntre, fuenteHrvTexto, DIAS_BASE_RELOJ, type FilaRecarga } from './sicat-hrv'
import { NOCHES_MINIMAS_BASE } from './noches-del-reloj'
import { sumarDias } from './fechas'

// La HRV del reloj entra en el SICAT frente a la base DE ESE RELOJ (decidido el
// 20-10-2026): la que trae el reloj (COROS) o la media de sus 4 semanas anteriores.

const noche = (proveedor: string, fecha: string, rmssd: unknown, base?: unknown): FilaRecarga =>
  ({ proveedor, fecha, datos: { rmssd_ms: rmssd, ...(base !== undefined ? { hrv_linea_base_ms: base } : {}) } })

/** `n` noches seguidas de una marca, acabando la víspera de `hasta`. */
const seguidas = (proveedor: string, hasta: string, n: number, rmssd: number) =>
  Array.from({ length: n }, (_, i) => noche(proveedor, sumarDias(hasta, -(n - i)), rmssd))

describe('ratiosDelReloj — la base del propio reloj', () => {
  it('con COROS manda su base, desde la primera noche', () => {
    expect(ratiosDelReloj([noche('coros', '2026-10-10', 44, 50)])).toEqual({ '2026-10-10': 0.88 })
  })

  it('sin base del reloj (Polar), la media de sus noches anteriores, con al menos 14', () => {
    const previas = seguidas('polar', '2026-10-15', NOCHES_MINIMAS_BASE, 60)
    const r = ratiosDelReloj([...previas, noche('polar', '2026-10-15', 54)])
    expect(r['2026-10-15']).toBeCloseTo(0.9, 10)
    /* Las primeras no tienen base todavía: no salen. */
    expect(Object.keys(r)).toEqual(['2026-10-15'])
  })

  it('con una noche menos de las necesarias, ese día no cuenta', () => {
    const previas = seguidas('polar', '2026-10-15', NOCHES_MINIMAS_BASE - 1, 60)
    expect(ratiosDelReloj([...previas, noche('polar', '2026-10-15', 54)])).toEqual({})
  })

  it('la base son las 4 semanas de antes: lo más viejo no entra, y la noche del día tampoco', () => {
    const viejas = seguidas('polar', sumarDias('2026-10-15', -DIAS_BASE_RELOJ), 10, 200)
    const recientes = seguidas('polar', '2026-10-15', NOCHES_MINIMAS_BASE, 60)
    const r = ratiosDelReloj([...viejas, ...recientes, noche('polar', '2026-10-15', 30)])
    /* Si entraran las viejas (200) o la del día (30), la base no sería 60. */
    expect(r['2026-10-15']).toBeCloseTo(0.5, 10)
  })

  it('una noche de COROS sin su base cae a la media de sus noches, como Polar', () => {
    const previas = seguidas('coros', '2026-10-15', NOCHES_MINIMAS_BASE, 50).map(f => ({ ...f, datos: { ...(f.datos as object), hrv_linea_base_ms: 50 } }))
    const r = ratiosDelReloj([...previas, noche('coros', '2026-10-15', 40, null)])
    expect(r['2026-10-15']).toBeCloseTo(0.8, 10)
  })

  it('las marcas no se mezclan: la base de Polar no lleva noches de COROS', () => {
    const polar = seguidas('polar', '2026-10-15', NOCHES_MINIMAS_BASE, 60)
    const coros = seguidas('coros', '2026-10-15', NOCHES_MINIMAS_BASE, 30)
    const r = ratiosDelReloj([...polar, ...coros, noche('polar', '2026-10-15', 54)])
    expect(r['2026-10-15']).toBeCloseTo(0.9, 10)
  })

  it('el día que hay noche de dos marcas, la media de las dos, cada una frente a la suya', () => {
    const r = ratiosDelReloj([noche('coros', '2026-10-10', 40, 50), noche('polar', '2026-10-10', 30, 30)])
    expect(r['2026-10-10']).toBeCloseTo(0.9, 10)
  })

  it('lo que no es una noche con HRV no cuenta', () => {
    expect(ratiosDelReloj([
      noche('coros', '2026-10-10', null, 50),
      noche('coros', '2026-10-11', 0, 50),
      noche('coros', '2026-10-12', -3, 50),
      noche('coros', '2026-10-13', 'abc', 50),
      { proveedor: null, fecha: '2026-10-14', datos: { rmssd_ms: 40, hrv_linea_base_ms: 50 } },
      { proveedor: 'coros', fecha: null, datos: { rmssd_ms: 40, hrv_linea_base_ms: 50 } },
      { proveedor: 'coros', fecha: '2026-10-15', datos: null },
      noche('coros', '2026-10-16', 40, 0),
    ])).toEqual({})
    expect(ratiosDelReloj(null)).toEqual({})
  })

  it('los números que llegan como texto se leen, y la fecha con hora se corta al día', () => {
    expect(ratiosDelReloj([{ proveedor: 'coros', fecha: '2026-10-10T00:00:00', datos: { rmssd_ms: '45', hrv_linea_base_ms: '50' } }]))
      .toEqual({ '2026-10-10': 0.9 })
  })
})

describe('ratiosDelRelojEntre — la consulta', () => {
  interface Consulta {
    select(c: string): Consulta
    eq(c: string, v: unknown): Consulta
    gte(c: string, v: unknown): Consulta
    lte(c: string, v: unknown): Consulta
    order(c: string, o: unknown): Consulta
    then(resolve: (r: { data: FilaRecarga[] | null; error: { message: string } | null }) => unknown): unknown
  }
  function doble(filas: FilaRecarga[] | null) {
    const pedido: Record<string, unknown> = {}
    const q: Consulta = {
      select: c => { pedido.select = c; return q },
      eq: (c, v) => { pedido[c] = v; return q },
      gte: (_c, v) => { pedido.desde = v; return q },
      lte: (_c, v) => { pedido.hasta = v; return q },
      order: (c, o) => { pedido.orden = [c, o]; return q },
      then: resolve => resolve({ data: filas, error: filas ? null : { message: 'sin permiso' } }),
    }
    return { pedido, sb: { from: (t: string) => { pedido.tabla = t; return q } } as unknown as SupabaseClient }
  }

  it('pide las recargas del deportista, con las 4 semanas de antes para la base, lo más nuevo primero', async () => {
    const { pedido, sb } = doble([noche('coros', '2026-10-10', 44, 50)])
    expect(await ratiosDelRelojEntre(sb, 7, '2026-10-01', '2026-10-12')).toEqual({ '2026-10-10': 0.88 })
    expect(pedido).toMatchObject({
      tabla: 'reloj_medicion', id_deportista: 7, tipo: 'recarga',
      desde: sumarDias('2026-10-01', -DIAS_BASE_RELOJ), hasta: '2026-10-12',
      orden: ['fecha', { ascending: false }],
    })
    expect(String(pedido.select)).toContain('datos')
  })

  it('si no puede leer su reloj, sale vacío: el SICAT sigue con la de la mañana', async () => {
    expect(await ratiosDelRelojEntre(doble(null).sb, 7, '2026-10-01', '2026-10-12')).toEqual({})
  })
})

describe('fuenteHrvTexto — de dónde sale la HRV', () => {
  it('cada caso dice lo suyo', () => {
    expect(fuenteHrvTexto(0, 0)).toBe('Sin HRV: corrector neutro')
    expect(fuenteHrvTexto(8, 0)).toBe('HRV de 8 sesiones, de la mañana')
    expect(fuenteHrvTexto(0, 6)).toBe('HRV de 6 sesiones, del reloj')
    expect(fuenteHrvTexto(2, 6)).toBe('HRV de 8 sesiones: 6 del reloj, 2 de la mañana')
    expect(fuenteHrvTexto(1, 0)).toBe('HRV de 1 sesión, de la mañana')
  })
})
