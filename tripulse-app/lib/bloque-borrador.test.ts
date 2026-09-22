import { describe, it, expect } from 'vitest'
import {
  bloqueVacio, lineaVacia, configDeBorrador, faltaEnBloque, filasDeBloque, bloqueDesdeTarea,
  bloqueDesdeSueltas, sueltasDesdeBloque, pideCantidad, type EjercicioBib, type BloqueBorrador,
} from './bloque-borrador'
import { CONFIG_INICIAL } from './bloque-formato'

const BIB: EjercicioBib[] = [
  { id: 1, nombre: 'Wall balls', grupo_muscular: 'Funcional' },
  { id: 2, nombre: 'Empuje o arrastre de trineo', grupo_muscular: 'Carrera — específico' },
  { id: 3, nombre: 'Kettlebell swing', grupo_muscular: 'Glúteos', url_video: 'https://youtu.be/x' },
  { id: 4, nombre: 'Thruster con barra', grupo_muscular: 'Complejos' },
]

/** 4 rondas: 1 km de carrera a AEM + 20 wall balls @ 6 kg + 50 m de trineo @ 102 kg. */
function hyrox(): BloqueBorrador {
  const b = bloqueVacio('rondas', 3)
  b.config.rondas = 4
  b.lineas = [
    { ...lineaVacia(), tipo: 'Cardio', cardioModo: 'carrera', medida: 'm', cantidad: '1000', cardioZona: 'AEM', cardioObjetivo: '4:15/km' },
    { ...lineaVacia(), grupo: 'Funcional', ejercicioId: '1', medida: 'reps', cantidad: '20', kg: '6' },
    { ...lineaVacia(), grupo: 'Carrera — específico', ejercicioId: '2', medida: 'm', cantidad: '50', kg: '102' },
  ]
  return b
}

describe('el bloque mientras se escribe', () => {
  it('uno nuevo trae la configuración de siempre y una línea vacía', () => {
    const b = bloqueVacio('amrap', 1)
    expect(b.config).toEqual(CONFIG_INICIAL)
    expect(b.lineas).toHaveLength(1)
    expect(b.descansoTexto).toBe('2:00')
    expect(b.esquemaTexto).toBe('21-15-9')
  })

  it('las casillas de texto mandan sobre la configuración', () => {
    const b = { ...bloqueVacio('fortime', 1), descansoTexto: '1:30', esquemaTexto: '15-12-9', cadaTexto: '2:00' }
    const c = configDeBorrador(b)
    expect(c.descanso).toBe(90)
    expect(c.esquema).toEqual([15, 12, 9])
    expect(c.cada).toBe(120)
  })

  /* En Tabata se hace lo que se pueda; en un 21-15-9 las reps las pone el esquema. */
  it('no pide cantidad por línea donde la pone el formato', () => {
    expect(pideCantidad('tabata', CONFIG_INICIAL)).toBe(false)
    expect(pideCantidad('fortime', { ...CONFIG_INICIAL, esquema: [21, 15, 9] })).toBe(false)
    expect(pideCantidad('fortime', { ...CONFIG_INICIAL, esquema: [] })).toBe(true)
    expect(pideCantidad('amrap', CONFIG_INICIAL)).toBe(true)
  })
})

describe('qué le falta para guardarse', () => {
  it('uno completo, nada', () => {
    expect(faltaEnBloque(hyrox())).toBeNull()
  })

  it('el ejercicio de cada línea, de la biblioteca', () => {
    const b = hyrox(); b.lineas[1].ejercicioId = ''
    expect(faltaEnBloque(b)).toBe('Elige el ejercicio de la línea 2')
  })

  it('la modalidad del cardio', () => {
    const b = hyrox(); b.lineas[0].cardioModo = ''
    expect(faltaEnBloque(b)).toBe('Elige la modalidad de la línea 1')
  })

  it('cuánto, si el formato lo pide', () => {
    const b = hyrox(); b.lineas[2].cantidad = ''
    expect(faltaEnBloque(b)).toBe('Pon cuánto en la línea 3')
    const ft = { ...bloqueVacio('fortime', 1), lineas: [{ ...lineaVacia(), ejercicioId: '4' }] }
    expect(faltaEnBloque(ft)).toBeNull()
  })

  it('al menos una línea', () => {
    expect(faltaEnBloque({ ...bloqueVacio('amrap', 1), lineas: [] })).toBe('Añade al menos una línea')
  })
})

describe('lo que se guarda', () => {
  const { tarea, ejercicios } = filasDeBloque(hyrox(), BIB, { disciplina: 'Hibrido', zona: 'RFMIX1' })

  it('la tarea lleva el formato y su configuración, sin series propias', () => {
    expect(tarea).toMatchObject({ disciplina: 'Hibrido', formato: 'rondas', series: null, bloques: null, descanso_segundos: 120, zona_entrenamiento: 'RFMIX1' })
    expect((tarea.formato_config as { rondas: number }).rondas).toBe(4)
  })

  it('una fila por línea, en su orden, con las series del bloque', () => {
    expect(ejercicios.map(e => e.orden)).toEqual([1, 2, 3])
    expect(ejercicios.every(e => e.series === 4)).toBe(true)
  })

  it('el cardio en sus columnas de siempre', () => {
    expect(ejercicios[0]).toMatchObject({ tipo_serie: 'Cardio', cardio_modo: 'carrera', cardio_medida: 'metros', cardio_valor: 1000, cardio_zona: 'AEM', cardio_objetivo: '4:15/km', ejercicio_id: null })
  })

  it('el ejercicio con el nombre y el grupo de la biblioteca, y las reps también en su columna', () => {
    expect(ejercicios[1]).toMatchObject({ ejercicio_id: 1, nombre: 'Wall balls', grupo_muscular: 'Funcional', medida: 'reps', cantidad: 20, repeticiones: 20, intensidad: 6 })
  })

  it('metros con carga', () => {
    expect(ejercicios[2]).toMatchObject({ nombre: 'Empuje o arrastre de trineo', medida: 'm', cantidad: 50, repeticiones: null, intensidad: 102 })
  })

  it('las calorías del cardio', () => {
    const b = bloqueVacio('amrap', 1)
    b.lineas = [{ ...lineaVacia(), tipo: 'Cardio', cardioModo: 'remo', medida: 'cal', cantidad: '15' }]
    expect(filasDeBloque(b, BIB, { disciplina: 'Hibrido', zona: null }).ejercicios[0]).toMatchObject({ cardio_medida: 'calorias', cardio_valor: 15 })
  })
})

