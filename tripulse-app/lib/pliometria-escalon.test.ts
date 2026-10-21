import { describe, it, expect } from 'vitest'
import {
  recomendar, recomendadoParaGuardar, escalonesActuales, porEncimaDeSuEscalon, rsiDe, limiteDe, contactosParaEmpezar,
  CRITERIOS, DATOS_VACIOS, type Comprobaciones, type DatosApp,
} from './pliometria-escalon'

// El escalón lo pone el entrenador; esto solo recomienda (21-10-2026). Los
// casos son los de la maqueta que vio el usuario.

const datos = (x: Partial<DatosApp>): DatosApp => ({ ...DATOS_VACIOS, semanasFuerza: 4, ...x })
const ids = (xs: { criterio: { id: string } }[]) => xs.map(x => x.criterio.id)

describe('dónde lo coloca', () => {
  it('Laura, que no aterriza en silencio: antes del a, aterrizajes', () => {
    const r = recomendar({ eqPie: true, silencio: false }, datos({ peso: 61 }))
    expect(r.tipo).toBe('aterrizajes')
    if (r.tipo === 'aterrizajes') expect(ids(r.no)).toEqual(['silencio'])
  })

  it('Ana: el b; para el c le falta el contacto, y la sentadilla avisa sin frenar', () => {
    const c: Comprobaciones = { eqPie: true, silencio: true, eqCuarto: true, caida30: true }
    const r = recomendar(c, datos({ peso: 58, sentadilla: 76, cmj: 31, caja: 30, contacto: 270, salto: 24 }))
    expect(r.tipo).toBe('escalon')
    if (r.tipo !== 'escalon') return
    expect(r.escalon).toBe('b')
    expect(r.siguiente).toBe('c')
    expect(ids(r.no)).toEqual(['contacto'])
    expect(ids(r.orientativoSiguiente)).toEqual(['sentadilla'])
  })

  it('Marcos, que viene del atletismo: el d; el e lo frena que su prueba no lo pide', () => {
    const c: Comprobaciones = { eqPie: true, silencio: true, eqCuarto: true, caida30: true, eqMedia: true, unaPierna: true, unilateral: true, asimetria: 6, tendones4: true, prueba: false }
    const r = recomendar(c, datos({ peso: 72, sentadilla: 115, cmj: 44, caja: 30, contacto: 205, salto: 38 }))
    expect(r.tipo === 'escalon' && r.escalon).toBe('d')
    if (r.tipo === 'escalon') expect(ids(r.no)).toEqual(['prueba'])
  })

  it('Pedro, máster con la rodilla operada, y Hugo, que aún crece: no pasan del b aunque cumplan más', () => {
    const base: Comprobaciones = { eqPie: true, silencio: true, eqCuarto: true, caida30: true, eqMedia: true, unaPierna: true }
    const d = datos({ peso: 80, sentadilla: 125, caja: 20, contacto: 230 })
    for (const c of [{ ...base, rodilla: true }, { ...base, creciendo: true }]) {
      const r = recomendar(c, d)
      expect(r.tipo === 'escalon' && r.escalon).toBe('b')
      if (r.tipo !== 'escalon') continue
      expect(r.limite).toMatch(/NSCA/)
      expect(r.siguiente).toBeNull()
      expect(r.no).toEqual([])
    }
  })

  it('a quien no va a pasar del b no se le pide lo del c', () => {
    /* Sin drop jump: si el límite se mirara después, diría «para el c falta medirlo». */
    const r = recomendar({ eqPie: true, silencio: true, eqCuarto: true, caida30: true, creciendo: true }, datos({}))
    expect(r.tipo === 'escalon' && r.escalon).toBe('b')
    if (r.tipo !== 'escalon') return
    expect(r.sinMirar).toEqual([])
    expect(r.siguiente).toBeNull()
    expect(r.limite).toMatch(/creciendo/)
  })

  it('Iván, sin evaluar: no recomienda nada y dice qué mirar primero', () => {
    const r = recomendar({}, datos({ peso: 78 }))
    expect(r.tipo).toBe('sin-datos')
    if (r.tipo === 'sin-datos') expect(ids(r.sinMirar)).toEqual(['eqPie', 'silencio'])
  })

  it('con dolor de tendón no salta, cumpla lo que cumpla', () => {
    const r = recomendar({ dolor: true, eqPie: true, silencio: true }, datos({}))
    expect(r.tipo).toBe('no-salta')
  })
})

