import { describe, it, expect } from 'vitest'
import { BATERIAS, resultadoBateria, type Lado } from './baterias-movimiento'
import {
  aDecima, aSerieGuardada, cambiosDesde, extremosDeSerie, faltanDe, filasDelInforme, fotogramasDelInforme, graficasDisponibles,
  grados, LIENZO, MAXIMO_VALORES, medidaDelFotograma, puntosDeSerie, queTrabajar, textoCambios, textoDolores, textoTambien,
  trazadoDe, TEXTO_DE_LA_APP,
} from './informe-movimiento'
import type { FilaPrueba, Medida, SerieGuardada } from './movimiento-datos'

const NINE = BATERIAS.nine
const FMS = BATERIAS.fms

let id = 0
const f = (prueba: string, lado: Lado, nota: number | null, extra: Partial<FilaPrueba> = {}): FilaPrueba => ({
  id: ++id, id_valoracion: 1, prueba, lado, nota, dolor: false, criterios: null, vista: null, fotograma: null, ...extra,
})

/* El Nine Test de la maqueta: 20 de 27. La una pierna derecha es lo peor y el hombro tiene los lados distintos. */
const nineHoy = (): FilaPrueba[] => [
  f('nine.sentadilla', 'unico', 2),
  f('nine.una_pierna', 'izq', 3),
  f('nine.una_pierna', 'der', 1, { criterios: { alineados: false, pelvis: true, tronco: true } }),
  f('nine.zancada', 'izq', 2), f('nine.zancada', 'der', 2),
  f('nine.cadera', 'izq', 3), f('nine.cadera', 'der', 3),
  f('nine.piernas_rectas', 'unico', 2),
  f('nine.flexion', 'unico', 3),
  f('nine.diagonal', 'izq', 2), f('nine.diagonal', 'der', 2),
  f('nine.rotacion', 'unico', 3),
  f('nine.hombro', 'izq', 3), f('nine.hombro', 'der', 2),
]

/* La anterior: 17 de 27. */
const nineAntes = (): FilaPrueba[] => [
  f('nine.sentadilla', 'unico', 2),
  f('nine.una_pierna', 'izq', 2), f('nine.una_pierna', 'der', 1),
  f('nine.zancada', 'izq', 1), f('nine.zancada', 'der', 2),
  f('nine.cadera', 'izq', 2), f('nine.cadera', 'der', 3),
  f('nine.piernas_rectas', 'unico', 2),
  f('nine.flexion', 'unico', 3),
  f('nine.diagonal', 'izq', 2), f('nine.diagonal', 'der', 2),
  f('nine.rotacion', 'unico', 2),
  f('nine.hombro', 'izq', 3), f('nine.hombro', 'der', 2),
]

describe('los datos de prueba son los de la maqueta', () => {
  it('20 de 27 hoy y 17 la anterior', () => {
    expect(resultadoBateria(NINE, nineHoy()).total).toBe(20)
    expect(resultadoBateria(NINE, nineAntes()).total).toBe(17)
  })
})

