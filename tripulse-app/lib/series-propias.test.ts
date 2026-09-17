// Las series de un test propio: una casilla que se mide varias veces.
//
// Todo lo que se comprueba aquí nació de una decisión tomada a mano, así que
// cada bloque dice cuál. Si algún día un test de estos falla, lo que hay que
// mirar primero es si la decisión sigue siendo la misma.
import { describe, it, expect } from 'vitest'
import {
  evaluar, textoDe, dependencias, renombrarEn, motivoNombreMalo,
  seriesQueUsa, camposSueltos, esFuncion, FUNCIONES, type Bloque,
} from './formula'
import {
  vecesDe, esSerie, serieDeDatos, faltanDe, valorDeCampo, leerDefinicion, leerFormula,
  calcularResultados, pegasDe, MAX_VECES, type DefinicionTest,
} from './test-definicion'
import { herramientaDeCampo, herramientasPropias, seTomaConReloj } from './herramientas-propias'
import { CRONO_PARADO, deshacerVuelta, vuelta, transcurrido } from './dirigir-cronometro'

const fn = (f: string, de: string): Bloque => ({ t: 'fn', v: f as never, de })
const v = (n: string): Bloque => ({ t: 'var', v: n })
const op = (o: string): Bloque => ({ t: 'op', v: o })

const SEIS = ['74.2', '75', '76.1', '77.4', '79', '80.5']

describe('las funciones de serie', () => {
  const vars = { t100: SEIS }

  it('cada una devuelve lo suyo', () => {
    expect(evaluar('suma(t100)', vars)).toBeCloseTo(462.2, 5)
    expect(evaluar('media(t100)', vars)).toBeCloseTo(77.0333, 3)
    expect(evaluar('minimo(t100)', vars)).toBe(74.2)
    expect(evaluar('maximo(t100)', vars)).toBe(80.5)
    expect(evaluar('primera(t100)', vars)).toBe(74.2)
    expect(evaluar('ultima(t100)', vars)).toBe(80.5)
  })

  it('se pueden mezclar con el resto de la fórmula', () => {
    // La caída: cuánto se le fue el último 100 respecto al primero.
    expect(evaluar('ultima(t100) - primera(t100)', vars)).toBeCloseTo(6.3, 5)
    expect(evaluar('suma(t100) / 6', vars)).toBeCloseTo(77.0333, 3)
  })

  /* DECISIÓN: una serie a medias NO se calcula. Los datos en bruto se guardan
     igual, pero llamar «total del 6×100» a la suma de cinco sería un número que
     miente, y en la gráfica ese punto valdría menos que los demás sin que nada
     lo dijera. */
  it('una serie a medias falla, y dice cuántas faltan', () => {
    const cinco = { t100: ['74.2', '75', '76.1', '77.4', '79', ''] }
    expect(() => evaluar('suma(t100)', cinco)).toThrow(/faltan 1 de 6/)
    expect(() => evaluar('media(t100)', cinco)).toThrow(/faltan 1 de 6/)
    // También las que no necesitarían las seis: una sola regla, no dos.
    expect(() => evaluar('primera(t100)', cinco)).toThrow(/faltan 1 de 6/)
    expect(() => evaluar('suma(t100)', { t100: [null, undefined, '  '] })).toThrow(/faltan 3 de 3/)
  })

  /* `Number(['74.2'])` es 74,2 en JavaScript. Sin guarda, una serie de una sola
     posición se colaría como número suelto y la de seis daría NaN: la misma
     casilla se comportaría distinto según cuántas veces se hubiera medido. */
  it('una serie usada como número suelto falla, y enseña la salida', () => {
    expect(() => evaluar('t100 + 1', vars)).toThrow(/es una serie/)
    expect(() => evaluar('t100 * 2', { t100: ['74.2'] })).toThrow(/suma\(t100\)/)
  })

  it('una función sobre algo que no es una serie falla', () => {
    expect(() => evaluar('suma(peso)', { peso: '70' })).toThrow(/no es una serie/)
    expect(() => evaluar('suma(t100)', {})).toThrow(/no existe/)
    expect(() => evaluar('suma(t100)', { t100: [] })).toThrow(/vacía/)
    expect(() => evaluar('suma(t100)', { t100: ['74.2', 'x'] })).toThrow(/no es un número/)
  })

  it('una función mal escrita falla en vez de calcular otra cosa', () => {
    expect(() => evaluar('suma()', vars)).toThrow(/necesita una serie/)
    expect(() => evaluar('suma(t100', vars)).toThrow(/falta cerrar/)
    // `sumaa` no es función: se trata como campo, y no existe.
    expect(() => evaluar('sumaa(t100)', vars)).toThrow(/no existe/)
  })

  it('un campo no se puede llamar como una función', () => {
    const claves = { campos: ['suma'], resultados: [] }
    expect(motivoNombreMalo('suma', 'campo', 0, claves)).toMatch(/función de serie/)
    expect(motivoNombreMalo('media', 'resultado', 0, { campos: [], resultados: ['media'] })).toMatch(/función/)
    expect(motivoNombreMalo('t100', 'campo', 0, { campos: ['t100'], resultados: [] })).toBeNull()
    for (const f of Object.keys(FUNCIONES)) expect(esFuncion(f)).toBe(true)
  })

  /* `n in FUNCIONES` daría true para lo que hay en el prototipo de cualquier
     objeto, y un campo llamado «toString» se trataría como función: acabaría
     en un resultado indefinido en vez de en un error que se entiende. */
  it('lo que vive en el prototipo NO es una función', () => {
    for (const n of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(esFuncion(n), n).toBe(false)
    }
    expect(motivoNombreMalo('toString', 'campo', 0, { campos: ['toString'], resultados: [] })).toBeNull()
    expect(() => evaluar('toString(t100)', { t100: SEIS })).toThrow()
  })
})

