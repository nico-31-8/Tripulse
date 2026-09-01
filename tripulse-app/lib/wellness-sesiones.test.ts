import { describe, it, expect } from 'vitest'
import {
  cargaDe, sesionesPorDia, cruceDe, haceTexto, DIAS_VENTANA,
  wellnessPorDia, mananasTras, despuesTexto,
} from './wellness-sesiones'

const s = (id: number, fecha: string, extra: any = {}) =>
  ({ id, fecha_sesion: fecha, disciplina: 'Carrera', duracion_minutos: 60, rpe_estimado: 5, ...extra })

describe('cargaDe', () => {
  it('es RPE × minutos', () => {
    expect(cargaDe(s(1, '2026-08-25'))).toBe(300)
  })

  /* Lo REAL manda sobre lo planificado: si reportó un 9 donde se le estimó un 7,
     la fatiga del día siguiente la explica el 9, no el 7. */
  it('el RPE reportado gana al estimado', () => {
    expect(cargaDe(s(1, '2026-08-25', { rpe_estimado: 7, rpe_reportado: 9 }))).toBe(540)
  })

  it('y la duración real gana a la planificada', () => {
    expect(cargaDe(s(1, '2026-08-25', { duracion_minutos: 60, duracion_real: 90 }))).toBe(450)
  })

  it('sin datos no se inventa un número', () => {
    expect(cargaDe({ id: 1, fecha_sesion: '2026-08-25' })).toBe(0)
    expect(cargaDe(s(1, '2026-08-25', { rpe_estimado: null, duracion_minutos: null }))).toBe(0)
  })

  it('un cero de verdad se respeta, no se cae al otro valor', () => {
    expect(cargaDe(s(1, '2026-08-25', { rpe_estimado: 8, rpe_reportado: 0 }))).toBe(0)
  })
})

describe('sesionesPorDia', () => {
  it('agrupa por día', () => {
    const m = sesionesPorDia([s(1, '2026-08-25'), s(2, '2026-08-25'), s(3, '2026-08-26')])
    expect(m['2026-08-25']).toHaveLength(2)
    expect(m['2026-08-26']).toHaveLength(1)
  })

  it('una fecha con hora detrás cae en su día', () => {
    expect(sesionesPorDia([s(1, '2026-08-25T00:00:00+00:00')])['2026-08-25']).toHaveLength(1)
  })

  it('descarta lo que no tiene fecha en vez de crear una clave vacía', () => {
    expect(sesionesPorDia([{ id: 1, fecha_sesion: '' }, { id: 2, fecha_sesion: 'ni idea' }])).toEqual({})
  })

  it('con la lista vacía o nula, mapa vacío', () => {
    expect(sesionesPorDia([])).toEqual({})
    expect(sesionesPorDia(null)).toEqual({})
  })
})

describe('cruceDe — la ventana mira hacia atrás', () => {
  const porDia = sesionesPorDia([
    s(1, '2026-08-23', { rpe_estimado: 4 }),          // hace 3
    s(2, '2026-08-24', { rpe_estimado: 5 }),          // hace 2
    s(3, '2026-08-25', { rpe_estimado: 8 }),          // ayer
    s(4, '2026-08-25', { rpe_estimado: 9 }),          // ayer, segunda
    s(5, '2026-08-26', { rpe_estimado: 6 }),          // ese mismo día
    s(6, '2026-08-27', { rpe_estimado: 7 }),          // después: no debe salir
  ])
  const c = cruceDe('2026-08-26', porDia)

  /* El corazón del asunto: el registro del 26 se rellenó por la mañana, así que
     lo explica lo del 25, no lo del 26. */
  it('trae las sesiones de los tres días anteriores', () => {
    expect(c.antes.map(x => x.sesion.id)).toEqual([3, 4, 2, 1])
  })

  it('de más reciente a más antigua: lo de ayer pesa más', () => {
    expect(c.antes[0].hace).toBe(1)
    expect(c.antes[c.antes.length - 1].hace).toBe(3)
  })

  it('las del propio día van aparte, no mezcladas', () => {
    expect(c.eseDia.map(x => x.id)).toEqual([5])
    expect(c.antes.some(x => x.sesion.id === 5)).toBe(false)
  })

  it('nunca mira hacia delante', () => {
    expect(c.antes.some(x => x.sesion.id === 6)).toBe(false)
    expect(c.eseDia.some(x => x.id === 6)).toBe(false)
  })

  it('la carga es la suma de la ventana, sin contar la del propio día', () => {
    // 8×60 + 9×60 + 5×60 + 4×60 = 1560
    expect(c.carga).toBe(1560)
  })

  it('el cuarto día hacia atrás ya queda fuera', () => {
    const lejos = cruceDe('2026-08-27', sesionesPorDia([s(9, '2026-08-23')]))
    expect(lejos.antes).toHaveLength(0)
  })

  it('la ventana se puede estrechar', () => {
    expect(cruceDe('2026-08-26', porDia, 1).antes.map(x => x.sesion.id)).toEqual([3, 4])
  })

  it('cruza el fin de mes sin perderse', () => {
    const m = sesionesPorDia([s(1, '2026-08-31')])
    expect(cruceDe('2026-09-01', m).antes.map(x => x.sesion.id)).toEqual([1])
  })

  it('sin sesiones alrededor devuelve todo vacío, no revienta', () => {
    expect(cruceDe('2026-08-26', {})).toEqual({ antes: [], eseDia: [], carga: 0 })
  })

  it('con una fecha inválida no adivina nada', () => {
    expect(cruceDe('ni idea', porDia)).toEqual({ antes: [], eseDia: [], carga: 0 })
  })

  it('la ventana por defecto son tres días', () => {
    expect(DIAS_VENTANA).toBe(3)
  })
})

