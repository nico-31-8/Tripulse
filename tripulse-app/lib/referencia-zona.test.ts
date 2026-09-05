import { describe, it, expect } from 'vitest'
import { ritmoObjetivoTexto, objetivoDeZona, deDondeSale } from './referencia-zona'

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

describe('el objetivo de una zona cuando el atleta no tiene tests', () => {
  const CON_VAM = { vam: 15, css: null, ftp: null }
  const SIN_NADA = { vam: null, css: null, ftp: null }

  it('con el test que toca, manda el ritmo', () => {
    const o = objetivoDeZona('Z2', 'Carrera', CON_VAM, 190)
    expect(o?.de).toBe('tests')
    expect(o?.texto).toContain('/km')
  })

  it('SIN test pero con FC máxima, las pulsaciones: sigue siendo un número que mira en el reloj', () => {
    const o = objetivoDeZona('Z2', 'Carrera', SIN_NADA, 190)
    expect(o?.de).toBe('fc')
    expect(o?.texto).toContain('ppm')
  })

  it('sin test y sin FC máxima, el RPE: no necesita nada y ya lo usa al reportar', () => {
    const o = objetivoDeZona('Z2', 'Carrera', SIN_NADA, 0)
    expect(o?.de).toBe('esfuerzo')
    expect(o?.texto).toMatch(/^RPE /)
  })

  it('NUNCA vuelve vacío por no tener tests: ese era el agujero', () => {
    // Antes, sin test la caja entera no se pintaba y el atleta abría un rodaje
    // de 40 minutos sin ninguna referencia de a cuánto ir.
    for (const d of ['Carrera', 'Ciclismo', 'Natacion']) {
      for (const z of ['Z1', 'Z2', 'Z4', 'Z5']) {
        const o = objetivoDeZona(z, d, SIN_NADA, 0)
        expect(o, d + ' ' + z).not.toBeNull()
        expect(o!.texto.length).toBeGreaterThan(0)
      }
    }
  })

  it('el porcentaje se queda fuera: es un porcentaje de un número que no tiene', () => {
    const o = objetivoDeZona('Z2', 'Carrera', SIN_NADA, 0)
    expect(o?.texto).not.toContain('% VAM')
  })

  it('una zona que no existe no inventa nada', () => {
    expect(objetivoDeZona('ZX', 'Carrera', CON_VAM, 190)).toBeNull()
    expect(objetivoDeZona('', 'Carrera', CON_VAM, 190)).toBeNull()
    expect(objetivoDeZona(null, 'Carrera', CON_VAM, 190)).toBeNull()
  })

  it('la explicación dice la verdad sobre de dónde salió', () => {
    expect(deDondeSale('tests')).toContain('tests')
    expect(deDondeSale('fc')).toContain('frecuencia cardiaca')
    expect(deDondeSale('esfuerzo')).toContain('esfuerzo')
    // Las dos de respaldo avisan de que le falta el test.
    expect(deDondeSale('fc')).toContain('test')
    expect(deDondeSale('esfuerzo')).toContain('test')
  })
})