describe('los bloques de una función', () => {
  it('se escriben como se leen', () => {
    expect(textoDe([fn('suma', 't100')])).toBe('suma(t100)')
    expect(textoDe([fn('ultima', 't100'), op('-'), fn('primera', 't100')]))
      .toBe('ultima(t100) - primera(t100)')
  })

  it('cuentan como dependencia del campo', () => {
    expect(dependencias([fn('suma', 't100')]).campos).toEqual(['t100'])
    expect(seriesQueUsa([fn('media', 't100'), op('+'), v('x')]))
      .toEqual([{ campo: 't100', funcion: 'media' }])
    expect(camposSueltos([fn('media', 't100'), op('+'), v('x')])).toEqual(['x'])
  })

  /* Sin esto, renombrar la serie dejaría `suma(viejo)` apuntando a un campo que
     ya no existe: la fórmula rota por hacer lo que la app te invita a hacer. */
  it('renombrar el campo entra también dentro de la función', () => {
    const out = renombrarEn([[fn('suma', 't100'), op('+'), v('t100')]], 'var', 't100', 'tiempos')
    expect(textoDe(out[0])).toBe('suma(tiempos) + tiempos')
    // Renombrar un resultado no toca las funciones, que apuntan a campos.
    expect(textoDe(renombrarEn([[fn('suma', 't100')]], 'ref', 't100', 'otro')[0])).toBe('suma(t100)')
  })

  it('se leen de la base tirando lo que no se reconoce', () => {
    expect(leerFormula([{ t: 'fn', v: 'suma', de: 't100' }])).toEqual([fn('suma', 't100')])
    expect(leerFormula([{ t: 'fn', v: 'inventada', de: 't100' }])).toEqual([])
    expect(leerFormula([{ t: 'fn', v: 'suma' }])).toEqual([])
  })
})

