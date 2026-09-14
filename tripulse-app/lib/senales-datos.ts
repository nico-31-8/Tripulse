// Lo que ha pasado con un atleta estas últimas semanas, pedido a la base.
//
// Va aparte para que los motores que lo consumen —`senales.ts` y
// `informe-semanal.ts`— no sepan de Supabase y se puedan probar enteros con
// datos a mano. Aquí solo se pide y se ordena.
//
// Hay DOS puertas, una para un atleta y otra para varios, y la de uno llama a la
// de varios. Es a propósito: la entrada del panel tiene que decir «este tiene
// señales» de todo el equipo, y si eso se calculara por otro camino acabaríamos
// con la entrada diciendo tres y el panel del atleta dos. Ya hemos pagado esa
// factura con el RPE.

import { senalesDeAtleta, type ResultadoSenales, type SesionSenal } from './senales'
import { cargarReferenciasDeVarios } from './referencia-zona'
import { estimarDuraciones, minutosCarga } from './duracion-carga'
import { vivas } from './papelera'
import { hoyISO, sumarDias } from './fechas'
import type { RegistroWellness } from './wellness-analisis'

/**
 * Días de historia que se piden.
 *
 * Cubre la base de wellness (3-4 semanas, L4.4), el mes de la sesión larga
 * (L4.3) y las cinco semanas del informe semanal — que en el peor caso, un
 * domingo, llega a 41 días atrás.
 */
const DIAS = 45

/** Las señales de un atleta. */
export async function cargarSenales(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, idDeportista: number, hoy: string = hoyISO(),
): Promise<ResultadoSenales> {
  const todas = await cargarSenalesDeVarios(supabase, [idDeportista], hoy)
  return todas.get(idDeportista) || { senales: [], sinBase: [] }
}

/** Las señales de varios atletas. */
export async function cargarSenalesDeVarios(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, ids: number[], hoy: string = hoyISO(),
): Promise<Map<number, ResultadoSenales>> {
  return senalesDeDatos(await cargarDatosDeVarios(supabase, ids, hoy), hoy)
}

/**
 * Las señales a partir de datos ya pedidos.
 *
 * Para quien necesita además el informe semanal: se piden los datos UNA vez y
 * de ahí salen las dos cosas, en vez de dos tandas de consultas a las mismas
 * tablas.
 */
export function senalesDeDatos(
  datos: Map<number, DatosAtleta>, hoy: string = hoyISO(),
): Map<number, ResultadoSenales> {
  const salida = new Map<number, ResultadoSenales>()
  for (const [id, d] of datos) salida.set(id, senalesDeAtleta({ ...d, hoy }))
  return salida
}

/** Lo que hay de un atleta en los últimos {@link DIAS} días, ya normalizado. */
export interface DatosAtleta {
  wellness: RegistroWellness[]
  sesiones: SesionSenal[]
}

/**
 * Los datos de varios atletas, con el mismo número de consultas que para uno.
 *
 * Wellness y sesiones se piden con un `in(...)` para todo el equipo, y las
 * cuatro consultas de la estimación de duración se hacen una sola vez sobre
 * todas las sesiones juntas; lo único que va por cabeza es qué tests usar para
 * traducir sus zonas, y eso ya lo resuelve `cargarReferenciasDeVarios`.
 *
 * De aquí comen las señales y el informe semanal. Van juntos a propósito: son
 * el mismo wellness y las mismas sesiones, y pedirlos dos veces es la puerta de
 * atrás para que un día digan cosas distintas.
 */
export async function cargarDatosDeVarios(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, ids: number[], hoy: string = hoyISO(),
): Promise<Map<number, DatosAtleta>> {
  const salida = new Map<number, DatosAtleta>()
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
    salida.set(id, {
      wellness: well.filter(w => w.id_deportista === id) as RegistroWellness[],
      sesiones: ses.filter(s => s.id_deportista === id).map(s => ({
        fecha_sesion: String(s.fecha_sesion).slice(0, 10),
        estado: s.estado,
        rpe_estimado: s.rpe_estimado,
        rpe_reportado: s.rpe_reportado,
        minutos: minutosCarga(s, estimaciones[s.id]),
      })),
    })
  }
  return salida
}
