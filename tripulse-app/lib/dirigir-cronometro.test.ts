import { describe, it, expect } from 'vitest'
import {
  CRONO_PARADO, corriendo, intacto, transcurrido,
  arrancar, pausar, alternar, reiniciar, vuelta, resumenVueltas,
  restante, terminada, progreso,
  relojMinutos, relojDecimas, enSegundos, enMinutos, escalonEn,
} from './dirigir-cronometro'

const T0 = 1_800_000_000_000

describe('arrancar, pausar y seguir', () => {
  it('parado no corre el tiempo', () => {
    expect(transcurrido(CRONO_PARADO, T0 + 5000)).toBe(0)
    expect(corriendo(CRONO_PARADO)).toBe(false)
    expect(intacto(CRONO_PARADO)).toBe(true)
  })

  it('arrancado cuenta desde que se arrancó', () => {
    const e = arrancar(CRONO_PARADO, T0)
    expect(transcurrido(e, T0 + 3400)).toBe(3400)
    expect(corriendo(e)).toBe(true)
  })

  it('pausar guarda lo que llevaba y deja de correr', () => {
    const e = pausar(arrancar(CRONO_PARADO, T0), T0 + 3400)
    expect(transcurrido(e, T0 + 99999)).toBe(3400)
    expect(corriendo(e)).toBe(false)
  })

  it('seguir suma al tramo de antes, no lo pierde', () => {
    /* Se pausa a los 3,4 s, se sigue 10 s después y corre otros 2 s: 5,4 s. Si
       arrancar reiniciase, el test cronometrado saldría corto y nadie lo
       notaría: 2 s es un tiempo plausible. */
    let e = pausar(arrancar(CRONO_PARADO, T0), T0 + 3400)
    e = arrancar(e, T0 + 13400)
    expect(transcurrido(e, T0 + 15400)).toBe(5400)
  })

  it('arrancar uno que YA corre no lo reinicia', () => {
    const e = arrancar(CRONO_PARADO, T0)
    expect(transcurrido(arrancar(e, T0 + 5000), T0 + 8000)).toBe(8000)
  })

  it('pausar uno parado no hace nada', () => {
    expect(pausar(CRONO_PARADO, T0)).toBe(CRONO_PARADO)
  })

  it('alternar hace lo contrario de lo que esté', () => {
    const a = alternar(CRONO_PARADO, T0)
    expect(corriendo(a)).toBe(true)
    expect(corriendo(alternar(a, T0 + 1000))).toBe(false)
  })

  it('reiniciar lo deja como nuevo, vueltas incluidas', () => {
    const e = vuelta(arrancar(CRONO_PARADO, T0), T0 + 2000)
    expect(e.vueltas).toHaveLength(1)
    expect(intacto(reiniciar())).toBe(true)
    expect(reiniciar().vueltas).toEqual([])
  })

  it('un reloj que va hacia atrás no da tiempo negativo', () => {
    /* El reloj del sistema puede saltar. Un negativo aquí saldría en pantalla
       como un tiempo imposible. */
    expect(transcurrido(arrancar(CRONO_PARADO, T0), T0 - 5000)).toBe(0)
  })
})

describe('vueltas — los tests de repeticiones hasta el agotamiento', () => {
  it('cada pulsación cierra una y la siguiente empieza de cero', () => {
    let e = arrancar(CRONO_PARADO, T0)
    e = vuelta(e, T0 + 28000)
    e = vuelta(e, T0 + 57000)
    expect(e.vueltas).toEqual([28000, 29000])
    expect(transcurrido(e, T0 + 60000)).toBe(3000)
  })

  it('NO se para entre vueltas: el tiempo de pulsar no se pierde', () => {
    /* Si cada vuelta parase y arrancase, el hueco entre pulsaciones se caería
       del total y las repeticiones saldrían todas más rápidas de lo que fueron. */
    let e = arrancar(CRONO_PARADO, T0)
    e = vuelta(e, T0 + 28000)
    expect(corriendo(e)).toBe(true)
  })

  it('una pulsación doble sin querer no cuenta como repetición de 0 s', () => {
    let e = arrancar(CRONO_PARADO, T0)
    e = vuelta(e, T0 + 28000)
    e = vuelta(e, T0 + 28000)
    expect(e.vueltas).toEqual([28000])
  })

  it('el resumen da las tres cosas que se apuntan', () => {
    const r = resumenVueltas([28000, 29500, 31200, 30900])
    expect(r).toEqual({ repes: 4, mejor: 28, ultima: 30.9 })
  })

  it('la MEJOR es la más rápida, no la primera', () => {
    /* En un test hasta el agotamiento normalmente la primera es la mejor, pero
       no siempre: el primer intento sale frío. */
    expect(resumenVueltas([31000, 28000, 33000]).mejor).toBe(28)
  })

  it('sin vueltas, nada', () => {
    expect(resumenVueltas([])).toEqual({ repes: 0, mejor: null, ultima: null })
  })
})

