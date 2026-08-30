import { describe, it, expect } from 'vitest'
import {
  anadirZona, quitarZona, cuantasDe, chipsNuevos, chipDeBrick, textoBoton, resumenSeleccion,
} from './chips-nuevos'

// Generador de pega: ids predecibles para poder comprobarlos.
const contador = () => { let n = 0; return () => 'id' + (++n) }

describe('anadirZona / quitarZona / cuantasDe', () => {
  it('añade al final', () => {
    expect(anadirZona(['AER'], 'PAE')).toEqual(['AER', 'PAE'])
  })

  it('deja repetir la misma zona', () => {
    expect(anadirZona(['AER'], 'AER')).toEqual(['AER', 'AER'])
  })

  it('cuenta las repeticiones', () => {
    expect(cuantasDe(['AER', 'PAE', 'AER'], 'AER')).toBe(2)
    expect(cuantasDe(['AER', 'PAE', 'AER'], 'AEL')).toBe(0)
  })

  it('quitar deja una menos, no todas', () => {
    expect(quitarZona(['AER', 'AER', 'AER'], 'AER')).toEqual(['AER', 'AER'])
  })

  it('quita la última, no la primera: así el orden de lo demás no se mueve', () => {
    expect(quitarZona(['AER', 'PAE', 'AER'], 'AER')).toEqual(['AER', 'PAE'])
  })

  it('añadir y quitar deja la lista como estaba', () => {
    const antes = ['AER', 'PAE', 'AEL']
    expect(quitarZona(anadirZona(antes, 'PAE'), 'PAE')).toEqual(antes)
  })

  it('quitar algo que no está no rompe nada', () => {
    expect(quitarZona(['AER'], 'PAE')).toEqual(['AER'])
    expect(quitarZona([], 'PAE')).toEqual([])
  })

  it('ninguna de las dos muta la lista que recibe', () => {
    const original = ['AER', 'PAE']
    anadirZona(original, 'AEL')
    quitarZona(original, 'AER')
    expect(original).toEqual(['AER', 'PAE'])
  })

  it('conserva el orden en que se eligieron', () => {
    let s: string[] = []
    for (const z of ['PAE', 'AER', 'AEL']) s = anadirZona(s, z)
    expect(s).toEqual(['PAE', 'AER', 'AEL'])
  })
})

describe('chipsNuevos', () => {
  it('saca un chip por cada marca', () => {
    expect(chipsNuevos(3, 'Natacion', ['AER', 'PAE'], contador())).toHaveLength(2)
  })

  it('dos AER son DOS chips, no uno', () => {
    const chips = chipsNuevos(3, 'Natacion', ['AER', 'AER'], contador())
    expect(chips).toHaveLength(2)
    expect(chips.every(c => c.zona === 'AER')).toBe(true)
  })

  it('cada chip lleva su propio id', () => {
    const chips = chipsNuevos(3, 'Natacion', ['AER', 'PAE', 'AEL'], contador())
    expect(new Set(chips.map(c => c.id)).size).toBe(3)
  })

  it('ids distintos incluso repitiendo la misma zona', () => {
    const chips = chipsNuevos(3, 'Natacion', ['AER', 'AER'], contador())
    expect(chips[0].id).not.toBe(chips[1].id)
  })

  it('todos van a la misma semana y disciplina', () => {
    const chips = chipsNuevos(7, 'Carrera', ['AER', 'PAE'], contador())
    expect(chips.every(c => c.semana === 7 && c.disciplina === 'Carrera')).toBe(true)
  })

  it('respeta el orden de la selección', () => {
    expect(chipsNuevos(0, 'Fuerza', ['FMH', 'FLEX'], contador()).map(c => c.zona)).toEqual(['FMH', 'FLEX'])
  })

  it('sin zonas marcadas no sale ningún chip', () => {
    expect(chipsNuevos(0, 'Fuerza', [], contador())).toEqual([])
  })

  it('un chip normal no lleva brick', () => {
    expect(chipsNuevos(0, 'Carrera', ['AER'], contador())[0].brick).toBeUndefined()
  })
})

describe('chipDeBrick', () => {
  it('va solo, con disciplina Brick y sus bloques', () => {
    const b = { bloques: [{ disciplina: 'Ciclismo', zona: 'AEM', minutos: 40 }] } as any
    const chip = chipDeBrick(2, 'AEM', b, contador())
    expect(chip).toMatchObject({ semana: 2, disciplina: 'Brick', zona: 'AEM' })
    expect(chip.brick).toBe(b)
  })
})

describe('textoBoton', () => {
  it('dice cuántas van cuando son varias', () => {
    expect(textoBoton(3)).toBe('Añadir (3)')
  })
  it('no pone (1) para una sola', () => {
    expect(textoBoton(1)).toBe('Añadir')
  })
  it('ni (0) cuando no hay nada', () => {
    expect(textoBoton(0)).toBe('Añadir')
  })
})

describe('resumenSeleccion', () => {
  it('agrupa las repetidas con su número', () => {
    expect(resumenSeleccion(['AER', 'PAE', 'AER'])).toBe('2 AER · PAE')
  })
  it('mantiene el orden de la primera vez que salió cada zona', () => {
    expect(resumenSeleccion(['PAE', 'AER', 'PAE'])).toBe('2 PAE · AER')
  })
  it('vacío cuando no hay nada marcado', () => {
    expect(resumenSeleccion([])).toBe('')
  })
})
