import { describe, it, expect } from 'vitest'
import {
  posicionEnPlan, diasHastaCompeticion, microsDelPlan, hayOtraSesionEseDia,
  type MesoCtx, type MicroCtx,
} from './contexto-sesion'

/* Un plan de 2 bloques × 4 semanas (macrociclo 1) y otro plan aparte
   (macrociclo 2), porque el mismo atleta puede tener dos temporadas. */
const MESOS: MesoCtx[] = [
  { id: 10, fecha_inicio: '2026-08-03', id_macrociclo: 1 },
  { id: 11, fecha_inicio: '2026-08-31', id_macrociclo: 1 },
  { id: 20, fecha_inicio: '2027-01-04', id_macrociclo: 2 },
]
const MICROS: MicroCtx[] = [
  { id: 100, fecha_inicio: '2026-08-03', tipo: 'Carga', id_mesociclo: 10 },
  { id: 101, fecha_inicio: '2026-08-10', tipo: 'Carga', id_mesociclo: 10 },
  { id: 102, fecha_inicio: '2026-08-17', tipo: 'Carga', id_mesociclo: 10 },
  { id: 103, fecha_inicio: '2026-08-24', tipo: 'Recuperación', id_mesociclo: 10 },
  { id: 110, fecha_inicio: '2026-08-31', tipo: 'Carga', id_mesociclo: 11 },
  { id: 111, fecha_inicio: '2026-09-07', tipo: 'Competición', id_mesociclo: 11 },
  { id: 200, fecha_inicio: '2027-01-04', tipo: 'Competición', id_mesociclo: 20 },
]

describe('en qué punto del plan cae', () => {
  it('dice el bloque, la semana y el tipo', () => {
    expect(posicionEnPlan(102, MESOS, MICROS)).toEqual({ meso: 1, semana: 3, tipo: 'Carga' })
  })

  /* El número de semana se cuenta DENTRO del bloque: la primera del segundo
     bloque vuelve a ser la 1, no la 5. */
  it('la semana se reinicia en cada bloque', () => {
    expect(posicionEnPlan(110, MESOS, MICROS)).toEqual({ meso: 2, semana: 1, tipo: 'Carga' })
  })

  /* LA RAZÓN DE FILTRAR AQUÍ Y NO EN LA CONSULTA. La pantalla se trae todos los
     mesos y micros del deportista de una vez, en vez de encadenar cinco
     consultas para acotar al macrociclo. Si el filtrado no se hiciera, un atleta
     con dos temporadas vería el bloque 3 en lugar del 1 de la suya. */
  it('un atleta con dos temporadas ve el número de la SUYA', () => {
    expect(posicionEnPlan(200, MESOS, MICROS).meso).toBe(1)
  })

  it('la semana de descarga se ve por su tipo', () => {
    expect(posicionEnPlan(103, MESOS, MICROS).tipo).toBe('Recuperación')
  })

  /* Una sesión suelta (sin microciclo) no está en ningún plan. Devolver ceros
     haría que la cabecera dijera «semana 0 de 0», que suena a error. */
  it('una sesión sin microciclo no tiene posición', () => {
    expect(posicionEnPlan(null, MESOS, MICROS)).toEqual({ meso: null, semana: null, tipo: null })
    expect(posicionEnPlan(999, MESOS, MICROS)).toEqual({ meso: null, semana: null, tipo: null })
  })

  /* Si el mesociclo se hubiera borrado dejando el microciclo huérfano, la semana
     y el tipo se siguen sabiendo. Se devuelve lo que se sabe en vez de nada. */
  it('sin su bloque, la semana y el tipo se conservan', () => {
    const huerfano: MicroCtx = { id: 300, fecha_inicio: '2026-10-05', tipo: 'Carga', id_mesociclo: 77 }
    const r = posicionEnPlan(300, MESOS, [...MICROS, huerfano])
    expect(r.meso).toBeNull()
    expect(r.semana).toBe(1)
    expect(r.tipo).toBe('Carga')
  })

  it('el orden lo pone la fecha, no el orden de llegada', () => {
    const desordenados = [...MICROS].reverse()
    expect(posicionEnPlan(102, MESOS, desordenados).semana).toBe(3)
  })

  it('con las listas vacías no revienta', () => {
    expect(posicionEnPlan(1, [], [])).toEqual({ meso: null, semana: null, tipo: null })
  })
})

describe('la cuenta atrás hasta la competición', () => {
  const delPlan = microsDelPlan(102, MESOS, MICROS)

  it('cuenta los días hasta la semana de competición', () => {
    expect(diasHastaCompeticion('2026-08-19', delPlan)).toBe(19)
  })

  /* La de la semana pasada no es «la próxima»: si las pasadas contaran, el
     editor diría «faltan -14 días», que es peor que no decir nada. */
  it('las que ya pasaron no cuentan', () => {
    expect(diasHastaCompeticion('2026-09-20', delPlan)).toBeNull()
  })

  it('el mismo día son cero, no null', () => {
    expect(diasHastaCompeticion('2026-09-07', delPlan)).toBe(0)
  })

  it('se queda con la más cercana', () => {
    const dos = [...delPlan, { id: 112, fecha_inicio: '2026-08-24', tipo: 'Competición', id_mesociclo: 11 }]
    expect(diasHastaCompeticion('2026-08-19', dos)).toBe(5)
  })

  it('sin competiciones en el plan, no hay cuenta atrás', () => {
    expect(diasHastaCompeticion('2026-08-19', [])).toBeNull()
  })

  it('sin fecha de sesión tampoco', () => {
    expect(diasHastaCompeticion(null, delPlan)).toBeNull()
  })

  it('una fecha con hora pegada se compara igual', () => {
    expect(diasHastaCompeticion('2026-08-19T09:00:00', delPlan)).toBe(19)
  })
})

describe('acotar al plan de la sesión', () => {
  /* Si no se acotara, la cuenta atrás de una sesión de agosto apuntaría a la
     competición de enero de la OTRA temporada. */
  it('deja fuera los microciclos de otro macrociclo', () => {
    const ids = microsDelPlan(102, MESOS, MICROS).map(m => m.id)
    expect(ids).toContain(111)
    expect(ids).not.toContain(200)
  })

  it('una sesión suelta no acota nada', () => {
    expect(microsDelPlan(null, MESOS, MICROS)).toEqual([])
  })
})

describe('otra sesión el mismo día', () => {
  it('la detecta', () => {
    expect(hayOtraSesionEseDia([{ id: 1 }, { id: 2 }], 1)).toBe(true)
  })

  it('ella misma no cuenta', () => {
    expect(hayOtraSesionEseDia([{ id: 1 }], 1)).toBe(false)
  })

  /* Una cancelada está en la tabla pero no se va a hacer: contarla haría que la
     recomendación de recuperación fuera para un día doble que no existe. */
  it('las canceladas no cuentan', () => {
    expect(hayOtraSesionEseDia([{ id: 1 }, { id: 2, estado: 'Cancelada' }], 1)).toBe(false)
  })

  it('sin nada ese día, no', () => {
    expect(hayOtraSesionEseDia([], 1)).toBe(false)
  })
})
