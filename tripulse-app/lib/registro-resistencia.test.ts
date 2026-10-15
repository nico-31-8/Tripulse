import { describe, it, expect } from 'vitest'
import {
  BLOQUE_VACIO, type BloqueRegistro, seriesDe, bloqueTieneAlgo, bloquesQueCuentan,
  totalDe, resumenTotal, tareaDe, medicionDe, bloquesDesdeSesion,
  guardarRegistroResistencia, actualizarRegistroResistencia,
} from './registro-resistencia'

const b = (p: Partial<BloqueRegistro>): BloqueRegistro => ({ ...BLOQUE_VACIO, ...p })

describe('qué bloque cuenta', () => {
  it('el que no tiene cantidad no cuenta, aunque tenga zona', () => {
    expect(bloqueTieneAlgo(b({ zona: 'AEM' }))).toBe(false)
  })

  it('cuenta en cuanto hay cantidad', () => {
    expect(bloqueTieneAlgo(b({ cantidad: '400' }))).toBe(true)
  })

  it('una cantidad de cero no es un bloque', () => {
    expect(bloqueTieneAlgo(b({ cantidad: '0' }))).toBe(false)
  })

  it('los vacíos de en medio se caen y el resto mantiene el orden', () => {
    const lista = [b({ cantidad: '600' }), b({}), b({ cantidad: '100' })]
    expect(bloquesQueCuentan(lista).map(x => x.cantidad)).toEqual(['600', '100'])
  })
})

describe('las series', () => {
  it('sin decir nada es una', () => {
    expect(seriesDe(b({ series: '' }))).toBe(1)
  })

  it('cero series sigue siendo una: el bloque se hizo', () => {
    expect(seriesDe(b({ series: '0' }))).toBe(1)
  })

  it('se lee el número que se escribe', () => {
    expect(seriesDe(b({ series: '8' }))).toBe(8)
  })
})

describe('el total', () => {
  it('multiplica series por cantidad', () => {
    expect(totalDe([b({ series: '8', cantidad: '100' })]).metros).toBe(800)
  })

  it('suma los bloques de una sesión entera', () => {
    const sesion = [
      b({ series: '1', cantidad: '600' }),
      b({ series: '8', cantidad: '100' }),
      b({ series: '1', cantidad: '200' }),
    ]
    expect(totalDe(sesion).metros).toBe(1600)
  })

  it('los minutos NO se mezclan con los metros', () => {
    const sesion = [b({ cantidad: '1000' }), b({ cantidad: '20', unidad: 'min' })]
    expect(totalDe(sesion)).toEqual({ metros: 1000, minutos: 20 })
  })

  it('el resumen enseña solo la mitad que existe', () => {
    expect(resumenTotal([b({ cantidad: '40', unidad: 'min' })])).toBe('40 min')
    expect(resumenTotal([])).toBe('')
  })
})

