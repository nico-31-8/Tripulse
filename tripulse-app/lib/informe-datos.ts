// El informe semanal de uno o de varios atletas, pedido a la base.
//
// Se apoya en `cargarDatosDeVarios` (lib/senales-datos): son el mismo wellness y
// las mismas sesiones que alimentan las señales, así que el informe y el panel
// no pueden contar historias distintas de la misma semana.

import { informeSemanal, type Informe } from './informe-semanal'
import { senalesDeAtleta } from './senales'
import { cargarDatosDeVarios, type DatosAtleta } from './senales-datos'
import { hoyISO, lunesDe, sumarDias } from './fechas'

/** El lunes de la semana pasada: la última que está cerrada. */
export const lunesDelInforme = (hoy: string = hoyISO()) => sumarDias(lunesDe(hoy), -7)

/** El informe de la semana pasada de varios atletas. */
export async function cargarInformesDeVarios(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, ids: number[], hoy: string = hoyISO(),
): Promise<Map<number, Informe>> {
  return informesDeDatos(await cargarDatosDeVarios(supabase, ids, hoy), hoy)
}

/** El informe a partir de datos ya pedidos (ver `senalesDeDatos`). */
export function informesDeDatos(
  datos: Map<number, DatosAtleta>, hoy: string = hoyISO(),
): Map<number, Informe> {
  const lunes = lunesDelInforme(hoy)
  const salida = new Map<number, Informe>()
  for (const [id, d] of datos) {
    /* Las señales van con el informe porque son lo que convierte «pasó esto» en
       «haría esto»: la propuesta de la semana que viene sale de su acción. */
    const { senales } = senalesDeAtleta({ ...d, hoy })
    salida.set(id, informeSemanal({ lunes, sesiones: d.sesiones, wellness: d.wellness, senales }))
  }
  return salida
}

/** El informe de la semana pasada de un atleta. */
export async function cargarInforme(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, idDeportista: number, hoy: string = hoyISO(),
): Promise<Informe | null> {
  const todos = await cargarInformesDeVarios(supabase, [idDeportista], hoy)
  return todos.get(idDeportista) || null
}
