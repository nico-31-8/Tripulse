import { describe, it, expect } from 'vitest'
import { seriesDeTarea, camposHechos, valoresEnCasilla, type SerieRealizada } from './lo-que-hizo'

const valor = (campos: { k: string; v: string }[] | null, k: string) => campos?.find(c => c.k === k)?.v

/** Sentadilla, 2 series prescritas, ejercicio id 50. */
const sentadilla = {
  id: 10, disciplina: 'Fuerza', series: 2,
  ejercicios: [{ id: 50, nombre: 'Sentadilla', grupo_muscular: 'Piernas', series: 2, tipo_serie: 'Normal' }],
}

const serie = (n: number, extra: Partial<SerieRealizada> = {}): SerieRealizada => ({
  id_ejercicio: 50, numero_serie: n, ejercicio_numero: 1, ...extra,
})

/* LO QUE HAY DE VERDAD EN LA BASE. La sesión del lunes 21 (id 542): el atleta
   puso el peso de cada serie, no puso ni repeticiones ni RPE, y no marcó el
   circulito de ninguna —`completada = false` en todas—. Es el caso normal, no
   el raro, y fue el que obligó a rehacer esto. */
describe('lo que anota un atleta de verdad: solo el peso', () => {
  const lunes = [
    serie(1, { peso_real: '40', repeticiones_reales: null, control_real: null, completada: false }),
    serie(2, { peso_real: '40', repeticiones_reales: null, control_real: null, completada: false }),
  ]
  const c = camposHechos(sentadilla, lunes)

  /* Fiarse de `completada` decía «0 de 2» de una sesión que sí hizo. */
  it('las series con el peso puesto cuentan como hechas, aunque no las marcara', () => {
    expect(valor(c, 'Series')).toBe('2 de 2')
  })

  it('la carga, que es para lo que existe el botón', () => {
    expect(valor(c, 'Carga')).toBe('40 kg')
  })

  /* Lo que no anotó dice «—», no «0» ni «?»: cero sería mentira. */
  it('lo que no anotó dice «—»', () => {
    expect(valor(c, 'Repeticiones')).toBe('—')
    expect(valor(c, 'Control')).toBe('—')
  })

  it('con peso decimal, tal cual', () => {
    const curl = camposHechos(sentadilla, [serie(1, { peso_real: '22.5' }), serie(2, { peso_real: '22.5' })])
    expect(valor(curl, 'Carga')).toBe('22.5 kg')
  })
})

describe('un dato de todas las series en una casilla', () => {
  it('si es el mismo en todas, se dice una vez', () => {
    expect(valoresEnCasilla([40, 40], String, ' kg')).toBe('40 kg')
  })

  it('si cambia, serie a serie', () => {
    expect(valoresEnCasilla([60, 60, 62.5], String, ' kg')).toBe('60 · 60 · 62.5 kg')
  })

  /* Un «?» en su sitio, para que las posiciones cuadren con la casilla de al
     lado: la tercera repetición va con la tercera carga. */
  it('si falta en alguna, un «?» en su sitio', () => {
    expect(valoresEnCasilla([10, 0, 8], String, ' reps')).toBe('10 · ? · 8 reps')
  })

  it('si no está en ninguna, «—»', () => {
    expect(valoresEnCasilla([0, 0], String, ' reps')).toBe('—')
    expect(valoresEnCasilla([], String, ' kg')).toBe('—')
  })
})

describe('lo que hizo en fuerza, cuando lo anota todo', () => {
  const t = { ...sentadilla, series: 3, ejercicios: [{ ...sentadilla.ejercicios[0], series: 3 }] }
  const c = camposHechos(t, [
    serie(1, { peso_real: 60, repeticiones_reales: 10, control_real: 7, control_tipo: 'rpe' }),
    serie(2, { peso_real: 60, repeticiones_reales: 10, control_real: 7, control_tipo: 'rpe' }),
    serie(3, { peso_real: 62.5, repeticiones_reales: 8, control_real: 8, control_tipo: 'rpe' }),
  ])

  it('cada dato en su casilla, como la prescripción', () => {
    expect(valor(c, 'Series')).toBe('3 de 3')
    expect(valor(c, 'Repeticiones')).toBe('10 · 10 · 8 reps')
    expect(valor(c, 'Carga')).toBe('60 · 60 · 62.5 kg')
    expect(valor(c, 'Control')).toBe('RPE 7-8')
  })

  it('las mismas casillas que la prescripción, en el mismo orden', () => {
    expect(c?.map(x => x.k)).toEqual(['Grupo', 'Series', 'Repeticiones', 'Carga', 'Control'])
  })

  /* En una superserie, las del segundo ejercicio van aparte: mezcladas, la
     carga sumaría el press banca dentro de la sentadilla. */
  it('el encadenado de una superserie va en su casilla', () => {
    const s = camposHechos(t, [
      serie(1, { peso_real: 60, repeticiones_reales: 10 }),
      serie(1, { peso_real: 20, repeticiones_reales: 12, ejercicio_numero: 2 }),
    ])
    expect(valor(s, 'Carga')).toBe('60 kg')
    expect(valor(s, 'Encadenado')).toBe('20 kg · 12 reps')
  })

  /* Si solo anotó el segundo ejercicio, la serie la hizo igual: no es «no
     anotó nada». */
  it('una superserie con solo el encadenado anotado también cuenta', () => {
    const s = camposHechos(t, [serie(1, { peso_real: 20, ejercicio_numero: 2 })])
    expect(valor(s, 'Series')).toBe('1 de 3')
    expect(valor(s, 'Carga')).toBe('—')
    expect(valor(s, 'Encadenado')).toBe('20 kg')
  })

  it('si no anotó nada, lo dice en vez de enseñar ceros', () => {
    expect(camposHechos(sentadilla, [])).toBeNull()
    expect(camposHechos(sentadilla, null)).toBeNull()
    expect(camposHechos(sentadilla, [serie(1, { completada: false })])).toBeNull()
  })

  it('un ejercicio por tiempo enseña el tiempo, no repeticiones', () => {
    const plancha = { ...sentadilla, p_duracion: [{ tiempo_planeado: 45 }] }
    const p = camposHechos(plancha, [serie(1, { tiempo_real: 45 }), serie(2, { tiempo_real: 40 })])
    expect(valor(p, 'Tiempo')).toBe('45 s · 40 s')
    expect(valor(p, 'Repeticiones')).toBeUndefined()
  })
})

