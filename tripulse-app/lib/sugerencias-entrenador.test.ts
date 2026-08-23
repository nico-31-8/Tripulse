import { describe, it, expect } from 'vitest'
import { sugerenciasDelAtleta, DIAS_VALORACION } from './sugerencias-entrenador'

const HOY = '2026-08-23'
const dep = (extra: any = {}) => ({ nombre: 'Bruno', tec_fecha_actualizacion: HOY, ...extra })

describe('la valoración técnica', () => {
  it('sin registrar, se pide', () => {
    expect(sugerenciasDelAtleta(dep({ tec_fecha_actualizacion: null }), [], null, HOY))
      .toContain('Registrar la valoración técnica')
  })

  it('recién hecha, no molesta', () => {
    expect(sugerenciasDelAtleta(dep(), [], null, HOY)).toEqual([])
  })

  it('pasadas cuatro semanas, se avisa y se dice cuántas', () => {
    const s = sugerenciasDelAtleta(dep({ tec_fecha_actualizacion: '2026-07-01' }), [], null, HOY)
    expect(s[0]).toMatch(/Actualizar la valoración técnica \(7 semanas/)
  })

  /* Justo en el umbral SÍ avisa. Un `>` en vez de `>=` deja el aviso mudo el día
     que toca y lo saca al siguiente, que es de esos fallos que nadie reporta. */
  it('justo al cumplirse el plazo ya avisa', () => {
    const justo = sugerenciasDelAtleta(dep({ tec_fecha_actualizacion: '2026-07-26' }), [], null, HOY)
    expect(justo.length).toBe(1)
    const unDiaAntes = sugerenciasDelAtleta(dep({ tec_fecha_actualizacion: '2026-07-27' }), [], null, HOY)
    expect(unDiaAntes).toEqual([])
  })

  it('una fecha ilegible se trata como no registrada', () => {
    expect(sugerenciasDelAtleta(dep({ tec_fecha_actualizacion: 'nunca' }), [], null, HOY))
      .toContain('Registrar la valoración técnica')
  })
})

describe('los bloques que arrancan', () => {
  it('avisa de uno que empieza dentro del plazo', () => {
    const s = sugerenciasDelAtleta(dep(), [{ fecha_inicio: '2026-08-26', objetivo: 'Carga' }], null, HOY)
    expect(s[0]).toBe('Revisar el mesociclo "Carga" (empieza en 3 días)')
  })

  it('hoy y mañana se dicen con palabras', () => {
    expect(sugerenciasDelAtleta(dep(), [{ fecha_inicio: HOY, objetivo: 'Carga' }], null, HOY)[0])
      .toMatch(/empieza hoy/)
    expect(sugerenciasDelAtleta(dep(), [{ fecha_inicio: '2026-08-24', objetivo: 'Carga' }], null, HOY)[0])
      .toMatch(/empieza mañana/)
  })

  /* Solo los que EMPIEZAN. Revisar un mesociclo tiene sentido antes de que
     corra, no a mitad: si los ya empezados avisaran, el bloque de «necesita tu
     atención» estaría siempre lleno y dejaría de leerse. */
  it('los que ya empezaron no avisan', () => {
    expect(sugerenciasDelAtleta(dep(), [{ fecha_inicio: '2026-08-17', objetivo: 'Carga' }], null, HOY)).toEqual([])
  })

  it('los que quedan lejos tampoco', () => {
    expect(sugerenciasDelAtleta(dep(), [{ fecha_inicio: '2026-09-30', objetivo: 'Carga' }], null, HOY)).toEqual([])
  })

  it('avisa de todos los que caigan dentro, y solo de esos', () => {
    const s = sugerenciasDelAtleta(dep(), [
      { fecha_inicio: '2026-08-24', objetivo: 'A' },   // mañana
      { fecha_inicio: '2026-08-28', objetivo: 'B' },   // en 5 días: justo el límite
      { fecha_inicio: '2026-08-29', objetivo: 'C' },   // en 6: fuera
    ], null, HOY)
    expect(s).toHaveLength(2)
    expect(s.join(' ')).toMatch(/"A"/)
    expect(s.join(' ')).toMatch(/"B"/)
    expect(s.join(' ')).not.toMatch(/"C"/)
  })

  it('un mesociclo sin fecha se ignora en vez de reventar', () => {
    expect(sugerenciasDelAtleta(dep(), [{ fecha_inicio: null, objetivo: 'X' }], null, HOY)).toEqual([])
  })

  it('sin nombre no sale «undefined»', () => {
    const s = sugerenciasDelAtleta(dep(), [{ fecha_inicio: '2026-08-24', objetivo: null }], null, HOY)
    expect(s[0]).not.toMatch(/undefined|null/)
  })
})

describe('la anamnesis', () => {
  /* Solo cuando el atleta la ha MANDADO. Un borrador a medias no es algo que el
     entrenador tenga que revisar todavía. */
  it('avisa solo si está enviada', () => {
    expect(sugerenciasDelAtleta(dep(), [], 'enviada', HOY)[0]).toBe('Revisar la anamnesis que envió Bruno')
    expect(sugerenciasDelAtleta(dep(), [], 'borrador', HOY)).toEqual([])
    expect(sugerenciasDelAtleta(dep(), [], null, HOY)).toEqual([])
  })
})

describe('en conjunto', () => {
  it('se acumulan', () => {
    const s = sugerenciasDelAtleta(
      dep({ tec_fecha_actualizacion: null }),
      [{ fecha_inicio: '2026-08-24', objetivo: 'Carga' }],
      'enviada', HOY)
    expect(s).toHaveLength(3)
  })

  it('sin deportista no hay nada que sugerir', () => {
    expect(sugerenciasDelAtleta(null, [], 'enviada', HOY)).toEqual([])
  })

  it('el umbral está donde dice la constante', () => {
    expect(DIAS_VALORACION).toBe(28)
  })
})
