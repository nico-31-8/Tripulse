import { describe, it, expect } from 'vitest'
import {
  partesDeSesion, tareasDeParte, estadoDeActividad, opcionesDeLaSemana, pendientesDelDeportista, relojParaSesion,
  escriturasConReloj, escriturasAlDesunir, antesDe, partesUnidas,
  type ActividadParaUnir, type SesionParaUnir, type UnionReloj, type TareaParaUnir,
} from './reloj-sesion'

/* La semana de la maqueta (Dani, del 19 al 25 de octubre de 2026), inventada. */
const ses = (o: Partial<SesionParaUnir> & { id: number; fecha: string; disciplina: string }): SesionParaUnir =>
  ({ estado: 'Planificada', partes: [o.disciplina], tareas: [], ...o })
const act = (o: Partial<ActividadParaUnir> & { id: number; fecha: string }): ActividadParaUnir =>
  ({ disciplina: 'Carrera', minutos: 31, metros: 4600, fcMedia: 142, inicio: o.fecha + 'T08:40:00.000Z', ...o })
const union = (o: Partial<UnionReloj> & { id_medicion: number }): UnionReloj =>
  ({ id: o.id_medicion * 10, id_sesion: null, parte: 1, decision: 'unida', ...o })

const JUE = ses({ id: 22, fecha: '2026-10-22', disciplina: 'Carrera' })
const SAB = ses({ id: 24, fecha: '2026-10-24', disciplina: 'Carrera' })
const MAR = ses({ id: 20, fecha: '2026-10-20', disciplina: 'Fuerza', estado: 'Realizada', rpe_reportado: 6 })
const SESIONES = [MAR, JUE, SAB]

describe('las partes de una sesión', () => {
  it('una en una sesión normal; en un brick, sus bloques seguidos', () => {
    expect(partesDeSesion('Carrera')).toEqual(['Carrera'])
    expect(partesDeSesion(null)).toEqual([])
    const brick = [{ disciplina: 'Ciclismo', orden: 1 }, { disciplina: 'Ciclismo', orden: 2 }, { disciplina: 'Carrera', orden: 3 }]
    expect(partesDeSesion('Brick', brick)).toEqual(['Ciclismo', 'Carrera'])
    expect(partesDeSesion('Brick', [...brick].reverse())).toEqual(['Ciclismo', 'Carrera'])
    expect(partesDeSesion('Brick', [
      { disciplina: 'Natacion', orden: 1 }, { disciplina: 'Ciclismo', orden: 2 }, { disciplina: 'Carrera', orden: 3 }, { disciplina: 'Ciclismo', orden: 4 },
    ])).toEqual(['Natacion', 'Ciclismo', 'Carrera'])
  })

  it('las tareas de cada parte de un brick', () => {
    const t: TareaParaUnir[] = [{ id: 1, orden: 1, disciplina: 'Ciclismo' }, { id: 2, orden: 2, disciplina: 'Ciclismo' }, { id: 3, orden: 3, disciplina: 'Carrera' }]
    expect(tareasDeParte({ disciplina: 'Brick' }, t, 1).map(x => x.id)).toEqual([1, 2])
    expect(tareasDeParte({ disciplina: 'Brick' }, t, 2).map(x => x.id)).toEqual([3])
    expect(tareasDeParte({ disciplina: 'Carrera' }, t, 1).map(x => x.id)).toEqual([1, 2, 3])
  })
})

