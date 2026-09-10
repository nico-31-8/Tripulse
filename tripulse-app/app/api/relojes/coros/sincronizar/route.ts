// Sincronizar COROS: por ahora, APRENDER.
//
// COROS no publica los parámetros ni la forma de las respuestas de sus
// herramientas: su propio cliente los pide en marcha. Así que esta ruta, con
// una cuenta real, hace lo que haría falta para escribir la traducción con
// datos de verdad en vez de adivinando:
//
//   1. Renueva el token si le queda menos de un minuto (duran una hora).
//   2. Pide a COROS la lista de herramientas, con lo que pide cada una.
//   3. Llama a las cuatro que interesan (sueño, HRV del sueño, FC en reposo y
//      entrenos) con un rango de fechas en los parámetros que ELLAS declaran.
//   4. Guarda lo que conteste —resultado o error— en `reloj_crudo`.
//
// No se convierte nada en mediciones todavía, ni llega nada al wellness: el
// catálogo tiene COROS en «pruebas» y el formulario lo trata como si no hubiera
// reloj. Cuando haya respuestas reales guardadas, se escribe la traducción.

import { json, quienLlama, ESPERA_MS } from '@/lib/relojes-servidor'
import {
  emisorCoros, mcpDe, hayQueRenovar, leerRenovacionCoros, inicializar, peticionMcp, leerRespuestaMcp,
  contenidoDeResultado, argumentosDeFechas, recortarParaAprender, motivoDeErrorCoros, HERRAMIENTAS_COROS, VERSION_MCP,
  type EsquemaEntrada,
} from '@/lib/coros'
import { hoyISO, sumarDias } from '@/lib/fechas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface FilaToken { id_externo: string | null; access_token: string | null; refresh_token: string | null; extra: { cliente?: string; emisor?: string } | null; caduca_en: string | null }
interface Herramienta { name: string; description?: string; inputSchema?: EsquemaEntrada; outputSchema?: unknown }

