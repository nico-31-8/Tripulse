import { describe, it, expect } from 'vitest'
import { prescripcionDesdeUltimaVez } from './traer-ultima-vez'

const s = (numero_serie: number, peso_real?: number, repeticiones_reales?: number, extra: object = {}) =>
  ({ numero_serie, peso_real, repeticiones_reales, ejercicio_numero: 1, ...extra })

describe('prescripcionDesdeUltimaVez', () => {
  it('series iguales: repeticiones exactas', () => {
    const r = prescripcionDesdeUltimaVez([s(1, 40, 10), s(2, 40, 10), s(3, 40, 10)])!
    expect(r.series).toBe('3')
    expect(r.reps).toBe('10')
    expect(r.kg).toBe('40')
    expect(r.detalle).toBe('40×10 · 40×10 · 40×10')
  })

  /* Lo normal: las series bajan. Un rango es exactamente lo que describe eso, y
     además es lo que la prescripción ya sabe guardar. */
  it('repeticiones que varían salen como rango', () => {
    const r = prescripcionDesdeUltimaVez([s(1, 40, 10), s(2, 40, 9), s(3, 40, 8)])!
    expect(r.reps).toBe('8-10')
    expect(r.kg).toBe('40')
  })

  /* El peso de la serie suelta engaña: si hizo dos a 40 y una a 30, trabajó a
     40. El máximo de una serie aislada tampoco: si hizo una a 50 y dos a 40,
     su peso de trabajo son 40. */
  it('el peso es el que más se repite, no el máximo ni el último', () => {
    expect(prescripcionDesdeUltimaVez([s(1, 40, 10), s(2, 40, 10), s(3, 30, 8)])!.kg).toBe('40')
    expect(prescripcionDesdeUltimaVez([s(1, 50, 5), s(2, 40, 10), s(3, 40, 10)])!.kg).toBe('40')
  })

  it('con empate, el mayor', () => {
    expect(prescripcionDesdeUltimaVez([s(1, 40, 10), s(2, 45, 10)])!.kg).toBe('45')
  })

  it('sin peso (peso corporal) trae las repeticiones y deja los kilos en blanco', () => {
    const r = prescripcionDesdeUltimaVez([s(1, undefined, 12), s(2, undefined, 10)])!
    expect(r.kg).toBe('')
    expect(r.reps).toBe('10-12')
  })

  it('el control de aquel día, y su escala', () => {
    const r = prescripcionDesdeUltimaVez([
      s(1, 40, 10, { control_real: 2, control_tipo: 'rir' }),
      s(2, 40, 10, { control_real: 2, control_tipo: 'rir' }),
    ])!
    expect(r.control).toBe('2')
    expect(r.controlTipo).toBe('rir')
  })

  it('un control que varía sale como rango', () => {
    const r = prescripcionDesdeUltimaVez([
      s(1, 40, 10, { control_real: 3, control_tipo: 'rpe' }),
      s(2, 40, 10, { control_real: 1, control_tipo: 'rpe' }),
    ])!
    expect(r.control).toBe('1-3')
    expect(r.controlTipo).toBe('rpe')
  })

  /* En una superserie las series con ejercicio_numero 2 son de OTRO ejercicio:
     colarlas haría que la sentadilla trajera el peso del press banca. */
  it('no se cuela el ejercicio encadenado de una superserie', () => {
    const r = prescripcionDesdeUltimaVez([
      s(1, 40, 10), s(2, 40, 10),
      { numero_serie: 1, peso_real: 90, repeticiones_reales: 6, ejercicio_numero: 2 },
    ])!
    expect(r.series).toBe('2')
    expect(r.kg).toBe('40')
  })

  it('por tiempo trae los segundos de su mejor serie', () => {
    const r = prescripcionDesdeUltimaVez(
      [s(1, undefined, undefined, { tiempo_real: 45 }), s(2, undefined, undefined, { tiempo_real: 38 })],
      true,
    )!
    expect(r.reps).toBe('45')
    expect(r.detalle).toBe('45s · 38s')
  })

  /* Puede pasar: marcó las series como hechas sin anotar nada. Rellenar con
     ceros sería peor que no hacer nada, así que quien llama avisa. */
  it('sin nada medido, null', () => {
    expect(prescripcionDesdeUltimaVez([])).toBeNull()
    expect(prescripcionDesdeUltimaVez(null)).toBeNull()
    expect(prescripcionDesdeUltimaVez([s(1), s(2)])).toBeNull()
    expect(prescripcionDesdeUltimaVez([s(1, 0, 0)])).toBeNull()
  })

  it('nunca devuelve NaN ni cadenas raras', () => {
    const r = prescripcionDesdeUltimaVez([s(1, 40, 10), { numero_serie: 2, peso_real: 'x' as never, ejercicio_numero: 1 }])!
    for (const v of [r.series, r.reps, r.kg, r.control]) expect(v).not.toMatch(/NaN/)
  })
})
