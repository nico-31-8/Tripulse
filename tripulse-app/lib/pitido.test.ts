import { describe, it, expect } from 'vitest'
import { debePitar } from './pitido'

describe('cuándo suena el cambio de escalón', () => {
  it('suena al pasar de un escalón al siguiente', () => {
    expect(debePitar(3, 4, true)).toBe(true)
  })

  it('con el reloj parado no suena', () => {
    /* Ni al cargar la pantalla ni en pausa: un pitido con el reloj quieto no
       significa nada y el atleta que lo oye no sabe qué hacer. */
    expect(debePitar(3, 4, false)).toBe(false)
  })

  it('el primer escalón no suena: no es un cambio', () => {
    expect(debePitar(null, 1, true)).toBe(false)
    expect(debePitar(undefined, 1, true)).toBe(false)
  })

  it('quedarse en el mismo escalón no suena', () => {
    /* El reloj se repinta diez veces por segundo. Sin esto, el pitido sería un
       zumbido continuo. */
    expect(debePitar(4, 4, true)).toBe(false)
  })

  it('volver atrás no suena', () => {
    /* Reiniciar el reloj devuelve al escalón 1. Eso no es haber avanzado. */
    expect(debePitar(7, 1, true)).toBe(false)
  })

  it('un salto de varios escalones suena una vez', () => {
    /* Si la pestaña estuvo en segundo plano, el reloj vuelve con varios
       escalones de golpe: se avisa, pero una sola vez. */
    expect(debePitar(2, 6, true)).toBe(true)
  })
})
