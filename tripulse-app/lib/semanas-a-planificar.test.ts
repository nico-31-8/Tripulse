import { describe, it, expect } from 'vitest'
import {
  cuandoEs, lunesCandidatos, diasQueQuedan, quedaPocoDeLaSemana,
  construirCandidatas, avisoDe, porDefecto, contextoDeSemanas, CUANTAS,
} from './semanas-a-planificar'

/* 2026-09-02 es miércoles. Su lunes es el 31 de agosto. */
const MIERCOLES = '2026-09-02'
const LUNES = '2026-08-31'

describe('los lunes candidatos', () => {
  it('empieza por el lunes de ESTA semana, no por el que viene', () => {
    /* Antes solo se ofrecía el siguiente. Rescatar una semana a medias es algo
       que se hace, y no había forma de pedirlo. */
    expect(lunesCandidatos(MIERCOLES)[0]).toBe(LUNES)
  })

  it('van de siete en siete y todos caen en lunes', () => {
    const ls = lunesCandidatos(MIERCOLES)
    expect(ls).toHaveLength(CUANTAS)
    for (const l of ls) {
      /* La garantía de que no se puede elegir un miércoles: las fechas se
         construyen, no se escriben. */
      expect(new Date(l + 'T12:00:00').getDay(), l).toBe(1)
    }
    expect(ls[1]).toBe('2026-09-07')
    expect(ls[3]).toBe('2026-09-21')
  })

  it('desde un lunes, ese mismo es el primero', () => {
    expect(lunesCandidatos(LUNES)[0]).toBe(LUNES)
  })

  it('desde un domingo, el lunes de esa semana', () => {
    /* El domingo 6 pertenece a la semana que empezó el 31. */
    expect(lunesCandidatos('2026-09-06')[0]).toBe(LUNES)
  })
})

describe('cómo se llama cada una', () => {
  it('las dos primeras se dicen, las demás se cuentan', () => {
    expect(cuandoEs(0)).toBe('Esta semana')
    expect(cuandoEs(1)).toBe('La que viene')
    expect(cuandoEs(2)).toBe('En 2 semanas')
    expect(cuandoEs(5)).toBe('En 5 semanas')
  })
})

describe('cuánto queda de la semana en curso', () => {
  it('el lunes quedan los siete días', () => {
    expect(diasQueQuedan(LUNES, LUNES)).toBe(7)
  })

  it('el miércoles quedan cinco', () => {
    expect(diasQueQuedan(LUNES, MIERCOLES)).toBe(5)
  })

  it('el domingo queda uno', () => {
    expect(diasQueQuedan(LUNES, '2026-09-06')).toBe(1)
  })

  it('de una semana que no es la actual, null', () => {
    expect(diasQueQuedan('2026-09-07', MIERCOLES)).toBeNull()
    expect(diasQueQuedan('2026-08-24', MIERCOLES)).toBeNull()
  })

  it('se avisa a partir del viernes, no antes', () => {
    /* Con tres días o menos, planificar la semana entera es planificar poco. Se
       avisa, no se prohíbe: el entrenador sabrá. */
    expect(quedaPocoDeLaSemana(LUNES, '2026-09-03')).toBe(false)  // jueves, 4 días
    expect(quedaPocoDeLaSemana(LUNES, '2026-09-04')).toBe(true)   // viernes, 3
    expect(quedaPocoDeLaSemana(LUNES, '2026-09-06')).toBe(true)   // domingo, 1
  })
})

