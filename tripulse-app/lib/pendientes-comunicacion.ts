// ============================================================
// TRIPULSE — Lo que tiene el entrenador sin revisar en Comunicación
// ============================================================
// Para el aviso del panel principal. Cuenta lo MISMO que la bandeja de
// Comunicación, que es donde se lee y donde se marca como leído:
//
//   · mensajes del atleta sin leer (`mensajes.autor = 'deportista'`, `leido` falso);
//   · comentarios que deja al cerrar una sesión (`tarea.notas_post`) sin leer
//     (`comentario_leido` falso o nulo), de sesiones que no están en la papelera.
//
// Si el aviso contara otra cosa que la bandeja, diría «3 sin leer» y al entrar
// no aparecería nada: el aviso tiene que llevar exactamente a lo que anuncia.
//
// UN COMENTARIO POR SESIÓN (23-10-2026). El deportista deja el comentario UNA
// vez al cerrar la sesión, pero se guarda en cada una de sus tareas: es del
// día, como el dolor y la HRV, y el SICAT lo lee así. Contado tarea a tarea,
// una sesión de tres tareas eran tres comentarios: la bandeja lo pintaba tres
// veces y este aviso lo contaba tres. De 32 sesiones con comentario, 25 lo
// tenían repetido, hasta 10 veces. Ahora se cuenta uno por sesión y texto
// (unoPorSesion), aquí y en la bandeja.

import type { SupabaseClient } from '@supabase/supabase-js'
import { vivas } from './papelera'

export interface PendientesAtleta { mensajes: number; comentarios: number }

export interface Pendientes {
  porAtleta: Record<number, PendientesAtleta>
  mensajes: number
  comentarios: number
}

export const SIN_PENDIENTES: Pendientes = { porAtleta: {}, mensajes: 0, comentarios: 0 }

/** Agrupa por atleta lo que llega de las dos consultas. Pura: se prueba sola. */
export function resumirPendientes(
  mensajes: { id_deportista: number | null }[] | null | undefined,
  comentarios: { id_deportista: number | null }[] | null | undefined,
): Pendientes {
  const porAtleta: Record<number, PendientesAtleta> = {}
  const de = (id: number) => (porAtleta[id] ||= { mensajes: 0, comentarios: 0 })
  let nm = 0, nc = 0
  for (const m of mensajes || []) if (m?.id_deportista != null) { de(m.id_deportista).mensajes++; nm++ }
  for (const c of comentarios || []) if (c?.id_deportista != null) { de(c.id_deportista).comentarios++; nc++ }
  return { porAtleta, mensajes: nm, comentarios: nc }
}

/**
 * Uno por sesión y texto: el comentario va copiado en cada tarea de la sesión.
 * Si un día dos tareas llevaran comentarios distintos, salen los dos.
 */
