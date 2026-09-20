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
  duracionDe, tramoEn, escalonAhora, intervaloRitmo,
  type TestLab, type Datos,
} from './lab-constructor'
import { plantillaPorId } from './lab-plantillas'

const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

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

  it('se puede trabajar con una repetición concreta, y con dos seguidas', () => {
    const t: TestLab = {
      nombre: 'Con la 2.ª y la 3.ª', deporte: 'Natación', sueltos: [],
      bloques: [{
        clave: 'r', etiqueta: 'Cada 100', modo: 'cerrado', veces: 6, duracion: 0,
        columnas: [col({ clave: 't', etiqueta: 'Tiempo', unidad: 's' })],
      }],
      resultados: [
        /* Un tramo de UNA repetición: de la 2.ª a la 2.ª. */
        { nombre: 'la_segunda', unidad: 's', formula: [fnB('suma', 't', 2, 2)] },
        { nombre: 'la_tercera', unidad: 's', formula: [fnB('suma', 't', 3, 3)] },
        /* Y las dos juntas, que es un tramo de dos. */
        { nombre: 'media_2y3', unidad: 's', formula: [fnB('media', 't', 2, 3)] },
        { nombre: 'de_la_2_a_la_3', unidad: 's', formula: [fnB('suma', 't', 3, 3), op('-'), fnB('suma', 't', 2, 2)] },
      ],
    }
    const r = pasar(t, { t: ['74', '75', '76', '77', '78', '80'] })
    expect(r.la_segunda).toBeCloseTo(75, 3)
    expect(r.la_tercera).toBeCloseTo(76, 3)
    expect(r.media_2y3).toBeCloseTo(75.5, 3)
    expect(r.de_la_2_a_la_3).toBeCloseTo(1, 3)
  })

  it('pedir una repetición que no existe avisa, no devuelve cero', () => {
    const t: TestLab = {
      nombre: 'Fuera de rango', deporte: 'Otro', sueltos: [],
      bloques: [{
        clave: 'r', etiqueta: 'r', modo: 'cerrado', veces: 3, duracion: 0,
        columnas: [col({ clave: 't', etiqueta: '' })],
      }],
      resultados: [{ nombre: 'z', unidad: '', formula: [fnB('suma', 't', 5, 5)] }],
    }
    const vals = calcular(t, { t: ['1', '2', '3'] })
    expect(vals[0].valor).toBeNull()
    expect(vals[0].error).toMatch(/desde la 5/)
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
// 4. LO QUE ANTES NO CABÍA
// ============================================================
//
// Tres huecos que se cerraron el 2026-09-18. Los tests se quedan para que no se
// vuelvan a abrir sin que nadie se entere.
describe('columnas calculadas por repetición', () => {
  /**
   * EL HUECO GRANDE, y salía en tres tests muy usados: RAST, RSI del drop jump
   * y perfil carga-velocidad. Todos necesitan calcular algo de CADA repetición
   * antes de agregarlo, y hacerlo sobre la media da otro número.
   */
  it('la media de las potencias NO es la potencia de la media', () => {
    const peso = 70, d = 35
    const tiempos = [4.8, 5.0, 5.2, 5.5, 5.8, 6.1]
    const potencia = (x: number) => peso * d * d / (x * x * x)
    const mediaDeLasPotencias = tiempos.map(potencia).reduce((a, b) => a + b, 0) / tiempos.length
    const potenciaDeLaMedia = potencia(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)
    /* Un 4 %. Parece poco hasta que se compara con el test del mes pasado y la
       mejora que se le enseña al atleta es de ese orden. */
    expect(mediaDeLasPotencias / potenciaDeLaMedia).toBeGreaterThan(1.04)

    const t: TestLab = {
      nombre: 'RAST', deporte: 'Carrera',
      sueltos: [col({ clave: 'peso', etiqueta: 'Peso', unidad: 'kg', clase: 'dada', valor: '70' })],
      bloques: [{
        clave: 's', etiqueta: 'Sprint', modo: 'cerrado', veces: 6, duracion: 0,
        columnas: [
          col({ clave: 'ts', etiqueta: 'Tiempo', unidad: 's', instrumento: 'crono-seg' }),
          col({ clave: 'pot', etiqueta: 'Potencia', unidad: 'W', clase: 'calculada', formula: [
            v('peso'), op('*'), num(1225), op('/'), op('('), v('ts'), op('^'), num(3), op(')'),
          ] }),
        ],
      }],
      resultados: [
        { nombre: 'p_max', unidad: 'W', formula: [fnB('maximo', 'pot')] },
        { nombre: 'p_media', unidad: 'W', formula: [fnB('media', 'pot')] },
        { nombre: 'fatiga', unidad: 'W/s', formula: [
          op('('), fnB('maximo', 'pot'), op('-'), fnB('minimo', 'pot'), op(')'), op('/'), fnB('suma', 'ts'),
        ] },
      ],
    }
    const r = pasar(t, { ts: tiempos.map(String) })
    expect(r.p_max).toBeCloseTo(potencia(4.8), 2)
    /* Y AQUÍ ESTÁ LO QUE SE ARREGLÓ: la media es la de las seis potencias. */
    expect(r.p_media).toBeCloseTo(mediaDeLasPotencias, 2)
    expect(r.p_media).not.toBeCloseTo(potenciaDeLaMedia, 0)
    expect(r.fatiga).toBeCloseTo((potencia(4.8) - potencia(6.1)) / 32.4, 2)
  })

  it('el RSI del drop jump sale salto a salto, no mezclando el mejor con el peor', () => {
    const t: TestLab = {
      nombre: 'Drop jump', deporte: 'Fuerza', sueltos: [],
      bloques: [{
        clave: 'j', etiqueta: 'Salto', modo: 'cerrado', veces: 3, duracion: 0,
        columnas: [
          col({ clave: 'alt', etiqueta: 'Altura', unidad: 'm' }),
          col({ clave: 'con', etiqueta: 'Contacto', unidad: 's' }),
          col({ clave: 'rsi', etiqueta: 'RSI', unidad: '', clase: 'calculada', formula: [v('alt'), op('/'), v('con')] }),
        ],
      }],
      resultados: [{ nombre: 'rsi_max', unidad: '', formula: [fnB('maximo', 'rsi')] }],
    }
    /* Alturas 0,32 0,30 0,34 y contactos 0,20 0,18 0,25 → RSI 1,60 1,667 1,36.
       El mejor es 1,667. Mezclando el mejor salto con el mejor contacto saldría
       0,34/0,18 = 1,889, que es un salto que no ha existido. */
    const r = pasar(t, { alt: ['0.32', '0.30', '0.34'], con: ['0.20', '0.18', '0.25'] })
    expect(r.rsi_max).toBeCloseTo(1.6667, 3)
    expect(r.rsi_max).not.toBeCloseTo(0.34 / 0.18, 2)
  })

  it('una calculada puede apoyarse en otra anterior', () => {
    const t: TestLab = {
      nombre: 'Encadenadas', deporte: 'Otro', sueltos: [],
      bloques: [{
        clave: 'r', etiqueta: 'Serie', modo: 'cerrado', veces: 2, duracion: 0,
        columnas: [
          col({ clave: 'carga', etiqueta: 'Carga', unidad: 'kg' }),
          col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'm/s' }),
          col({ clave: 'fuerza', etiqueta: 'Fuerza', unidad: 'N', clase: 'calculada', formula: [v('carga'), op('*'), num(9.81)] }),
          col({ clave: 'pot', etiqueta: 'Potencia', unidad: 'W', clase: 'calculada', formula: [v('fuerza'), op('*'), v('vel')] }),
        ],
      }],
      resultados: [{ nombre: 'p_max', unidad: 'W', formula: [fnB('maximo', 'pot')] }],
    }
    const r = pasar(t, { carga: ['40', '80'], vel: ['1.2', '0.7'] })
    expect(r.p_max).toBeCloseTo(80 * 9.81 * 0.7, 2)
  })

  it('no deja nombrar una columna que va después, ni usar funciones de serie dentro', () => {
    const base = (formula: typeof v extends never ? never : ReturnType<typeof v>[]): TestLab => ({
      nombre: 'x', deporte: 'Otro', sueltos: [],
      bloques: [{
        clave: 'r', etiqueta: 'r', modo: 'cerrado', veces: 2, duracion: 0,
        columnas: [
          col({ clave: 'calc', etiqueta: '', clase: 'calculada', formula }),
          col({ clave: 'luego', etiqueta: '' }),
        ],
      }],
      resultados: [{ nombre: 'z', unidad: '', formula: [fnB('media', 'calc')] }],
    })
    expect(pegasDe(base([v('luego')])).some(p => /va DESPUÉS/.test(p.texto))).toBe(true)
    expect(pegasDe(base([])).some(p => /ponle una fórmula/.test(p.texto))).toBe(true)
    const conFn: TestLab = base([v('luego')])
    conFn.bloques[0].columnas[0].formula = [fnB('media', 'luego')]
    expect(pegasDe(conFn).some(p => /no valen suma\(\), media\(\)/.test(p.texto))).toBe(true)
  })
})

