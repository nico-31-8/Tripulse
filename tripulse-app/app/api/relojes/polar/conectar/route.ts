// Empezar a conectar Polar.
//
// El navegador no puede ir directo a Polar: primero hay que apuntar QUIÉN está
// conectando, porque la vuelta llega sin sesión. Esta ruta lo hace —la base
// genera un estado aleatorio de un solo uso ligado al deportista— y devuelve
// la dirección de Polar con ese estado dentro. El navegador solo tiene que ir.
//
// Solo el propio deportista: el permiso lo da el dueño de la cuenta de Polar.
// Si llama un entrenador, la base se niega (reloj_iniciar).

import { json, quienLlama } from '@/lib/relojes-servidor'
import { redirectPolar, urlAutorizacion } from '@/lib/polar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const clientId = process.env.POLAR_CLIENT_ID
  if (!clientId) return json({ error: 'El servidor no tiene configurada la conexión con Polar.' }, 500)

  const q = await quienLlama(req)
  if (!q.ok) return q.respuesta

  const { data: estado, error } = await q.sb.rpc('reloj_iniciar', { p_proveedor: 'polar' })
  if (error || typeof estado !== 'string') {
    return json({ error: error?.message || 'No se pudo empezar la conexión.' }, 400)
  }

  const redirect = redirectPolar(new URL(req.url).origin, process.env.POLAR_REDIRECT_URL)
  return json({ url: urlAutorizacion(clientId, redirect, estado) })
}