describe('cuántas veces se mide una casilla', () => {
  it('lo que no es un número de repeticiones vale una', () => {
    expect(vecesDe({ clave: 'x', etiqueta: '' })).toBe(1)
    expect(vecesDe({ clave: 'x', etiqueta: '', veces: 0 })).toBe(1)
    expect(vecesDe({ clave: 'x', etiqueta: '', veces: -3 })).toBe(1)
    expect(vecesDe({ clave: 'x', etiqueta: '', veces: 1.6 })).toBe(2)
    expect(vecesDe({ clave: 'x', etiqueta: '', veces: 9999 })).toBe(MAX_VECES)
    expect(esSerie({ clave: 'x', etiqueta: '', veces: 6 })).toBe(true)
    expect(esSerie({ clave: 'x', etiqueta: '', veces: 1 })).toBe(false)
  })

  /* Lo guardado no manda sobre la definición: una medición vieja de cuando la
     serie tenía cuatro repeticiones sale como «faltan 2», no como completa. */
  it('lo medido se ajusta SIEMPRE a lo que dice el test', () => {
    const c = { clave: 't', etiqueta: '', veces: 4 }
    expect(serieDeDatos({ t: ['1', '2'] }, c)).toEqual(['1', '2', '', ''])
    expect(serieDeDatos({ t: ['1', '2', '3', '4', '5', '6'] }, c)).toEqual(['1', '2', '3', '4'])
    expect(serieDeDatos({}, c)).toEqual(['', '', '', ''])
    // Un valor suelto de cuando se medía una sola vez cae en la primera.
    expect(serieDeDatos({ t: '9' }, c)).toEqual(['9', '', '', ''])
    expect(faltanDe(serieDeDatos({ t: ['1'] }, c))).toBe(3)
    expect(valorDeCampo({ t: '9' }, { clave: 't', etiqueta: '' })).toBe('9')
  })
})

