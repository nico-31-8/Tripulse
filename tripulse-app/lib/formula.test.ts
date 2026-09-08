import { describe, it, expect } from 'vitest'
import {
  evaluar, textoDe, dependencias, estaEncadenada,
  motivoNombreMalo, renombrarEn, RE_NOMBRE, type Bloque,
} from './formula'

const v = (n: string): Bloque => ({ t: 'var', v: n })
const r = (n: string): Bloque => ({ t: 'ref', v: n })
const op = (o: string): Bloque => ({ t: 'op', v: o })
const num = (n: number): Bloque => ({ t: 'num', v: n })

describe('evaluar', () => {
  it('lo básico, con la precedencia correcta', () => {
    expect(evaluar('2 + 3 * 4', {})).toBe(14)
    expect(evaluar('( 2 + 3 ) * 4', {})).toBe(20)
    expect(evaluar('2 ^ 3 ^ 2', {})).toBe(512)   // la potencia asocia por la derecha
    expect(evaluar('- 5 + 2', {})).toBe(-3)
    expect(evaluar('10 / 4', {})).toBe(2.5)
  })

  it('usa las variables que se le pasan', () => {
    expect(evaluar('metros / 200', { metros: 3200 })).toBe(16)
  })

  it('acepta el valor como texto, que es como llega de un input', () => {
    expect(evaluar('metros / 200', { metros: '3200' })).toBe(16)
  })

  it('LAS TILDES SON LETRAS: un acento no puede convertir un nombre en otro', () => {
    /* Este es el fallo que más importa de todo el fichero. Con el tokenizador
       viejo, «metrosñ» se quedaba en «metros» —que existe— y devolvía 3200 en
       vez de fallar. No era un error: era un número equivocado. */
    expect(evaluar('metrosñ', { 'metrosñ': 7, metros: 3200 })).toBe(7)
    expect(evaluar('vUAñ * 2', { 'vUAñ': 6 })).toBe(12)
  })

  it('lo que no existe se dice con su nombre', () => {
    expect(() => evaluar('VAM * 2', {})).toThrow('no existe «VAM»')
  })

  it('una variable que no es un número tampoco pasa', () => {
    expect(() => evaluar('x + 1', { x: 'hola' })).toThrow('no es un número')
  })

  it('VACÍO NO ES CERO, aunque JavaScript diga que sí', () => {
    /* `Number(null)`, `Number('')` y `Number([])` valen 0. Sin guarda, un campo
       sin rellenar calcularía en silencio: una VAM de 0, un ritmo infinito. Lo
       que hay que decir es que falta el dato, no dar un número. */
    expect(() => evaluar('metros / 200', { metros: null })).toThrow('falta rellenar «metros»')
    expect(() => evaluar('metros / 200', { metros: '' })).toThrow('falta rellenar')
    expect(() => evaluar('metros / 200', { metros: '  ' })).toThrow('falta rellenar')
    expect(() => evaluar('metros / 200', { metros: undefined })).toThrow('falta rellenar')
  })

  it('pero un cero escrito a propósito SÍ es un cero', () => {
    expect(evaluar('x + 1', { x: 0 })).toBe(1)
    expect(evaluar('x + 1', { x: '0' })).toBe(1)
  })

  it('los errores de escritura se explican', () => {
    expect(() => evaluar('2 +', {})).toThrow('a medias')
    expect(() => evaluar('( 2 + 3', {})).toThrow('paréntesis')
    expect(() => evaluar('2 3', {})).toThrow('sobra «3»')
    expect(() => evaluar('5 / 0', {})).toThrow('división por cero')
  })

  it('una fórmula vacía no devuelve 0 disimulando', () => {
    expect(() => evaluar('', {})).toThrow()
  })

  it('NO HAY FORMA DE COLAR CÓDIGO: lo que no es número, operador o nombre, no existe', () => {
    // Da igual de dónde venga el texto —de la base de datos, por ejemplo—:
    // el analizador solo conoce estas cuatro cosas.
    expect(() => evaluar('process.exit(1)', {})).toThrow()
    expect(() => evaluar('[1,2]', {})).toThrow()
    expect(() => evaluar('1; drop table', {})).toThrow()
  })

  it('un infinito no se cuela como resultado', () => {
    expect(() => evaluar('9 ^ 9 ^ 9', {})).toThrow('no es un número')
  })
})

