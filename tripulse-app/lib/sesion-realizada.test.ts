import { describe, it, expect } from 'vitest'
import { resumirHecha, desvioRpe } from './sesion-realizada'

const ses = { id: 1, fecha_sesion: '2026-09-09', disciplina: 'Carrera', duracion_minutos: 60, duracion_real: 52, rpe_estimado: 5, rpe_reportado: 7 }

describe('desvioRpe', () => {
  it('dos puntos o más es una diferencia que se nota', () => {
    expect(desvioRpe(5, 7)).toBe('mas_duro')
    expect(desvioRpe(6, 4)).toBe('mas_suave')
  })
  it('uno es el ruido normal de la escala', () => {
    expect(desvioRpe(5, 6)).toBe('segun_plan')
    expect(desvioRpe(5, 4)).toBe('segun_plan')
  })
  it('sin uno de los dos, no se sabe', () => {
    expect(desvioRpe(null, 7)).toBeNull()
    expect(desvioRpe(5, null)).toBeNull()
  })
})

describe('resumirHecha', () => {
  /* EL FALLO que arregla esto: la lista de sesiones realizadas enseñaba la
     duración del plan y el RPE del entrenador. */
  it('pone lo planificado y lo real lado a lado', () => {
    const r = resumirHecha(ses)
    expect([r.minutosPlan, r.minutosReales, r.rpePlan, r.rpeReal, r.desvio]).toEqual([60, 52, 5, 7, 'mas_duro'])
  })

  it('de las tareas: el peor dolor, la media de sensación y FC, y el comentario', () => {
    const r = resumirHecha(ses, [
      { id_sesion: 1, dolor_muscular: 2, sensacion_tecnica: 3, fc_media: 150, notas_post: '' },
      { id_sesion: 1, dolor_muscular: 4, sensacion_tecnica: 4, fc_media: 141, notas_post: 'Pista mojada' },
      { id_sesion: 2, dolor_muscular: 5, notas_post: 'de otra sesión' },
    ])
    expect(r.dolor).toBe(4)
    expect(r.sensacion).toBe(3.5)
    expect(r.fcMedia).toBe(146)
    expect(r.comentario).toBe('Pista mojada')
  })

  it('sin RPE en la sesión, el de sus bloques', () => {
    const r = resumirHecha({ ...ses, rpe_reportado: null }, [
      { id_sesion: 1, rpe_reportado: 6 }, { id_sesion: 1, rpe_reportado: 8 },
    ])
    expect(r.rpeReal).toBe(7)
  })

  it('la nota de la sesión (modo entrenador) manda sobre la de los bloques', () => {
    expect(resumirHecha({ ...ses, notas_post: 'Dirigida en pista' }, [{ id_sesion: 1, notas_post: 'otra' }]).comentario)
      .toBe('Dirigida en pista')
  })

  it('las que se apunta él solo se marcan', () => {
    expect(resumirHecha({ ...ses, origen: 'deportista' }).porSuCuenta).toBe(true)
    expect(resumirHecha(ses).porSuCuenta).toBe(false)
  })

  it('sin datos del atleta, todo null y nada inventado', () => {
    const r = resumirHecha({ id: 9, fecha_sesion: '2026-09-01' })
    expect(r).toMatchObject({ minutosReales: null, rpeReal: null, desvio: null, dolor: null, sensacion: null, fcMedia: null, comentario: null })
  })
})
