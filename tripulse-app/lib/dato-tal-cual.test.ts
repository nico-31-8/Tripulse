import { describe, it, expect } from 'vitest'
import {
  campoTalCual, conDatoTalCual, renombrarResultado, quitarResultado, resultadoTalCualDe,
  pegasDe, calcularResultados, referenciasDe, TEST_VACIO, type DefinicionTest,
} from './test-definicion'

const vacio = (): DefinicionTest => ({ ...TEST_VACIO, nombre: 'Prueba de esfuerzo', campos: [], resultados: [] })

describe('un dato que se apunta tal cual', () => {
  it('UN CLIC: su casilla y su resultado, y el test ya se puede guardar', () => {
    const d = conDatoTalCual(vacio())
    expect(d.campos).toHaveLength(1)
    expect(d.resultados).toHaveLength(1)
    expect(d.resultados[0].formula).toEqual([{ t: 'var', v: d.campos[0].clave }])
    // Sin «Añade al menos un campo» ni «Sin fórmula no sale nada».
    expect(pegasDe(d)).toEqual([])
  })

  it('EL NÚMERO QUE SE ESCRIBE ES EL RESULTADO, sin tocarlo', () => {
    const d = conDatoTalCual(vacio())
    /* Como llega de la casilla: una de tipo número da «12.5» con punto aunque
       se escriba con coma. */
    const r = calcularResultados(d, { [d.campos[0].clave]: '12.5' })[0]
    expect(r.valor).toBe(12.5)
  })

  it('tres seguidos no chocan entre sí', () => {
    const d = conDatoTalCual(conDatoTalCual(conDatoTalCual(vacio())))
    const nombres = [...d.campos.map(c => c.clave), ...d.resultados.map(r => r.nombre)]
    expect(new Set(nombres).size).toBe(nombres.length)
    expect(pegasDe(d)).toEqual([])
  })

  it('se sabe cuál es tal cual y cuál sale de una fórmula de verdad', () => {
    let d = conDatoTalCual(vacio())
    expect(campoTalCual(d, 0)).toBe(d.campos[0].clave)
    // Con una operación ya no es tal cual.
    d = { ...d, resultados: [{ ...d.resultados[0], formula: [...d.resultados[0].formula, { t: 'op', v: '*' }, { t: 'num', v: 2 }] }] }
    expect(campoTalCual(d, 0)).toBeNull()
  })

  it('SI OTRO RESULTADO USA LA CASILLA, YA NO ES SUYA: no se borra con él', () => {
    const d0 = conDatoTalCual(vacio())
    const clave = d0.campos[0].clave
    const d = { ...d0, resultados: [...d0.resultados, { nombre: 'doble', unidad: '', ancla: 'nada' as const, formula: [{ t: 'var' as const, v: clave }, { t: 'op' as const, v: '*' }, { t: 'num' as const, v: 2 }], graf: true }] }
    expect(campoTalCual(d, 0)).toBeNull()
    expect(quitarResultado(d, 0).campos).toHaveLength(1)
  })

  it('una serie no es tal cual: seis 100 no son un número', () => {
    const d = conDatoTalCual(vacio())
    const conSerie = { ...d, campos: [{ ...d.campos[0], veces: 6 }] }
    expect(campoTalCual(conSerie, 0)).toBeNull()
  })

  it('UN TEST DE ANTES MONTADO ASÍ SE VE IGUAL: no hace falta ninguna marca', () => {
    const viejo: DefinicionTest = {
      nombre: 'Cooper', deporte: 'Carrera', campos: [{ clave: 'metros', etiqueta: 'Metros' }],
      resultados: [{ nombre: 'Metros12', unidad: 'm', ancla: 'nada', formula: [{ t: 'var', v: 'metros' }], graf: true }],
    }
    expect(campoTalCual(viejo, 0)).toBe('metros')
  })
})

describe('renombrar y quitar', () => {
  it('AL RENOMBRARLO, LA CASILLA DICE EL NOMBRE NUEVO: es lo que se ve al pasarlo', () => {
    const d = renombrarResultado(conDatoTalCual(vacio()), 0, 'VT1')
    expect(d.resultados[0].nombre).toBe('VT1')
    expect(d.campos[0].etiqueta).toBe('VT1')
    // Y sigue siendo tal cual.
    expect(campoTalCual(d, 0)).toBe(d.campos[0].clave)
  })

  it('una etiqueta escrita a mano se respeta', () => {
    const d0 = conDatoTalCual(vacio())
    const conEtiqueta = { ...d0, campos: [{ ...d0.campos[0], etiqueta: 'VT1 (km/h)' }] }
    expect(renombrarResultado(conEtiqueta, 0, 'VT1').campos[0].etiqueta).toBe('VT1 (km/h)')
  })

  it('renombrar arrastra los resultados que lo encadenan', () => {
    const d0 = renombrarResultado(conDatoTalCual(vacio()), 0, 'VT1')
    const d1 = { ...d0, resultados: [...d0.resultados, { nombre: 'mitad', unidad: '', ancla: 'nada' as const, formula: [{ t: 'ref' as const, v: 'VT1' }, { t: 'op' as const, v: '/' }, { t: 'num' as const, v: 2 }], graf: true }] }
    const d2 = renombrarResultado(d1, 0, 'umbral1')
    expect(d2.resultados[1].formula[0]).toEqual({ t: 'ref', v: 'umbral1' })
  })

  it('AL QUITARLO SE VA CON SU CASILLA: sola no la usaría nadie', () => {
    const d = quitarResultado(conDatoTalCual(conDatoTalCual(vacio())), 0)
    expect(d.resultados).toHaveLength(1)
    expect(d.campos).toHaveLength(1)
    expect(campoTalCual(d, 0)).toBe(d.campos[0].clave)
  })

  it('quitar uno con fórmula no toca los campos', () => {
    const d: DefinicionTest = {
      nombre: 'x', deporte: 'Carrera', campos: [{ clave: 'a', etiqueta: 'A' }, { clave: 'b', etiqueta: 'B' }],
      resultados: [{ nombre: 'suma', unidad: '', ancla: 'nada', formula: [{ t: 'var', v: 'a' }, { t: 'op', v: '+' }, { t: 'var', v: 'b' }], graf: true }],
    }
    expect(quitarResultado(d, 0).campos).toHaveLength(2)
  })

  it('la casilla sabe de qué dato es', () => {
    const d = renombrarResultado(conDatoTalCual(vacio()), 0, 'VT1')
    expect(resultadoTalCualDe(d, d.campos[0].clave)?.nombre).toBe('VT1')
    expect(resultadoTalCualDe(d, 'otra')).toBeNull()
  })
})

describe('y sirve de hito como cualquiera', () => {
  it('marcado como umbral aeróbico, es una referencia', () => {
    const d0 = renombrarResultado(conDatoTalCual(vacio()), 0, 'VT1')
    const d = { ...d0, resultados: [{ ...d0.resultados[0], unidad: 'km/h', ancla: 'umbral_aer' as const }] }
    expect(referenciasDe(d).map(x => x.resultado.nombre)).toEqual(['VT1'])
  })
})
