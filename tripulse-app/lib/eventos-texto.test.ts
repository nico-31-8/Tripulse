import { describe, it, expect } from 'vitest'
import { pilaCorta, unEvento, eventosComoTexto } from './eventos-texto'

const ev = (p: any = {}) => ({
  ts: '2026-08-26T21:56:00Z', nivel: 'error', origen: '/apuntar', quien: 'Deportista 1',
  mensaje: 'bibliotecaQ(...).select is not a function', ...p,
})

describe('la pila', () => {
  /* Una pila entera son 1200 caracteres casi todos de rutas compiladas. Quince
     de esas no se pueden leer. */
  it('se queda con las primeras líneas', () => {
    const detalle = { pila: 'TypeError: x\n  at a (chunk.js:1)\n  at b (chunk.js:2)\n  at c\n  at d' }
    expect(pilaCorta(detalle).split('\n')).toHaveLength(3)
  })

  it('sin pila no inventa nada', () => {
    expect(pilaCorta({})).toBe('')
    expect(pilaCorta(null)).toBe('')
    expect(pilaCorta({ pila: '   ' })).toBe('')
  })
})

describe('un error suelto', () => {
  it('lleva número, fecha, ruta y quién', () => {
    const t = unEvento(ev(), 1)
    expect(t).toContain('[1]')
    expect(t).toContain('/apuntar')
    expect(t).toContain('Deportista 1')
    expect(t).toContain('bibliotecaQ')
  })

  it('sin ruta ni persona no deja separadores sueltos', () => {
    const t = unEvento(ev({ origen: null, quien: null }), 1)
    expect(t).not.toMatch(/· *\n/)
  })

  it('una fecha rota no rompe la línea', () => {
    expect(unEvento(ev({ ts: 'vaya' }), 1)).toContain('sin fecha')
  })
})

describe('el bloque entero', () => {
  it('dice cuántos hay en la cabecera', () => {
    expect(eventosComoTexto([ev(), ev()])).toMatch(/2 de 2 errores/)
  })

  /* Pegar cien errores en un chat no ayuda a nadie: se corta y se dice. */
  it('se corta en el tope y avisa de los que faltan', () => {
    const muchos = Array.from({ length: 50 }, () => ev())
    const t = eventosComoTexto(muchos, 40)
    expect(t).toMatch(/40 de 50 errores/)
    expect(t).toMatch(/hay 10 más/)
  })

  it('sin recorte no menciona los que faltan', () => {
    expect(eventosComoTexto([ev()], 40)).not.toMatch(/más/)
  })

  it('vacío lo dice, no devuelve una cadena rara', () => {
    expect(eventosComoTexto([])).toBe('Sin errores registrados.')
    expect(eventosComoTexto(null)).toBe('Sin errores registrados.')
  })
})