describe('cómo está cada entreno del reloj', () => {
  it('ese día hay una sesión sin cerrar de esa disciplina: se sugiere', () => {
    expect(estadoDeActividad(act({ id: 1, fecha: '2026-10-22' }), SESIONES, [])).toMatchObject({ k: 'sugerida', sesion: { id: 22 }, parte: 1 })
  })

  it('de otra disciplina, o de un día sin nada: sin sesión', () => {
    expect(estadoDeActividad(act({ id: 2, fecha: '2026-10-25', disciplina: 'Ciclismo' }), SESIONES, [])).toEqual({ k: 'sin_sesion' })
    expect(estadoDeActividad(act({ id: 3, fecha: '2026-10-22', disciplina: 'Ciclismo' }), SESIONES, [])).toEqual({ k: 'sin_sesion' })
  })

  it('caminar no es ninguna de las nuestras: no cuenta, sin preguntar', () => {
    expect(estadoDeActividad(act({ id: 4, fecha: '2026-10-24', disciplina: null }), SESIONES, [])).toEqual({ k: 'no_cuenta', motivo: 'otro_deporte' })
  })

  it('la de ese día ya se cerró a mano: completar con el reloj', () => {
    expect(estadoDeActividad(act({ id: 5, fecha: '2026-10-20', disciplina: 'Fuerza' }), SESIONES, [])).toMatchObject({ k: 'completar', sesion: { id: 20 } })
  })

  it('varias sin cerrar ese día: se elige', () => {
    const doble = [...SESIONES, ses({ id: 99, fecha: '2026-10-22', disciplina: 'Carrera' })]
    const e = estadoDeActividad(act({ id: 6, fecha: '2026-10-22' }), doble, [])
    expect(e.k).toBe('varias')
    expect(e.k === 'varias' && e.opciones.map(o => o.sesion.id)).toEqual([22, 99])
  })

  it('unida: si su sesión aún no tiene RPE, falta su RPE', () => {
    const u = union({ id_medicion: 7, id_sesion: 22 })
    expect(estadoDeActividad(act({ id: 7, fecha: '2026-10-22' }), SESIONES, [u])).toMatchObject({ k: 'unida', faltaRpe: true })
    const hecha = SESIONES.map(s => (s.id === 22 ? { ...s, estado: 'Realizada', rpe_reportado: 4 } : s))
    expect(estadoDeActividad(act({ id: 7, fecha: '2026-10-22' }), hecha, [u])).toMatchObject({ k: 'unida', faltaRpe: false })
  })

  it('unida a una sesión que ya no está (en la papelera): se vuelve a mirar', () => {
    const u = union({ id_medicion: 8, id_sesion: 777 })
    expect(estadoDeActividad(act({ id: 8, fecha: '2026-10-22' }), SESIONES, [u])).toMatchObject({ k: 'sugerida', sesion: { id: 22 } })
  })

  it('«no es esa»: esa sesión no se vuelve a sugerir', () => {
    const u = union({ id_medicion: 9, id_sesion: 22, decision: 'rechazada' })
    expect(estadoDeActividad(act({ id: 9, fecha: '2026-10-22' }), SESIONES, [u])).toEqual({ k: 'sin_sesion' })
  })

  it('«no contarla»: no cuenta', () => {
    const u = union({ id_medicion: 10, decision: 'no_cuenta' })
    expect(estadoDeActividad(act({ id: 10, fecha: '2026-10-25', disciplina: 'Ciclismo' }), SESIONES, [u])).toMatchObject({ k: 'no_cuenta', motivo: 'descartada' })
  })

  it('una parte ya unida a otro entreno no se ofrece otra vez', () => {
    const u = union({ id_medicion: 11, id_sesion: 22 })
    expect(estadoDeActividad(act({ id: 12, fecha: '2026-10-22' }), SESIONES, [u])).toEqual({ k: 'sin_sesion' })
  })

  it('un brick: la bici a su parte 1 y la carrera a su parte 2', () => {
    const brick = ses({ id: 50, fecha: '2026-10-25', disciplina: 'Brick', partes: ['Ciclismo', 'Carrera'] })
    expect(estadoDeActividad(act({ id: 13, fecha: '2026-10-25', disciplina: 'Ciclismo' }), [brick], [])).toMatchObject({ k: 'sugerida', parte: 1 })
    expect(estadoDeActividad(act({ id: 14, fecha: '2026-10-25' }), [brick], [])).toMatchObject({ k: 'sugerida', parte: 2 })
  })
})