describe('el contexto de cada semana', () => {
  const base = {
    hoy: MIERCOLES,
    cuantas: 3,
    mesos: [{ id: 7, objetivo: 'Construcción', tipo: 'Carga' }],
    micros: [
      { fecha_inicio: LUNES, tipo: 'Carga', ua_planificada: 2400, id_mesociclo: 7 },
      { fecha_inicio: '2026-09-07', tipo: 'Descarga', ua_planificada: 1200, id_mesociclo: 7 },
    ],
  }

  it('cada semana coge SU microciclo, no el de al lado', () => {
    /* Buscar por rango en vez de por el lunes exacto haría que una semana sin
       dibujar heredase el tipo de la anterior, y la pantalla diría «Descarga»
       de algo que nadie ha dibujado. */
    const c = construirCandidatas(base)
    expect(c[0].tipo).toBe('Carga')
    expect(c[1].tipo).toBe('Descarga')
    expect(c[2].tipo).toBeNull()
  })

  it('trae las UA y el bloque del mesociclo', () => {
    const c = construirCandidatas(base)
    expect(c[0].ua).toBe(2400)
    expect(c[0].bloque).toBe('Construcción')
  })

  it('las competiciones caen en su semana', () => {
    const c = construirCandidatas({
      ...base,
      competiciones: [
        { nombre: 'Triatlón de Vigo', fecha: '2026-09-12', prioridad: 'A' },
        { nombre: 'Popular', fecha: '2026-08-30' },   // domingo anterior: fuera
      ],
    })
    expect(c[0].competiciones).toEqual([])
    expect(c[1].competiciones.map(x => x.nombre)).toEqual(['Triatlón de Vigo'])
  })

  it('una competición el domingo entra, la del lunes siguiente no', () => {
    /* El borde: la semana es de lunes a domingo, los dos incluidos. */
    const c = construirCandidatas({
      ...base,
      competiciones: [
        { nombre: 'Domingo', fecha: '2026-09-06' },
        { nombre: 'Lunes siguiente', fecha: '2026-09-07' },
      ],
    })
    expect(c[0].competiciones.map(x => x.nombre)).toEqual(['Domingo'])
    expect(c[1].competiciones.map(x => x.nombre)).toEqual(['Lunes siguiente'])
  })

  it('cuenta las sesiones que ya hay', () => {
    const c = construirCandidatas({ ...base, sesionesPorLunes: { [LUNES]: 6 } })
    expect(c[0].sesiones).toBe(6)
    expect(c[1].sesiones).toBe(0)
  })

  it('sin nada dibujado ni nada puesto, no revienta', () => {
    const c = construirCandidatas({ hoy: MIERCOLES })
    expect(c).toHaveLength(CUANTAS)
    expect(c[0].tipo).toBeNull()
    expect(c[0].sesiones).toBe(0)
    expect(c[0].competiciones).toEqual([])
  })
})

describe('lo que se le dice al entrenador', () => {
  const semana = (extra: any = {}) => construirCandidatas({
    hoy: MIERCOLES, cuantas: 3,
    micros: [{ fecha_inicio: LUNES, tipo: 'Carga' }],
    ...extra,
  })[0]

  it('la competición manda sobre todo lo demás', () => {
    /* Es lo que más cambia lo que se planifica, así que si hay una no se dice
       otra cosa en su lugar. */
    const s = semana({ competiciones: [{ nombre: 'Vigo', fecha: '2026-09-05', prioridad: 'A' }], sesionesPorLunes: { [LUNES]: 4 } })
    expect(avisoDe(s, MIERCOLES)).toContain('Vigo')
    expect(avisoDe(s, MIERCOLES)).toContain('(A)')
  })

  it('avisa de que la semana ya va empezada', () => {
    const s = semana()
    expect(avisoDe(s, '2026-09-05')).toContain('empezada')
    expect(avisoDe(s, '2026-09-05')).toContain('2 días')
  })

  it('avisa de las sesiones que ya hay', () => {
    expect(avisoDe(semana({ sesionesPorLunes: { [LUNES]: 1 } }), MIERCOLES)).toContain('1 sesión puesta')
    expect(avisoDe(semana({ sesionesPorLunes: { [LUNES]: 5 } }), MIERCOLES)).toContain('5 sesiones puestas')
  })

  it('avisa de que no está dibujada', () => {
    const s = construirCandidatas({ hoy: MIERCOLES })[2]
    expect(avisoDe(s, MIERCOLES)).toContain('Sin dibujar')
  })

  it('una semana limpia y dibujada no dice nada', () => {
    expect(avisoDe(semana(), MIERCOLES)).toBeNull()
  })
})

