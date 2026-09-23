import { describe, it, expect } from 'vitest'
import { ordenarChips, abreGrupo, grupoDeChip, ORDEN_DISCIPLINA, sinSitio } from './orden-chips'

const c = (disciplina: string, zona: string, id = disciplina + zona) => ({ id, disciplina, zona })

describe('el orden de una semana', () => {
  it('fuerza arriba y carrera abajo', () => {
    const r = ordenarChips([c('Carrera', 'AEL'), c('Fuerza', 'FMH'), c('Natacion', 'AEM')])
    expect(r.map(x => x.disciplina)).toEqual(['Fuerza', 'Natacion', 'Carrera'])
  })

  it('dentro del deporte, de más duro a más suave', () => {
    const r = ordenarChips([c('Fuerza', 'FLEX'), c('Fuerza', 'FMI'), c('Fuerza', 'FEC')])
    expect(r.map(x => x.zona)).toEqual(['FMI', 'FEC', 'FLEX'])
  })

  it('los sin zona cierran SU grupo, no la columna', () => {
    const r = ordenarChips([c('Carrera', ''), c('Fuerza', 'FLEX'), c('Carrera', 'PAE')])
    expect(r.map(x => x.disciplina + ':' + x.zona)).toEqual(['Fuerza:FLEX', 'Carrera:PAE', 'Carrera:'])
  })

  it('la semana real de Bruno, once chips', () => {
    const semana = [
      c('Fuerza', 'FEA', 'a'), c('Fuerza', 'FLEX', 'b'), c('Fuerza', 'FLEX', 'c'), c('Fuerza', 'FMH', 'd'),
      c('Carrera', 'AEI', 'e'), c('Carrera', '', 'f'), c('Carrera', '', 'g'), c('Carrera', 'AEL', 'h'),
      c('Carrera', '', 'i'), c('Carrera', 'PAE', 'j'), c('Fuerza', 'FLEX', 'k'),
    ]
    /* FEA por encima de FMH no es un despiste: la explosiva acíclica es
       nivel 5 en el catálogo de zonas y la hipertrofia nivel 4. */
    expect(ordenarChips(semana).map(x => x.zona || 'sin')).toEqual([
      'FEA', 'FMH', 'FLEX', 'FLEX', 'FLEX',
      'PAE', 'AEI', 'AEL', 'sin', 'sin', 'sin',
    ])
  })

  it('no pierde ni duplica ninguno, y no toca el array que le dan', () => {
    const semana = [c('Carrera', 'AEL'), c('Fuerza', 'FMH')]
    const copia = [...semana]
    expect(ordenarChips(semana)).toHaveLength(2)
    expect(semana).toEqual(copia)
  })

  it('«Natación» con tilde es el mismo grupo que «Natacion»', () => {
    expect(grupoDeChip({ disciplina: 'Natación' })).toBe('Natacion')
    const r = ordenarChips([c('Carrera', 'AEL'), c('Natación', 'AEM'), c('Natacion', 'PAE')])
    expect(r.map(x => x.disciplina)).toEqual(['Natacion', 'Natación', 'Carrera'])
  })

  it('a igual nivel, desempata el esfuerzo: el AEM por encima del AEL', () => {
    const r = ordenarChips([c('Carrera', 'AEL'), c('Carrera', 'AEM')])
    expect(r.map(x => x.zona)).toEqual(['AEM', 'AEL'])
  })

  it('una disciplina desconocida va al final, pero SALE', () => {
    const r = ordenarChips([c('Remo', 'AEL'), c('Fuerza', 'FMH')])
    expect(r.map(x => x.disciplina)).toEqual(['Fuerza', 'Remo'])
  })
})

describe('el hueco entre deportes', () => {
  it('se abre al cambiar de deporte, nunca en el primero', () => {
    const lista = ordenarChips([c('Carrera', 'AEL'), c('Fuerza', 'FMH'), c('Fuerza', 'FLEX')])
    expect([0, 1, 2].map(i => abreGrupo(lista, i))).toEqual([false, false, true])
  })
})

describe('el catálogo no se queda fuera', () => {
  it('toda disciplina del catálogo tiene su sitio en el orden', () => {
    /* Si mañana se añade una disciplina nueva y nadie le da sitio, sus chips
       irían todos al final sin que nadie lo hubiera decidido. */
    expect(sinSitio()).toEqual([])
  })

  it('y el orden no se inventa disciplinas', () => {
    expect(ORDEN_DISCIPLINA).toHaveLength(6)
  })
})
