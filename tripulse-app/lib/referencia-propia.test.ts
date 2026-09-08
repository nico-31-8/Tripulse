import { describe, it, expect } from 'vitest'
import {
  mismaRef, mismoDeporte, opcionesDeRef, buscarOpcion, valorDe,
  aplicarPct, tramoDe, leerValor,
  type TestConMediciones, type ValorRef,
} from './referencia-propia'
import type { DefinicionTest, Medicion, ResultadoTest } from './test-definicion'
import type { Bloque } from './formula'

const v = (n: string): Bloque => ({ t: 'var', v: n })
const op = (o: string): Bloque => ({ t: 'op', v: o })
const num = (n: number): Bloque => ({ t: 'num', v: n })

const r = (extra: Partial<ResultadoTest> = {}): ResultadoTest => ({
  nombre: 'ritmo100', unidad: 's/100m', ancla: 'especifica',
  formula: [v('segundos'), op('/'), num(6)], graf: true, ...extra,
})

const def = (deporte: string, ...resultados: ResultadoTest[]): DefinicionTest => ({
  nombre: '6×100', deporte,
  campos: [{ clave: 'segundos', etiqueta: 'Segundos totales' }, { clave: 'otro', etiqueta: 'Otro' }],
  resultados,
})

const test = (extra: Partial<TestConMediciones> = {}): TestConMediciones => ({
  id: 1, nombre: '6×100', deporte: 'Natacion', def: def('Natacion', r()),
  mediciones: [], ...extra,
})

const med = (fecha: string, datos: Record<string, unknown>): Medicion => ({ fecha, datos })

describe('qué referencias se le pueden colgar a una zona', () => {
  const nat = test()
  const carr = test({ id: 2, nombre: 'Cooper', deporte: 'Carrera',
    def: def('Carrera', r({ nombre: 'VAM', unidad: 'km/h', ancla: 'vo2max' })) })

  it('las del mismo deporte, y solo esas', () => {
    const o = opcionesDeRef([nat, carr], 'Natacion')
    expect(o.map(x => x.etiqueta)).toEqual(['6×100 · ritmo100'])
  })

  it('UNA ZONA DE NATACIÓN NO PUEDE COLGARSE DE UN NÚMERO DE CARRERA', () => {
    /* Daría un ritmo de piscina salido de una velocidad de asfalto. No hay
       ningún caso en que eso fuera lo que se quería. */
    expect(opcionesDeRef([carr], 'Natacion')).toHaveLength(0)
    expect(opcionesDeRef([nat], 'Ciclismo')).toHaveLength(0)
  })

  it('«Natación» con tilde es el mismo deporte que «Natacion»', () => {
    expect(mismoDeporte('Natación', 'Natacion')).toBe(true)
    expect(mismoDeporte('Carrera', 'Ciclismo')).toBe(false)
  })

  it('los de solo seguimiento no se ofrecen', () => {
    const solo = test({ def: def('Natacion', r({ ancla: 'nada' })) })
    expect(opcionesDeRef([solo], 'Natacion')).toHaveLength(0)
  })

  it('un test con varios resultados ofrece cada uno por separado', () => {
    const dos = test({ def: def('Natacion', r(), r({ nombre: 'v100', unidad: 'm/s', ancla: 'umbral' })) })
    const o = opcionesDeRef([dos], 'Natacion')
    expect(o.map(x => x.ref.indice)).toEqual([0, 1])
  })

  it('se reconoce la que ya tenía guardada', () => {
    const o = opcionesDeRef([nat], 'Natacion')
    expect(buscarOpcion(o, { idDefinicion: 1, indice: 0 })?.etiqueta).toBe('6×100 · ritmo100')
    expect(buscarOpcion(o, { idDefinicion: 9, indice: 0 })).toBeNull()
    expect(buscarOpcion(o, null)).toBeNull()
  })

  it('mismaRef no confunde dos resultados del mismo test', () => {
    expect(mismaRef({ idDefinicion: 1, indice: 0 }, { idDefinicion: 1, indice: 1 })).toBe(false)
    expect(mismaRef({ idDefinicion: 1, indice: 0 }, { idDefinicion: 1, indice: 0 })).toBe(true)
    expect(mismaRef(null, null)).toBe(false)
  })
})

