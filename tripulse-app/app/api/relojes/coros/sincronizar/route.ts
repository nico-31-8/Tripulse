// Sincronizar COROS: el sueño, la HRV del sueño, la FC en reposo y los entrenos.
//
// Lo pide el propio deportista (botón, o al abrir su perfil o su wellness).
// Cómo se trae —el MCP de COROS, que contesta con texto—, en
// lib/relojes-sincronizar: es lo mismo que hace el servidor dos veces al día,
// pero aquí con la sesión de quien llama.

import { json, quienLlama } from '@/lib/relojes-servidor'
import { accesoDelDeportista, sincronizarCoros } from '@/lib/relojes-sincronizar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/* La primera vez son unas nueve llamadas seguidas a COROS (la HRV, de siete en siete días). */
export const maxDuration = 60

export async function POST(req: Request) {
  const q = await quienLlama(req)
  if (!q.ok) return q.respuesta
  const r = await sincronizarCoros(accesoDelDeportista(q.sb, q.uid))
  return r.ok ? json(r.cuerpo) : json({ error: r.error }, r.status)
}
