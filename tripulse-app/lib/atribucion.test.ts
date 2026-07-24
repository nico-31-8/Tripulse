import { describe, it, expect } from 'vitest'
import { expandirEnBloques, porDisciplina, type SesionAtribuible, type TareaAtribuible } from './atribucion'

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
