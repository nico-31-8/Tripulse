import { describe, it, expect } from 'vitest'
import { puedeRehacer, borrarPlan, borrarMesociclo, resumenDelBorrado, DIAS_ESPERA, type EstadoPlan } from './plan-rehacer'

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

/** Doble que FILTRA de verdad: guarda las sesiones del plan (todas colgando de
    la semana 501), aplica cada filtro de la consulta y apunta lo que se
    actualiza y lo que se borra. Un doble que contesta siempre lo mismo daría
    verde aunque el filtro estuviera mal escrito. */
function sbFalso(sesiones: { id: number; estado: string | null }[]) {
  const acciones: string[] = []
  /* Con qué ids se pregunta por las sesiones: el fallo era usar los del mesociclo. */
  const consultas: { tabla: string; col: string; v: any[] }[] = []
  const parches: { tabla: string; v: any }[] = []
  const filas = sesiones.map(x => ({ ...x, id_microciclo: 501 as number | null, eliminada: false }))
  const from = (tabla: string) => {
    const filtros: ((f: any) => boolean)[] = []
    let op: 'select' | 'update' | 'delete' = 'select'
    let valores: any = null
    const q: any = {
      select: () => q,
      update: (v: any) => { op = 'update'; valores = v; return q },
      delete: () => { op = 'delete'; return q },
      eq: (c: string, v: any) => { filtros.push(f => f[c] === v); return q },
      in: (c: string, vs: any[]) => { consultas.push({ tabla, col: c, v: vs }); filtros.push(f => vs.includes(f[c])); return q },
      or: (expr: string) => {
        // Solo entiende el que se usa: «sin estado, o con uno que no sea Realizada».
        expect(expr).toBe('estado.is.null,estado.neq.Realizada')
        filtros.push(f => f.estado == null || f.estado !== 'Realizada')
        return q
      },
      then: (ok: any, ko: any) => {
        let r: any = { data: [], error: null }
        if (tabla === 'mesociclo' && op === 'select') {
          r = { data: [{ id: 10, microciclo: [{ id: 501 }, { id: 502 }] }], error: null }
        } else if (tabla === 'microciclo' && op === 'select') {
          r = { data: [{ id: 501 }, { id: 502 }], error: null }
        } else if (tabla === 'sesion') {
          const tocadas = filas.filter(f => filtros.every(fn => fn(f)))
          if (op === 'update') {
            tocadas.forEach(f => Object.assign(f, valores))
            parches.push({ tabla, v: valores })
            acciones.push((valores.eliminada ? 'papelera:' : 'soltar:') + tocadas.length)
          }
          r = { data: tocadas.map(f => ({ id: f.id })), error: null }
        } else if (op === 'delete') {
          acciones.push('borrar:' + tabla)
          r = { error: null }
        }
        return Promise.resolve(r).then(ok, ko)
      },
    }
    return q
  }
  return { api: { from }, acciones, consultas, parches, filas }
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

  /* EL FALLO QUE SE LLEVABA LO ENTRENADO: las sesiones se buscaban con los ids
     de los MESOciclos. No salía ninguna, nadie las soltaba, y al borrar los
     microciclos la clave ajena (on delete cascade) las borraba todas, también
     las realizadas y sin pasar por la papelera. */
  it('busca las sesiones por sus MICROciclos, no por los mesociclos', async () => {
    const { api, consultas } = sbFalso([{ id: 1, estado: 'Realizada' }, { id: 3, estado: 'Planificada' }])
    const r = await borrarPlan(api as any, 7, 99)
    const deSesion = consultas.filter(c => c.tabla === 'sesion' && c.col === 'id_microciclo')
    expect(deSesion.length).toBeGreaterThan(0)
    expect(deSesion.every(c => c.v.join() === '501,502')).toBe(true)
    expect(r.sueltas).toBe(1)
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
    const { api, parches } = sbFalso([{ id: 1, estado: 'Planificada' }, { id: 2, estado: 'Planificada' }])
    const r = await borrarPlan(api as any, 7, 99)
    const aPapelera = parches.find(p => p.v.eliminada === true)
    expect(aPapelera, 'ninguna sesion marcada como eliminada').toBeTruthy()
    // Y despegadas del microciclo, o la clave ajena se las lleva igual.
    expect(aPapelera!.v.id_microciclo).toBeNull()
    expect(aPapelera!.v.id_deportista).toBe(7)
    expect(r.borradas).toBe(2)
  })

  /* Con un «distinto de Realizada» a secas, una sesión SIN estado no cumple
     ninguno de los dos filtros (en SQL, null no es distinto de nada): se
     quedaba colgando del microciclo y la cascada se la llevaba de verdad. */
  it('una sesion sin estado tambien va a la papelera, no se la lleva la cascada', async () => {
    const { api, filas } = sbFalso([{ id: 1, estado: null }, { id: 2, estado: 'Realizada' }])
    const r = await borrarPlan(api as any, 7, 99)
    expect(r.borradas).toBe(1)
    expect(r.sueltas).toBe(1)
    expect(filas.every(f => f.id_microciclo === null)).toBe(true)
    expect(filas.find(f => f.id === 2)!.eliminada).toBe(false)   // la entrenada se suelta, no se tira
  })

  /* Lo de debajo del plan se va en cascada con él: una orden y no tres. */
  it('el plan se borra con UNA orden, despues de despegar las sesiones', async () => {
    const { api, acciones } = sbFalso([{ id: 1, estado: 'Realizada' }, { id: 3, estado: 'Planificada' }])
    await borrarPlan(api as any, 7, 99)
    expect(acciones).toEqual(['soltar:1', 'papelera:1', 'borrar:macrociclo'])
  })
})

/* El lienzo y la vista de bloques borraban el plan a ciegas, sesiones
   incluidas, y con una sesión de fuerza hecha ni se podía: sus series cuelgan
   del ejercicio y la base paraba el borrado (comprobado el 15-10-2026 contra
   el plan de Dani Diaz). Ahora borran como «Rehacer el plan». */
describe('borrar desde el lienzo y la vista de bloques', () => {
  it('borrar un mesociclo suelta sus hechas, tira las demás a la papelera y borra solo ese mesociclo', async () => {
    const { api, acciones, filas } = sbFalso([{ id: 1, estado: 'Realizada' }, { id: 3, estado: 'Planificada' }])
    const r = await borrarMesociclo(api as any, 7, 10)
    expect(r.error).toBeNull()
    expect(acciones).toEqual(['soltar:1', 'papelera:1', 'borrar:mesociclo'])
    expect(filas.every(f => f.id_microciclo === null)).toBe(true)
  })

  it('devuelve cuáles fueron a la papelera, para quitarlas de la pantalla', async () => {
    const { api } = sbFalso([{ id: 1, estado: 'Realizada' }, { id: 3, estado: 'Planificada' }, { id: 4, estado: null }])
    const r = await borrarPlan(api as any, 7, 99)
    expect([...r.idsPapelera].sort()).toEqual([3, 4])
  })

  it('el aviso dice qué ha pasado con sus sesiones', () => {
    expect(resumenDelBorrado({ sueltas: 2, borradas: 5 }))
      .toBe('Borrado. 2 sesiones hechas siguen en el calendario, fuera del plan; 5 planificadas están en la papelera.')
    expect(resumenDelBorrado({ sueltas: 1, borradas: 0 })).toBe('Borrado. 1 sesión hecha sigue en el calendario, fuera del plan.')
    expect(resumenDelBorrado({ sueltas: 0, borradas: 0 })).toBe('Borrado.')
  })
})
