import { describe, it, expect } from 'vitest'
import { limitesRedimension, redimensionar, mismoTramo } from './redimensionar-ciclo'

const t = (si: number, sf: number) => ({ si, sf })
const SOLO = { totalSem: 12 }

describe('un bloque solo en el lienzo', () => {
  it('por delante llega hasta el final del lienzo', () => {
    expect(limitesRedimension(t(2, 5), 'fin', SOLO)).toEqual({ min: 2, max: 11 })
  })

  it('por detrás llega hasta la primera semana', () => {
    expect(limitesRedimension(t(2, 5), 'ini', SOLO)).toEqual({ min: 0, max: 5 })
  })

  it('nunca se da la vuelta: el principio no pasa del final', () => {
    const lim = limitesRedimension(t(3, 3), 'ini', SOLO)
    expect(redimensionar(t(3, 3), 'ini', 9, lim)).toEqual(t(3, 3))
  })

  it('ni el final por detrás del principio', () => {
    const lim = limitesRedimension(t(3, 6), 'fin', SOLO)
    expect(redimensionar(t(3, 6), 'fin', 0, lim)).toEqual(t(3, 3))
  })
})

describe('con un hermano al lado', () => {
  const vecino = { hermanos: [t(6, 9)], totalSem: 12 }

  it('estirando no se lo come: se para justo antes', () => {
    const lim = limitesRedimension(t(0, 3), 'fin', vecino)
    expect(lim.max).toBe(5)
    expect(redimensionar(t(0, 3), 'fin', 11, lim)).toEqual(t(0, 5))
  })

  it('y por el otro lado, igual', () => {
    const anterior = { hermanos: [t(0, 3)], totalSem: 12 }
    const lim = limitesRedimension(t(6, 9), 'ini', anterior)
    expect(lim.min).toBe(4)
    expect(redimensionar(t(6, 9), 'ini', 0, lim)).toEqual(t(4, 9))
  })

  it('un hermano pegado no deja crecer ni una semana', () => {
    const lim = limitesRedimension(t(0, 3), 'fin', { hermanos: [t(4, 8)], totalSem: 12 })
    expect(lim.max).toBe(3)
  })
})

describe('un meso dentro de su macro', () => {
  const dentro = { dentroDe: t(2, 8), totalSem: 12 }

  it('no se sale por el final del macro', () => {
    const lim = limitesRedimension(t(4, 6), 'fin', dentro)
    expect(redimensionar(t(4, 6), 'fin', 11, lim)).toEqual(t(4, 8))
  })

  it('ni por el principio', () => {
    const lim = limitesRedimension(t(4, 6), 'ini', dentro)
    expect(redimensionar(t(4, 6), 'ini', 0, lim)).toEqual(t(2, 6))
  })

  it('con un hermano dentro del mismo macro, manda el más cercano', () => {
    const lim = limitesRedimension(t(2, 4), 'fin', { dentroDe: t(0, 10), hermanos: [t(7, 9)], totalSem: 12 })
    expect(lim.max).toBe(6)
  })
})

describe('un macro con mesos dentro', () => {
  const conMesos = { contiene: [t(2, 4), t(5, 7)], totalSem: 12 }

  it('encogiendo por el final se para en el último meso', () => {
    const lim = limitesRedimension(t(2, 9), 'fin', conMesos)
    expect(lim.min).toBe(7)
    expect(redimensionar(t(2, 9), 'fin', 0, lim)).toEqual(t(2, 7))
  })

  it('y por el principio, en el primero', () => {
    const lim = limitesRedimension(t(0, 9), 'ini', conMesos)
    expect(lim.max).toBe(2)
    expect(redimensionar(t(0, 9), 'ini', 8, lim)).toEqual(t(2, 9))
  })

  it('estirarlo hacia fuera sigue valiendo: los mesos no estorban para crecer', () => {
    const lim = limitesRedimension(t(2, 7), 'fin', conMesos)
    expect(lim.max).toBe(11)
  })
})

describe('el caso completo: meso entre hermanos, dentro de un macro', () => {
  const o = { dentroDe: t(0, 11), hermanos: [t(0, 1), t(7, 9)], totalSem: 12 }

  it('cabe entre el hermano de atrás y el de delante', () => {
    expect(limitesRedimension(t(3, 5), 'ini', o)).toEqual({ min: 2, max: 5 })
    expect(limitesRedimension(t(3, 5), 'fin', o)).toEqual({ min: 3, max: 6 })
  })
})

describe('detalles', () => {
  it('redimensionar no toca el tramo que le dan', () => {
    const item = t(2, 5)
    redimensionar(item, 'fin', 9, { min: 2, max: 11 })
    expect(item).toEqual(t(2, 5))
  })

  it('mismoTramo dice cuándo no ha cambiado nada', () => {
    expect(mismoTramo(t(1, 4), t(1, 4))).toBe(true)
    expect(mismoTramo(t(1, 4), t(1, 5))).toBe(false)
  })

  it('una semana suelta a medias se redondea, no se cae', () => {
    expect(redimensionar(t(2, 5), 'fin', 7.6, { min: 2, max: 11 })).toEqual(t(2, 8))
  })
})
