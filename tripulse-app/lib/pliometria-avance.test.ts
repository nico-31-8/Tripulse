import { describe, it, expect } from 'vitest'
import {
  decidirAvance, importancia, tendencia, tocaMedir, senalesSaltos, mediana,
  type EntradaAvance, type SemanaSaltos,
} from './pliometria-avance'
import { DATOS_VACIOS } from './pliometria-escalon'
import type { NivelPlio } from './pliometria'

/* Hoy es jueves: la semana del 19 de octubre está a medias, y cuenta lo que lleva prescrito. */
const HOY = '2026-10-22'
const LUNES = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']

const TRIATLON = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza', 'Brick']

/** Ocho semanas: cada una, sus contactos por nivel; `s` sesiones; carrera y altura opcionales. */
function semanas(lista: { n: Partial<Record<NivelPlio, number>>; s?: number; carrera?: number; altura?: number | null; lanz?: number }[]): SemanaSaltos[] {
  return lista.map((x, k) => {
    const pies = Object.values(x.n).reduce((a, b) => a + (b || 0), 0)
    return {
      lunes: LUNES[k + (8 - lista.length)], sesiones: pies ? (x.s ?? 2) : 0, pies, porNivel: x.n,
      lanzamientos: x.lanz ?? 0, carrera: x.carrera ?? 0, altura: x.altura ?? null,
    }
  })
}

function entrada(o: Partial<EntradaAvance>): EntradaAvance {
  return {
    hoy: HOY, nivel: 'b', puestoEn: '2026-09-28', comprobaciones: {}, datos: DATOS_VACIOS,
    experiencia: 'intermedio', edad: 34, disciplinas: TRIATLON, haceEnSesiones: [],
    semanas: [], separacionDias: 3, dolor: { despues: 3, mediana: 3 }, cmj: [], rsi: [], proximaSaltos: null,
    ...o,
  }
}

/* Los siete casos de la maqueta (https://claude.ai/artifact/7g5qTrb3jfh9emoJYQUVr1). */
const ANA = entrada({
  semanas: semanas([{ n: { a: 80 } }, { n: { a: 96 } }, { n: { a: 110 } }, { n: { a: 120 } },
    { n: { a: 60, b: 72 } }, { n: { a: 48, b: 96 } }, { n: { a: 40, b: 120 }, carrera: 150 }, { n: { a: 40, b: 128 }, carrera: 160 }]),
  cmj: [{ fecha: '2026-08-31', valor: 31.0 }, { fecha: '2026-09-28', valor: 31.4 }, { fecha: '2026-10-12', valor: 32.6 }, { fecha: '2026-10-19', valor: 33.1 }],
})

const BRUNO = entrada({
  nivel: 'c', experiencia: 'avanzado', edad: 29, disciplinas: ['Carrera', 'Fuerza'],
  semanas: semanas([{ n: { b: 160 }, altura: 30 }, { n: { b: 184 } }, { n: { b: 210 } }, { n: { b: 230 } },
    { n: { b: 190, c: 50 }, altura: 30 }, { n: { b: 200, c: 100 }, altura: 30 }, { n: { b: 180, c: 120 }, altura: 40, carrera: 300 }, { n: { b: 160, c: 120 }, altura: 40, carrera: 310 }]),
  separacionDias: 1, dolor: { despues: 5, mediana: 2 },
  cmj: [{ fecha: '2026-08-31', valor: 38.2 }, { fecha: '2026-09-28', valor: 38.6 }, { fecha: '2026-10-12', valor: 37.9 }, { fecha: '2026-10-19', valor: 36.4 }],
  rsi: [{ fecha: '2026-09-28', valor: 2.10 }, { fecha: '2026-10-12', valor: 2.02 }, { fecha: '2026-10-19', valor: 1.88 }],
})

const CARMEN = entrada({
  nivel: 'a', experiencia: 'principiante', edad: 54, disciplinas: null, haceEnSesiones: ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza'],
  semanas: semanas([{ n: { a: 50 } }, { n: { a: 56 } }, { n: { a: 60 } }, { n: { a: 66 } },
    { n: { a: 72 } }, { n: { a: 76 } }, { n: { a: 80 }, carrera: 120 }, { n: { a: 88 }, carrera: 125 }]),
  separacionDias: 4,
})

