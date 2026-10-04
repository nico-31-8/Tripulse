// ============================================================
// Parciales DENTRO de un bloque: una lista dentro de otra
// ============================================================
//
// EL CASO, del entrenador: «la casilla está vacía, la pulso y pone 3, vuelvo a
// pulsar y pone el 3 de antes y el 6,8 de ahora, y así las veces que necesite».
// Y lo quiere en la tabla, no en una casilla suelta.
//
// POR QUÉ NO ERA LO MISMO QUE UN BLOQUE. El argumento para prohibirlo era que
// dentro de un bloque la lista ya la forman las repeticiones. No es verdad: son
// DOS LISTAS ANIDADAS. Seis series de 400 y, dentro de cada 400, los pasos por
// cada 100. La fila dice qué serie; la casilla, lo que pasó dentro.
//
// LA REGLA, que es lo único que de verdad hay que entender: la misma de siempre
// —dentro ves tu fila, al final ves el conjunto—.
//
//   - En una columna CALCULADA del mismo bloque, la columna de parciales es la
//     lista de ESA fila: `suma(pasos)` es lo que tardó esa serie.
//   - En un RESULTADO, son todas las marcas juntas: `media(pasos)` es el paso
//     medio, igual que en una casilla suelta. El nombre significa lo mismo en
//     los dos sitios.

import { describe, it, expect } from 'vitest'
import {
  calcular, col, fnB, medVacia, parcialesBloqueDe, pegasDe, relojesDe, vacio, type TestLab,
} from './lab-constructor'
import { leerModelo, paraGuardar } from './lab-guardar'

/** 3×400, y dentro de cada 400 los pasos por cada 100. */
const SERIES: TestLab = {
  nombre: '3×400 con pasos', deporte: 'Carrera', sueltos: [],
  bloques: [{
    clave: 'b', etiqueta: 'Serie', modo: 'cerrado', veces: 3, duracion: 0,
    columnas: [col({ clave: 'pasos', etiqueta: 'Cada 100', unidad: 's', instrumento: 'parciales' })],
  }],
  resultados: [
    { nombre: 'paso_medio', unidad: 's', formula: [fnB('media', 'pasos')] },
    { nombre: 'cuantos', unidad: 'ud', formula: [fnB('cuantas', 'pasos')] },
    { nombre: 'total', unidad: 's', formula: [fnB('suma', 'pasos')] },
  ],
}

/** Lo que marcó: 4 pasos en cada una de las 3 series. */
const MARCADO = {
  pasos: [
    ['15.0', '15.5', '16.0', '15.5'],
    ['15.2', '15.8', '16.4', '16.0'],
    ['14.8', '15.0', '15.2', '14.6'],
  ],
}

const pasar = (t: TestLab, datos: Record<string, unknown>) => {
  const vals = calcular(t, datos)
  const o: Record<string, number | null | string> = {}
  t.resultados.forEach((r, i) => { o[r.nombre] = vals[i].error ?? vals[i].valor })
  return o
}

describe('se reconoce y se monta', () => {
  it('la pantalla sabe cuáles son y de qué bloque', () => {
    expect(parcialesBloqueDe(SERIES).map(x => x.c.clave + '@' + x.bl.clave)).toEqual(['pasos@b'])
  })

  it('NACE COMO UNA LISTA POR REPETICIÓN, no como una sola', () => {
    /* Con una lista única, la primera marca de la serie 2 se iría a la 1. */
    expect(medVacia(SERIES).pasos).toEqual([[], [], []])
  })

  it('y el montador lo deja guardar', () => {
    expect(pegasDe(SERIES)).toEqual([])
  })

  it('sobrevive a guardarlo y volverlo a leer', () => {
    const fila = paraGuardar(SERIES, 'entrenador-1')
    const v = leerModelo(fila.modelo, SERIES.nombre, SERIES.deporte)!
    expect(v.bloques[0].columnas[0].instrumento).toBe('parciales')
  })
})

describe('EN UN RESULTADO SON TODAS LAS MARCAS', () => {
  it('la media es la de los doce pasos, no la de tres listas', () => {
    /* Sin aplanar, la fórmula recibía tres listas y `Number(['15','15.5'])`
       daba NaN: el resultado salía «tiene algo que no es un número». */
    const r = pasar(SERIES, MARCADO)
    expect(r.cuantos).toBe(12)
    expect(r.paso_medio).toBeCloseTo(15.4167, 3)
    expect(r.total).toBeCloseTo(185, 6)
  })

  it('con una sola marca en cada serie también', () => {
    const r = pasar(SERIES, { pasos: [['15'], ['16'], ['17']] })
    expect(r.cuantos).toBe(3)
    expect(r.paso_medio).toBe(16)
  })
})

describe('EN UNA CALCULADA DE LA MISMA FILA ES SU FILA', () => {
  /* Aquí está lo que no se puede hacer de ninguna otra manera: el tiempo de
     cada 400 es la SUMA de sus pasos, y eso es un número POR SERIE. */
  const conTiempo: TestLab = {
    ...SERIES,
    bloques: [{
      ...SERIES.bloques[0],
      columnas: [
        SERIES.bloques[0].columnas[0],
        col({ clave: 't400', etiqueta: 'La serie', unidad: 's', clase: 'calculada', formula: [fnB('suma', 'pasos')] }),
      ],
    }],
    resultados: [
      { nombre: 'mejor_400', unidad: 's', inverso: true, formula: [fnB('minimo', 't400')] },
      { nombre: 'media_400', unidad: 's', formula: [fnB('media', 't400')] },
    ],
  }

  it('cada fila suma LO SUYO', () => {
    const r = pasar(conTiempo, MARCADO)
    expect(r.mejor_400).toBeCloseTo(59.6, 6)
    expect(r.media_400).toBeCloseTo(185 / 3, 6)
  })

  it('y se deja guardar, que es lo que lo hace servir para algo', () => {
    expect(pegasDe(conTiempo)).toEqual([])
  })
})