describe('sin mirar no es suspender', () => {
  it('lo que falta por mirar para el siguiente se dice aparte de lo que no cumple', () => {
    const r = recomendar({ eqPie: true, silencio: true, eqCuarto: true }, datos({}))
    expect(r.tipo === 'escalon' && r.escalon).toBe('a')
    if (r.tipo !== 'escalon') return
    expect(r.no).toEqual([])
    expect(ids(r.sinMirar)).toEqual(['caida30'])
  })

  it('el CMJ es un dato: si falta no frena', () => {
    const r = recomendar({ eqPie: true, silencio: true, eqCuarto: true, caida30: true }, datos({ cmj: null }))
    expect(r.tipo === 'escalon' && r.escalon).toBe('b')
  })

  it('la fuerza hecha fuera de la app vale como la de dentro', () => {
    expect(recomendar({ eqPie: true, silencio: true }, datos({ semanasFuerza: 1 })).tipo).toBe('no-salta')
    expect(recomendar({ eqPie: true, silencio: true, fuerzaFuera: true }, datos({ semanasFuerza: 1 })).tipo).toBe('escalon')
  })

  it('la diferencia entre piernas solo cuenta tras una lesión de un lado', () => {
    const c: Comprobaciones = { eqPie: true, silencio: true, eqCuarto: true, caida30: true, eqMedia: true, unaPierna: true }
    const d = datos({ caja: 30, contacto: 200 })
    expect(recomendar(c, d).tipo === 'escalon' && (recomendar(c, d) as { escalon: string }).escalon).toBe('d')
    const conLesion = recomendar({ ...c, unilateral: true }, d)
    expect(conLesion.tipo === 'escalon' && conLesion.escalon).toBe('c')
    expect(recomendar({ ...c, unilateral: true, asimetria: 9 }, d).tipo === 'escalon').toBe(true)
    const conDiferencia = recomendar({ ...c, unilateral: true, asimetria: 15 }, d)
    expect(conDiferencia.tipo === 'escalon' && conDiferencia.escalon).toBe('c')
  })
})

describe('los datos de los tests', () => {
  it('el drop jump: contacto por debajo de 250 ms desde 20 cm o más', () => {
    const contacto = CRITERIOS.c.find(x => x.id === 'contacto')!
    expect(contacto.evaluar({}, datos({ caja: 30, contacto: 249 }))).toBe('si')
    expect(contacto.evaluar({}, datos({ caja: 30, contacto: 250 }))).toBe('no')
    expect(contacto.evaluar({}, datos({ caja: 15, contacto: 200 }))).toBe('no')
    expect(contacto.evaluar({}, datos({}))).toBe('sin')
    expect(contacto.dice!({}, datos({ caja: 30, contacto: 270 }))).toBe('270 ms desde 30 cm: baja a 20 cm y vuelve a medirlo.')
  })

  it('el RSI: el guardado, o altura entre contacto', () => {
    expect(rsiDe(datos({ rsi: 1.8 }))).toBe(1.8)
    expect(rsiDe(datos({ salto: 30, contacto: 200 }))).toBeCloseTo(1.5)
    expect(rsiDe(datos({}))).toBeNull()
  })

  it('la sentadilla dice cuánto le falta', () => {
    const s = CRITERIOS.c.find(x => x.id === 'sentadilla')!
    expect(s.dice!({}, datos({ peso: 58, sentadilla: 76 }))).toBe('1,31 × su peso (le faltan 11 kg).')
    expect(s.evaluar({}, datos({ peso: 58 }))).toBe('sin')
  })

  it('con más de 100 kg avisa del cajón', () => {
    const r = recomendar({ eqPie: true, silencio: true }, datos({ peso: 104 }))
    expect(r.tipo === 'escalon' && r.ojo.some(o => /46 cm/.test(o.texto || ''))).toBe(true)
  })
})

describe('lo que se guarda y el historial', () => {
  it('la recomendación, en la forma de la columna', () => {
    expect(recomendadoParaGuardar(recomendar({}, datos({})))).toBeNull()
    expect(recomendadoParaGuardar(recomendar({ dolor: true }, datos({})))).toBe('no-salta')
    expect(recomendadoParaGuardar(recomendar({ eqPie: true, silencio: false }, datos({})))).toBe('aterrizajes')
    expect(recomendadoParaGuardar(recomendar({ eqPie: true, silencio: true }, datos({})))).toBe('a')
  })

  it('el escalón de hoy es la última fila de cada parte; «sin poner» también cuenta', () => {
    const h = escalonesActuales([
      { id: 1, parte: 'inferior', escalon: 'a', recomendado: null, puesto_en: '2026-10-01T10:00:00Z' },
      { id: 2, parte: 'inferior', escalon: 'b', recomendado: 'b', puesto_en: '2026-10-15T10:00:00Z' },
      { id: 3, parte: 'superior', escalon: 'c', recomendado: null, puesto_en: '2026-10-02T10:00:00Z' },
      { id: 4, parte: 'superior', escalon: null, recomendado: null, puesto_en: '2026-10-20T10:00:00Z' },
    ])
    expect(h.inferior.escalon).toBe('b')
    expect(h.superior.escalon).toBeNull()
    expect(h.superior.fila?.id).toBe(4)
    expect(h.tronco).toEqual({ escalon: null, fila: null })
  })

  it('marca los saltos por encima de su escalón, y sin escalón ninguno', () => {
    expect(porEncimaDeSuEscalon('d', 'b')).toBe(true)
    expect(porEncimaDeSuEscalon('b', 'b')).toBe(false)
    expect(porEncimaDeSuEscalon('d', null)).toBe(false)
    expect(porEncimaDeSuEscalon(null, 'a')).toBe(false)
  })

  it('arranca en el suelo del rango de su escalón', () => {
    expect(contactosParaEmpezar('b')).toBe(80)
    expect(contactosParaEmpezar('c')).toBe(40)
  })

  it('los límites salen de lo que marca el entrenador', () => {
    expect(limiteDe({})).toBeNull()
    expect(limiteDe({ creciendo: true })?.tope).toBe('b')
  })
})
