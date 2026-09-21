import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  debePitar, vibrar, puedeVibrar, vibracionEncendida, ponVibracion, PATRON_ESCALON,
  destellar, destelloEncendido, ponDestello,
} from './pitido'

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

  it('sin localStorage (ventana privada), sigue encendida la vibración', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } })
    expect(vibracionEncendida()).toBe(true)
    expect(() => ponVibracion(false)).not.toThrow()
  })
})

/** Un documento de mentira: lo justo para ver si se pinta la capa. */
function documento() {
  const pintadas: { style: Record<string, string>; quitada: boolean }[] = []
  return {
    pintadas,
    doc: {
      body: { appendChild: (c: { style: Record<string, string>; quitada: boolean }) => { pintadas.push(c) } },
      createElement: () => {
        const c = { style: {} as Record<string, string>, quitada: false, setAttribute: () => {}, animate: () => ({}), remove: () => { c.quitada = true } }
        return c
      },
    },
  }
}

describe('el destello del cambio de escalón', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('pinta una capa que no bloquea los toques y se quita sola', () => {
    vi.useFakeTimers()
    const { pintadas, doc } = documento()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('localStorage', almacen())
    destellar()
    expect(pintadas).toHaveLength(1)
    expect(pintadas[0].style.pointerEvents).toBe('none')
    expect(pintadas[0].style.position).toBe('fixed')
    vi.advanceTimersByTime(1000)
    expect(pintadas[0].quitada).toBe(true)
  })

  it('encendido por defecto, y apagado no pinta nada', () => {
    const { pintadas, doc } = documento()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('localStorage', almacen())
    expect(destelloEncendido()).toBe(true)
    ponDestello(false)
    destellar()
    expect(pintadas).toHaveLength(0)
  })

  /* En el servidor no hay documento: llamarlo ahí no puede romper la página. */
  it('sin documento, ni lo intenta ni falla', () => {
    vi.stubGlobal('localStorage', almacen())
    expect(() => destellar()).not.toThrow()
  })
})