const DIEGO = entrada({
  nivel: 'c', experiencia: 'avanzado', edad: 31, disciplinas: ['Carrera', 'Fuerza', 'Hibrido'], comprobaciones: { domina: 'c' },
  semanas: semanas([{ n: { b: 200 } }, { n: { b: 200 } }, { n: { b: 160, c: 60 } }, { n: { b: 140, c: 90 } },
    { n: { b: 120, c: 120 }, altura: 30 }, { n: { b: 120, c: 140 }, altura: 30 }, { n: { b: 120, c: 156 }, altura: 30, carrera: 140 }, { n: { b: 120, c: 160 }, altura: 30, carrera: 150 }]),
  cmj: [{ fecha: '2026-08-31', valor: 41.0 }, { fecha: '2026-10-12', valor: 41.8 }, { fecha: '2026-10-19', valor: 42.5 }],
  rsi: [{ fecha: '2026-09-28', valor: 1.90 }, { fecha: '2026-10-05', valor: 1.98 }, { fecha: '2026-10-12', valor: 2.06 }, { fecha: '2026-10-19', valor: 2.12 }],
})

const ELENA = entrada({
  nivel: 'a', edad: 37, disciplinas: ['Ciclismo', 'Fuerza'], separacionDias: null,
  semanas: semanas(Array.from({ length: 8 }, () => ({ n: { a: 60 }, s: 1 }))),
})

const FRAN = entrada({
  disciplinas: ['Natacion', 'Fuerza'], edad: 22, comprobaciones: { necesita: true },
  semanas: semanas([{ n: { a: 60 }, s: 1 }, { n: { a: 70 }, s: 1 }, { n: { a: 80 } }, { n: { a: 92 } },
    { n: { a: 100 } }, { n: { a: 60, b: 56 } }, { n: { a: 56, b: 64 } }, { n: { a: 56, b: 96 } }]),
  cmj: [{ fecha: '2026-09-21', valor: 34.0 }, { fecha: '2026-10-13', valor: 34.4 }],
})

const GABI = entrada({
  nivel: 'a', experiencia: 'principiante', edad: 31, disciplinas: ['Carrera', 'Fuerza'],
  semanas: semanas([{ n: { a: 72 } }, { n: { a: 80 } }, { n: { a: 88 } }, { n: { a: 96 } },
    { n: { a: 100 } }, { n: { a: 104 } }, { n: { a: 112 }, carrera: 180 }, { n: { a: 120 }, carrera: 210 }]),
  cmj: [{ fecha: '2026-08-10', valor: 29.0 }, { fecha: '2026-09-08', valor: 29.5 }],
})

describe('los siete casos de la maqueta', () => {
  it('Ana, triatleta que va bien: sube el volumen un 15 % como mucho', () => {
    const v = decidirAvance(ANA)
    expect(v.clase).toBe('bien')
    expect(v.accion).toBe('Subir el volumen')
    expect(v.prox).toBe(96)
    expect(v.corto).toBe('subir a 96 por sesión')
    expect(v.detalle).toContain('de 64 a 76')
    expect(v.medir).toEqual([])
  })

  it('Bruno: con todo fallando, baja a lo de antes de su última subida y la caída vuelve a 30 cm', () => {
    const v = decidirAvance(BRUNO)
    expect(v.clase).toBe('rojo')
    expect(v.prox).toBe(120)
    expect(v.detalle).toBe('Volver a 120 contactos por sesión; y la caída, de vuelta a 30 cm.')
    expect(v.fallan).toHaveLength(4)
    expect(v.porque).toContain('la separación (1 día entre sesiones)')
    expect(v.porque).toContain('el CMJ (−5 %)')
  })

  it('Carmen, 54 años y sin tests: sube un 10 %, y toca medir su CMJ', () => {
    const v = decidirAvance(CARMEN)
    expect(v.imp.tipo).toBe('corre')
    expect(v.imp.fuente).toBe('sesiones')
    expect(v.prox).toBe(48)
    expect(v.porque).toContain('por tener 54 años')
    expect(v.medir.map(m => m.test)).toEqual(['bosco'])
    expect(v.medir[0].porque).toContain('el nivel 2 lo pide')
  })

  it('Diego, en el techo del nivel 3 y con su RSI subiendo: sube la caída de 30 a 40 cm', () => {
    const v = decidirAvance(DIEGO)
    expect(v.accion).toBe('Subir la altura de caída')
    expect(v.altura).toEqual({ ahora: 30, propuesta: 40 })
    expect(v.porque).toContain('para el nivel 4 falta')
    expect(v.rsi.estado).toBe('mejora')
  })

  it('Diego, con lo que pide el nivel 4 marcado: pasa al 4, con su suelo', () => {
    const v = decidirAvance({ ...DIEGO, comprobaciones: { domina: 'c', eqMedia: true, unaPierna: true } })
    expect(v.accion).toBe('Pasar al nivel 4')
    expect(v.pasarA).toBe('d')
    expect(v.detalle).toContain('40 contactos por sesión')
  })

  it('Elena, ciclista: nada que subir; si se marca que los necesita, sube', () => {
    const v = decidirAvance(ELENA)
    expect(v.clase).toBe('neutro')
    expect(v.porque).toContain('Su deporte (ciclismo) no los pide')
    expect(v.medir).toEqual([])
    const si = decidirAvance({ ...ELENA, comprobaciones: { necesita: true } })
    expect(si.accion).toBe('Subir el volumen')
    expect(si.prox).toBe(68)
  })

  it('Fran, nadador con «Sí» marcado: mantiene tras subir un 27 %; según su deporte, nada', () => {
    expect(decidirAvance(FRAN).accion).toBe('Mantener esta semana')
    expect(decidirAvance(FRAN).porque).toContain('27 %')
    expect(decidirAvance({ ...FRAN, comprobaciones: {} }).clase).toBe('neutro')
  })

  it('Gabi: su carrera sube un 17 % y los saltos esperan; su CMJ ha caducado', () => {
    const v = decidirAvance(GABI)
    expect(v.accion).toBe('Mantener esta semana')
    expect(v.porque).toContain('Su carrera sube un 17 %')
    expect(v.medir[0].texto).toBe('Su último CMJ es del 8 sep, hace 6 semanas.')
  })
})

