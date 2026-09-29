import { describe, it, expect } from 'vitest'
import { expandirEnBloques, porDisciplina, metrosDeDisciplina, type SesionAtribuible, type TareaAtribuible } from './atribucion'

const ses = (o: Partial<SesionAtribuible> = {}): SesionAtribuible => ({
  id: 1, fecha_sesion: '2026-07-01', duracion_minutos: 100, rpe_estimado: 6, ...o,
})
const tar = (o: Partial<TareaAtribuible>): TareaAtribuible => ({ id_sesion: 1, ...o })
const brickTareas = () => [
  tar({ orden: 1, disciplina: 'Ciclismo' }),
  tar({ orden: 2, disciplina: 'Carrera' }),
]
const sumUA = (bs: { ua: number }[]) => bs.reduce((a, b) => a + b.ua, 0)
const sumMin = (bs: { minutos: number }[]) => bs.reduce((a, b) => a + b.minutos, 0)

describe('expandirEnBloques — sesión normal', () => {
  it('una sesión de un deporte → 1 bloque con toda la UA (rpe × minutos)', () => {
    const bloques = expandirEnBloques([ses()], [tar({ orden: 1, disciplina: 'Carrera' })])
    expect(bloques).toHaveLength(1)
    expect(bloques[0].esBrick).toBe(false)
    expect(bloques[0].minutos).toBe(100)
    expect(bloques[0].ua).toBe(600)
  })
})

describe('expandirEnBloques — brick (invariantes)', () => {
  it('sin transición: Σminutos y ΣUA = los de la sesión', () => {
    const bloques = expandirEnBloques([ses()], brickTareas())
    expect(bloques).toHaveLength(2)
    expect(bloques.every(b => b.esBrick)).toBe(true)
    expect(sumMin(bloques)).toBe(100)
    expect(sumUA(bloques)).toBeCloseTo(600, 5)
  })

  it('con transición: el bloque posterior encarece (×factor), los minutos NO cambian', () => {
    const s = ses({ transiciones: [{ despues_de: 1, segundos: 90 }] })
    const bloques = expandirEnBloques([s], brickTareas())
    const bici = bloques.find(b => b.disciplina === 'Ciclismo')!
    const carrera = bloques.find(b => b.disciplina === 'Carrera')!
    expect(carrera.trasTransicion).toBe(true)
    expect(bici.trasTransicion).toBe(false)
    expect(carrera.ua).toBeGreaterThan(bici.ua)
    expect(sumMin(bloques)).toBe(100)      // la transición encarece, no alarga
    expect(sumUA(bloques)).toBeGreaterThan(600)
  })

  it('concatenacion:false ignora el sobrecoste de la transición', () => {
    const s = ses({ transiciones: [{ despues_de: 1, segundos: 90 }] })
    const bloques = expandirEnBloques([s], brickTareas(), { concatenacion: false })
    expect(sumUA(bloques)).toBeCloseTo(600, 5)
  })

  it('con RPE reportado del bloque usa ese RPE y NO aplica factor (evita doble conteo)', () => {
    const s = ses({ transiciones: [{ despues_de: 1, segundos: 90 }] })
    const tareas = [
      tar({ orden: 1, disciplina: 'Ciclismo' }),
      tar({ orden: 2, disciplina: 'Carrera', rpe_reportado: 8 }),
    ]
    const bloques = expandirEnBloques([s], tareas, { usarRpeDeBloque: true })
    const carrera = bloques.find(b => b.disciplina === 'Carrera')!
    expect(carrera.rpe).toBe(8)
    expect(carrera.ua).toBe(8 * 50) // 50 min · factor 1 porque el RPE ya lleva el coste
  })
})

describe('porDisciplina', () => {
  it('reparte un brick entre sus deportes reales, sin bucket "Brick"', () => {
    const pd = porDisciplina(expandirEnBloques([ses()], brickTareas()))
    expect(Object.keys(pd).sort()).toEqual(['Carrera', 'Ciclismo'])
    expect(pd['Brick']).toBeUndefined()
    expect(pd['Ciclismo'].minutos).toBe(50)
    expect(pd['Carrera'].minutos).toBe(50)
  })
})

