import { describe, it, expect } from 'vitest'
import { detectar, relojQueAvanza, type Detector } from './detector-cuerpo'

describe('el reloj del detector solo avanza', () => {
  it('dentro de una pasada, respeta los tiempos del vídeo', () => {
    const r = relojQueAvanza()
    expect([r(0), r(33.3), r(66.7)]).toEqual([0, 33.3, 66.7])
  })

  it('al volver a empezar el vídeo, salta hacia delante y conserva los intervalos', () => {
    const r = relojQueAvanza()
    r(0); r(5000)
    const a = r(0), b = r(33)
    expect(a).toBeGreaterThan(5000)
    expect(b - a).toBeCloseTo(33)
  })

  it('el mismo fotograma dos veces también avanza', () => {
    const r = relojQueAvanza()
    const a = r(100)
    expect(r(100)).toBeGreaterThan(a)
  })
})

describe('los puntos del detector, en píxeles del fotograma', () => {
  const falso = (lm: { x: number; y: number; visibility?: number }[]): Detector => ({ detectForVideo: () => ({ landmarks: lm.length ? [lm] : [] }) })

  it('de 0-1 por separado en x y en y a píxeles, con lo que ve', () => {
    const c = detectar(falso([{ x: 0.5, y: 0.25, visibility: 0.8 }, { x: 1, y: 1 }]), {} as HTMLCanvasElement, 1280, 720, 0)!
    expect(c[0]).toEqual({ x: 640, y: 180, v: 0.8 })
    expect(c[1]).toEqual({ x: 1280, y: 720, v: 0 })
  })

  it('si no ve a nadie, null', () => {
    expect(detectar(falso([]), {} as HTMLCanvasElement, 10, 10, 0)).toBeNull()
  })
})