describe('lo que hay que trabajar', () => {
  it('primero lo prioritario (los 1 y los lados distintos), con su lado y su porqué', () => {
    const { puntos, tambien } = queTrabajar(NINE, nineHoy())
    expect(puntos.map(p => p.titulo)).toEqual(['Sentadilla a una pierna, derecha', 'Movilidad funcional de hombro, derecha'])
    expect(puntos[0]).toMatchObject({ nota: 1, detalle: 'Izquierda 3, derecha 1. No se cumple: cadera, rodilla y pie alineados.' })
    expect(puntos[1]).toMatchObject({ nota: 2, detalle: 'Izquierda 3, derecha 2.' })
    expect(tambien).toEqual(['Sentadilla profunda', 'Zancada en línea', 'Elevación de piernas rectas', 'Elevación diagonal'])
    expect(textoTambien(tambien)).toBe('También por debajo de 3: sentadilla profunda, zancada en línea, elevación de piernas rectas y elevación diagonal.')
  })

  it('los criterios que fallan son los del lado peor, no los del otro', () => {
    const regs = nineHoy().map(r => (r.prueba === 'nine.una_pierna' && r.lado === 'izq' ? { ...r, criterios: { pelvis: false } } : r))
    expect(queTrabajar(NINE, regs).puntos[0].detalle).not.toContain('pelvis')
  })

  it('sin nada prioritario, los 2 son los puntos', () => {
    const regs = nineHoy().map(r => (r.prueba === 'nine.una_pierna' || r.prueba === 'nine.hombro' ? { ...r, nota: 3 } : r))
    const q = queTrabajar(NINE, regs)
    expect(q.puntos.map(p => p.titulo)).toEqual(['Sentadilla profunda', 'Zancada en línea', 'Elevación de piernas rectas', 'Elevación diagonal'])
    expect(q.tambien).toEqual([])
  })

  it('todo a 3: nada que trabajar', () => {
    const regs = nineHoy().map(r => ({ ...r, nota: 3, criterios: null }))
    expect(queTrabajar(NINE, regs)).toEqual({ puntos: [], tambien: [] })
  })

  it('lo que duele va lo primero, y dice dónde', () => {
    const regs = [
      f('fms.hombro', 'izq', 3), f('fms.hombro', 'der', 3),
      f('fms.dolor_hombro', 'izq', null), f('fms.dolor_hombro', 'der', null, { dolor: true }),
      f('fms.sentadilla', 'unico', 1),
      f('fms.zancada', 'izq', 2), f('fms.zancada', 'der', 2, { dolor: true }),
    ]
    const { puntos } = queTrabajar(FMS, regs)
    expect(puntos.map(p => [p.titulo, p.nota])).toEqual([['Zancada en línea', 0], ['Movilidad de hombro', 0], ['Sentadilla profunda', 1]])
    expect(puntos[0].detalle).toBe('Izquierda 2, derecha 2. Duele al hacerla (derecha).')
    expect(puntos[1].detalle).toBe('Izquierda 3, derecha 3. Duele en la prueba de dolor de hombro (derecha).')
  })
})

describe('lo que ha cambiado', () => {
  it('las que suben y las que bajan desde la anterior, con sus notas', () => {
    const c = cambiosDesde(NINE, nineHoy(), nineAntes())
    expect(c.suben.map(x => x.nombre)).toEqual(['Zancada en línea', 'Flexión activa de cadera', 'Rotación sentado'])
    expect(c.bajan).toEqual([])
    expect(textoCambios(c.suben)).toBe('zancada en línea (1 → 2), flexión activa de cadera (2 → 3) y rotación sentado (2 → 3)')
    expect(cambiosDesde(NINE, nineAntes(), nineHoy()).bajan).toHaveLength(3)
  })

  it('sin anterior no hay cambios, y una prueba que falta en una de las dos no cuenta', () => {
    expect(cambiosDesde(NINE, nineHoy(), null)).toEqual({ suben: [], bajan: [] })
    const sinZancada = nineHoy().filter(r => r.prueba !== 'nine.zancada')
    expect(cambiosDesde(NINE, sinZancada, nineAntes()).suben.map(x => x.nombre)).not.toContain('Zancada en línea')
  })
})

describe('el dolor', () => {
  it('en el Nine Test, sin dolor; y mientras falten pruebas, solo de las hechas', () => {
    expect(textoDolores(NINE, nineHoy())).toBe('Sin dolor en ninguna prueba.')
    expect(textoDolores(NINE, nineHoy().slice(0, 3))).toBe('Sin dolor en las pruebas hechas.')
  })

  it('en el FMS no se dice «sin dolor» con pruebas de dolor sin apuntar', () => {
    expect(textoDolores(FMS, [f('fms.sentadilla', 'unico', 2)]))
      .toBe('Sin apuntar: prueba de dolor de hombro, prueba de dolor en extensión y prueba de dolor en flexión.')
    /* La de hombro es de dos lados: con uno solo sigue sin apuntar. */
    expect(textoDolores(FMS, [f('fms.dolor_hombro', 'izq', null), f('fms.dolor_extension', 'unico', null), f('fms.dolor_flexion', 'unico', null)]))
      .toBe('Sin apuntar: prueba de dolor de hombro.')
  })

  it('dice dónde duele, con el lado', () => {
    const regs = [f('fms.dolor_hombro', 'der', null, { dolor: true }), f('fms.sentadilla', 'unico', 0, { dolor: true })]
    expect(textoDolores(FMS, regs)).toBe('Duele: prueba de dolor de hombro (derecha), sentadilla profunda.')
  })
})