export function unoPorSesion<T extends { id_sesion: number; notas_post?: string | null }>(filas: T[]): T[] {
  const vistos = new Set<string>()
  return filas.filter(f => {
    const k = f.id_sesion + '|' + (f.notas_post || '').trim()
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

/** Una tarjeta de comentario en la bandeja de Comunicación: una por sesión y texto. */
export interface TarjetaComentario {
  /** Todas las tareas que llevan ese comentario: leer la tarjeta las marca todas. */
  tareaIds: number[]
  sesionId: number
  fecha: string
  disciplina: string
  notas: string
  /** Leída solo si lo están todas sus tareas. */
  leido: boolean
  rpe: number | null
  depId: number
}

/**
 * Las tarjetas de la bandeja, de las tareas con comentario (cada una con su
 * sesión dentro): una por sesión y texto, solo de sus deportistas y fuera las
 * de la papelera, de la más nueva a la más vieja. El RPE, el de la sesión (en
 * un brick cada bloque lleva el suyo); si la sesión no lo tiene, el de la tarea.
 */
export function tarjetasDeComentarios(
  filas: {
    id: number; notas_post: string | null; comentario_leido: boolean | null; rpe_reportado: number | null
    sesion: { id: number; fecha_sesion: string; disciplina: string; id_deportista: number; eliminada?: boolean | null; rpe_reportado?: number | null }
      | { id: number; fecha_sesion: string; disciplina: string; id_deportista: number; eliminada?: boolean | null; rpe_reportado?: number | null }[] | null
  }[],
  suyos: Set<number>,
): TarjetaComentario[] {
  const porSesion = new Map<string, TarjetaComentario>()
  for (const t of filas) {
    const x = Array.isArray(t.sesion) ? t.sesion[0] : t.sesion
    if (!x || x.eliminada || !suyos.has(x.id_deportista)) continue
    const nota = (t.notas_post || '').trim()
    if (!nota) continue
    const clave = x.id + '|' + nota
    const ya = porSesion.get(clave)
    if (ya) { ya.tareaIds.push(t.id); ya.leido = ya.leido && !!t.comentario_leido; continue }
    porSesion.set(clave, {
      tareaIds: [t.id], sesionId: x.id, fecha: x.fecha_sesion, disciplina: x.disciplina, notas: t.notas_post as string,
      leido: !!t.comentario_leido, rpe: x.rpe_reportado ?? t.rpe_reportado ?? null, depId: x.id_deportista,
    })
  }
  return [...porSesion.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Cuánto tiene un atleta, sumando las dos cosas. */
export const totalDe = (p: Pendientes, idDeportista: number): number =>
  (p.porAtleta[idDeportista]?.mensajes || 0) + (p.porAtleta[idDeportista]?.comentarios || 0)

/** «3 mensajes y 1 comentario de sesión». Vacío si no hay nada. */
export function textoPendientes(p: Pendientes): string {
  const partes: string[] = []
  if (p.mensajes) partes.push(p.mensajes + (p.mensajes === 1 ? ' mensaje' : ' mensajes'))
  if (p.comentarios) partes.push(p.comentarios + (p.comentarios === 1 ? ' comentario de sesión' : ' comentarios de sesión'))
  return partes.join(' y ')
}

/**
 * Los atletas con algo pendiente, de más a menos, con su nombre.
 * Los que no están en la lista (un atleta que ya no es suyo) no salen.
 */
export function atletasConPendientes(
  p: Pendientes, deportistas: { id: number; nombre?: string | null }[],
): { id: number; nombre: string; total: number }[] {
  return deportistas
    .map(d => ({ id: d.id, nombre: (d.nombre || '').trim() || 'Deportista', total: totalDe(p, d.id) }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre))
}

/**
 * Las dos consultas. Si alguna falla, devuelve lo que haya podido contar: un
 * aviso que se queda corto es un incordio; uno que tumba el panel, no.
 */
export async function cargarPendientes(
  supabase: SupabaseClient, idEntrenador: string, depIds: number[],
): Promise<Pendientes> {
  if (!idEntrenador || !depIds.length) return SIN_PENDIENTES
  const [msgs, sesiones] = await Promise.all([
    supabase.from('mensajes').select('id_deportista')
      .eq('id_entrenador', idEntrenador).eq('autor', 'deportista').eq('leido', false),
    vivas(supabase.from('sesion').select('id, id_deportista').in('id_deportista', depIds)),
  ])

  const deSesion = new Map<number, number>()
  for (const s of (sesiones?.data || []) as { id: number; id_deportista: number }[]) deSesion.set(s.id, s.id_deportista)

  let comentarios: { id_deportista: number }[] = []
  if (deSesion.size) {
    const { data } = await supabase.from('tarea').select('id_sesion, notas_post')
      .in('id_sesion', [...deSesion.keys()])
      .not('notas_post', 'is', null).neq('notas_post', '')
      .or('comentario_leido.is.null,comentario_leido.eq.false')
    comentarios = unoPorSesion((data || []) as { id_sesion: number; notas_post: string | null }[])
      .map(t => ({ id_deportista: deSesion.get(t.id_sesion) as number }))
  }
  return resumirPendientes(msgs?.data, comentarios)
}
