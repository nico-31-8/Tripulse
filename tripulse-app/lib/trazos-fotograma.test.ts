import { describe, it, expect } from 'vitest'
import { anadirTrazo, medidasDe, etiquetaDe, PUNTOS_POR_TRAZO } from './trazos-fotograma'
import type { Trazo } from './movimiento-datos'

describe('los trazos del analizador', () => {
  it('cada herramienta pide sus puntos', () => {
    expect(PUNTOS_POR_TRAZO).toEqual({ linea: 2, angulo: 3, plomada: 1, horizontal: 1, palma: 2, distancia: 2, suelo: 2 })
  })

  it('la palma es una sola: medir otra sustituye a la anterior', () => {
    let t: Trazo[] = []
    t = anadirTrazo(t, { tipo: 'palma', puntos: [{ x: 0, y: 0 }, { x: 0, y: 100 }] })
    t = anadirTrazo(t, { tipo: 'linea', puntos: [{ x: 0, y: 0 }, { x: 0, y: 10 }] })
    t = anadirTrazo(t, { tipo: 'palma', puntos: [{ x: 0, y: 0 }, { x: 0, y: 80 }] })
    expect(t.filter(x => x.tipo === 'palma')).toHaveLength(1)
    expect(t.find(x => x.tipo === 'palma')!.puntos[1].y).toBe(80)
  })

  it('las medidas: ángulos, líneas y distancias, numeradas por tipo', () => {
    const t: Trazo[] = [
      { tipo: 'angulo', puntos: [{ x: 152, y: 475 }, { x: 252, y: 457 }, { x: 192, y: 572 }] },
      { tipo: 'linea', puntos: [{ x: 146, y: 487 }, { x: 241, y: 303 }] },
      { tipo: 'plomada', puntos: [{ x: 222, y: 168 }] },
    ]
    expect(medidasDe(t)).toEqual([
      { nombre: 'Ángulo 1', valor: '52°' },
      { nombre: 'Línea 1', valor: '27° de la vertical · 63° de la horizontal' },
    ])
  })

  it('la distancia sale en palmas cuando hay palma, y si no lo dice', () => {
    const d: Trazo = { tipo: 'distancia', puntos: [{ x: 0, y: 0 }, { x: 140, y: 0 }] }
    expect(medidasDe([d])[0].valor).toBe('mide la palma para tenerla en palmas')
    const palma: Trazo = { tipo: 'palma', puntos: [{ x: 0, y: 0 }, { x: 0, y: 100 }] }
    expect(medidasDe([palma, d])[0]).toEqual({ nombre: 'Distancia 1', valor: '1,4 palmas' })
    expect(etiquetaDe(d, [palma, d])).toBe('1,4 palmas')
  })

  it('un trazo a medias no mide nada', () => {
    expect(medidasDe([{ tipo: 'angulo', puntos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }])).toEqual([])
    expect(etiquetaDe({ tipo: 'linea', puntos: [{ x: 0, y: 0 }] }, [])).toBe('')
  })
})

describe('el suelo', () => {
  const t = (4 * Math.PI) / 180
  /* El móvil 4° torcido: el suelo baja hacia la derecha, y una línea vertical de verdad sale inclinada. */
  const suelo: Trazo = { tipo: 'suelo', puntos: [{ x: 0, y: 500 }, { x: Math.cos(t) * 300, y: 500 + Math.sin(t) * 300 }] }
  const vertical: Trazo = { tipo: 'linea', puntos: [{ x: 100, y: 400 }, { x: 100 + Math.sin(t) * 200, y: 400 - Math.cos(t) * 200 }] }

  it('una línea vertical de verdad, con el móvil torcido: sin suelo 4°, con suelo 0°', () => {
    expect(medidasDe([vertical])[0].valor).toBe('4° de la vertical · 86° de la horizontal')
    expect(medidasDe([suelo, vertical])[0].valor).toBe('0° de la vertical · 90° de la horizontal')
    expect(etiquetaDe(vertical, [suelo, vertical])).toBe('0°')
  })

  it('vale uno solo, y dice lo torcido que estaba el móvil', () => {
    const otro: Trazo = { tipo: 'suelo', puntos: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
    const ts = anadirTrazo(anadirTrazo([], suelo), otro)
    expect(ts).toHaveLength(1)
    expect(medidasDe([suelo])).toEqual([{ nombre: 'Suelo', valor: 'el móvil estaba torcido 4°: se mide contra el suelo' }])
    expect(etiquetaDe(suelo, [suelo])).toBe('suelo · 4°')
    expect(medidasDe(ts)[0].valor).toBe('el móvil estaba recto')
  })
})
