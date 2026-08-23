import { describe, it, expect } from 'vitest'
import { ritmoObjetivoTexto } from './referencia-zona'

/*
  El fallo que motiva estos tests: `ritmo_objetivo` se guarda como TEXTO con la
  unidad dentro (lo que devuelve `prescripcion()`), pero dos pantallas del atleta
  lo leían como segundos y lo pasaban por un m:ss. `Math.floor('180–220 W' / 60)`
  es NaN, así que la caja naranja ponía «NaN:NaN /km».
*/
describe('ritmoObjetivoTexto', () => {
  it('devuelve el texto tal cual: ya trae su unidad dentro', () => {
    expect(ritmoObjetivoTexto('4:12–4:30 /km', 'Carrera')).toBe('4:12–4:30 /km')
    expect(ritmoObjetivoTexto('180–220 W', 'Ciclismo')).toBe('180–220 W')
    expect(ritmoObjetivoTexto('> 2:05 /100m', 'Natacion')).toBe('> 2:05 /100m')
    expect(ritmoObjetivoTexto('Por APR (sprint)', 'Ciclismo')).toBe('Por APR (sprint)')
  })

  it('NUNCA devuelve NaN, que era lo que se veía en pantalla', () => {
    for (const v of ['4:12–4:30 /km', '180–220 W', '> 2:05 /100m', 'CSS +20s', '85–95% VAM']) {
      expect(ritmoObjetivoTexto(v, 'Carrera')).not.toContain('NaN')
    }
  })

  it('una fila antigua guardada en segundos sí se formatea, y con su unidad', () => {
    expect(ritmoObjetivoTexto(252, 'Carrera')).toBe('4:12 /km')
    expect(ritmoObjetivoTexto('252', 'Carrera')).toBe('4:12 /km')
    expect(ritmoObjetivoTexto(125, 'Natacion')).toBe('2:05 /100m')
    expect(ritmoObjetivoTexto(125, 'Natación')).toBe('2:05 /100m')
  })

  it('rellena el segundo a dos cifras', () => {
    expect(ritmoObjetivoTexto(245, 'Carrera')).toBe('4:05 /km')
    expect(ritmoObjetivoTexto(240, 'Carrera')).toBe('4:00 /km')
  })

  it('sin disciplina cae a /km, que es el caso mayoritario', () => {
    expect(ritmoObjetivoTexto(252)).toBe('4:12 /km')
    expect(ritmoObjetivoTexto(252, null)).toBe('4:12 /km')
  })

  it('vacío es null, para que la caja naranja no se pinte', () => {
    expect(ritmoObjetivoTexto(null)).toBeNull()
    expect(ritmoObjetivoTexto(undefined)).toBeNull()
    expect(ritmoObjetivoTexto('')).toBeNull()
    expect(ritmoObjetivoTexto('   ')).toBeNull()
    expect(ritmoObjetivoTexto(0)).toBeNull()
  })
})