describe('la repetición partida en tramos', () => {
  /**
   * El 30-15 IFT son 30 s corriendo y 15 andando; el Yo-Yo IR1, 2×20 m y 10 s
   * de pausa. Antes el reloj sabía cuándo cambiaba de escalón pero no cuándo
   * había que dejar de correr, que es medio test.
   */
  it('la duración sale de los tramos, no de un campo aparte', () => {
    const t = clon(plantillaPorId('ift')!.test)
    const bl = t.bloques[0]
    expect(duracionDe(bl)).toBe(45)
    /* Y si alguien cambia un tramo, la duración se mueve sola: dos sitios
       diciendo cuánto dura una repetición acabarían diciendo cosas distintas. */
    bl.tramos![1].segundos = 20
    expect(duracionDe(bl)).toBe(50)
    expect(escalonAhora(bl, 50_000)).toBe(2)
  })

  it('el reloj sabe en qué tramo va y cuánto le queda', () => {
    const bl = clon(plantillaPorId('ift')!.test).bloques[0]
    expect(tramoEn(bl, 0)?.nombre).toBe('Correr')
    expect(tramoEn(bl, 29_000)?.nombre).toBe('Correr')
    expect(tramoEn(bl, 29_000)?.restante).toBe(1)
    expect(tramoEn(bl, 30_000)?.nombre).toBe('Andar')
    expect(tramoEn(bl, 44_000)?.restante).toBe(1)
  })

  it('un tramo sin duración o sin nombre no deja guardar', () => {
    const t = clon(plantillaPorId('ift')!.test)
    t.bloques[0].tramos = [{ nombre: 'Correr', segundos: 30 }, { nombre: '', segundos: 0 }]
    const p = pegasDe(t)
    expect(p.some(x => /sin duración/.test(x.texto))).toBe(true)
    expect(p.some(x => /nombre a cada tramo/.test(x.texto))).toBe(true)
  })

  it('la VIFT sigue saliendo del último escalón completo', () => {
    expect(pasar(clon(plantillaPorId('ift')!.test), { '@e': 12 }).vift).toBeCloseTo(13.5, 3)
  })
})

