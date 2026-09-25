import { describe, it, expect } from 'vitest'
import { buscarEjercicios, ejercicioDe, normalizar } from './buscar-ejercicio'

/* Ejercicios de verdad de la biblioteca, con sus rarezas incluidas: la
   «sentadilla Sumo » viene en minúscula y con un espacio al final. */
const BIB = [
  { id: 1, nombre: 'Sentadilla', grupo_muscular: 'Cuádriceps' },
  { id: 2, nombre: 'Sentadilla búlgara', grupo_muscular: 'Cuádriceps' },
  { id: 3, nombre: 'sentadilla Sumo ', grupo_muscular: 'Cuádriceps' },
  { id: 4, nombre: 'Sentadilla lateral', grupo_muscular: 'Cadera y aductores' },
  { id: 5, nombre: 'Sentadilla isometrica en posicion aero', grupo_muscular: 'Ciclismo — específico' },
  { id: 6, nombre: 'Paseo del granjero', grupo_muscular: 'Core y estabilidad' },
  { id: 7, nombre: 'Plancha frontal', grupo_muscular: 'Core y estabilidad' },
  { id: 8, nombre: 'Zancadas', grupo_muscular: 'Cuádriceps' },
  { id: 9, nombre: 'Psoas en camilla', grupo_muscular: 'Cadera y aductores', descripcion: 'Útil en lordosis marcada' },
]

describe('el camino de siempre: grupo elegido y sin escribir', () => {
  it('devuelve todos los del grupo, por orden alfabético', () => {
    const r = buscarEjercicios(BIB, { grupo: 'Cuádriceps' })
    expect(r.enGrupo.map(e => e.id)).toEqual([1, 2, 3, 8])
    expect(r.enOtros).toEqual([])
  })

  it('no recorta la lista del grupo: es para mirarla, no un resultado', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => ({ id: i, nombre: 'E' + i, grupo_muscular: 'G' }))
    expect(buscarEjercicios(muchos, { grupo: 'G' }).enGrupo).toHaveLength(30)
  })

  it('sin grupo y sin texto, nada: enseñar 238 de golpe no es ayudar', () => {
    expect(buscarEjercicios(BIB, {})).toEqual({ enGrupo: [], enOtros: [] })
  })
})

describe('buscar sin saber el grupo', () => {
  it('«granjero» lo encuentra aunque esté en Core y estabilidad', () => {
    const r = buscarEjercicios(BIB, { texto: 'granjero' })
    expect(r.enGrupo.map(e => e.id)).toEqual([6])
  })

  it('«sentadilla» saca las de los tres grupos', () => {
    const r = buscarEjercicios(BIB, { texto: 'sentadilla' })
    expect(r.enGrupo.map(e => e.grupo_muscular)).toContain('Cadera y aductores')
    expect(r.enGrupo.map(e => e.grupo_muscular)).toContain('Ciclismo — específico')
  })

  it('el que se llama exactamente así sale primero', () => {
    expect(buscarEjercicios(BIB, { texto: 'sentadilla' }).enGrupo[0].id).toBe(1)
  })

  it('sin tildes, sin mayúsculas y sin el espacio del final', () => {
    expect(buscarEjercicios(BIB, { texto: 'BULGARA' }).enGrupo.map(e => e.id)).toEqual([2])
    expect(buscarEjercicios(BIB, { texto: '  sumo  ' }).enGrupo.map(e => e.id)).toEqual([3])
  })

  it('también busca en la descripción, pero por debajo del nombre', () => {
    const r = buscarEjercicios(BIB, { texto: 'lordosis' })
    expect(r.enGrupo.map(e => e.id)).toEqual([9])
  })
})

describe('el caso que antes no tenía salida: grupo equivocado', () => {
  it('lo del grupo arriba y lo de fuera aparte', () => {
    const r = buscarEjercicios(BIB, { grupo: 'Cuádriceps', texto: 'sentadilla' })
    expect(r.enGrupo.map(e => e.id)).toEqual([1, 2, 3])
    expect(r.enOtros.map(e => e.id)).toEqual([5, 4])
  })

  it('aunque en el grupo no haya nada, lo de fuera se enseña igual', () => {
    const r = buscarEjercicios(BIB, { grupo: 'Cuádriceps', texto: 'granjero' })
    expect(r.enGrupo).toEqual([])
    expect(r.enOtros.map(e => e.id)).toEqual([6])
  })

  it('sin grupo no hay «otros»: todo va en la misma lista', () => {
    expect(buscarEjercicios(BIB, { texto: 'sentadilla' }).enOtros).toEqual([])
  })
})

describe('detalles', () => {
  it('lo que no casa con nada devuelve las dos listas vacías', () => {
    expect(buscarEjercicios(BIB, { texto: 'xyz' })).toEqual({ enGrupo: [], enOtros: [] })
  })

  it('no revienta con una biblioteca vacía', () => {
    expect(buscarEjercicios([], { grupo: 'Cuádriceps', texto: 'a' })).toEqual({ enGrupo: [], enOtros: [] })
  })

  it('el id del select llega como texto', () => {
    expect(ejercicioDe(BIB, '6')?.nombre).toBe('Paseo del granjero')
    expect(ejercicioDe(BIB, 6)?.nombre).toBe('Paseo del granjero')
    expect(ejercicioDe(BIB, '')).toBeNull()
    expect(ejercicioDe(BIB, null)).toBeNull()
  })

  it('normalizar quita tildes, mayúsculas y espacios', () => {
    expect(normalizar('  Sentadilla BÚLGARA ')).toBe('sentadilla bulgara')
    expect(normalizar(null)).toBe('')
  })
})
