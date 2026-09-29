import { describe, it, expect } from 'vitest'
import { sugerenciasDelAtleta, DIAS_VALORACION, type MaterialSug } from './sugerencias-entrenador'

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

// ============================================================
// El material que toca cambiar
// ============================================================
//
// Hasta ahora el aviso de jubilar unas zapatillas solo existía si el entrenador
// entraba en la pestaña Material a mirarlo. Aquí sale donde ya mira: el bloque
// del panel. Y como sale del kilometraje, se va solo cuando se jubilan o se
// reinicia el contador — no hay nada que marcar como leído.
describe('sugerenciasDelAtleta — el material', () => {
  const dep = { nombre: 'Nico', tec_fecha_actualizacion: '2026-09-20' }
  const solas = (material: MaterialSug[]) =>
    sugerenciasDelAtleta(dep, [], null, '2026-09-22', material)
      .filter(s => s.includes('«'))

  const mat = (o: Partial<MaterialSug> = {}): MaterialSug =>
    ({ nombre: 'las de placa', estado: 'ok', contador: 300, limite: 700, restante: 400, pasado: 0, ...o })

  it('sin material, no dice nada', () => {
    expect(solas([])).toEqual([])
    expect(sugerenciasDelAtleta(dep, [], null, '2026-09-22')).not.toContain(undefined)
  })

  it('el que va bien no se menciona', () => {
    expect(solas([mat()])).toEqual([])
  })

  it('sin límite tampoco: no hay nada que avisar', () => {
    expect(solas([mat({ estado: 'sin-limite', limite: null, restante: null, contador: 4180 })])).toEqual([])
  })

  it('cerca del límite dice cuánto queda', () => {
    const s = solas([mat({ estado: 'aviso', contador: 368, limite: 400, restante: 32 })])
    expect(s).toHaveLength(1)
    expect(s[0]).toMatch(/las de placa/)
    expect(s[0]).toMatch(/quedan 32 km/)
  })

  it('pasado del límite dice que toca cambiarlo, y cuánto se pasó', () => {
    const s = solas([mat({ estado: 'pasado', contador: 742, limite: 700, restante: 0, pasado: 42 })])
    expect(s[0]).toMatch(/^Cambiar/)
    expect(s[0]).toMatch(/742/)
    expect(s[0]).toMatch(/42 por encima/)
  })

  it('con varios, uno por cada uno', () => {
    expect(solas([
      mat({ nombre: 'las de placa', estado: 'aviso', restante: 32 }),
      mat({ nombre: 'las de rodar', estado: 'pasado', pasado: 40 }),
      mat({ nombre: 'la de carretera', estado: 'ok' }),
    ])).toHaveLength(2)
  })

  /* El material se añade a lo que ya había, no lo sustituye: si el mismo día hay
     una anamnesis que revisar y unas zapatillas gastadas, salen las dos. */
  it('no se come las demás sugerencias', () => {
    const s = sugerenciasDelAtleta(dep, [], 'enviada', '2026-09-22',
      [mat({ estado: 'pasado', pasado: 42 })])
    expect(s.some(x => x.includes('anamnesis'))).toBe(true)
    expect(s.some(x => x.startsWith('Cambiar'))).toBe(true)
  })
})