describe('la velocidad del pitido también sale de una lista', () => {
  /**
   * El Yo-Yo IR1 tiene una tabla de velocidades que no es una progresión.
   * Pidiendo solo progresiones, esos protocolos se quedaban sin pitido.
   */
  it('con una lista de números, el ritmo por metros funciona', () => {
    const t: TestLab = {
      nombre: 'Yo-Yo IR1', deporte: 'Carrera', sueltos: [],
      bloques: [{
        clave: 'n', etiqueta: 'Nivel', modo: 'abierto', veces: 5, duracion: 60,
        ritmo: 'metros', ritmoCada: 40, pitaCambio: true,
        columnas: [col({
          clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada',
          tipo: 'lista', etiquetas: ['10', '12', '13', '13.5', '14'],
        })],
      }],
      resultados: [{ nombre: 'vfinal', unidad: 'km/h', formula: [fnB('ultima', 'vel')] }],
    }
    expect(pegasDe(t)).toEqual([])
    expect(pasar(t, { '@n': 4 }).vfinal).toBeCloseTo(13.5, 3)
    /* 40 m a 10 km/h son 14,4 s; a 13,5 km/h, 10,67. El hueco se acorta solo. */
    expect(intervaloRitmo(t.bloques[0], 1, {})).toBeCloseTo(40 / (10 / 3.6) * 1000, 0)
    expect(intervaloRitmo(t.bloques[0], 4, {})).toBeCloseTo(40 / (13.5 / 3.6) * 1000, 0)
  })
})

