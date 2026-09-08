import { describe, it, expect } from 'vitest'
import {
  ANCLA_QUE_CABE, UNIDADES_OK, conversionA, puedeFijar, propuestaPropia, origenDe,
} from './ancla-propia'
import type { DefinicionTest, ResultadoTest } from './test-definicion'
import type { Bloque } from './formula'

const v = (n: string): Bloque => ({ t: 'var', v: n })
const op = (o: string): Bloque => ({ t: 'op', v: o })
const num = (n: number): Bloque => ({ t: 'num', v: n })

const res = (extra: Partial<ResultadoTest> = {}): ResultadoTest => ({
  nombre: 'VAM', unidad: 'km/h', ancla: 'vo2max',
  formula: [v('metros'), op('/'), num(200)], graf: true, ...extra,
})

const def = (deporte: string, ...resultados: ResultadoTest[]): DefinicionTest => ({
  nombre: 'Test', deporte,
  campos: [{ clave: 'metros', etiqueta: 'Metros' }, { clave: 'vatios', etiqueta: 'Vatios' }],
  resultados,
})

describe('qué ancla cabe en cada deporte', () => {
  /* Solo hay TRES columnas de ancla en la base, una por deporte, y cada una
     guarda una magnitud concreta. De ahí que solo quepa una por deporte. */
  it('carrera guarda un VO₂máx; bici y natación, un umbral', () => {
    expect(ANCLA_QUE_CABE.Carrera).toBe('vo2max')
    expect(ANCLA_QUE_CABE.Ciclismo).toBe('umbral')
    expect(ANCLA_QUE_CABE.Natacion).toBe('umbral')
  })
})

describe('las unidades', () => {
  it('carrera acepta km/h tal cual y convierte los m/s', () => {
    expect(conversionA('vam', 'km/h')!(16)).toBe(16)
    expect(conversionA('vam', 'm/s')!(4.44)).toBeCloseTo(15.98, 2)
  })

  it('ciclismo, vatios y redondea', () => {
    expect(conversionA('ftp', 'W')!(247.6)).toBe(248)
    expect(conversionA('ftp', 'vatios')!(250)).toBe(250)
  })

  it('natación guarda m/s, y los s/100m SE INVIERTEN', () => {
    // A más segundos, menos velocidad. Sin invertir, un 85 se guardaría como
    // 85 m/s y las zonas de ese nadador saldrían absurdas.
    expect(conversionA('css', 'm/s')!(1.18)).toBe(1.18)
    expect(conversionA('css', 's/100m')!(85)).toBeCloseTo(1.176, 3)
  })

  it('da igual mayúsculas y espacios', () => {
    expect(conversionA('vam', ' KM/H ')).not.toBeNull()
    expect(conversionA('ftp', 'Watts')).not.toBeNull()
  })

  it('LO QUE NO SE RECONOCE NO SE CONVIERTE, y por tanto no se ofrece', () => {
    // Adivinar aquí es lo que deja una VAM de 4,3 km/h en la base sin que nada
    // falle. Mejor no ofrecer el botón.
    expect(conversionA('vam', 'ppm')).toBeNull()
    expect(conversionA('vam', '')).toBeNull()
    expect(conversionA('ftp', 'km/h')).toBeNull()
    expect(conversionA('css', 'ppm')).toBeNull()
  })
})

