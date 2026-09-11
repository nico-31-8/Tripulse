import { describe, it, expect } from 'vitest'
import { resumirPendientes, totalDe, textoPendientes, atletasConPendientes, SIN_PENDIENTES } from './pendientes-comunicacion'

describe('resumirPendientes', () => {
  it('cuenta mensajes y comentarios por atleta', () => {
    const p = resumirPendientes(
      [{ id_deportista: 28 }, { id_deportista: 28 }, { id_deportista: 30 }],
      [{ id_deportista: 28 }],
    )
    expect(p.porAtleta[28]).toEqual({ mensajes: 2, comentarios: 1 })
    expect(p.porAtleta[30]).toEqual({ mensajes: 1, comentarios: 0 })
    expect(p.mensajes).toBe(3)
    expect(p.comentarios).toBe(1)
  })

  it('sin nada, nada; y no se cae con nulos', () => {
    expect(resumirPendientes(null, undefined)).toEqual(SIN_PENDIENTES)
    expect(resumirPendientes([{ id_deportista: null }], [])).toEqual(SIN_PENDIENTES)
  })
})

describe('totalDe', () => {
  const p = resumirPendientes([{ id_deportista: 28 }], [{ id_deportista: 28 }, { id_deportista: 28 }])
  it('suma las dos cosas', () => { expect(totalDe(p, 28)).toBe(3) })
  it('un atleta sin nada, cero', () => { expect(totalDe(p, 99)).toBe(0) })
})

describe('textoPendientes', () => {
  it('singular y plural bien puestos', () => {
    expect(textoPendientes(resumirPendientes([{ id_deportista: 1 }], []))).toBe('1 mensaje')
    expect(textoPendientes(resumirPendientes([{ id_deportista: 1 }, { id_deportista: 1 }], [{ id_deportista: 1 }])))
      .toBe('2 mensajes y 1 comentario de sesión')
    expect(textoPendientes(resumirPendientes([], [{ id_deportista: 1 }, { id_deportista: 2 }]))).toBe('2 comentarios de sesión')
  })
  it('sin nada, vacío: el aviso no se pinta', () => {
    expect(textoPendientes(SIN_PENDIENTES)).toBe('')
  })
})

describe('atletasConPendientes', () => {
  const deps = [{ id: 1, nombre: 'Marta' }, { id: 2, nombre: 'Bruno' }, { id: 3, nombre: 'Yago' }]
  it('de más a menos, y a igualdad por nombre', () => {
    const p = resumirPendientes([{ id_deportista: 1 }, { id_deportista: 2 }, { id_deportista: 2 }], [{ id_deportista: 3 }])
    expect(atletasConPendientes(p, deps).map(a => a.nombre + ' ' + a.total)).toEqual(['Bruno 2', 'Marta 1', 'Yago 1'])
  })
  it('los que no tienen nada no salen', () => {
    expect(atletasConPendientes(SIN_PENDIENTES, deps)).toEqual([])
  })
  it('un mensaje de alguien que ya no es de la lista no sale', () => {
    expect(atletasConPendientes(resumirPendientes([{ id_deportista: 77 }], []), deps)).toEqual([])
  })
})