describe('si entrenó otro día', () => {
  it('las sesiones sin cerrar de esa semana, la más cercana primero', () => {
    const lunes = ses({ id: 19, fecha: '2026-10-19', disciplina: 'Carrera' })
    const otraSemana = ses({ id: 26, fecha: '2026-10-26', disciplina: 'Carrera' })
    const op = opcionesDeLaSemana(act({ id: 15, fecha: '2026-10-23' }), [lunes, ...SESIONES, otraSemana], [])
    expect(op.map(o => o.sesion.id)).toEqual([22, 24, 19])
  })

  it('ni las cerradas, ni las de otra disciplina, ni la que dijo que no era', () => {
    const u = union({ id_medicion: 16, id_sesion: 24, decision: 'rechazada' })
    expect(opcionesDeLaSemana(act({ id: 16, fecha: '2026-10-23' }), SESIONES, [u]).map(o => o.sesion.id)).toEqual([22])
    expect(opcionesDeLaSemana(act({ id: 17, fecha: '2026-10-23', disciplina: null }), SESIONES, [])).toEqual([])
  })
})

describe('lo de su reloj para la sesión que cierra', () => {
  it('lo que unió su entrenador, lo de ese día y lo de otros días de su semana', () => {
    const acts = [
      act({ id: 80, fecha: '2026-10-22' }),                         /* encaja con la del jueves */
      act({ id: 81, fecha: '2026-10-21' }),                         /* el miércoles: otro día de su semana */
      act({ id: 82, fecha: '2026-10-21', disciplina: 'Ciclismo' }), /* otra disciplina: no */
      act({ id: 83, fecha: '2026-10-28' }),                         /* otra semana: no */
    ]
    const r = relojParaSesion(22, acts, SESIONES, [])!
    expect(r.unidas).toEqual([])
    expect(r.sugeridas.map(x => x.actividad.id)).toEqual([80])
    expect(r.otras.map(x => x.actividad.id)).toEqual([81])
    const u = union({ id_medicion: 81, id_sesion: 22 })
    const conUnion = relojParaSesion(22, acts, SESIONES, [u])!
    expect(conUnion.unidas.map(x => x.actividad.id)).toEqual([81])
    /* Su parte ya está ocupada: lo del jueves ya no encaja en ella. */
    expect(conUnion.sugeridas).toEqual([])
    expect(relojParaSesion(999, acts, SESIONES, [])).toBeNull()
  })
})

describe('lo que su panel le pide', () => {
  it('lo unido sin su RPE, lo cerrado a mano y lo que no estaba en el plan; lo sugerido y lo de otros deportes, no', () => {
    const acts = [
      act({ id: 20, fecha: '2026-10-24' }),                         /* unida a SAB, sin RPE */
      act({ id: 21, fecha: '2026-10-25', disciplina: 'Ciclismo' }), /* sin sesión */
      act({ id: 22, fecha: '2026-10-24', disciplina: null }),       /* caminata */
      act({ id: 23, fecha: '2026-10-22' }),                         /* sugerida: no va al panel */
      act({ id: 24, fecha: '2026-10-20', disciplina: 'Fuerza' }),   /* completar */
    ]
    const p = pendientesDelDeportista(acts, SESIONES, [union({ id_medicion: 20, id_sesion: 24 })])
    expect(p.map(x => [x.k, x.actividad.id])).toEqual([['sin_apuntar', 21], ['falta_rpe', 20], ['completar', 24]])
  })
})

