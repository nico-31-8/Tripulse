// ============================================================
// TRIPULSE — La HRV del reloj en el SICAT, frente a la base de su reloj
// ============================================================
// Decidido el 20-10-2026 (parte 5 de los relojes): la HRV del reloj entra en el
// SICAT como RESPALDO, en sus dos sitios (el corrector de cada deporte, con la
// HRV del día de la sesión, y el coste por zona, con la del día siguiente).
//
//   · Manda la de la MAÑANA —la del wellness o la que se apunta al cerrar la
//     sesión—, frente a la HRV basal de su ficha, con la cuenta de siempre.
//   · Si no la hay, o no hay basal con la que compararla, entra la de la NOCHE
//     del reloj, frente a la base DEL PROPIO RELOJ: la que calcula el reloj si la
//     trae (COROS) y, si no (Polar, o una noche de COROS sin ella), la media de
//     las noches de esa marca en las 4 semanas anteriores, con al menos 14. Sin
//     base, ese día no cuenta.
//   · Nunca se compara una HRV nocturna con la basal de la mañana ni con la de
//     otra marca: cada una se mide a su manera (Polar, en las primeras horas de
//     sueño; COROS, en la noche). Por eso cada día se pasa a «tanto por uno de
//     su base», y lo que se promedia es eso, nunca los milisegundos.
//
// La noche lleva la fecha de DESPERTARSE (ver nochesPorFecha en lib/noches-reloj),
// la misma que el wellness de esa mañana: la HRV «del día» de una sesión es la de
// la noche que acaba esa mañana.
//
// Sin Supabase al cargarse, para poder probarlo: la consulta recibe el cliente.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sumarDias } from './fechas'
import { NOCHES_MINIMAS_BASE } from './noches-del-reloj'

/** Las noches de antes con las que se hace su base, si el reloj no trae la suya. */
export const DIAS_BASE_RELOJ = 28

export interface FilaRecarga { proveedor?: string | null; fecha?: string | null; datos?: unknown }

const positivo = (x: unknown): number | null => {
  const n = typeof x === 'string' && x.trim() ? Number(x) : x
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * La HRV de cada noche del reloj en tanto por uno de la base de ese reloj, por
 * fecha de despertarse: 0,88 es «un 12 % por debajo de lo suyo». Una noche sin
 * base no sale. Si un día hay noche de dos marcas (el día que cambió de reloj),
 * la media de las dos, cada una frente a la suya.
 */
export function ratiosDelReloj(filas: FilaRecarga[] | null | undefined): Record<string, number> {
  const porMarca = new Map<string, Map<string, { hrv: number; base: number | null }>>()
  for (const f of filas || []) {
    const fecha = f?.fecha ? String(f.fecha).slice(0, 10) : ''
    const d = f?.datos && typeof f.datos === 'object' ? (f.datos as Record<string, unknown>) : null
    const hrv = positivo(d?.rmssd_ms)
    if (!fecha || !f.proveedor || hrv == null) continue
    let noches = porMarca.get(f.proveedor)
    if (!noches) porMarca.set(f.proveedor, (noches = new Map()))
    noches.set(fecha, { hrv, base: positivo(d?.hrv_linea_base_ms) })
  }

  const porFecha: Record<string, { suma: number; n: number }> = {}
  for (const delReloj of porMarca.values()) {
    const noches = [...delReloj.entries()]
      .map(([fecha, v]) => ({ fecha, ...v }))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    let primera = 0
    noches.forEach((noche, i) => {
      const desde = sumarDias(noche.fecha, -DIAS_BASE_RELOJ)
      while (noches[primera].fecha < desde) primera++
      const previas = noches.slice(primera, i)
      const base = noche.base
        ?? (previas.length >= NOCHES_MINIMAS_BASE ? previas.reduce((s, p) => s + p.hrv, 0) / previas.length : null)
      if (base == null) return
      const dia = porFecha[noche.fecha] || (porFecha[noche.fecha] = { suma: 0, n: 0 })
      dia.suma += noche.hrv / base
      dia.n++
    })
  }
  return Object.fromEntries(Object.entries(porFecha).map(([fecha, d]) => [fecha, d.suma / d.n]))
}

/**
 * Las de un deportista entre dos fechas, con las 4 semanas de antes que pide su
 * base. Si la consulta falla, o no puede leer su reloj, sale vacío y el SICAT
 * sigue con la de la mañana, como antes.
 *
 * Supabase devuelve 1000 filas como mucho: con más noches en el tramo (casi tres
 * años) se quedan las más recientes, que para eso van primero.
 */
export async function ratiosDelRelojEntre(
  sb: SupabaseClient, idDeportista: number, desde: string, hasta: string,
): Promise<Record<string, number>> {
  const { data } = await sb.from('reloj_medicion').select('proveedor, fecha, datos')
    .eq('id_deportista', idDeportista).eq('tipo', 'recarga')
    .gte('fecha', sumarDias(desde, -DIAS_BASE_RELOJ)).lte('fecha', hasta)
    .order('fecha', { ascending: false })
  return ratiosDelReloj(data)
}

/** De dónde salió la HRV del corrector, para decírselo al entrenador. */
export function fuenteHrvTexto(manana: number, reloj: number): string {
  if (!manana && !reloj) return 'Sin HRV: corrector neutro'
  const sesiones = (n: number) => n + (n === 1 ? ' sesión' : ' sesiones')
  if (!reloj) return 'HRV de ' + sesiones(manana) + ', de la mañana'
  if (!manana) return 'HRV de ' + sesiones(reloj) + ', del reloj'
  return 'HRV de ' + sesiones(manana + reloj) + ': ' + reloj + ' del reloj, ' + manana + ' de la mañana'
}
