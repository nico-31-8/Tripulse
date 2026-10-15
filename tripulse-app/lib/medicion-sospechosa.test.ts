import { describe, it, expect } from 'vitest'
import { distanciaSospechosa, valorCanonico } from './medicion'

// ============================================================
// Una distancia por serie que no se entrena nunca
// ============================================================
// El caso real (15-10-2026): «4 × 1.000.000 m» de carrera. Se quería poner
// 4 × 1.000 m, se guardó sin que nada dijera nada, le llegó así al atleta y la
// barra de carga de su semana se fue a 134.359. Ahora el editor pregunta.
describe('distanciaSospechosa', () => {
  it('el caso que lo trajo: 4 × 1.000 km de carrera se pregunta', () => {
    const duda = distanciaSospechosa('Carrera', 1_000_000, 4)
    // En español, cuatro cifras van sin punto: «1000», no «1.000».
    expect(duda).toMatch(/«4 × 1000 km» de carrera/)
    expect(duda).toMatch(/unidad o los ceros/)
  })

  /* La trampa más probable: la unidad «km» con un 1000 detrás. */
  it('«km» con 1000 detrás es lo mismo, y también se pregunta', () => {
    expect(distanciaSospechosa('Carrera', valorCanonico('km', '1000'), 1)).toMatch(/«1000 km»/)
  })

  it('lo normal no se pregunta: un fondo de 35 km, un 1.500 de natación, una tirada de 180 km', () => {
    expect(distanciaSospechosa('Carrera', 35_000, 1)).toBeNull()
    expect(distanciaSospechosa('Natacion', 1_500, 4)).toBeNull()
    expect(distanciaSospechosa('Ciclismo', 180_000, 1)).toBeNull()
  })

  it('cada deporte tiene su tope: lo que es mucho nadando no lo es en bici', () => {
    expect(distanciaSospechosa('Natación', 16_000, 1)).toMatch(/de natación/)   // con tilde también
    expect(distanciaSospechosa('Ciclismo', 16_000, 1)).toBeNull()
    expect(distanciaSospechosa('Ciclismo', 500_000, 1)).toMatch(/de bici/)
  })

  it('un deporte sin tope propio usa el general (100 km)', () => {
    expect(distanciaSospechosa('Remo', 50_000, 1)).toBeNull()
    expect(distanciaSospechosa('Remo', 150_000, 1)).toMatch(/150 km/)
  })

  it('sin distancia o con basura, no pregunta', () => {
    expect(distanciaSospechosa('Carrera', 0, 1)).toBeNull()
    expect(distanciaSospechosa('Carrera', NaN, 1)).toBeNull()
    expect(distanciaSospechosa(null, 0)).toBeNull()
  })
})