// ============================================================
// 5. La estadística, y su red
// ============================================================
//
// El peligro de estas no es que fallen: es que SALEN AUNQUE ESTÉN MAL. Una
// media mala se ve —4.000 W en un RAST cantan—, pero una recta mal ajustada
// devuelve su F0 y su V0 con aspecto impecable. Por eso cada test de aquí
// comprueba dos cosas: que el número sale bien, y que cuando no vale se dice.
describe('interpolar: el dato que cae entre dos escalones', () => {
  const escalonado = (): TestLab => ({
    nombre: 'Escalonado con lactato', deporte: 'Carrera', sueltos: [],
    bloques: [{
      clave: 'e', etiqueta: 'Escalón', modo: 'abierto', veces: 8, duracion: 180,
      columnas: [
        col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'km/h', clase: 'dada', tipo: 'progresion', desde: 10, paso: 1 }),
        col({ clave: 'lac', etiqueta: 'Lactato', unidad: 'mmol/L' }),
      ],
    }],
    resultados: [{ nombre: 'umbral', unidad: 'km/h', formula: [
      { t: 'fn2', v: 'interpola', x: 'vel', y: 'lac', a: 4 },
    ] }],
  })

  it('el umbral a 4 mmol/L sale entre el 12 y el 13', () => {
    /* 10→1,1 · 11→1,6 · 12→2,9 · 13→5,2. El 4 cae entre los dos últimos:
       12 + (4−2,9)/(5,2−2,9) = 12,478. */
    const r = pasar(escalonado(), { '@e': 4, lac: ['1.1', '1.6', '2.9', '5.2', '', '', '', ''] })
    expect(r.umbral).toBeCloseTo(12.478, 3)
  })

  /* SE NIEGA A EXTRAPOLAR. Pedir el umbral a 4 cuando el lactato solo llegó a
     2,9 no es calcular: es inventarse un dato que además sale con decimales de
     aspecto serio. */
  it('si el lactato no llegó a 4, NO se lo inventa', () => {
    const t = escalonado()
    const vals = calcular(t, { '@e': 3, lac: ['1.1', '1.6', '2.9', '', '', '', '', ''] })
    expect(vals[0].valor).toBeNull()
    expect(vals[0].error).toMatch(/solo se movió entre/)
    expect(vals[0].error).toMatch(/inventarlo/)
  })

  it('si el lactato pasa dos veces por 4, avisa de cuál ha cogido', () => {
    const t = escalonado()
    /* Baja y vuelve a subir: pasa por 4 dos veces. El número sale —el primero—
       pero hay que decir que había otro. */
    const vals = calcular(t, { '@e': 5, lac: ['1', '4.5', '3', '4.5', '6', '', '', ''] })
    expect(vals[0].valor).not.toBeNull()
    expect(vals[0].avisos?.join(' ')).toMatch(/pasa por 4.*veces/)
  })
})

describe('la recta: el perfil fuerza-velocidad', () => {
  /* Cuatro sprints con cuatro cargas, midiendo la velocidad. Los puntos caen en
     una recta vel = V0 − (V0/F0)·carga, y de ella salen los tres números que
     SON el test: V0, F0 y la potencia máxima. */
  const perfil = (): TestLab => ({
    nombre: 'Perfil fuerza-velocidad', deporte: 'Ciclismo', sueltos: [],
    bloques: [{
      clave: 's', etiqueta: 'Sprint', modo: 'cerrado', veces: 4, duracion: 0,
      columnas: [
        col({ clave: 'carga', etiqueta: 'Carga', unidad: 'N', clase: 'dada', tipo: 'lista', etiquetas: ['100', '200', '300', '400'] }),
        col({ clave: 'vel', etiqueta: 'Velocidad', unidad: 'm/s' }),
      ],
    }],
    resultados: [
      { nombre: 'v0', unidad: 'm/s', formula: [{ t: 'fn2', v: 'corte', x: 'carga', y: 'vel' }] },
      { nombre: 'pend', unidad: '', formula: [{ t: 'fn2', v: 'pendiente', x: 'carga', y: 'vel' }] },
      { nombre: 'f0', unidad: 'N', formula: [
        op('-'), { t: 'ref', v: 'v0' }, op('/'), { t: 'ref', v: 'pend' },
      ] },
      { nombre: 'se_fia', unidad: '', formula: [{ t: 'fn2', v: 'ajuste', x: 'carga', y: 'vel' }] },
    ],
  })

  it('saca V0, la pendiente y F0 de cuatro puntos', () => {
    /* Recta exacta: vel = 10 − 0,02·carga → V0 = 10, F0 = 500. */
    const r = pasar(perfil(), { vel: ['8', '6', '4', '2'] })
    expect(r.v0).toBeCloseTo(10, 6)
    expect(r.pend).toBeCloseTo(-0.02, 6)
    expect(r.f0).toBeCloseTo(500, 4)
    expect(r.se_fia).toBeCloseTo(1, 6)
  })

  /* AQUÍ ESTÁ LA RED. Con los puntos torcidos la recta sale igual, con su V0 y
     su F0 de aspecto impecable. Lo que cambia es que ahora lo dice sola. */
  it('si los puntos no caen en una recta, el número sale PERO avisa', () => {
    const t = perfil()
    const vals = calcular(t, { carga: [], vel: ['8', '2', '7', '1'] })
    expect(vals[0].valor).not.toBeNull()
    expect(vals[0].avisos?.join(' ')).toMatch(/no caen bien en una recta/)
    expect(vals[0].avisos?.join(' ')).toMatch(/se fía 0,/)
  })

  it('con dos puntos la recta es perfecta por narices, y también lo dice', () => {
    const t = perfil()
    t.bloques[0].veces = 2
    t.bloques[0].columnas[0].etiquetas = ['100', '200']
    const vals = calcular(t, { vel: ['8', '6'] })
    expect(vals[0].valor).toBeCloseTo(10, 6)
    expect(vals[0].avisos?.join(' ')).toMatch(/2 puntos/)
    expect(vals[0].avisos?.join(' ')).toMatch(/por narices/)
  })

  it('un buen ajuste no avisa de nada', () => {
    const t = perfil()
    const vals = calcular(t, { vel: ['8', '6', '4', '2'] })
    expect(vals[0].avisos).toBeUndefined()
  })
})

