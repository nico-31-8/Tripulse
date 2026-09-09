import { describe, it, expect } from 'vitest'
import { uaArrastrada, UMBRAL_ARRASTRE, PASO_UA } from './arrastre-carga'

/* Las medidas reales: 180 px de alto y un plan cuyo pico son 4.000 UA.
   Ahí cada píxel vale 22 UA, que es lo que hace peligroso el temblor. */
const M = { uaInicial: 1000, maxUA: 4000, altoPx: 180 }

describe('uaArrastrada', () => {
  it('sin mover, no cambia nada', () => {
    expect(uaArrastrada(0, M)).toBeNull()
  })

  /* EL CASO QUE LO MOTIVA: al agrandar la zona de agarre, un pinchazo con un
     píxel de temblor movía la semana 25 UA sin que nadie lo pidiera. */
  it('un temblor de uno a tres píxeles no cambia nada', () => {
    for (const dy of [1, 2, 3, -1, -2, -3]) expect(uaArrastrada(dy, M)).toBeNull()
  })

  it('a partir del umbral ya responde', () => {
    expect(uaArrastrada(UMBRAL_ARRASTRE + 6, M)).not.toBeNull()
  })

  it('justo en el umbral no pega un brinco: sale el valor de partida', () => {
    expect(uaArrastrada(UMBRAL_ARRASTRE, M)).toBe(1000)
    expect(uaArrastrada(-UMBRAL_ARRASTRE, M)).toBe(1000)
  })

  it('subir el ratón sube la carga, bajarlo la baja', () => {
    const arriba = uaArrastrada(40, M)!
    const abajo = uaArrastrada(-40, M)!
    expect(arriba).toBeGreaterThan(1000)
    expect(abajo).toBeLessThan(1000)
  })

  it('el resultado siempre es múltiplo del paso', () => {
    for (let dy = -120; dy <= 120; dy += 7) {
      const v = uaArrastrada(dy, M)
      if (v !== null) expect(v % PASO_UA).toBe(0)
    }
  })

  it('nunca baja de cero por mucho que arrastres', () => {
    expect(uaArrastrada(-5000, M)).toBe(0)
  })

  it('subir toda la altura del gráfico suma el máximo de la escala', () => {
    /* 180 px arriba = 4.000 UA más, menos los 4 del umbral (≈89 UA). */
    expect(uaArrastrada(180 + UMBRAL_ARRASTRE, M)).toBe(5000)
  })

  it('una semana vacía arranca desde cero', () => {
    expect(uaArrastrada(45 + UMBRAL_ARRASTRE, { ...M, uaInicial: 0 })).toBe(1000)
  })

  it('con la escala a cero no inventa un número', () => {
    expect(uaArrastrada(50, { ...M, altoPx: 0 })).toBeNull()
  })

  it('en un plan pequeño el píxel vale poco y el arrastre es más fino', () => {
    const suave = uaArrastrada(20 + UMBRAL_ARRASTRE, { uaInicial: 200, maxUA: 400, altoPx: 180 })
    const bruto = uaArrastrada(20 + UMBRAL_ARRASTRE, { uaInicial: 200, maxUA: 8000, altoPx: 180 })
    expect(suave! - 200).toBeLessThan(bruto! - 200)
  })
})