describe('si un resultado puede fijar las zonas', () => {
  it('un VO₂máx en carrera, en km/h: sí', () => {
    const r = puedeFijar('Carrera', res())
    expect(r.motivo).toBeNull()
    expect(r.destino?.columna).toBe('vam')
  })

  it('un umbral en bici, en vatios: sí', () => {
    const r = puedeFijar('Ciclismo', res({ nombre: 'FTP', unidad: 'W', ancla: 'umbral' }))
    expect(r.motivo).toBeNull()
    expect(r.destino?.columna).toBe('ftp')
  })

  it('UN UMBRAL EN CARRERA NO CABE, y se explica por qué', () => {
    /* Es el caso que más va a pasar. La columna de carrera guarda la VAM, que es
       otra velocidad: meter ahí un ritmo umbral bajaría TODAS sus zonas sin que
       nada fallara. Es la misma regla que ya excluye al T30 en los de serie. */
    const r = puedeFijar('Carrera', res({ ancla: 'umbral' }))
    expect(r.motivo).toContain('VAM')
    expect(r.motivo).toContain('otra cosa')
    expect(r.destino).toBeNull()
  })

  it('un VO₂máx en bici tampoco: esa columna guarda un umbral', () => {
    expect(puedeFijar('Ciclismo', res({ ancla: 'vo2max', unidad: 'W' })).motivo).toContain('umbral')
  })

  it('lo que es solo seguimiento, ni se plantea', () => {
    expect(puedeFijar('Carrera', res({ ancla: 'nada' })).motivo).toContain('seguimiento')
  })

  it('UNA MARCA SUYA NO OCUPA LA CASILLA DE LA APP, y se dice sin desanimar', () => {
    /* Un 1:13 el 100 es una referencia buenísima para colgarle SUS zonas. Lo
       que no es, es un CSS. El mensaje tiene que dejar claras las dos cosas: si
       solo dijera «no vale», el entrenador pensaría que su marca no sirve. */
    const m = puedeFijar('Natacion', res({ ancla: 'especifica', unidad: 'm/s' })).motivo!
    expect(m).toContain('TUS zonas')
    expect(m).toContain('CSS')
  })

  it('el umbral aeróbico y la velocidad máxima no tienen dónde guardarse', () => {
    // Son referencias de verdad, pero la base no tiene columna para ellas.
    expect(puedeFijar('Carrera', res({ ancla: 'umbral_aer' })).destino).toBeNull()
    expect(puedeFijar('Carrera', res({ ancla: 'sprint' })).destino).toBeNull()
  })

  it('una unidad rara se rechaza diciendo cuáles valen', () => {
    const r = puedeFijar('Carrera', res({ unidad: 'ppm' }))
    expect(r.motivo).toContain('ppm')
    expect(r.motivo).toContain(UNIDADES_OK.Carrera)
  })

  it('un deporte sin zonas se dice y ya', () => {
    expect(puedeFijar('Fuerza', res()).motivo).toContain('carrera, ciclismo o natación')
  })

  it('«Natación» con tilde cuenta igual que «Natacion»', () => {
    expect(puedeFijar('Natación', res({ ancla: 'umbral', unidad: 'm/s' })).destino?.columna).toBe('css')
  })
})

describe('la propuesta', () => {
  const cooper = def('Carrera', res())

  it('sale el número ya convertido y en la unidad de la columna', () => {
    const p = propuestaPropia(cooper, 0, { metros: 3200 })
    expect(p?.valor).toBe(16)
    expect(p?.texto).toBe('16 km/h')
    expect(p?.destino.tabla).toBe('test1_carrera')
  })

  it('SE CALCULA CON LAS MISMAS CUENTAS QUE VE EL ENTRENADOR', () => {
    // Si se repitiera la fórmula aquí, un día cambiaría en un sitio y no en el
    // otro, y el botón guardaría algo distinto de lo que enseña la pantalla.
    const otro = def('Carrera', res({ formula: [v('metros'), op('/'), num(100)] }))
    expect(propuestaPropia(otro, 0, { metros: 3200 })?.valor).toBe(32)
  })

  it('en m/s se convierte antes de guardar', () => {
    const enMs = def('Carrera', res({ unidad: 'm/s', formula: [v('metros'), op('/'), num(720)] }))
    // 3200 / 720 = 4,44 m/s → 16 km/h
    expect(propuestaPropia(enMs, 0, { metros: 3200 })?.valor).toBeCloseTo(16, 1)
  })

  it('se marca como ESTIMADO: una fórmula propia no está validada', () => {
    expect(propuestaPropia(cooper, 0, { metros: 3200 })?.aporte.estimado).toBe(true)
  })

  it('sin número no hay propuesta', () => {
    expect(propuestaPropia(cooper, 0, {})).toBeNull()
    expect(propuestaPropia(cooper, 0, { metros: null })).toBeNull()
  })

  it('un resultado que no puede fijar no propone nada', () => {
    const conUmbral = def('Carrera', res({ ancla: 'umbral' }))
    expect(propuestaPropia(conUmbral, 0, { metros: 3200 })).toBeNull()
  })

  it('un valor de cero o negativo no se guarda', () => {
    const raro = def('Carrera', res({ formula: [v('metros'), op('*'), num(0)] }))
    expect(propuestaPropia(raro, 0, { metros: 3200 })).toBeNull()
  })

  it('un índice que no existe no revienta', () => {
    expect(propuestaPropia(cooper, 9, { metros: 3200 })).toBeNull()
  })

  it('el segundo resultado también puede ser el que fija', () => {
    const dos = def('Ciclismo',
      res({ nombre: 'pico', unidad: 'W', ancla: 'nada', formula: [v('vatios')] }),
      res({ nombre: 'FTP', unidad: 'W', ancla: 'umbral', formula: [v('vatios'), op('*'), num(0.75)] }))
    const p = propuestaPropia(dos, 1, { vatios: 400 })
    expect(p?.valor).toBe(300)
    expect(propuestaPropia(dos, 0, { vatios: 400 })).toBeNull()
  })
})

describe('de dónde salió el número', () => {
  it('se apunta el id del test, no su nombre', () => {
    // Los nombres se cambian: dentro de dos meses «Cooper» puede ser otro test.
    expect(origenDe(7)).toBe('propio:7')
  })
})
