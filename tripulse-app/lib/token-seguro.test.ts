import { describe, it, expect } from 'vitest'
import { tokenSeguro } from './token-seguro'

describe('el token del enlace de invitación', () => {
  it('tiene el largo que se le pide', () => {
    expect(tokenSeguro(32)).toHaveLength(32)
    expect(tokenSeguro(16)).toHaveLength(16)
  })

  it('vale para una URL: solo letras y números', () => {
    expect(tokenSeguro(64)).toMatch(/^[A-Za-z0-9]+$/)
  })

  /* Lo que arregla esto: el de antes llevaba `Date.now()` dentro, así que dos
     generados en el mismo momento compartían media cadena. */
  it('dos seguidos no se parecen', () => {
    const a = tokenSeguro(), b = tokenSeguro()
    expect(a).not.toBe(b)
    const comunes = [...a].filter((c, i) => c === b[i]).length
    expect(comunes).toBeLessThan(10)
  })

  it('mil tokens sin una sola repetición', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 1000; i++) vistos.add(tokenSeguro())
    expect(vistos.size).toBe(1000)
  })

  it('no lleva caracteres que se confundan al dictarlo', () => {
    expect(tokenSeguro(500)).not.toMatch(/[0O1lI]/)
  })
})