describe('los bloques', () => {
  const cooper: Bloque[] = [v('metros'), op('/'), num(200)]
  const ritmo: Bloque[] = [num(60), op('/'), r('VAM')]

  it('se juntan en texto solo para evaluar', () => {
    expect(textoDe(cooper)).toBe('metros / 200')
    expect(evaluar(textoDe(cooper), { metros: 3200 })).toBe(16)
  })

  it('dicen de qué dependen, separando campos de resultados', () => {
    expect(dependencias(cooper)).toEqual({ campos: ['metros'], refs: [] })
    expect(dependencias(ritmo)).toEqual({ campos: [], refs: ['VAM'] })
  })

  it('no repiten una dependencia usada dos veces', () => {
    const f: Bloque[] = [r('VAM'), op('+'), r('VAM')]
    expect(dependencias(f).refs).toEqual(['VAM'])
  })

  it('encadenada es la que nombra a otro resultado; suelta, la que no', () => {
    expect(estaEncadenada(ritmo)).toBe(true)
    expect(estaEncadenada(cooper)).toBe(false)
    expect(estaEncadenada([])).toBe(false)
  })
})

describe('los nombres', () => {
  const claves = { campos: ['metros', 'pulso_final'], resultados: ['VAM', 'ritmo'] }

  it('un nombre normal vale', () => {
    expect(motivoNombreMalo('vUAn', 'resultado', 9, claves)).toBeNull()
    expect(motivoNombreMalo('FC_final', 'resultado', 9, claves)).toBeNull()
  })

  it('con tilde y con eñe también: estamos en español', () => {
    expect(motivoNombreMalo('vUAñ', 'resultado', 9, claves)).toBeNull()
    expect(RE_NOMBRE.test('máx')).toBe(true)
  })

  it('sin espacios, y se dice qué hacer en su lugar', () => {
    expect(motivoNombreMalo('Ritmo medio', 'resultado', 9, claves)).toContain('guion bajo')
  })

  it('no puede empezar por número ni llevar símbolos', () => {
    expect(motivoNombreMalo('2VAM', 'resultado', 9, claves)).toContain('empiece por letra')
    expect(motivoNombreMalo('VAM%', 'resultado', 9, claves)).toContain('empiece por letra')
  })

  it('vacío no vale', () => {
    expect(motivoNombreMalo('', 'resultado', 9, claves)).toBe('Ponle un nombre')
    expect(motivoNombreMalo('   ', 'resultado', 9, claves)).toBe('Ponle un nombre')
  })

  it('NO SE PUEDE REPETIR, ni entre campos y resultados', () => {
    // Si un resultado se llamara «metros», la fórmula que use «metros» ya no
    // sabría a cuál se refiere — y el evaluador cogería uno sin avisar.
    expect(motivoNombreMalo('metros', 'resultado', 9, claves)).toContain('Ya hay otro')
    expect(motivoNombreMalo('VAM', 'campo', 9, claves)).toContain('Ya hay otro')
  })

  it('un nombre puede seguir siendo el suyo: no choca consigo mismo', () => {
    expect(motivoNombreMalo('VAM', 'resultado', 0, claves)).toBeNull()
    expect(motivoNombreMalo('metros', 'campo', 0, claves)).toBeNull()
  })
})

describe('renombrar arrastra las fórmulas', () => {
  const formulas: Bloque[][] = [
    [v('metros'), op('/'), num(200)],
    [num(60), op('/'), r('VAM')],
    [r('VAM'), op('*'), num(0.85)],
  ]

  it('cambiar un resultado actualiza a los que lo usaban', () => {
    const out = renombrarEn(formulas, 'ref', 'VAM', 'VAM12')
    expect(out.map(textoDe)).toEqual(['metros / 200', '60 / VAM12', 'VAM12 * 0.85'])
  })

  it('cambiar un campo actualiza sus bloques', () => {
    const out = renombrarEn(formulas, 'var', 'metros', 'distancia')
    expect(textoDe(out[0])).toBe('distancia / 200')
  })

  it('no confunde un campo con un resultado que se llame igual', () => {
    // Aunque no debería poder pasar —la validación lo impide—, si pasara no
    // debe renombrar el que no toca.
    const f: Bloque[][] = [[v('x'), op('+'), r('x')]]
    expect(textoDe(renombrarEn(f, 'ref', 'x', 'y')[0])).toBe('x + y')
  })

  it('no muta lo que se le pasa', () => {
    renombrarEn(formulas, 'ref', 'VAM', 'OTRO')
    expect(textoDe(formulas[1])).toBe('60 / VAM')
  })

  it('renombrar a lo mismo, o a nada, no toca nada', () => {
    expect(renombrarEn(formulas, 'ref', 'VAM', 'VAM')).toBe(formulas)
    expect(renombrarEn(formulas, 'ref', 'VAM', '')).toBe(formulas)
    expect(renombrarEn(formulas, 'ref', '', 'X')).toBe(formulas)
  })
})
