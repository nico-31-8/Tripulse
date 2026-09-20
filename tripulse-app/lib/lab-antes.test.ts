// ============================================================
// Comparar con el test anterior
// ============================================================
//
// `antes(resultado)` es lo único del motor que se sale de una medición. Todo lo
// demás mira los datos de una pasada; esto mira la de antes, para que «cuánto
// ha mejorado» pueda ser un resultado más y no solo un número que se lee en la
// gráfica.
//
// LO ANTERIOR SE RECALCULA, NO SE GUARDA. `calcular` recibe los datos EN BRUTO
// de la vez pasada y le pasa la fórmula de hoy. Guardando el número de aquel
// día, «cuánto ha mejorado» acabaría restando dos cosas calculadas con
// fórmulas distintas, y al mirar la resta no habría forma de saberlo.

import { describe, it, expect } from 'vitest'
import {
  calcular, pegasDe, evaluar, textoDe, col, fnB, previosParaAntes,
  PALABRA_ANTES, PREFIJO_ANTES,
  type TestLab, type Bloq,
} from './lab-constructor'
import { leerModelo, paraGuardar } from './lab-guardar'
import { seriesDe } from './lab-series'

const v = (n: string): Bloq => ({ t: 'var', v: n })
const op = (o: string): Bloq => ({ t: 'op', v: o })
const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/** Un test de una sola marca, con «cuánto ha mejorado» como segundo resultado. */
const conMejora = (): TestLab => ({
  nombre: 'Mil metros', deporte: 'Carrera',
  sueltos: [col({ clave: 'marca', etiqueta: 'Marca', unidad: 's' })],
  bloques: [],
  resultados: [
    { nombre: 'tiempo', unidad: 's', formula: [v('marca')] },
    /* En segundos, mejorar es bajar: la resta se escribe al revés para que el
       número salga positivo cuando ha ido bien. */
    { nombre: 'mejora', unidad: 's', inverso: false, formula: [{ t: 'antes', v: 'tiempo' }, op('-'), v('marca')] },
  ],
})

describe('antes(resultado)', () => {
  it('sin test anterior lo dice, en vez de dar un cero', () => {
    const vals = calcular(conMejora(), { marca: '180' })
    expect(vals[0].valor).toBe(180)
    expect(vals[1].valor).toBeNull()
    expect(vals[1].error).toMatch(/no hay un test anterior/)
  })

  it('con test anterior, resta lo de entonces', () => {
    const vals = calcular(conMejora(), { marca: '174' }, { marca: '180' })
    expect(vals[1].valor).toBe(6)
  })

  /* NO SE GUARDA NADA DE AQUEL DÍA: se vuelve a pasar por la fórmula de hoy.
     Por eso, si la fórmula cambia, la comparación cambia con ella. */
  it('lo anterior se recalcula con la fórmula de hoy', () => {
    const t = conMejora()
    /* «tiempo» pasa a estar en décimas. Los dos lados de la resta se mueven. */
    t.resultados[0].formula = [v('marca'), op('*'), { t: 'num', v: 10 }]
    t.resultados[1].formula = [{ t: 'antes', v: 'tiempo' }, op('-'), v('marca'), op('*'), { t: 'num', v: 10 }]
    expect(calcular(t, { marca: '174' }, { marca: '180' })[1].valor).toBe(60)
  })

  /* «No hay anterior» y «el anterior no salió» se arreglan distinto: lo
     primero, pasando el test otra vez dentro de unas semanas; lo segundo,
     yendo a la medición de aquel día a ver qué le faltaba. */
  it('distingue «no hay anterior» de «aquel día no salió»', () => {
    const vals = calcular(conMejora(), { marca: '174' }, { marca: '' })
    expect(vals[1].valor).toBeNull()
    expect(vals[1].error).toMatch(/no llegó a salir/)
    expect(vals[1].error).not.toMatch(/no hay un test anterior/)
  })

  it('la casilla del anterior no puede chocar con una columna', () => {
    /* `@` y `:` no valen en una clave, así que ningún test puede tener una
       casilla que se llame como la del resultado anterior. */
    expect(PREFIJO_ANTES).toContain('@')
    expect(evaluar('antes(x)', { [PREFIJO_ANTES + 'x']: 11, x: 99 })).toBe(11)
  })

  it('la fórmula se escribe y se lee igual', () => {
    expect(textoDe([{ t: 'antes', v: 'tiempo' }, op('-'), v('marca')])).toBe('antes(tiempo) - marca')
  })

  it('sobrevive a guardar y volver a leer', () => {
    const fila = JSON.parse(JSON.stringify(paraGuardar(conMejora(), 'x')))
    const vuelta = leerModelo(fila.modelo)
    expect(vuelta?.resultados[1].formula[0]).toEqual({ t: 'antes', v: 'tiempo' })
    expect(calcular(vuelta as TestLab, { marca: '174' }, { marca: '180' })[1].valor).toBe(6)
  })
})

