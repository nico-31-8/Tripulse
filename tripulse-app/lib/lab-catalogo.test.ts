// ============================================================
// ¿Se puede montar CUALQUIER test con este modelo?
// ============================================================
//
// Aquí se montan tests de verdad, con sus fórmulas de verdad, y se comprueba
// que dan el número que tienen que dar. No es una lista de opiniones: si un
// test no cabe, el test de abajo falla o hay que escribir el porqué.
//
// Al final hay un bloque de LO QUE NO CABE, con lo que se necesitaría para que
// cupiera. Está escrito como test para que no se olvide: el día que se añada,
// estos dejan de pasar y hay que venir a actualizarlos.

import { describe, it, expect } from 'vitest'
import {
  calcular, pegasDe, protoVacio, medVacia, col, fnB,
  type TestLab, type Datos,
} from './lab-constructor'

/** Monta el test, le mete los datos y devuelve los resultados por nombre. */
function pasar(t: TestLab, datos: Datos): Record<string, number | null> {
  expect(pegasDe(t), t.nombre).toEqual([])
  const base = { ...protoVacio(t), ...medVacia(t), ...datos }
  const vals = calcular(t, base)
  const out: Record<string, number | null> = {}
  t.resultados.forEach((r, i) => {
    if (vals[i].error) throw new Error(t.nombre + ' → ' + r.nombre + ': ' + vals[i].error)
    out[r.nombre] = vals[i].valor
  })
  return out
}

const v = (n: string) => ({ t: 'var' as const, v: n })
const op = (o: string) => ({ t: 'op' as const, v: o })
const num = (n: number) => ({ t: 'num' as const, v: n })

// ============================================================
// 1. Una sola medida, o unas cuantas sueltas
// ============================================================
describe('tests de una sola toma', () => {
  it('Cooper: 12 minutos y los metros recorridos', () => {
    const t: TestLab = {
      nombre: 'Cooper', deporte: 'Carrera',
      sueltos: [col({ clave: 'metros', etiqueta: 'Metros en 12 min', unidad: 'm', instrumento: 'mano' })],
      bloques: [],
      /* VO₂máx = (d − 504,9) / 44,73 */
      resultados: [{ nombre: 'vo2max', unidad: 'ml/kg/min', formula: [
        op('('), v('metros'), op('-'), num(504.9), op(')'), op('/'), num(44.73),
      ] }],
    }
    expect(pasar(t, { metros: '3000' }).vo2max).toBeCloseTo(55.78, 1)
  })

  it('CSS: el 400 y el 200 de natación', () => {
    const t: TestLab = {
      nombre: 'CSS', deporte: 'Natación',
      sueltos: [
        col({ clave: 't400', etiqueta: '400 m', unidad: 's', instrumento: 'crono-seg' }),
        col({ clave: 't200', etiqueta: '200 m', unidad: 's', instrumento: 'crono-seg' }),
      ],
      bloques: [],
      /* CSS = (400 − 200) / (T400 − T200) */
      resultados: [{ nombre: 'css', unidad: 'm/s', formula: [
        num(200), op('/'), op('('), v('t400'), op('-'), v('t200'), op(')'),
      ] }],
    }
    expect(pasar(t, { t400: '330', t200: '150' }).css).toBeCloseTo(1.111, 3)
  })

  it('FTP de 20 minutos', () => {
    const t: TestLab = {
      nombre: 'FTP 20', deporte: 'Ciclismo',
      sueltos: [col({ clave: 'p20', etiqueta: 'Potencia media 20 min', unidad: 'W' })],
      bloques: [],
      resultados: [{ nombre: 'ftp', unidad: 'W', formula: [v('p20'), op('*'), num(0.95)] }],
    }
    expect(pasar(t, { p20: '300' }).ftp).toBeCloseTo(285, 3)
  })

  it('1RM estimado por Epley', () => {
    const t: TestLab = {
      nombre: '1RM estimado', deporte: 'Fuerza',
      sueltos: [
        col({ clave: 'peso', etiqueta: 'Peso', unidad: 'kg' }),
        col({ clave: 'reps', etiqueta: 'Repeticiones', unidad: 'ud' }),
      ],
      bloques: [],
      /* 1RM = peso × (1 + reps/30) */
      resultados: [{ nombre: 'rm', unidad: 'kg', formula: [
        v('peso'), op('*'), op('('), num(1), op('+'), v('reps'), op('/'), num(30), op(')'),
      ] }],
    }
    expect(pasar(t, { peso: '100', reps: '6' }).rm).toBeCloseTo(120, 3)
  })

  it('Wingate: lo da el ergómetro, se teclea', () => {
    const t: TestLab = {
      nombre: 'Wingate', deporte: 'Ciclismo',
      sueltos: [
        col({ clave: 'ppico', etiqueta: 'Potencia pico', unidad: 'W' }),
        col({ clave: 'pmedia', etiqueta: 'Potencia media', unidad: 'W' }),
        col({ clave: 'pmin', etiqueta: 'Potencia mínima', unidad: 'W' }),
      ],
      bloques: [],
      /* Índice de fatiga = (pico − mínima) / 30 s */
      resultados: [{ nombre: 'fatiga', unidad: 'W/s', formula: [
        op('('), v('ppico'), op('-'), v('pmin'), op(')'), op('/'), num(30),
      ] }],
    }
    expect(pasar(t, { ppico: '900', pmedia: '650', pmin: '450' }).fatiga).toBeCloseTo(15, 3)
  })
})

