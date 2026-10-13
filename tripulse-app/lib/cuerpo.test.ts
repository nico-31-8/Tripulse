import { describe, it, expect } from 'vitest'
import {
  conAjustes, descruzar, DIBUJADOS, dudosos, femurFrenteAHorizontal, indice, ladoAMedir, ladoCercano, medidasCuerpo, P, serieCuerpo, sinPicos,
  VISIBLE_MINIMO, type Cuerpo, type LadoCuerpo, type Parte,
} from './cuerpo'

/** Un cuerpo de 33 puntos, todos bien vistos en el origen, con los que se digan colocados. */
function cuerpo(puestos: Partial<Record<Parte, [number, number, number?]>>, lado: LadoCuerpo = 'd', resto = 0.9): Cuerpo {
  const c: Cuerpo = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: resto }))
  for (const [p, [x, y, v]] of Object.entries(puestos) as [Parte, [number, number, number?]][]) {
    c[indice(p, lado)] = { x, y, v: v ?? 0.95 }
  }
  return c
}

const valor = (c: Cuerpo, clave: string, lado: LadoCuerpo = 'd') =>
  medidasCuerpo(c, lado, 'perfil').find(m => m.clave === clave)!

/* Rodilla en el origen, tibia vertical, muslo horizontal, tronco vertical. */
const EN_ESCUADRA = cuerpo({ tobillo: [0, 100], rodilla: [0, 0], cadera: [-100, 0], hombro: [-100, -100] })

describe('lo que se mide del esqueleto, de perfil', () => {
  it('rodilla y cadera a 90°, tronco y tibia verticales y paralelos, fémur horizontal', () => {
    expect(valor(EN_ESCUADRA, 'rodilla').valor).toBeCloseTo(90)
    expect(valor(EN_ESCUADRA, 'cadera').valor).toBeCloseTo(90)
    expect(valor(EN_ESCUADRA, 'tronco').valor).toBeCloseTo(0)
    expect(valor(EN_ESCUADRA, 'tibia').valor).toBeCloseTo(0)
    expect(valor(EN_ESCUADRA, 'tronco_tibia').texto).toBe('paralelos')
    expect(valor(EN_ESCUADRA, 'femur').texto).toBe('horizontal')
    expect(valor(EN_ESCUADRA, 'rodilla').texto).toBe('90°')
  })

  it('la cadera por debajo de la rodilla: el fémur pasa la horizontal', () => {
    const hondo = cuerpo({ tobillo: [0, 100], rodilla: [0, 0], cadera: [-100, 20], hombro: [-100, -100] })
    expect(valor(hondo, 'femur').texto).toBe('11° por debajo')
    const alto = cuerpo({ tobillo: [0, 100], rodilla: [0, 0], cadera: [-100, -30], hombro: [-100, -130] })
    expect(valor(alto, 'femur').texto).toBe('17° por encima')
  })

  it('el tronco más inclinado que la tibia, y al revés', () => {
    const inclinado = cuerpo({ tobillo: [0, 100], rodilla: [30, 0], cadera: [-100, 0], hombro: [-40, -100] })
    expect(valor(inclinado, 'tronco').valor).toBeCloseTo(31, 0)
    expect(valor(inclinado, 'tibia').valor).toBeCloseTo(16.7, 0)
    expect(valor(inclinado, 'tronco_tibia').texto).toBe('14° más inclinado')
    const erguido = cuerpo({ tobillo: [0, 100], rodilla: [40, 0], cadera: [-100, 0], hombro: [-90, -100] })
    expect(valor(erguido, 'tronco_tibia').texto).toBe('16° más vertical')
  })

  it('cuánto fiarse: rodilla, tronco y tibia fiables; lo que pasa por la cadera, con margen', () => {
    const f = Object.fromEntries(medidasCuerpo(EN_ESCUADRA, 'd', 'perfil').map(m => [m.clave, m.fiabilidad]))
    expect(f).toEqual({ rodilla: 'fiable', cadera: 'margen', tronco: 'fiable', tibia: 'fiable', tronco_tibia: 'fiable', femur: 'margen' })
    expect(valor(EN_ESCUADRA, 'rodilla').porque).toMatch(/Yoma 2025/)
  })

  it('el fémur con signo: positivo con la cadera más baja que la rodilla', () => {
    expect(femurFrenteAHorizontal({ x: 0, y: 10 }, { x: 100, y: 0 })).toBeGreaterThan(0)
    expect(femurFrenteAHorizontal({ x: 0, y: -10 }, { x: 100, y: 0 })).toBeLessThan(0)
  })
})

