import { describe, it, expect } from 'vitest'
import {
  hrvDeNochesCoros, medicionesDeCoros, medicionesDeSuenoCoros, minutosDeTexto, reposoPorDiaCoros, tramosDeDias,
} from './coros'

/* Los textos tienen la FORMA exacta que devolvió COROS el 17-10-2026 (la
   primera cuenta real); los números están cambiados. */

const SUENO = `Sleep Overview
========================
Note: each record below is dated by its wake-up day.

2026-10-11
Sleep Score: 80
Daily Sleep: 8h 10min (incl. naps)
Main Sleep (asleep): 8h 10min
Main Sleep Period (incl. awake): 8h 30min
Sleep metrics scope: daily
Deep Sleep Ratio: 15%
Light Sleep Ratio: 55%
REM Ratio: 26%
Awake Ratio: 4%
Awake Time: 20 min
Awake Count (>5 min): 1
Main Sleep Window: 2026-10-11 00:40 - 2026-10-11 09:10
Naps Total: 0 min

2026-10-12
Sleep Score: 90
Daily Sleep: 9h 40min (incl. naps)
Main Sleep (asleep): 9h 10min
Main Sleep Period (incl. awake): 9h 25min
Sleep metrics scope: daily
Deep Sleep Ratio: 14%
Light Sleep Ratio: 60%
REM Ratio: 23%
Awake Ratio: 3%
Awake Time: 15 min
Awake Count (>5 min): 0
Main Sleep Window: 2026-10-11 23:50 - 2026-10-12 09:15
Naps Total (asleep): 30 min
Naps Period (incl. awake): 32 min
Nap Window: 2026-10-12 12:40 - 2026-10-12 13:12

2026-10-13
Sleep Score: 0
Sleep detail for this day is not available yet.`

const HRV = `Sleep HRV — 2026-10-11 to 2026-10-13
========================
Note: dates are wake-up days (each value comes from the night that ended that morning).

HRV Assessment — Last 7 days
========================

2026-10-12:
  HRV Avg: 45 ms — Below normal
  Normal Range: 50 - 62 ms
  Baseline: 56 ms
2026-10-11:
  HRV Avg: 60 ms — Normal
  Normal Range: 50 - 62 ms
  Baseline: 55 ms

Sleep HRV Time Series — Last 7 days
========================

2026-10-11:
  timestamp=1791669890, timezone=8, hrv=52 ms, status=4, confidence=100000
  timestamp=1791671390, timezone=8, hrv=99 ms, status=4, confidence=100000
2026-10-12:
  timestamp=1791769890, timezone=8, hrv=31 ms, status=4, confidence=100000
2026-10-13: no official sleep HRV value for this day; raw HRV points omitted.`

const REPOSO = `Resting Heart Rate — Last 7 days
========================

2026-10-13: No data
2026-10-12: 61 bpm
2026-10-11: 55 bpm`

