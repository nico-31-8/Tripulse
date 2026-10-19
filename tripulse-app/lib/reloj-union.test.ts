/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { baseEnMemoria } from './base-en-memoria'
import { ponerDatosDelReloj, desunir, guardarDecision, apuntarDesdeReloj, aplicarEscrituras, sesionDelReloj } from './reloj-union'
import type { ActividadReloj } from './actividades-reloj'
import type { UnionReloj } from './reloj-sesion'

/* La base en memoria del proyecto, con lo que le falta para esto: la sesión de
   quien escribe y el `upsert` sobre una columna única. */
function base(inicial: Record<string, any[]> = {}) {
  const b = baseEnMemoria(inicial)
  return {
    ...b,
    auth: { getSession: async () => ({ data: { session: { user: { id: 'yo' } } } }) },
    from(t: string) {
      const q = b.from(t)
      q.upsert = (v: any, o: { onConflict: string }) => {
        const ya = (b.tablas[t] || []).find(f => String(f[o.onConflict]) === String(v[o.onConflict]))
        return ya ? b.from(t).update(v).eq('id', ya.id) : b.from(t).insert(v)
      }
      return q
    },
  }
}

const actividad = (o: Partial<ActividadReloj> = {}): ActividadReloj => ({
  id: 900, proveedor: 'coros', fecha: '2026-10-22', hora: '10:40', inicio: '2026-10-22T08:40:00.000Z',
  disciplina: 'Carrera', deporte: 'Al aire libre', minutos: 31, metros: 4600, fcMedia: 142, fcMax: 158, calorias: 300, cargaDelReloj: null,
  ...o,
})

/* La sesión del jueves 22 con una sola tarea, sin cerrar. */
const inicial = () => ({
  sesion: [{ id: 22, id_deportista: 7, fecha_sesion: '2026-10-22', disciplina: 'Carrera', estado: 'Planificada', duracion_real: null, hora_inicio: null, rpe_reportado: null }],
  tarea: [{ id: 100, id_sesion: 22, orden: 1, disciplina: 'Carrera', fc_media: null, rpe_reportado: null }],
  p_distancia: [{ id: 1000, id_tarea: 100, metros_planeados: 4500, metros_reales: null }],
  reloj_union: [] as any[],
})
const sesion22 = () => sesionDelReloj({
  id: 22, fecha_sesion: '2026-10-22', disciplina: 'Carrera', estado: 'Planificada', duracion_real: null, hora_inicio: null,
  tarea: [{ id: 100, orden: 1, disciplina: 'Carrera', fc_media: null, p_distancia: [{ id: 1000, metros_reales: null }] }],
})

describe('cerrar una sesión con los datos del reloj', () => {
  it('la fila con lo que había, y en la sesión la duración, la hora, la FC, los metros y el RPE de quien lo dijo', async () => {
    const sb = base(inicial())
    const a = actividad()
    const err = await ponerDatosDelReloj(sb, {
      idDeportista: 7, sesion: sesion22(), datos: { uniones: [], actividades: [a] },
      nuevas: [{ actividad: a, parte: 1 }], cierre: { rpe: 4, origen: 'atleta' },
    })
    expect(err).toBeNull()
    expect(sb.tablas.reloj_union).toHaveLength(1)
    expect(sb.tablas.reloj_union[0]).toMatchObject({
      id_deportista: 7, id_medicion: 900, id_sesion: 22, parte: 1, decision: 'unida', decidido_por: 'yo',
      antes: { duracion_real: null, hora_inicio: null, tareas: [{ id: 100, fc_media: null, metros_reales: null }] },
    })
    expect(sb.tablas.sesion[0]).toMatchObject({ estado: 'Realizada', duracion_real: 31, hora_inicio: '2026-10-22T08:40:00.000Z', rpe_reportado: 4, rpe_origen: 'atleta' })
    expect(sb.tablas.tarea[0]).toMatchObject({ fc_media: 142, rpe_reportado: 4 })
    expect(sb.tablas.p_distancia[0]).toMatchObject({ metros_reales: 4600 })
  })

  it('primero la fila: si la sesión no se deja cambiar, se dice y desunir no rompe nada', async () => {
    const sb = base(inicial())
    sb.falla('sesion', 'update', { message: 'permiso denegado' })
    const a = actividad()
    const err = await ponerDatosDelReloj(sb, {
      idDeportista: 7, sesion: sesion22(), datos: { uniones: [], actividades: [a] },
      nuevas: [{ actividad: a, parte: 1 }], cierre: { rpe: 4, origen: 'atleta' },
    })
    expect(err).toMatch(/No se han podido poner los datos del reloj/)
    expect(sb.tablas.reloj_union[0].antes).toMatchObject({ duracion_real: null })
    expect(sb.tablas.sesion[0].estado).toBe('Planificada')
  })

  it('una sesión que no existe para quien escribe (0 filas) es un fallo, no un éxito callado', async () => {
    const sb = base(inicial())
    const err = await aplicarEscrituras(sb, 999, { sesion: { duracion_real: 31 }, tareas: [], distancias: [], duraciones: [] })
    expect(err).toMatch(/no te deja cambiarla/)
  })
})

