import { describe, it, expect } from 'vitest'
import {
  PRIORIDADES, prioridadDe, defDe, diasTaperDe, avisoDeObjetivos,
} from './competicion-prioridad'

describe('el catálogo', () => {
  it('son las tres de B1-02, de más a menos importante', () => {
    expect(PRIORIDADES.map(p => p.id)).toEqual(['A', 'B', 'C'])
  })

  it('el tapering baja con la importancia, y la C no lo tiene', () => {
    const [a, b, c] = PRIORIDADES
    expect(a.diasTaper).toBeGreaterThan(b.diasTaper)
    expect(c.diasTaper).toBe(0)
  })

  it('cada una tiene su símbolo y su color, distintos', () => {
    expect(new Set(PRIORIDADES.map(p => p.simbolo)).size).toBe(3)
    expect(new Set(PRIORIDADES.map(p => p.hex)).size).toBe(3)
  })
})

describe('leer la prioridad', () => {
  /* Con 'A' por defecto, cada carrera del año dispararía un tapering completo
     y el plan se llenaría de semanas suaves. Con 'C', el atleta llegaría
     fundido a su objetivo. La intermedia se equivoca poco en las dos. */
  it('lo que no está clasificado es secundaria', () => {
    expect(prioridadDe(null)).toBe('B')
    expect(prioridadDe({})).toBe('B')
    expect(prioridadDe({ prioridad: null })).toBe('B')
    expect(prioridadDe({ prioridad: 'lo que sea' })).toBe('B')
  })

  it('lee A y C, en mayúscula o minúscula', () => {
    expect(prioridadDe({ prioridad: 'A' })).toBe('A')
    expect(prioridadDe({ prioridad: 'c' })).toBe('C')
  })

  it('defDe siempre devuelve algo', () => {
    expect(defDe('A').etiqueta).toBe('Principal')
    expect(defDe('C').diasTaper).toBe(0)
  })
})

describe('cuántos días se afina', () => {
  /* La prioridad manda sobre la distancia: un Ironman de entrenamiento no se
     afina, y un sprint que es EL objetivo del año sí. */
  it('en la principal se usa la duración por distancia si se sabe', () => {
    expect(diasTaperDe('A', 19)).toBe(19)   // Ironman
    expect(diasTaperDe('A', 9)).toBe(9)     // sprint
  })

  it('sin distancia, la principal cae a su rango genérico', () => {
    expect(diasTaperDe('A')).toBe(defDe('A').diasTaper)
  })

  it('la secundaria y la de entrenamiento ignoran la distancia', () => {
    expect(diasTaperDe('B', 19)).toBe(6)
    expect(diasTaperDe('C', 19)).toBe(0)
  })
})

describe('el aviso de acumular objetivos', () => {
  const a = { prioridad: 'A' }
  it('con tres o menos no dice nada', () => {
    expect(avisoDeObjetivos([a, a, a])).toBeNull()
    expect(avisoDeObjetivos([])).toBeNull()
  })

  it('con más de tres avisa, porque no se llega en forma a todas', () => {
    expect(avisoDeObjetivos([a, a, a, a])).toMatch(/4 competiciones principales/)
  })

  it('las secundarias y las de entrenamiento no cuentan', () => {
    expect(avisoDeObjetivos([a, a, a, { prioridad: 'B' }, { prioridad: 'C' }, {}])).toBeNull()
  })
})