export async function POST(req: Request) {
  const q = await quienLlama(req)
  if (!q.ok) return q.respuesta

  const { data: filas } = await q.sb.rpc('reloj_token_propio', { p_proveedor: 'coros' })
  const t = Array.isArray(filas) ? filas[0] as FilaToken : null
  if (!t?.access_token) return json({ error: 'No tienes COROS conectado.' }, 400)

  const anotar = async (error: string, status = 409) => {
    await q.sb.rpc('reloj_guardar', { p_proveedor: 'coros', p_mediciones: [], p_error: error })
    return json({ error }, status)
  }

  const emisor = emisorCoros(t.extra?.emisor)
  let access = t.access_token

  // ---- 1. Renovar, si toca ----
  if (hayQueRenovar(t.caduca_en)) {
    if (!t.refresh_token || !t.extra?.cliente) return anotar('La conexión con COROS está incompleta. Desconecta y vuelve a conectar.')
    try {
      const r = await fetch(emisor + '/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: t.extra.cliente, refresh_token: t.refresh_token }),
        signal: AbortSignal.timeout(ESPERA_MS),
        cache: 'no-store',
      })
      const nuevo = r.ok ? leerRenovacionCoros(await r.json().catch(() => null), t.refresh_token) : null
      if (!nuevo) return anotar('COROS ya no reconoce la conexión. Desconecta y vuelve a conectar tu cuenta.')
      const { error } = await q.sb.rpc('reloj_renovar', {
        p_proveedor: 'coros', p_access_token: nuevo.accessToken, p_refresh_token: nuevo.refreshToken, p_caduca_en: nuevo.caducaEn,
      })
      if (error) return anotar('No se ha podido guardar la conexión renovada con COROS.', 500)
      access = nuevo.accessToken
    } catch {
      return anotar('No se ha podido hablar con COROS. Prueba más tarde.')
    }
  }

  // ---- 2 y 3. Hablar MCP ----
  let sesion: string | null = null
  let iniciado = false
  const llamar = async (cuerpo: object): Promise<{ status: number; mensaje: Record<string, unknown> | null }> => {
    const cab: Record<string, string> = {
      Authorization: 'Bearer ' + access,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    /* La versión se manda a partir de la segunda petición, como pide MCP. */
    if (iniciado) cab['MCP-Protocol-Version'] = VERSION_MCP
    if (sesion) cab['Mcp-Session-Id'] = sesion
    const r = await fetch(mcpDe(emisor), {
      method: 'POST', headers: cab, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(ESPERA_MS), cache: 'no-store',
    })
    /* El servidor de COROS ya no necesita sesión, pero si la da se devuelve:
       así funciona igual si algún día vuelve a pedirla. */
    sesion = r.headers.get('mcp-session-id') || sesion
    return { status: r.status, mensaje: leerRespuestaMcp(await r.text(), r.headers.get('content-type')) }
  }

  const aprendido: { herramienta: string; datos: unknown }[] = []
  try {
    const ini = await llamar(inicializar(1))
    if (ini.status !== 200 || !ini.mensaje || 'error' in ini.mensaje) return anotar(motivoDeErrorCoros(ini.status || 500))
    iniciado = true
    /* El aviso de «ya estoy listo» no tiene respuesta (202): se manda y ya. */
    await llamar({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => null)

    // La lista, con paginación por si acaso (con tope: no se va a quedar dando vueltas).
    const herramientas: Herramienta[] = []
    let cursor: string | undefined
    for (let i = 0; i < 5; i++) {
      const lista = await llamar(peticionMcp(2 + i, 'tools/list', cursor ? { cursor } : {}))
      const res = lista.mensaje?.result as { tools?: Herramienta[]; nextCursor?: string } | undefined
      if (lista.status !== 200 || !Array.isArray(res?.tools)) return anotar(motivoDeErrorCoros(lista.status || 500))
      herramientas.push(...res.tools)
      if (!res.nextCursor) break
      cursor = res.nextCursor
    }

    const interesan = herramientas.filter(h => (HERRAMIENTAS_COROS as readonly string[]).includes(h.name))
    aprendido.push({
      herramienta: 'tools/list',
      datos: recortarParaAprender({
        todas: herramientas.map(h => h.name),
        interesan: interesan.map(h => ({ name: h.name, description: h.description, inputSchema: h.inputSchema, outputSchema: h.outputSchema })),
      }),
    })

    const hasta = hoyISO()
    const desde = sumarDias(hasta, -27)
    let id = 20
    for (const h of interesan) {
      const argumentos = argumentosDeFechas(h.inputSchema, desde, hasta)
      const r = await llamar(peticionMcp(id++, 'tools/call', { name: h.name, arguments: argumentos }))
      const res = r.mensaje?.result as { isError?: boolean } | undefined
      aprendido.push({
        herramienta: h.name,
        datos: recortarParaAprender({
          argumentos,
          status: r.status,
          esError: !!res?.isError || !!r.mensaje?.error,
          error: r.mensaje?.error ?? null,
          resultado: contenidoDeResultado(res),
        }),
      })
    }
  } catch (e) {
    const agotado = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    if (!aprendido.length) return anotar(agotado ? 'COROS ha tardado demasiado en responder. Prueba más tarde.' : 'No se ha podido hablar con COROS.')
    /* Si algo llegó antes de fallar, se guarda: sirve para aprender igual. */
  }

  // ---- 4. Guardar lo aprendido ----
  const { data: n, error: eCrudo } = await q.sb.rpc('reloj_guardar_crudo', { p_proveedor: 'coros', p_filas: aprendido })
  if (eCrudo) return json({ error: 'No se ha podido guardar lo recibido de COROS: ' + eCrudo.message }, 500)
  await q.sb.rpc('reloj_guardar', { p_proveedor: 'coros', p_mediciones: [], p_error: null })

  return json({
    pendiente: true,
    aprendido: n,
    herramientas: aprendido.filter(a => a.herramienta !== 'tools/list').map(a => a.herramienta),
  })
}
