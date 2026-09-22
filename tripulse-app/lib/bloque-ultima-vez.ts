// ============================================================
// La última vez que hizo este mismo bloque
// ============================================================
// Como el «modo mejora» de la fuerza (lib/modo-mejora), pero con el resultado
// del bloque: «La última vez: 6 rondas + 8». «El mismo bloque» es el mismo
// formato con los mismos ejercicios (lib/bloque-formato, firmaBloque): los
// kilos o las rondas pueden cambiar de una semana a otra; lo que se hace, no.

import type { SupabaseClient } from '@supabase/supabase-js'
import { esBloque, firmaBloque, leerResultado, type ResultadoBloque, type LineaBloque } from './bloque-formato'

export interface UltimaVezBloque {
  fecha: string
  dias: number
  resultado: ResultadoBloque
}

export interface BloqueHecho {
  fecha: string
  formato?: string | null
  resultado?: unknown
  ejercicios?: LineaBloque[] | null
}

const diasEntre = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))

/** De los bloques hechos antes, el más reciente que sea el mismo y tenga resultado. */
export function elegirUltimaVez(
  tarea: { formato?: string | null; ejercicios?: LineaBloque[] | null },
  hechos: BloqueHecho[],
  hoy: string,
): UltimaVezBloque | null {
  const firma = firmaBloque(tarea.formato, tarea.ejercicios)
  const mismo = hechos
    .filter(h => h.fecha < hoy && firmaBloque(h.formato, h.ejercicios) === firma && leerResultado(h.resultado))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  if (!mismo) return null
  return { fecha: mismo.fecha, dias: diasEntre(mismo.fecha, hoy), resultado: leerResultado(mismo.resultado)! }
}

/**
 * La última vez de cada bloque de la sesión, en UNA consulta: los bloques
 * con resultado de este deportista, de antes de hoy y de esos formatos.
 */
export async function cargarUltimasVeces(
  sb: SupabaseClient,
  idDeportista: number,
  hoy: string,
  tareas: { id: number; formato?: string | null; ejercicios?: LineaBloque[] | null }[],
): Promise<Record<number, UltimaVezBloque | null>> {
  const bloques = tareas.filter(esBloque)
  if (!bloques.length || !idDeportista) return {}
  const formatos = [...new Set(bloques.map(t => t.formato as string))]
  const { data, error } = await sb.from('tarea')
    .select('id, formato, resultado, ejercicios(nombre, cardio_modo, tipo_serie), sesion!inner(fecha_sesion, id_deportista)')
    .in('formato', formatos)
    .not('resultado', 'is', null)
    .eq('sesion.id_deportista', idDeportista)
    .lt('sesion.fecha_sesion', hoy)
    .limit(300)
  if (error) return {}
  /* La sesión llega embebida: un objeto, o una lista de uno según cómo la tipe el cliente. */
  type Fila = { formato: string | null; resultado: unknown; ejercicios: LineaBloque[] | null; sesion: { fecha_sesion: string } | { fecha_sesion: string }[] | null }
  const hechos: BloqueHecho[] = ((data || []) as unknown as Fila[]).map(r => ({
    fecha: String((Array.isArray(r.sesion) ? r.sesion[0] : r.sesion)?.fecha_sesion || '').slice(0, 10),
    formato: r.formato, resultado: r.resultado, ejercicios: r.ejercicios,
  }))
  return Object.fromEntries(bloques.map(t => [t.id, elegirUltimaVez(t, hechos, hoy)]))
}
