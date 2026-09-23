import { describe, it, expect } from 'vitest'
import { queLeFaltaComp, cambiosDeComp } from './competicion-editar'

const ok = { nombre: 'Coruña 10', fecha: '2026-10-04', tipo: '10 km', notas: "Bajar de 31'", prioridad: 'A' }

describe('qué hace falta para guardar', () => {
  it('con nombre y fecha, se guarda', () => {
    expect(queLeFaltaComp(ok)).toBeNull()
  })

  it('sin nombre, no', () => {
    expect(queLeFaltaComp({ ...ok, nombre: '   ' })).toContain('nombre')
  })

  it('sin fecha, o con una inventada, tampoco', () => {
    expect(queLeFaltaComp({ ...ok, fecha: '' })).toContain('fecha')
    expect(queLeFaltaComp({ ...ok, fecha: '2026-13-45' })).toContain('fecha')
  })

  it('sin formulario, no revienta', () => {
    expect(queLeFaltaComp(null)).toContain('nombre')
  })

  it('la prueba y las notas son opcionales', () => {
    expect(queLeFaltaComp({ nombre: 'Oza', fecha: '2026-09-13' })).toBeNull()
  })
})

describe('lo que se manda a la base', () => {
  it('recorta los espacios del nombre', () => {
    expect(cambiosDeComp({ ...ok, nombre: '  Oza  ' }).nombre).toBe('Oza')
  })

  it('la prueba y la nota vacías van como null, no como cadena vacía', () => {
    const r = cambiosDeComp({ nombre: 'Oza', fecha: '2026-09-13', tipo: '', notas: '   ' })
    expect(r.tipo).toBeNull()
    expect(r.notas).toBeNull()
  })

  it('sin importancia, secundaria: es lo que menos cambia el plan', () => {
    expect(cambiosDeComp({ nombre: 'Oza', fecha: '2026-09-13' }).prioridad).toBe('B')
  })

  it('lo demás pasa tal cual', () => {
    expect(cambiosDeComp(ok)).toEqual({
      nombre: 'Coruña 10', fecha: '2026-10-04', tipo: '10 km', notas: "Bajar de 31'", prioridad: 'A',
    })
  })
})
