import { describe, it, expect } from 'vitest'
import {
  esDePliometria, leerNivel, leerParte, peldano, resumenContactos, nivelesQueSePasan, avisoContactos,
  piezasDeTarea, piezasDeFilaCarrera, piezasDeFilaFuerza, reglaContactos, porLaEscalera, requisitoDe,
  TOPE_NSCA, NIVELES_PLIO, PARTES_PLIO,
} from './pliometria'

// La pliometría en TRIPULSE (21-10-2026): la escalera de la base de
// conocimiento, en contactos que se dan por hechos, con aviso por nivel.

describe('qué es de pliometría', () => {
  it('por su tipo, con o sin tilde', () => {
    expect(esDePliometria({ tipo: ['Fuerza', 'Pliometría'] })).toBe(true)
    expect(esDePliometria({ tipo: ['Pliometria'] })).toBe(true)
    expect(esDePliometria({ tipo: ['Fuerza', 'Técnica'] })).toBe(false)
    expect(esDePliometria(null)).toBe(false)
    expect(esDePliometria({ tipo: 'Pliometría' })).toBe(false)
  })

  it('el nivel y la parte, solo si tienen la forma', () => {
    expect(leerNivel('c')).toBe('c')
    expect(leerNivel('f')).toBeNull()
    expect(leerParte('superior')).toBe('superior')
    /* Uno de pliometría sin parte va al tren inferior, que es lo habitual. */
    expect(leerParte(null)).toBe('inferior')
    expect(leerParte(null, false)).toBeNull()
  })

  it('cada parte tiene sus cinco escalones, y solo el tren inferior lleva rango de contactos', () => {
    for (const p of PARTES_PLIO) for (const n of NIVELES_PLIO) expect(peldano(p.id, n).nombre).toBeTruthy()
    expect(peldano('inferior', 'c').rango).toEqual([40, 80])
    expect(peldano('superior', 'c').rango).toBeUndefined()
  })
})

describe('los contactos de una sesión', () => {
  it('los de pie son los del tren inferior; los lanzamientos, aparte', () => {
    const r = resumenContactos([
      { parte: 'inferior', nivel: 'a', contactos: 60 },
      { parte: 'inferior', nivel: 'c', contactos: 24 },
      { parte: 'superior', nivel: 'b', contactos: 30 },
      { parte: 'tronco', nivel: 'c', contactos: 20 },
    ])
    expect(r).toEqual({ pies: 84, porNivel: { a: 60, c: 24 }, lanzamientos: 50, sinContar: 0 })
  })

  it('lo que no es un número no suma pero se dice, y sin nivel cuenta en el total', () => {
    const r = resumenContactos([
      { parte: 'inferior', nivel: null, contactos: 10 },
      { parte: 'inferior', nivel: 'a', contactos: Number.NaN },
      { parte: 'inferior', nivel: 'b', contactos: -5 },
    ])
    expect(r).toEqual({ pies: 10, porNivel: {}, lanzamientos: 0, sinContar: 2 })
  })

  it('se marca el nivel que pasa de su rango aunque el total esté bien', () => {
    /* 90 de caída: el total entra en 60-100, pero el nivel c es de 40-80. */
    expect(nivelesQueSePasan({ a: 0, c: 90 })).toEqual(['c'])
    expect(nivelesQueSePasan({ a: 100, b: 120 })).toEqual([])
  })
})

describe('el aviso', () => {
  it('verde entre 60 y 100, ámbar hasta su tope, rojo por encima', () => {
    expect(avisoContactos(84, 'intermedio').clase).toBe('ok')
    expect(avisoContactos(110, 'intermedio').clase).toBe('alto')
    expect(avisoContactos(130, 'intermedio').clase).toBe('mucho')
    expect(avisoContactos(40, 'intermedio').clase).toBe('suave')
  })

  it('el tope depende de su nivel: 110 es rojo para un principiante y ámbar para un avanzado', () => {
    expect(avisoContactos(110, 'principiante').clase).toBe('mucho')
    expect(avisoContactos(110, 'avanzado').clase).toBe('alto')
    expect(TOPE_NSCA).toEqual({ principiante: 100, intermedio: 120, avanzado: 140, elite: 140 })
  })

  it('dice el número y de dónde sale', () => {
    expect(avisoContactos(130, 'intermedio').texto).toBe('Pasa del tope de un intermedio (120, según la NSCA). En resistencia se recomiendan 60–100.')
    expect(avisoContactos(100, 'elite').texto).toBe('Dentro de lo recomendado en resistencia (60–100).')
  })
})