describe('lo que NO se puede, y se dice por qué', () => {
  it('usar la columna a pelo en un resultado', () => {
    const malo: TestLab = { ...SERIES, resultados: [{ nombre: 'x', unidad: '', formula: [{ t: 'var', v: 'pasos' }] }] }
    expect(pegasDe(malo)[0].texto).toContain('se repite')
  })

  it('EMPAREJARLA CON OTRA COLUMNA, aunque las dos estén en el bloque', () => {
    /* Esta es la que casi se cuela: una columna de parciales SÍ tiene bloque,
       así que la guarda de antes —«¿está suelta?»— la dejaba pasar, y al
       emparejarla se cruzaban doce marcas contra tres números. */
    const malo: TestLab = {
      ...SERIES,
      bloques: [{
        ...SERIES.bloques[0],
        columnas: [SERIES.bloques[0].columnas[0], col({ clave: 'fc', unidad: 'ppm' })],
      }],
      resultados: [{ nombre: 'r', unidad: '', formula: [{ t: 'fn2', v: 'pendiente', x: 'pasos', y: 'fc' }] }],
    }
    const pegas = pegasDe(malo)
    expect(pegas.some(z => /UN número en cada repetición/.test(z.texto))).toBe(true)
  })
})

describe('UNA CASILLA SIN MARCAR ES UN HUECO', () => {
  /* La trampa: una lista vacía no es ni null ni texto en blanco, así que
     contaba como RELLENA. El bloque daba por hecha una serie en la que no se
     marcó nada y el resultado salía como si estuviera completo. */
  it('una lista vacía cuenta como vacía', () => {
    expect(vacio([])).toBe(true)
    expect(vacio(['15'])).toBe(false)
  })

  it('y se dice cuántas faltan en vez de dar un número de mentira', () => {
    const r = pasar(SERIES, { pasos: [['15', '15.5'], [], ['14.8']] })
    expect(r.paso_medio).toBe('faltan 1 de 3 en «pasos»')
  })

  it('sin marcar nada, faltan todas', () => {
    /* En un bloque CERRADO las tres filas existen desde el principio, así que
       lo que falta son marcas, no repeticiones: por eso dice «faltan 3 de 3» y
       no «todavía no tiene nada», que es lo de un bloque abierto. */
    const r = pasar(SERIES, { pasos: [[], [], []] })
    expect(r.paso_medio).toBe('faltan 3 de 3 en «pasos»')
  })

  it('Y UNA AGREGACIÓN QUE NO SEA DE PARCIALES SIGUE PROHIBIDA DENTRO DE LA FILA', () => {
    /* La excepción es solo para la casilla que guarda varias marcas. En una
       columna normal, `media()` de un número suelto es ese número: parece que
       calcula algo y no calcula nada. */
    const malo: TestLab = {
      ...SERIES,
      bloques: [{
        ...SERIES.bloques[0],
        columnas: [
          SERIES.bloques[0].columnas[0],
          col({ clave: 'fc', unidad: 'ppm' }),
          col({ clave: 'x', clase: 'calculada', formula: [fnB('media', 'fc')] }),
        ],
      }],
      resultados: [],
    }
    expect(pegasDe(malo).some(z => /cada nombre es UNA repetición/.test(z.texto))).toBe(true)
  })
})

describe('la pantalla lo cuenta', () => {
  it('se anuncia como reloj, igual que una casilla suelta', () => {
    /* El test que vigila que TODOS los relojes se pintan cuelga de esta lista:
       si una clase nueva no se añade aquí, la pantalla puede prometerla sin
       pintarla nunca. Ya pasó con el cronómetro de las casillas sueltas. */
    expect(relojesDe(SERIES)).toEqual(['parciales en «Cada 100»'])
  })
})

describe('UN HUECO DENTRO DE UNA FILA NO ES UN CERO', () => {
  /* Lo cazó el test del pulsador cortado, pero el fallo era de aquí también:
     una fila a medias —['15', '', '15.5']— NO está vacía, así que pasaba el
     control de huecos; y al aplanarla para la fórmula, `Number('')` es CERO y
     entraba en la media como una marca de verdad. Un paso que nadie tomó
     bajaba la media sin que nada lo dijera.

     Es la tercera vez en el laboratorio que `Number('')` se cuela como cero.
     Los dos sitios de antes están en `acumuladosDe` y en `parcialAhora`. */
  it('se dice que falta, y en qué repetición', () => {
    const r = pasar(SERIES, { pasos: [['15', '15.5', '16', '15.5'], ['15.2', '', '16.4', '16'], ['14.8', '15', '15.2', '14.6']] })
    expect(r.paso_medio).toBe('falta un número en «pasos», repetición 2')
  })

  it('con varios se dicen todas', () => {
    const r = pasar(SERIES, { pasos: [['15', ''], ['15.2', '16.4'], ['', '15.2']] })
    expect(r.paso_medio).toBe('faltan 2 números en «pasos» (repeticiones 1, 3)')
  })

  it('y una fila entera vacía sigue contándose como repetición que falta', () => {
    /* Son dos cosas distintas: no marcar NADA en una serie, y marcar a medias
       dentro de ella. La primera manda, porque es la que se arregla antes. */
    const r = pasar(SERIES, { pasos: [['15'], [], ['14.8', '']] })
    expect(r.paso_medio).toBe('faltan 1 de 3 en «pasos»')
  })
})