describe('los bordes', () => {
  it('sin nivel no se calcula nada', () => {
    const v = decidirAvance({ ...ANA, nivel: null })
    expect(v.clase).toBe('sin-nivel')
    expect(v.prox).toBeNull()
  })

  it('con el dolor de tendón marcado se paran, aunque todo lo demás vaya bien', () => {
    const v = decidirAvance({ ...ANA, comprobaciones: { dolor: true } })
    expect(v.clase).toBe('rojo')
    expect(v.parar).toBe(true)
    expect(v.prox).toBe(0)
  })

  it('quien no ha saltado nunca empieza por el suelo de su nivel', () => {
    const v = decidirAvance({ ...ANA, semanas: semanas(Array.from({ length: 8 }, () => ({ n: {} }))) })
    expect(v.accion).toBe('Empezar')
    expect(v.prox).toBe(80)
  })

  it('tras dos semanas sin saltos, vuelve por el suelo', () => {
    const v = decidirAvance({ ...ANA, semanas: [...ANA.semanas.slice(0, 6), ...semanas([{ n: {} }, { n: {} }])] })
    expect(v.accion).toBe('Volver a empezar')
    expect(v.prox).toBe(80)
  })

  it('si esta semana aún no lleva saltos, se mira la anterior', () => {
    const v = decidirAvance({ ...ANA, semanas: [...ANA.semanas.slice(1, 7), ...semanas([{ n: {} }])] })
    expect(v.porSesion).toBe(80)
    expect(v.cond.find(c => c.id === 'subida')?.titulo).toBe('Subida de su última semana')
  })

  it('un frenazo sin subida previa baja un 20 %', () => {
    const plano = semanas(Array.from({ length: 8 }, () => ({ n: { a: 100 } })))
    const v = decidirAvance({ ...ANA, nivel: 'a', semanas: plano, dolor: { despues: 6, mediana: 2 } })
    expect(v.prox).toBe(40)
  })

  it('en máster hacen falta 3 días entre sesiones', () => {
    const v = decidirAvance({ ...CARMEN, separacionDias: 2 })
    expect(v.clase).toBe('rojo')
    expect(v.porque).toContain('la separación (2 días entre sesiones)')
  })

  it('quien aún crece no pasa del nivel 2, y se dice por qué', () => {
    /* Dos sesiones de 120 del nivel 2: en su techo. */
    const techo = semanas(Array.from({ length: 8 }, () => ({ n: { b: 240 } })))
    const v = decidirAvance({ ...ANA, semanas: techo, comprobaciones: { creciendo: true, domina: 'b' } })
    expect(v.accion).toBe('Mantener')
    expect(v.siguiente).toBeNull()
    expect(v.porque).toContain('no pasa de aquí')
  })

  it('sin el «domina» del entrenador no se pasa de nivel', () => {
    const v = decidirAvance({ ...DIEGO, comprobaciones: { eqMedia: true, unaPierna: true } })
    expect(v.pasarA).toBeNull()
    expect(v.pide.find(r => r.id === 'domina')?.estado).toBe('sin')
  })

  it('el «domina» de otro nivel no vale', () => {
    const v = decidirAvance({ ...DIEGO, comprobaciones: { domina: 'b', eqMedia: true, unaPierna: true } })
    expect(v.pasarA).toBeNull()
  })

  it('sin drop jump, la caída no sube y toca medirlo', () => {
    const v = decidirAvance({ ...DIEGO, rsi: [] })
    expect(v.accion).toBe('Mantener')
    expect(v.vars.altura.t).toBe('Falta un test')
    expect(v.medir.map(m => m.test)).toEqual(['dropjump'])
  })

  it('en 40 cm la caída ya no sube', () => {
    const arriba = DIEGO.semanas.map(s => ({ ...s, altura: s.altura == null ? null : 40 }))
    expect(decidirAvance({ ...DIEGO, semanas: arriba }).accion).toBe('Mantener')
  })
})