describe('desde las otras vistas no se da ningún número', () => {
  it('de frente: el valgo lo juzga el entrenador, y se dice por qué', () => {
    const m = medidasCuerpo(EN_ESCUADRA, 'd', 'frente')
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ clave: 'frontal', valor: null, fiabilidad: 'no', nombre: 'Valgo de rodilla, de frente' })
    expect(m[0].porque).toMatch(/Scataglini 2024/)
    expect(medidasCuerpo(EN_ESCUADRA, 'd', 'atras')[0].nombre).toBe('Ángulos desde atrás')
    expect(dudosos(EN_ESCUADRA, 'd', 'frente')).toEqual([])
  })
})

describe('el punto dudoso', () => {
  const tapada = cuerpo({ tobillo: [0, 100], rodilla: [0, 0, 0.2], cadera: [-100, 0], hombro: [-100, -100] })

  it('la rodilla adivinada hace dudosas las medidas que la usan, no las demás', () => {
    expect(valor(tapada, 'rodilla').dudosa).toBe(true)
    expect(valor(tapada, 'femur').dudosa).toBe(true)
    expect(valor(tapada, 'tronco').dudosa).toBe(false)
    expect(dudosos(tapada, 'd', 'perfil')).toEqual([P.rodilla_d])
  })

  it('arrastrada a mano deja de serlo', () => {
    const corregida = conAjustes(tapada, { [P.rodilla_d]: { x: 2, y: 1 } })
    expect(corregida[P.rodilla_d]).toEqual({ x: 2, y: 1, v: 1 })
    expect(valor(corregida, 'rodilla').dudosa).toBe(false)
    expect(dudosos(corregida, 'd', 'perfil')).toEqual([])
    expect(conAjustes(tapada, undefined)).toBe(tapada)
  })

  it('el umbral es el de MediaPipe a medias', () => {
    expect(VISIBLE_MINIMO).toBe(0.5)
  })
})

describe('qué lado se mide', () => {
  const izquierdoCerca = cuerpo({ hombro: [0, 0, 0.98], cadera: [0, 0, 0.97], rodilla: [0, 0, 0.96], tobillo: [0, 0, 0.95] }, 'i', 0.3)

  it('en las pruebas de un lado, el que el modelo ve mejor en todo el vídeo', () => {
    expect(ladoCercano([izquierdoCerca, izquierdoCerca])).toBe('i')
    expect(ladoAMedir('unico', [izquierdoCerca])).toBe('i')
  })

  it('en las de dos lados, el que se puntúa, aunque esté lejos', () => {
    expect(ladoAMedir('der', [izquierdoCerca])).toBe('d')
    expect(ladoAMedir('izq', [])).toBe('i')
  })

  it('se dibujan nueve puntos por lado, sin repetir', () => {
    expect(DIBUJADOS).toHaveLength(18)
    expect(new Set(DIBUJADOS).size).toBe(18)
  })
})

describe('los fallos del detector que no marca como dudosos', () => {
  const serie = (vs: number[]) => vs.map((valor, clave) => ({ clave, valor }))

  it('un fotograma que salta de golpe se quita; el movimiento de verdad se queda', () => {
    const s = sinPicos(serie([170, 165, 160, 70, 150, 145, 140]))
    expect(s.map(x => x.valor)).toEqual([170, 165, 160, 150, 145, 140])
  })

  it('dos fotogramas seguidos mal también', () => {
    const s = sinPicos(serie([170, 168, 166, 90, 88, 160, 158, 156]))
    expect(s.map(x => x.valor)).toEqual([170, 168, 166, 160, 158, 156])
  })

  it('una sentadilla rápida (6° por fotograma) y su fondo no se tocan', () => {
    const bajada = Array.from({ length: 15 }, (_, i) => 175 - 6 * i)
    const v = [...bajada, ...bajada.slice().reverse()]
    expect(sinPicos(serie(v))).toHaveLength(v.length)
  })

  it('con menos de cinco fotogramas no hay con qué comparar', () => {
    expect(sinPicos(serie([170, 70, 170]))).toHaveLength(3)
  })
})

