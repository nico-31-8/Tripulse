import { describe, it, expect, vi, beforeEach } from 'vitest'

// El SICAT entero con un doble de Supabase que filtra de verdad: comprueba que la
// HRV del reloj llega a sus dos sitios y con su día (decidido el 20-10-2026):
//   · el corrector de cada deporte, con la noche que acaba la mañana de la sesión;
//   · el coste por zona, con la noche siguiente.
type Fila = Record<string, unknown>
interface Consulta {
  select(): Consulta
  eq(c: string, v: unknown): Consulta
  in(c: string, vs: unknown[]): Consulta
  gte(c: string, v: string): Consulta
  lte(c: string, v: string): Consulta
  or(): Consulta
  order(): Consulta
  then(resolve: (r: { data: Fila[]; error: null }) => unknown): unknown
}
const doble = vi.hoisted(() => {
  const tablas: Record<string, Fila[]> = {}
  const from = (tabla: string) => {
    let filas = [...(tablas[tabla] ?? [])]
    const q: Consulta = {
      select: () => q,
      eq: (c, v) => { filas = filas.filter(f => f[c] === v); return q },
      in: (c, vs) => { filas = filas.filter(f => vs.includes(f[c])); return q },
      gte: (c, v) => { filas = filas.filter(f => String(f[c]) >= v); return q },
      lte: (c, v) => { filas = filas.filter(f => String(f[c]) <= v); return q },
      or: () => { filas = filas.filter(f => !f.eliminada); return q },
      order: () => q,
      then: resolve => resolve({ data: filas, error: null }),
    }
    return q
  }
  return { tablas, supabase: { from } }
})
vi.mock('./supabase', () => ({ supabase: doble.supabase }))

import { calcularSICAT } from './sicat'
import { calcularSicatZonas } from './sicat-zonas'

const DEP = { id: 7, hrv_basal: null, fc_maxima: 190, tec_carrera: 3 }
const recarga = (fecha: string, rmssd: number, base: number) =>
  ({ id_deportista: 7, proveedor: 'coros', tipo: 'recarga', fecha, datos: { rmssd_ms: rmssd, hrv_linea_base_ms: base } })

beforeEach(() => {
  doble.tablas.sesion = [{ id: 1, disciplina: 'Carrera', estado: 'Realizada', id_deportista: 7, fecha_sesion: '2026-10-10', rpe_reportado: 6 }]
  doble.tablas.tarea = [{
    id_sesion: 1, disciplina: 'Carrera', orden: 1, zona_entrenamiento: 'AEM',
    rpe_reportado: 6, fc_media: 150, sensacion_tecnica: 3, dolor_muscular: 2, hrv_del_dia: null,
  }]
  doble.tablas.wellness = []
  /* La noche del día de la sesión al 88 % de su base; la siguiente, al 85 %. */
  doble.tablas.reloj_medicion = [recarga('2026-10-10', 44, 50), recarga('2026-10-11', 42.5, 50)]
})

describe('el corrector de cada deporte, con la noche del día de la sesión', () => {
  it('sin HRV de la mañana ni basal, cuenta la del reloj', async () => {
    const r = await calcularSICAT(DEP)
    expect(r.Carrera.corrector).toBeCloseTo(1 + 0.12 * 0.3, 10)
    expect(r.Carrera).toMatchObject({ hrvManana: 0, hrvReloj: 1 })
  })

  it('la de la mañana manda si se midió', async () => {
    doble.tablas.wellness = [{ id_deportista: 7, fecha: '2026-10-10', hrv: 58, dolor_muscular: null }]
    const r = await calcularSICAT({ ...DEP, hrv_basal: 62 })
    expect(r.Carrera.corrector).toBeCloseTo(1 + (1 - 58 / 62) * 0.3, 10)
    expect(r.Carrera).toMatchObject({ hrvManana: 1, hrvReloj: 0 })
  })

  it('sin reloj, el corrector de siempre: neutro sin HRV', async () => {
    doble.tablas.reloj_medicion = []
    const r = await calcularSICAT(DEP)
    expect(r.Carrera).toMatchObject({ corrector: 1, hrvManana: 0, hrvReloj: 0 })
  })

  it('la noche de otro deportista no cuenta', async () => {
    doble.tablas.reloj_medicion = doble.tablas.reloj_medicion.map(f => ({ ...f, id_deportista: 8 }))
    expect((await calcularSICAT(DEP)).Carrera.corrector).toBe(1)
  })
})

describe('el coste por zona, con la noche siguiente', () => {
  it('la caída del reloj de esa noche pesa como la de la mañana', async () => {
    /* RPE 6 (0,6 × 0,25) y la noche siguiente al 85 % (caída del 15 % = 1 × 0,35). */
    const r = await calcularSicatZonas(DEP)
    expect(r.celdas[0].costeMedio).toBe(Math.round((0.35 + 0.6 * 0.25) / 0.6 * 1000) / 10)
  })

  it('sin la noche siguiente, solo el RPE, como antes', async () => {
    doble.tablas.reloj_medicion = [recarga('2026-10-10', 44, 50)]
    expect((await calcularSicatZonas(DEP)).celdas[0].costeMedio).toBe(60)
  })

  it('la de la mañana siguiente manda si se midió', async () => {
    doble.tablas.wellness = [{ id_deportista: 7, fecha: '2026-10-11', hrv: 60, dolor_muscular: null }]
    const r = await calcularSicatZonas({ ...DEP, hrv_basal: 60 })
    expect(r.celdas[0].costeMedio).toBe(25)
  })
})
