// Los datos que necesita el motor de señales (lib/senales), en una función.
//
// Va aparte para que `senales.ts` no sepa de Supabase y se pueda probar entero
// con datos a mano. Aquí solo se pide y se ordena.
//
// Hay DOS puertas, una para un atleta y otra para varios, y la de uno llama a la
// de varios. Es a propósito: la entrada del panel tiene que decir «este tiene
// señales» de todo el equipo, y si eso se calculara por otro camino acabaríamos
// con la entrada diciendo tres y el panel del atleta dos. Ya hemos pagado esa
// factura con el RPE.

import { senalesDeAtleta, type ResultadoSenales } from './senales'
import { cargarReferenciasDeVarios } from './referencia-zona'
import { estimarDuraciones, minutosCarga } from './duracion-carga'
import { vivas } from './papelera'
import { hoyISO, sumarDias } from './fechas'
import type { RegistroWellness } from './wellness-analisis'

/** Días de historia que se miran. Cubre la base de wellness (3-4 semanas) y el mes de la sesión larga. */
const DIAS = 45

/** Las señales de un atleta. */
export async function cargarSenales(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, idDeportista: number, hoy: string = hoyISO(),
): Promise<ResultadoSenales> {
  const todas = await cargarSenalesDeVarios(supabase, [idDeportista], hoy)
  return todas.get(idDeportista) || { senales: [], sinBase: [] }
}

/**
 * Las señales de varios atletas, con el mismo número de consultas que para uno.
 *
 * Wellness y sesiones se piden con un `in(...)` para todo el equipo, y las
 * cuatro consultas de la estimación de duración se hacen una sola vez sobre
 * todas las sesiones juntas; lo único que va por cabeza es qué tests usar para
 * traducir sus zonas, y eso ya lo resuelve `cargarReferenciasDeVarios`.
 */
export async function cargarSenalesDeVarios(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, ids: number[], hoy: string = hoyISO(),
): Promise<Map<number, ResultadoSenales>> {
  const salida = new Map<number, ResultadoSenales>()
  const limpios = [...new Set((ids || []).filter(n => n != null))]
  if (!limpios.length) return salida

  const desde = sumarDias(hoy, -DIAS)

  const [wellQ, sesQ] = await Promise.all([
    supabase.from('wellness').select('*').in('id_deportista', limpios)
      .gte('fecha', desde).order('fecha', { ascending: false }),
    /* Todas, no solo las realizadas: las que se quedaron sin hacer son parte de
       lo que hay que mirar. La papelera no cuenta. */
    vivas(supabase.from('sesion')
      .select('id, id_deportista, fecha_sesion, estado, rpe_estimado, rpe_reportado, duracion_minutos, duracion_real')
      .in('id_deportista', limpios).gte('fecha_sesion', desde).lte('fecha_sesion', hoy)),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ses: any[] = sesQ?.data || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const well: any[] = wellQ?.data || []

  let estimaciones: Awaited<ReturnType<typeof estimarDuraciones>> = {}
  if (ses.length) {
    try {
      const refs = await cargarReferenciasDeVarios(supabase, limpios)
      const duenoDe = new Map<number, number>(ses.map(s => [s.id, s.id_deportista]))
      estimaciones = await estimarDuraciones(supabase, ses.map(s => s.id),
        sid => refs.get(duenoDe.get(sid) as number)?.tests || {})
    } catch { /* sin estimación se usa la duración apuntada */ }
  }

  for (const id of limpios) {
    salida.set(id, senalesDeAtleta({
      wellness: well.filter(w => w.id_deportista === id) as RegistroWellness[],
      sesiones: ses.filter(s => s.id_deportista === id).map(s => ({
        fecha_sesion: String(s.fecha_sesion).slice(0, 10),
        estado: s.estado,
        rpe_estimado: s.rpe_estimado,
        rpe_reportado: s.rpe_reportado,
        minutos: minutosCarga(s, estimaciones[s.id]),
      })),
      hoy,
    }))
  }
  return salida
}
