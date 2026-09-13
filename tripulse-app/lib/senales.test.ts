import { describe, it, expect } from 'vitest'
import { senalesDeAtleta, MIN_REGISTROS_BASE, type SesionSenal } from './senales'
import type { RegistroWellness } from './wellness-analisis'

const HOY = '2026-09-11'

/** Un día de wellness normal, con lo que haga falta cambiado. */
const dia = (fecha: string, o: Partial<RegistroWellness> = {}): RegistroWellness => ({
  fecha,
  calidad_sueno: 3, horas_sueno: 8, fatiga: 3, estres: 3, dolor_muscular: 3,
  animo: 5, motivacion: 5, score_wellness: 30,
  ...o,
})

/** N días seguidos hacia atrás desde `desde`. */
const serieDias = (desde: string, n: number, o: (i: number) => Partial<RegistroWellness> = () => ({})) =>
  Array.from({ length: n }, (_, i) => {
    const f = new Date(Date.parse(desde + 'T12:00:00Z') - i * 86400000).toISOString().slice(0, 10)
    return dia(f, o(i))
  })

const ses = (fecha: string, o: Partial<SesionSenal> = {}): SesionSenal => ({
  fecha_sesion: fecha, estado: 'Realizada', minutos: 60, ...o,
})

describe('sin base no se inventa nada', () => {
  it('sin wellness, ninguna señal de bienestar y se dice qué falta', () => {
    const r = senalesDeAtleta({ wellness: [], sesiones: [], hoy: HOY })
    expect(r.senales.filter(s => s.id.startsWith('bienestar'))).toEqual([])
    expect(r.sinBase.join(' ')).toMatch(/no ha rellenado ninguno/)
  })

  it('con pocos registros tampoco, y dice cuántos faltan', () => {
    const r = senalesDeAtleta({ wellness: serieDias(HOY, 5), sesiones: [], hoy: HOY })
    expect(r.senales.some(s => s.id === 'bienestar')).toBe(false)
    expect(r.sinBase.join(' ')).toContain(String(MIN_REGISTROS_BASE))
  })

  it('con menos de 3 sesiones con RPE no se habla de cuánto le cuesta', () => {
    const r = senalesDeAtleta({
      wellness: [],
      sesiones: [ses('2026-09-10', { rpe_estimado: 4, rpe_reportado: 9 })],
      hoy: HOY,
    })
    expect(r.senales.some(s => s.id === 'cuesta_mas')).toBe(false)
    expect(r.sinBase.join(' ')).toMatch(/Cuánto le cuestan/)
  })
})

describe('le cuesta más de lo previsto (L4.1)', () => {
  const duras = [
    ses('2026-09-10', { rpe_estimado: 4, rpe_reportado: 7 }),
    ses('2026-09-08', { rpe_estimado: 5, rpe_reportado: 7 }),
    ses('2026-09-06', { rpe_estimado: 4, rpe_reportado: 6 }),
  ]

  it('avisa con el número que lo sostiene', () => {
    const r = senalesDeAtleta({ wellness: [], sesiones: duras, hoy: HOY })
    const s = r.senales.find(x => x.id === 'cuesta_mas')!
    expect(s.nivel).toBe('ambar')
    expect(s.porque).toMatch(/3 de las últimas 3/)
    expect(s.porque).toMatch(/\+2,3 puntos/)
    expect(s.accion).toMatch(/calidad/)
  })

  it('si sale como se esperaba, no avisa', () => {
    const iguales = duras.map(s => ({ ...s, rpe_reportado: s.rpe_estimado }))
    expect(senalesDeAtleta({ wellness: [], sesiones: iguales, hoy: HOY }).senales.some(s => s.id === 'cuesta_mas')).toBe(false)
  })

  it('lo de hace más de dos semanas no cuenta', () => {
    const viejas = duras.map(s => ({ ...s, fecha_sesion: '2026-08-01' }))
    const r = senalesDeAtleta({ wellness: [], sesiones: viejas, hoy: HOY })
    expect(r.senales.some(s => s.id === 'cuesta_mas')).toBe(false)
  })
})

