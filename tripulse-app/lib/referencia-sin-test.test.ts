import { describe, it, expect } from 'vitest'
import {
  vamDeReferencia, cssDeReferencia, ritmoCSSDeReferencia, porQueAproximado, NIVEL_REFERENCIA,
} from './referencia-sin-test'
import { nivelVAM, nivelCSS } from './tests-campo'

describe('la VAM de referencia', () => {
  it('cae en el nivel medio, que es de donde se saca', () => {
    /* Si la referencia no cayera en su propio nivel, la tabla y esta función
       estarían diciendo cosas distintas. */
    expect(nivelVAM(vamDeReferencia('Hombre'), 'Hombre')).toBe(NIVEL_REFERENCIA)
    expect(nivelVAM(vamDeReferencia('Mujer'), 'Mujer')).toBe(NIVEL_REFERENCIA)
  })

  it('es el PUNTO MEDIO de la banda, no su suelo', () => {
    /* La banda «medio» en hombres va de 13 a 16. Coger 13 sería suponerle a
       todo el mundo el peor de los medios, y todas las estimaciones saldrían
       cortas: el mismo fallo que estamos arreglando, solo que más suave. */
    expect(vamDeReferencia('Hombre')).toBe(14.5)
    expect(vamDeReferencia('Mujer')).toBe(12.5)
  })

  it('sin sexo declarado, el punto medio entre los dos', () => {
    /* «Prefiero no decirlo» es una opción real del formulario. Elegir uno por
       defecto sería que la app le suponga un sexo a alguien para calcularle los
       ritmos, y eso no lo ha pedido nadie. */
    const n = vamDeReferencia('Prefiero no decirlo')
    expect(n).toBe(13.5)
    expect(n).toBeGreaterThan(vamDeReferencia('Mujer'))
    expect(n).toBeLessThan(vamDeReferencia('Hombre'))
    expect(vamDeReferencia(null)).toBe(n)
    expect(vamDeReferencia(undefined)).toBe(n)
    expect(vamDeReferencia('')).toBe(n)
  })

  it('siempre es un número usable', () => {
    for (const s of ['Hombre', 'Mujer', 'Prefiero no decirlo', null, undefined, 'otro']) {
      const v = vamDeReferencia(s as any)
      expect(v, String(s)).toBeGreaterThan(5)
      expect(v, String(s)).toBeLessThan(25)
    }
  })
})

describe('el CSS de referencia', () => {
  it('el ritmo cae en el nivel medio', () => {
    expect(nivelCSS(ritmoCSSDeReferencia('Hombre'), 'Hombre')).toBe(NIVEL_REFERENCIA)
    expect(nivelCSS(ritmoCSSDeReferencia('Mujer'), 'Mujer')).toBe(NIVEL_REFERENCIA)
  })

  it('EN METROS POR SEGUNDO, que es como lo guarda la app', () => {
    /* La tabla del documento va en segundos por 100 m —del orden de 110— y
       `test2_natacion.css` guarda m/s —del orden de 1,2—. Devolver los segundos
       aquí daría un nadador a 110 m/s: la duración estimada saldría ridícula y
       nada fallaría. */
    const h = cssDeReferencia('Hombre')
    expect(h).toBeGreaterThan(0.5)
    expect(h).toBeLessThan(2.5)
  })

  it('las dos unidades son la misma velocidad', () => {
    /* La tolerancia es de medio segundo por el redondeo a tres decimales del
       m/s. No importa afinar más: lo que vigila este test es que no se hayan
       cruzado las unidades, y eso fallaría por un factor de cien. */
    for (const s of ['Hombre', 'Mujer', null]) {
      const ms = cssDeReferencia(s as any)
      const seg = ritmoCSSDeReferencia(s as any)
      expect(100 / ms, String(s)).toBeCloseTo(seg, 0)
    }
  })

  it('un hombre de referencia nada más rápido que una mujer de referencia', () => {
    /* No es una opinión: son las bandas del documento. Si esto se invirtiera,
       es que se han cruzado las tablas. */
    expect(cssDeReferencia('Hombre')).toBeGreaterThan(cssDeReferencia('Mujer'))
    expect(ritmoCSSDeReferencia('Hombre')).toBeLessThan(ritmoCSSDeReferencia('Mujer'))
  })
})

describe('la explicación', () => {
  it('dice qué test falta y que se puede dejar de suponer', () => {
    expect(porQueAproximado('Carrera')).toContain('VAM')
    expect(porQueAproximado('Natacion')).toContain('CSS')
    for (const d of ['Carrera', 'Natacion'] as const) {
      expect(porQueAproximado(d)).toContain('test')
    }
  })
})
