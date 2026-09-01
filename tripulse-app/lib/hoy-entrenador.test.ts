import { describe, it, expect } from 'vitest'
import { filasDeHoy, ordenar, horaDe, resumenDeHoy, type SesionHoy } from './hoy-entrenador'

const NOMBRES = { 1: 'Marta R.', 2: 'Diego L.', 3: 'Nerea P.' }
const GRUPOS = { 'em1': { idGrupo: 'g-elite', nombre: 'Grupo Élite' } }
const s = (id: number, dep: number, extra: Partial<SesionHoy> = {}): SesionHoy =>
  ({ id, id_deportista: dep, disciplina: 'Carrera', ...extra })

describe('horaDe', () => {
  it('saca la hora de un texto corto', () => {
    expect(horaDe('07:30')).toBe('07:30')
    expect(horaDe('7:30')).toBe('07:30')
  })
  it('y de un timestamp entero', () => {
    expect(horaDe('2026-09-02T07:30:00+00:00')).toBe('07:30')
  })
  /* Sin hora la fila va al final y se enseña sin ella. Inventar una para poder
     ordenar sería poner en pantalla algo que nadie escribió. */
  it('sin hora devuelve null, no una hora inventada', () => {
    expect(horaDe(null)).toBeNull()
    expect(horaDe('')).toBeNull()
    expect(horaDe('mañana temprano')).toBeNull()
  })
  it('descarta horas imposibles', () => {
    expect(horaDe('99:99')).toBeNull()
    expect(horaDe('12:75')).toBeNull()
  })
})

describe('filasDeHoy', () => {
  it('una sesión suelta es una fila con el nombre del atleta', () => {
    const f = filasDeHoy([s(10, 1)], NOMBRES, GRUPOS)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ titulo: 'Marta R.', esGrupo: false, cuantos: 1, destino: '/sesion/10/dirigir' })
  })

  /* Cinco sesiones que comparten emisión son UN entrenamiento con cinco
     personas. Cinco líneas mentirían sobre lo que va a pasar en la pista. */
  it('las de una misma emisión se juntan en una sola fila de grupo', () => {
    const f = filasDeHoy([
      s(10, 1, { id_emision: 'em1' }),
      s(11, 2, { id_emision: 'em1' }),
      s(12, 3, { id_emision: 'em1' }),
    ], NOMBRES, GRUPOS)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ titulo: 'Grupo Élite', esGrupo: true, cuantos: 3, destino: '/grupo/g-elite/dirigir' })
  })

  /* Le llegó por esa vía, pero no hay grupo esperando en la pista. */
  it('una emisión con una sola sesión NO es un grupo', () => {
    const f = filasDeHoy([s(10, 1, { id_emision: 'em1' })], NOMBRES, GRUPOS)
    expect(f[0].esGrupo).toBe(false)
    expect(f[0].titulo).toBe('Marta R.')
  })

  it('un grupo sin nombre conocido se llama Grupo, no un identificador', () => {
    const f = filasDeHoy([
      s(10, 1, { id_emision: 'raro' }),
      s(11, 2, { id_emision: 'raro' }),
    ], NOMBRES, {})
    expect(f[0].titulo).toBe('Grupo')
  })

  it('mezcla grupos e individuales', () => {
    const f = filasDeHoy([
      s(10, 1, { id_emision: 'em1' }),
      s(11, 2, { id_emision: 'em1' }),
      s(12, 3),
    ], NOMBRES, GRUPOS)
    expect(f).toHaveLength(2)
    expect(f.filter(x => x.esGrupo)).toHaveLength(1)
  })

  it('una fila de grupo está hecha solo si TODOS la cerraron', () => {
    const media = filasDeHoy([
      s(10, 1, { id_emision: 'em1', estado: 'Realizada' }),
      s(11, 2, { id_emision: 'em1', estado: 'Planificada' }),
    ], NOMBRES, GRUPOS)
    expect(media[0].hecha).toBe(false)

    const toda = filasDeHoy([
      s(10, 1, { id_emision: 'em1', estado: 'Realizada' }),
      s(11, 2, { id_emision: 'em1', estado: 'Realizada' }),
    ], NOMBRES, GRUPOS)
    expect(toda[0].hecha).toBe(true)
  })

  it('un atleta sin nombre conocido no deja el hueco en blanco', () => {
    expect(filasDeHoy([s(10, 99)], NOMBRES, GRUPOS)[0].titulo).toBe('Deportista')
  })

  it('sin sesiones, ninguna fila', () => {
    expect(filasDeHoy([], NOMBRES, GRUPOS)).toEqual([])
    expect(filasDeHoy(null, NOMBRES, GRUPOS)).toEqual([])
  })
})

describe('ordenar', () => {
  const fila = (titulo: string, hora: string | null, hecha = false) =>
    ({ clave: titulo, esGrupo: false, titulo, disciplina: 'Carrera', cuantos: 1, destino: '', hora, hecha, sesiones: [] })

  it('lo más temprano primero', () => {
    const o = ordenar([fila('B', '18:00'), fila('A', '07:30')])
    expect(o.map(f => f.titulo)).toEqual(['A', 'B'])
  })

  it('lo que no tiene hora va detrás de lo que sí', () => {
    const o = ordenar([fila('SinHora', null), fila('ConHora', '18:00')])
    expect(o.map(f => f.titulo)).toEqual(['ConHora', 'SinHora'])
  })

  /* Cerrar la mañana también es mirar lo hecho, así que sigue estando — pero
     no ocupando el sitio de lo que falta. */
  it('lo ya realizado baja del todo, aunque fuera más temprano', () => {
    const o = ordenar([fila('Hecha', '07:00', true), fila('Pendiente', '19:00')])
    expect(o.map(f => f.titulo)).toEqual(['Pendiente', 'Hecha'])
  })

  it('a igualdad de hora, por nombre', () => {
    const o = ordenar([fila('Zoe', '07:30'), fila('Ana', '07:30')])
    expect(o.map(f => f.titulo)).toEqual(['Ana', 'Zoe'])
  })

  it('no muta la lista que recibe', () => {
    const l = [fila('B', '18:00'), fila('A', '07:30')]
    ordenar(l)
    expect(l[0].titulo).toBe('B')
  })
})

describe('resumenDeHoy', () => {
  const f = (hecha: boolean, cuantos = 1) =>
    ({ clave: 'k' + Math.random(), esGrupo: false, titulo: 't', disciplina: 'Carrera', cuantos, destino: '', hora: null, hecha, sesiones: [] })

  it('cuenta lo que queda por dirigir', () => {
    expect(resumenDeHoy([f(false), f(false), f(true)])).toContain('2 por dirigir')
  })
  it('y cuántas personas hay detrás', () => {
    expect(resumenDeHoy([f(false, 5)])).toContain('5 atletas')
  })
  it('lo dice cuando ya está todo', () => {
    expect(resumenDeHoy([f(true), f(true)])).toContain('Todo hecho')
  })
  it('y cuando no hay nada', () => {
    expect(resumenDeHoy([])).toBe('Hoy no entrena nadie')
  })
})