describe('cuál viene marcada al abrir', () => {
  it('la primera libre, que estando a miércoles es la actual', () => {
    /* A miércoles quedan cinco días: da para una semana. */
    const c = construirCandidatas({ hoy: MIERCOLES })
    expect(porDefecto(c, MIERCOLES)).toBe(LUNES)
  })

  it('si la actual ya va por el viernes, la siguiente', () => {
    const c = construirCandidatas({ hoy: '2026-09-04' })
    expect(porDefecto(c, '2026-09-04')).toBe('2026-09-07')
  })

  it('salta las que ya tienen sesiones: planificar encima duplicaría', () => {
    const c = construirCandidatas({
      hoy: MIERCOLES,
      sesionesPorLunes: { [LUNES]: 5, '2026-09-07': 4 },
    })
    expect(porDefecto(c, MIERCOLES)).toBe('2026-09-14')
  })

  it('si todas tienen algo, la que viene', () => {
    /* Que es lo que hacía la pantalla antes de todo esto. */
    const lunes = lunesCandidatos(MIERCOLES)
    const llenas = Object.fromEntries(lunes.map(l => [l, 3]))
    const c = construirCandidatas({ hoy: MIERCOLES, sesionesPorLunes: llenas })
    expect(porDefecto(c, MIERCOLES)).toBe('2026-09-07')
  })

  it('sin candidatas devuelve el lunes de hoy en vez de undefined', () => {
    expect(porDefecto([], MIERCOLES)).toBe(LUNES)
  })
})

describe('leer de la base', () => {
  const sbFalso = (datos: Record<string, any[]>, revienta?: string) => ({
    from(tabla: string) {
      const q: any = {
        select: () => q, eq: () => q, gte: () => q, lte: () => q,
        or: () => Promise.resolve({ data: datos[tabla] || [] }),
        then: (r: any) => r({ data: datos[tabla] || [] }),
      }
      if (revienta === tabla) throw new Error('la base dijo que no')
      return q
    },
  })

  it('junta microciclos, mesociclos, competiciones y sesiones', async () => {
    const c = await contextoDeSemanas(sbFalso({
      microciclo: [{ fecha_inicio: LUNES, tipo: 'Choque', ua_planificada: 3000, id_mesociclo: 4 }],
      mesociclo: [{ id: 4, objetivo: 'Específico' }],
      competicion: [{ nombre: 'Vigo', fecha: '2026-09-05', prioridad: 'B' }],
      sesion: [{ fecha_sesion: '2026-09-01' }, { fecha_sesion: '2026-09-03' }, { fecha_sesion: '2026-09-08' }],
    }) as any, 28, MIERCOLES, 3)

    expect(c[0].tipo).toBe('Choque')
    expect(c[0].bloque).toBe('Específico')
    expect(c[0].sesiones).toBe(2)
    expect(c[0].competiciones.map(x => x.nombre)).toEqual(['Vigo'])
    expect(c[1].sesiones).toBe(1)
  })

  it('las sesiones se reparten por el LUNES de su fecha', async () => {
    /* Contarlas por semana en memoria evita una consulta por semana. Si el
       reparto fuese por la fecha suelta, cada sesión sería su propia semana. */
    const c = await contextoDeSemanas(sbFalso({
      sesion: [{ fecha_sesion: '2026-08-31' }, { fecha_sesion: '2026-09-06' }],
    }) as any, 28, MIERCOLES, 2)
    expect(c[0].sesiones).toBe(2)   // lunes y domingo de la MISMA semana
  })

  it('si la base falla, salen las semanas sin contexto en vez de nada', async () => {
    /* Sin fechas no hay pantalla; sin tipo de microciclo sí la hay, solo que
       más sosa. Lo que nunca se hace es inventarse el contexto. */
    const c = await contextoDeSemanas(sbFalso({}, 'microciclo') as any, 28, MIERCOLES, 3)
    expect(c).toHaveLength(3)
    expect(c[0].lunes).toBe(LUNES)
    expect(c[0].tipo).toBeNull()
    expect(c[0].sesiones).toBe(0)
  })
})
