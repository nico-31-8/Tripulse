import { describe, it, expect } from 'vitest'
import { caidaDelTobillo, sugerirNota, textoParaGuardar, type DatosSugerencia } from './nota-sugerida'
import { pruebaDe } from './baterias-movimiento'
import { indice, type Cuerpo, type LadoCuerpo, type Parte } from './cuerpo'
import type { Trazo } from './movimiento-datos'
import type { Punto } from './geometria-fotograma'

const rad = (g: number) => (g * Math.PI) / 180

function cuerpo(puestos: Partial<Record<`${Parte}_${LadoCuerpo}`, Punto & { v?: number }>>): Cuerpo {
  const c: Cuerpo = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0.9 }))
  for (const [k, p] of Object.entries(puestos)) {
    const [parte, lado] = k.split('_') as [Parte, LadoCuerpo]
    c[indice(parte, lado)] = { x: p!.x, y: p!.y, v: p!.v ?? 0.95 }
  }
  return c
}

/** Gira un punto alrededor del origen: el móvil torcido. */
const girar = (p: Punto, t: number): Punto => ({ x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) })

const datos = (clave: string, extra: Partial<DatosSugerencia> = {}): DatosSugerencia => ({
  prueba: pruebaDe(clave)!, vista: 'perfil', trazos: [], cuerpos: {}, ajustes: {}, ladoMedido: 'd',
  inclinacion: 0, alza: false, clave: 0, ...extra,
})

describe('movilidad de hombro: la distancia entre los puños, en palmas', () => {
  const palma: Trazo = { tipo: 'palma', puntos: [{ x: 0, y: 0 }, { x: 0, y: 100 }] }
  const puños = (px: number): Trazo => ({ tipo: 'distancia', puntos: [{ x: 0, y: 0 }, { x: px, y: 0 }] })

  it('entre una palma y palma y media: un 2', () => {
    const s = sugerirNota(datos('fms.hombro', { trazos: [palma, puños(120)] }))!
    expect(s).toMatchObject({ nota: 2, limite: false })
    expect(s.explicacion).toBe('Puños a 1,2 palmas: entre una palma y palma y media.')
  })

  it('a menos de una, un 3; a más de palma y media, un 1; igual en el Nine Test', () => {
    expect(sugerirNota(datos('nine.hombro', { trazos: [palma, puños(80)] }))!.nota).toBe(3)
    expect(sugerirNota(datos('fms.hombro', { trazos: [palma, puños(170)] }))!.nota).toBe(1)
  })

  it('pegado a un umbral, está en el límite', () => {
    const s = sugerirNota(datos('fms.hombro', { trazos: [palma, puños(96)] }))!
    expect(s).toMatchObject({ nota: 3, limite: true })
    expect(s.explicacion).toMatch(/en el límite/)
  })

  it('sin la palma o sin la distancia, dice qué falta medir', () => {
    expect(sugerirNota(datos('fms.hombro', { trazos: [puños(120)] }))).toMatchObject({ nota: null })
    expect(sugerirNota(datos('fms.hombro'))!.explicacion).toMatch(/Mide la palma y la distancia/)
  })
})

/* Tumbado de perfil: la pierna izquierda en el suelo (cadera 100, rodilla 300, tobillo 500)
   y la derecha subiendo un ángulo a desde la cadera, con 400 de largo. */
function tumbado(a: number, inclinacion = 0, vRodilla = 0.95): Cuerpo {
  const p = (x: number, y: number) => girar({ x, y }, inclinacion)
  const tob = p(100 + 400 * Math.cos(rad(a)), 480 - 400 * Math.sin(rad(a)))
  const rod = p(100 + 200 * Math.cos(rad(a)), 480 - 200 * Math.sin(rad(a)))
  return cuerpo({
    cadera_i: p(100, 480), rodilla_i: { ...p(300, 480), v: vRodilla }, tobillo_i: p(500, 480),
    cadera_d: p(100, 480), rodilla_d: rod, tobillo_d: tob,
  })
}
/** Un vídeo que sube la pierna hasta `hasta` grados y vuelve a bajar. */
const subida = (hasta: number, inclinacion = 0) => {
  const fs: Record<number, Cuerpo> = {}
  const pasos = 16
  for (let k = 0; k <= 2 * pasos; k++) fs[k] = tumbado(hasta * (1 - Math.abs(k - pasos) / pasos), inclinacion)
  return fs
}

