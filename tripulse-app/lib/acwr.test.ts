import { describe, it, expect } from 'vitest'
import { calcularACWR, estadoACWR, escalaACWRTexto, progresionACWR, UMBRALES_ACWR } from './panel-metricas'

const serie = (cargas: number[]) => cargas.map(carga => ({ carga }))

describe('calcular el ACWR', () => {
  /* Con menos de cinco semanas el denominador no significa nada. Devolver un 1,0
     tranquilizador sería peor que decir que no se sabe. */
  it('sin historia suficiente devuelve null, no un número tranquilizador', () => {
    expect(calcularACWR(serie(Array(7).fill(100)))).toBeNull()
    expect(calcularACWR([])).toBeNull()
  })

  it('carga estable da un ratio de 1', () => {
    // 35 días a 100: la semana aguda suma 700 y la media crónica también.
    expect(calcularACWR(serie(Array(35).fill(100)))).toBe(1)
  })

  it('doblar la última semana dispara el ratio', () => {
    const s = serie([...Array(28).fill(100), ...Array(7).fill(200)])
    const acwr = calcularACWR(s)!
    expect(acwr).toBeGreaterThan(UMBRALES_ACWR.precaucion)
    expect(estadoACWR(acwr).nivel).toBe('peligro')
  })

  it('parar una semana lo hunde a subcarga', () => {
    const s = serie([...Array(28).fill(100), ...Array(7).fill(0)])
    expect(estadoACWR(calcularACWR(s)!).nivel).toBe('subcarga')
  })

  it('sin carga crónica no se inventa un ratio', () => {
    expect(calcularACWR(serie([...Array(28).fill(0), ...Array(7).fill(300)]))).toBeNull()
  })
})

describe('las etiquetas', () => {
  it('cada tramo tiene la suya, y los bordes caen donde dicen los umbrales', () => {
    expect(estadoACWR(0.5).nivel).toBe('subcarga')
    expect(estadoACWR(UMBRALES_ACWR.subcarga).nivel).toBe('optima')
    expect(estadoACWR(UMBRALES_ACWR.optima).nivel).toBe('optima')
    expect(estadoACWR(UMBRALES_ACWR.optima + 0.01).nivel).toBe('precaucion')
    expect(estadoACWR(UMBRALES_ACWR.precaucion).nivel).toBe('precaucion')
    expect(estadoACWR(UMBRALES_ACWR.precaucion + 0.01).nivel).toBe('peligro')
  })

  /* La línea del prompt del asistente se GENERA de aquí. Estaba escrita a mano
     dentro del prompt, que es donde nadie la va a mantener. */
  it('la escala en texto sale de los umbrales', () => {
    const t = escalaACWRTexto()
    expect(t).toContain('0,8')
    expect(t).toContain('1,3')
    expect(t).toContain('1,5')
    expect(t).toMatch(/por debajo de lo habitual.*en línea con lo habitual.*subida notable.*subida fuerte/)
    // Y avisa de que no es un semáforo (Máster de Resistencia, L4.3).
    expect(t).toMatch(/orientativo/)
  })

  /* Las etiquetas DESCRIBEN la subida, no sentencian: «Peligro» comunicaba una
     certeza que el ACWR no tiene. */
  it('ninguna etiqueta suena a veredicto de lesión', () => {
    for (const v of [0.5, 1, 1.4, 2]) expect(estadoACWR(v).label).not.toMatch(/peligro|óptim|riesgo/i)
  })
})

describe('progresionACWR', () => {
  it('la misma cuenta, dicha como se decide', () => {
    expect(progresionACWR(1.45)).toBe('+45 % sobre su media de 4 semanas')
    expect(progresionACWR(0.8)).toBe('−20 % bajo su media de 4 semanas')
    expect(progresionACWR(1)).toBe('Igual que su media de 4 semanas')
  })
})
