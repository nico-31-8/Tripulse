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

  /* Probar en el móvil se hace por la IP del portátil, no por localhost. Sin
     esto, cada rato mirando la app en el teléfono devolvía al registro el mismo
     ruido de Fast Refresh que se filtró en agosto. */
  it('la IP de la red local también es desarrollo', () => {
    expect(esDesarrollo('192.168.1.40')).toBe(true)
    expect(esDesarrollo('10.0.0.5')).toBe(true)
    expect(esDesarrollo('172.16.3.9')).toBe(true)
    expect(esDesarrollo('172.31.255.255')).toBe(true)
    expect(esDesarrollo('169.254.1.1')).toBe(true)
  })

  it('pero una IP pública NO lo es, aunque se le parezca', () => {
    // 172.15 y 172.32 quedan fuera del rango privado, que es 172.16–172.31.
    expect(esDesarrollo('172.15.0.1')).toBe(false)
    expect(esDesarrollo('172.32.0.1')).toBe(false)
    // Y 11.x no es 10.x.
    expect(esDesarrollo('11.0.0.5')).toBe(false)
    expect(esDesarrollo('8.8.8.8')).toBe(false)
  })

  it('no se cuela un dominio que empiece por una IP privada', () => {
    expect(esDesarrollo('192.168.1.40.atacante.com')).toBe(false)
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