describe('elevación de pierna recta: dónde cae la vertical del tobillo', () => {
  it('la cuenta en fracción del muslo, con la pierna que sube por el tobillo más alto', () => {
    /* cos(81,4°) · 400 = 60 → el tobillo a 160: 0,3 del muslo. */
    expect(caidaDelTobillo(tumbado(81.37))).toBeCloseTo(0.3, 2)
  })

  it('subiendo hasta pasar la mitad del muslo: un 3, mirado en lo más alto', () => {
    const s = sugerirNota(datos('fms.pierna_recta', { cuerpos: subida(81.37) }))!
    expect(s).toMatchObject({ nota: 3, limite: false, clave: 16 })
    expect(s.falta).toEqual(['Que la otra pierna siga apoyada y neutra (a ojo).'])
  })

  it('entre la mitad y la rodilla un 2; por debajo de la rodilla un 1', () => {
    expect(sugerirNota(datos('fms.pierna_recta', { cuerpos: subida(70) }))!.nota).toBe(2)
    expect(sugerirNota(datos('fms.pierna_recta', { cuerpos: subida(45) }))!.nota).toBe(1)
  })

  it('cerca de la mitad del muslo, en el límite', () => {
    /* cos(75,5°) · 400 = 100 → 0,5 del muslo justo. */
    expect(sugerirNota(datos('fms.pierna_recta', { cuerpos: subida(75.5) }))!.limite).toBe(true)
  })

  it('con el móvil torcido y el suelo marcado, lo mismo', () => {
    const t = rad(6)
    expect(sugerirNota(datos('fms.pierna_recta', { cuerpos: subida(81.37, t), inclinacion: t }))!.nota).toBe(3)
  })

  it('si la rodilla de la otra pierna es dudosa, no sugiere', () => {
    const fs: Record<number, Cuerpo> = { 0: tumbado(80, 0, 0.2), 1: tumbado(80, 0, 0.2) }
    expect(sugerirNota(datos('fms.pierna_recta', { cuerpos: fs }))!.nota).toBeNull()
  })
})

/* De perfil mirando a la derecha, lado derecho. s de 0 (de pie) a 1 (el fondo). */
function sentadillaEn(s: number, fondo: { tronco: number; femur: number; tibia: number }): Cuerpo {
  const phi = rad(5 + (fondo.tibia - 5) * s)
  const beta = rad(-80 + (fondo.femur + 80) * s)
  const tau = rad(fondo.tronco * s)
  const A = { x: 200, y: 500 }
  const K = { x: A.x + 150 * Math.sin(phi), y: A.y - 150 * Math.cos(phi) }
  const H = { x: K.x - 150 * Math.cos(beta), y: K.y + 150 * Math.sin(beta) }
  const S = { x: H.x + 180 * Math.sin(tau), y: H.y - 180 * Math.cos(tau) }
  return cuerpo({ tobillo_d: A, rodilla_d: K, cadera_d: H, hombro_d: S })
}
const bajada = (fondo: { tronco: number; femur: number; tibia: number }) => {
  const fs: Record<number, Cuerpo> = {}
  for (let k = 0; k <= 24; k++) fs[k] = sentadillaEn(Math.min(1, k / 18), fondo)
  return fs
}

