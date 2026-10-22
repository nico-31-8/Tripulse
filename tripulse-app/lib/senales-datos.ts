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
import { duracionesDeAnidadas, minutosCarga, TAREAS_PARA_DURACION } from './duracion-carga'
import type { ResultadoDuracion, TestsDeportista } from './duracion'
import { vivas } from './papelera'
import { hoyISO, sumarDias } from './fechas'
import type { RegistroWellness } from './wellness-analisis'
import { nochesDeMediciones, DIAS_RECIENTES, DIAS_BASE, type NocheDelReloj } from './noches-del-reloj'
import { cargarAvanceDeVarios } from './pliometria-avance-datos'
import type { EntradaAvance } from './pliometria-avance'

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
  /** Las noches de su reloj de ahora, de sus últimas cuatro semanas. */
  noches?: NocheDelReloj[]
  /** Lo de sus saltos, solo si tiene su nivel de pliometría puesto. */
  saltos?: EntradaAvance | null
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

  /* UNA RONDA. Eran cuatro en fila: el wellness y las sesiones, luego las
     referencias de todos (que no dependían de nada), y luego las tareas de esas
     sesiones y sus metros para estimar cuánto duran. Ahora las tareas llegan
     DENTRO de las sesiones y las referencias van a la vez. Es lo que pinta las
     señales y el informe de la entrada del panel, con TODO el equipo. */
  const selSes = 'id, id_deportista, fecha_sesion, estado, rpe_estimado, rpe_reportado, duracion_minutos, duracion_real'
  const [wellQ, sesQ, refs, noches, saltos] = await Promise.all([
    supabase.from('wellness').select('*').in('id_deportista', limpios)
      .gte('fecha', desde).order('fecha', { ascending: false }),
    /* Todas, no solo las realizadas: las que se quedaron sin hacer son parte de
       lo que hay que mirar. La papelera no cuenta. */
    vivas(supabase.from('sesion')
      .select(selSes + ', ' + TAREAS_PARA_DURACION)
      .in('id_deportista', limpios).gte('fecha_sesion', desde).lte('fecha_sesion', hoy)),
    cargarReferenciasDeVarios(supabase, limpios).catch(() => new Map<number, { tests?: TestsDeportista }>()),
    /* Sin sus noches, las señales de siempre: el reloj suma, no bloquea. */
    cargarNochesDeVarios(supabase, limpios, hoy).catch(() => new Map<number, NocheDelReloj[]>()),
    /* Sus saltos: una consulta para saber quién tiene su nivel puesto, y de esos
       (normalmente pocos) lo demás. Sin ellos, las señales de siempre. */
    cargarAvanceDeVarios(supabase, limpios, { hoy, soloConNivel: true }).catch(() => new Map<number, EntradaAvance>()),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ses: any[] = sesQ?.data || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const well: any[] = wellQ?.data || []

  let estimaciones: Record<number, ResultadoDuracion> = {}
  if (ses.length) {
    try {
      const duenoDe = new Map<number, number>(ses.map(s => [s.id, s.id_deportista]))
      estimaciones = duracionesDeAnidadas(ses, sid => refs.get(duenoDe.get(sid) as number)?.tests || {})
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
      noches: noches.get(id) || [],
      saltos: saltos.get(id) ?? null,
    })
  }
  return salida
}

// ------------------------------------------------------------
// Las noches del reloj
// ------------------------------------------------------------

/** Lo que hace falta para compararlas: su última semana y sus tres semanas anteriores. */
const DIAS_NOCHES = DIAS_RECIENTES + DIAS_BASE

/**
 * Todas las filas de una consulta, de mil en mil. Supabase no da más de 1000 de
 * una vez, y sin avisar: con un equipo grande las noches pasan de ahí (dos filas
 * por noche y por reloj). Si una página falla, se queda con lo que ya tiene.
 */
export async function todasLasFilas<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>, tam = 1000,
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; desde < tam * 100; desde += tam) {
    const { data, error } = await pedir(desde, desde + tam - 1)
    if (error || !data) break
    filas.push(...data)
    if (data.length < tam) break
  }
  return filas
}

export interface FilaNoche { id_deportista: number; tipo: string; fecha: string; proveedor: string | null; datos: unknown }

/**
 * Las noches de su reloj de ahora: el de la noche más reciente. Si cambió de
 * marca, las del reloj de antes no se mezclan con las del nuevo, que se
 * comparan solo consigo mismas (como en la pestaña «Sus noches»).
 */
export function nochesDelRelojActual(filas: FilaNoche[]): NocheDelReloj[] {
  let proveedor: string | null = null
  let ultima = ''
  for (const f of filas) {
    const fecha = String(f.fecha).slice(0, 10)
    if (f.proveedor && fecha > ultima) { ultima = fecha; proveedor = f.proveedor }
  }
  return proveedor ? nochesDeMediciones(filas, proveedor) : []
}

/** Las noches de las últimas cuatro semanas de cada uno, con una sola consulta (por páginas). */
export async function cargarNochesDeVarios(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, ids: number[], hoy: string = hoyISO(),
): Promise<Map<number, NocheDelReloj[]>> {
  const salida = new Map<number, NocheDelReloj[]>()
  if (!ids.length) return salida
  const filas = await todasLasFilas<FilaNoche>((desde, hasta) => supabase.from('reloj_medicion')
    .select('id_deportista, tipo, fecha, proveedor, datos')
    .in('id_deportista', ids).in('tipo', ['sueno', 'recarga'])
    .gte('fecha', sumarDias(hoy, -DIAS_NOCHES)).lte('fecha', hoy)
    .order('fecha', { ascending: false }).order('id', { ascending: true })
    .range(desde, hasta))
  for (const id of ids) {
    const suyas = filas.filter(f => f.id_deportista === id)
    if (suyas.length) salida.set(id, nochesDelRelojActual(suyas))
  }
  return salida
}