// ============================================================
// Los metros de cada bloque
// ============================================================
//
// Nacieron para el material —unas zapatillas suman los kilómetros de carrera y
// una bici los de ciclismo—, pero lo que resuelven es más general: hasta ahora
// nadie podía pedir los kilómetros por deporte, y en un brick no se pueden sacar
// de la sesión, que pone 'Brick'.
describe('los metros, por bloque', () => {
  const conDistancia = (o: Partial<TareaAtribuible>, metros: number, reales?: number) =>
    tar({ ...o, p_distancia: [{ metros_planeados: metros, ...(reales != null ? { metros_reales: reales } : {}) }] })

  it('los metros van por serie: 6 × 400 son 2.400', () => {
    const b = expandirEnBloques([ses()], [conDistancia({ orden: 1, disciplina: 'Carrera', series: 6 }, 400)])
    expect(b[0].metros).toBe(2400)
  })

  it('sin series, los de una', () => {
    const b = expandirEnBloques([ses()], [conDistancia({ orden: 1, disciplina: 'Carrera' }, 10000)])
    expect(b[0].metros).toBe(10000)
  })

  /* Para unas zapatillas cuenta lo que corrió, no lo que le mandaron correr. */
  it('lo REAL manda sobre lo planeado', () => {
    const b = expandirEnBloques([ses()], [conDistancia({ orden: 1, disciplina: 'Carrera' }, 10000, 10800)])
    expect(b[0].metros).toBe(10800)
  })

  it('sin distancia, cero y no NaN', () => {
    const b = expandirEnBloques([ses()], [tar({ orden: 1, disciplina: 'Carrera' })])
    expect(b[0].metros).toBe(0)
    expect(Number.isFinite(b[0].metros)).toBe(true)
  })

  it('una sesión sin tareas no tiene metros que repartir', () => {
    const b = expandirEnBloques([ses({ disciplina: 'Carrera' })], [])
    expect(b[0].metros).toBe(0)
  })

  /* EL CASO QUE LO MOTIVA TODO. Un brick de 40 km de bici y 10 de carrera: la
     bici se queda 40 y las zapatillas 10, nunca los 50. */
  it('un brick reparte sus metros por deporte', () => {
    const bloques = expandirEnBloques([ses()], [
      conDistancia({ orden: 1, disciplina: 'Ciclismo' }, 40000),
      conDistancia({ orden: 2, disciplina: 'Carrera' }, 10000),
    ])
    expect(metrosDeDisciplina(bloques, 'Ciclismo')).toBe(40000)
    expect(metrosDeDisciplina(bloques, 'Carrera')).toBe(10000)
    /* Y nadie se queda con los 50. */
    expect(metrosDeDisciplina(bloques, 'Natacion')).toBe(0)
  })

  it('da igual cómo venga escrita la disciplina', () => {
    const bloques = expandirEnBloques([ses()], [conDistancia({ orden: 1, disciplina: 'Carrera' }, 10000)])
    expect(metrosDeDisciplina(bloques, 'carrera')).toBe(10000)
  })

  it('porDisciplina también los suma', () => {
    const bloques = expandirEnBloques([ses()], [
      conDistancia({ orden: 1, disciplina: 'Ciclismo' }, 40000),
      conDistancia({ orden: 2, disciplina: 'Carrera' }, 10000),
    ])
    const p = porDisciplina(bloques)
    expect(p['Ciclismo'].metros).toBe(40000)
    expect(p['Carrera'].metros).toBe(10000)
  })

  /* Y lo de siempre sigue en su sitio: añadir los metros no puede mover ni los
     minutos ni la UA, que es lo que alimenta la carga de toda la app. */
  it('los minutos y la UA no se mueven por esto', () => {
    const bloques = expandirEnBloques([ses()], [
      conDistancia({ orden: 1, disciplina: 'Ciclismo' }, 40000),
      conDistancia({ orden: 2, disciplina: 'Carrera' }, 10000),
    ])
    expect(sumMin(bloques)).toBe(100)
    expect(sumUA(bloques)).toBeCloseTo(600, 5)
  })
})