describe('una medida a lo largo del vídeo', () => {
  it('en orden, sin los fotogramas en que es dudosa, y con lo corregido a mano', () => {
    const doblada = (y: number, v = 0.95) => cuerpo({ tobillo: [0, 100], rodilla: [0, 0, v], cadera: [-100, y], hombro: [-100, -100] })
    const fotogramas = { 2: doblada(0), 0: doblada(-100), 1: doblada(-50, 0.1) }
    const s = serieCuerpo(fotogramas, {}, 'd', 'perfil', 'rodilla')
    expect(s.map(x => x.clave)).toEqual([0, 2])
    expect(Math.round(s[1].valor)).toBe(90)
    const conMano = serieCuerpo(fotogramas, { 1: { [P.rodilla_d]: { x: 0, y: 0 } } }, 'd', 'perfil', 'rodilla')
    expect(conMano.map(x => x.clave)).toEqual([0, 1, 2])
  })
})

describe('las piernas cambiadas', () => {
  /* Perfil: la pierna derecha delante (x 100) y la izquierda detrás (x 160). */
  const conPiernas = (dx: number, ix: number, brazoD = 300, brazoI = 340): Cuerpo => {
    const c: Cuerpo = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0.9 }))
    for (const [i, d, y] of [[23, 24, 300], [25, 26, 400], [27, 28, 500], [29, 30, 510], [31, 32, 515]] as const) {
      c[d] = { x: dx, y, v: 0.95 }; c[i] = { x: ix, y, v: 0.6 }
    }
    for (const [i, d, y] of [[11, 12, 150], [13, 14, 200], [15, 16, 250]] as const) {
      c[d] = { x: brazoD, y, v: 0.95 }; c[i] = { x: brazoI, y, v: 0.6 }
    }
    return c
  }

  it('si el detector cruza las piernas de un fotograma al siguiente, se descruzan', () => {
    const antes = conPiernas(100, 160)
    const cruzado = conPiernas(162, 102)
    const bien = descruzar(antes, cruzado)
    expect(bien[P.rodilla_d].x).toBe(102)
    expect(bien[P.rodilla_i].x).toBe(162)
    /* Con su visibilidad: el punto entero cambia de nombre. */
    expect(bien[P.rodilla_d].v).toBe(0.6)
  })

  it('las piernas y los brazos se corrigen por separado', () => {
    const antes = conPiernas(100, 160, 300, 340)
    const soloPiernas = descruzar(antes, conPiernas(162, 102, 302, 338))
    expect(soloPiernas[P.rodilla_d].x).toBe(102)
    expect(soloPiernas[P.hombro_d].x).toBe(302)
  })

  it('con una pierna encima de la otra no se toca nada', () => {
    const antes = conPiernas(100, 101)
    const ahora = conPiernas(103, 102)
    expect(descruzar(antes, ahora)).toBe(ahora)
  })

  it('el primer fotograma se queda como venga', () => {
    const c = conPiernas(100, 160)
    expect(descruzar(null, c)).toBe(c)
  })
})

describe('el esqueleto con el móvil torcido', () => {
  it('el fémur horizontal de verdad, grabado 4° torcido: sin suelo sale 4° de más; con suelo, horizontal', () => {
    const t = (4 * Math.PI) / 180
    /* La rodilla en el origen y la cadera a 100 hacia atrás, en un mundo girado 4°. */
    const cadera = { x: -Math.cos(t) * 100, y: -Math.sin(t) * 100 }
    expect(femurFrenteAHorizontal(cadera, { x: 0, y: 0 })).toBeCloseTo(-4, 5)
    expect(femurFrenteAHorizontal(cadera, { x: 0, y: 0 }, t)).toBeCloseTo(0, 5)
  })
})

describe('el pico de un movimiento rápido no es un fallo', () => {
  it('una pierna que sube y baja sin pararse conserva su punto más alto', () => {
    const v = [2, 1.62, 1.29, 1.0, 0.81, 0.64, 0.47, 0.3, 0.47, 0.64, 0.81, 1.0, 1.29]
    const s = sinPicos(v.map((valor, clave) => ({ clave, valor })), 0.25)
    expect(s.map(x => x.valor)).toContain(0.3)
  })
})
