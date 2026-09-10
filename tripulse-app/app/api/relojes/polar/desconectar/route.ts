// Desconectar Polar.
//
// Dos pasos, en este orden: avisar a Polar para que retire el permiso, y
// borrar la conexión aquí. Si Polar no contesta, se borra igual —el deportista
// ha pedido desconectar y se desconecta— y se le dice que puede quitar el
// permiso también desde Polar Flow.
//
// Al borrar la conexión, el disparador de la base borra también el token del
// almacén cifrado. Lo ya recibido se queda: es su historial, igual que el
// wellness que escribió a mano, y sale en «Descargar todos mis datos».

import { json, quienLlama, ESPERA_MS } from '@/lib/relojes-servidor'
import { POLAR } from '@/lib/polar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const q = await quienLlama(req)
  if (!q.ok) return q.respuesta

  const { data: filas } = await q.sb.rpc('reloj_token_propio', { p_proveedor: 'polar' })
  const t = Array.isArray(filas) ? filas[0] as { id_externo: string | null; access_token: string | null } : null

  let avisadoPolar = false
  if (t?.access_token && t.id_externo) {
    try {
      const r = await fetch(POLAR.api + '/users/' + encodeURIComponent(t.id_externo), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + t.access_token, Accept: 'application/json' },
        signal: AbortSignal.timeout(ESPERA_MS),
        cache: 'no-store',
      })
      /* 404: Polar ya no lo tenía registrado. Para el deportista es lo mismo. */
      avisadoPolar = r.ok || r.status === 404
    } catch { /* se borra igual aquí abajo */ }
  }

  const { error } = await q.sb.rpc('reloj_desconectar', { p_proveedor: 'polar' })
  if (error) return json({ error: 'No se ha podido desconectar: ' + error.message }, 500)

  return json({
    ok: true,
    aviso: avisadoPolar ? null : 'Desconectado de TRIPULSE. No se ha podido avisar a Polar: si quieres, quita también el permiso desde tu cuenta de Polar Flow.',
  })
}