describe('cuánto vale la referencia de un atleta', () => {
  it('sale de la última medición', () => {
    const t = test({ mediciones: [
      med('2026-03-01', { segundos: 480 }),
      med('2026-09-01', { segundos: 438 }),
    ] })
    const val = valorDe(t, 0)!
    expect(val.valor).toBe(73)
    expect(val.fecha).toBe('2026-09-01')
  })

  it('da igual el orden en que vengan', () => {
    const t = test({ mediciones: [
      med('2026-09-01', { segundos: 438 }),
      med('2026-03-01', { segundos: 480 }),
    ] })
    expect(valorDe(t, 0)!.valor).toBe(73)
  })

  it('SE SALTA UNA MEDICIÓN DE LA QUE NO SALE ESTE RESULTADO, y dice de cuándo es', () => {
    /* Un test de varios resultados puede tener un día en que solo se rellenó
       parte. Dejar la zona sin referencia teniendo la del mes pasado no ayuda a
       nadie; lo que no se puede es esconder la fecha. */
    const t = test({ mediciones: [
      med('2026-09-01', { otro: 5 }),
      med('2026-03-01', { segundos: 480 }),
    ] })
    const val = valorDe(t, 0)!
    expect(val.valor).toBe(80)
    expect(val.fecha).toBe('2026-03-01')
  })

  it('sin mediciones no hay referencia', () => {
    expect(valorDe(test(), 0)).toBeNull()
  })

  it('un cero o un negativo no son una referencia', () => {
    expect(valorDe(test({ mediciones: [med('2026-09-01', { segundos: 0 })] }), 0)).toBeNull()
  })

  it('un resultado de solo seguimiento no vale como referencia', () => {
    const t = test({ def: def('Natacion', r({ ancla: 'nada' })), mediciones: [med('2026-09-01', { segundos: 438 })] })
    expect(valorDe(t, 0)).toBeNull()
  })

  it('un índice que no existe no revienta', () => {
    expect(valorDe(test({ mediciones: [med('2026-09-01', { segundos: 438 })] }), 7)).toBeNull()
  })

  it('SE RECALCULA CON LA FÓRMULA DE HOY, no se guarda el resultado', () => {
    // Corregir la fórmula corrige el historial entero. Es la propiedad que
    // tiene todo esto desde el principio y aquí no se pierde.
    const t = test({
      def: def('Natacion', r({ formula: [v('segundos'), op('/'), num(4)] })),
      mediciones: [med('2026-09-01', { segundos: 438 })],
    })
    expect(valorDe(t, 0)!.valor).toBe(109.5)
  })

  it('la unidad decide el sentido, y el entrenador puede corregirlo', () => {
    const t = (extra: Partial<ResultadoTest>) =>
      test({ def: def('Natacion', r(extra)), mediciones: [med('2026-09-01', { segundos: 438 })] })
    expect(valorDe(t({}), 0)!.inverso).toBe(true)
    expect(valorDe(t({ nombre: 'v', unidad: 'm/s' }), 0)!.inverso).toBe(false)
    expect(valorDe(t({ inverso: false }), 0)!.inverso).toBe(false)
  })
})

describe('el porcentaje', () => {
  it('en una unidad normal, es multiplicar', () => {
    expect(aplicarPct(16, 95, false)).toBeCloseTo(15.2, 5)
  })

  it('EN UNA DE TIEMPO ES DIVIDIR: el 95 % de 1:13 es más LENTO', () => {
    /* Es el fallo que no se ve. Multiplicando saldría 69,4 s —más rápido que la
       referencia— y el nadador estaría haciendo su zona suave por encima de su
       marca, con la app tan tranquila. */
    expect(aplicarPct(73, 95, true)).toBeCloseTo(76.84, 2)
    expect(aplicarPct(73, 105, true)).toBeCloseTo(69.52, 2)
    expect(aplicarPct(73, 100, true)).toBe(73)
  })

  it('al 100 % no cambia nada, en los dos sentidos', () => {
    expect(aplicarPct(16, 100, false)).toBe(16)
    expect(aplicarPct(73, 100, true)).toBe(73)
  })

  it('un porcentaje de cero no divide entre cero', () => {
    expect(aplicarPct(73, 0, true)).toBeNull()
    expect(aplicarPct(73, -5, true)).toBeNull()
  })

  it('sin referencia no hay número', () => {
    expect(aplicarPct(0, 95, false)).toBeNull()
    expect(aplicarPct(NaN, 95, false)).toBeNull()
  })
})

describe('el tramo de una zona', () => {
  const ritmo: ValorRef = { nombre: 'ritmo100', unidad: 's/100m', valor: 73, inverso: true, fecha: '2026-09-01' }
  const vel: ValorRef = { nombre: 'VAM', unidad: 'km/h', valor: 16, inverso: false, fecha: '2026-09-01' }

  it('en velocidad, el % bajo da el número bajo', () => {
    const t = tramoDe(vel, 82, 88)!
    expect(t.desde).toBeCloseTo(13.12, 2)
    expect(t.hasta).toBeCloseTo(14.08, 2)
  })

  it('EN TIEMPO, EL % BAJO DA EL NÚMERO ALTO, y está bien', () => {
    /* «desde» es el del % más bajo, no el menor de los dos. Se lee «1:17 – 1:13»,
       de lento a rápido, que es como la app ya enseña las zonas de carrera. */
    const t = tramoDe(ritmo, 95, 100)!
    expect(t.desde).toBeCloseTo(76.84, 2)
    expect(t.hasta).toBe(73)
    expect(t.desde).toBeGreaterThan(t.hasta)
  })

  it('un tramo imposible no se inventa', () => {
    expect(tramoDe({ ...vel, valor: 0 }, 82, 88)).toBeNull()
    expect(tramoDe(vel, 0, 88)).toBeNull()
  })
})

describe('cómo se lee un número', () => {
  it('con su unidad tal como la escribió el entrenador', () => {
    expect(leerValor(76.843, 's/100m')).toBe('76,84 s/100m')
    expect(leerValor(16, 'km/h')).toBe('16 km/h')
  })

  it('NO SE INTENTA CONVERTIR 73 EN «1:13»', () => {
    // La unidad es texto libre: interpretarla para adornarla es justo el paso
    // donde se cuelan los números que mienten.
    expect(leerValor(73, 's/100m')).toBe('73 s/100m')
  })

  it('sin unidad, solo el número', () => {
    expect(leerValor(73, '')).toBe('73')
  })
})
