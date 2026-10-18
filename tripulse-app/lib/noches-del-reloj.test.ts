import { describe, it, expect } from 'vitest'
import { nochesDeMediciones, resumenDeNoches, RECARGA_POLAR, NOCHES_MINIMAS_BASE, type NocheDelReloj } from './noches-del-reloj'

const HOY = '2026-10-18'
const restar = (n: number) => { const d = new Date(HOY + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }

describe('las noches de cada marca, juntas', () => {
  it('COROS: el sueño y la recarga del mismo día en una noche, con lo suyo', () => {
    const [n] = nochesDeMediciones([
      { tipo: 'sueno', fecha: '2026-10-16', proveedor: 'coros', datos: { inicio: '2026-10-15T23:42', fin: '2026-10-16T07:51', dormido_min: 466, en_cama_min: 489, interrupciones_min: 23, despertares: 2, profundo_pct: 19, ligero_pct: 58, rem_pct: 23, siesta_min: 0, puntuacion: 81 } },
      { tipo: 'recarga', fecha: '2026-10-16', proveedor: 'coros', datos: { rmssd_ms: 43, hrv_estado: 'normal', hrv_rango_min: 38, hrv_rango_max: 47, hrv_linea_base_ms: 42, fc_reposo: 52 } },
    ], 'coros')
    expect(n).toMatchObject({
      fecha: '2026-10-16', dormidoMin: 466, puntuacion: 81, fases: { profundo: 19, ligero: 58, rem: 23 },
      despertares: 2, siestaMin: 0, enCamaMin: 489, hrv: 43, hrvEstado: 'normal', hrvRango: [38, 47], hrvLineaBase: 42,
      fc: 52, fcTipo: 'reposo', respiracion: null, recarga: null,
    })
  })

  it('Polar: las fases de minutos a %, la FC media de la noche, la respiración y la recarga', () => {
    const [n] = nochesDeMediciones([
      { tipo: 'sueno', fecha: '2026-10-16', proveedor: 'polar', datos: { dormido_min: 450, profundo_min: 90, rem_min: 99, interrupciones_min: 30, puntuacion: 77 } },
      { tipo: 'recarga', fecha: '2026-10-16', proveedor: 'polar', datos: { rmssd_ms: 51, fc_media: 55, respiracion: 14.6, estado_recarga: 5 } },
    ], 'polar')
    expect(n).toMatchObject({ fases: { profundo: 20, ligero: 58, rem: 22 }, profundoMin: 90, remMin: 99, fc: 55, fcTipo: 'media', respiracion: 14.6, recarga: 5, despertares: null })
    expect(RECARGA_POLAR[5]).toBe('buena')
  })

  it('las de otra marca (un reloj de antes) no cuentan, y van de la más reciente a la más antigua', () => {
    const r = nochesDeMediciones([
      { tipo: 'sueno', fecha: '2026-10-10', proveedor: 'coros', datos: { dormido_min: 400 } },
      { tipo: 'sueno', fecha: '2026-10-12', proveedor: 'coros', datos: { dormido_min: 410 } },
      { tipo: 'sueno', fecha: '2026-10-11', proveedor: 'polar', datos: { dormido_min: 420 } },
      { tipo: 'entreno', fecha: '2026-10-12', proveedor: 'coros', datos: {} },
    ], 'coros')
    expect(r.map(n => n.fecha)).toEqual(['2026-10-12', '2026-10-10'])
  })

  it('una puntuación de 0 es que no la hay, no un cero', () => {
    const [n] = nochesDeMediciones([{ tipo: 'sueno', fecha: '2026-10-16', proveedor: 'coros', datos: { dormido_min: 400, puntuacion: 0 } }], 'coros')
    expect(n.puntuacion).toBeNull()
  })
})

/* Noches inventadas: `base` las 3 semanas anteriores y `recientes` la última. */
function noches(o: { base: Partial<NocheDelReloj>; recientes: Partial<NocheDelReloj>; nochesBase?: number }): NocheDelReloj[] {
  const vacia = (fecha: string): NocheDelReloj => ({
    fecha, dormidoMin: null, puntuacion: null, fases: null, despertares: null, interrupcionesMin: null, siestaMin: null,
    enCamaMin: null, inicio: null, fin: null, hrv: null, hrvEstado: null, hrvRango: null, hrvLineaBase: null,
    fc: null, fcTipo: null, respiracion: null, recarga: null, profundoMin: null, remMin: null,
  })
  const out: NocheDelReloj[] = []
  for (let i = 0; i < 7; i++) out.push({ ...vacia(restar(i)), ...o.recientes })
  for (let i = 0; i < (o.nochesBase ?? 21); i++) {
    /* Un poco de variación de una noche a otra, como en la vida real. */
    const v = i % 2 ? 1 : -1
    const b = { ...o.base } as Partial<NocheDelReloj>
    if (b.dormidoMin != null) b.dormidoMin += 5 * v
    if (b.hrv != null) b.hrv += v
    if (b.fc != null) b.fc += v * 0.5
    out.push({ ...vacia(restar(7 + i)), ...b })
  }
  return out
}

describe('su semana frente a lo suyo', () => {
  it('dentro de lo suyo cuando no se aleja más que su variación ni que el mínimo', () => {
    const r = resumenDeNoches(noches({ base: { dormidoMin: 440, hrv: 45, fc: 52 }, recientes: { dormidoMin: 425, hrv: 44, fc: 53 } }), HOY)
    expect(r.sueno.estado).toBe('dentro')
    expect(r.hrv.estado).toBe('dentro')
    expect(r.fc.estado).toBe('dentro')
  })

  it('duerme menos, HRV más baja y FC más alta: las tres «peor»', () => {
    const r = resumenDeNoches(noches({ base: { dormidoMin: 440, hrv: 45, fc: 52 }, recientes: { dormidoMin: 380, hrv: 38, fc: 56 } }), HOY)
    expect(r.sueno).toMatchObject({ estado: 'peor', reciente: 380 })
    expect(r.hrv.estado).toBe('peor')
    expect(r.fc.estado).toBe('peor')
  })

  it('al revés, «mejor»: más sueño, más HRV y menos FC', () => {
    const r = resumenDeNoches(noches({ base: { dormidoMin: 400, hrv: 40, fc: 55 }, recientes: { dormidoMin: 470, hrv: 48, fc: 51 } }), HOY)
    expect([r.sueno.estado, r.hrv.estado, r.fc.estado]).toEqual(['mejor', 'mejor', 'mejor'])
  })

  it('el mínimo manda aunque su variación sea muy pequeña: 20 minutos menos de sueño no es «peor»', () => {
    const r = resumenDeNoches(noches({ base: { dormidoMin: 440 }, recientes: { dormidoMin: 420 } }), HOY)
    expect(r.sueno.margen).toBe(30)
    expect(r.sueno.estado).toBe('dentro')
  })

  it('con menos de 3 semanas de noches, «Aún sin base»; sin noches recientes, sin datos', () => {
    const corta = noches({ base: { dormidoMin: 440 }, recientes: { dormidoMin: 380 }, nochesBase: NOCHES_MINIMAS_BASE - 1 })
    expect(resumenDeNoches(corta, HOY).sueno.estado).toBe('sinBase')
    const sinRecientes = noches({ base: { dormidoMin: 440 }, recientes: { dormidoMin: null } })
    expect(resumenDeNoches(sinRecientes, HOY).sueno.estado).toBe('sinDatos')
  })

  it('con COROS, la HRV se mide contra el rango normal de COROS, aunque falte base', () => {
    const r = resumenDeNoches(noches({ base: {}, recientes: { hrv: 36, hrvRango: [38, 47] }, nochesBase: 0 }), HOY)
    expect(r.hrv).toMatchObject({ estado: 'peor', rango: [38, 47], reciente: 36 })
  })
})
