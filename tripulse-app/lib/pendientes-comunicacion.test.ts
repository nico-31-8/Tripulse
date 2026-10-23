import { describe, it, expect } from 'vitest'
import { resumirPendientes, totalDe, textoPendientes, atletasConPendientes, SIN_PENDIENTES, unoPorSesion, tarjetasDeComentarios } from './pendientes-comunicacion'

describe('tarjetasDeComentarios', () => {
  type Fila = Parameters<typeof tarjetasDeComentarios>[0][number]
  type Ses = { id: number; fecha_sesion: string; disciplina: string; id_deportista: number; eliminada?: boolean | null; rpe_reportado?: number | null }
  const ses = (id: number, extra: Partial<Ses> = {}): Ses => ({ id, fecha_sesion: '2026-10-22', disciplina: 'Carrera', id_deportista: 5, eliminada: false, rpe_reportado: null, ...extra })
  const fila = (id: number, sesion: Fila['sesion'], extra: Partial<Fila> = {}): Fila => ({ id, notas_post: 'vino Pedro', comentario_leido: false, rpe_reportado: 2, sesion, ...extra })

  it('el comentario copiado en las dos tareas de una sesión sale UNA vez, con las dos tareas', () => {
    const t = tarjetasDeComentarios([fila(1, ses(10)), fila(2, ses(10))], new Set([5]))
    expect(t).toHaveLength(1)
    expect(t[0].tareaIds).toEqual([1, 2])
    expect(t[0].rpe).toBe(2)
  })

  it('leída solo si lo están todas sus tareas; el RPE, el de la sesión', () => {
    const t = tarjetasDeComentarios([fila(1, ses(10, { rpe_reportado: 7 }), { comentario_leido: true }), fila(2, ses(10, { rpe_reportado: 7 }))], new Set([5]))
    expect(t[0].leido).toBe(false)
    expect(t[0].rpe).toBe(7)
  })

  it('sesiones distintas, tarjetas distintas, de la más nueva a la más vieja; fuera papelera y deportistas ajenos', () => {
    const t = tarjetasDeComentarios([
      fila(1, ses(10, { fecha_sesion: '2026-10-20' })),
      fila(2, ses(11, { fecha_sesion: '2026-10-22' })),
      fila(3, ses(12, { eliminada: true })),
      fila(4, ses(13, { id_deportista: 99 })),
      fila(5, [ses(14, { fecha_sesion: '2026-10-21' })]),
    ], new Set([5]))
    expect(t.map(x => x.sesionId)).toEqual([11, 14, 10])
  })
})

describe('unoPorSesion', () => {
  it('el comentario de una sesión cuenta una vez, aunque vaya en cada tarea', () => {
    const filas = [
      { id_sesion: 7, notas_post: 'vino Pedro y entrenamos juntos' },
      { id_sesion: 7, notas_post: 'vino Pedro y entrenamos juntos' },
      { id_sesion: 7, notas_post: ' vino Pedro y entrenamos juntos ' },
      { id_sesion: 8, notas_post: 'vino Pedro y entrenamos juntos' },
    ]
    expect(unoPorSesion(filas).map(f => f.id_sesion)).toEqual([7, 8])
  })
  it('dos comentarios distintos en la misma sesión salen los dos', () => {
    expect(unoPorSesion([{ id_sesion: 1, notas_post: 'a' }, { id_sesion: 1, notas_post: 'b' }])).toHaveLength(2)
  })
})

describe('resumirPendientes', () => {
  it('cuenta mensajes y comentarios por atleta', () => {
    const p = resumirPendientes(
      [{ id_deportista: 28 }, { id_deportista: 28 }, { id_deportista: 30 }],
      [{ id_deportista: 28 }],
    )
    expect(p.porAtleta[28]).toEqual({ mensajes: 2, comentarios: 1 })
    expect(p.porAtleta[30]).toEqual({ mensajes: 1, comentarios: 0 })
    expect(p.mensajes).toBe(3)
    expect(p.comentarios).toBe(1)
  })

  it('sin nada, nada; y no se cae con nulos', () => {
    expect(resumirPendientes(null, undefined)).toEqual(SIN_PENDIENTES)
    expect(resumirPendientes([{ id_deportista: null }], [])).toEqual(SIN_PENDIENTES)
  })
})

describe('totalDe', () => {
  const p = resumirPendientes([{ id_deportista: 28 }], [{ id_deportista: 28 }, { id_deportista: 28 }])
  it('suma las dos cosas', () => { expect(totalDe(p, 28)).toBe(3) })
  it('un atleta sin nada, cero', () => { expect(totalDe(p, 99)).toBe(0) })
})

describe('textoPendientes', () => {
  it('singular y plural bien puestos', () => {
    expect(textoPendientes(resumirPendientes([{ id_deportista: 1 }], []))).toBe('1 mensaje')
    expect(textoPendientes(resumirPendientes([{ id_deportista: 1 }, { id_deportista: 1 }], [{ id_deportista: 1 }])))
      .toBe('2 mensajes y 1 comentario de sesión')
    expect(textoPendientes(resumirPendientes([], [{ id_deportista: 1 }, { id_deportista: 2 }]))).toBe('2 comentarios de sesión')
  })
  it('sin nada, vacío: el aviso no se pinta', () => {
    expect(textoPendientes(SIN_PENDIENTES)).toBe('')
  })
})

describe('atletasConPendientes', () => {
  const deps = [{ id: 1, nombre: 'Marta' }, { id: 2, nombre: 'Bruno' }, { id: 3, nombre: 'Yago' }]
  it('de más a menos, y a igualdad por nombre', () => {
    const p = resumirPendientes([{ id_deportista: 1 }, { id_deportista: 2 }, { id_deportista: 2 }], [{ id_deportista: 3 }])
    expect(atletasConPendientes(p, deps).map(a => a.nombre + ' ' + a.total)).toEqual(['Bruno 2', 'Marta 1', 'Yago 1'])
  })
  it('los que no tienen nada no salen', () => {
    expect(atletasConPendientes(SIN_PENDIENTES, deps)).toEqual([])
  })
  it('un mensaje de alguien que ya no es de la lista no sale', () => {
    expect(atletasConPendientes(resumirPendientes([{ id_deportista: 77 }], []), deps)).toEqual([])
  })
})