describe('qué series son de esta tarea', () => {
  it('en fuerza, las de sus ejercicios', () => {
    expect(seriesDeTarea(sentadilla, [serie(1, { peso_real: 60 }), { id_ejercicio: 99, numero_serie: 1, peso_real: 20 }]).length).toBe(1)
  })

  it('en resistencia, las de la propia tarea', () => {
    const t = { id: 20, disciplina: 'Carrera', series: 2 }
    const todas = [{ id_tarea: 20, numero_serie: 1, tiempo_real: 85 }, { id_tarea: 21, numero_serie: 1, tiempo_real: 90 }]
    expect(seriesDeTarea(t, todas).length).toBe(1)
  })

  it('en orden de serie, aunque lleguen revueltas', () => {
    const todas = [serie(3, { peso_real: 65 }), serie(1, { peso_real: 60 }), serie(2, { peso_real: 62.5 })]
    expect(seriesDeTarea(sentadilla, todas).map(s => s.numero_serie)).toEqual([1, 2, 3])
  })
})

describe('lo que hizo en una línea de cardio', () => {
  const remo = {
    id: 11, disciplina: 'Fuerza', series: 4,
    ejercicios: [{ id: 51, nombre: 'Remo 300 m', tipo_serie: 'Cardio', series: 4 }],
  }

  it('los tiempos de cada serie, sin carga ni control', () => {
    const c = camposHechos(remo, [
      { id_ejercicio: 51, numero_serie: 1, tiempo_real: 85, ejercicio_numero: 1 },
      { id_ejercicio: 51, numero_serie: 2, tiempo_real: 88, ejercicio_numero: 1 },
    ])
    expect(valor(c, 'Tiempo')).toBe('1:25 · 1:28')
    expect(valor(c, 'Series')).toBe('2 de 4')
    expect(valor(c, 'Carga')).toBeUndefined()
    expect(valor(c, 'Control')).toBeUndefined()
    expect(valor(c, 'Grupo')).toBeUndefined()
  })
})

describe('lo que hizo en resistencia', () => {
  const t = { id: 20, disciplina: 'Carrera', series: 2, bloques: 3, rpe_reportado: 8 }

  it('cada serie con sus metros y su tiempo, y cuántas de las mandadas', () => {
    const c = camposHechos(t, [
      { id_tarea: 20, numero_serie: 1, metros_reales: 400, tiempo_real: 85 },
      { id_tarea: 20, numero_serie: 2, metros_reales: 400, tiempo_real: 88 },
    ])
    expect(valor(c, 'Hecho')).toBe('400 m en 1:25 · 400 m en 1:28')
    /* En bloques se mandaron seis: 3 × (2 × 400). */
    expect(valor(c, 'Series')).toBe('2 de 6')
    expect(valor(c, 'RPE')).toBe('8/10')
  })

  it('si no apuntó serie a serie, lo que dejó en la tarea al cerrar', () => {
    const c = camposHechos({
      id: 21, disciplina: 'Carrera', series: 1,
      p_distancia: [{ metros_reales: 10200 }], p_duracion: [{ tiempo_real: 3120 }],
    }, [])
    expect(valor(c, 'Distancia')).toBe('10.2 km')
    expect(valor(c, 'Tiempo')).toBe('52:00')
  })

  it('sin nada de nada, lo dice', () => {
    expect(camposHechos({ id: 22, disciplina: 'Carrera', series: 1 }, [])).toBeNull()
  })
})
