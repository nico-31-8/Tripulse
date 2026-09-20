// La evolución de un test y quién puede gobernar zonas con él.
import { describe, it, expect } from 'vitest'
import { seriesDe, esInverso, conAncla } from './lab-series'
import { puedeFijarLab, propuestaLab } from './lab-zonas'
import { protoVacio, medVacia, type TestLab } from './lab-constructor'
import { plantillaPorId } from './lab-plantillas'
import type { Medicion } from './lab-guardar'

const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

const seis = (t: TestLab, fecha: string, tiempos: string[]): Medicion =>
  ({ fecha, datos: { ...protoVacio(t), ...medVacia(t), t100: tiempos } })

describe('cómo va con el tiempo', () => {
  const test = () => clon(plantillaPorId('reps')!.test)

  it('una línea por resultado, en orden de fecha', () => {
    const t = test()
    const s = seriesDe(t, [
      seis(t, '2026-03-01', ['80', '81', '82', '83', '84', '85']),
      seis(t, '2026-01-15', ['84', '85', '86', '87', '88', '89']),
    ])
    const total = s.find(x => x.nombre === 'total')!
    /* Aunque lleguen desordenadas, la línea va de la más vieja a la más nueva:
       dibujarla al revés enseñaría una mejora como un empeoramiento. */
    expect(total.puntos.map(p => p.fecha)).toEqual(['2026-01-15', '2026-03-01'])
    expect(total.puntos[0].valor).toBeCloseTo(519, 3)
    expect(total.puntos[1].valor).toBeCloseTo(495, 3)
  })

  /* El ritmo mejora BAJANDO y la velocidad mejora subiendo. Sin esto, cada
     mejora de un nadador se pintaría en rojo. */
  it('la flecha sabe hacia dónde se mejora', () => {
    const t = test()
    const s = seriesDe(t, [
      seis(t, '2026-01-15', ['84', '85', '86', '87', '88', '89']),
      seis(t, '2026-03-01', ['80', '81', '82', '83', '84', '85']),
    ])
    const total = s.find(x => x.nombre === 'total')!
    expect(total.delta).toBeCloseTo(-24, 3)
    expect(total.mejora).toBe(true)   // menos segundos es mejor
  })

  it('lo decide la unidad, y se puede corregir a mano', () => {
    expect(esInverso({ nombre: 'total', unidad: 's', formula: [] })).toBe(true)
    expect(esInverso({ nombre: 'vam', unidad: 'km/h', formula: [] })).toBe(false)
    /* Y lo que diga el entrenador manda sobre la unidad. */
    expect(esInverso({ nombre: 'vam', unidad: 'km/h', formula: [], inverso: true })).toBe(true)
  })

  /* Una medición a la que le falta algo NO pone punto, en vez de poner un cero
     que se dibujaría como una caída en picado. */
  it('una medición incompleta no rompe la línea: se salta', () => {
    const t = test()
    const s = seriesDe(t, [
      seis(t, '2026-01-15', ['84', '85', '86', '87', '88', '89']),
      seis(t, '2026-02-01', ['84', '85', '', '', '', '']),
      seis(t, '2026-03-01', ['80', '81', '82', '83', '84', '85']),
    ])
    const total = s.find(x => x.nombre === 'total')!
    expect(total.puntos.map(p => p.fecha)).toEqual(['2026-01-15', '2026-03-01'])
  })

  it('con una sola medición no hay tendencia que enseñar', () => {
    const t = test()
    const s = seriesDe(t, [seis(t, '2026-01-15', ['84', '85', '86', '87', '88', '89'])])
    expect(s[0].delta).toBeNull()
    expect(s[0].mejora).toBeNull()
  })

  it('un resultado sin gráfica no sale', () => {
    const t = test()
    t.resultados[0].graf = false
    expect(seriesDe(t, []).map(s => s.nombre)).not.toContain('total')
  })

  /* Si la recta de un perfil no ajustaba, eso tiene que seguir dicho junto al
     último punto: el número ya está dibujado y con aspecto de dato firme. */
  it('los avisos del último punto viajan con la serie', () => {
    const t = clon(plantillaPorId('perfil')!.test)
    const base = { ...protoVacio(t), ...medVacia(t) }
    const s = seriesDe(t, [{ fecha: '2026-01-01', datos: { ...base, vel: ['8', '2', '7', '1'] } }])
    const v0 = s.find(x => x.nombre === 'v0')!
    expect(v0.avisos.join(' ')).toMatch(/no caen bien en una recta/)
  })
})