describe('de vuelta al editor (editar, duplicar, copiar)', () => {
  const guardado = filasDeBloque(hyrox(), BIB, { disciplina: 'Hibrido', zona: null })
  const tarea = { id: 77, ...guardado.tarea, ejercicios: guardado.ejercicios.map((e, i) => ({ ...e, id: 100 + i })) } as never

  it('editar conserva el id; duplicar no', () => {
    expect(bloqueDesdeTarea(tarea, { copia: false, orden: 3, biblioteca: BIB }).idTarea).toBe(77)
    expect(bloqueDesdeTarea(tarea, { copia: true, orden: 5, biblioteca: BIB }).idTarea).toBeUndefined()
  })

  it('vuelve con las mismas casillas con las que se escribió', () => {
    const b = bloqueDesdeTarea(tarea, { copia: false, orden: 3, biblioteca: BIB })
    expect(b.formato).toBe('rondas')
    expect(b.config.rondas).toBe(4)
    expect(b.lineas[0]).toMatchObject({ tipo: 'Cardio', cardioModo: 'carrera', medida: 'm', cantidad: '1000', cardioZona: 'AEM' })
    expect(b.lineas[1]).toMatchObject({ tipo: 'Ejercicio', grupo: 'Funcional', ejercicioId: '1', medida: 'reps', cantidad: '20', kg: '6' })
    expect(b.lineas[2]).toMatchObject({ medida: 'm', cantidad: '50', kg: '102' })
  })

  it('ida y vuelta da lo mismo', () => {
    const b = bloqueDesdeTarea(tarea, { copia: false, orden: 3, biblioteca: BIB })
    expect(filasDeBloque(b, BIB, { disciplina: 'Hibrido', zona: null }).ejercicios).toEqual(guardado.ejercicios)
  })
})

describe('agrupar y soltar', () => {
  const sueltas = [
    { id: 10, orden: 2, series: 4, ejercicios: [{ nombre: 'Kettlebell swing', ejercicio_id: 3, repeticiones: 15, intensidad: 24, series: 4 }] },
    { id: 11, orden: 3, series: 3, ejercicios: [{ nombre: 'Thruster con barra', ejercicio_id: 4, repeticiones: 10, intensidad: 43 }] },
  ]

  /* Agrupar no borra nada: el bloque se abre con la lista de lo que sustituye. */
  it('agrupar: las sueltas pasan a ser líneas, y se apunta a quién sustituyen', () => {
    const b = bloqueDesdeSueltas(sueltas, 'rondas', BIB)
    expect(b.reemplaza).toEqual([10, 11])
    expect(b.orden).toBe(2)
    expect(b.config.rondas).toBe(4)
    expect(b.lineas.map(l => l.ejercicioId)).toEqual(['3', '4'])
    expect(b.lineas[0]).toMatchObject({ cantidad: '15', kg: '24' })
    expect(b.idTarea).toBeUndefined()
  })

  it('un ejercicio por tiempo trae sus segundos de la tarea', () => {
    const b = bloqueDesdeSueltas([{ id: 12, orden: 1, series: 3, p_duracion: [{ tiempo_planeado: 45 }], ejercicios: [{ nombre: 'Plancha', repeticiones: null }] }], 'amrap', BIB)
    expect(b.lineas[0]).toMatchObject({ medida: 'seg', cantidad: '45' })
  })

  it('soltar: una tarea por línea, con tantas series como veces se hacía', () => {
    const guardado = filasDeBloque(hyrox(), BIB, { disciplina: 'Hibrido', zona: null })
    const r = sueltasDesdeBloque({ ...guardado.tarea, ejercicios: guardado.ejercicios } as never)
    expect(r).toHaveLength(3)
    expect(r.every(x => x.tarea.series === 4 && x.tarea.formato === null)).toBe(true)
    expect(r[1].ejercicio).toMatchObject({ nombre: 'Wall balls', series: 4, repeticiones: 20 })
    expect(r[1].ejercicio.orden).toBeNull()
  })

  it('soltar un 21-15-9: las reps de la primera ronda, y tres series', () => {
    const b = bloqueVacio('fortime', 1)
    b.lineas = [{ ...lineaVacia(), ejercicioId: '4', grupo: 'Complejos' }]
    const g = filasDeBloque(b, BIB, { disciplina: 'Hibrido', zona: null })
    const r = sueltasDesdeBloque({ ...g.tarea, ejercicios: g.ejercicios } as never)
    expect(r[0].tarea.series).toBe(3)
    expect(r[0].ejercicio).toMatchObject({ repeticiones: 21 })
  })
})