describe('lo que falta y la tabla', () => {
  it('las pruebas sin nota, en el orden de la batería', () => {
    const regs = nineHoy().filter(r => r.prueba !== 'nine.rotacion' && !(r.prueba === 'nine.hombro' && r.lado === 'der'))
    expect(faltanDe(NINE, regs)).toEqual(['Rotación sentado', 'Movilidad funcional de hombro'])
    expect(faltanDe(NINE, nineHoy())).toEqual([])
  })

  it('cada prueba con sus lados, su nota y la de la anterior', () => {
    const filas = filasDelInforme(NINE, nineHoy(), nineAntes())
    expect(filas).toHaveLength(9)
    expect(filas[1]).toMatchObject({ nombre: 'Sentadilla a una pierna', bilateral: true, izq: 3, der: 1, nota: 1, antes: 1 })
    expect(filas[0]).toMatchObject({ bilateral: false, izq: null, der: null, nota: 2 })
    expect(filasDelInforme(NINE, nineHoy(), null).every(x => x.antes == null)).toBe(true)
  })
})

/* Una serie como la del analizador: fotograma → valor, ya sin los dudosos. */
const serieAnalizador = (desde: number, valores: (number | null)[]) =>
  valores.flatMap((v, i) => (v == null ? [] : [{ clave: desde + i, valor: v }]))

describe('la curva que se guarda', () => {
  it('un valor por fotograma desde el primero, a una décima y null en los huecos', () => {
    const s = aSerieGuardada('rodilla', 'd', serieAnalizador(10, [170.43, 150.61, null, 90.5, 70.2, null, 120]), 30)!
    expect(s).toEqual({ clave: 'rodilla', lado: 'd', desde: 10, fps: 30, v: [170.4, 150.6, null, 90.5, 70.2, null, 120] })
    expect(puntosDeSerie(s)[4]).toEqual({ t: 14 / 30, v: 70.2 })
  })

  /* El visor enseña Math.round del valor exacto: a una décima, 69,46 sería 69,5,
     y el informe diría 70° donde el visor dijo 69°. */
  it('la décima no cambia el grado entero en que se redondea', () => {
    expect(aDecima(69.46)).toBe(69.4)
    expect(aDecima(-3.54)).toBe(-3.6)
    expect(aDecima(2.45)).toBe(2.4)
    expect(aDecima(69.5)).toBe(69.5)
    expect(aDecima(-3.45)).toBe(-3.4)
    for (let i = 0; i < 2000; i++) {
      const v = (Math.random() - 0.5) * 400
      expect(Math.round(aDecima(v)), String(v)).toBe(Math.round(v))
      expect(Math.abs(aDecima(v) - v), String(v)).toBeLessThanOrEqual(0.1 + 1e-9)
    }
  })

  it('el mínimo y el máximo salen como en el visor (redondeados igual)', () => {
    const datos = serieAnalizador(0, [100.49, 69.46, 172.46, 130])
    const g = graficasDisponibles(NINE, [conSerie(f('nine.sentadilla', 'unico', 2), aSerieGuardada('rodilla', 'i', datos, 30)!)])[0]
    expect(g.texto).toBe('de ' + Math.round(69.46) + '° a ' + Math.round(172.46) + '°')
  })

  it('los grados del informe, enteros y con signo menos de verdad', () => {
    expect(grados(-85.2)).toBe('−85°')
    expect(grados(9.6)).toBe('10°')
    expect(grados(-0.4)).toBe('0°')
  })

  it('en un vídeo muy largo se guarda de varios en varios, sin perder el mínimo ni el máximo', () => {
    const n = MAXIMO_VALORES * 3
    const datos = Array.from({ length: n }, (_, k) => ({ clave: k, valor: 120 + 40 * Math.sin(k / 50) }))
    datos[1001].valor = 30
    datos[2002].valor = 200
    const s = aSerieGuardada('cadera', 'i', datos, 30)!
    expect(s.paso).toBe(3)
    expect(s.v.length).toBeLessThanOrEqual(MAXIMO_VALORES)
    const e = extremosDeSerie(s)!
    expect([e.min.v, e.max.v]).toEqual([30, 200])
    expect(Math.abs(e.min.t - 1001 / 30)).toBeLessThan(3 / 30)
  })

  it('sin valores no hay curva', () => {
    expect(aSerieGuardada('rodilla', 'd', [], 30)).toBeNull()
  })
})