describe('cuenta atrás', () => {
  it('cuenta lo que queda, no lo que lleva', () => {
    const e = arrancar(CRONO_PARADO, T0)
    expect(restante(e, 360, T0 + 60000)).toBe(300000)
    expect(relojMinutos(restante(e, 360, T0 + 60000))).toBe('5:00')
  })

  it('no baja de cero por mucho que se pase', () => {
    const e = arrancar(CRONO_PARADO, T0)
    expect(restante(e, 360, T0 + 999999)).toBe(0)
    expect(terminada(e, 360, T0 + 999999)).toBe(true)
  })

  it('una cuenta atrás sin arrancar NO está terminada', () => {
    /* Sin esta guarda, `restante` valdría el total y `terminada` sería falsa,
       pero al llegar a cero exacto y no haberse usado nunca diría que sí. */
    expect(terminada(CRONO_PARADO, 0, T0)).toBe(false)
    expect(terminada(CRONO_PARADO, 360, T0)).toBe(false)
  })

  it('el progreso va de 0 a 1 y no se pasa', () => {
    const e = arrancar(CRONO_PARADO, T0)
    expect(progreso(e, 360, T0)).toBe(0)
    expect(progreso(e, 360, T0 + 180000)).toBe(0.5)
    expect(progreso(e, 360, T0 + 999999)).toBe(1)
    expect(progreso(e, 0, T0)).toBe(0)
  })
})

describe('cómo se enseña y qué cae en la casilla', () => {
  it('la cuenta atrás redondea HACIA ARRIBA: 0:01 hasta que de verdad es cero', () => {
    /* Con redondeo normal, los últimos 400 ms se verían como 0:00 mientras el
       atleta sigue corriendo. */
    expect(relojMinutos(600)).toBe('0:01')
    expect(relojMinutos(0)).toBe('0:00')
    expect(relojMinutos(61000)).toBe('1:01')
  })

  it('el cronómetro redondea HACIA ABAJO: no enseña un segundo que no ha pasado', () => {
    expect(relojDecimas(3960)).toBe('0:03.9')
    expect(relojDecimas(0)).toBe('0:00.0')
    expect(relojDecimas(83400)).toBe('1:23.4')
  })

  it('un tiempo negativo se enseña como cero', () => {
    expect(relojDecimas(-500)).toBe('0:00.0')
    expect(relojMinutos(-500)).toBe('0:00')
  })

  it('a la casilla van segundos con una décima, o minutos con dos decimales', () => {
    expect(enSegundos(58340)).toBe(58.3)
    // La milla se apunta en minutos: 5:24 son 5,4 minutos.
    expect(enMinutos(324000)).toBe(5.4)
    expect(enMinutos(330000)).toBe(5.5)
  })
})

describe('escalonEn — el protocolo incremental', () => {
  /* Montreal: empieza a 8 km/h, escalones de 60 s, +0,5 cada uno. */
  const montreal = (ms: number) => escalonEn(ms, 8, 60, 0.5)

  it('el primer escalón es el 1, no el 0', () => {
    /* Es lo que se le canta al atleta. Empezar en 0 haría que el entrenador
       cantase un escalón menos que el papel del protocolo. */
    expect(montreal(0)).toEqual({ numero: 1, intensidad: 8, dentro: 0 })
  })

  it('a los 30 s sigue en el primero, a mitad', () => {
    expect(montreal(30_000)).toEqual({ numero: 1, intensidad: 8, dentro: 30 })
  })

  it('al cumplirse el minuto salta al segundo y el contador vuelve a cero', () => {
    expect(montreal(60_000)).toEqual({ numero: 2, intensidad: 8.5, dentro: 0 })
  })

  it('al cabo de nueve minutos y medio va por el 12,0', () => {
    /* 570 s son 9 escalones enteros y 30 s del décimo: 8 + 9x0,5 = 12,5.
       Ojo, escalón 10 → intensidad 12,5. */
    const e = montreal(570_000)
    expect(e.numero).toBe(10)
    expect(e.intensidad).toBe(12.5)
    expect(e.dentro).toBe(30)
  })

  it('la rampa de ciclismo cuenta en vatios con su propio paso', () => {
    /* Desde 150 W, +25 cada minuto. A los 5 min: escalón 6, 275 W. */
    expect(escalonEn(300_000, 150, 60, 25)).toEqual({ numero: 6, intensidad: 275, dentro: 0 })
  })

  it('un protocolo de escalones cortos avanza más rápido', () => {
    /* Si la duración no entrase por parámetro, montar escalones de 30 s daría
       la mitad de escalones de los que de verdad hizo el atleta. */
    expect(escalonEn(120_000, 8, 30, 0.5).numero).toBe(5)
    expect(escalonEn(120_000, 8, 60, 0.5).numero).toBe(3)
  })

  it('sin duración válida usa 60 s en vez de dividir por cero', () => {
    /* La duración se lee de una casilla que el entrenador puede vaciar. Con 0
       saldría Infinity y el escalón sería NaN en pantalla. */
    expect(escalonEn(120_000, 8, 0, 0.5).numero).toBe(3)
    expect(escalonEn(120_000, 8, -5, 0.5).numero).toBe(3)
  })

  it('sin incremento la intensidad no se mueve', () => {
    expect(escalonEn(300_000, 8, 60, 0).intensidad).toBe(8)
  })

  it('un tiempo negativo se trata como cero', () => {
    expect(escalonEn(-5000, 8, 60, 0.5)).toEqual({ numero: 1, intensidad: 8, dentro: 0 })
  })

  it('la intensidad se redondea a una décima, como se canta', () => {
    /* 8 + 7x0,3 = 10,1 exacto en decimal pero 10.099999... en coma flotante. */
    expect(escalonEn(420_000, 8, 60, 0.3).intensidad).toBe(10.1)
  })
})
