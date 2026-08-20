import { describe, it, expect } from 'vitest'
import { TIPOS_MICROCICLO, tipoMicrociclo } from './microciclo-tipos'

describe('los tipos que la base admite', () => {
  it('son exactamente tres, y dos con tilde', () => {
    expect([...TIPOS_MICROCICLO]).toEqual(['Carga', 'Recuperación', 'Competición'])
  })

  /* Lo que devuelva SIEMPRE tiene que pasar el CHECK: es la única razón por la
     que existe esta función. */
  it('nunca devuelve algo fuera de la lista', () => {
    const raros = ['Taper', 'taper', 'Recuperacion', 'RECUPERACIÓN', 'Descarga', 'Realización',
      'Competicion', '', null, undefined, 'lo que sea', 'Choque']
    raros.forEach(r => expect(TIPOS_MICROCICLO as readonly string[], String(r)).toContain(tipoMicrociclo(r as any)))
  })

  it('«Taper» era el que reventaba el guardado, y ahora es Competición', () => {
    expect(tipoMicrociclo('Taper')).toBe('Competición')
  })

  it('la falta de tilde no cambia el significado', () => {
    // La ficha del microciclo comparaba contra «Recuperacion» sin tilde y nunca
    // acertaba: pintaba de azul lo que era verde.
    expect(tipoMicrociclo('Recuperacion')).toBe('Recuperación')
    expect(tipoMicrociclo('Competicion')).toBe('Competición')
  })

  it('lo que no se reconoce es Carga, no un error', () => {
    expect(tipoMicrociclo('vete a saber')).toBe('Carga')
    expect(tipoMicrociclo(null)).toBe('Carga')
  })
})