describe('lo que antes() no deja hacer', () => {
  const con = (f: Bloq[], nombre = 'raro'): TestLab => {
    const t = conMejora()
    t.resultados.push({ nombre, unidad: '', formula: f })
    return t
  }

  it('no vale pedir el anterior de algo que no es un resultado', () => {
    expect(pegasDe(con([{ t: 'antes', v: 'marca' }])).some(p => /no es un resultado de este test/.test(p.texto))).toBe(true)
  })

  it('no vale pedirse a sí mismo el anterior', () => {
    const t = conMejora()
    t.resultados.push({ nombre: 'bucle', unidad: '', formula: [{ t: 'antes', v: 'bucle' }] })
    expect(pegasDe(t).some(p => /no puede pedirse a sí mismo/.test(p.texto))).toBe(true)
  })

  it('no vale el anterior del anterior', () => {
    expect(pegasDe(con([{ t: 'antes', v: 'mejora' }])).some(p => /el anterior del anterior/.test(p.texto))).toBe(true)
  })

  /* Una columna se calcula con lo de SU fila, y la fila equivalente del test
     pasado no existe: aquel día pudo hacer otro número de repeticiones. */
  it('no vale dentro de una columna calculada', () => {
    const t: TestLab = {
      nombre: 'x', deporte: 'Otro', sueltos: [],
      bloques: [{
        clave: 'b', etiqueta: 'b', modo: 'cerrado', veces: 3, duracion: 0,
        columnas: [
          col({ clave: 't', etiqueta: '' }),
          col({ clave: 'mal', etiqueta: '', clase: 'calculada', formula: [{ t: 'antes', v: 'z' }] }),
        ],
      }],
      resultados: [{ nombre: 'z', unidad: '', formula: [fnB('media', 't')] }],
    }
    expect(pegasDe(t).some(p => /no vale mirar al test anterior/.test(p.texto))).toBe(true)
  })

  it('«antes» está reservado como clave y como nombre de resultado', () => {
    const t = conMejora()
    t.sueltos.push(col({ clave: PALABRA_ANTES, etiqueta: '' }))
    expect(pegasDe(t).some(p => /está reservado/.test(p.texto))).toBe(true)

    const t2 = conMejora()
    t2.resultados[0].nombre = PALABRA_ANTES
    expect(pegasDe(t2).some(p => /está reservado/.test(p.texto))).toBe(true)
  })
})

describe('en el historial', () => {
  const mediciones = [
    { fecha: '2026-01-10', datos: { marca: '200' } },
    { fecha: '2026-03-10', datos: { marca: '190' } },
    { fecha: '2026-06-10', datos: { marca: '184' } },
  ]

  /* Cada medición se compara con la ANTERIOR EN FECHA, y la primera no tiene
     con qué: no pone punto, en vez de poner un cero que en la gráfica se vería
     como que aquel día no mejoró nada. */
  it('cada punto compara con el de antes, y el primero no dibuja', () => {
    const series = seriesDe(conMejora(), mediciones)
    const mejora = series.find(s => s.nombre === 'mejora')
    expect(mejora?.puntos.map(p => [p.fecha, p.valor])).toEqual([
      ['2026-03-10', 10],
      ['2026-06-10', 6],
    ])
  })

  it('las mediciones llegan desordenadas y se ordenan por fecha', () => {
    const revueltas = [mediciones[2], mediciones[0], mediciones[1]]
    const series = seriesDe(conMejora(), revueltas)
    expect(series.find(s => s.nombre === 'mejora')?.puntos.map(p => p.valor)).toEqual([10, 6])
  })
})

describe('un solo sitio decide a quién se le puede pedir el anterior', () => {
  /* LA PANTALLA Y LAS PEGAS SALEN DE LA MISMA FUNCIÓN. Si la lista que se
     ofrece y la que se acepta se calcularan por separado, un día ofrecería con
     dos clics algo que luego no se deja guardar, y sin decir por qué. */
  it('todo lo que se ofrece se puede guardar', () => {
    const t = conMejora()
    t.resultados.push({ nombre: 'ritmo', unidad: 's/km', formula: [v('marca')] })
    t.resultados.push({ nombre: 'otra', unidad: '', formula: [{ t: 'antes', v: 'ritmo' }] })

    t.resultados.forEach((_, i) => {
      for (const quien of previosParaAntes(t, i)) {
        const prueba = clon(t)
        prueba.resultados[i].formula = [{ t: 'antes', v: quien }]
        const malas = pegasDe(prueba).filter(p => p.donde === 'resultado' && p.indice === i)
        expect(malas, 'resultado ' + i + ' → antes(' + quien + ')').toEqual([])
      }
    })
  })

  it('no se ofrece a sí mismo ni a los que ya miran atrás', () => {
    const t = conMejora()
    expect(previosParaAntes(t, 1)).toEqual(['tiempo'])
    expect(previosParaAntes(t, 0)).toEqual([])
  })
})

describe('un resultado que ya no está', () => {
  /* Un test viejo puede llevar guardado un `antes()` de algo que después se
     borró. «No hay test anterior» mandaría a mirar donde no es. */
  it('dice que ya no es un resultado, y no que falte el test anterior', () => {
    const t = conMejora()
    t.resultados[1].formula = [{ t: 'antes', v: 'borrado' }]
    const vals = calcular(t, { marca: '174' }, { marca: '180' })
    expect(vals[1].error).toMatch(/ya no es un resultado/)
    expect(vals[1].error).not.toMatch(/no hay un test anterior/)
  })

  it('y sin test anterior sigue diciendo que no hay anterior', () => {
    const t = conMejora()
    t.resultados[1].formula = [{ t: 'antes', v: 'borrado' }]
    expect(calcular(t, { marca: '174' })[1].error).toMatch(/no hay un test anterior/)
  })
})
