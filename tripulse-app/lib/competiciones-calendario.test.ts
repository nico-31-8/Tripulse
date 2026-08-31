import { describe, it, expect } from 'vitest'
import { porDia, diasHasta, cuentaAtras, proxima } from './competiciones-calendario'

const c = (fecha: string | null, nombre = 'Carrera') => ({ nombre, fecha })

describe('porDia', () => {
  it('agrupa por día', () => {
    const m = porDia([c('2026-09-13'), c('2026-09-20')])
    expect(Object.keys(m).sort()).toEqual(['2026-09-13', '2026-09-20'])
  })

  it('recorta la hora: una fecha con hora cae en su día', () => {
    const m = porDia([c('2026-09-13T00:00:00+00:00')])
    expect(m['2026-09-13']).toHaveLength(1)
  })

  it('dos el mismo día van juntas', () => {
    const m = porDia([c('2026-09-13', 'Sprint'), c('2026-09-13', 'Aquatlón')])
    expect(m['2026-09-13']).toHaveLength(2)
  })

  it('descarta las que no tienen fecha en vez de crear una clave vacía', () => {
    expect(porDia([c(null), c(''), { nombre: 'sin fecha' }])).toEqual({})
  })

  it('descarta una fecha que no es una fecha', () => {
    expect(porDia([c('no soy una fecha')])).toEqual({})
  })

  it('con la lista vacía o nula devuelve un mapa vacío', () => {
    expect(porDia([])).toEqual({})
    expect(porDia(null)).toEqual({})
  })
})

describe('diasHasta', () => {
  it('cuenta los días que faltan', () => {
    expect(diasHasta('2026-09-13', '2026-09-10')).toBe(3)
  })

  it('la de hoy es 0', () => {
    expect(diasHasta('2026-09-13', '2026-09-13')).toBe(0)
  })

  it('las pasadas salen en negativo', () => {
    expect(diasHasta('2026-09-10', '2026-09-13')).toBe(-3)
  })

  it('no se cuela un día por el cambio de hora ni por el huso', () => {
    // Del 28 de marzo al 30 hay dos días aunque en medio se adelante el reloj.
    expect(diasHasta('2026-03-30', '2026-03-28')).toBe(2)
    // Y a fin de mes y de año.
    expect(diasHasta('2027-01-01', '2026-12-31')).toBe(1)
  })

  it('aguanta una fecha con hora detrás', () => {
    expect(diasHasta('2026-09-13T10:00:00Z', '2026-09-10')).toBe(3)
  })

  it('null si la fecha no vale', () => {
    expect(diasHasta(null, '2026-09-10')).toBeNull()
    expect(diasHasta('cualquier cosa', '2026-09-10')).toBeNull()
  })
})

describe('cuentaAtras', () => {
  it('habla en palabras cuando está cerca', () => {
    expect(cuentaAtras(0)).toBe('Hoy')
    expect(cuentaAtras(1)).toBe('Mañana')
    expect(cuentaAtras(-1)).toBe('Ayer')
  })

  it('cuenta los días cuando está lejos', () => {
    expect(cuentaAtras(12)).toBe('Faltan 12 días')
    expect(cuentaAtras(-5)).toBe('Hace 5 días')
  })

  it('no dice nada si no hay fecha', () => {
    expect(cuentaAtras(null)).toBe('')
  })
})

describe('proxima', () => {
  it('la más cercana de las que vienen', () => {
    const p = proxima([c('2026-10-01', 'Lejos'), c('2026-09-13', 'Cerca')], '2026-09-01')
    expect(p?.nombre).toBe('Cerca')
  })

  it('la de hoy todavía cuenta: es hoy, no ha pasado', () => {
    expect(proxima([c('2026-09-13', 'Hoy')], '2026-09-13')?.nombre).toBe('Hoy')
  })

  it('salta las que ya pasaron', () => {
    const p = proxima([c('2026-08-01', 'Pasada'), c('2026-10-01', 'Futura')], '2026-09-01')
    expect(p?.nombre).toBe('Futura')
  })

  it('null cuando no queda ninguna', () => {
    expect(proxima([c('2026-08-01')], '2026-09-01')).toBeNull()
    expect(proxima([], '2026-09-01')).toBeNull()
  })

  it('ignora las que no tienen fecha', () => {
    expect(proxima([c(null, 'Sin fecha'), c('2026-10-01', 'Buena')], '2026-09-01')?.nombre).toBe('Buena')
  })
})
