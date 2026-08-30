import { describe, it, expect } from 'vitest'
import { devolverAlPool, chipsEnlazados, loQueSePierde } from './devolver-al-pool'
import type { ChipZona } from './chips'

const chip = (o: Partial<ChipZona> & { id: string }): ChipZona =>
  ({ semana: 0, disciplina: 'Carrera', zona: 'AEL', ...o })

describe('devolverAlPool — con enlace (el camino bueno)', () => {
  it('des-marca los chips de esa sesión y suelta el enlace', () => {
    const chips = [
      chip({ id: 'a', hecho: true, id_sesion: 7 }),
      chip({ id: 'b', hecho: true, id_sesion: 9 }),
    ]
    const r = devolverAlPool(chips, { id: 7, disciplina: 'Carrera', zonas: ['AEL'] }, 0)
    expect(r.find(z => z.id === 'a')).toMatchObject({ hecho: false, id_sesion: undefined })
    expect(r.find(z => z.id === 'b')).toMatchObject({ hecho: true, id_sesion: 9 })
  })

  it('no crea chips de más cuando ya hay enlace', () => {
    const chips = [chip({ id: 'a', hecho: true, id_sesion: 7 })]
    expect(devolverAlPool(chips, { id: 7, disciplina: 'Carrera', zonas: ['AEL'] }, 0)).toHaveLength(1)
  })

  it('una compleja enlazada vuelve entera y conserva su grupo', () => {
    const chips = [
      chip({ id: 'a', zona: 'AEL', hecho: true, id_sesion: 7, grupo: 'g1' }),
      chip({ id: 'b', zona: 'AEI', hecho: true, id_sesion: 7, grupo: 'g1' }),
    ]
    const r = devolverAlPool(chips, { id: 7, disciplina: 'Carrera', zonas: ['AEL', 'AEI'] }, 0)
    expect(r.every(z => z.hecho === false && z.grupo === 'g1')).toBe(true)
  })

  it('un brick enlazado vuelve con sus bloques', () => {
    const conBrick = chip({ id: 'a', disciplina: 'Brick', zona: 'AEM', hecho: true, id_sesion: 7,
      brick: { bloques: [{ disciplina: 'Ciclismo', zona: 'AEM', minutos: 40 }] } as any })
    const r = devolverAlPool([conBrick], { id: 7, disciplina: 'Brick', zonas: ['AEM'] }, 0)
    expect(r[0].brick).toBeDefined()
    expect(r[0].hecho).toBe(false)
  })
})

describe('devolverAlPool — sin enlace (sesiones viejas o hechas a mano)', () => {
  it('rescata un chip hecho que encaja en vez de inventar otro', () => {
    const chips = [chip({ id: 'viejo', zona: 'PAE', hecho: true })]
    const r = devolverAlPool(chips, { id: 7, disciplina: 'Carrera', zonas: ['PAE'] }, 0)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'viejo', hecho: false })
  })

  it('no rescata uno de otra semana', () => {
    const chips = [chip({ id: 'otra', zona: 'PAE', hecho: true, semana: 3 })]
    const r = devolverAlPool(chips, { id: 7, disciplina: 'Carrera', zonas: ['PAE'] }, 0)
    expect(r).toHaveLength(2)
    expect(r.find(z => z.id === 'otra')!.hecho).toBe(true)
  })

  it('no roba el chip de otra sesión ya enlazada', () => {
    const chips = [chip({ id: 'deOtra', zona: 'PAE', hecho: true, id_sesion: 99 })]
    const r = devolverAlPool(chips, { id: 7, disciplina: 'Carrera', zonas: ['PAE'] }, 0)
    expect(r.find(z => z.id === 'deOtra')).toMatchObject({ hecho: true, id_sesion: 99 })
    expect(r).toHaveLength(2)
  })

  it('no usa el mismo chip dos veces para dos zonas iguales', () => {
    const chips = [chip({ id: 'uno', zona: 'FLEX', disciplina: 'Fuerza', hecho: true })]
    const r = devolverAlPool(chips, { id: 7, disciplina: 'Fuerza', zonas: ['FLEX', 'FLEX'] }, 0)
    expect(r.filter(z => !z.hecho)).toHaveLength(2)
    expect(r).toHaveLength(2)
  })

  it('inventa el chip cuando no hay nada que rescatar', () => {
    const r = devolverAlPool([], { id: 7, disciplina: 'Fuerza', zonas: ['FMH'] }, 2)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ semana: 2, disciplina: 'Fuerza', zona: 'FMH', hecho: false })
  })

  it('varias zonas vuelven agrupadas como la unidad compleja que eran', () => {
    const r = devolverAlPool([], { id: 7, disciplina: 'Carrera', zonas: ['AEL', 'AEI'] }, 0)
    expect(new Set(r.map(z => z.grupo)).size).toBe(1)
    expect(r[0].grupo).toBeTruthy()
  })

  it('una sola zona vuelve suelta, sin grupo', () => {
    const r = devolverAlPool([], { id: 7, disciplina: 'Carrera', zonas: ['AEL'] }, 0)
    expect(r[0].grupo).toBeUndefined()
  })

  it('la misma vuelta da siempre lo mismo (sin aleatorios)', () => {
    const a = devolverAlPool([], { id: 7, disciplina: 'Carrera', zonas: ['AEL', 'AEI'] }, 0)
    const b = devolverAlPool([], { id: 7, disciplina: 'Carrera', zonas: ['AEL', 'AEI'] }, 0)
    expect(a).toEqual(b)
  })

  it('no toca los chips que aún están en el pool', () => {
    const chips = [chip({ id: 'enPool' }), chip({ id: 'usado', zona: 'PAE', hecho: true })]
    const r = devolverAlPool(chips, { id: 7, disciplina: 'Carrera', zonas: ['PAE'] }, 0)
    expect(r.find(z => z.id === 'enPool')).toEqual(chips[0])
  })
})

describe('chipsEnlazados', () => {
  it('encuentra los de esa sesión y solo esos', () => {
    const chips = [chip({ id: 'a', id_sesion: 7 }), chip({ id: 'b', id_sesion: 8 }), chip({ id: 'c' })]
    expect(chipsEnlazados(chips, 7).map(z => z.id)).toEqual(['a'])
  })
})

describe('loQueSePierde', () => {
  it('avisa de la duración y de las notas', () => {
    expect(loQueSePierde({ duracion_minutos: 60, notas_entrenador: 'ojo rodilla' })).toHaveLength(2)
  })
  it('no cuenta unas notas en blanco', () => {
    expect(loQueSePierde({ duracion_minutos: null, notas_entrenador: '   ' })).toEqual([])
  })
  it('no se pierde nada en una sesión pelada', () => {
    expect(loQueSePierde({})).toEqual([])
  })
})
