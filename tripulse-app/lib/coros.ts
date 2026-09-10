// ============================================================
// TRIPULSE — COROS por MCP: darse de alta, pedir permiso y hablarle
// ============================================================
// SOLO PARA EL SERVIDOR (usa node:crypto). Lo usan las rutas de
// /api/relojes/coros; ninguna pantalla debe importarlo.
//
// COROS no tiene un API normal para esto, sino un servidor MCP: el protocolo
// que usan los asistentes de IA. Todo lo de aquí sigue al cliente oficial de
// COROS (paquete npm `coros-mcp`, de coros_openplatform) y a su documento de
// descubrimiento en mcp.coros.com/.well-known/oauth-authorization-server,
// comprobados el 10/09/2026:
//
// - ALTA DINÁMICA: la app se registra sola en /connect/register, sin
//   formularios ni secretos. Cliente público: la seguridad la da PKCE.
// - PERMISO: código de autorización + PKCE (S256) + `resource`, alcance
//   «openid offline_access mcp.tools».
// - TOKENS de una hora que se renuevan con el de renovación (offline_access).
// - MCP por HTTP: JSON-RPC 2.0 con `initialize` y `tools/call`. La respuesta
//   puede llegar como JSON o como flujo de eventos (text/event-stream).
//
// LO QUE NO SE SABE TODAVÍA: los parámetros exactos de cada herramienta y la
// forma de sus respuestas. COROS no los publica: su cliente oficial los pide
// en marcha con `tools/list`. Por eso aquí no hay traducción a mediciones: la
// primera cuenta conectada los enseña, se guardan en `reloj_crudo`, y la
// traducción se escribe entonces con datos de verdad.

import { createHash, randomBytes } from 'node:crypto'

/**
 * La región. Las cuentas de COROS viven en Europa, EE. UU. o China, y el token
 * de una no vale en otra. mcp.coros.com elige por la ubicación de QUIEN
 * PREGUNTA —y el servidor de TRIPULSE no está donde están los atletas—, así
 * que se fija Europa, que es donde están. Se guarda con cada conexión para
 * poder mezclar regiones el día que haga falta.
 */
export const EMISOR_COROS = 'https://mcpeu.coros.com'
export const emisorCoros = (forzado?: string | null) => (forzado && forzado.trim() ? forzado.trim().replace(/\/+$/, '') : EMISOR_COROS)
export const mcpDe = (emisor: string) => emisor + '/mcp'

export const ALCANCE_COROS = 'openid offline_access mcp.tools'
export const NOMBRE_CLIENTE = 'TRIPULSE'
export const VERSION_MCP = '2025-06-18'

/** Las herramientas que interesan. Los nombres son los del README oficial. */
export const HERRAMIENTAS_COROS = ['querySleepData', 'querySleepHrv', 'queryRestingHeartRate', 'querySportRecords'] as const

export const REDIRECT_COROS_PRODUCCION = 'https://tripulse-eight.vercel.app/api/relojes/coros/callback'

/**
 * La dirección de vuelta. Con COROS cada conexión registra la suya, así que
 * localhost también sirve para desarrollar, sin tocar ningún panel.
 */
export function redirectCoros(origen: string, forzada?: string | null): string {
  if (forzada && forzada.trim()) return forzada.trim()
  try {
    const u = new URL(origen)
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return u.origin + '/api/relojes/coros/callback'
  } catch { /* un origen raro no debe tumbar la conexión */ }
  return REDIRECT_COROS_PRODUCCION
}

/** Lo que se manda a /connect/register. Igual que el cliente oficial. */
export function cuerpoRegistro(redirect: string) {
  return {
    client_name: NOMBRE_CLIENTE,
    redirect_uris: [redirect],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: ALCANCE_COROS,
    token_endpoint_auth_method: 'none',
  }
}

// ------------------------------------------------------------
// PKCE
// ------------------------------------------------------------

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** El verificador: 32 bytes de azar, 43 caracteres. */
export const crearVerificador = (): string => b64url(randomBytes(32))

/** El reto que se manda al autorizar: SHA-256 del verificador. */
export const retoDe = (verificador: string): string => b64url(createHash('sha256').update(verificador, 'ascii').digest())

export function urlAutorizacionCoros(p: {
  emisor: string; clientId: string; redirect: string; estado: string; reto: string
}): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirect,
    scope: ALCANCE_COROS,
    code_challenge: p.reto,
    code_challenge_method: 'S256',
    resource: mcpDe(p.emisor),
    state: p.estado,
  })
  return p.emisor + '/oauth2/authorize?' + q.toString()
}

// ------------------------------------------------------------
// La cookie que guarda el verificador entre la ida y la vuelta
// ------------------------------------------------------------
//
// EL VERIFICADOR NO VA A LA BASE. La vuelta de COROS llega sin sesión, así que
// para leerlo de la base habría que abrir una puerta a anon que lo diera a
// cambio del estado. Pero quien intercepte la vuelta tiene el estado Y el
// código: con esa puerta sacaría el verificador y se llevaría los tokens, que
// es justo lo que PKCE está para impedir. En una cookie HttpOnly del propio
// navegador que empezó la conexión, nadie más lo ve.

