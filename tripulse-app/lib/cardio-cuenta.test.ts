// ============================================================
// Que el cardio encadenado CUENTE
// ============================================================
//
// Lo de arriba (cardio-fuerza.test.ts) comprueba las reglas. Esto comprueba lo
// que el entrenador pidió: que 300 m de remo pegados a cada serie no sean un
// adorno de la hoja, sino minutos en la duración y metros en el volumen cuando
// corresponde.
//
// Es la parte que puede romperse en silencio. Una prescripción que no se
// enseña se ve enseguida; una que no se cuenta solo se nota meses después,
// cuando los números de la semana no cuadran con lo que el atleta hizo.

import { describe, it, expect } from 'vitest'
import { calcularDuracionEstimada, type TareaDuracion } from './duracion'
import { conVolumen, type TareaCruda, type Ejercicio } from './sesion-volumen'

/** Sentadilla 4 series, 6 reps. Sin cardio. */
const sentadilla = (cardio: Partial<Ejercicio> = {}): TareaDuracion => ({
  disciplina: 'Fuerza',
  series: 4,
  descanso_segundos: 120,
  ejercicios: [{ repeticiones: 6, ...cardio }],
})

describe('la duración de la sesión', () => {
  /* 4 series × 6 reps × 3 s = 72 s de trabajo, más 3 descansos de 120 s. */
  const soloFuerza = calcularDuracionEstimada([sentadilla()], {}).segundos

  it('sin cardio, lo de siempre', () => {
    expect(soloFuerza).toBe(4 * 6 * 3 + 3 * 120)
  })

  /* 30 s de assault bike en cada una de las 4 series son 120 s más. Si no se
     sumaran, la sesión saldría dos minutos corta y la carga con ella. */
  it('el cardio por tiempo suma, serie a serie', () => {
    const con = calcularDuracionEstimada([
      sentadilla({ cardio_modo: 'assault', cardio_medida: 'segundos', cardio_valor: 30 }),
    ], {}).segundos
    expect(con).toBe(soloFuerza + 4 * 30)
  })

  /* 300 m de remo a 3,6 m/s son 83 s, y son cuatro veces. De remo no hay test
     de nada, así que sale de la regla gruesa de la modalidad. */
  it('el cardio por metros de una máquina usa su regla gruesa', () => {
    const con = calcularDuracionEstimada([
      sentadilla({ cardio_modo: 'remo', cardio_medida: 'metros', cardio_valor: 300 }),
    ], {}).segundos
    expect(con).toBe(soloFuerza + 4 * Math.round(300 / 3.6))
  })

  /* Si la modalidad ES una disciplina del atleta, manda SU ritmo: 400 m en
     cinta los corre a lo que corre él, no a lo que diga una tabla. Con VAM 16
     y zona AEM (75–90 % → 82,5 %), son 13,2 km/h = 3,67 m/s. */
  it('en cinta manda el ritmo del atleta, no una tabla', () => {
    const lento = calcularDuracionEstimada([
      sentadilla({ cardio_modo: 'cinta', cardio_medida: 'metros', cardio_valor: 400, cardio_zona: 'AEL' }),
    ], { vam: 16 }).segundos
    const rapido = calcularDuracionEstimada([
      sentadilla({ cardio_modo: 'cinta', cardio_medida: 'metros', cardio_valor: 400, cardio_zona: 'PAE' }),
    ], { vam: 16 }).segundos
    expect(lento).toBeGreaterThan(soloFuerza)
    /* La misma distancia en una zona más dura se tarda menos. */
    expect(rapido).toBeLessThan(lento)
  })

  /* NO SE SUMA UN CERO. Una cinta por metros sin el test del atleta no se
     puede estimar, y meter 0 haría durar la sesión menos de lo que dura. */
  it('lo que no se puede estimar no suma cero: no suma', () => {
    const sinTest = calcularDuracionEstimada([
      sentadilla({ cardio_modo: 'cinta', cardio_medida: 'metros', cardio_valor: 400 }),
    ], {}).segundos
    expect(sinTest).toBe(soloFuerza)
  })

  it('media prescripción no cuenta', () => {
    const aMedias = calcularDuracionEstimada([
      sentadilla({ cardio_modo: 'remo', cardio_medida: 'metros' }),
    ], {}).segundos
    expect(aMedias).toBe(soloFuerza)
  })
})

describe('el volumen de la sesión', () => {
  const sesiones = [{ id: 1 }]
  const tareas: TareaCruda[] = [{ id: 10, id_sesion: 1, series: 4, disciplina: 'Fuerza' }]
  const volumen = (ej: Partial<Ejercicio>) =>
    conVolumen(sesiones, tareas, [], [], [{ id_tarea: 10, repeticiones: 6, ...ej }], {})[0]

  /* 4 × 400 m en cinta dentro de una sesión de fuerza SON 1.600 m de carrera.
     Si no se contaran, el volumen semanal del atleta mentiría por defecto. */
  it('la cinta suma metros, por todas las series', () => {
    expect(volumen({ cardio_modo: 'cinta', cardio_medida: 'metros', cardio_valor: 400 }).metros_total).toBe(1600)
  })

  /* LA DECISIÓN QUE MÁS IMPORTA, Y LA QUE MÁS FÁCIL SERÍA EQUIVOCAR. 4 × 500 m
     de remo son 2.000 m de remo, no de correr. Meterlos en el volumen de una
     disciplina de triatlón estropearía el número con el que se decide la
     semana. Cuentan en duración y en carga; en metros, no. */
  it('el remo NO suma metros a ninguna disciplina', () => {
    expect(volumen({ cardio_modo: 'remo', cardio_medida: 'metros', cardio_valor: 500 }).metros_total).toBe(0)
  })

  it('pero el remo sí alarga la sesión', () => {
    const con = volumen({ cardio_modo: 'remo', cardio_medida: 'metros', cardio_valor: 500 })
    const sin = volumen({})
    expect(con.dur_estimada.segundos).toBeGreaterThan(sin.dur_estimada.segundos)
  })

  it('lo prescrito por tiempo no suma metros', () => {
    expect(volumen({ cardio_modo: 'cinta', cardio_medida: 'segundos', cardio_valor: 120 }).metros_total).toBe(0)
  })

  it('sin cardio, nada cambia', () => {
    expect(volumen({}).metros_total).toBe(0)
  })
})