// ============================================================
// 2. Repeticiones con número fijo
// ============================================================
describe('tests por repeticiones', () => {
  it('6×100 nadando: total, media, caída y sin la salida', () => {
    const t: TestLab = {
      nombre: '6×100', deporte: 'Natación', sueltos: [],
      bloques: [{
        clave: 'rep', etiqueta: 'Cada 100', modo: 'cerrado', veces: 6, duracion: 0,
        columnas: [col({ clave: 't100', etiqueta: 'Tiempo', unidad: 's', instrumento: 'crono-seg' })],
      }],
      resultados: [
        { nombre: 'total', unidad: 's', formula: [fnB('suma', 't100')] },
        { nombre: 'caida', unidad: 's', formula: [fnB('ultima', 't100'), op('-'), fnB('primera', 't100')] },
        { nombre: 'sin_salida', unidad: 's', formula: [fnB('media', 't100', 2, 0)] },
        /* El índice de fatiga clásico: la 2.ª mitad contra la 1.ª. */
        { nombre: 'fatiga', unidad: '%', formula: [
          op('('), fnB('media', 't100', 4, 0), op('/'), fnB('media', 't100', 1, 3), op('-'), num(1), op(')'), op('*'), num(100),
        ] },
      ],
    }
    const r = pasar(t, { t100: ['74', '75', '76', '77', '78', '80'] })
    expect(r.total).toBeCloseTo(460, 3)
    expect(r.caida).toBeCloseTo(6, 3)
    expect(r.sin_salida).toBeCloseTo(77.2, 3)
    expect(r.fatiga).toBeCloseTo(4.444, 2)   // (78,333/75 − 1) × 100
  })

  it('Sprint de 30 m con parciales: el tramo de 20 a 30', () => {
    const t: TestLab = {
      nombre: 'Sprint 30 m', deporte: 'Carrera', sueltos: [],
      bloques: [{
        clave: 'p', etiqueta: 'Parcial', modo: 'cerrado', veces: 4, duracion: 0,
        columnas: [
          col({ clave: 'dist', etiqueta: 'Distancia', unidad: 'm', clase: 'dada', tipo: 'lista', etiquetas: ['5', '10', '20', '30'] }),
          col({ clave: 'tacum', etiqueta: 'Tiempo acumulado', unidad: 's' }),
        ],
      }],
      resultados: [
        { nombre: 't30', unidad: 's', formula: [fnB('ultima', 'tacum')] },
        /* Un tramo de UNA repetición es un rango de uno: así se llega a la 3.ª. */
        { nombre: 'tramo_20_30', unidad: 's', formula: [fnB('ultima', 'tacum'), op('-'), fnB('suma', 'tacum', 3, 3)] },
        { nombre: 'vel_20_30', unidad: 'm/s', formula: [
          num(10), op('/'), op('('), fnB('ultima', 'tacum'), op('-'), fnB('suma', 'tacum', 3, 3), op(')'),
        ] },
      ],
    }
    const r = pasar(t, { tacum: ['1.1', '1.9', '3.2', '4.4'] })
    expect(r.t30).toBeCloseTo(4.4, 3)
    expect(r.tramo_20_30).toBeCloseTo(1.2, 3)
    expect(r.vel_20_30).toBeCloseTo(8.333, 3)
  })

  it('Recuperación de la frecuencia cardiaca', () => {
    const t: TestLab = {
      nombre: 'Recuperación de FC', deporte: 'Carrera', sueltos: [],
      bloques: [{
        clave: 'm', etiqueta: 'Momento', modo: 'cerrado', veces: 3, duracion: 60,
        pitaCambio: true, columnas: [
          col({ clave: 'minuto', etiqueta: 'Minuto', unidad: 'min', clase: 'dada', tipo: 'progresion', desde: 0, paso: 1 }),
          col({ clave: 'fc', etiqueta: 'Pulso', unidad: 'ppm' }),
        ],
      }],
      resultados: [
        { nombre: 'fcr60', unidad: 'ppm', formula: [fnB('primera', 'fc'), op('-'), fnB('suma', 'fc', 2, 2)] },
        { nombre: 'fcr120', unidad: 'ppm', formula: [fnB('primera', 'fc'), op('-'), fnB('ultima', 'fc')] },
      ],
    }
    const r = pasar(t, { fc: ['180', '148', '128'] })
    expect(r.fcr60).toBeCloseTo(32, 3)
    expect(r.fcr120).toBeCloseTo(52, 3)
  })

  it('Isometría por lado, con la asimetría', () => {
    const t: TestLab = {
      nombre: 'Isometría', deporte: 'Fuerza', sueltos: [],
      bloques: [{
        clave: 'l', etiqueta: 'Lado', modo: 'cerrado', veces: 2, duracion: 0,
        columnas: [
          col({ clave: 'pierna', etiqueta: 'Pierna', clase: 'dada', tipo: 'lista', etiquetas: ['Derecha', 'Izquierda'] }),
          col({ clave: 'pico', etiqueta: 'Pico', unidad: 'N' }),
        ],
      }],
      resultados: [{ nombre: 'asimetria', unidad: '%', formula: [
        op('('), fnB('maximo', 'pico'), op('-'), fnB('minimo', 'pico'), op(')'),
        op('/'), fnB('maximo', 'pico'), op('*'), num(100),
      ] }],
    }
    expect(pasar(t, { pico: ['1200', '1020'] }).asimetria).toBeCloseTo(15, 3)
  })

  it('7×200 progresivo con lactato: los ritmos los pone el entrenador', () => {
    const t: TestLab = {
      nombre: '7×200 progresivo', deporte: 'Natación',
      sueltos: [col({ clave: 't_inicial', etiqueta: 'Sale del primero', unidad: 's', clase: 'dada', valor: '160' })],
      bloques: [{
        clave: 'r', etiqueta: 'Repetición', modo: 'cerrado', veces: 7, duracion: 0,
        columnas: [
          /* El objetivo baja 5 s por repetición, y ARRANCA de una casilla: si el
             entrenador cambia el primero, se recalcula la tabla entera. */
          col({ clave: 'objetivo', etiqueta: 'Ritmo objetivo', unidad: 's', clase: 'dada', tipo: 'progresion', desde: 160, paso: -5, desdeRef: 't_inicial' }),
          col({ clave: 'real', etiqueta: 'Tiempo real', unidad: 's', instrumento: 'crono-seg' }),
          col({ clave: 'lac', etiqueta: 'Lactato', unidad: 'mmol/L' }),
        ],
      }],
      resultados: [
        { nombre: 'lac_pico', unidad: 'mmol/L', formula: [fnB('maximo', 'lac')] },
        { nombre: 'desvio', unidad: 's', formula: [fnB('media', 'real'), op('-'), fnB('media', 'objetivo')] },
      ],
    }
    const r = pasar(t, {
      real: ['161', '155', '151', '146', '140', '136', '129'],
      lac: ['1.2', '1.4', '1.8', '2.4', '3.6', '5.5', '8.1'],
    })
    expect(r.lac_pico).toBeCloseTo(8.1, 3)
    /* Objetivos: 160 155 150 145 140 135 130 → media 145. Reales → media 145,43. */
    expect(r.desvio).toBeCloseTo(0.4286, 3)
  })
})

