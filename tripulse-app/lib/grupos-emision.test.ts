import { describe, it, expect } from 'vitest'
import { microDelDia, emitirSesion, resumenEmision } from './grupos-emision'

describe('microDelDia', () => {
  const micros = [{ id: 1, fecha_inicio: '2026-03-02', duracion_dias: 7 }]

  it('encuentra la semana que cubre el día', () => {
    expect(microDelDia(micros, '2026-03-02')?.id).toBe(1)   // el primer día entra
    expect(microDelDia(micros, '2026-03-08')?.id).toBe(1)   // el séptimo también
  })

  /* El octavo día YA es de la semana siguiente. Si entrara aquí, dos microciclos se
     solaparían y la sesión caería en el equivocado. */
  it('el día 8 ya queda fuera', () => {
    expect(microDelDia(micros, '2026-03-09')).toBeNull()
    expect(microDelDia(micros, '2026-03-01')).toBeNull()
  })

  it('la hora en fecha_inicio no descoloca el último día', () => {
    const conHora = [{ id: 2, fecha_inicio: '2026-03-02T23:30:00Z', duracion_dias: 7 }]
    expect(microDelDia(conHora, '2026-03-08')?.id).toBe(2)
  })

  it('sin microciclos o sin fecha, no rompe', () => {
    expect(microDelDia([], '2026-03-02')).toBeNull()
    expect(microDelDia(null as any, '2026-03-02')).toBeNull()
    expect(microDelDia([{ id: 3 }], '2026-03-02')).toBeNull()
  })
})

/* Cliente de mentira. `sinPlan` son los deportistas sin macrociclo, para probar que
   igualmente reciben la sesión (como libre).
   `fallaSesionN` falla en la enésima sesión (1 = la primera). Va por posición y no
   por id de deportista a propósito: cuando el atleta tiene plan, el insert NO lleva
   id_deportista —cuelga del microciclo—, así que filtrar por ese campo no dispararía
   nunca y el test pasaría sin probar nada. */
function sbFalso(opciones: { sinPlan?: number[]; fallaSesionN?: number; fallaEmision?: boolean } = {}) {
  const ops: any[] = []
  let n = 0, nSesiones = 0
  const api = (tabla: string) => ({
    insert(v: any) {
      ops.push({ op: 'insert', tabla, v })
      return {
        select: () => ({
          single: () => {
            if (tabla === 'grupo_entreno_emision') {
              return Promise.resolve(opciones.fallaEmision
                ? { data: null, error: { message: 'no va' } }
                : { data: { id: 'e1' }, error: null })
            }
            if (tabla === 'sesion') {
              nSesiones++
              if (nSesiones === opciones.fallaSesionN) {
                return Promise.resolve({ data: null, error: { message: 'RLS' } })
              }
            }
            return Promise.resolve({ data: { id: ++n }, error: null })
          },
        }),
      }
    },
    delete() { return { eq: (_c: string, val: any) => { ops.push({ op: 'delete', tabla, val }); return Promise.resolve({ error: null }) } } },
    select(_cols?: string) {
      const q: any = {}
      q.eq = (_c: string, val: any) => {
        // macrociclo: quien está en sinPlan no tiene ninguno
        q._dep = val
        return q
      }
      q.in = () => q
      q.then = (r: any) => {
        let data: any[] = []
        if (tabla === 'macrociclo') data = opciones.sinPlan?.includes(q._dep) ? [] : [{ id: 10 }]
        else if (tabla === 'mesociclo') data = [{ id: 20 }]
        else if (tabla === 'microciclo') data = [{ id: 30, fecha_inicio: '2026-03-02', duracion_dias: 7 }]
        return Promise.resolve({ data, error: null }).then(r)
      }
      return q
    },
  })
  return { ops, from: (t: string) => api(t) }
}

const MIEMBROS = [
  { id_deportista: 1, nombre: 'Ana' },
  { id_deportista: 2, nombre: 'Luis' },
]
const BASE = {
  idGrupo: 'g1', nombre: 'Series', fecha: '2026-03-04', disciplina: 'Carrera',
  bloques: [{ zona: 'AEM', series: 4, metros: 1000 }],
  aplicarBloques: async () => null,
}