describe('de las tareas a las piezas', () => {
  const BIB = [
    { id: 1, nombre: 'Pogo jumps', tipo: ['Pliometría'], nivel_pliometria: 'a', parte_pliometria: 'inferior' },
    { id: 2, nombre: 'Drop jump', tipo: ['Pliometría'], nivel_pliometria: 'c', parte_pliometria: 'inferior' },
    { id: 3, nombre: 'Pase de pecho de pie', tipo: ['Pliometría'], nivel_pliometria: 'a', parte_pliometria: 'superior' },
    { id: 4, nombre: 'Sentadilla trasera', tipo: ['Fuerza'] },
    { id: 5, nombre: 'Skipping alto', tipo: ['Técnica'] },
  ]

  it('carrera: series × contactos × bloques, desde el ejercicio de tecnica_id', () => {
    const t = { tecnica_id: 1, series: 2, bloques: 3, p_repeticiones: [{ repeticiones_planteadas: 10 }] }
    expect(piezasDeTarea(t, BIB)).toEqual([{ parte: 'inferior', nivel: 'a', contactos: 60 }])
    /* Un drill de técnica no es pliometría. */
    expect(piezasDeTarea({ tecnica_id: 5, series: 4, p_repeticiones: [{ repeticiones_planteadas: 20 }] }, BIB)).toEqual([])
  })

  it('fuerza: cada línea, el encadenado y la serie a serie; un rango cuenta por su centro', () => {
    const t = {
      ejercicios: [
        { ejercicio_id: 2, series: 3, repeticiones: 6 },
        { ejercicio_id: 4, series: 4, repeticiones: 5, ejercicio_encadenado_id: 1, encadenado_series: 4, encadenado_repeticiones: 8, encadenado_repeticiones_max: 12 },
        { ejercicio_id: 3, series: 3, series_detalle: [{ reps: 10 }, { reps: 8 }, { reps: 6 }] },
      ],
    }
    expect(piezasDeTarea(t, BIB)).toEqual([
      { parte: 'inferior', nivel: 'c', contactos: 18 },
      { parte: 'inferior', nivel: 'a', contactos: 40 },
      { parte: 'superior', nivel: 'a', contactos: 24 },
    ])
  })

  it('una línea sin id se busca por su nombre; los bloques con formato no se cuentan', () => {
    expect(piezasDeTarea({ ejercicios: [{ nombre: 'drop jump', series: 2, repeticiones: 5 }] }, BIB))
      .toEqual([{ parte: 'inferior', nivel: 'c', contactos: 10 }])
    expect(piezasDeTarea({ formato: 'amrap', ejercicios: [{ ejercicio_id: 1, series: 1, repeticiones: 20 }] }, BIB)).toEqual([])
  })

  it('la fila de carrera a medio escribir: solo cuenta en repeticiones', () => {
    const f = { esTecnica: true, tecnicaId: '2', series: '4', tipoMedicion: 'reps', valorMedicion: '5', enBloques: true, bloques: '2' }
    expect(piezasDeFilaCarrera(f, BIB)).toEqual([{ parte: 'inferior', nivel: 'c', contactos: 40 }])
    /* Por tiempo no hay contactos que contar: sale, pero en cero. */
    expect(piezasDeFilaCarrera({ ...f, tipoMedicion: 'seg', valorMedicion: '30' }, BIB)[0].contactos).toBe(0)
    expect(piezasDeFilaCarrera({ ...f, esTecnica: false }, BIB)).toEqual([])
  })

  it('la fila de fuerza a medio escribir, con el encadenado y su lista de series', () => {
    const f = {
      ejercicioSelId: '1', medida: 'reps', series: '3', repsFuerza: '20',
      ejercicioSelId2: '2', series2: '3', repsFuerza2: '6',
      detalle2: [{ reps: '6', kg: '', rir: '' }, { reps: '5', kg: '', rir: '' }, { reps: '4', kg: '', rir: '' }],
    }
    expect(piezasDeFilaFuerza(f, BIB)).toEqual([
      { parte: 'inferior', nivel: 'a', contactos: 60 },
      { parte: 'inferior', nivel: 'c', contactos: 15 },
    ])
    expect(piezasDeFilaFuerza({ ...f, medida: 'tiempo', ejercicioSelId2: '' }, BIB)).toEqual([{ parte: 'inferior', nivel: 'a', contactos: 0 }])
    expect(piezasDeFilaFuerza({ ejercicioSelId: '4', series: '5', repsFuerza: '5' }, BIB)).toEqual([])
  })
})