describe('bienestar', () => {
  it('la disposición mala se convierte en señal con su recomendación', () => {
    // Tres semanas normales y los últimos días con fatiga y dolor altos.
    const w = serieDias(HOY, 24, i => (i < 4 ? { fatiga: 7, dolor_muscular: 7, animo: 2, score_wellness: 80 } : {}))
    const r = senalesDeAtleta({ wellness: w, sesiones: [], hoy: HOY })
    const s = r.senales.find(x => x.id === 'bienestar')!
    expect(s).toBeTruthy()
    expect(['roja', 'ambar']).toContain(s.nivel)
    expect(s.porque.length).toBeGreaterThan(10)
    expect(s.accion.length).toBeGreaterThan(10)
  })

  it('la tendencia avisa aunque ningún día suelto sea alarmante', () => {
    /* El caso de la lección: días mediocres que bajan. Sin la tendencia, cada
       uno pasaría por normal. */
    const w = [
      ...[74, 70, 66, 62, 58].map((s, i) => dia(new Date(Date.parse(HOY + 'T12:00:00Z') - i * 86400000).toISOString().slice(0, 10), { score_wellness: 100 - s })),
      ...serieDias('2026-09-06', 20, () => ({ score_wellness: 20 })),
    ]
    const r = senalesDeAtleta({ wellness: w, sesiones: [], hoy: HOY })
    expect(r.senales.some(s => s.id === 'bienestar' || s.id === 'bienestar_tendencia')).toBe(true)
  })

  it('estable, ninguna señal de bienestar', () => {
    const r = senalesDeAtleta({ wellness: serieDias(HOY, 24), sesiones: [], hoy: HOY })
    expect(r.senales.filter(s => s.id.startsWith('bienestar'))).toEqual([])
  })
})

describe('sueño', () => {
  it('dormir menos de lo suyo avisa, con las dos medias', () => {
    const w = serieDias(HOY, 25, i => ({ horas_sueno: i < 7 ? 6.5 : 8 }))
    const s = senalesDeAtleta({ wellness: w, sesiones: [], hoy: HOY }).senales.find(x => x.id === 'sueno')!
    expect(s.porque).toContain('6,5 h')
    expect(s.porque).toContain('8,0 h')
  })

  it('una noche mala no es una señal', () => {
    const w = serieDias(HOY, 25, i => ({ horas_sueno: i === 0 ? 5 : 8 }))
    expect(senalesDeAtleta({ wellness: w, sesiones: [], hoy: HOY }).senales.some(s => s.id === 'sueno')).toBe(false)
  })
})

describe('sesión larga y cumplimiento', () => {
  it('el salto de la sesión larga propone el techo en minutos', () => {
    const s = senalesDeAtleta({
      wellness: [],
      sesiones: [ses('2026-09-09', { minutos: 150 }), ses('2026-08-20', { minutos: 100 })],
      hoy: HOY,
    }).senales.find(x => x.id === 'sesion_larga')!
    expect(s.porque).toContain('+50 %')
    expect(s.accion).toContain('110 min')
  })

  it('las sesiones sin hacer se cuentan, no se interpretan', () => {
    const s = senalesDeAtleta({
      wellness: [],
      sesiones: [
        ses('2026-09-10', { estado: 'Planificada' }), ses('2026-09-09', { estado: 'Planificada' }),
        ses('2026-09-08', { estado: 'Planificada' }), ses('2026-09-07'),
      ],
      hoy: HOY,
    }).senales.find(x => x.id === 'cumplimiento')!
    expect(s.nivel).toBe('info')
    expect(s.porque).toMatch(/3 de 4/)
  })
})

describe('dejar de rellenar también es una señal', () => {
  it('avisa a los 3 días', () => {
    const s = senalesDeAtleta({ wellness: [dia('2026-09-07')], sesiones: [], hoy: HOY }).senales.find(x => x.id === 'sin_wellness')!
    expect(s.titulo).toContain('4 días')
  })

  it('con el de ayer, no', () => {
    expect(senalesDeAtleta({ wellness: [dia('2026-09-10')], sesiones: [], hoy: HOY }).senales.some(s => s.id === 'sin_wellness')).toBe(false)
  })
})

describe('el orden', () => {
  it('lo rojo primero, lo informativo al final', () => {
    const w = serieDias(HOY, 24, i => (i < 4 ? { fatiga: 7, dolor_muscular: 7, estres: 7, animo: 1, motivacion: 1, score_wellness: 90 } : {}))
    const r = senalesDeAtleta({
      wellness: w,
      sesiones: [ses('2026-09-10', { estado: 'Planificada' }), ses('2026-09-09', { estado: 'Planificada' }), ses('2026-09-08', { estado: 'Planificada' })],
      hoy: HOY,
    })
    const niveles = r.senales.map(s => s.nivel)
    expect(niveles).toEqual([...niveles].sort((a, b) => ({ roja: 0, ambar: 1, info: 2 })[a] - ({ roja: 0, ambar: 1, info: 2 })[b]))
    expect(niveles[niveles.length - 1]).toBe('info')
  })
})
