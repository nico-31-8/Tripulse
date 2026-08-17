import { describe, it, expect } from 'vitest'
import { chipsDeSesiones, fusionarChips, semanaDe, zonaPicoDe } from './chips-desde-sesiones'
import type { ChipZona } from './chips'

const INICIO = '2026-08-17'   // un lunes

describe('en qué semana cae', () => {
  it('cuenta desde el inicio del lienzo', () => {
    expect(semanaDe(INICIO, '2026-08-17')).toBe(0)
    expect(semanaDe(INICIO, '2026-08-23')).toBe(0)   // domingo de la 1ª
    expect(semanaDe(INICIO, '2026-08-24')).toBe(1)
    expect(semanaDe(INICIO, '2026-10-05')).toBe(7)
  })

  it('lo anterior al plan da negativo, no cero', () => {
    // Ponerlo en la semana 0 sería mentir sobre cuándo se hizo.
    expect(semanaDe(INICIO, '2026-08-10')).toBeLessThan(0)
  })
})

describe('la zona que representa a la sesión', () => {
  it('es la más dura de sus tareas', () => {
    expect(zonaPicoDe(['AER', 'PAE', 'AEL'])).toBe('PAE')
    expect(zonaPicoDe(['AEL', 'AER'])).toBe('AEL')
  })

  it('sabe de las dos escalas y de las de fuerza', () => {
    expect(zonaPicoDe(['Z1', 'Z5', 'Z2'])).toBe('Z5')
    expect(zonaPicoDe(['FLEX', 'FMI'])).toBe('FMI')
  })

  it('sin zonas, ninguna', () => {
    expect(zonaPicoDe([])).toBeNull()
    expect(zonaPicoDe([null, undefined, ''])).toBeNull()
  })
})

describe('reconstruir los chips', () => {
  const sesiones = [
    { id: 1, fecha_sesion: '2026-08-18', disciplina: 'Carrera', zonas: ['AER', 'AEI'] },
    { id: 2, fecha_sesion: '2026-08-25', disciplina: 'Fuerza', zonas: ['FMI'] },
    { id: 3, fecha_sesion: '2026-08-19', disciplina: 'Natacion', zonas: ['AEL'] },
  ]

  it('un chip por sesión, con su semana, disciplina y zona pico', () => {
    const chips = chipsDeSesiones(sesiones, INICIO, 12)
    expect(chips).toHaveLength(3)
    const car = chips.find(c => c.disciplina === 'Carrera')!
    expect(car.semana).toBe(0)
    expect(car.zona).toBe('AEI')
    expect(car.hecho).toBe(true)
    expect(chips.find(c => c.disciplina === 'Fuerza')!.semana).toBe(1)
  })

  /* Rehacerlo dos veces tiene que dar lo mismo: el id sale del de la sesión,
     así que no se acumulan copias cada vez que se pulsa el botón. */
  it('es idempotente', () => {
    const a = chipsDeSesiones(sesiones, INICIO, 12)
    const b = chipsDeSesiones(sesiones, INICIO, 12)
    expect(a.map(c => c.id)).toEqual(b.map(c => c.id))
    expect(new Set(a.map(c => c.id)).size).toBe(a.length)
  })

  it('se salta las que no tienen zona y las de fuera del lienzo', () => {
    const chips = chipsDeSesiones([
      { id: 9, fecha_sesion: '2026-08-18', disciplina: 'Carrera', zonas: [] },
      { id: 10, fecha_sesion: '2026-07-01', disciplina: 'Carrera', zonas: ['AEL'] },
      { id: 11, fecha_sesion: '2027-01-01', disciplina: 'Carrera', zonas: ['AEL'] },
    ], INICIO, 12)
    expect(chips).toEqual([])
  })

  it('sin fecha de inicio no inventa nada', () => {
    expect(chipsDeSesiones(sesiones, '', 12)).toEqual([])
  })
})

describe('fusionar con lo que ya había', () => {
  /* Los chips SIN programar son los únicos que no están en ninguna otra tabla:
     barrerlos al reconstruir sería cambiar un agujero por otro. */
  it('conserva los que aún no se han bajado al calendario', () => {
    const actuales: ChipZona[] = [
      { id: 'a', semana: 3, disciplina: 'Ciclismo', zona: 'AEM' },
      { id: 'b', semana: 0, disciplina: 'Carrera', zona: 'AER', hecho: true },
    ]
    const nuevos = chipsDeSesiones(
      [{ id: 1, fecha_sesion: '2026-08-18', disciplina: 'Carrera', zonas: ['AEI'] }], INICIO, 12)

    const r = fusionarChips(actuales, nuevos)
    expect(r.map(c => c.id)).toEqual(['a', 'ses-1'])
  })

  it('sin nada previo, son los reconstruidos', () => {
    const nuevos = chipsDeSesiones(
      [{ id: 1, fecha_sesion: '2026-08-18', disciplina: 'Carrera', zonas: ['AEI'] }], INICIO, 12)
    expect(fusionarChips([], nuevos)).toEqual(nuevos)
  })
})