describe('un test propio con series, de punta a punta', () => {
  const def: DefinicionTest = {
    nombre: '6×100 crol',
    deporte: 'Natacion',
    campos: [
      { clave: 't100', etiqueta: 'Cada 100', veces: 6, instrumento: { tipo: 'cronometro', unidad: 'seg' } },
      { clave: 'brazadas', etiqueta: 'Ciclos de brazada', veces: 6 },
      { clave: 'fc_final', etiqueta: 'Pulsaciones al acabar' },
    ],
    resultados: [
      { nombre: 'total', unidad: 'seg', ancla: 'nada', graf: true, formula: [fn('suma', 't100')] },
      { nombre: 'media100', unidad: 'seg', ancla: 'especifica', graf: true, formula: [fn('media', 't100')] },
      { nombre: 'caida', unidad: 'seg', ancla: 'nada', graf: true, formula: [fn('ultima', 't100'), op('-'), fn('primera', 't100')] },
    ],
  }

  it('se puede guardar', () => {
    expect(pegasDe(def)).toEqual([])
  })

  it('calcula cuando la serie está entera', () => {
    const vals = calcularResultados(def, { t100: SEIS, brazadas: SEIS, fc_final: '178' })
    expect(vals[0].valor).toBeCloseTo(462.2, 5)
    expect(vals[1].valor).toBeCloseTo(77.0333, 3)
    expect(vals[2].valor).toBeCloseTo(6.3, 5)
    expect(vals.every(x => x.error === null)).toBe(true)
  })

  it('con cinco de seis no calcula NINGUNO, y dice por qué', () => {
    const vals = calcularResultados(def, { t100: SEIS.slice(0, 5) })
    expect(vals.map(x => x.valor)).toEqual([null, null, null])
    for (const x of vals) expect(x.error).toMatch(/faltan 1 de 6/)
  })

  it('una serie usada como número suelto no deja guardar', () => {
    const malo = { ...def, resultados: [{ ...def.resultados[0], formula: [v('t100'), op('+'), v('fc_final')] }] }
    expect(pegasDe(malo).some(p => /se mide 6 veces/.test(p.texto))).toBe(true)
  })

  it('una función sobre una casilla que se mide una vez tampoco', () => {
    const malo = { ...def, resultados: [{ ...def.resultados[0], formula: [fn('suma', 'fc_final')] }] }
    expect(pegasDe(malo).some(p => /una sola vez/.test(p.texto))).toBe(true)
  })

  /* DECISIÓN: una serie solo lleva cronómetro. Un contador por repetición
     habría que llevarlo a la vez que el reloj, y no hay dos manos. */
  it('una serie con contador no deja guardar', () => {
    const malo: DefinicionTest = {
      ...def,
      campos: [{ ...def.campos[0], instrumento: { tipo: 'contador' } }, def.campos[1], def.campos[2]],
    }
    expect(pegasDe(malo).some(p => p.donde === 'campo' && /solo puede llevar cronómetro/.test(p.texto))).toBe(true)
  })

  it('se lee y se reescribe igual desde la base', () => {
    const leido = leerDefinicion(JSON.parse(JSON.stringify(def)))
    expect(leido.campos).toEqual(def.campos)
    expect(leido.resultados[0].formula).toEqual(def.resultados[0].formula)
  })

  it('un instrumento que no existe degrada a mano, no revienta', () => {
    const leido = leerDefinicion({
      nombre: 'x', deporte: 'Carrera',
      campos: [
        { clave: 'a', etiqueta: '', instrumento: { tipo: 'teletransporte' } },
        { clave: 'b', etiqueta: '', instrumento: { tipo: 'cuentaAtras', segundos: 0 } },
        { clave: 'c', etiqueta: '', instrumento: { tipo: 'cronometro', unidad: 'parsecs' } },
      ],
      resultados: [],
    })
    expect(leido.campos[0].instrumento).toBeUndefined()
    expect(leido.campos[1].instrumento).toBeUndefined()
    expect(leido.campos[2].instrumento).toEqual({ tipo: 'cronometro', unidad: 'seg' })
  })

  it('los instrumentos que salen son los que espera la pantalla', () => {
    expect(herramientasPropias(def)).toEqual([
      { tipo: 'serie', campo: 't100', veces: 6, unidad: 'seg', que: 'Cada 100' },
    ])
    expect(seTomaConReloj(def)).toBe(true)
    expect(seTomaConReloj({ ...def, campos: [def.campos[1], def.campos[2]] })).toBe(false)
  })

  it('cada casilla traduce a lo suyo', () => {
    const de = (c: Parameters<typeof herramientaDeCampo>[0]) => herramientaDeCampo(c)
    expect(de({ clave: 'a', etiqueta: 'A', instrumento: { tipo: 'cronometro', unidad: 'min' } }))
      .toEqual({ tipo: 'cronometro', campo: 'a', unidad: 'min', que: 'A' })
    expect(de({ clave: 'b', etiqueta: '', instrumento: { tipo: 'contador' } }))
      .toEqual({ tipo: 'contador', campo: 'b', que: 'b' })
    expect(de({ clave: 'c', etiqueta: 'C', instrumento: { tipo: 'cuentaAtras', segundos: 360 } }))
      .toEqual({ tipo: 'cuentaAtras', segundos: 360, que: 'C' })
    expect(de({ clave: 'd', etiqueta: '' })).toBeNull()
    // La combinación que no existe no se inventa un instrumento.
    expect(de({ clave: 'e', etiqueta: '', veces: 4, instrumento: { tipo: 'contador' } })).toBeNull()
  })

  /* GUARDIÁN. Todo instrumento que salga de aquí tiene que escribir en una
     casilla que exista en el test. Si algún día se añade un instrumento nuevo
     y se olvida esta parte, el número caería en una casilla fantasma y la
     fórmula diría «falta rellenar» sin que nadie entendiera por qué. */
  it('todo instrumento escribe en una casilla que existe', () => {
    const claves = def.campos.map(c => c.clave)
    for (const h of herramientasPropias(def)) {
      if (h.tipo === 'cuentaAtras' || h.tipo === 'secuenciador' || h.tipo === 'vueltas') continue
      expect(claves, h.tipo).toContain(h.campo)
    }
  })
})

describe('deshacer una vuelta', () => {
  /* El tiempo de la vuelta deshecha VUELVE a la que está en curso. Tirarlo
     sería peor que el error: la repetición en marcha empezaría a contar desde
     el pulsado de más y saldría corta. */
  it('devuelve el tiempo a la repetición en marcha', () => {
    const t0 = 1_000_000
    let e = { ...CRONO_PARADO, desde: t0 as number | null, acumulado: 0, vueltas: [] as number[] }
    e = vuelta(e, t0 + 74_200)
    expect(e.vueltas).toEqual([74_200])
    const deshecho = deshacerVuelta(e)
    expect(deshecho.vueltas).toEqual([])
    expect(transcurrido(deshecho, t0 + 74_200)).toBe(74_200)
  })

  it('sin vueltas no hace nada', () => {
    expect(deshacerVuelta(CRONO_PARADO)).toBe(CRONO_PARADO)
  })
})