describe('lo que se escribe en la base', () => {
  it('la zona vacía se guarda como null, no como cadena vacía', () => {
    expect(tareaDe(b({ cantidad: '400' }), 7, 1, 'Natación').zona_entrenamiento).toBe(null)
  })

  it('la tarea lleva las series y el descanso', () => {
    const t = tareaDe(b({ zona: 'AEM', series: '8', cantidad: '100', descanso: '20' }), 7, 2, 'Natación')
    expect(t).toMatchObject({ id_sesion: 7, orden: 2, disciplina: 'Natación', series: 8, descanso_segundos: 20 })
  })

  it('la medición guarda UNA serie, no el bloque entero', () => {
    /* La tarea ya lleva `series: 8`. Si aquí se guardaran los 800, el volumen
       contaría 6 400 metros. */
    const { tabla, fila } = medicionDe(b({ series: '8', cantidad: '100' }), 30)
    expect(tabla).toBe('p_distancia')
    expect(fila.metros_planeados).toBe(100)
  })

  it('planeado y real valen lo mismo: lo que escribe es lo que hizo', () => {
    const { fila } = medicionDe(b({ cantidad: '600' }), 30)
    expect(fila.metros_planeados).toBe(fila.metros_reales)
  })

  it('los minutos se guardan en segundos y en p_duracion', () => {
    const { tabla, fila } = medicionDe(b({ cantidad: '20', unidad: 'min' }), 30)
    expect(tabla).toBe('p_duracion')
    expect(fila.tiempo_planeado).toBe(1200)
    expect(fila.tiempo_real).toBe(1200)
  })

  it('el ritmo NO viaja en la fila de los metros', () => {
    /* Si viajara dentro, un ritmo que la columna no admita se llevaría también
       los metros por delante. Va en su propia escritura. */
    const m = medicionDe(b({ cantidad: '100', ritmo: '1:38' }), 30)
    expect(m.fila.ritmo_objetivo).toBeUndefined()
    expect(m.ritmo).toBe('1:38')
  })

  it('sin ritmo no hay nada que escribir aparte', () => {
    expect(medicionDe(b({ cantidad: '100' }), 30).ritmo).toBe(null)
  })

  it('un bloque por tiempo no tiene ritmo que guardar', () => {
    expect(medicionDe(b({ cantidad: '20', unidad: 'min', ritmo: '4:30' }), 30).ritmo).toBe(null)
  })
})

describe('traer una sesión para corregirla', () => {
  it('lo que se guardó vuelve igual', () => {
    const tareas = [{
      zona_entrenamiento: 'AEM', series: 8, descanso_segundos: 20,
      p_distancia: [{ metros_planeados: 100, metros_reales: 100, ritmo_objetivo: '1:38' }],
    }]
    expect(bloquesDesdeSesion(tareas)[0]).toEqual({
      zona: 'AEM', series: '8', cantidad: '100', unidad: 'm', ritmo: '1:38', descanso: '20',
    })
  })

  it('un bloque por tiempo vuelve en minutos', () => {
    const tareas = [{ zona_entrenamiento: 'AER', series: 1, p_duracion: [{ tiempo_planeado: 1200 }] }]
    const v = bloquesDesdeSesion(tareas)[0]
    expect(v.unidad).toBe('min')
    expect(v.cantidad).toBe('20')
  })

  it('una tarea sin medición no revienta', () => {
    expect(bloquesDesdeSesion([{ zona_entrenamiento: null, series: null }])[0].cantidad).toBe('')
  })
})

/* ------------------------------------------------------------------
   Guardar lo apuntado: de golpe, y sin perder los metros por el ritmo
   ------------------------------------------------------------------ */

function sbFalso(o: { rechazaRitmo?: boolean; falla?: string } = {}) {
  const ops: { op: string; tabla: string; filas?: any[] }[] = []
  let n = 100
  const from = (tabla: string) => ({
    insert(v: any) {
      const filas = Array.isArray(v) ? v : [v]
      ops.push({ op: 'insert', tabla, filas })
      const mal = o.falla === tabla || (o.rechazaRitmo && filas.some(f => 'ritmo_objetivo' in f))
      const res = mal ? { data: null, error: { message: 'no va en ' + tabla } } : { data: filas.map(() => ({ id: ++n })), error: null }
      return {
        select: () => { const p: any = Promise.resolve(res); p.single = () => Promise.resolve(mal ? res : { data: res.data![0], error: null }); return p },
        then: (r: any) => r({ error: res.error }),
      }
    },
    select() { const q: any = { eq: () => Promise.resolve({ data: [{ id: 1 }] }) }; return q },
    delete() {
      const fin = (campo: string) => (_c: string, v: any) => { ops.push({ op: 'delete:' + campo, tabla, filas: [v] }); return Promise.resolve({ error: null }) }
      return { eq: fin('eq'), in: fin('in') }
    },
    update() { const q: any = { eq: () => q, is: () => Promise.resolve({ error: null }), then: (r: any) => r({ error: null }) }; return q },
  })
  return { ops, from, inserts: (t: string) => ops.filter(x => x.op === 'insert' && x.tabla === t) }
}