describe('lo que se escribe', () => {
  const tareaUna: TareaParaUnir = { id: 100, orden: 1, disciplina: 'Carrera', fc_media: null, p_distancia: [{ id: 1000, metros_reales: null }] }
  const conUna = { ...JUE, duracion_real: null, hora_inicio: null, tareas: [tareaUna] }

  it('al cerrar con el reloj: duración, hora, FC y metros de su única tarea, y el RPE de quien lo dijo', () => {
    const e = escriturasConReloj(conUna, [{ actividad: act({ id: 30, fecha: '2026-10-22' }), parte: 1 }], { rpe: 4, origen: 'atleta' })
    expect(e.sesion).toEqual({ duracion_real: 31, hora_inicio: '2026-10-22T08:40:00.000Z', estado: 'Realizada', rpe_reportado: 4, rpe_origen: 'atleta' })
    expect(e.tareas).toEqual([{ id: 100, campos: { fc_media: 142 } }])
    expect(e.distancias).toEqual([{ id: 1000, campos: { metros_reales: 4600 } }])
    expect(e.duraciones).toEqual([])
  })

  it('al completar una cerrada a mano: lo del reloj, sin tocar su estado ni su RPE', () => {
    const e = escriturasConReloj(conUna, [{ actividad: act({ id: 31, fecha: '2026-10-22' }), parte: 1 }])
    expect(e.sesion).toEqual({ duracion_real: 31, hora_inicio: '2026-10-22T08:40:00.000Z' })
  })

  /* Los metros van POR SERIE: el volumen los multiplica. 8,1 km en un 2×1500
     contarían 16,2 km. */
  it('una sola tarea con series: la FC sí, pero los metros y el tiempo no (van por serie)', () => {
    const series: TareaParaUnir = { id: 200, orden: 1, disciplina: 'Carrera', series: 2, p_distancia: [{ id: 2000, metros_reales: null }], p_duracion: [{ id: 3000, tiempo_real: null }] }
    const s = { ...SAB, tareas: [series] }
    const e = escriturasConReloj(s, [{ actividad: act({ id: 33, fecha: '2026-10-24', minutos: 52, metros: 8100, fcMedia: 151 }), parte: 1 }], { rpe: 7, origen: 'atleta' })
    expect(e.tareas).toEqual([{ id: 200, campos: { fc_media: 151 } }])
    expect(e.distancias).toEqual([])
    expect(e.duraciones).toEqual([])
    expect(e.sesion).toMatchObject({ duracion_real: 52 })
    expect(antesDe(s, [{ actividad: act({ id: 33, fecha: '2026-10-24' }), parte: 1 }]).tareas).toEqual([{ id: 200, fc_media: null }])
    const bloques = { ...series, series: 1, bloques: 3 }
    expect(escriturasConReloj({ ...SAB, tareas: [bloques] }, [{ actividad: act({ id: 34, fecha: '2026-10-24' }), parte: 1 }]).distancias).toEqual([])
  })

  /* En el modo entreno manda lo que escribió: su casilla de duración y lo que
     anotó serie a serie. */
  it('en el modo entreno, ni su duración ni lo que anotó: solo la hora y lo que falte', () => {
    const e = escriturasConReloj(conUna, [{ actividad: act({ id: 35, fecha: '2026-10-22' }), parte: 1 }], undefined, { fc: false, duracion: false, tareasAnotadas: [100] })
    expect(e.sesion).toEqual({ hora_inicio: '2026-10-22T08:40:00.000Z' })
    expect(e.tareas).toEqual([])
    expect(e.distancias).toEqual([])
    const sinAnotar = escriturasConReloj(conUna, [{ actividad: act({ id: 36, fecha: '2026-10-22' }), parte: 1 }], undefined, { fc: false, duracion: false })
    expect(sinAnotar.distancias).toEqual([{ id: 1000, campos: { metros_reales: 4600 } }])
  })

  it('con varias tareas, la FC y los metros del reloj no se reparten', () => {
    const varias = { ...JUE, tareas: [tareaUna, { id: 101, orden: 2, disciplina: 'Carrera' }] }
    const e = escriturasConReloj(varias, [{ actividad: act({ id: 32, fecha: '2026-10-22' }), parte: 1 }], { rpe: 5, origen: 'entrenador' })
    expect(e.tareas).toEqual([])
    expect(e.distancias).toEqual([])
    expect(e.sesion).toMatchObject({ duracion_real: 31, rpe_origen: 'entrenador' })
  })

  it('un brick: suma los minutos de sus partes y empieza con la primera', () => {
    const brick: SesionParaUnir = {
      ...ses({ id: 50, fecha: '2026-10-25', disciplina: 'Brick', partes: ['Ciclismo', 'Carrera'] }),
      tareas: [{ id: 1, orden: 1, disciplina: 'Ciclismo', p_duracion: { id: 7, tiempo_real: null } }, { id: 2, orden: 2, disciplina: 'Carrera' }],
    }
    const e = escriturasConReloj(brick, [
      { actividad: act({ id: 40, fecha: '2026-10-25', disciplina: 'Carrera', minutos: 20, fcMedia: 160, inicio: '2026-10-25T10:05:00.000Z' }), parte: 2 },
      { actividad: act({ id: 41, fecha: '2026-10-25', disciplina: 'Ciclismo', minutos: 90, fcMedia: 140, inicio: '2026-10-25T08:30:00.000Z' }), parte: 1 },
    ], { rpe: 6, origen: 'atleta' })
    expect(e.sesion).toMatchObject({ duracion_real: 110, hora_inicio: '2026-10-25T08:30:00.000Z' })
    expect(e.tareas).toEqual([{ id: 2, campos: { fc_media: 160 } }, { id: 1, campos: { fc_media: 140 } }])
    expect(e.duraciones).toEqual([{ id: 7, campos: { tiempo_real: 5400 } }])
  })

  it('lo de antes se guarda, y al desunir vuelve', () => {
    const cerrada = { ...conUna, estado: 'Realizada', duracion_real: 35, hora_inicio: null, tareas: [{ ...tareaUna, fc_media: 150 }] }
    const antes = antesDe(cerrada, [{ actividad: act({ id: 50, fecha: '2026-10-22' }), parte: 1 }])
    expect(antes).toEqual({ duracion_real: 35, hora_inicio: null, tareas: [{ id: 100, fc_media: 150, metros_reales: null }] })
    const d = escriturasAlDesunir(cerrada, union({ id_medicion: 50, id_sesion: 22, antes }), [])
    expect(d.sesion).toEqual({ duracion_real: 35, hora_inicio: null })
    expect(d.tareas).toEqual([{ id: 100, campos: { fc_media: 150 } }])
    expect(d.distancias).toEqual([{ id: 1000, campos: { metros_reales: null } }])
  })

  it('al desunir una parte de un brick, la duración sale de la que queda', () => {
    const brick: SesionParaUnir = { ...ses({ id: 50, fecha: '2026-10-25', disciplina: 'Brick', partes: ['Ciclismo', 'Carrera'] }), tareas: [] }
    const queda = [{ actividad: act({ id: 61, fecha: '2026-10-25', disciplina: 'Ciclismo', minutos: 90, inicio: '2026-10-25T08:30:00.000Z' }), parte: 1 }]
    const d = escriturasAlDesunir(brick, union({ id_medicion: 60, id_sesion: 50, parte: 2, antes: { duracion_real: null, hora_inicio: null, tareas: [] } }), queda)
    expect(d.sesion).toEqual({ duracion_real: 90, hora_inicio: '2026-10-25T08:30:00.000Z' })
  })

  it('las partes unidas de una sesión, con su entreno', () => {
    const acts = [act({ id: 70, fecha: '2026-10-25' }), act({ id: 71, fecha: '2026-10-25' })]
    const us = [union({ id_medicion: 70, id_sesion: 50, parte: 2 }), union({ id_medicion: 71, id_sesion: 50, parte: 1 }), union({ id_medicion: 72, id_sesion: 50, decision: 'rechazada' })]
    expect(partesUnidas(50, us, acts).map(p => [p.actividad.id, p.parte])).toEqual([[70, 2], [71, 1]])
    expect(partesUnidas(50, us, acts, 70).map(p => p.actividad.id)).toEqual([71])
  })
})
