import { describe, it, expect, vi, afterEach } from 'vitest'
import { debePitar, vibrar, puedeVibrar, vibracionEncendida, ponVibracion, PATRON_ESCALON } from './pitido'

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

/** Un localStorage de mentira, para no depender del navegador. */
function almacen() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
  }
}

describe('la vibración del cambio de escalón', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('vibra con el patrón de escalón si el móvil sabe y está encendida', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('localStorage', almacen())
    vibrar()
    expect(vibrate).toHaveBeenCalledWith(PATRON_ESCALON)
  })

  it('encendida por defecto, y se apaga', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('localStorage', almacen())
    expect(vibracionEncendida()).toBe(true)
    ponVibracion(false)
    expect(vibracionEncendida()).toBe(false)
    vibrar()
    expect(vibrate).not.toHaveBeenCalled()
  })

  /* En iPhone, Safari no trae `navigator.vibrate`: no puede romper nada, ni
     enseñar un botón que no hace nada. */
  it('en un navegador que no vibra, ni lo intenta ni falla', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('localStorage', almacen())
    expect(puedeVibrar()).toBe(false)
    expect(() => vibrar()).not.toThrow()
  })

  it('sin localStorage (ventana privada), sigue encendida', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } })
    expect(vibracionEncendida()).toBe(true)
    expect(() => ponVibracion(false)).not.toThrow()
  })
})
