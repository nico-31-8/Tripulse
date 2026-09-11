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
    const { data } = await supabase.from('tarea').select('id_sesion')
      .in('id_sesion', [...deSesion.keys()])
      .not('notas_post', 'is', null).neq('notas_post', '')
      .or('comentario_leido.is.null,comentario_leido.eq.false')
    comentarios = ((data || []) as { id_sesion: number }[])
      .map(t => ({ id_deportista: deSesion.get(t.id_sesion) as number }))
  }
  return resumirPendientes(msgs?.data, comentarios)
}