describe('qué resultado puede gobernar las zonas', () => {
  it('la VAM de un Montreal sí, porque es un VO₂máx en km/h', () => {
    const t = clon(plantillaPorId('vam')!.test)
    const vam = t.resultados.find(r => r.nombre === 'vam')!
    expect(puedeFijarLab(t.deporte, vam).motivo).toBeNull()
    expect(puedeFijarLab(t.deporte, vam).destino?.columna).toBe('vam')
  })

  /* La restricción que más duele, y por eso se explica: la casilla de carrera
     guarda una VAM, que es un VO₂máx. Un umbral metido ahí bajaría TODAS sus
     zonas sin que nada fallara. */
  it('un umbral de carrera NO, y dice por qué', () => {
    const t = clon(plantillaPorId('lactato')!.test)
    const u = t.resultados.find(r => r.nombre === 'umbral_4')!
    const v = puedeFijarLab(t.deporte, u)
    expect(v.destino).toBeNull()
    expect(v.motivo).toMatch(/mide otra cosa/)
  })

  it('una marca tuya vale para TUS zonas, no para la casilla de la app', () => {
    const t = clon(plantillaPorId('reps')!.test)
    const m = t.resultados.find(r => r.nombre === 'media100')!
    const v = puedeFijarLab(t.deporte, m)
    expect(v.destino).toBeNull()
    expect(v.motivo).toMatch(/colgarle TUS zonas/)
  })

  it('una unidad que no se reconoce se rechaza en vez de adivinarla', () => {
    const t = clon(plantillaPorId('vam')!.test)
    const vam = t.resultados.find(r => r.nombre === 'vam')!
    vam.unidad = 'parsecs por hora'
    expect(puedeFijarLab(t.deporte, vam).motivo).toMatch(/No se reconoce la unidad/)
  })

  it('un resultado sin ancla no gobierna nada', () => {
    const t = clon(plantillaPorId('vam')!.test)
    expect(conAncla(t).map(x => x.r.nombre)).toEqual(['vam'])
    expect(puedeFijarLab(t.deporte, t.resultados[0]).destino).toBeNull()
  })
})

describe('la propuesta que se guardaría', () => {
  it('sale del MISMO cálculo que ve el entrenador en pantalla', () => {
    const t = clon(plantillaPorId('vam')!.test)
    const i = t.resultados.findIndex(r => r.nombre === 'vam')
    const datos = { ...protoVacio(t), ...medVacia(t), '@esc': 9, aguanto: '40' }
    const p = propuestaLab(t, i, datos)!
    expect(p).not.toBeNull()
    expect(p.valor).toBeCloseTo(12.33, 1)
    expect(p.destino.columna).toBe('vam')
    /* Estimado a propósito: una fórmula que se monta el entrenador no tiene
       detrás la validación de los tests del catálogo. */
    expect(p.aporte.estimado).toBe(true)
  })

  it('sin número no hay propuesta', () => {
    const t = clon(plantillaPorId('vam')!.test)
    const i = t.resultados.findIndex(r => r.nombre === 'vam')
    /* Sin marcar hasta dónde llegó, la VAM no se calcula: no puede proponerse
       un valor que no existe. */
    expect(propuestaLab(t, i, { ...protoVacio(t), ...medVacia(t) })).toBeNull()
  })

  it('un resultado que no puede fijar tampoco propone', () => {
    const t = clon(plantillaPorId('lactato')!.test)
    const i = t.resultados.findIndex(r => r.nombre === 'umbral_4')
    const datos = { ...protoVacio(t), ...medVacia(t), '@esc': 4, lactato: ['1.1', '1.6', '2.9', '5.2', '', '', '', '', '', '', '', ''] }
    expect(propuestaLab(t, i, datos)).toBeNull()
  })
})
