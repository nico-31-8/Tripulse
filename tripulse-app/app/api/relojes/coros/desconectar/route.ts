// Desconectar COROS.
//
// Se intenta revocar el token en COROS, pero su servicio de revocación está
// pensado para clientes con secreto y TRIPULSE es un cliente público: puede
// que no lo acepte. Da igual para lo importante: la conexión se borra aquí, y
// con ella el token del Vault, así que TRIPULSE ya no puede leer nada. Si
// COROS no confirma la revocación, se le dice al atleta que puede quitar el
// permiso también desde su cuenta de COROS.

import { json, quienLlama, ESPERA_MS } from '@/lib/relojes-servidor'
import { emisorCoros } from '@/lib/coros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const q = await quienLlama(req)
  if (!q.ok) return q.respuesta

  const { data: filas } = await q.sb.rpc('reloj_token_propio', { p_proveedor: 'coros' })
  const t = Array.isArray(filas) ? filas[0] as { refresh_token: string | null; extra: { cliente?: string; emisor?: string } | null } : null

  let revocado = false
  if (t?.refresh_token && t.extra?.cliente) {
    try {
      const r = await fetch(emisorCoros(t.extra.emisor) + '/oauth2/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: t.refresh_token, token_type_hint: 'refresh_token', client_id: t.extra.cliente }),
        signal: AbortSignal.timeout(ESPERA_MS),
        cache: 'no-store',
      })
      revocado = r.ok
    } catch { /* se borra igual aquí abajo */ }
  }

  const { error } = await q.sb.rpc('reloj_desconectar', { p_proveedor: 'coros' })
  if (error) return json({ error: 'No se ha podido desconectar: ' + error.message }, 500)

  return json({
    ok: true,
    aviso: revocado ? null : 'Desconectado de TRIPULSE. Si quieres, quita también el permiso desde tu cuenta de COROS.',
  })
}
