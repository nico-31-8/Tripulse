// Que un bloque cuente en todo lo que ya contaba una línea suelta: la
// duración (y con ella la carga), los metros de la sesión, las series por
// grupo muscular y las tarjetas que lo pintan.
import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { calcularDuracionEstimada } from './duracion'
import { conVolumen } from './sesion-volumen'
import { conRondasHechas, seriesPorGrupo } from './series-por-grupo'
import { vistaDeTarea } from './tarea-vista'
import { camposHechos } from './lo-que-hizo'

/** 4 rondas: 1 km de carrera + 20 wall balls + 50 m de trineo, 2:00 entre rondas. */
const hyrox = {
  id: 1, id_sesion: 9, disciplina: 'Hibrido', formato: 'rondas',
  formato_config: { rondas: 4, descanso: 120 },
  ejercicios: [
    { id: 11, id_tarea: 1, orden: 1, tipo_serie: 'Cardio', cardio_modo: 'carrera', cardio_medida: 'metros', cardio_valor: 1000, cardio_zona: 'AEM' },
    { id: 12, id_tarea: 1, orden: 2, nombre: 'Wall balls', grupo_muscular: 'Funcional', medida: 'reps', cantidad: 20, repeticiones: 20, series: 4 },
    { id: 13, id_tarea: 1, orden: 3, nombre: 'Empuje o arrastre de trineo', grupo_muscular: 'Carrera — específico', medida: 'm', cantidad: 50, series: 4 },
  ],
}

describe('un bloque en la duración', () => {
  it('un AMRAP 12′ son 12 minutos, aunque sus líneas no lleven series', () => {
    const d = calcularDuracionEstimada([{ disciplina: 'Hibrido', formato: 'amrap', formato_config: { minutos: 12 }, ejercicios: [{ repeticiones: 10 }] }], {})
    expect(d.minutos).toBe(12)
    expect(d.estimable).toBe(true)
  })

  it('un bloque de rondas con carrera: al ritmo del atleta', () => {
    /* Con VAM 18 km/h, el km a AEM sale a su ritmo (no a uno inventado). */
    const con = calcularDuracionEstimada([hyrox], { vam: 18 }).segundos
    const sin = calcularDuracionEstimada([hyrox], {}).segundos
    expect(con).toBeGreaterThan(4 * (60 + 75) + 3 * 120)
    /* Sin tests, el km no se sabe estimar: queda fuera en vez de inventarse. */
    expect(sin).toBe(4 * (60 + 75) + 3 * 120)
  })
})

describe('un bloque en el volumen de la sesión', () => {
  it('4 rondas de 1 km de carrera son 4 km de carrera', () => {
    const [s] = conVolumen([{ id: 9, disciplina: 'Hibrido' }], [hyrox], [], [], hyrox.ejercicios, {})
    expect(s.metros_total).toBe(4000)
  })
})

describe('un bloque en las series por grupo', () => {
  it('las líneas de un bloque de rondas cuentan sus rondas; el cardio, nada', () => {
    const g = seriesPorGrupo(hyrox.ejercicios)
    expect(g.find(x => x.grupo === 'Funcional')?.series).toBe(4)
    expect(g.some(x => x.grupo === 'Sin clasificar')).toBe(false)
  })

  it('en un AMRAP hecho, las rondas que hizo (y una más si dejó una a medias)', () => {
    const tareas = [{ id: 2, formato: 'amrap', formato_config: { minutos: 12 }, resultado: { rondas: 7, reps: 5 } }]
    const ejs = [{ id: 21, id_tarea: 2, orden: 1, grupo_muscular: 'Funcional', series: 5 }]
    expect(conRondasHechas(tareas, ejs)[0].series).toBe(8)
  })

  it('sin resultado, lo planificado', () => {
    const ejs = [{ id: 21, id_tarea: 2, orden: 1, grupo_muscular: 'Funcional', series: 5 }]
    expect(conRondasHechas([{ id: 2, formato: 'amrap', resultado: null }], ejs)[0].series).toBe(5)
  })
})

describe('un bloque en las tarjetas', () => {
  it('se titula por su formato y lleva una casilla por línea', () => {
    const v = vistaDeTarea(hyrox, {}, 0)
    expect(v.titulo).toBe('4 rondas · 2:00 entre rondas')
    expect(v.campos.map(c => c.v)).toEqual([
      'Carrera · 1 km · AEM',
      'Wall balls · 20 reps',
      'Empuje o arrastre de trineo · 50 m',
      'el tiempo total',
    ])
  })

  it('lo que hizo: su resultado', () => {
    const t = { ...hyrox, formato: 'amrap', formato_config: { minutos: 12 }, resultado: { rondas: 7, reps: 12 } }
    expect(camposHechos(t, [])).toEqual([{ k: 'Resultado', v: '7 rondas + 12', destaca: true }])
    expect(camposHechos({ ...t, resultado: null }, [])).toBeNull()
  })
})
