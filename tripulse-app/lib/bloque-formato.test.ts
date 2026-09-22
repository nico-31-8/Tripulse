import { describe, it, expect } from 'vitest'
import {
  CONFIG_INICIAL, leerConfig, leerEsquema, esBloque, ordenarLineas, segundosDeLinea, duracionBloque,
  seriesDeLinea, textoFormato, textoLinea, leerResultado, textoResultado, comparar, firmaBloque,
  type LineaBloque, type ConfigBloque,
} from './bloque-formato'

const cfg = (c: Partial<ConfigBloque> = {}): ConfigBloque => ({ ...CONFIG_INICIAL, ...c })
const ej = (nombre: string, cantidad: number | '', medida = 'reps', kg: number | null = null, orden?: number): LineaBloque =>
  ({ nombre, medida, cantidad: cantidad === '' ? null : cantidad, intensidad: kg, tipo_serie: 'Normal', orden })
const cardio = (modo: string, valor: number, medida = 'metros'): LineaBloque =>
  ({ tipo_serie: 'Cardio', cardio_modo: modo, cardio_medida: medida, cardio_valor: valor, nombre: modo })

describe('qué es un bloque', () => {
  it('una tarea con formato; sin él, una línea suelta', () => {
    expect(esBloque({ formato: 'amrap' })).toBe(true)
    expect(esBloque({ formato: null })).toBe(false)
    expect(esBloque({ formato: 'otra cosa' })).toBe(false)
  })

  it('la configuración guardada se completa y se corrige', () => {
    expect(leerConfig(null)).toEqual(CONFIG_INICIAL)
    expect(leerConfig({ rondas: '5', minutos: -3 }).rondas).toBe(5)
    expect(leerConfig({ minutos: -3 }).minutos).toBe(CONFIG_INICIAL.minutos)
    expect(leerConfig({ esquema: [21, 'x', 15, 0, 9] }).esquema).toEqual([21, 15, 9])
    expect(leerConfig({ descanso: 0 }).descanso).toBe(0)
  })

  it('el esquema se escribe como lo escribe un entrenador', () => {
    expect(leerEsquema('21-15-9')).toEqual([21, 15, 9])
    expect(leerEsquema('10, 8 6')).toEqual([10, 8, 6])
    expect(leerEsquema('')).toEqual([])
  })

  it('las líneas van en su orden, y sin orden en el de creación', () => {
    const l = ordenarLineas([{ id: 3, orden: 2 }, { id: 1, orden: 1 }, { id: 2 }])
    expect(l.map(x => x.id)).toEqual([2, 1, 3])
  })
})

describe('cuánto dura una línea', () => {
  it('repeticiones a 3 s, metros a 1,5 s, calorías a 4 s', () => {
    expect(segundosDeLinea(ej('Wall balls', 20))).toBe(60)
    expect(segundosDeLinea(ej('Paseo del granjero', 200, 'm', 24))).toBe(300)
    expect(segundosDeLinea(ej('Plancha', 45, 'seg'))).toBe(45)
  })

  it('el cardio en calorías también se estima', () => {
    expect(segundosDeLinea(cardio('remo', 15, 'calorias'))).toBe(60)
  })

  /* Un km de carrera sale al ritmo del atleta si quien llama lo sabe. */
  it('el cardio usa el ritmo del atleta cuando se lo pasan', () => {
    expect(segundosDeLinea(cardio('carrera', 1000), null, () => 255)).toBe(255)
  })

  it('sin cantidad no se sabe (null, no cero)', () => {
    expect(segundosDeLinea(ej('Dominadas', ''))).toBeNull()
  })

  it('las líneas viejas sin medida eran repeticiones', () => {
    expect(segundosDeLinea({ nombre: 'Sentadilla', repeticiones: 10 })).toBe(30)
  })
})