export const COOKIE_PKCE = 'tp_coros_pkce'

export interface DatosPkce { v: string; c: string; e: string }

export function cookiePkce(d: DatosPkce, maxAgeS = 900): string {
  const valor = b64url(Buffer.from(JSON.stringify(d), 'utf8'))
  return `${COOKIE_PKCE}=${valor}; Path=/api/relojes/coros; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`
}

export const borrarCookiePkce = (): string =>
  `${COOKIE_PKCE}=; Path=/api/relojes/coros; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

export function leerCookiePkce(cabecera: string | null | undefined): DatosPkce | null {
  if (!cabecera) return null
  const par = cabecera.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE_PKCE + '='))
  if (!par) return null
  try {
    const crudo = par.slice(COOKIE_PKCE.length + 1).replace(/-/g, '+').replace(/_/g, '/')
    const d = JSON.parse(Buffer.from(crudo, 'base64').toString('utf8'))
    if (typeof d?.v === 'string' && d.v.length >= 43 && typeof d?.c === 'string' && d.c && typeof d?.e === 'string' && d.e.startsWith('https://')) {
      return { v: d.v, c: d.c, e: d.e }
    }
  } catch { /* cookie rota: como si no estuviera */ }
  return null
}

// ------------------------------------------------------------
// El token
// ------------------------------------------------------------

export interface TokenCoros {
  accessToken: string
  refreshToken: string
  caducaEn: string
  /** El `sub` del id_token, si viene. Solo para identificar, no para decidir nada. */
  idExterno: string | null
}

/** El `sub` de un JWT, SIN verificar la firma: se usa para apuntar quién es, nunca para dar permisos. */
export function subDeIdToken(jwt: unknown): string | null {
  if (typeof jwt !== 'string') return null
  const partes = jwt.split('.')
  if (partes.length < 2) return null
  try {
    const carga = JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return typeof carga?.sub === 'string' && carga.sub ? carga.sub : null
  } catch { return null }
}

/**
 * La respuesta del token. Como el cliente oficial: sin token de renovación no
 * vale, porque a la hora dejaría de funcionar y el atleta no sabría por qué.
 */
export function leerTokenCoros(json: unknown, ahora: Date = new Date()): TokenCoros | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  const at = typeof j.access_token === 'string' ? j.access_token.trim() : ''
  const rt = typeof j.refresh_token === 'string' ? j.refresh_token.trim() : ''
  if (!at || !rt) return null
  const s = typeof j.expires_in === 'number' && Number.isFinite(j.expires_in) && j.expires_in > 0 ? j.expires_in : 3600
  return {
    accessToken: at,
    refreshToken: rt,
    caducaEn: new Date(ahora.getTime() + s * 1000).toISOString(),
    idExterno: subDeIdToken(j.id_token),
  }
}

/**
 * La respuesta al renovar. A diferencia de la primera vez, COROS puede no
 * mandar un token de renovación nuevo: entonces se sigue con el anterior. Si lo
 * manda, el anterior deja de valer y hay que quedarse con el nuevo.
 */
export function leerRenovacionCoros(json: unknown, refreshAnterior: string, ahora: Date = new Date()): TokenCoros | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  const nuevo = typeof j.refresh_token === 'string' && j.refresh_token.trim() ? j.refresh_token : refreshAnterior
  return leerTokenCoros({ ...j, refresh_token: nuevo }, ahora)
}

/** Si toca renovar: falta menos de un minuto, o ya pasó. */
export const hayQueRenovar = (caducaEn: string | null | undefined, ahora: number = Date.now()): boolean =>
  !caducaEn || new Date(caducaEn).getTime() - ahora < 60_000

// ------------------------------------------------------------
// MCP
// ------------------------------------------------------------

export const peticionMcp = (id: number, method: string, params: Record<string, unknown> = {}) =>
  ({ jsonrpc: '2.0' as const, id, method, params })

export const inicializar = (id = 1) => peticionMcp(id, 'initialize', {
  protocolVersion: VERSION_MCP,
  capabilities: {},
  clientInfo: { name: NOMBRE_CLIENTE, version: '1.0.0' },
})

/**
 * Lee una respuesta MCP, venga como JSON o como flujo de eventos.
 *
 * En el flujo cada evento trae líneas «data: …» que juntas forman un JSON; se
 * devuelve el primer mensaje con `result` o `error`, que es la respuesta a la
 * petición (lo demás pueden ser avisos del servidor).
 */
export function leerRespuestaMcp(texto: string, tipo: string | null | undefined): Record<string, unknown> | null {
  if (!texto) return null
  if ((tipo || '').includes('text/event-stream')) {
    const mensajes: Record<string, unknown>[] = []
    let datos: string[] = []
    const cerrar = () => {
      if (!datos.length) return
      try { const m = JSON.parse(datos.join('\n')); if (m && typeof m === 'object') mensajes.push(m) } catch { /* evento que no es JSON */ }
      datos = []
    }
    for (const linea of texto.split(/\r?\n/)) {
      if (linea === '') { cerrar(); continue }
      if (linea.startsWith('data:')) datos.push(linea.slice(5).replace(/^ /, ''))
    }
    cerrar()
    return mensajes.find(m => 'result' in m || 'error' in m) || null
  }
  try { const m = JSON.parse(texto); return m && typeof m === 'object' ? m : null } catch { return null }
}

/**
 * Lo útil del resultado de una herramienta: el contenido estructurado si lo
 * trae; si no, el texto, interpretado como JSON cuando lo es.
 */
export function contenidoDeResultado(result: unknown): unknown {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  if (r.structuredContent !== undefined) return r.structuredContent
  const partes = Array.isArray(r.content) ? r.content : []
  const texto = partes
    .filter((p): p is { type: string; text: string } => !!p && typeof p === 'object' && (p as { type?: unknown }).type === 'text' && typeof (p as { text?: unknown }).text === 'string')
    .map(p => p.text).join('\n')
  if (!texto) return null
  try { return JSON.parse(texto) } catch { return texto }
}

// ------------------------------------------------------------
// Los argumentos de una herramienta, a partir de lo que ella dice pedir
// ------------------------------------------------------------

export interface EsquemaEntrada {
  type?: string
  properties?: Record<string, { type?: string | string[]; format?: string; description?: string }>
  required?: string[]
}

/* Nombres enteros de inicio o fin de un rango —startDate, start_day, from,
   dateFrom, endDate, to, until…—, y no cualquier cosa que contenga «end»:
   «calendar» o «trend» también lo contienen y no son fechas. */
const ES_INICIO = /^(start|begin|from|since)([_-]?(date|day|time))?$|^(date|day)[_-]?(start|from|begin)$/i
const ES_FIN = /^(end|until|to)([_-]?(date|day|time))?$|^(date|day)[_-]?(end|to|until)$/i

const aDia = (iso: string) => iso.slice(0, 10)
const aNumero = (iso: string) => Number(iso.slice(0, 10).replace(/-/g, ''))

/**
 * Rellena un rango de fechas en los parámetros que la propia herramienta
 * declara en `tools/list`.
 *
 * NO ADIVINA NOMBRES: solo usa propiedades que el esquema de COROS diga que
 * existen y que se llamen como un inicio o un fin. Si es texto va «AAAA-MM-DD»;
 * si es un número, AAAAMMDD. Si no encuentra ninguna, no manda nada y la
 * herramienta usa lo que traiga por defecto. Lo peor que puede pasar es que
 * COROS conteste con un error, y ese error se guarda para aprender de él: nunca
 * sale de aquí un dato mal leído.
 */
export function argumentosDeFechas(esquema: EsquemaEntrada | null | undefined, desde: string, hasta: string): Record<string, string | number> {
  const props = esquema?.properties || {}
  const salida: Record<string, string | number> = {}
  const valor = (p: { type?: string | string[]; format?: string }, iso: string, esFin: boolean): string | number => {
    const t = Array.isArray(p.type) ? p.type : [p.type]
    if (t.includes('integer') || t.includes('number')) return aNumero(iso)
    if (p.format === 'date-time') return aDia(iso) + (esFin ? 'T23:59:59Z' : 'T00:00:00Z')
    return aDia(iso)
  }
  for (const [nombre, p] of Object.entries(props)) {
    if (!p) continue
    if (ES_INICIO.test(nombre)) salida[nombre] = valor(p, desde, false)
    else if (ES_FIN.test(nombre)) salida[nombre] = valor(p, hasta, true)
  }
  return salida
}

/** Recorta lo que se guarda para aprender: basta con la forma, no hace falta todo. */
export function recortarParaAprender(v: unknown, maxCaracteres = 60_000): unknown {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (s === undefined) return null
  if (s.length <= maxCaracteres) return v
  return { recortado: true, longitud: s.length, inicio: s.slice(0, maxCaracteres) }
}

/** Qué decirle al atleta si COROS contesta con un error. */
export function motivoDeErrorCoros(status: number): string {
  if (status === 400 || status === 401) return 'COROS ya no reconoce la conexión. Desconecta y vuelve a conectar tu cuenta.'
  if (status === 403) return 'COROS no ha dado permiso para leer tus datos. Desconecta y vuelve a conectar, aceptando todo lo que pida.'
  if (status === 429) return 'COROS está limitando las peticiones. Prueba dentro de un rato.'
  if (status >= 500) return 'COROS no responde ahora mismo. Prueba más tarde.'
  return 'COROS ha devuelto un error (' + status + ').'
}