describe('haceTexto', () => {
  it('ayer se dice ayer', () => {
    expect(haceTexto(1)).toBe('ayer')
  })
  it('y lo demás en días', () => {
    expect(haceTexto(2)).toBe('hace 2 días')
    expect(haceTexto(3)).toBe('hace 3 días')
  })
})

describe('mananasTras — el camino contrario', () => {
  const porDia = wellnessPorDia([
    { fecha: '2026-08-25', fatiga: 3 },
    { fecha: '2026-08-26', fatiga: 6 },
    { fecha: '2026-08-27', fatiga: 5 },
    { fecha: '2026-08-29', fatiga: 2 },
  ])

  /* La factura de la sesión del 25 aparece en el registro del 26, porque el
     wellness se rellena por la mañana. */
  it('trae la mañana siguiente y la de después', () => {
    const m = mananasTras('2026-08-25', porDia)
    expect(m.map(x => x.dia)).toEqual(['2026-08-26', '2026-08-27'])
    expect(m[0].despues).toBe(1)
  })

  it('nunca devuelve el día de la propia sesión', () => {
    expect(mananasTras('2026-08-25', porDia).some(x => x.dia === '2026-08-25')).toBe(false)
  })

  it('los días sin registro no se rellenan con nada', () => {
    // El 28 no existe, así que desde el 27 solo sale el 29 si se amplía a 2 días.
    expect(mananasTras('2026-08-27', porDia).map(x => x.dia)).toEqual(['2026-08-29'])
  })

  it('la ventana se puede estrechar a un solo día', () => {
    expect(mananasTras('2026-08-25', porDia, 1).map(x => x.dia)).toEqual(['2026-08-26'])
  })

  it('cruza el fin de mes', () => {
    const p = wellnessPorDia([{ fecha: '2026-09-01', fatiga: 4 }])
    expect(mananasTras('2026-08-31', p).map(x => x.dia)).toEqual(['2026-09-01'])
  })

  it('sin registros después, lista vacía', () => {
    expect(mananasTras('2026-08-29', porDia)).toEqual([])
  })

  it('con fecha inválida no adivina', () => {
    expect(mananasTras('ni idea', porDia)).toEqual([])
  })
})

describe('wellnessPorDia', () => {
  it('indexa por día y aguanta la hora detrás', () => {
    const m = wellnessPorDia([{ fecha: '2026-08-25T00:00:00+00:00', fatiga: 3 }])
    expect(m['2026-08-25'].fatiga).toBe(3)
  })
  it('descarta lo que no tiene fecha', () => {
    expect(wellnessPorDia([{ fecha: '' }, { fecha: 'x' }])).toEqual({})
    expect(wellnessPorDia(null)).toEqual({})
  })
})

describe('despuesTexto', () => {
  it('la primera mañana se dice con palabras', () => {
    expect(despuesTexto(1)).toBe('la mañana siguiente')
  })
  it('y las demás en días', () => {
    expect(despuesTexto(2)).toBe('2 días después')
  })
})
