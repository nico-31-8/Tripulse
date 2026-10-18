// ============================================================
// TRIPULSE — Hablar con el MCP de COROS (solo en el servidor)
// ============================================================
// El saludo y las llamadas, como los hace la ruta de sincronizar: la versión
// del protocolo a partir de la segunda petición, la sesión si el servidor la
// da, y el aviso de «listo» sin esperar respuesta. Lo usa la ruta que manda
// entrenos; la de sincronizar sigue con su copia, que funciona, hasta que
// convenga juntarlas.

import { mcpDe, inicializar, peticionMcp, leerRespuestaMcp, contenidoDeResultado, pareceErrorCoros, VERSION_MCP } from './coros'
import { ESPERA_MS } from './relojes-servidor'

export interface RespuestaHerramienta {
  ok: boolean
  status: number
  /** Lo que contestó, en texto. También cuando es un error: es lo que se enseña. */
  texto: string | null
  /** Por qué no fue bien, en una frase; null si fue bien. */
  error: string | null
}

export function clienteMcpCoros(emisor: string, access: string) {
  let sesion: string | null = null
  let iniciado = false
  let id = 1

  const llamar = async (cuerpo: object): Promise<{ status: number; mensaje: Record<string, unknown> | null }> => {
    const cab: Record<string, string> = {
      Authorization: 'Bearer ' + access,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (iniciado) cab['MCP-Protocol-Version'] = VERSION_MCP
    if (sesion) cab['Mcp-Session-Id'] = sesion
    const r = await fetch(mcpDe(emisor), {
      method: 'POST', headers: cab, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(ESPERA_MS), cache: 'no-store',
    })
    sesion = r.headers.get('mcp-session-id') || sesion
    return { status: r.status, mensaje: leerRespuestaMcp(await r.text(), r.headers.get('content-type')) }
  }

  return {
    /** El saludo. null si fue bien; si no, el código con que contestó. */
    async abrir(): Promise<number | null> {
      const ini = await llamar(inicializar(id++))
      if (ini.status !== 200 || !ini.mensaje || 'error' in ini.mensaje) return ini.status || 500
      iniciado = true
      await llamar({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => null)
      return null
    },

    /** Una herramienta, con sus argumentos tal cual. */
    async herramienta(name: string, args: Record<string, unknown>): Promise<RespuestaHerramienta> {
      const r = await llamar(peticionMcp(id++, 'tools/call', { name, arguments: args }))
      const res = r.mensaje?.result as { isError?: boolean } | undefined
      const contenido = contenidoDeResultado(res)
      const texto = typeof contenido === 'string' ? contenido : null
      const motivo = pareceErrorCoros(contenido)
      const fallo = (r.mensaje?.error as { message?: string } | undefined)?.message
      const ok = r.status === 200 && !res?.isError && !r.mensaje?.error && !motivo && texto != null
      return {
        ok, status: r.status, texto,
        error: ok ? null : (motivo || fallo || (texto ? texto.slice(0, 300) : null) || 'COROS ha contestado con un error (' + r.status + ').'),
      }
    },
  }
}
