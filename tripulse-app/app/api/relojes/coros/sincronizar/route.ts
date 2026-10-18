// Sincronizar COROS.
//
// COROS no tiene un API normal, sino un servidor MCP que contesta con TEXTO
// para un chat. Esta ruta:
//
//   1. Renueva el token si le queda menos de un minuto (duran una hora).
//   2. Pide a COROS la lista de herramientas y guarda lo que pide cada una
//      (también las de escribir entrenos y planes, para cuando se usen).
//   3. Llama a las que interesan en el formato que ELLAS declaran
//      (lib/coros: argumentosCoros): el sueño y la FC en reposo de una vez, la
//      HRV del sueño de siete en siete días (no admite más). La primera vez,
//      cuando todavía no ha llegado ninguna noche, cuatro semanas; después, una.
//   4. TRADUCE el sueño, la HRV y la FC en reposo (lib/coros:
//      medicionesDeCoros, con el formato que devolvió la primera cuenta real
//      el 17-10-2026) y lo guarda en `reloj_medicion`, igual que Polar.
//   5. Guarda en `reloj_crudo` lo último que contestó cada herramienta, tal
//      cual. Los entrenos solo van ahí de momento: todavía no ha llegado
//      ninguno de verdad con el que escribir su lectura.
//
// Un fallo de una herramienta no tumba lo demás: se guarda lo que llegó y se
// devuelve un aviso para la pantalla.

import { json, quienLlama, ESPERA_MS } from '@/lib/relojes-servidor'
import {
  emisorCoros, mcpDe, hayQueRenovar, leerRenovacionCoros, inicializar, peticionMcp, leerRespuestaMcp,
  contenidoDeResultado, argumentosCoros, pareceErrorCoros, recortarParaAprender, motivoDeErrorCoros,
  medicionesDeCoros, tramosDeDias, HERRAMIENTAS_COROS, DIAS_POR_LLAMADA, DIAS_PRIMERA_VEZ, VERSION_MCP,
  type EsquemaEntrada,
} from '@/lib/coros'
import { hoyISO, sumarDias } from '@/lib/fechas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/* La primera vez son unas nueve llamadas seguidas a COROS (la HRV, de siete en siete días). */
export const maxDuration = 60

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

  /* Cuánto pedir: cuatro semanas si todavía no ha llegado ninguna noche suya de COROS.
     «Suya» de verdad: quien además entrena a otros ve también las de ellos. */
  const { count: nochesYa } = await q.sb.from('reloj_medicion')
    .select('id, deportista!inner(id_usuario)', { count: 'exact', head: true })
    .eq('deportista.id_usuario', q.uid).eq('proveedor', 'coros').eq('tipo', 'sueno')
  const hasta = hoyISO()
  const desde = sumarDias(hasta, -((nochesYa ? DIAS_POR_LLAMADA : DIAS_PRIMERA_VEZ) - 1))

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

  const crudo: { herramienta: string; datos: unknown }[] = []
  /* Lo que contestó bien cada herramienta (la HRV, una vez por tanda), para traducirlo. */
  const textos: Record<string, string[]> = {}
  const fallos: string[] = []
  let id = 20
  /** Una llamada: guarda lo último que contestó y, si no es un error, su texto. */
  const pedir = async (h: Herramienta, de: string, a: string) => {
    const argumentos = argumentosCoros(h.inputSchema, de, a)
    const r = await llamar(peticionMcp(id++, 'tools/call', { name: h.name, arguments: argumentos }))
    const res = r.mensaje?.result as { isError?: boolean } | undefined
    const resultado = contenidoDeResultado(res)
    const motivo = pareceErrorCoros(resultado)
    const esError = r.status !== 200 || !!res?.isError || !!r.mensaje?.error || !!motivo
    const fila = { herramienta: h.name, datos: recortarParaAprender({ argumentos, status: r.status, esError, error: r.mensaje?.error ?? motivo, resultado }) }
    const i = crudo.findIndex(c => c.herramienta === h.name)
    if (i >= 0) crudo[i] = fila
    else crudo.push(fila)
    if (esError || typeof resultado !== 'string') fallos.push(h.name)
    else (textos[h.name] ||= []).push(resultado)
  }

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
    crudo.push({
      herramienta: 'tools/list',
      datos: recortarParaAprender({
        todas: herramientas.map(h => h.name),
        esquemas: herramientas.map(h => ({ name: h.name, description: h.description, inputSchema: h.inputSchema, outputSchema: h.outputSchema })),
      }, 350_000),
    })

    for (const h of herramientas.filter(x => (HERRAMIENTAS_COROS as readonly string[]).includes(x.name))) {
      /* La HRV del sueño no admite más de siete días por llamada. */
      const tramos = h.name === 'querySleepHrv' ? tramosDeDias(desde, hasta, DIAS_POR_LLAMADA) : [{ desde, hasta }]
      for (const tr of tramos) await pedir(h, tr.desde, tr.hasta)
    }
  } catch (e) {
    const agotado = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    if (!crudo.length) return anotar(agotado ? 'COROS ha tardado demasiado en responder. Prueba más tarde.' : 'No se ha podido hablar con COROS.')
    /* Si algo llegó antes de fallar, se guarda y se traduce igual. */
    fallos.push('la conexión')
  }

  // ---- 4. Traducir y guardar ----
  const mediciones = medicionesDeCoros({
    sueno: textos.querySleepOverview?.[0] ?? null,
    hrv: textos.querySleepHrv ?? [],
    reposo: textos.queryRestingHeartRate?.[0] ?? null,
  })
  const { error: eGuardar } = await q.sb.rpc('reloj_guardar', { p_proveedor: 'coros', p_mediciones: mediciones, p_error: null })
  if (eGuardar) return json({ error: 'No se ha podido guardar lo recibido de COROS: ' + eGuardar.message }, 500)

  // ---- 5. Lo que contestó, tal cual ----
  await q.sb.rpc('reloj_guardar_crudo', { p_proveedor: 'coros', p_filas: crudo })

  const porTipo = (tipo: string) => mediciones.filter(m => m.tipo === tipo).length
  /* Lo que ha fallado, dicho como lo entiende el deportista. Los entrenos no
     cuentan: todavía no se leen, así que su fallo no le quita nada. */
  const QUE_ES: Record<string, string> = {
    querySleepOverview: 'el sueño', querySleepData: 'el sueño', querySleepHrv: 'la HRV del sueño',
    queryRestingHeartRate: 'la FC en reposo', 'la conexión': 'parte de la respuesta',
  }
  const falta = [...new Set(fallos.filter(f => QUE_ES[f]).map(f => QUE_ES[f]))]
  return json({
    noches: porTipo('sueno'),
    recargas: porTipo('recarga'),
    /* Los entrenos de COROS todavía no se leen: la pantalla no los cuenta. */
    entrenos: null,
    aviso: falta.length ? 'COROS no ha mandado ' + falta.join(' ni ') + '. Lo demás se ha guardado; prueba otra vez dentro de un rato.' : null,
  })
}