describe('la regla del contador', () => {
  it('la franja buena en 60-100, el tope de su nivel y el total, en % del ancho', () => {
    const r = reglaContactos(84, 'intermedio')
    expect(r.tope).toBe(120)
    expect(r.desde).toBeCloseTo(37.5)
    expect(r.hasta).toBeCloseTo(62.5)
    expect(r.enTope).toBeCloseTo(75)
    expect(r.marca).toBeCloseTo(52.5)
  })

  it('con muchos contactos la regla se alarga y la marca no se sale', () => {
    const r = reglaContactos(300, 'principiante')
    expect(r.marca).toBeLessThan(100)
    expect(r.enTope).toBeLessThan(r.marca)
  })
})

describe('la lista por la escalera', () => {
  const LISTA = [
    { id: 1, nombre: 'Tuck jump', tipo: ['Pliometría'], nivel_pliometria: 'b', parte_pliometria: 'inferior' },
    { id: 2, nombre: 'Drop jump', tipo: ['Pliometría'], nivel_pliometria: 'c', parte_pliometria: 'inferior' },
    { id: 3, nombre: 'CMJ', tipo: ['Pliometría'], nivel_pliometria: 'b', parte_pliometria: 'inferior' },
    { id: 4, nombre: 'Mi salto', tipo: ['Pliometría'], nivel_pliometria: null, parte_pliometria: null },
    { id: 5, nombre: 'Pase de pecho sentado', tipo: ['Pliometría'], nivel_pliometria: 'a', parte_pliometria: 'superior' },
    { id: 6, nombre: 'Sentadilla', tipo: ['Fuerza'], nivel_pliometria: null, parte_pliometria: null },
  ]

  it('por escalón y por nombre; los sin nivel, al final; nada que no sea pliometría', () => {
    const { vistos, cuantos } = porLaEscalera(LISTA, 'inferior')
    expect(vistos.map(e => e.nombre)).toEqual(['CMJ', 'Tuck jump', 'Drop jump', 'Mi salto'])
    expect(cuantos).toEqual({ b: 2, c: 1 })
  })

  it('un escalón elegido deja solo los suyos, y la cuenta sigue siendo la de todos', () => {
    const { vistos, cuantos } = porLaEscalera(LISTA, 'inferior', 'b')
    expect(vistos.map(e => e.id)).toEqual([3, 1])
    expect(cuantos.c).toBe(1)
    expect(porLaEscalera(LISTA, 'superior').vistos.map(e => e.id)).toEqual([5])
  })
})

describe('lo que pide cada escalón', () => {
  it('desde el c, en una frase y sin estropear las siglas', () => {
    expect(requisitoDe('inferior', 'a')).toBeNull()
    expect(requisitoDe('inferior', 'b')).toBeNull()
    expect(requisitoDe('inferior', 'c')).toBe('Antes: base de fuerza (≈1,5 × su peso en sentadilla, recomendación NSCA) y dominar a y b.')
    expect(requisitoDe('superior', 'e')).toBe('Antes: gesto estable en todo lo anterior.')
  })
})
