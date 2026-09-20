import { describe, it, expect } from 'vitest'
import { hayDibujoGuardado, pantallaDeEntrada } from './entrada-dibujo'

describe('hay dibujo guardado', () => {
  it('con macrociclos dentro, sí', () => {
    expect(hayDibujoGuardado({ macros: [{ id: 'a' }] })).toBe(true)
  })

  /* El borrador se crea en cuanto se toca cualquier cosa, así que una fila
     vacía no es trabajo que recuperar: ofrecerla sería prometer un dibujo que
     no está. */
  it('una fila vacía no cuenta', () => {
    expect(hayDibujoGuardado({ macros: [] })).toBe(false)
    expect(hayDibujoGuardado({})).toBe(false)
    expect(hayDibujoGuardado(null)).toBe(false)
    expect(hayDibujoGuardado(undefined)).toBe(false)
  })

  it('un macros que no es lista no revienta', () => {
    expect(hayDibujoGuardado({ macros: 'vaya' as unknown as unknown[] })).toBe(false)
  })
})

describe('a qué pantalla se entra', () => {
  it('con plan confirmado, a elegir', () => {
    expect(pantallaDeEntrada([{ id: 1 }], null)).toBe('elegir')
  })

  /* EL FALLO QUE COSTÓ UNA TEMPORADA. Se dibujó todo y no se pulsó «Generar
     planificación», así que no había ni un macrociclo en la base. La pantalla
     mandaba a empezar de cero y, al dibujar el primer bloque, el autoguardado
     escribía encima del dibujo bueno. */
  it('sin plan pero con dibujo a medias, a elegir — NO a empezar de cero', () => {
    expect(pantallaDeEntrada([], { macros: [{ id: 'a' }] })).toBe('elegir')
    expect(pantallaDeEntrada(null, { macros: [{ id: 'a' }, { id: 'b' }] })).toBe('elegir')
  })

  it('con los dos, a elegir', () => {
    expect(pantallaDeEntrada([{ id: 1 }], { macros: [{ id: 'a' }] })).toBe('elegir')
  })

  it('sin nada de nada, a empezar de cero', () => {
    expect(pantallaDeEntrada([], null)).toBe('setup')
    expect(pantallaDeEntrada(null, { macros: [] })).toBe('setup')
    expect(pantallaDeEntrada(undefined, undefined)).toBe('setup')
  })
})