describe('emitirSesion', () => {
  it('crea una sesión por miembro, todas con la misma emisión', async () => {
    const sb = sbFalso()
    const r = await emitirSesion(sb, { ...BASE, miembros: MIEMBROS })
    expect(r.error).toBeNull()
    const ses = sb.ops.filter(o => o.op === 'insert' && o.tabla === 'sesion')
    expect(ses).toHaveLength(2)
    expect(ses.every(s => s.v.id_emision === 'e1')).toBe(true)
    expect(r.resultados.every(x => x.ok)).toBe(true)
  })

  it('quien tiene plan la recibe dentro de su microciclo', async () => {
    const sb = sbFalso()
    await emitirSesion(sb, { ...BASE, miembros: MIEMBROS })
    const ses = sb.ops.filter(o => o.op === 'insert' && o.tabla === 'sesion')
    expect(ses[0].v.id_microciclo).toBe(30)
    expect(ses[0].v.id_deportista).toBeUndefined()
  })

  /* Sin esto, medio grupo se quedaría fuera por no tener el mesociclo montado. */
  it('quien NO tiene plan la recibe igual, como sesión libre', async () => {
    const sb = sbFalso({ sinPlan: [2] })
    const r = await emitirSesion(sb, { ...BASE, miembros: MIEMBROS })
    const ses = sb.ops.filter(o => o.op === 'insert' && o.tabla === 'sesion')
    expect(ses[1].v.id_microciclo).toBeNull()
    expect(ses[1].v.id_deportista).toBe(2)
    expect(ses[1].v.origen).toBe('entrenador')
    expect(r.resultados[1].ok).toBe(true)
    expect(r.resultados[1].enSuPlan).toBe(false)
  })

  /* Con ocho personas, que una falle no puede dejar a las otras siete sin entrenar. */
  it('si falla uno, los demás la reciben igual', async () => {
    const sb = sbFalso({ fallaSesionN: 2 })
    const r = await emitirSesion(sb, { ...BASE, miembros: MIEMBROS })
    expect(r.resultados.filter(x => x.ok)).toHaveLength(1)
    expect(r.resultados.find(x => !x.ok)?.nombre).toBe('Luis')
    expect(r.idEmision).toBe('e1')
  })

  /* Una emisión que no le llegó a nadie no representa nada: aparecería en el
     historial como si se hubiera mandado algo. */
  it('si no le llega a nadie, borra la emisión', async () => {
    const sb = sbFalso({ fallaSesionN: 1 })
    const r = await emitirSesion(sb, { ...BASE, miembros: [MIEMBROS[0]] })
    expect(r.idEmision).toBeNull()
    expect(sb.ops.some(o => o.op === 'delete' && o.tabla === 'grupo_entreno_emision')).toBe(true)
  })

  it('no emite sin miembros, sin fecha ni sin disciplina', async () => {
    const sb = sbFalso()
    expect((await emitirSesion(sb, { ...BASE, miembros: [] })).error).toMatch(/nadie/i)
    expect((await emitirSesion(sb, { ...BASE, fecha: '', miembros: MIEMBROS })).error).toMatch(/fecha/i)
    expect((await emitirSesion(sb, { ...BASE, disciplina: '', miembros: MIEMBROS })).error).toMatch(/disciplina/i)
    expect(sb.ops).toHaveLength(0)
  })

  /* La sesión guarda ZONAS, nunca ritmos: es lo que permite que cada uno vea el
     suyo, calculado con sus tests al abrirla. */
  it('no escribe ningún ritmo en la sesión', async () => {
    const sb = sbFalso()
    await emitirSesion(sb, { ...BASE, miembros: MIEMBROS })
    const ses = sb.ops.filter(o => o.op === 'insert' && o.tabla === 'sesion')
    for (const s of ses) {
      expect(JSON.stringify(s.v)).not.toMatch(/ritmo/i)
    }
  })
})

describe('resumenEmision', () => {
  it('cuenta las creadas y avisa de las que van sin semana planificada', () => {
    const r = resumenEmision([
      { id_deportista: 1, nombre: 'Ana', ok: true, enSuPlan: true },
      { id_deportista: 2, nombre: 'Luis', ok: true, enSuPlan: false },
      { id_deportista: 3, nombre: 'Eva', ok: false, enSuPlan: true },
    ])
    expect(r).toContain('2 de 3')
    expect(r).toContain('1 sin semana planificada')
  })
})
