import { describe, it, expect } from 'vitest'
import {
  anguloEnVertice, frenteAVertical, frenteAHorizontal, enPalmas, desvioDeLinea, enGrados, inclinacionDe, enEjesDelSuelo,
} from './geometria-fotograma'

describe('geometría sobre un fotograma', () => {
  it('el ángulo en un vértice', () => {
    expect(anguloEnVertice({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90)
    expect(anguloEnVertice({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(180)
    // La rodilla de la maqueta: 52°.
    expect(Math.round(anguloEnVertice({ x: 152, y: 475 }, { x: 252, y: 457 }, { x: 192, y: 572 })!)).toBe(52)
  })

  it('sin longitud no hay ángulo', () => {
    expect(anguloEnVertice({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull()
    expect(frenteAVertical({ x: 3, y: 3 }, { x: 3, y: 3 })).toBeNull()
  })

  it('frente a la vertical y a la horizontal', () => {
    // El tronco de la maqueta: 27° de la vertical.
    expect(Math.round(frenteAVertical({ x: 146, y: 487 }, { x: 241, y: 303 })!)).toBe(27)
    // La pelvis de la maqueta: 9° de la horizontal, la dibuje quien la dibuje.
    expect(Math.round(frenteAHorizontal({ x: 160, y: 318 }, { x: 210, y: 326 })!)).toBe(9)
    expect(Math.round(frenteAHorizontal({ x: 210, y: 326 }, { x: 160, y: 318 })!)).toBe(9)
    expect(frenteAVertical({ x: 0, y: 0 }, { x: 0, y: 50 })).toBe(0)
  })

  it('la distancia en palmas del propio deportista', () => {
    const palma = [{ x: 0, y: 0 }, { x: 0, y: 100 }] as const
    expect(enPalmas({ x: 0, y: 0 }, { x: 150, y: 0 }, palma[0], palma[1])).toBeCloseTo(1.5)
    expect(enPalmas({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull()
  })

  it('el desvío de una recta: mismo lado, mismo signo', () => {
    const a = { x: 160, y: 318 }, b = { x: 154, y: 572 }
    const rodilla = desvioDeLinea(a, b, { x: 172, y: 445 })!
    const fuera = desvioDeLinea(a, b, { x: 140, y: 445 })!
    expect(Math.sign(rodilla)).not.toBe(Math.sign(fuera))
    expect(Math.abs(rodilla)).toBeCloseTo(15, 0)
  })

  it('para enseñar, grados enteros', () => {
    expect(enGrados(9.1)).toBe('9°')
    expect(enGrados(null)).toBe('—')
  })
})

describe('con el móvil torcido, se mide contra el suelo', () => {
  const grados = (g: number) => (g * Math.PI) / 180

  it('la inclinación del suelo sale igual se marque de izquierda a derecha o al revés', () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 5.24 }
    expect(inclinacionDe(a, b)).toBeCloseTo(grados(3), 2)
    expect(inclinacionDe(b, a)).toBeCloseTo(grados(3), 2)
    expect(inclinacionDe(a, a)).toBe(0)
  })

  it('girado con el suelo, el propio suelo queda horizontal', () => {
    const t = grados(3)
    const d = enEjesDelSuelo(Math.cos(t) * 50, Math.sin(t) * 50, t)
    expect(d.x).toBeCloseTo(50)
    expect(d.y).toBeCloseTo(0)
  })

  it('un tronco vertical de verdad, grabado con el móvil 4° torcido: sin suelo sale a 4°, con suelo a 0°', () => {
    const t = grados(4)
    /* En la imagen, todo el mundo está girado 4°: la vertical va por (−sin, cos). */
    const cadera = { x: 0, y: 0 }, hombro = { x: Math.sin(t) * 100, y: -Math.cos(t) * 100 }
    expect(frenteAVertical(cadera, hombro)).toBeCloseTo(4, 5)
    expect(frenteAVertical(cadera, hombro, t)).toBeCloseTo(0, 5)
    expect(frenteAHorizontal(cadera, hombro, t)).toBeCloseTo(90, 5)
  })
})
