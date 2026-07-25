import { describe, it, expect } from 'vitest'
import { moverItem } from './tareas-orden'

describe('moverItem', () => {
  it('mueve un elemento hacia delante sin mutar el original', () => {
    const arr = ['a', 'b', 'c', 'd']
    expect(moverItem(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(arr).toEqual(['a', 'b', 'c', 'd'])
  })
  it('mueve un elemento hacia atrás', () => {
    expect(moverItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
  it('índices iguales o fuera de rango → devuelve el mismo array', () => {
    const arr = ['a', 'b', 'c']
    expect(moverItem(arr, 1, 1)).toBe(arr)
    expect(moverItem(arr, -1, 0)).toBe(arr)
    expect(moverItem(arr, 0, 5)).toBe(arr)
  })
})