describe('cuánto dura un bloque', () => {
  const lineas = [cardio('carrera', 1000), ej('Wall balls', 20, 'reps', 6), ej('Trineo', 50, 'm', 102)]
  const km = () => 255

  it('AMRAP y EMOM: los minutos del formato, cerrados', () => {
    expect(duracionBloque('amrap', cfg({ minutos: 12 }), lineas)).toEqual({ segundos: 720, como: 'formato' })
    expect(duracionBloque('emom', cfg({ minutos: 10 }), lineas)).toEqual({ segundos: 600, como: 'formato' })
  })

  it('Tabata: vueltas × (trabajo + pausa) por cada línea', () => {
    expect(duracionBloque('tabata', cfg(), [ej('Burpees', ''), ej('Air squat', '')]).segundos).toBe(8 * 30 * 2)
  })

  /* 4 × (1 km a 4:15 + 20 wall balls + 50 m de trineo) + 3 descansos de 2:00 */
  it('rondas: lo que dura una ronda por las rondas, más los descansos', () => {
    const d = duracionBloque('rondas', cfg({ rondas: 4, descanso: 120 }), lineas, l => l.cardio_modo === 'carrera' ? km() : null)
    expect(d).toEqual({ segundos: 4 * (255 + 60 + 75) + 3 * 120, como: 'estimada' })
  })

  it('for time 21-15-9: cada ronda con sus reps', () => {
    const d = duracionBloque('fortime', cfg({ esquema: [21, 15, 9], limite: 20 }), [ej('Thruster', ''), ej('Dominadas', '')])
    expect(d).toEqual({ segundos: (21 + 15 + 9) * 2 * 3, como: 'estimada' })
  })

  it('for time que pasa del límite: dura el límite, y se dice', () => {
    const d = duracionBloque('fortime', cfg({ esquema: [50, 40, 30], limite: 5 }), [ej('Wall balls', ''), ej('Burpees', '')])
    expect(d).toEqual({ segundos: 300, como: 'limite' })
  })
})

describe('las series que cuenta cada línea', () => {
  const tres = [ej('A', 10), ej('B', 10), ej('C', 10)]

  it('rondas: una por ronda', () => {
    expect(seriesDeLinea('rondas', cfg({ rondas: 4 }), tres, 0)).toBe(4)
  })

  /* EMOM de 10′ alternando 2 líneas: la primera los minutos 1,3,5,7,9 y la segunda 2,4,6,8,10. */
  it('EMOM alternando: los minutos que le tocan', () => {
    const dos = tres.slice(0, 2)
    expect(seriesDeLinea('emom', cfg({ minutos: 10, alternar: true }), dos, 0)).toBe(5)
    expect(seriesDeLinea('emom', cfg({ minutos: 10, alternar: true }), dos, 1)).toBe(5)
    expect(seriesDeLinea('emom', cfg({ minutos: 7, alternar: true }), dos, 1)).toBe(3)
    expect(seriesDeLinea('emom', cfg({ minutos: 10, alternar: false }), dos, 1)).toBe(10)
  })

  it('for time: una por ronda del esquema; Tabata: sus vueltas', () => {
    expect(seriesDeLinea('fortime', cfg({ esquema: [21, 15, 9] }), tres, 1)).toBe(3)
    expect(seriesDeLinea('tabata', cfg({ vueltas: 8 }), tres, 2)).toBe(8)
  })

  it('AMRAP: las rondas que hizo (una más si dejó una a medias)', () => {
    expect(seriesDeLinea('amrap', cfg(), tres, 0, { rondas: 7, reps: 12 })).toBe(8)
    expect(seriesDeLinea('amrap', cfg(), tres, 0, { rondas: 7, reps: 0 })).toBe(7)
  })

  it('AMRAP sin hacer: las que caben según lo que dura una ronda', () => {
    /* Cada ronda son 3 × 10 reps × 3 s = 90 s; en 12′ caben 8. */
    expect(seriesDeLinea('amrap', cfg({ minutos: 12 }), tres, 0)).toBe(8)
  })
})