const base = { idDeportista: 14, disciplina: 'Carrera', fecha: '2026-10-15', idMicrociclo: null, realizada: true, duracionMinutos: 40, rpe: 6, notas: null }
const SERIES = b({ zona: 'AEM', series: '6', cantidad: '400', unidad: 'm', ritmo: '1:30' })
const CALMA = b({ zona: 'AER', cantidad: '10', unidad: 'min' })

describe('guardarRegistroResistencia', () => {
  /* Iba bloque a bloque: tres esperas por cada uno. */
  it('todas las tareas en UNA escritura, y cada medición en su tabla con su tarea', async () => {
    const sb = sbFalso()
    const r = await guardarRegistroResistencia(sb, { ...base, bloques: [SERIES, CALMA] })
    expect(r.error).toBeNull()
    expect(sb.inserts('tarea')).toHaveLength(1)
    const [t] = sb.inserts('tarea')
    expect(t.filas!.map(f => f.orden)).toEqual([1, 2])
    /* Sesión 101, tareas 102 y 103: los metros con la primera y el tiempo con la segunda. */
    expect(sb.inserts('p_distancia')[0].filas).toEqual([{ id_tarea: 102, metros_planeados: 400, metros_reales: 400, ritmo_objetivo: '1:30' }])
    expect(sb.inserts('p_duracion')[0].filas![0]).toMatchObject({ id_tarea: 103 })
    expect(r.aviso).toBeNull()
  })

  /* LA GARANTÍA DE SIEMPRE: el ritmo no se lleva por delante los metros. */
  it('si el ritmo no entra, los metros sí, y se avisa', async () => {
    const sb = sbFalso({ rechazaRitmo: true })
    const r = await guardarRegistroResistencia(sb, { ...base, bloques: [SERIES] })
    expect(r.error).toBeNull()
    expect(r.aviso).toMatch(/ritmos/)
    expect(sb.inserts('p_distancia').at(-1)!.filas![0]).not.toHaveProperty('ritmo_objetivo')
    expect(sb.inserts('p_distancia').at(-1)!.filas![0].metros_planeados).toBe(400)
  })

  it('si fallan las tareas, la sesión se va entera', async () => {
    const sb = sbFalso({ falla: 'tarea' })
    const r = await guardarRegistroResistencia(sb, { ...base, bloques: [SERIES] })
    expect(r.idSesion).toBeNull()
    expect(sb.ops.some(x => x.op.startsWith('delete') && x.tabla === 'sesion')).toBe(true)
  })
})

describe('actualizarRegistroResistencia', () => {
  it('escribe lo nuevo de golpe y DESPUÉS borra lo viejo', async () => {
    const sb = sbFalso()
    const r = await actualizarRegistroResistencia(sb, 400, { ...base, bloques: [SERIES, CALMA] })
    expect(r.error).toBeNull()
    expect(sb.inserts('tarea')).toHaveLength(1)
    const orden = sb.ops.map(x => x.op + ':' + x.tabla)
    const borradoViejo = orden.findIndex(x => x === 'delete:in:tarea')
    const ultimoInsert = orden.map((x, i) => x.startsWith('insert') ? i : -1).filter(i => i >= 0).pop()!
    expect(ultimoInsert).toBeLessThan(borradoViejo)
  })

  it('si fallan las mediciones, se quita solo lo nuevo', async () => {
    const sb = sbFalso({ falla: 'p_duracion' })
    const r = await actualizarRegistroResistencia(sb, 400, { ...base, bloques: [SERIES, CALMA] })
    expect(r.error).toMatch(/No se ha borrado nada/)
    const borrados = sb.ops.filter(x => x.op === 'delete:in' && x.tabla === 'tarea')
    expect(borrados).toHaveLength(1)
    /* Sin sesión nueva que crear, las tareas nuevas son la 101 y la 102. */
    expect(borrados[0].filas![0]).toEqual([101, 102])
  })
})
