import { describe, it, expect } from 'vitest'
import { construirCumplimiento, porcentaje, claveColumna } from './grupos-cumplimiento'

const ANA = { id_deportista: 1, nombre: 'Ana' }
const LUIS = { id_deportista: 2, nombre: 'Luis' }

const ses = (id: number, dep: number, fecha: string, estado: string, disc = 'Carrera', emi = 'e1') =>
  ({ id, id_deportista: dep, fecha_sesion: fecha, estado, disciplina: disc, id_emision: emi })

describe('construirCumplimiento', () => {
  it('una columna por entrenamiento mandado, ordenadas por fecha', () => {
    const c = construirCumplimiento([
      ses(1, 1, '2026-03-06', 'Realizada'),
      ses(2, 1, '2026-03-04', 'Realizada'),
      ses(3, 2, '2026-03-04', 'Planificada'),
    ], [ANA, LUIS])
    expect(c.columnas.map(x => x.fecha)).toEqual(['2026-03-04', '2026-03-06'])
  })

  it('cuenta hechas y mandadas por persona', () => {
    const c = construirCumplimiento([
      ses(1, 1, '2026-03-04', 'Realizada'),
      ses(2, 1, '2026-03-06', 'Planificada'),
      ses(3, 2, '2026-03-04', 'Realizada'),
      ses(4, 2, '2026-03-06', 'Realizada'),
    ], [ANA, LUIS])
    expect(c.filas[0]).toMatchObject({ nombre: 'Ana', hechas: 1, mandadas: 2 })
    expect(c.filas[1]).toMatchObject({ nombre: 'Luis', hechas: 2, mandadas: 2 })
    expect(c).toMatchObject({ hechas: 3, mandadas: 4 })
  })

  /* Quien entró al grupo más tarde no recibió las de antes. Contárselas como no
     hechas sería acusarle de algo que nunca se le pidió. */
  it('a quien no recibió una, no se le cuenta en contra', () => {
    const c = construirCumplimiento([
      ses(1, 1, '2026-03-04', 'Realizada'),
      ses(2, 1, '2026-03-06', 'Realizada'),
      ses(3, 2, '2026-03-06', 'Realizada'),
    ], [ANA, LUIS])
    expect(c.filas[1]).toMatchObject({ nombre: 'Luis', hechas: 1, mandadas: 1 })
    expect(porcentaje(c.filas[1])).toBe(100)
  })

  it('quien no la ha hecho aparece como planificada, no como hueco', () => {
    const c = construirCumplimiento([ses(1, 1, '2026-03-04', 'Planificada')], [ANA, LUIS])
    const col = c.columnas[0].clave
    expect(c.filas[0].porColumna[col]).toBe('Planificada')
    expect(c.filas[1].porColumna[col]).toBeUndefined()   // Luis no la tiene
  })

  /* Dos deportes el mismo día son dos entrenamientos distintos, no uno. */
  it('separa por deporte dentro del mismo día', () => {
    const c = construirCumplimiento([
      ses(1, 1, '2026-03-04', 'Realizada', 'Carrera'),
      ses(2, 1, '2026-03-04', 'Planificada', 'Natacion'),
    ], [ANA])
    expect(c.columnas).toHaveLength(2)
  })

  /* Y dos emisiones distintas el mismo día tampoco se mezclan: son dos encargos. */
  it('separa por emisión', () => {
    const c = construirCumplimiento([
      ses(1, 1, '2026-03-04', 'Realizada', 'Carrera', 'e1'),
      ses(2, 1, '2026-03-04', 'Planificada', 'Carrera', 'e2'),
    ], [ANA])
    expect(c.columnas).toHaveLength(2)
  })

  it('sin sesiones, filas a cero y ninguna columna', () => {
    const c = construirCumplimiento([], [ANA, LUIS])
    expect(c.columnas).toEqual([])
    expect(c.filas.every(f => f.mandadas === 0 && f.hechas === 0)).toBe(true)
  })

  it('aguanta null y estados vacíos', () => {
    const c = construirCumplimiento(null as any, [ANA])
    expect(c.mandadas).toBe(0)
    const c2 = construirCumplimiento([{ id: 9, id_deportista: 1, fecha_sesion: '2026-03-04', id_emision: 'e1' }], [ANA])
    expect(c2.filas[0].porColumna[claveColumna({ id_emision: 'e1', fecha_sesion: '2026-03-04', disciplina: '' })]).toBe('Planificada')
  })
})

describe('porcentaje', () => {
  it('redondea', () => {
    expect(porcentaje({ hechas: 2, mandadas: 3 })).toBe(67)
    expect(porcentaje({ hechas: 3, mandadas: 3 })).toBe(100)
  })

  /* Cero de cero no es un suspenso: es que no hay nada que medir. Devolver 0
     pintaría de rojo a quien no ha recibido todavía ningún entrenamiento. */
  it('sin nada mandado devuelve null, no cero', () => {
    expect(porcentaje({ hechas: 0, mandadas: 0 })).toBeNull()
  })
})