const conSerie = (r: FilaPrueba, ...series: SerieGuardada[]): FilaPrueba =>
  ({ ...r, medidas: [{ nombre: 'Ángulo 1', valor: '52°' }, ...series.map(s => ({ nombre: s.clave + ' en el vídeo (esqueleto)', valor: '…', serie: s }))] })

describe('las gráficas que se pueden incluir', () => {
  const rodilla = aSerieGuardada('rodilla', 'd', serieAnalizador(0, [172, 120, 70, 120, 171]), 30)!
  const cadera = aSerieGuardada('cadera', 'd', serieAnalizador(0, [170, 100, 60, 100, 168]), 30)!
  const tobillo = aSerieGuardada('tobillo', 'd', serieAnalizador(0, [95, 80, 72, 81, 94]), 30)!

  it('en el orden de la batería, de los lados y de las medidas, con cuánto fiarse', () => {
    const regs = nineHoy().map(r => {
      if (r.prueba === 'nine.sentadilla') return conSerie(r, tobillo, cadera, rodilla)
      if (r.prueba === 'nine.cadera') return conSerie(r, { ...cadera, lado: r.lado === 'izq' ? 'i' : 'd' })
      return r
    })
    const g = graficasDisponibles(NINE, regs)
    expect(g.map(x => [x.nombrePrueba, x.lado, x.nombre])).toEqual([
      ['Sentadilla profunda', 'unico', 'Rodilla'], ['Sentadilla profunda', 'unico', 'Cadera'], ['Sentadilla profunda', 'unico', 'Tobillo'],
      ['Flexión activa de cadera', 'izq', 'Cadera'], ['Flexión activa de cadera', 'der', 'Cadera'],
    ])
    expect(g[0]).toMatchObject({ texto: 'de 70° a 172°', fiabilidad: 'fiable', min: { v: 70 }, max: { v: 172 } })
    expect(g[1].fiabilidad).toBe('margen')
    expect(g[2].fiabilidad).toBe('sin_comprobar')
    expect(new Set(g.map(x => x.id)).size).toBe(g.length)
  })

  it('lo que no es una curva válida, o tiene muy pocos puntos, no se ofrece', () => {
    const corta = aSerieGuardada('rodilla', 'd', serieAnalizador(0, [170, 120]), 30)!
    const rara = { clave: 'rodilla', lado: 'x', desde: 0, fps: 30, v: [1, 2, 3] } as unknown as SerieGuardada
    const sinFps = { ...rodilla, fps: 0 }
    const otra = { ...rodilla, clave: 'frontal' }
    const regs = [conSerie(f('nine.sentadilla', 'unico', 2), corta, rara, sinFps, otra)]
    expect(graficasDisponibles(NINE, regs)).toEqual([])
    /* Y las medidas viejas, sin curva, tampoco rompen nada. */
    expect(graficasDisponibles(NINE, [f('nine.sentadilla', 'unico', 2, { medidas: [{ nombre: 'Ángulo 1', valor: '52°' }] })])).toEqual([])
    expect(graficasDisponibles(NINE, nineHoy())).toEqual([])
  })
})

