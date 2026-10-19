// Traer de Polar lo último: noches, Nightly Recharge y entrenos.
//
// Lo pide el propio deportista (botón, o al abrir su perfil o su wellness).
// Cómo se trae, en lib/relojes-sincronizar: es lo mismo que hace el servidor
// dos veces al día, pero aquí con la sesión de quien llama.

import { json, quienLlama } from '@/lib/relojes-servidor'
import { accesoDelDeportista, sincronizarPolar } from '@/lib/relojes-sincronizar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const q = await quienLlama(req)
  if (!q.ok) return q.respuesta
  const r = await sincronizarPolar(accesoDelDeportista(q.sb, q.uid))
  return r.ok ? json(r.cuerpo) : json({ error: r.error }, r.status)
}
