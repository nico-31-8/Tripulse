import { describe, it, expect } from 'vitest'
import { puedeRehacer, borrarPlan, DIAS_ESPERA, type EstadoPlan } from './plan-rehacer'

const HOY = '2026-08-20'
const estado = (p: Partial<EstadoPlan> = {}): EstadoPlan =>
  ({ idMacrociclo: 1, planificadas: 0, realizadas: 0, creado: null, ...p })

describe('cuándo se puede rehacer', () => {
  it('sin plan, no hay nada que rehacer y se deja pasar', () => {
    const v = puedeRehacer(estado({ idMacrociclo: null }), HOY)
    expect(v.puede).toBe(true)
  })

  /* LA DECISIÓN QUE DIFERENCIA ESTO DE UN TEMPORIZADOR A SECAS. Un plan que
     todavía no ha generado ninguna semana es un borrador: equivocarse en la
     fecha al crearlo es lo más normal, y bloquearlo una semana castiga justo
     el caso legítimo. */
  it('un plan sin semanas generadas se rehace gratis, aunque sea de hoy', () => {
    const v = puedeRehacer(estado({ planificadas: 0, creado: HOY }), HOY)
    expect(v.puede).toBe(true)
    expect(v.motivo).toMatch(/borrador/)
    expect(v.consecuencia).toBe('')
  })

  it('con semanas puestas y recién creado, toca esperar', () => {
    const v = puedeRehacer(estado({ planificadas: 20, creado: '2026-08-18' }), HOY)
    expect(v.puede).toBe(false)
    expect(v.faltan).toBe(DIAS_ESPERA - 2)
    expect(v.motivo).toMatch(/Podrás rehacerlo en 5 días/)
    // Y se le ofrece la salida que sí es legítima hoy.
    expect(v.consecuencia).toMatch(/una sesión suelta sí se puede cambiar hoy/)
  })

  it('pasada la espera, se puede y se dice qué se pierde', () => {
    const v = puedeRehacer(estado({ planificadas: 20, creado: '2026-08-01' }), HOY)
    expect(v.puede).toBe(true)
    expect(v.consecuencia).toMatch(/Las 20 sesiones .* van a la papelera/)
  })

  it('justo al cumplirse el plazo ya se puede', () => {
    const v = puedeRehacer(estado({ planificadas: 5, creado: '2026-08-13' }), HOY)
    expect(v.puede).toBe(true)
  })

  /* Negar por no saber sería castigar al atleta por un hueco nuestro: la tabla
     puede no guardar cuándo se creó. */
  it('sin fecha de creación se deja pasar, no se bloquea', () => {
    const v = puedeRehacer(estado({ planificadas: 20, creado: null }), HOY)
    expect(v.puede).toBe(true)
  })

  it('lo ya entrenado se nombra siempre, para que sepa que no lo pierde', () => {
    const v = puedeRehacer(estado({ planificadas: 10, realizadas: 4, creado: '2026-08-01' }), HOY)
    expect(v.consecuencia).toMatch(/4 que ya has entrenado se quedan/)
  })
})

/** Doble mínimo que apunta lo que se actualiza y lo que se borra. */
function sbFalso(sesiones: { id: number; estado: string }[]) {
  const acciones: string[] = []
  let sueltas: number[] = []
  const from = (tabla: string) => ({
    select: (_c?: string) => {
      const resp = (data: any) => {
        const r = { data, error: null }
        return { ...r, then: (f: any) => f(r) }
      }
      const enc: any = {
        eq: (col: string, val: any) => {
          if (tabla === 'mesociclo') return resp([{ id: 10 }])
          return resp([])
        },
        in: (_c: string, _v: any[]) => ({
          eq: (_c2: string, estado: string) => resp(sesiones.filter(s => s.estado === estado)),
          ...resp(sesiones.filter(s => !sueltas.includes(s.id))),
        }),
      }
      return enc
    },
    update: (_v: any) => ({
      in: (_c: string, ids: number[]) => {
        acciones.push('soltar:' + ids.length)
        sueltas = ids
        const r = { error: null }
        return { ...r, then: (f: any) => f(r) }
      },
    }),
    delete: () => {
      const r = { error: null }
      return {
        in: (_c: string, _v: any) => { acciones.push('borrar:' + tabla); return { ...r, then: (f: any) => f(r) } },
        eq: (_c: string, _v: any) => { acciones.push('borrar:' + tabla); return { ...r, then: (f: any) => f(r) } },
      }
    },
  })
  return { api: { from }, acciones }
}

describe('borrar el plan', () => {
  /* Lo entrenado es del atleta, no del plan. Si se borrara todo perdería el
     registro de lo único que no depende de la planificación. */
  it('suelta las realizadas ANTES de borrar, para que la clave ajena no se las lleve', async () => {
    const { api, acciones } = sbFalso([
      { id: 1, estado: 'Realizada' }, { id: 2, estado: 'Realizada' }, { id: 3, estado: 'Planificada' },
    ])
    const r = await borrarPlan(api as any, 7, 99)
    expect(r.sueltas).toBe(2)
    expect(r.error).toBeNull()
    // El orden importa: soltar primero, borrar después.
    expect(acciones[0]).toBe('soltar:2')
    expect(acciones.slice(1).some(a => a.startsWith('borrar:'))).toBe(true)
  })

  it('sin realizadas no suelta nada y borra igual', async () => {
    const { api } = sbFalso([{ id: 3, estado: 'Planificada' }])
    const r = await borrarPlan(api as any, 7, 99)
    expect(r.sueltas).toBe(0)
    expect(r.error).toBeNull()
  })
})

describe('nada se borra de verdad', () => {
  /* Este era el UNICO sitio de la app donde borrar una sesion significaba
     borrarla. En todas las demas pantallas es `eliminada = true` y se puede
     recuperar; aqui era un delete irreversible. */
  it('las planificadas van a la papelera, no al vacio', async () => {
    const parches: any[] = []
    const from = (tabla: string) => ({
      select: () => ({
        eq: () => { const r = { data: tabla === 'mesociclo' ? [{ id: 10 }] : [], error: null }; return { ...r, then: (f: any) => f(r) } },
        in: () => ({
          eq: () => { const r = { data: [], error: null }; return { ...r, then: (f: any) => f(r) } },
          ...(() => { const r = { data: [{ id: 1 }, { id: 2 }], error: null }; return { ...r, then: (f: any) => f(r) } })(),
        }),
      }),
      update: (v: any) => ({
        in: () => { parches.push({ tabla, v }); const r = { error: null }; return { ...r, then: (f: any) => f(r) } },
      }),
      delete: () => {
        const r = { error: null }
        return { in: () => ({ ...r, then: (f: any) => f(r) }), eq: () => ({ ...r, then: (f: any) => f(r) }) }
      },
    })
    await borrarPlan({ from } as any, 7, 99)
    const aPapelera = parches.find(p => p.v.eliminada === true)
    expect(aPapelera, 'ninguna sesion marcada como eliminada').toBeTruthy()
    // Y despegadas del microciclo, o la clave ajena se las lleva igual.
    expect(aPapelera.v.id_microciclo).toBeNull()
    expect(aPapelera.v.id_deportista).toBe(7)
  })
})