describe('sentadilla profunda: lo que se mide de perfil en el fondo', () => {
  const buena = bajada({ tronco: 30, femur: 10, tibia: 35 })

  it('tronco más vertical que la tibia y fémur bajo la horizontal, sin alza: apunta a 3 con condición', () => {
    const s = sugerirNota(datos('fms.sentadilla', { cuerpos: buena }))!
    expect(s.nota).toBe(3)
    expect(s.criterios.map(c => c.veredicto)).toEqual(['cumple', 'cumple'])
    expect(s.criterios[1].texto).toBe('fémur 10° por debajo de la horizontal')
    expect(s.falta).toHaveLength(2)
    expect(s.explicacion).toMatch(/si también se cumple lo de abajo/)
    expect(s.clave).toBeGreaterThanOrEqual(18)
  })

  it('lo mismo con el alza: un 2', () => {
    expect(sugerirNota(datos('fms.sentadilla', { cuerpos: buena, alza: true }))!.nota).toBe(2)
  })

  it('el fémur no baja: sin alza no da nota y dice que se repita con alza; con alza, un 1', () => {
    const corta = bajada({ tronco: 30, femur: -15, tibia: 35 })
    const sin = sugerirNota(datos('fms.sentadilla', { cuerpos: corta }))!
    expect(sin.nota).toBeNull()
    expect(sin.explicacion).toMatch(/no llega al 3/)
    expect(sugerirNota(datos('fms.sentadilla', { cuerpos: corta, alza: true }))!.nota).toBe(1)
  })

  it('el fémur casi horizontal: en el límite, sin nota', () => {
    const s = sugerirNota(datos('fms.sentadilla', { cuerpos: bajada({ tronco: 30, femur: 2, tibia: 35 }) }))!
    expect(s).toMatchObject({ nota: null, limite: true })
  })

  it('el tronco 8° más inclinado que la tibia: en el límite; 15°, no se cumple', () => {
    expect(sugerirNota(datos('fms.sentadilla', { cuerpos: bajada({ tronco: 43, femur: 10, tibia: 35 }) }))!.criterios[0].veredicto).toBe('limite')
    expect(sugerirNota(datos('fms.sentadilla', { cuerpos: bajada({ tronco: 50, femur: 10, tibia: 35 }) }))!.criterios[0].veredicto).toBe('no')
  })

  it('en el Nine Test solo cuenta el fémur, y la tabla alta es la de 4 cm', () => {
    const s = sugerirNota(datos('nine.sentadilla', { cuerpos: buena }))!
    expect(s.criterios.map(c => c.clave)).toEqual(['femur'])
    expect(s.nota).toBe(3)
    expect(textoParaGuardar(s, pruebaDe('nine.sentadilla')!, false)).toBe('3 · fémur 10° por debajo de la horizontal ✓ · con la tabla de 2 cm')
  })

  it('de frente, o sin esqueleto, dice qué hacer', () => {
    expect(sugerirNota(datos('fms.sentadilla', { cuerpos: buena, vista: 'frente' }))!.explicacion).toMatch(/de perfil/)
    expect(sugerirNota(datos('fms.sentadilla'))!.explicacion).toMatch(/Detectar el cuerpo/)
  })
})

describe('las demás pruebas son a ojo', () => {
  it('no sugiere nada', () => {
    for (const p of ['fms.valla', 'fms.zancada', 'fms.flexion', 'fms.rotatoria', 'nine.una_pierna', 'nine.diagonal']) {
      expect(sugerirNota(datos(p))).toBeNull()
    }
  })
})

describe('lo que se guarda', () => {
  it('la nota, si está en el límite, cada criterio con lo que vio y cómo se hizo', () => {
    const s = sugerirNota(datos('fms.sentadilla', { cuerpos: bajada({ tronco: 30, femur: 10, tibia: 35 }), alza: true }))!
    expect(textoParaGuardar(s, pruebaDe('fms.sentadilla')!, true))
      .toBe('2 · tronco 5° más vertical que la tibia ✓ · fémur 10° por debajo de la horizontal ✓ · con el alza')
  })
})
