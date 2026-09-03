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

describe('el chip reconstruido se puede devolver al pool', () => {
  const ses = (id: number, fecha: string, disc: string, zonas: string[]) =>
    ({ id, fecha_sesion: fecha, disciplina: disc, zonas })

  it('lleva el id de la sesión EN SU CAMPO, no solo dentro del id', () => {
    /* ESTO FALTABA. `devolver-al-pool` busca por `id_sesion`, así que un chip
       reconstruido no se podía devolver: al borrar su sesión no había forma de
       saber cuál era el suyo. El dato estaba en el id —'ses-42'— pero en un
       sitio donde nadie lo miraba. */
    const [c] = chipsDeSesiones([ses(42, '2026-08-18', 'Carrera', ['AEL'])], '2026-08-17', 4)
    expect(c.id_sesion).toBe(42)
    expect(c.id).toBe('ses-42')
  })

  it('todos los reconstruidos lo llevan', () => {
    const cs = chipsDeSesiones([
      ses(1, '2026-08-18', 'Carrera', ['AEL']),
      ses(2, '2026-08-19', 'Fuerza', ['FMH']),
      ses(3, '2026-08-25', 'Natacion', ['AER']),
    ], '2026-08-17', 4)
    expect(cs).toHaveLength(3)
    for (const c of cs) expect(c.id_sesion, c.id).toBeTruthy()
  })
})

describe('poner los chips al día con el calendario', () => {
  const dibujado = (id: string, semana: number, zona: string) =>
    ({ id, semana, disciplina: 'Carrera', zona })

  it('una sesión NUEVA en el calendario aparece como chip', () => {
    const nuevos = chipsDeSesiones(
      [{ id: 7, fecha_sesion: '2026-08-19', disciplina: 'Carrera', zonas: ['PAE'] }],
      '2026-08-17', 4)
    const fusion = fusionarChips([], nuevos)
    expect(fusion).toHaveLength(1)
    expect(fusion[0].zona).toBe('PAE')
  })

  it('una sesión BORRADA se lleva su chip', () => {
    /* Antes el chip se quedaba para siempre: el lienzo enseñaba una semana que
       ya no existía en el calendario. */
    const antes = [{ ...dibujado('ses-7', 1, 'PAE'), hecho: true, id_sesion: 7 }]
    const fusion = fusionarChips(antes, chipsDeSesiones([], '2026-08-17', 4))
    expect(fusion).toEqual([])
  })

  it('pero lo DIBUJADO y aún no bajado se respeta', () => {
    /* De esos no hay rastro en ninguna tabla: barrerlos sería cambiar un
       agujero por otro. */
    const antes = [
      dibujado('mano-1', 2, 'AEL'),                                        // sin bajar
      { ...dibujado('ses-7', 1, 'PAE'), hecho: true, id_sesion: 7 },       // ya bajado
    ]
    const fusion = fusionarChips(antes, chipsDeSesiones([], '2026-08-17', 4))
    expect(fusion.map(c => c.id)).toEqual(['mano-1'])
  })

  it('hacerlo dos veces da lo mismo: no se duplica nada', () => {
    /* La página lo hace en CADA carga, así que abrir el dibujo diez veces no
       puede dejar diez chips por sesión. */
    const ses = [{ id: 7, fecha_sesion: '2026-08-19', disciplina: 'Carrera', zonas: ['PAE'] }]
    const una = fusionarChips([], chipsDeSesiones(ses, '2026-08-17', 4))
    const dos = fusionarChips(una, chipsDeSesiones(ses, '2026-08-17', 4))
    expect(dos).toEqual(una)
  })

  it('una sesión movida de semana cambia de columna, no se clona', () => {
    const antes = fusionarChips([], chipsDeSesiones(
      [{ id: 7, fecha_sesion: '2026-08-19', disciplina: 'Carrera', zonas: ['PAE'] }], '2026-08-17', 4))
    expect(antes[0].semana).toBe(0)
    const despues = fusionarChips(antes, chipsDeSesiones(
      [{ id: 7, fecha_sesion: '2026-08-26', disciplina: 'Carrera', zonas: ['PAE'] }], '2026-08-17', 4))
    expect(despues).toHaveLength(1)
    expect(despues[0].semana).toBe(1)
  })
})