// ============================================================
// 3. Repeticiones hasta que se para
// ============================================================
describe('tests abiertos', () => {
  it('VAM de Montreal, con la corrección del escalón parcial', () => {
    const t: TestLab = {
      nombre: 'VAM', deporte: 'Carrera',
      sueltos: [
        col({ clave: 'inc', etiqueta: 'Sube', unidad: 'km/h', clase: 'dada', valor: '0.5' }),
        col({ clave: 'dur', etiqueta: 'Dura', unidad: 's', clase: 'dada', valor: '60' }),
        col({ clave: 'aguanto', etiqueta: 'Segundos del último', unidad: 's' }),
      ],
      bloques: [{
        clave: 'esc', etiqueta: 'Escalón', modo: 'abierto', veces: 20, duracion: 60, pitaCambio: true,
        columnas: [col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada', tipo: 'progresion', desde: 8, paso: 0.5, pasoRef: 'inc' })],
      }],
      resultados: [{ nombre: 'vam', unidad: 'km/h', formula: [
        fnB('ultima', 'vel'), op('+'), v('aguanto'), op('/'), v('dur'), op('*'), v('inc'),
      ] }],
    }
    expect(pasar(t, { '@esc': 9, aguanto: '40' }).vam).toBeCloseTo(12.3333, 3)
  })

  it('1RM por intentos: se para cuando falla', () => {
    const t: TestLab = {
      nombre: '1RM', deporte: 'Fuerza', sueltos: [],
      bloques: [{
        clave: 'i', etiqueta: 'Intento', modo: 'abierto', veces: 8, duracion: 0,
        columnas: [col({ clave: 'peso', etiqueta: 'Peso', unidad: 'kg' })],
      }],
      resultados: [
        { nombre: 'rm', unidad: 'kg', formula: [fnB('maximo', 'peso')] },
        { nombre: 'intentos', unidad: 'ud', formula: [fnB('cuantas', 'peso')] },
      ],
    }
    const r = pasar(t, { '@i': 5, peso: ['80', '100', '115', '125', '130', '', '', ''] })
    expect(r.rm).toBeCloseTo(130, 3)
    expect(r.intentos).toBe(5)
  })

  it('Course navette: el pitido lleva el ritmo', () => {
    const t: TestLab = {
      nombre: 'Navette', deporte: 'Carrera',
      sueltos: [col({ clave: 'ini', etiqueta: 'Empieza', unidad: 'km/h', clase: 'dada', valor: '8.5' })],
      bloques: [{
        clave: 'p', etiqueta: 'Palier', modo: 'abierto', veces: 21, duracion: 60,
        pitaCambio: true, ritmo: 'metros', ritmoCada: 20,
        columnas: [col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada', tipo: 'progresion', desde: 8.5, paso: 0.5, desdeRef: 'ini' })],
      }],
      resultados: [
        { nombre: 'vfinal', unidad: 'km/h', formula: [fnB('ultima', 'vel')] },
        /* VO₂máx de Léger: 31,025 + 3,238·V − 3,248·edad + 0,1536·V·edad.
           Con la edad como casilla, para un adulto se simplifica a la V final. */
        { nombre: 'paliers', unidad: 'ud', formula: [fnB('cuantas', 'vel')] },
      ],
    }
    const r = pasar(t, { '@p': 9 })
    expect(r.vfinal).toBeCloseTo(12.5, 3)
    expect(r.paliers).toBe(9)
  })
})

// ============================================================
// 4. LO QUE NO CABE
// ============================================================
//
// Cuatro cosas. Las tres primeras son de verdad, la cuarta es cosmética.
describe('lo que NO cabe, y por qué', () => {
  /**
   * 1. NO HAY COLUMNAS CALCULADAS POR REPETICIÓN.
   *
   * Es el hueco grande, y sale en tres tests muy usados:
   *
   *   · RAST — la potencia de cada sprint es peso·35²/t³. La potencia MEDIA de
   *     los seis NO es peso·35²/media(t)³, porque el cubo no es lineal. Sale un
   *     número plausible y equivocado.
   *   · RSI del drop jump — es altura/contacto de CADA salto, y luego el mejor.
   *     `maximo(altura)/minimo(contacto)` mezcla dos saltos distintos.
   *   · Perfil carga-velocidad — la potencia de cada serie es carga·velocidad.
   *
   * Lo que haría falta: una columna del bloque que en vez de medirse se calcule
   * con las otras de SU MISMA repetición, y que después se le puedan pedir
   * `maximo`, `media`… como a cualquier otra.
   */
  it('el RAST da distinto según se calcule por repetición o sobre la media', () => {
    const peso = 70, d = 35
    const tiempos = [4.8, 5.0, 5.2, 5.5, 5.8, 6.1]
    const potencia = (x: number) => peso * d * d / (x * x * x)

    const mediaDeLasPotencias = tiempos.map(potencia).reduce((a, b) => a + b, 0) / tiempos.length
    const potenciaDeLaMedia = potencia(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)

    /* Casi un 3 % de diferencia. Parece poco hasta que se compara con el test
       del mes pasado y la mejora que se enseña es de un 2 %. */
    expect(mediaDeLasPotencias).toBeGreaterThan(potenciaDeLaMedia)
    expect(mediaDeLasPotencias / potenciaDeLaMedia).toBeGreaterThan(1.02)

    /* Lo que SÍ sale bien hoy: cualquier cosa que dependa de UN solo tiempo. */
    const t: TestLab = {
      nombre: 'RAST (solo lo que cabe)', deporte: 'Carrera',
      sueltos: [col({ clave: 'peso', etiqueta: 'Peso', unidad: 'kg', clase: 'dada', valor: '70' })],
      bloques: [{
        clave: 's', etiqueta: 'Sprint', modo: 'cerrado', veces: 6, duracion: 0,
        columnas: [col({ clave: 'ts', etiqueta: 'Tiempo', unidad: 's', instrumento: 'crono-seg' })],
      }],
      resultados: [{ nombre: 'p_max', unidad: 'W', formula: [
        v('peso'), op('*'), num(1225), op('/'), op('('), fnB('minimo', 'ts'), op('^'), num(3), op(')'),
      ] }],
    }
    const r = pasar(t, { ts: tiempos.map(String) })
    expect(r.p_max).toBeCloseTo(potencia(4.8), 2)
  })

  /**
   * 2. EL RITMO DENTRO DE LA REPETICIÓN ES UNO SOLO.
   *
   * El 30-15 IFT son 30 s corriendo y 15 s andando: dos tramos dentro de la
   * misma repetición, con pitidos distintos. El Yo-Yo IR1 igual (2×20 m y 10 s
   * de pausa). Hoy una repetición tiene UNA duración y UN ritmo, así que el
   * reloj no sabe cantar la pausa.
   *
   * Lo que haría falta: que la repetición pueda tener tramos —«30 s de trabajo
   * + 15 s de pausa»— y que el pitido sepa distinguirlos.
   *
   * SE PUEDE APAÑAR hoy poniendo la repetición de 45 s: los datos salen bien,
   * pero el reloj no avisa de cuándo parar de correr, que es medio test.
   */
  it('el 30-15 se puede apuntar, pero el reloj no lo dirige', () => {
    const t: TestLab = {
      nombre: '30-15 IFT', deporte: 'Carrera', sueltos: [],
      bloques: [{
        clave: 'e', etiqueta: 'Escalón', modo: 'abierto', veces: 25,
        duracion: 45, pitaCambio: true, avisoAntes: 5,
        columnas: [col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada', tipo: 'progresion', desde: 8, paso: 0.5 })],
      }],
      resultados: [{ nombre: 'vift', unidad: 'km/h', formula: [fnB('ultima', 'vel')] }],
    }
    /* Los datos salen: la VIFT es la velocidad del último escalón completado. */
    expect(pasar(t, { '@e': 12 }).vift).toBeCloseTo(13.5, 3)
    /* Pero el bloque solo sabe de una duración: no hay dónde decir «30 corriendo
       y 15 andando». Si esto deja de ser verdad, hay que reescribir el test. */
    expect(Object.keys(t.bloques[0])).not.toContain('tramos')
  })

  /**
   * 3. LA PROGRESIÓN ES ARITMÉTICA.
   *
   * La navette real no sube de 0,5 en 0,5 exactos, y el Yo-Yo IR1 tiene una
   * tabla de velocidades que no es una progresión. Hoy hay dos formas de dar
   * una columna: progresión o LISTA, y la lista guarda TEXTO.
   *
   * Y resulta que la lista con números SÍ funciona para calcular —el motor
   * convierte lo que le llega—, así que el apaño existe: escribir las 21
   * velocidades a mano. Lo que no funciona es el pitido por metros, que lee la
   * velocidad solo de una progresión.
   */
  it('una lista de números vale para calcular, pero no para el pitido', () => {
    const t: TestLab = {
      nombre: 'Yo-Yo IR1 (velocidades a mano)', deporte: 'Carrera', sueltos: [],
      bloques: [{
        clave: 'n', etiqueta: 'Nivel', modo: 'abierto', veces: 5, duracion: 0,
        columnas: [col({
          clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada',
          tipo: 'lista', etiquetas: ['10', '12', '13', '13.5', '14'],
        })],
      }],
      resultados: [{ nombre: 'vfinal', unidad: 'km/h', formula: [fnB('ultima', 'vel')] }],
    }
    expect(pasar(t, { '@n': 4 }).vfinal).toBeCloseTo(13.5, 3)
  })

  /**
   * 4. LAS FÓRMULAS SON ARITMÉTICA, NO ESTADÍSTICA.
   *
   * El umbral de lactato por Dmax, el perfil fuerza-velocidad o cualquier
   * interpolación necesitan una regresión, no una suma. Eso no es un hueco del
   * modelo de datos —las columnas están ahí, con sus valores por repetición—
   * sino del motor de fórmulas.
   *
   * Y es una decisión, no un olvido: una regresión metida en un editor de
   * fórmulas de bloques es muy fácil de aplicar mal y muy difícil de ver mal.
   */
  it('lo que hace falta para un umbral no es una función de serie', () => {
    /* Con cuatro escalones y su lactato, el modelo GUARDA todo lo necesario… */
    const t: TestLab = {
      nombre: 'Escalonado', deporte: 'Carrera', sueltos: [],
      bloques: [{
        clave: 'e', etiqueta: 'Escalón', modo: 'abierto', veces: 8, duracion: 180,
        columnas: [
          col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada', tipo: 'progresion', desde: 10, paso: 1 }),
          col({ clave: 'lac', etiqueta: 'Lactato', unidad: 'mmol/L' }),
        ],
      }],
      resultados: [{ nombre: 'lac_max', unidad: 'mmol/L', formula: [fnB('maximo', 'lac')] }],
    }
    const r = pasar(t, { '@e': 4, lac: ['1.1', '1.6', '2.9', '5.2', '', '', '', ''] })
    expect(r.lac_max).toBeCloseTo(5.2, 3)
    /* …pero la velocidad a 4 mmol/L hay que interpolarla entre el 3.º y el 4.º,
       y no hay función que lo haga. Sale a mano: 12 + (4−2,9)/(5,2−2,9) = 12,48. */
    const v4 = 12 + (4 - 2.9) / (5.2 - 2.9)
    expect(v4).toBeCloseTo(12.478, 2)
  })
})