describe('leer el texto de COROS', () => {
  it('las duraciones, con o sin paréntesis detrás', () => {
    expect(minutosDeTexto('8h 10min')).toBe(490)
    expect(minutosDeTexto('9h 40min (incl. naps)')).toBe(580)
    expect(minutosDeTexto('20 min')).toBe(20)
    expect(minutosDeTexto('7h')).toBe(420)
    expect(minutosDeTexto('0 min')).toBe(0)
    expect(minutosDeTexto('mucho')).toBeNull()
    expect(minutosDeTexto('')).toBeNull()
    expect(minutosDeTexto(undefined)).toBeNull()
  })

  it('las noches: el sueño principal sin siestas, las fases en porcentaje, y sin el día sin detalle', () => {
    const n = medicionesDeSuenoCoros(SUENO)
    expect(n.map(x => x.fecha)).toEqual(['2026-10-11', '2026-10-12'])
    expect(n[0]).toEqual({
      tipo: 'sueno', fecha: '2026-10-11', id_externo: '2026-10-11',
      datos: {
        inicio: '2026-10-11T00:40', fin: '2026-10-11T09:10', dormido_min: 490, en_cama_min: 510,
        interrupciones_min: 20, despertares: 1, profundo_pct: 15, ligero_pct: 55, rem_pct: 26, siesta_min: 0, puntuacion: 80,
      },
    })
    /* La siesta no cuenta en el sueño de la noche, y la noche que empieza el día antes es de la fecha de despertarse. */
    expect(n[1].datos).toMatchObject({ dormido_min: 550, siesta_min: 30, inicio: '2026-10-11T23:50', fin: '2026-10-12T09:15' })
  })

  it('la HRV: solo la valoración oficial, nunca la serie de puntos', () => {
    expect(hrvDeNochesCoros(HRV)).toEqual({
      '2026-10-12': { hrv_ms: 45, estado: 'por_debajo', rango_min: 50, rango_max: 62, linea_base_ms: 56 },
      '2026-10-11': { hrv_ms: 60, estado: 'normal', rango_min: 50, rango_max: 62, linea_base_ms: 55 },
    })
    expect(hrvDeNochesCoros('Sleep HRV\nsin valoración')).toEqual({})
    expect(hrvDeNochesCoros(HRV.replace('Below normal', 'Above normal'))['2026-10-12'].estado).toBe('por_encima')
  })

  it('la FC en reposo, sin los días sin dato', () => {
    expect(reposoPorDiaCoros(REPOSO)).toEqual({ '2026-10-12': 61, '2026-10-11': 55 })
  })

  it('todo junto: una noche y una recarga por día, la FC con su nombre', () => {
    const m = medicionesDeCoros({ sueno: SUENO, hrv: [HRV], reposo: REPOSO })
    expect(m.filter(x => x.tipo === 'sueno')).toHaveLength(2)
    const recargas = m.filter(x => x.tipo === 'recarga')
    expect(recargas.map(x => x.fecha)).toEqual(['2026-10-11', '2026-10-12'])
    expect(recargas[1].datos).toEqual({
      rmssd_ms: 45, hrv_estado: 'por_debajo', hrv_rango_min: 50, hrv_rango_max: 62, hrv_linea_base_ms: 56, fc_reposo: 61,
    })
    expect('fc_media' in recargas[1].datos).toBe(false)
  })

  it('un día con FC en reposo y sin HRV también da recarga; sin nada, no hay mediciones', () => {
    const m = medicionesDeCoros({ reposo: '2026-10-20: 58 bpm' })
    expect(m).toEqual([{ tipo: 'recarga', fecha: '2026-10-20', id_externo: '2026-10-20', datos: {
      rmssd_ms: null, hrv_estado: null, hrv_rango_min: null, hrv_rango_max: null, hrv_linea_base_ms: null, fc_reposo: 58,
    } }])
    expect(medicionesDeCoros({})).toEqual([])
    expect(medicionesDeCoros({ sueno: 'No sleep records found.', hrv: [null], reposo: null })).toEqual([])
  })

  it('varias tandas de HRV se juntan', () => {
    const otra = HRV.replace(/2026-10-12/g, '2026-10-05').replace(/2026-10-11/g, '2026-10-04')
    const m = medicionesDeCoros({ hrv: [otra, HRV] }).map(x => x.fecha)
    expect(m).toEqual(['2026-10-04', '2026-10-05', '2026-10-11', '2026-10-12'])
  })
})

describe('las semanas de atrás, de siete en siete', () => {
  it('cuatro semanas son cuatro tandas, la última pegada a hoy', () => {
    expect(tramosDeDias('2026-09-20', '2026-10-17')).toEqual([
      { desde: '2026-09-20', hasta: '2026-09-26' }, { desde: '2026-09-27', hasta: '2026-10-03' },
      { desde: '2026-10-04', hasta: '2026-10-10' }, { desde: '2026-10-11', hasta: '2026-10-17' },
    ])
  })
  it('un rango que no es múltiplo de siete deja corta la primera', () => {
    expect(tramosDeDias('2026-10-08', '2026-10-17')).toEqual([
      { desde: '2026-10-08', hasta: '2026-10-10' }, { desde: '2026-10-11', hasta: '2026-10-17' },
    ])
    expect(tramosDeDias('2026-10-17', '2026-10-17')).toEqual([{ desde: '2026-10-17', hasta: '2026-10-17' }])
  })
})
