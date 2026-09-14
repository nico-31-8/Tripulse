import { describe, it, expect } from 'vitest'
import {
  informeSemanal, duracionLarga, SEMANAS_BASE,
  type SesionInforme, type EntradaInforme,
} from './informe-semanal'
import type { Senal } from './senales'
import type { RegistroWellness } from './wellness-analisis'

/** Lunes de la semana de la que se informa. */
const LUNES = '2026-09-07'

const dia = (offset: number) =>
  new Date(Date.parse(LUNES + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10)

const ses = (offset: number, o: Partial<SesionInforme> = {}): SesionInforme => ({
  fecha_sesion: dia(offset), estado: 'Realizada', minutos: 60, rpe_estimado: 5, rpe_reportado: 5, ...o,
})

const well = (offset: number, score: number): RegistroWellness => ({
  fecha: dia(offset),
  calidad_sueno: 3, horas_sueno: 8, fatiga: 3, estres: 3, dolor_muscular: 3,
  animo: 5, motivacion: 5, score_wellness: score,
})

const senal = (nivel: Senal['nivel'], accion = 'Haz esto.'): Senal =>
  ({ id: 'bienestar', nivel, titulo: 'Le pasa algo', tituloAtleta: 'te pasa algo', porque: 'P', accion })

const hacer = (o: Partial<EntradaInforme> = {}) =>
  informeSemanal({ lunes: LUNES, sesiones: [], wellness: [], ...o })

describe('reparto por semanas', () => {
  it('el domingo entra y el lunes siguiente no', () => {
    const r = hacer({ sesiones: [ses(6), ses(7)] })
    expect(r.hecho.realizadas).toBe(1)
    expect(r.domingo).toBe('2026-09-13')
  })

  it('la base son las 4 semanas de antes, no las de después', () => {
    const previas = [-7, -14, -21, -28].map(d => ses(d, { minutos: 100 }))
    const r = hacer({ sesiones: [ses(0, { minutos: 100 }), ...previas, ses(-35, { minutos: 1000 })] })
    expect(r.comparado?.semanas).toBe(SEMANAS_BASE)
    expect(r.comparado?.variacion).toBe(0)
  })

  it('las semanas sin entrenar no cuentan en la media', () => {
    /* Si contaran, volver de dos semanas de parón saldría como subidón. */
    const r = hacer({ sesiones: [ses(0, { minutos: 60 }), ses(-7, { minutos: 60 })] })
    expect(r.comparado?.semanas).toBe(1)
    expect(r.comparado?.variacion).toBe(0)
  })
})

describe('lo que hizo', () => {
  it('solo cuenta como hecho lo que está marcado como realizado', () => {
    const r = hacer({ sesiones: [ses(0), ses(1, { estado: 'Planificada' })] })
    expect(r.hecho).toMatchObject({ planificadas: 2, realizadas: 1, cumplimiento: 0.5, minutos: 60 })
  })

  it('la carga es el RPE que dio el atleta por los minutos (sRPE)', () => {
    const r = hacer({ sesiones: [ses(0, { minutos: 50, rpe_estimado: 4, rpe_reportado: 8 })] })
    expect(r.hecho.carga).toBe(400)
  })

  it('sin RPE reportado se usa el previsto', () => {
    const r = hacer({ sesiones: [ses(0, { minutos: 50, rpe_estimado: 6, rpe_reportado: null })] })
    expect(r.hecho.carga).toBe(300)
  })
})

describe('el titular trae el número', () => {
  it('dice la variación contra sus semanas', () => {
    const r = hacer({ sesiones: [ses(0, { minutos: 120 }), ses(-7, { minutos: 60 }), ses(-14, { minutos: 60 })] })
    expect(r.titular).toContain('+100 %')
    expect(r.titular).toContain('2 semanas anteriores')
  })

  it('una diferencia pequeña se cuenta como «en línea»', () => {
    const r = hacer({ sesiones: [ses(0, { minutos: 62 }), ses(-7, { minutos: 60 })] })
    expect(r.titular).toContain('en línea')
  })

  it('sin semanas anteriores no se inventa comparación', () => {
    const r = hacer({ sesiones: [ses(0)] })
    expect(r.comparado).toBeNull()
    expect(r.titular).not.toContain('%')
    expect(r.sinBase.join(' ')).toContain('semanas anteriores')
  })

  it('sin nada planificado lo dice y no calcula cumplimiento', () => {
    const r = hacer()
    expect(r.hecho.cumplimiento).toBeNull()
    expect(r.titular).toContain('No había nada planificado')
  })

  it('concuerda en singular y en plural', () => {
    expect(hacer({ sesiones: [ses(0)] }).titular).toContain('Hizo la sesión que tenía')
    expect(hacer({ sesiones: [ses(0), ses(1)] }).titular).toContain('Hizo las 2 sesiones')
    expect(hacer({ sesiones: [ses(0), ses(1, { estado: 'Planificada' })] }).titular).toContain('Hizo 1 de 2 sesiones')
  })
})

describe('el bienestar se compara con el suyo, no con un número fijo', () => {
  it('saca su base de las semanas anteriores', () => {
    const r = hacer({ wellness: [well(0, 40), well(-7, 20), well(-14, 20)] })
    /* score guardado = malestar; bienestar() lo invierte. */
    expect(r.bienestar.medio).toBeLessThan(r.bienestar.base!)
    expect(r.bienestar.variacion).toBeLessThan(0)
  })

  it('sin registros de esa semana lo dice', () => {
    const r = hacer({ wellness: [well(-7, 20)] })
    expect(r.bienestar.medio).toBeNull()
    expect(r.sinBase.join(' ')).toContain('no rellenó ninguno')
  })

  it('con registros pero sin base, también', () => {
    const r = hacer({ wellness: [well(0, 20)] })
    expect(r.bienestar.base).toBeNull()
    expect(r.bienestar.variacion).toBeNull()
    expect(r.sinBase.join(' ')).toContain('falta la base')
  })
})

describe('qué haría la semana que viene', () => {
  it('una señal roja manda, y su acción es la propuesta', () => {
    const r = hacer({ sesiones: [ses(0)], senales: [senal('roja', 'Descarga 5 días.')] })
    expect(r.nivel).toBe('roja')
    expect(r.proxima).toContain('no es de subir')
    expect(r.proxima).toContain('Descarga 5 días.')
  })

  it('con poco cumplimiento, primero se averigua qué pasó', () => {
    const r = hacer({ sesiones: [ses(0), ...[1, 2, 3].map(d => ses(d, { estado: 'Planificada' }))] })
    expect(r.nivel).toBe('roja')
    expect(r.proxima).toContain('averigua qué pasó')
    expect(r.proxima).toContain('25 %')
  })

  it('una ámbar aconseja mantener', () => {
    const r = hacer({ sesiones: [ses(0)], senales: [senal('ambar', 'Mira su sueño.')] })
    expect(r.nivel).toBe('ambar')
    expect(r.proxima).toContain('Mantén la carga')
    expect(r.proxima).toContain('Mira su sueño.')
  })

  it('una subida fuerte pide consolidar aunque no haya señales', () => {
    const r = hacer({ sesiones: [ses(0, { minutos: 200 }), ses(-7, { minutos: 60 })] })
    expect(r.nivel).toBe('ambar')
    expect(r.proxima).toContain('consolida')
  })

  it('una semana normal propone subir poco y no tocar la larga', () => {
    const r = hacer({ sesiones: [ses(0), ses(-7)] })
    expect(r.nivel).toBe('ok')
    expect(r.proxima).toContain('5 y un 10 %')
    expect(r.proxima).toContain('sesión más larga')
  })

  it('lo informativo no baja el nivel de la semana', () => {
    const r = hacer({ sesiones: [ses(0), ses(-7)], senales: [senal('info')] })
    expect(r.nivel).toBe('ok')
  })
})

describe('duracionLarga', () => {
  it('minutos sueltos y horas con minutos', () => {
    expect(duracionLarga(45)).toBe('45 min')
    expect(duracionLarga(370)).toBe('6 h 10 min')
    expect(duracionLarga(120)).toBe('2 h')
    expect(duracionLarga(0)).toBe('0 min')
  })
})

describe('lo que se le dice al atleta', () => {
  it('no le da órdenes de carga: le pide marcar y hablar', () => {
    const r = hacer({ sesiones: [ses(0), ...[1, 2, 3].map(d => ses(d, { estado: 'Planificada' }))] })
    expect(r.paraElAtleta).toContain('3 sesiones sin marcar')
    expect(r.paraElAtleta).toContain('cuéntaselo a tu entrenador')
    expect(r.paraElAtleta).not.toContain('averigua')
  })

  it('la señal se le cuenta en su cara, no en tercera persona', () => {
    const r = hacer({ sesiones: [ses(0)], senales: [senal('ambar')] })
    expect(r.paraElAtleta).toContain('te pasa algo')
    expect(r.paraElAtleta).not.toContain('Le pasa algo')
  })

  it('con una subida fuerte le pide que avise si cuesta', () => {
    const r = hacer({ sesiones: [ses(0, { minutos: 200 }), ses(-7, { minutos: 60 })] })
    expect(r.paraElAtleta).toContain('+233'.slice(1))
    expect(r.paraElAtleta).toContain('dilo antes')
  })

  it('semana normal sin wellness: se le pide el wellness', () => {
    const r = hacer({ sesiones: [ses(0), ses(-7)] })
    expect(r.paraElAtleta).toContain('tu wellness')
  })

  it('semana normal con wellness: nada que pedir', () => {
    const r = hacer({ sesiones: [ses(0), ses(-7)], wellness: [well(0, 20)] })
    expect(r.paraElAtleta).toContain('Semana en orden')
    expect(r.paraElAtleta).not.toContain('treinta segundos')
  })

  it('concuerda en singular', () => {
    const r = hacer({ sesiones: [ses(0, { estado: 'Planificada' })] })
    expect(r.paraElAtleta).toContain('1 sesión sin marcar')
  })
})
