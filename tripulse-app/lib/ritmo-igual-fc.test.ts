import { describe, expect, it } from 'vitest'
import {
  analizarEficiencia, desacoplamientoDe, esCinta, nivelDesacoplamiento, ritmoAFc, tendenciaDe,
  MIN_RODAJES, type RodajeEficiencia,
} from './ritmo-igual-fc'
import type { TramoDetalle } from './detalle-entreno'

const HOY = '2026-10-20'

/** n km enteros, con el tiempo y la FC de cada uno. */
const km = (n: number, segundos: (i: number) => number, fc: (i: number) => number | null = () => 150): TramoDetalle[] =>
  Array.from({ length: n }, (_, i) => ({ metros: 1000, segundos: segundos(i), fc_media: fc(i), fc_max: null }))

let siguiente = 0
/** Un rodaje suave de 8 km a 6:12 con 150 ppm, plano y al aire libre; lo demás, lo que se diga. */
const rodaje = (o: Partial<RodajeEficiencia> & { fecha: string }): RodajeEficiencia => ({
  id: ++siguiente, minutos: 50, deporte: 'Al aire libre', deporteCodigo: 100, deporteDetalle: null,
  tramos: km(8, () => 372), tramoM: 1000,
  vueltas: [{ metros: 8000, segundos: 2976, fc_media: 150, fc_max: 160, cadencia: 82, potencia: null, desnivel: 40 }],
  ...o,
})

describe('las piezas', () => {
  it('la cinta se reconoce en COROS y en Polar', () => {
    expect(esCinta({ deporteCodigo: 101, deporte: null, deporteDetalle: null })).toBe(true)
    expect(esCinta({ deporteCodigo: null, deporte: 'En cinta', deporteDetalle: null })).toBe(true)
    expect(esCinta({ deporteCodigo: null, deporte: 'RUNNING', deporteDetalle: 'TREADMILL_RUNNING' })).toBe(true)
    expect(esCinta({ deporteCodigo: 100, deporte: 'Al aire libre', deporteDetalle: null })).toBe(false)
  })

  it('el ritmo a la FC de referencia: con su reserva si hay reposo, y en proporción si no', () => {
    /* Los dos ejemplos de la maqueta. */
    expect(Math.round(ritmoAFc(380, 147, 150, 52))).toBe(368)
    expect(Math.round(ritmoAFc(361, 153, 150, 52))).toBe(372)
    expect(ritmoAFc(380, 147, 150)).toBeCloseTo(380 * 147 / 150, 6)
    /* Un reposo imposible (por encima de la FC del rodaje) no se usa. */
    expect(ritmoAFc(380, 147, 150, 140)).toBeCloseTo(380 * 147 / 150, 6)
  })

  it('el desacoplamiento: la FC de la segunda mitad frente a la primera, a ritmo constante', () => {
    const d = desacoplamientoDe(km(8, () => 360, i => (i < 4 ? 144 : 150)))
    expect(d).toEqual({ pct: 4, fc1: 144, fc2: 150 })
    /* Si en la segunda mitad va más rápido con la misma FC, no se ha desacoplado: al revés. */
    expect(desacoplamientoDe(km(8, i => (i < 4 ? 360 : 342), () => 148))!.pct).toBeLessThan(0)
    expect(desacoplamientoDe(km(3, () => 360))).toBeNull()
  })

  it('cómo se le dice el desacoplamiento', () => {
    expect([4.9, 5, 10, 10.1].map(p => nivelDesacoplamiento(p).nivel)).toEqual(['bien', 'medio', 'medio', 'mal'])
  })
})