describe('el dibujo de la gráfica', () => {
  it('la línea se corta en los huecos, y un valor suelto es un punto', () => {
    const s = aSerieGuardada('rodilla', 'd', serieAnalizador(0, [170, 150, null, 90, 70, 100, null, 120]), 30)!
    const t = trazadoDe(s)!
    expect(t.tramos).toHaveLength(3)
    expect(t.tramos[0].startsWith('M')).toBe(true)
    expect(t.tramos[2]).toContain('l0.01,0')
  })

  it('todo cae dentro del lienzo, y el mínimo abajo y el máximo arriba', () => {
    const s = aSerieGuardada('rodilla', 'd', serieAnalizador(15, [172, 160, 120, 80, 70, 90, 140, 171]), 30)!
    const t = trazadoDe(s)!
    expect(t.min).toMatchObject({ v: 70, x: expect.any(Number) })
    expect(t.min.y).toBeGreaterThan(t.max.y)
    for (const p of [t.min, t.max]) {
      expect(p.x).toBeGreaterThanOrEqual(LIENZO.izq); expect(p.x).toBeLessThanOrEqual(LIENZO.der)
      expect(p.y).toBeGreaterThanOrEqual(LIENZO.arriba); expect(p.y).toBeLessThanOrEqual(LIENZO.abajo)
    }
    /* Las marcas del eje: redondas, dentro, y entre 2 y 5. */
    expect(t.ejeY.length).toBeGreaterThanOrEqual(2)
    expect(t.ejeY.length).toBeLessThanOrEqual(5)
    for (const m of t.ejeY) { expect(m.v % 5).toBe(0); expect(m.y).toBeGreaterThanOrEqual(LIENZO.arriba - 0.1); expect(m.y).toBeLessThanOrEqual(LIENZO.abajo + 0.1) }
    /* El tiempo es el del vídeo: empieza en el fotograma 15 (0,5 s). */
    expect(t.ejeX[0].t).toBeGreaterThanOrEqual(0.5)
    expect(t.ejeX.at(-1)!.t).toBeLessThanOrEqual(22 / 30 + 1e-9)
  })

  it('una curva plana no divide por cero', () => {
    const t = trazadoDe(aSerieGuardada('tronco', 'i', serieAnalizador(0, [12, 12, 12, 12]), 30)!)!
    expect(t.tramos[0]).not.toContain('NaN')
    expect(t.ejeY.length).toBeGreaterThan(0)
  })

  it('con menos de tres valores no se dibuja', () => {
    expect(trazadoDe(aSerieGuardada('rodilla', 'd', serieAnalizador(0, [170, null, 120]), 30)!)).toBeNull()
  })
})

describe('los fotogramas', () => {
  it('uno por prueba y lado, en el orden de la batería, y dice de qué momento es', () => {
    const delFotograma: Medida = medidaDelFotograma(3.2, true)
    expect(delFotograma.valor).toBe('a los 3,20 s · ' + TEXTO_DE_LA_APP)
    const regs = [
      f('nine.hombro', 'der', 2, { fotograma: '14/1/nine.hombro-der.jpg' }),
      f('nine.una_pierna', 'der', 1, { fotograma: '14/1/nine.una_pierna-der.jpg', medidas: [{ nombre: 'Ángulo 1', valor: '9°' }, medidaDelFotograma(1.5, false)] }),
      f('nine.una_pierna', 'izq', 3, { fotograma: '14/1/nine.una_pierna-izq.jpg' }),
      f('nine.sentadilla', 'unico', 2, { fotograma: '14/1/nine.sentadilla-unico.jpg', medidas: [delFotograma] }),
      f('nine.flexion', 'unico', 3),
    ]
    const fotos = fotogramasDelInforme(NINE, regs)
    expect(fotos.map(x => x.titulo)).toEqual([
      'Sentadilla profunda', 'Sentadilla a una pierna · izq', 'Sentadilla a una pierna · der', 'Movilidad funcional de hombro · der',
    ])
    expect(fotos[0]).toMatchObject({ nota: 2, deLaApp: true, texto: 'a los 3,20 s · ' + TEXTO_DE_LA_APP })
    expect(fotos[2]).toMatchObject({ nota: 1, deLaApp: false, texto: 'a los 1,50 s' })
    expect(fotos[1].texto).toBe('')
  })

  it('con dolor, su nota es 0; y una foto se dice que es una foto', () => {
    const fotos = fotogramasDelInforme(NINE, [f('nine.flexion', 'unico', null, { dolor: true, fotograma: 'x.jpg' })])
    expect(fotos[0].nota).toBe(0)
    expect(medidaDelFotograma(null, false).valor).toBe('una foto')
  })
})