describe('su deporte', () => {
  it('corre quien hace carrera, híbrido o brick', () => {
    expect(importancia({ comprobaciones: {}, disciplinas: ['Carrera'], haceEnSesiones: [] }).tipo).toBe('corre')
    expect(importancia({ comprobaciones: {}, disciplinas: ['Fuerza', 'Hibrido'], haceEnSesiones: [] }).tipo).toBe('corre')
  })

  it('natación con ciclismo y sin carrera es «nada»: los saltos de piernas no le hacen falta', () => {
    const i = importancia({ comprobaciones: {}, disciplinas: ['Natación', 'Ciclismo'], haceEnSesiones: [] })
    expect(i.tipo).toBe('nada')
    expect(i.necesita).toBe(false)
  })

  it('sin disciplinas marcadas mira sus sesiones; sin nada, hace como si los necesitara', () => {
    expect(importancia({ comprobaciones: {}, disciplinas: null, haceEnSesiones: ['Ciclismo'] })).toMatchObject({ tipo: 'pedalea', fuente: 'sesiones' })
    expect(importancia({ comprobaciones: {}, disciplinas: [], haceEnSesiones: [] })).toMatchObject({ tipo: 'sin-saber', necesita: true, fuente: null })
  })

  it('lo que marca el entrenador manda, en los dos sentidos', () => {
    expect(importancia({ comprobaciones: { necesita: false }, disciplinas: ['Carrera'], haceEnSesiones: [] })).toMatchObject({ necesita: false, decidido: true })
    expect(importancia({ comprobaciones: { necesita: true }, disciplinas: ['Ciclismo'], haceEnSesiones: [] })).toMatchObject({ necesita: true, decidido: true })
  })
})

describe('sus tests', () => {
  it('la base es la mediana de los anteriores: un mal día no la mueve', () => {
    expect(mediana([31, 20, 32])).toBe(31)
    expect(tendencia([{ fecha: '2026-09-01', valor: 31 }, { fecha: '2026-09-15', valor: 20 }, { fecha: '2026-09-29', valor: 32 }, { fecha: '2026-10-19', valor: 31.2 }], HOY).estado).toBe('estable')
  })

  it('caduca a las 4 semanas', () => {
    expect(tendencia([{ fecha: '2026-09-23', valor: 30 }], HOY).estado).toBe('caducado')
    expect(tendencia([{ fecha: '2026-09-24', valor: 30 }], HOY).estado).toBe('base')
  })

  it('apunta con un test por encima; mejora con dos', () => {
    expect(tendencia([{ fecha: '2026-10-01', valor: 30 }, { fecha: '2026-10-19', valor: 32 }], HOY).estado).toBe('apunta')
    expect(tendencia([{ fecha: '2026-09-20', valor: 30 }, { fecha: '2026-10-05', valor: 31.5 }, { fecha: '2026-10-19', valor: 32 }], HOY).estado).toBe('mejora')
  })

  it('cae por debajo de su base menos el 3 %', () => {
    expect(tendencia([{ fecha: '2026-10-01', valor: 30 }, { fecha: '2026-10-19', valor: 29 }], HOY).estado).toBe('cae')
  })

  it('solo avisa de medir si su deporte los necesita', () => {
    const imp = importancia(ELENA)
    expect(tocaMedir(ELENA, imp, tendencia([], HOY), tendencia([], HOY))).toEqual([])
  })
})

describe('las señales del panel', () => {
  it('bajar sale en ámbar, con su porqué y su acción', () => {
    const [s] = senalesSaltos(BRUNO)
    expect(s).toMatchObject({ id: 'saltos_bajar', nivel: 'ambar', titulo: 'Saltos: bajar esta semana' })
    expect(s.accion).toBe('Bajar a 120 por sesión, y la caída a 30 cm.')
    expect(s.tituloAtleta).toBe('tus saltos piden bajar esta semana')
  })

  it('medir sale en azul, que no llega a su informe semanal', () => {
    const s = senalesSaltos({ ...GABI, proximaSaltos: '2026-10-24' })
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ id: 'saltos_medir', nivel: 'info', titulo: 'Saltos: toca medir el CMJ' })
    expect(s[0].accion).toContain('el 24 oct')
  })

  it('que pueda subir no es un aviso, y sin nivel no hay nada', () => {
    expect(senalesSaltos(ANA)).toEqual([])
    expect(senalesSaltos({ ...BRUNO, nivel: null })).toEqual([])
    expect(senalesSaltos(null)).toEqual([])
  })
})
