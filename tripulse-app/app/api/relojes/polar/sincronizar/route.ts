// Traer de Polar lo último: noches, Nightly Recharge y entrenos.
//
// Lo pide el propio deportista (botón, o al abrir su perfil). Se usan las
// rutas NO transaccionales de Polar, que devuelven los últimos 28 días de sueño
// y recarga y los últimos 30 de entrenos cada vez, sin tener que confirmar
// nada. Pedir dos veces lo mismo no duplica: la base actualiza lo que ya tenía.
//
// OJO CON LOS ENTRENOS: Polar solo da los que se subieron a Polar Flow DESPUÉS
// de conectar. Un atleta recién conectado puede ver sus noches y ningún
// entreno, y no es un fallo.
//
// Lo que llega va a `reloj_medicion`, con sus nombres de verdad. NO se vuelca
// todavía en `wellness`: la HRV de Polar es RMSSD de cuatro horas de sueño y
// la que se teclea es otra medida, y mezclarlas haría saltar la línea base.

import { json, quienLlama, ESPERA_MS } from '@/lib/relojes-servidor'
import { POLAR, medicionesDePolar, motivoDeError, type TipoMedicion } from '@/lib/polar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const q = await quienLlama(req)
  if (!q.ok) return q.respuesta

  const { data: filas, error: eTok } = await q.sb.rpc('reloj_token_propio', { p_proveedor: 'polar' })
  const t = Array.isArray(filas) ? filas[0] as { id_externo: string | null; access_token: string | null; caduca_en: string | null } : null
  if (eTok || !t?.access_token) return json({ error: 'No tienes Polar conectado.' }, 400)

  const anotar = async (error: string) => {
    await q.sb.rpc('reloj_guardar', { p_proveedor: 'polar', p_mediciones: [], p_error: error })
    return json({ error }, 409)
  }

  /* Polar no renueva los tokens: dura un año y después hay que volver a
     conectar. Mejor decirlo antes que recibir un 401 sin explicación. */
  if (t.caduca_en && new Date(t.caduca_en).getTime() < Date.now()) {
    return anotar('La conexión con Polar ha caducado (dura un año). Desconecta y vuelve a conectar.')
  }

  const cab = { Authorization: 'Bearer ' + t.access_token, Accept: 'application/json' }
  const pedir = (ruta: string) =>
    fetch(POLAR.api + ruta, { headers: cab, cache: 'no-store', signal: AbortSignal.timeout(ESPERA_MS) })

  let rs: Response[]
  try {
    rs = await Promise.all(['/users/sleep', '/users/nightly-recharge', '/exercises'].map(pedir))
  } catch (e) {
    const agotado = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return anotar(agotado ? 'Polar ha tardado demasiado en responder. Prueba más tarde.' : 'No se ha podido hablar con Polar.')
  }

  /* 204 es «no hay nada», no un error. */
  const fallos = rs.filter(r => !r.ok && r.status !== 204)
  if (fallos.length === rs.length) return anotar(motivoDeError(fallos[0].status))

  const leer = async (r: Response) => (r.ok && r.status !== 204 ? await r.json().catch(() => null) : null)
  const [sueno, recarga, entrenos] = await Promise.all(rs.map(leer))
  const mediciones = medicionesDePolar({ sueno, recarga, entrenos })

  /* Un fallo parcial (una de las tres) no se guarda como error de la
     conexión: suele ser pasajero, y marcar «error» con datos recién llegados
     confundiría. Se devuelve para que la pantalla lo diga. */
  const { data: guardadas, error: eGuardar } = await q.sb.rpc('reloj_guardar', {
    p_proveedor: 'polar', p_mediciones: mediciones, p_error: null,
  })
  if (eGuardar) return json({ error: 'No se ha podido guardar lo recibido: ' + eGuardar.message }, 500)

  const porTipo = (tipo: TipoMedicion) => mediciones.filter(m => m.tipo === tipo).length
  return json({
    guardadas,
    noches: porTipo('sueno'),
    recargas: porTipo('recarga'),
    entrenos: porTipo('entreno'),
    aviso: fallos.length ? motivoDeError(fallos[0].status) : null,
  })
}
