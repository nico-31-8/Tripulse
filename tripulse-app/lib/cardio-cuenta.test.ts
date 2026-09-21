// ============================================================
// Que las líneas de cardio CUENTEN
// ============================================================
//
// Lo de arriba (cardio-fuerza.test.ts) comprueba las reglas. Esto comprueba lo
// que el entrenador pidió: que 4 × 300 m de remo en una sesión de fuerza no
// sean un adorno de la hoja, sino minutos en la duración y metros en el
// volumen cuando corresponde.
//
// Es la parte que puede romperse en silencio. Una prescripción que no se
// enseña se ve enseguida; una que no se cuenta solo se nota meses después,
// cuando los números de la semana no cuadran con lo que el atleta hizo.
//
// UNA LÍNEA DE CARDIO NO TIENE REPETICIONES. Es lo que la hace peligrosa: todo
// el cálculo de fuerza gira alrededor de reps × tempo, y sin esto una línea de
// remo contaría exactamente cero.

import { describe, it, expect } from 'vitest'
import { calcularDuracionEstimada, type TareaDuracion } from './duracion'
import { conVolumen, type TareaCruda, type Ejercicio } from './sesion-volumen'

/** Una línea de cardio: 4 series con 2:00 de descanso, sin repeticiones. */
const linea = (cardio: Partial<Ejercicio> = {}): TareaDuracion => ({
  disciplina: 'Fuerza',
  series: 4,
  descanso_segundos: 120,
  ejercicios: [{ repeticiones: null, ...cardio }],
})

const TRES_DESCANSOS = 3 * 120
const dura = (t: TareaDuracion, tests = {}) => calcularDuracionEstimada([t], tests).segundos

describe('la duración de la sesión', () => {
  /* 4 × 30 s de assault bike son 2 minutos de trabajo, más los descansos. Sin
     esto la línea no tendría ni reps ni segundos de fuerza, y contaría cero. */
  it('por tiempo, cuenta el trabajo y los descansos', () => {
    expect(dura(linea({ cardio_modo: 'assault', cardio_medida: 'segundos', cardio_valor: 30 })))
      .toBe(4 * 30 + TRES_DESCANSOS)
  })

  /* 300 m de remo a 3,6 m/s son 83 s, cuatro veces. De remo no hay test de
     nada, así que sale de la regla gruesa de la modalidad. */
  it('por metros en una máquina, con la regla gruesa de la máquina', () => {
    expect(dura(linea({ cardio_modo: 'remo', cardio_medida: 'metros', cardio_valor: 300 })))
      .toBe(4 * Math.round(300 / 3.6) + TRES_DESCANSOS)
  })

  /* Si la modalidad ES una disciplina del atleta, manda SU ritmo: 400 m en
     cinta los corre a lo que corre él, no a lo que diga una tabla. */
  it('en cinta manda el ritmo del atleta, y la zona se nota', () => {
    const suave = dura(linea({ cardio_modo: 'cinta', cardio_medida: 'metros', cardio_valor: 400, cardio_zona: 'AEL' }), { vam: 16 })
    const dura_ = dura(linea({ cardio_modo: 'cinta', cardio_medida: 'metros', cardio_valor: 400, cardio_zona: 'PAE' }), { vam: 16 })
    expect(suave).toBeGreaterThan(TRES_DESCANSOS)
    /* La misma distancia en una zona más dura se tarda menos. */
    expect(dura_).toBeLessThan(suave)
  })

  /* NO SE SUMA UN CERO. Una cinta por metros sin el test del atleta no se
     puede estimar: la línea se queda sin duración, igual que cualquier otra
     tarea que no se puede estimar, en vez de sumar un cero que parecería un
     dato. */
  it('lo que no se puede estimar no se inventa', () => {
    expect(dura(linea({ cardio_modo: 'cinta', cardio_medida: 'metros', cardio_valor: 400 }))).toBe(0)
  })

  it('media prescripción no cuenta', () => {
    expect(dura(linea({ cardio_modo: 'remo', cardio_medida: 'metros' }))).toBe(0)
  })
})

describe('el volumen de la sesión', () => {
  const sesiones = [{ id: 1 }]
  const tareas: TareaCruda[] = [{ id: 10, id_sesion: 1, series: 4, disciplina: 'Fuerza' }]
  const volumen = (ej: Partial<Ejercicio>) =>
    conVolumen(sesiones, tareas, [], [], [{ id_tarea: 10, repeticiones: null, ...ej }], {})[0]

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
    expect(con.dur_estimada.segundos).toBeGreaterThan(0)
  })

  it('lo prescrito por tiempo no suma metros', () => {
    expect(volumen({ cardio_modo: 'cinta', cardio_medida: 'segundos', cardio_valor: 120 }).metros_total).toBe(0)
  })
})
