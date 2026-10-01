// ============================================================
// El nombre de una casilla, y cómo se lee en una fórmula
// ============================================================
//
// EL CASO. Una casilla pedía DOS nombres: el que se ve —«Tiempo»— y una
// «clave» —«t100»— que no aparece en ninguna parte al pasar el test. Es el
// nombre con el que la llaman las fórmulas, y había que inventársela,
// escribirla corta y acordarse de ella tres pasos después.
//
// LO QUE SE HACE: la clave se PROPONE sola a partir del nombre y se puede
// cambiar. Y las fórmulas pasan a leerse con el nombre de verdad —«media de
// Tiempo»— porque una fórmula que no se puede leer no se puede revisar.

import { describe, it, expect } from 'vitest'
import { claveDesdeNombre, claveEsAutomatica, etiquetaFn, etiquetaFn2, fnB } from './lab-constructor'

describe('la clave sale del nombre', () => {
  it('lo normal', () => {
    expect(claveDesdeNombre('Tiempo')).toBe('tiempo')
    expect(claveDesdeNombre('Tiempo del 100')).toBe('tiempo_del_100')
  })

  it('sin tildes ni eñes, que el motor las lee como otra cosa', () => {
    expect(claveDesdeNombre('Pulsación máxima')).toBe('pulsacion_maxima')
    expect(claveDesdeNombre('Año')).toBe('ano')
  })

  it('los símbolos se van, y no dejan rayas sueltas en las puntas', () => {
    expect(claveDesdeNombre('  ¿Metros?  ')).toBe('metros')
    expect(claveDesdeNombre('FC (ppm)')).toBe('fc_ppm')
    expect(claveDesdeNombre('%VAM')).toBe('vam')
  })

  it('NO PUEDE EMPEZAR POR UN NÚMERO: el motor lo leería como una cuenta', () => {
    expect(claveDesdeNombre('400 metros')).toBe('d400_metros')
  })

  it('NI LLAMARSE COMO UNA FUNCIÓN, que es lo que rompería la fórmula', () => {
    /* `media(media)` no hay quien lo lea, ni el motor ni nadie. */
    expect(claveDesdeNombre('media')).toBe('media_')
    expect(claveDesdeNombre('Suma')).toBe('suma_')
    expect(claveDesdeNombre('interpola')).toBe('interpola_')
    expect(claveDesdeNombre('antes')).toBe('antes_')
  })

  it('sin nombre, algo que valga', () => {
    expect(claveDesdeNombre('')).toBe('dato')
    expect(claveDesdeNombre('   ')).toBe('dato')
    expect(claveDesdeNombre('¿¿??')).toBe('dato')
  })

  it('y no se desmadra de larga', () => {
    expect(claveDesdeNombre('Tiempo total acumulado de toda la serie larguísima').length).toBeLessThanOrEqual(24)
  })
})

describe('el nombre y la clave van juntos hasta que la tocas', () => {
  it('reconoce la que se puso sola', () => {
    expect(claveEsAutomatica('tiempo', 'Tiempo')).toBe(true)
  })

  it('y la que pusiste tú', () => {
    /* En cuanto la cambias a mano dejan de ir juntas: cambiar el nombre no
       puede renombrarte una clave que elegiste. */
    expect(claveEsAutomatica('t100', 'Tiempo')).toBe(false)
  })
})

describe('las fórmulas se leen con el nombre', () => {
  const nombres = { t100: 'Tiempo', vel: 'Velocidad', lac: 'Lactato' }

  it('«media de Tiempo» y no «media(t100)»', () => {
    expect(etiquetaFn(fnB('media', 't100') as never, nombres)).toBe('media de Tiempo')
  })

  it('con tramo, igual de legible', () => {
    expect(etiquetaFn(fnB('media', 't100', 2, 0) as never, nombres)).toBe('media de Tiempo · sin la 1.ª')
    expect(etiquetaFn(fnB('suma', 't100', 2, 2) as never, nombres)).toBe('la 2.ª de Tiempo')
  })

  it('las de dos columnas también', () => {
    expect(etiquetaFn2({ t: 'fn2', v: 'interpola', x: 'vel', y: 'lac', a: 4 }, nombres))
      .toBe('Velocidad cuando Lactato = 4')
    expect(etiquetaFn2({ t: 'fn2', v: 'dmax', x: 'vel', y: 'lac', a: 3 }, nombres))
      .toBe('Dmax Velocidad→Lactato (curva)')
  })

  it('SIN diccionario sigue funcionando: la clave', () => {
    /* Lo pintan sitios que no siempre tienen el test delante. */
    expect(etiquetaFn(fnB('media', 't100') as never)).toBe('media de t100')
    expect(etiquetaFn2({ t: 'fn2', v: 'pendiente', x: 'vel', y: 'lac' })).toBe('pendiente vel→lac')
  })

  it('y una casilla sin nombre puesto cae en su clave, no en un hueco', () => {
    expect(etiquetaFn(fnB('media', 'otra') as never, nombres)).toBe('media de otra')
  })
})