describe('cómo se lee', () => {
  it('el formato', () => {
    expect(textoFormato('amrap', cfg({ minutos: 12 }))).toBe('AMRAP 12′')
    expect(textoFormato('rondas', cfg({ rondas: 4, descanso: 120 }))).toBe('4 rondas · 2:00 entre rondas')
    expect(textoFormato('emom', cfg({ minutos: 10, alternar: true }))).toBe('EMOM 10′ alternando')
    expect(textoFormato('emom', cfg({ minutos: 12, cada: 120, alternar: false }))).toBe('Cada 2 · 12′')
    expect(textoFormato('fortime', cfg({ esquema: [21, 15, 9], limite: 10 }))).toBe('For time 21-15-9 · límite 10′')
    expect(textoFormato('tabata', cfg())).toBe('Tabata 20″/10″ × 8')
  })

  it('cada línea', () => {
    expect(textoLinea(ej('Wall balls', 20, 'reps', 6))).toBe('Wall balls · 20 reps @ 6 kg')
    expect(textoLinea(ej('Paseo del granjero', 200, 'm', 24))).toBe('Paseo del granjero · 200 m @ 24 kg')
    expect(textoLinea({ ...cardio('remo', 15, 'calorias'), cardio_zona: 'AEI' })).toBe('Remo · 15 cal · AEI')
    /* En for time las reps las pone el esquema, no la línea. */
    expect(textoLinea(ej('Thruster', '', 'reps', 43), 'fortime')).toBe('Thruster @ 43 kg')
  })
})

describe('el resultado', () => {
  it('se lee de lo guardado, y vacío es null', () => {
    expect(leerResultado({ rondas: 7, reps: 12 })).toMatchObject({ rondas: 7, reps: 12 })
    expect(leerResultado({})).toBeNull()
    expect(leerResultado(null)).toBeNull()
  })

  it('se escribe según el formato', () => {
    expect(textoResultado('amrap', { rondas: 7, reps: 12 })).toBe('7 rondas + 12')
    expect(textoResultado('fortime', { segundos: 462 })).toBe('7:42')
    expect(textoResultado('fortime', { limite: true, reps: 96 })).toBe('Límite · 96 reps')
    expect(textoResultado('emom', { minutos: 9 }, cfg({ minutos: 10 }))).toBe('9 de 10 min')
    expect(textoResultado('tabata', { peor: 9 })).toBe('Peor vuelta: 9')
  })

  it('mejor o peor que la otra vez', () => {
    expect(comparar('amrap', { rondas: 6, reps: 8 }, { rondas: 7, reps: 0 })).toBe('mejor')
    expect(comparar('amrap', { rondas: 7, reps: 12 }, { rondas: 7, reps: 12 })).toBe('igual')
    expect(comparar('fortime', { segundos: 495 }, { segundos: 462 })).toBe('mejor')
    /* Terminarlo siempre gana a quedarse en el límite. */
    expect(comparar('fortime', { segundos: 590 }, { limite: true, reps: 120 })).toBe('peor')
    expect(comparar('fortime', { limite: true, reps: 80 }, { limite: true, reps: 96 })).toBe('mejor')
    expect(comparar('rondas', { segundos: 1780 }, { segundos: 1800 })).toBe('peor')
    expect(comparar('amrap', null, { rondas: 7 })).toBeNull()
  })

  /* Los kilos cambian de una semana a otra; lo que no cambia es QUÉ se hace. */
  it('el mismo bloque: mismo formato y mismos ejercicios, en cualquier orden', () => {
    const a = firmaBloque('amrap', [ej('Burpees', 10), cardio('remo', 15, 'calorias')])
    const b = firmaBloque('amrap', [{ ...cardio('remo', 20, 'calorias') }, ej('Burpees', 12, 'reps', 0)])
    expect(a).toBe(b)
    expect(firmaBloque('emom', [ej('Burpees', 10), cardio('remo', 15, 'calorias')])).not.toBe(a)
  })
})
