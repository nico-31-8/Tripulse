import { describe, it, expect } from 'vitest'
import {
  senalesDeAtleta, resumenDeEquipo, textoEquipo,
  MIN_REGISTROS_BASE, type SesionSenal, type ResultadoSenales,
} from './senales'
import type { RegistroWellness } from './wellness-analisis'
import type { NocheDelReloj } from './noches-del-reloj'

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
  /* Con sesiones recientes: sin ellas no salta, y eso se prueba abajo. */
  const entrenando = [ses('2026-09-10'), ses('2026-09-08')]

  it('avisa a los 3 días', () => {
    const s = senalesDeAtleta({ wellness: [dia('2026-09-07')], sesiones: entrenando, hoy: HOY }).senales.find(x => x.id === 'sin_wellness')!
    expect(s.titulo).toContain('4 días')
  })

  it('con el de ayer, no', () => {
    expect(senalesDeAtleta({ wellness: [dia('2026-09-10')], sesiones: entrenando, hoy: HOY }).senales.some(s => s.id === 'sin_wellness')).toBe(false)
  })

  it('una cuenta parada no avisa, por muchos meses que lleve', () => {
    expect(senalesDeAtleta({ wellness: [dia('2026-05-03')], sesiones: [], hoy: HOY }).senales).toEqual([])
  })

  it('pero si sigue entrenando, sí', () => {
    expect(senalesDeAtleta({ wellness: [dia('2026-05-03')], sesiones: entrenando, hoy: HOY })
      .senales.some(s => s.id === 'sin_wellness')).toBe(true)
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

describe('el equipo, para la entrada del panel', () => {
  const conSenales = (nivel: 'roja' | 'ambar' | 'info', n = 1): ResultadoSenales => ({
    senales: Array.from({ length: n }, (_, i) => ({
      id: 'bienestar' as const, nivel, titulo: 'Titular ' + nivel + i, tituloAtleta: 't', porque: '', accion: '',
    })),
    sinBase: [],
  })

  const deportistas = [{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Bruno' }, { id: 3, nombre: 'Carla' }]

  it('solo salen los que tienen algo', () => {
    const por = new Map([[1, conSenales('ambar')], [2, { senales: [], sinBase: ['x'] }]])
    expect(resumenDeEquipo(por, deportistas).map(a => a.id)).toEqual([1])
  })

  it('lo rojo va antes que lo ámbar y lo ámbar antes que lo informativo', () => {
    const por = new Map([[1, conSenales('info')], [2, conSenales('roja')], [3, conSenales('ambar')]])
    expect(resumenDeEquipo(por, deportistas).map(a => a.nombre)).toEqual(['Bruno', 'Carla', 'Ana'])
  })

  it('a igual nivel, primero quien tiene más', () => {
    const por = new Map([[1, conSenales('ambar', 1)], [2, conSenales('ambar', 3)]])
    expect(resumenDeEquipo(por, deportistas).map(a => a.n)).toEqual([3, 1])
  })

  it('lleva el titular de la primera señal', () => {
    const por = new Map([[1, conSenales('roja')]])
    expect(resumenDeEquipo(por, deportistas)[0].titular).toBe('Titular roja0')
  })

  it('un atleta sin nombre no rompe la lista', () => {
    const por = new Map([[9, conSenales('ambar')]])
    expect(resumenDeEquipo(por, [{ id: 9, nombre: '  ' }])[0].nombre).toBe('Sin nombre')
  })

  it('el texto concuerda en singular y plural, y calla si no hay nadie', () => {
    const uno = resumenDeEquipo(new Map([[1, conSenales('ambar')]]), deportistas)
    const dos = resumenDeEquipo(new Map([[1, conSenales('ambar')], [2, conSenales('info')]]), deportistas)
    expect(textoEquipo(uno)).toBe('1 atleta con señales')
    expect(textoEquipo(dos)).toBe('2 atletas con señales')
    expect(textoEquipo([])).toBe('')
  })
})

// ------------------------------------------------------------
// Sus noches, según su reloj (2026-10-20)
// ------------------------------------------------------------
// Llegan aunque no rellene el wellness, y se miran con la regla de la pestaña
// «Sus noches»: su última semana contra sus tres semanas anteriores.

const fechaAtras = (n: number) => new Date(Date.parse(HOY + 'T12:00:00Z') - n * 86400000).toISOString().slice(0, 10)

/** Una noche normal del reloj, con lo que haga falta cambiado. */
const noche = (fecha: string, o: Partial<NocheDelReloj> = {}): NocheDelReloj => ({
  fecha, dormidoMin: 450, puntuacion: null, fases: null, despertares: null, interrupcionesMin: null,
  siestaMin: null, enCamaMin: null, inicio: null, fin: null, hrv: 50, hrvEstado: null, hrvRango: null,
  hrvLineaBase: null, fc: 50, fcTipo: 'media', respiracion: null, recarga: null, profundoMin: null, remMin: null,
  ...o,
})

/** `n` noches hasta HOY: la última semana con `semana`, las de antes con `antes`. */
const cuatroSemanas = (semana: Partial<NocheDelReloj>, antes: Partial<NocheDelReloj> = {}, n = 28) =>
  Array.from({ length: n }, (_, i) => noche(fechaAtras(i), i < 7 ? semana : antes))

const conNoches = (noches: NocheDelReloj[], wellness: RegistroWellness[] = []) =>
  senalesDeAtleta({ wellness, sesiones: [], noches, hoy: HOY })

describe('sus noches, según su reloj', () => {
  it('la HRV de su última semana por debajo de lo suyo avisa, con las dos medias', () => {
    const s = conNoches(cuatroSemanas({ hrv: 44 })).senales.find(x => x.id === 'noches_reloj')!
    expect(s.nivel).toBe('ambar')
    expect(s.titulo).toBe('Su reloj marca noches fuera de su normal')
    expect(s.porque).toBe('Media de su última semana: HRV del sueño 44 ms (lo suyo, 50).')
    expect(s.tituloAtleta).toBe('tu reloj marca noches fuera de lo normal en ti')
    expect(s.accion).toMatch(/calidad/)
  })

  it('dentro de lo suyo, nada: ni aviso ni «sin base»', () => {
    const r = conNoches(cuatroSemanas({}))
    expect(r.senales.some(s => s.id === 'noches_reloj')).toBe(false)
    expect(r.sinBase.join(' ')).not.toMatch(/reloj/)
  })

  it('una noche mala sola no basta: manda la media de la semana', () => {
    const n = cuatroSemanas({})
    n[0] = noche(fechaAtras(0), { hrv: 40 })
    expect(conNoches(n).senales.some(s => s.id === 'noches_reloj')).toBe(false)
  })

  it('la FC, con su nombre: «en reposo» con COROS y «media nocturna» con Polar', () => {
    const coros = conNoches(cuatroSemanas({ fc: 55, fcTipo: 'reposo' }, { fcTipo: 'reposo' })).senales.find(x => x.id === 'noches_reloj')!
    expect(coros.porque).toBe('Media de su última semana: FC en reposo 55 ppm (lo suyo, 50).')
    const polar = conNoches(cuatroSemanas({ fc: 55 })).senales.find(x => x.id === 'noches_reloj')!
    expect(polar.porque).toBe('Media de su última semana: FC media nocturna 55 ppm (lo suyo, 50).')
  })

  it('el sueño, en horas', () => {
    const s = conNoches(cuatroSemanas({ dormidoMin: 400 })).senales.find(x => x.id === 'noches_reloj')!
    expect(s.porque).toBe('Media de su última semana: Sueño 6 h 40 (lo suyo, 7 h 30).')
  })

  it('varias a la vez van en un solo aviso', () => {
    const s = conNoches(cuatroSemanas({ hrv: 44, fc: 55, dormidoMin: 400 })).senales.filter(x => x.id === 'noches_reloj')
    expect(s).toHaveLength(1)
    expect(s[0].porque).toBe('Media de su última semana: HRV del sueño 44 ms (lo suyo, 50) · FC media nocturna 55 ppm (lo suyo, 50) · Sueño 6 h 40 (lo suyo, 7 h 30).')
  })

  it('con COROS manda su rango normal, aunque aún no haya tres semanas', () => {
    const n = Array.from({ length: 10 }, (_, i) => noche(fechaAtras(i), { hrv: i < 7 ? 42 : 50, hrvRango: [45, 58], fcTipo: 'reposo' }))
    const r = conNoches(n)
    expect(r.senales.find(x => x.id === 'noches_reloj')!.porque)
      .toBe('Media de su última semana: HRV del sueño 42 ms (su rango normal según COROS, 45–58).')
    expect(r.sinBase).toContain('Del reloj, la FC y el sueño: hacen falta tres semanas de noches para saber lo suyo')
  })

  it('con menos de tres semanas de noches no se inventa: se dice qué falta', () => {
    const r = conNoches(cuatroSemanas({ hrv: 30 }, {}, 10))
    expect(r.senales.some(s => s.id === 'noches_reloj')).toBe(false)
    expect(r.sinBase).toContain('Sus noches del reloj: hacen falta tres semanas de noches para saber lo suyo')
  })

  it('sin noches esta semana (no lo lleva o no sincroniza), nada', () => {
    const viejas = Array.from({ length: 21 }, (_, i) => noche(fechaAtras(i + 7), { hrv: 30 }))
    const r = conNoches(viejas)
    expect(r.senales.some(s => s.id === 'noches_reloj')).toBe(false)
    expect(r.sinBase.join(' ')).not.toMatch(/reloj/)
  })

  it('sin reloj, como siempre', () => {
    const r = senalesDeAtleta({ wellness: [], sesiones: [], hoy: HOY })
    expect(r.senales.some(s => s.id === 'noches_reloj')).toBe(false)
    expect(r.sinBase.join(' ')).not.toMatch(/reloj/)
  })

  it('lo que ya nombra la señal de bienestar no se repite', () => {
    /* El formulario guardó la HRV y la FC del reloj, las dos fuera de lo suyo:
       la de bienestar ya las nombra, y las noches dirían lo mismo. */
    const w = serieDias(HOY, 24, i => (i < 7 ? { hrv_noche: 40, fc_noche: 58 } : { hrv_noche: 50, fc_noche: 50 }))
    const r = conNoches(cuatroSemanas({ hrv: 40, fc: 58 }), w)
    expect(r.senales.find(s => s.id === 'bienestar')?.porque).toMatch(/HRV nocturna/)
    expect(r.senales.some(s => s.id === 'noches_reloj')).toBe(false)
  })

  it('pero lo que no nombra, sí: aquí, el sueño', () => {
    const w = serieDias(HOY, 24, i => (i < 7 ? { hrv_noche: 40, fc_noche: 58 } : { hrv_noche: 50, fc_noche: 50 }))
    const s = conNoches(cuatroSemanas({ hrv: 40, fc: 58, dormidoMin: 400 }), w).senales.find(x => x.id === 'noches_reloj')!
    expect(s.porque).toBe('Media de su última semana: Sueño 6 h 40 (lo suyo, 7 h 30).')
  })

  it('si la de sueño ya avisa, el sueño del reloj no se repite', () => {
    const w = serieDias(HOY, 25, i => ({ horas_sueno: i < 7 ? 6.5 : 8 }))
    const r = conNoches(cuatroSemanas({ dormidoMin: 400 }), w)
    expect(r.senales.some(s => s.id === 'sueno')).toBe(true)
    expect(r.senales.some(s => s.id === 'noches_reloj')).toBe(false)
  })

  it('va detrás de la de bienestar y delante del resto de lo ámbar', () => {
    const w = serieDias(HOY, 24, i => (i < 4 ? { fatiga: 7, dolor_muscular: 7, animo: 2, score_wellness: 80 } : {}))
    const sesiones = ['2026-09-10', '2026-09-09', '2026-09-08'].map(f => ses(f, { rpe_estimado: 4, rpe_reportado: 7 }))
    const ids = senalesDeAtleta({ wellness: w, sesiones, noches: cuatroSemanas({ hrv: 44 }), hoy: HOY }).senales.map(s => s.id)
    expect(ids.indexOf('bienestar')).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf('noches_reloj')).toBeGreaterThan(ids.indexOf('bienestar'))
    expect(ids.indexOf('noches_reloj')).toBeLessThan(ids.indexOf('cuesta_mas'))
  })
})

describe('sueño: lo del reloj no se mezcla con lo tecleado', () => {
  it('conectar un reloj no hace que «duerma menos»: sus horas no cuentan en esta señal', () => {
    /* Semanas tecleando 8 h (el tiempo en la cama) y una con el reloj, que
       cuenta 6,8 h de sueño real. Antes salía «está durmiendo menos de lo que
       suele» sin que hubiera cambiado nada. */
    const w = serieDias(HOY, 25, i => (i < 7 ? { horas_sueno: 6.8, sueno_del_reloj: true } : { horas_sueno: 8 }))
    expect(senalesDeAtleta({ wellness: w, sesiones: [], hoy: HOY }).senales.some(s => s.id === 'sueno')).toBe(false)
  })

  it('lo tecleado sigue avisando como siempre', () => {
    const w = serieDias(HOY, 25, i => ({ horas_sueno: i < 7 ? 6.5 : 8, sueno_del_reloj: false }))
    expect(senalesDeAtleta({ wellness: w, sesiones: [], hoy: HOY }).senales.some(s => s.id === 'sueno')).toBe(true)
  })
})
