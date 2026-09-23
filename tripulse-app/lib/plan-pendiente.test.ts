import { describe, it, expect } from 'vitest'
import { fotoDelDibujo, fotoDelPlan, loPendiente } from './plan-pendiente'

const INICIO = '2026-08-17'

/* Un dibujo pequeño: un macro de 8 semanas con dos mesos dentro. */
const macros = [{ si: 0, sf: 7, nombre: '10k/Pretemporada', tipo: 'Tradicional' }]
const mesos = [
  { si: 0, sf: 3, nombre: 'Carga', tipo: 'Carga', intensidad: 7 },
  { si: 4, sf: 7, nombre: 'Específico', tipo: 'Específico', intensidad: 8 },
]
const semanas = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ i, ua: 1000 + i * 100, tipo: 'Carga' }))

/* Y el mismo plan, tal y como lo habría escrito «Generar planificación». */
const macsDb = [{ fecha_inicio: '2026-08-17', duracion_semanas: 8, objetivo: '10k/Pretemporada', tipo_periodizacion: 'Tradicional' }]
const mesosDb = [
  { fecha_inicio: '2026-08-17', duracion_semanas: 4, objetivo: 'Carga', tipo: 'Carga', intensidad_relativa: 7 },
  { fecha_inicio: '2026-09-14', duracion_semanas: 4, objetivo: 'Específico', tipo: 'Específico', intensidad_relativa: 8 },
]
const microsDb = semanas.map(s => ({
  fecha_inicio: new Date(Date.parse(INICIO + 'T00:00Z') + s.i * 7 * 86400000).toISOString().slice(0, 10),
  ua_planificada: s.ua, tipo: 'Carga',
}))

const dib = () => fotoDelDibujo(macros, mesos, semanas)
const plan = () => fotoDelPlan(INICIO, macsDb, mesosDb, microsDb)

describe('cuando el dibujo y el plan dicen lo mismo', () => {
  it('no hay nada pendiente', () => {
    expect(loPendiente(dib(), plan())).toEqual({ hay: false, frase: '' })
  })

  it('las fechas del plan se leen como semanas del lienzo', () => {
    const p = plan()!
    expect(p.macros[0]).toEqual({ si: 0, sf: 7, nombre: '10k/Pretemporada', tipo: 'Tradicional' })
    expect(p.mesos[1].si).toBe(4)
  })
})

describe('cuando se estira una barra', () => {
  it('un meso con una semana más sale como pendiente', () => {
    const otros = [{ ...mesos[0], sf: 4 }, { ...mesos[1], si: 5 }]
    const r = loPendiente(fotoDelDibujo(macros, otros, semanas), plan())
    expect(r.hay).toBe(true)
    expect(r.frase).toBe('Has cambiado 2 mesociclos desde la última vez.')
  })

  it('un macro más largo, también', () => {
    const r = loPendiente(fotoDelDibujo([{ ...macros[0], sf: 9 }], mesos, semanas), plan())
    expect(r.frase).toBe('Has cambiado 1 macrociclo desde la última vez.')
  })

  it('un bloque cambiado cuenta UNA vez, no dos', () => {
    /* Sobra en los dos lados —el viejo y el nuevo— pero es un solo cambio. */
    const r = loPendiente(fotoDelDibujo([{ ...macros[0], nombre: 'Otro nombre' }], mesos, semanas), plan())
    expect(r.frase).toContain('1 macrociclo')
  })
})

describe('la carga de las semanas', () => {
  it('cambiar las UA de dos semanas es pendiente', () => {
    const otras = semanas.map(s => s.i < 2 ? { ...s, ua: 4000 } : s)
    expect(loPendiente(fotoDelDibujo(macros, mesos, otras), plan()).frase)
      .toBe('Has cambiado la carga de 2 semanas desde la última vez.')
  })

  it('una semana FUERA de todo mesociclo no cuenta: no llega a la base', () => {
    const conSuelta = [...semanas, { i: 11, ua: 9999, tipo: 'Carga' }]
    expect(loPendiente(fotoDelDibujo(macros, mesos, conSuelta), plan()).hay).toBe(false)
  })

  it('«Taper» y «Competición» son el mismo tipo de semana, no un cambio', () => {
    const conTaper = semanas.map(s => s.i === 7 ? { ...s, tipo: 'Taper' } : s)
    const microsConComp = microsDb.map((m, k) => k === 7 ? { ...m, tipo: 'Competición' } : m)
    expect(loPendiente(fotoDelDibujo(macros, mesos, conTaper), fotoDelPlan(INICIO, macsDb, mesosDb, microsConComp)).hay).toBe(false)
  })
})

describe('varias cosas a la vez', () => {
  it('se enumeran en castellano', () => {
    const r = loPendiente(
      fotoDelDibujo([{ ...macros[0], sf: 9 }], [{ ...mesos[0], sf: 4 }, mesos[1]], semanas.map(s => s.i === 0 ? { ...s, ua: 1 } : s)),
      plan(),
    )
    expect(r.frase).toBe('Has cambiado 1 macrociclo, 1 mesociclo y la carga de 1 semana desde la última vez.')
  })
})

describe('sin plan detrás', () => {
  it('lo pendiente es todo el dibujo', () => {
    expect(loPendiente(dib(), null)).toEqual({
      hay: true, frase: 'Este dibujo todavía no se ha convertido en plan.',
    })
  })

  it('un lienzo vacío no avisa de nada', () => {
    expect(loPendiente(fotoDelDibujo([], [], []), null).hay).toBe(false)
  })

  it('sin macrociclos en la base no hay foto del plan', () => {
    expect(fotoDelPlan(INICIO, [], [], [])).toBeNull()
    expect(fotoDelPlan('', macsDb, mesosDb, microsDb)).toBeNull()
  })
})
