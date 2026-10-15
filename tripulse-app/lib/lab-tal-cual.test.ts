import { describe, it, expect } from 'vitest'
import {
  sueltoTalCual, anadirDatoTalCual, renombrarResultadoLab, unidadResultadoLab, quitarResultadoLab,
} from './lab-tal-cual'
import { calcular, pegasDe, col, TEST_VACIO, type TestLab } from './lab-constructor'

const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const vacio = (): TestLab => ({ ...clon(TEST_VACIO), nombre: 'Prueba de esfuerzo' })

describe('un dato tal cual en el laboratorio', () => {
  it('UN CLIC: su casilla y su resultado, y el test ya se puede guardar', () => {
    const t = vacio()
    const clave = anadirDatoTalCual(t)
    expect(t.sueltos.map(c => c.clave)).toEqual([clave])
    expect(t.resultados[0].formula).toEqual([{ t: 'var', v: clave }])
    expect(pegasDe(t)).toEqual([])
  })

  it('EL NÚMERO QUE SE ESCRIBE ES EL RESULTADO', () => {
    const t = vacio()
    const clave = anadirDatoTalCual(t)
    expect(calcular(t, { [clave]: '12.5' })[0].valor).toBe(12.5)
  })

  it('tres seguidos no chocan', () => {
    const t = vacio()
    anadirDatoTalCual(t); anadirDatoTalCual(t); anadirDatoTalCual(t)
    const nombres = [...t.sueltos.map(c => c.clave), ...t.resultados.map(r => r.nombre)]
    expect(new Set(nombres).size).toBe(nombres.length)
    expect(pegasDe(t)).toEqual([])
  })

  it('se distingue de un resultado con fórmula de verdad', () => {
    const t = vacio()
    anadirDatoTalCual(t)
    expect(sueltoTalCual(t, 0)).not.toBeNull()
    t.resultados[0].formula.push({ t: 'op', v: '*' }, { t: 'num', v: 2 })
    expect(sueltoTalCual(t, 0)).toBeNull()
  })

  it('NI UNA DADA, NI UNA DE PARCIALES, son «tal cual»', () => {
    const dada: TestLab = { ...vacio(), sueltos: [col({ clave: 'peso', clase: 'dada', valor: '40' })], resultados: [{ nombre: 'p', unidad: 'kg', formula: [{ t: 'var', v: 'peso' }] }] }
    expect(sueltoTalCual(dada, 0)).toBeNull()
    const parc: TestLab = { ...vacio(), sueltos: [col({ clave: 'vueltas', instrumento: 'parciales' })], resultados: [{ nombre: 'v', unidad: 's', formula: [{ t: 'var', v: 'vueltas' }] }] }
    expect(sueltoTalCual(parc, 0)).toBeNull()
  })

  it('SI OTRO RESULTADO USA LA CASILLA, NO SE BORRA CON ÉL', () => {
    const t = vacio()
    const clave = anadirDatoTalCual(t)
    t.resultados.push({ nombre: 'doble', unidad: '', formula: [{ t: 'var', v: clave }, { t: 'op', v: '*' }, { t: 'num', v: 2 }] })
    expect(sueltoTalCual(t, 0)).toBeNull()
    quitarResultadoLab(t, 0)
    expect(t.sueltos).toHaveLength(1)
  })

  it('UN TEST DE ANTES MONTADO ASÍ SE VE IGUAL', () => {
    const t: TestLab = { ...vacio(), sueltos: [col({ clave: 'metros' })], resultados: [{ nombre: 'distancia', unidad: 'm', formula: [{ t: 'var', v: 'metros' }] }] }
    expect(sueltoTalCual(t, 0)).toBe('metros')
  })
})

describe('renombrar, la unidad y quitar', () => {
  it('AL RENOMBRARLO, SU CASILLA DICE EL NOMBRE NUEVO: es lo que se ve al pasarlo', () => {
    const t = vacio()
    anadirDatoTalCual(t)
    renombrarResultadoLab(t, 0, 'VT1')
    expect(t.resultados[0].nombre).toBe('VT1')
    expect(t.sueltos[0].etiqueta).toBe('VT1')
    expect(sueltoTalCual(t, 0)).toBe(t.sueltos[0].clave)
  })

  it('una etiqueta escrita a mano se respeta', () => {
    const t = vacio()
    anadirDatoTalCual(t)
    t.sueltos[0].etiqueta = 'VT1 del informe'
    renombrarResultadoLab(t, 0, 'VT1')
    expect(t.sueltos[0].etiqueta).toBe('VT1 del informe')
  })

  it('renombrar arrastra a los que lo encadenan', () => {
    const t = vacio()
    anadirDatoTalCual(t)
    renombrarResultadoLab(t, 0, 'VT1')
    t.resultados.push({ nombre: 'mitad', unidad: '', formula: [{ t: 'ref', v: 'VT1' }, { t: 'op', v: '/' }, { t: 'num', v: 2 }] })
    renombrarResultadoLab(t, 0, 'umbral1')
    expect(t.resultados[1].formula[0]).toEqual({ t: 'ref', v: 'umbral1' })
  })

  it('LA UNIDAD VA TAMBIÉN A LA CASILLA, que es la que se ve al pasarlo', () => {
    const t = vacio()
    anadirDatoTalCual(t)
    unidadResultadoLab(t, 0, 'km/h')
    expect(t.resultados[0].unidad).toBe('km/h')
    expect(t.sueltos[0].unidad).toBe('km/h')
  })

  it('AL QUITARLO SE VA CON SU CASILLA', () => {
    const t = vacio()
    anadirDatoTalCual(t); anadirDatoTalCual(t)
    quitarResultadoLab(t, 0)
    expect(t.resultados).toHaveLength(1)
    expect(t.sueltos).toHaveLength(1)
    expect(sueltoTalCual(t, 0)).toBe(t.sueltos[0].clave)
  })
})
