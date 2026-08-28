import { describe, it, expect } from 'vitest'
import { esDesarrollo, esRuido } from './eventos-filtros'

describe('dónde estoy corriendo', () => {
  /* El motivo de que esto exista: el registro llevaba desde agosto lleno de
     «X is not defined» de Fast Refresh, y ni un solo error de producción. */
  it('localhost es desarrollo', () => {
    expect(esDesarrollo('localhost')).toBe(true)
    expect(esDesarrollo('127.0.0.1')).toBe(true)
    expect(esDesarrollo('mi-portatil.local')).toBe(true)
  })

  it('el dominio de verdad no lo es', () => {
    expect(esDesarrollo('tripulse-eight.vercel.app')).toBe(false)
    expect(esDesarrollo('tripulse.app')).toBe(false)
  })

  it('no se cuela un dominio que solo CONTENGA localhost', () => {
    expect(esDesarrollo('localhost.atacante.com')).toBe(false)
  })

  it('da igual cómo esté escrito', () => {
    expect(esDesarrollo('LOCALHOST')).toBe(true)
  })
})

describe('el ruido que no es de nadie', () => {
  /* Lo suelta el cliente de Supabase con varias pestañas abiertas: se coordinan
     para refrescar el token y una le quita el turno a otra. Es lo esperado. */
  it('el lock de Supabase entre pestañas no se registra', () => {
    expect(esRuido("Lock broken by another request with the 'steal' option.")).toBe(true)
  })

  it('ni el bucle del ResizeObserver', () => {
    expect(esRuido('ResizeObserver loop completed with undelivered notifications')).toBe(true)
  })

  it('pero un error de verdad sí', () => {
    expect(esRuido('Cannot read properties of undefined')).toBe(false)
    expect(esRuido('ritmoObjetivoTexto is not defined')).toBe(false)
  })

  it('sin mensaje no revienta', () => {
    expect(esRuido('')).toBe(false)
    expect(esRuido(undefined as any)).toBe(false)
  })
})