describe('las de dos columnas, cuando se piden mal', () => {
  const base = (f: TestLab['resultados'][0]['formula']): TestLab => ({
    nombre: 'x', deporte: 'Otro',
    sueltos: [col({ clave: 'suelta', etiqueta: '' })],
    bloques: [
      { clave: 'a', etiqueta: 'a', modo: 'cerrado', veces: 3, duracion: 0, columnas: [col({ clave: 'x1', etiqueta: '' }), col({ clave: 'y1', etiqueta: '' })] },
      { clave: 'b', etiqueta: 'b', modo: 'cerrado', veces: 2, duracion: 0, columnas: [col({ clave: 'x2', etiqueta: '' })] },
    ],
    resultados: [{ nombre: 'z', unidad: '', formula: f }],
  })

  it('no deja cruzar columnas de bloques distintos', () => {
    const p = pegasDe(base([{ t: 'fn2', v: 'pendiente', x: 'x1', y: 'x2' }]))
    expect(p.some(q => /bloques distintos/.test(q.texto))).toBe(true)
  })

  it('no deja usar una casilla suelta', () => {
    const p = pegasDe(base([{ t: 'fn2', v: 'pendiente', x: 'x1', y: 'suelta' }]))
    expect(p.some(q => /se mide una sola vez/.test(q.texto))).toBe(true)
  })

  it('a interpola hay que decirle a qué valor', () => {
    const p = pegasDe(base([{ t: 'fn2', v: 'interpola', x: 'x1', y: 'y1' }]))
    expect(p.some(q => /a qué valor/.test(q.texto))).toBe(true)
  })

  it('dentro de una columna calculada no valen', () => {
    const t = base([{ t: 'fn2', v: 'pendiente', x: 'x1', y: 'y1' }])
    t.bloques[0].columnas.push(col({
      clave: 'mal', etiqueta: '', clase: 'calculada',
      formula: [{ t: 'fn2', v: 'pendiente', x: 'x1', y: 'y1' }],
    }))
    expect(pegasDe(t).some(q => /no valen suma\(\), media\(\) ni las de dos columnas/.test(q.texto))).toBe(true)
  })
})

describe('lo que sigue sin caber', () => {

  /**
   * 4. LO QUE QUEDA DE LA ESTADÍSTICA.
   *
   * La interpolación y la recta YA ESTÁN (ver «La estadística, y su red»): el
   * umbral a 4 mmol/L y el perfil fuerza-velocidad se montan y avisan cuando no
   * hay que fiarse.
   *
   * Lo que sigue fuera es lo que no es ni una cosa ni la otra: el Dmax —la
   * distancia máxima a la cuerda entre el primer punto y el último—, los
   * ajustes que no son rectas, y cualquier cosa con más de dos columnas. No es
   * un hueco del modelo de datos: las columnas están ahí con sus valores por
   * repetición. Es del motor de fórmulas, y se deja fuera a propósito mientras
   * no haya un caso que lo pida de verdad.
   */
  it('el umbral interpolado ya sale; el Dmax todavía hay que hacerlo a mano', () => {
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
    /* La velocidad a 4 mmol/L cae entre el 3.º y el 4.º, y eso YA lo hace
       `interpola`: 12 + (4−2,9)/(5,2−2,9) = 12,48. Se comprueba en el bloque
       de la estadística. Lo que sigue a mano es el Dmax, que necesita la
       distancia de cada punto a la cuerda entre el primero y el último. */
    expect(12 + (4 - 2.9) / (5.2 - 2.9)).toBeCloseTo(12.478, 2)
  })
})