describe('desunir', () => {
  it('los datos del reloj salen y vuelve lo que había; su RPE y que está hecha, se quedan', async () => {
    const sb = base(inicial())
    const a = actividad()
    await ponerDatosDelReloj(sb, {
      idDeportista: 7, sesion: sesion22(), datos: { uniones: [], actividades: [a] },
      nuevas: [{ actividad: a, parte: 1 }], cierre: { rpe: 4, origen: 'atleta' },
    })
    const union = sb.tablas.reloj_union[0] as UnionReloj
    const cerrada = sesionDelReloj({
      ...sb.tablas.sesion[0],
      tarea: [{ ...sb.tablas.tarea[0], p_distancia: [{ id: 1000, metros_reales: 4600 }] }],
    })
    const err = await desunir(sb, union, cerrada, { uniones: [union], actividades: [a] })
    expect(err).toBeNull()
    expect(sb.tablas.reloj_union).toHaveLength(0)
    expect(sb.tablas.sesion[0]).toMatchObject({ estado: 'Realizada', rpe_reportado: 4, duracion_real: null, hora_inicio: null })
    expect(sb.tablas.tarea[0].fc_media).toBeNull()
    expect(sb.tablas.p_distancia[0].metros_reales).toBeNull()
  })

  it('una unión que no llegó a poner nada (sin RPE todavía): solo se borra la fila', async () => {
    const sb = base({ ...inicial(), reloj_union: [{ id: 5, id_medicion: 900, id_sesion: 22, parte: 1, decision: 'unida', antes: null }] })
    const err = await desunir(sb, sb.tablas.reloj_union[0] as UnionReloj, sesion22(), { uniones: sb.tablas.reloj_union as UnionReloj[], actividades: [actividad()] })
    expect(err).toBeNull()
    expect(sb.tablas.reloj_union).toHaveLength(0)
    expect(sb.peticiones.filter(p => p.tabla === 'sesion' && p.op === 'update')).toHaveLength(0)
  })
})

describe('las decisiones', () => {
  it('una por entreno: cambiarla reescribe la misma fila, a nombre de quien la cambia', async () => {
    const sb = base({ reloj_union: [{ id: 3, id_medicion: 900, id_sesion: 22, parte: 1, decision: 'rechazada', decidido_por: 'otro' }] })
    expect(await guardarDecision(sb, { idDeportista: 7, idMedicion: 900, decision: 'no_cuenta', idSesion: 22 })).toBeNull()
    expect(sb.tablas.reloj_union).toHaveLength(1)
    expect(sb.tablas.reloj_union[0]).toMatchObject({ id: 3, decision: 'no_cuenta', id_sesion: null, decidido_por: 'yo' })
  })
})

describe('apuntar un entreno que no estaba en el plan', () => {
  it('una sesión ya hecha con su RPE, en su semana, con los datos del reloj y unida a él', async () => {
    const sb = base({ microciclo: [{ id: 276, id_deportista: 7, fecha_inicio: '2026-10-19', duracion_dias: 7 }] })
    const a = actividad({ id: 901, fecha: '2026-10-25', disciplina: 'Ciclismo', minutos: 95, metros: 42300, fcMedia: 128, inicio: '2026-10-25T07:30:00.000Z' })
    const r = await apuntarDesdeReloj(sb, { idDeportista: 7, actividad: a, rpe: 4, quien: 'atleta' })
    expect(r.error).toBeNull()
    const s = sb.tablas.sesion.find((x: any) => x.id === r.idSesion)
    expect(s).toMatchObject({
      id_deportista: 7, id_microciclo: 276, disciplina: 'Ciclismo', fecha_sesion: '2026-10-25', estado: 'Realizada',
      rpe_reportado: 4, rpe_origen: 'atleta', duracion_real: 95, hora_inicio: '2026-10-25T07:30:00.000Z',
    })
    expect(sb.tablas.reloj_union[0]).toMatchObject({ id_medicion: 901, id_sesion: r.idSesion, decision: 'unida', parte: 1 })
  })

  it('si la apunta su entrenador, queda dicho que la apuntó y que el RPE se lo dio él', async () => {
    const sb = base({ microciclo: [] })
    const r = await apuntarDesdeReloj(sb, { idDeportista: 7, actividad: actividad({ id: 902 }), rpe: 5, quien: 'entrenador' })
    expect(sb.tablas.sesion.find((x: any) => x.id === r.idSesion)).toMatchObject({ origen: 'entrenador', rpe_origen: 'entrenador', id_microciclo: null })
  })

  it('caminar no se apunta', async () => {
    const sb = base()
    const r = await apuntarDesdeReloj(sb, { idDeportista: 7, actividad: actividad({ disciplina: null }), rpe: 3, quien: 'atleta' })
    expect(r.error).toMatch(/ninguna de tus disciplinas/)
    expect(sb.tablas.sesion || []).toHaveLength(0)
  })
})
