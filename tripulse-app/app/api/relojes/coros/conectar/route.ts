// Empezar a conectar COROS.
//
// Tres cosas, en este orden:
//   1. Apuntar quién conecta (estado de un solo uso en la base). Va primero
//      porque es donde se aplica «un reloj a la vez»: si ya tiene otro, se para
//      aquí, antes de dar de alta nada en COROS.
//   2. Dar de alta a TRIPULSE en COROS. Es automático y sin secretos —cliente
//      público—, como hace el cliente oficial de COROS en cada conexión.
//   3. Preparar PKCE: el verificador se queda en una cookie HttpOnly de este
//      navegador y el reto viaja a COROS. Ver lib/coros.ts para el porqué.

import { json, quienLlama, ESPERA_MS } from '@/lib/relojes-servidor'
import {
  emisorCoros, redirectCoros, cuerpoRegistro, crearVerificador, retoDe, urlAutorizacionCoros, cookiePkce,
} from '@/lib/coros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const q = await quienLlama(req)
  if (!q.ok) return q.respuesta

  // ---- 1. Quién conecta, y que no tenga ya otro reloj ----
  const { data: estado, error } = await q.sb.rpc('reloj_iniciar', { p_proveedor: 'coros' })
  if (error || typeof estado !== 'string') {
    return json({ error: error?.message || 'No se pudo empezar la conexión.' }, 400)
  }

  const emisor = emisorCoros(process.env.COROS_EMISOR)
  const redirect = redirectCoros(new URL(req.url).origin, process.env.COROS_REDIRECT_URL)

  // ---- 2. Alta de TRIPULSE en COROS ----
  let clientId: string
  try {
    const r = await fetch(emisor + '/connect/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(cuerpoRegistro(redirect)),
      signal: AbortSignal.timeout(ESPERA_MS),
      cache: 'no-store',
    })
    const cuerpo = await r.json().catch(() => null) as { client_id?: unknown } | null
    if (!r.ok || typeof cuerpo?.client_id !== 'string' || !cuerpo.client_id) {
      return json({ error: 'COROS no ha aceptado el alta de TRIPULSE (' + r.status + '). Prueba otra vez en un rato.' }, 502)
    }
    clientId = cuerpo.client_id
  } catch {
    return json({ error: 'No se ha podido hablar con COROS. Prueba otra vez en un rato.' }, 502)
  }

  // ---- 3. PKCE ----
  const verificador = crearVerificador()
  const url = urlAutorizacionCoros({ emisor, clientId, redirect, estado, reto: retoDe(verificador) })

  return new Response(JSON.stringify({ url }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': cookiePkce({ v: verificador, c: clientId, e: emisor }),
    },
  })
}
