import { describe, it, expect } from 'vitest'
import { COMPLEJOS, esComplejo, grupoAlCrear, grupoAlEditar } from './grupo-ejercicio'

describe('el grupo de un ejercicio nuevo', () => {
  it('un complejo va a Complejos aunque tenga regiones', () => {
    expect(grupoAlCrear(['Fuerza', COMPLEJOS], ['Cuádriceps', 'Hombro'])).toBe(COMPLEJOS)
  })

  it('el resto, a su primera región, como siempre', () => {
    expect(grupoAlCrear(['Fuerza'], ['Glúteos', 'Isquiotibiales'])).toBe('Glúteos')
  })

  it('sin región: Movilidad u Otros', () => {
    expect(grupoAlCrear(['Movilidad'], [])).toBe('Movilidad y flexibilidad')
    expect(grupoAlCrear(['Fuerza'], [])).toBe('Otros')
    expect(grupoAlCrear(null, null)).toBe('Otros')
  })
})

describe('el grupo al editar', () => {
  it('al marcarlo como complejo, pasa a Complejos', () => {
    expect(grupoAlEditar('Hombro y manguito rotador', ['Fuerza', COMPLEJOS], ['Hombro'])).toBe(COMPLEJOS)
  })

  it('al quitarle la etiqueta, vuelve a su región', () => {
    expect(grupoAlEditar(COMPLEJOS, ['Fuerza'], ['Hombro'])).toBe('Hombro')
  })

  /* Los de disciplina no tienen región a propósito: rehacerles el grupo los
     mandaría a «Otros». */
  it('si no entra ni sale de Complejos, no se toca', () => {
    expect(grupoAlEditar('Natación — específico', ['Fuerza'], [])).toBeNull()
    expect(grupoAlEditar(COMPLEJOS, ['Fuerza', COMPLEJOS], ['Hombro'])).toBeNull()
  })
})

describe('qué es un complejo', () => {
  it('lo dice la etiqueta', () => {
    expect(esComplejo(['Fuerza', COMPLEJOS])).toBe(true)
    expect(esComplejo(['Fuerza'])).toBe(false)
    expect(esComplejo(undefined)).toBe(false)
  })
})
