import { describe, it, expect } from 'vitest'
import {
  PLANTILLAS_MOVILIDAD, plantillaMovilidadPorId, movilidadDe, ETIQUETA_MOMENTO,
} from './plantillas-movilidad'
import { PLANTILLAS_FUERZA, fuerzaDeFase } from './plantillas-fuerza'
import { ZONAS_FUERZA } from './zonas'

describe('el catálogo', () => {
  it('todo lo que hay es zona FLEX', () => {
    // Si algo entrara con otra zona, contaría como fuerza en la carga y en los
    // gráficos: una sesión de estiramientos sumaría como un día de gimnasio.
    expect(ZONAS_FUERZA.some(z => z.sigla === 'FLEX')).toBe(true)
    PLANTILLAS_MOVILIDAD.forEach(p =>
      p.bloques.forEach(b => expect(b.zona, p.id).toBe('FLEX')))
  })

  it('cada bloque dice repeticiones O segundos, nunca los dos ni ninguno', () => {
    // El que escribe la tarea decide por esto: con repeticiones va a
    // p_repeticiones, con segundos a p_duracion. Los dos a la vez o ninguno
    // crea la tarea sin dosis y no avisa.
    PLANTILLAS_MOVILIDAD.forEach(p => p.bloques.forEach(b => {
      const tiene = [b.repeticiones, b.segundos].filter(x => x != null).length
      expect(tiene, `${p.id} · ${b.ejercicio}`).toBe(1)
    }))
  })

  it('hay rutina de antes y de después para las tres disciplinas', () => {
    ;(['Natacion', 'Ciclismo', 'Carrera'] as const).forEach(d => {
      expect(movilidadDe('antes', d).length, 'antes ' + d).toBeGreaterThan(0)
      expect(movilidadDe('despues', d).length, 'después ' + d).toBeGreaterThan(0)
    })
  })

  it('la rutina general vale para cualquier disciplina', () => {
    const gen = PLANTILLAS_MOVILIDAD.filter(p => !p.disciplina)
    expect(gen.length).toBeGreaterThan(0)
    expect(movilidadDe('aparte', 'Natacion').map(p => p.id)).toContain('mov-completa')
  })

  it('los ids no se repiten y se resuelven', () => {
    const ids = PLANTILLAS_MOVILIDAD.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach(i => expect(plantillaMovilidadPorId(i), i).toBeDefined())
    expect(plantillaMovilidadPorId('no-existe')).toBeUndefined()
  })

  it('cada momento tiene etiqueta', () => {
    PLANTILLAS_MOVILIDAD.forEach(p => expect(ETIQUETA_MOMENTO[p.momento], p.id).toBeTruthy())
  })
})

describe('la separación con el catálogo de fuerza', () => {
  /* ESTE ES EL TEST QUE IMPORTA.
     El planificador hace `fuerzaDeFase(fase)[0]` en tres sitios. Si la movilidad
     entrara en PLANTILLAS_FUERZA con fases asignadas y saliera la primera, el
     atleta dejaría de hacer fuerza en esa fase y nada se quejaría. */
  it('la movilidad no está en el catálogo de fuerza', () => {
    const idsMov = new Set(PLANTILLAS_MOVILIDAD.map(p => p.id))
    PLANTILLAS_FUERZA.forEach(p => expect(idsMov.has(p.id), p.id).toBe(false))
  })

  it('lo que el planificador saca de cada fase sigue siendo fuerza de verdad', () => {
    const fases = ['pg-inicial', 'pg-avanzada', 'pe-inicial', 'pe-avanzada', 'tapering'] as const
    fases.forEach(f => {
      const p = fuerzaDeFase(f)[0]
      expect(p, f).toBeDefined()
      expect(p.bloques.every(b => b.zona === 'FLEX'), f).toBe(false)
    })
  })
})