describe('qué rodajes cuentan, y por qué no', () => {
  const r = analizarEficiencia([
    rodaje({ fecha: '2026-10-01' }),
    rodaje({ fecha: '2026-10-03' }),
    rodaje({ fecha: '2026-10-05', deporteCodigo: 101, deporte: 'En cinta' }),
    rodaje({ fecha: '2026-10-07', minutos: 18 }),
    rodaje({ fecha: '2026-10-09', tramos: null, tramoM: null, vueltas: null }),
    rodaje({ fecha: '2026-10-10', tramos: null, tramoM: null, vueltas: null, motivoDetalle: 'COROS no da el fichero de este entreno.' }),
    rodaje({ fecha: '2026-10-11', tramos: km(8, i => (i % 2 ? 300 : 420)) }),
    rodaje({ fecha: '2026-10-13', vueltas: [{ metros: 8000, segundos: 2976, fc_media: 150, fc_max: 160, cadencia: null, potencia: null, desnivel: 200 }] }),
    rodaje({ fecha: '2026-10-15', tramos: km(8, () => 330, () => 172) }),
    rodaje({ fecha: '2026-10-17', tramos: km(3, () => 372) }),
    rodaje({ fecha: '2026-10-19' }),
  ], { hoy: HOY, fcReposo: 52 })
  const motivo = (fecha: string) => r.rodajes.find(x => x.fecha === fecha)!.motivo

  it('su FC de referencia es la mediana de los rodajes con buena forma, de 5 en 5', () => {
    expect(r.fcRef).toBe(150)
  })

  it('cada uno que no cuenta, con su motivo', () => {
    expect(motivo('2026-10-05')).toBe('En cinta: el ritmo del reloj no vale')
    expect(motivo('2026-10-07')).toBe('18 min: hacen falta 20')
    expect(motivo('2026-10-09')).toBe('Aún sin el detalle de sus km: llega con la próxima sincronización')
    expect(motivo('2026-10-10')).toBe('Sin el detalle de sus km: COROS no da el fichero de este entreno')
    expect(motivo('2026-10-11')).toBe('Con series o cambios de ritmo: sus km varían un 17 %')
    expect(motivo('2026-10-13')).toBe('Cuestas: 25 m de subida por km')
    expect(motivo('2026-10-15')).toBe('FC lejos de 150 (172)')
    expect(motivo('2026-10-17')).toBe('Menos de 4 km enteros')
  })

  it('los que cuentan, con su ritmo a la FC de referencia; el más reciente primero', () => {
    expect(r.rodajes.map(x => x.fecha)[0]).toBe('2026-10-19')
    expect(r.puntos).toEqual([
      { fecha: '2026-10-01', ritmoRef: 372 }, { fecha: '2026-10-03', ritmoRef: 372 }, { fecha: '2026-10-19', ritmoRef: 372 },
    ])
    /* Tres que cuentan: ni tendencia ni nada que decir aún. */
    expect(r.puntos.length).toBeLessThan(MIN_RODAJES)
    expect(r.tendencia).toBeNull()
  })

  it('el primer km no cuenta: la FC tarda en subir', () => {
    const conPrimeroLento = analizarEficiencia([rodaje({ fecha: '2026-10-19', tramos: km(8, i => (i === 0 ? 420 : 372), i => (i === 0 ? 120 : 150)) })], { hoy: HOY })
    expect(conPrimeroLento.rodajes[0]).toMatchObject({ cuenta: true, ritmo: 372, fc: 150 })
  })

  it('el desacoplamiento, solo en los de 45 min o más', () => {
    const largo = analizarEficiencia([rodaje({ fecha: '2026-10-19', minutos: 78, tramos: km(12, () => 380, i => (i < 7 ? 144 : 150)) })], { hoy: HOY })
    expect(largo.rodajes[0].desacoplamiento?.pct).toBeGreaterThan(3)
    const corto = analizarEficiencia([rodaje({ fecha: '2026-10-19', minutos: 40, tramos: km(8, () => 372, i => (i < 4 ? 146 : 152)) })], { hoy: HOY })
    expect(corto.rodajes[0].desacoplamiento).toBeNull()
  })

  it('lo de hace más de 12 semanas no entra', () => {
    expect(analizarEficiencia([rodaje({ fecha: '2026-07-01' })], { hoy: HOY }).rodajes).toEqual([])
  })
})

describe('la tendencia', () => {
  const p = (fecha: string, ritmoRef: number) => ({ fecha, ritmoRef })
  const antes = [p('2026-08-20', 390), p('2026-08-27', 388), p('2026-09-03', 386)]

  it('con menos de 4, nada', () => {
    expect(tendenciaDe([p('2026-10-01', 372), p('2026-10-10', 371), p('2026-10-19', 370)], HOY)).toBeNull()
  })

  it('ahora (los 3 últimos) frente a hace 5 a 9 semanas: mejor si pasa del 3 %', () => {
    const t = tendenciaDe([...antes, p('2026-10-06', 372), p('2026-10-13', 371), p('2026-10-19', 370)], HOY)!
    expect([t.ahora, t.antes, t.veredicto]).toEqual([371, 388, 'mejor'])
    expect(t.cambio).toBeCloseTo(17 / 388, 6)
  })

  it('por debajo del 3 %, sin cambios claros; más lento, peor', () => {
    expect(tendenciaDe([...antes, p('2026-10-06', 380), p('2026-10-13', 381), p('2026-10-19', 379)], HOY)!.veredicto).toBe('igual')
    expect(tendenciaDe([...antes, p('2026-10-06', 410), p('2026-10-13', 409), p('2026-10-19', 411)], HOY)!.veredicto).toBe('peor')
  })

  it('sin rodajes de hace 5 a 9 semanas, ahora sí, pero sin comparar', () => {
    const t = tendenciaDe([p('2026-09-20', 380), p('2026-10-01', 375), p('2026-10-10', 372), p('2026-10-19', 370)], HOY)!
    expect(t).toEqual({ ahora: 372, antes: null, cambio: null, veredicto: null })
  })

  it('la línea es la mediana de cada tres', () => {
    const r = analizarEficiencia([
      rodaje({ fecha: '2026-10-01', tramos: km(8, () => 380) }),
      rodaje({ fecha: '2026-10-05', tramos: km(8, () => 360) }),
      rodaje({ fecha: '2026-10-09', tramos: km(8, () => 370) }),
      rodaje({ fecha: '2026-10-13', tramos: km(8, () => 365) }),
    ], { hoy: HOY })
    expect(r.linea).toEqual([{ fecha: '2026-10-09', ritmo: 370 }, { fecha: '2026-10-13', ritmo: 365 }])
  })
})
