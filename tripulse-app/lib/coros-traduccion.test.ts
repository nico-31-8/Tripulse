import { describe, it, expect } from 'vitest'
import {
  hrvDeNochesCoros, medicionesDeCoros, medicionesDeSuenoCoros, minutosDeTexto, reposoPorDiaCoros, tramosDeDias,
  entrenosDeCoros, disciplinaDeCoros, sinUbicacionCoros, minutosDeDuracionCoros, metrosDeTexto,
} from './coros'
import { actividadesDeMediciones } from './actividades-reloj'

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

/* La FORMA exacta de querySportRecords el 19-10-2026 (la primera cuenta real);
   los valores, el sitio y las coordenadas son inventados. */
const ENTRENOS = `Sport Records — 2026-10-13 to 2026-10-19 (3 records)
========================

1. Walk — 2026-10-18
   Location: Parque inventado
   Start Coordinates: 0.000000, 0.000000
   Time Window: startTimestamp=1792333451 | endTimestamp=1792338887
   Duration: 1:29:57 | Distance: 7.42 km
   Average Pace: 12:08 /km | Avg HR: 109 bpm | Calories: 674 kcal
   LabelId: 481125923538633106 | SportType: 900

2. Outdoor Run — 2026-10-16
   Location: Pista inventada
   Start Coordinates: 0.000000, 0.000000
   Time Window: startTimestamp=1792140000 | endTimestamp=1792142700
   Duration: 45:00 | Distance: 8.00 km
   Average Pace: 5:37 /km | Avg HR: 150 bpm | Calories: 520 kcal
   LabelId: 481100000000000001 | SportType: 100

3. Strength — 2026-10-14
   Time Window: startTimestamp=1791960000 | endTimestamp=1791963600
   Duration: 1:00:00 | Sets: 12
   Avg HR: 115 bpm | Calories: 300 kcal
   LabelId: 481100000000000002 | SportType: 402`

describe('los entrenos de COROS', () => {
  it('cada entreno, con su día, su número de COROS y lo que se enseña de Polar', () => {
    const e = entrenosDeCoros(ENTRENOS)
    expect(e.map(x => [x.fecha, x.id_externo, x.datos.disciplina, x.datos.deporte])).toEqual([
      ['2026-10-18', '481125923538633106', null, 'Caminata'],
      ['2026-10-16', '481100000000000001', 'Carrera', 'Al aire libre'],
      ['2026-10-14', '481100000000000002', 'Fuerza', 'Gimnasio'],
    ])
    expect(e[0]).toEqual({
      tipo: 'entreno', fecha: '2026-10-18', id_externo: '481125923538633106',
      datos: {
        inicio: '2026-10-18T14:24:11.000Z', fin: '2026-10-18T15:54:47.000Z', duracion_min: 90,
        disciplina: null, deporte: 'Caminata', deporte_codigo: 900,
        distancia_m: 7420, fc_media: 109, fc_max: null, calorias: 674, carga: null,
      },
    })
    expect(e[2].datos).toMatchObject({ duracion_min: 60, distancia_m: null, fc_media: 115 })
  })

  it('el sitio y las coordenadas no se guardan', () => {
    const datos = JSON.stringify(entrenosDeCoros(ENTRENOS))
    expect(datos).not.toMatch(/inventad|0\.000000|Location|Coordinates/i)
    const limpio = sinUbicacionCoros(ENTRENOS)
    expect(limpio).not.toMatch(/inventad|0\.000000/)
    expect(limpio).toContain('Location: (quitado)')
    expect(limpio).toContain('Start Coordinates: (quitado)')
    /* Y se sigue leyendo igual. */
    expect(entrenosDeCoros(limpio)).toEqual(entrenosDeCoros(ENTRENOS))
  })

  it('en la pestaña de entrenos, como los de Polar y a la hora de Madrid', () => {
    const filas = entrenosDeCoros(ENTRENOS).map((m, i) => ({ id: i + 1, proveedor: 'coros', fecha: m.fecha, id_externo: m.id_externo, datos: m.datos }))
    const a = actividadesDeMediciones(filas)
    expect(a.map(x => [x.fecha, x.disciplina, x.minutos, x.metros, x.fcMedia])).toEqual([
      ['2026-10-18', null, 90, 7420, 109],
      ['2026-10-16', 'Carrera', 45, 8000, 150],
      ['2026-10-14', 'Fuerza', 60, null, 115],
    ])
  })

  it('las disciplinas, sin adivinar', () => {
    expect([100, 101, 102, 103].map(disciplinaDeCoros)).toEqual(['Carrera', 'Carrera', 'Carrera', 'Carrera'])
    expect([200, 201, 203, 204, 299].every(c => disciplinaDeCoros(c) === 'Ciclismo')).toBe(true)
    expect([300, 301].map(disciplinaDeCoros)).toEqual(['Natacion', 'Natacion'])
    expect(disciplinaDeCoros(402)).toBe('Fuerza')
    expect(disciplinaDeCoros(1200)).toBe('Hibrido')
    /* Con motor, ni senderismo, ni caminata, ni triatlón: ninguna de las nuestras. */
    for (const c of [202, 205, 104, 900, 10000, 65535, null]) expect(disciplinaDeCoros(c), String(c)).toBeNull()
  })

  it('duraciones y distancias como las escribe COROS', () => {
    expect(minutosDeDuracionCoros('1:29:57')).toBe(90)
    expect(minutosDeDuracionCoros('45:00')).toBe(45)
    expect(minutosDeDuracionCoros('1h 5min')).toBe(65)
    expect(minutosDeDuracionCoros('0:00')).toBeNull()
    expect(metrosDeTexto('7.42 km')).toBe(7420)
    expect(metrosDeTexto('1500 m')).toBe(1500)
    expect(metrosDeTexto('0.00 km')).toBeNull()
    expect(metrosDeTexto('—')).toBeNull()
  })

  it('lo que no es su lista de entrenos no da ninguno', () => {
    expect(entrenosDeCoros('Sport Records — 2026-10-13 to 2026-10-19 (0 records)\n========================\n\nNo records found.')).toEqual([])
    expect(entrenosDeCoros('Tool call anomalies detected.')).toEqual([])
    expect(entrenosDeCoros(null)).toEqual([])
  })

  it('van con lo demás de COROS', () => {
    expect(medicionesDeCoros({ entrenos: ENTRENOS }).filter(m => m.tipo === 'entreno')).toHaveLength(3)
  })
})
