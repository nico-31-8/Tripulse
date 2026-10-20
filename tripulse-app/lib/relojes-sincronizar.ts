// ============================================================
// TRIPULSE — Traer lo último de un reloj (solo en el servidor)
// ============================================================
// Lo mismo para las dos maneras de pedirlo:
//   - el propio deportista, desde su perfil o su wellness, con SU sesión
//     (/api/relojes/<marca>/sincronizar);
//   - el servidor, dos veces al día y sin nadie conectado, con su llave
//     (/api/relojes/sincronizar-todos, que lanza Vercel Cron).
// Lo único que cambia es CÓMO se habla con la base, y eso es el «acceso»: las
// funciones de siempre (reloj_token_propio, reloj_guardar…) o sus gemelas del
// servidor (reloj_servidor_*, en supabase/relojes-servidor.sql), que piden la
// llave y dicen de qué deportista.
//
// SOLO PARA EL SERVIDOR, como lib/relojes-servidor: ninguna pantalla debe
// importarlo.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ESPERA_MS } from './relojes-servidor'
import { POLAR, medicionesDePolar, motivoDeError, type Medicion, type TipoMedicion } from './polar'
import {
  emisorCoros, mcpDe, hayQueRenovar, leerRenovacionCoros, inicializar, peticionMcp, leerRespuestaMcp,
  contenidoDeResultado, argumentosCoros, pareceErrorCoros, recortarParaAprender, motivoDeErrorCoros,
  medicionesDeCoros, tramosDeDias, sinUbicacionCoros, HERRAMIENTAS_COROS, DIAS_POR_LLAMADA, DIAS_PRIMERA_VEZ, VERSION_MCP,
  type EsquemaEntrada,
} from './coros'
import { hoyISO, sumarDias } from './fechas'
import { leerFit } from './fit'
import { detalleDeFit, VERSION_DETALLE, DETALLES_POR_VEZ, DIAS_DETALLE, type DetalleEntreno } from './detalle-entreno'

export { DETALLES_POR_VEZ, DIAS_DETALLE }

export type MarcaSincronizable = 'polar' | 'coros'

export interface TokenReloj {
  id_externo: string | null
  access_token: string | null
  refresh_token?: string | null
  extra?: { cliente?: string; emisor?: string } | null
  caduca_en: string | null
}

export interface TokenRenovado { accessToken: string; refreshToken: string | null; caducaEn: string | null }

export interface FilaCruda { herramienta: string; datos: unknown }

/** Un entreno que cuenta y todavía no tiene detalle (supabase/reloj-detalle.sql). */
export interface EntrenoSinDetalle { id_externo: string; fecha: string; deporte_codigo: string | null; disciplina: string | null }
export type DetalleParaGuardar = DetalleEntreno & { id_externo: string }

/** Cómo se habla con la base: con la sesión del deportista o con la llave del servidor. */
export interface AccesoReloj {
  /** Su token, o null si no tiene esa marca conectada (o la base no contesta). */
  token(marca: MarcaSincronizable): Promise<TokenReloj | null>
  /** Guarda el token renovado. false si no se pudo. */
  renovar(marca: MarcaSincronizable, nuevo: TokenRenovado): Promise<boolean>
  /** Guarda lo traído y, con `error`, lo apunta como el último fallo de la conexión. */
  guardar(marca: MarcaSincronizable, mediciones: Medicion[], error: string | null): Promise<{ guardadas: number | null; error: string | null }>
  guardarCrudo(marca: MarcaSincronizable, filas: FilaCruda[]): Promise<void>
  /** Si ya llegó alguna vez algo de ese tipo: decide si se piden cuatro semanas o una. */
  yaHay(marca: MarcaSincronizable, tipo: 'sueno' | 'entreno'): Promise<boolean>
  /** Sus entrenos que cuentan y aún no tienen detalle, desde `desde`, el más reciente primero. */
  entrenosSinDetalle(marca: MarcaSincronizable, desde: string): Promise<EntrenoSinDetalle[]>
  /** Guarda el detalle de esos entrenos. Cuántos se guardaron. */
  guardarDetalles(marca: MarcaSincronizable, detalles: DetalleParaGuardar[]): Promise<number>
}

export interface Recibido {
  guardadas?: number | null
  noches: number
  recargas: number
  entrenos: number
  /** Cuántos entrenos han recibido su detalle en esta vuelta. */
  detalles?: number
  /** Lo que no llegó, dicho para el deportista; null si llegó todo. */
  aviso: string | null
}

export type ResultadoSincronizar =
  | { ok: true; cuerpo: Recibido }
  | { ok: false; status: number; error: string }

const contar = (mediciones: Medicion[], tipo: TipoMedicion) => mediciones.filter(m => m.tipo === tipo).length

// ---------------------------------------------------------------------------
// Los dos accesos
// ---------------------------------------------------------------------------

/** El de siempre: la sesión del propio deportista (auth.uid() en la base). */
export function accesoDelDeportista(sb: SupabaseClient, uid: string): AccesoReloj {
  return {
    async token(marca) {
      const { data, error } = await sb.rpc('reloj_token_propio', { p_proveedor: marca })
      const fila = Array.isArray(data) ? (data[0] as TokenReloj | undefined) : undefined
      return error || !fila ? null : fila
    },
    async renovar(marca, n) {
      const { error } = await sb.rpc('reloj_renovar', {
        p_proveedor: marca, p_access_token: n.accessToken, p_refresh_token: n.refreshToken, p_caduca_en: n.caducaEn,
      })
      return !error
    },
    async guardar(marca, mediciones, error) {
      const r = await sb.rpc('reloj_guardar', { p_proveedor: marca, p_mediciones: mediciones, p_error: error })
      return { guardadas: typeof r.data === 'number' ? r.data : null, error: r.error?.message ?? null }
    },
    async guardarCrudo(marca, filas) {
      await sb.rpc('reloj_guardar_crudo', { p_proveedor: marca, p_filas: filas })
    },
    /* «Suyo» de verdad: quien además entrena a otros ve también lo de ellos. */
    async yaHay(marca, tipo) {
      const { count } = await sb.from('reloj_medicion')
        .select('id, deportista!inner(id_usuario)', { count: 'exact', head: true })
        .eq('deportista.id_usuario', uid).eq('proveedor', marca).eq('tipo', tipo)
      return !!count
    },
    async entrenosSinDetalle(marca, desde) {
      const { data, error } = await sb.rpc('reloj_entrenos_sin_detalle', { p_proveedor: marca, p_desde: desde })
      return error || !Array.isArray(data) ? [] : data as EntrenoSinDetalle[]
    },
    async guardarDetalles(marca, detalles) {
      const { data, error } = await sb.rpc('reloj_guardar_detalle', { p_proveedor: marca, p_detalles: detalles })
      return error || typeof data !== 'number' ? 0 : data
    },
  }
}

/** Una conexión que toca traer, como la da reloj_servidor_pendientes. */
export interface Pendiente {
  id_deportista: number
  proveedor: MarcaSincronizable
  hay_noches: boolean
  hay_entrenos: boolean
}

/** El del servidor: sin sesión, con la llave y el deportista dicho. */
export function accesoDelServidor(sb: SupabaseClient, llave: string, p: Pendiente): AccesoReloj {
  const quien = { p_llave: llave, p_deportista: p.id_deportista }
  return {
    async token(marca) {
      const { data, error } = await sb.rpc('reloj_servidor_token', { ...quien, p_proveedor: marca })
      const fila = Array.isArray(data) ? (data[0] as TokenReloj | undefined) : undefined
      return error || !fila ? null : fila
    },
    async renovar(marca, n) {
      const { error } = await sb.rpc('reloj_servidor_renovar', {
        ...quien, p_proveedor: marca, p_access_token: n.accessToken, p_refresh_token: n.refreshToken, p_caduca_en: n.caducaEn,
      })
      return !error
    },
    async guardar(marca, mediciones, error) {
      const r = await sb.rpc('reloj_servidor_guardar', { ...quien, p_proveedor: marca, p_mediciones: mediciones, p_error: error })
      return { guardadas: typeof r.data === 'number' ? r.data : null, error: r.error?.message ?? null }
    },
    async guardarCrudo(marca, filas) {
      await sb.rpc('reloj_servidor_guardar_crudo', { ...quien, p_proveedor: marca, p_filas: filas })
    },
    async yaHay(_marca, tipo) {
      return tipo === 'sueno' ? p.hay_noches : p.hay_entrenos
    },
    async entrenosSinDetalle(marca, desde) {
      const { data, error } = await sb.rpc('reloj_servidor_entrenos_sin_detalle', { ...quien, p_proveedor: marca, p_desde: desde })
      return error || !Array.isArray(data) ? [] : data as EntrenoSinDetalle[]
    },
    async guardarDetalles(marca, detalles) {
      const { data, error } = await sb.rpc('reloj_servidor_guardar_detalle', { ...quien, p_proveedor: marca, p_detalles: detalles })
      return error || typeof data !== 'number' ? 0 : data
    },
  }
}

// ---------------------------------------------------------------------------
// El detalle de cada entreno: su fichero FIT (lib/fit, lib/detalle-entreno)
// ---------------------------------------------------------------------------
// Maqueta aprobada el 2026-10-19. Solo de los entrenos que cuentan (la base no
// da las caminatas), de las cuatro últimas semanas (DIAS_DETALLE) y como mucho
// DETALLES_POR_VEZ en cada sincronización: COROS limita las descargas de
// ficheros al día. Los demás llegan en la siguiente. Del fichero se guarda lo
// que se saca de él, nunca el fichero: trae el recorrido.

/** Lo que contesta la marca al pedir el fichero de un entreno. */
export type FicheroPedido =
  | { tipo: 'fichero'; bytes: Uint8Array }
  /** No lo tiene, o no lo da: se apunta y no se vuelve a pedir. */
  | { tipo: 'sin'; motivo: string }
  /** El límite del día, o la marca no contesta: se para aquí y se sigue en la próxima. */
  | { tipo: 'parar' }

const sinDetalle = (motivo: string): DetalleEntreno => ({
  vueltas: [], tramos: [], tramo_m: null, fc_segundos: {}, segundos_con_fc: 0, motivo, version: VERSION_DETALLE,
})

/** Pide el fichero de los que faltan, lo lee y guarda lo que sale. Cuántos se guardaron; nunca falla. */
export async function traerDetalles(
  acceso: AccesoReloj, marca: MarcaSincronizable, pedirFichero: (e: EntrenoSinDetalle) => Promise<FicheroPedido>,
): Promise<number> {
  let faltan: EntrenoSinDetalle[]
  try {
    faltan = await acceso.entrenosSinDetalle(marca, sumarDias(hoyISO(), -(DIAS_DETALLE - 1)))
  } catch {
    return 0
  }
  const listos: DetalleParaGuardar[] = []
  for (const e of faltan.filter(x => x.id_externo && x.disciplina).slice(0, DETALLES_POR_VEZ)) {
    let r: FicheroPedido
    try {
      r = await pedirFichero(e)
    } catch {
      break
    }
    if (r.tipo === 'parar') break
    if (r.tipo === 'sin') {
      listos.push({ ...sinDetalle(r.motivo), id_externo: e.id_externo })
      continue
    }
    const fit = leerFit(r.bytes)
    listos.push({ ...(fit ? detalleDeFit(fit, e.disciplina) : sinDetalle('No se ha podido leer el fichero del reloj.')), id_externo: e.id_externo })
  }
  if (!listos.length) return 0
  try {
    return await acceso.guardarDetalles(marca, listos)
  } catch {
    return 0
  }
}

/** El fichero que viene dentro de una respuesta MCP (un `resource` con `blob` en base64), o null. */
export function ficheroDeResultado(result: unknown): Uint8Array | null {
  const partes = (result as { content?: unknown[] } | null)?.content
  if (!Array.isArray(partes)) return null
  for (const p of partes) {
    const blob = (p as { resource?: { blob?: unknown } } | null)?.resource?.blob
    if (typeof blob === 'string' && blob.length > 16) {
      const bytes = new Uint8Array(Buffer.from(blob, 'base64'))
      if (bytes.length > 12) return bytes
    }
  }
  return null
}

/** Si un error de la marca es «por hoy ya está» (el límite, demasiadas peticiones) y no «este no existe». */
export const pareceLimite = (texto: string, status: number): boolean =>
  status === 429 || status >= 500 || /limit|quota|too many|rate|exceed|daily|tomorrow|try again/i.test(texto)

// ---------------------------------------------------------------------------
// Polar
// ---------------------------------------------------------------------------
// Las rutas NO transaccionales de Polar devuelven los últimos 28 días de sueño
// y recarga y los últimos 30 de entrenos cada vez, sin tener que confirmar
// nada. Pedir dos veces lo mismo no duplica: la base actualiza lo que ya tenía.
//
// OJO CON LOS ENTRENOS: Polar solo da los que se subieron a Polar Flow DESPUÉS
// de conectar. Un atleta recién conectado puede ver sus noches y ningún
// entreno, y no es un fallo.
//
// Lo que llega va a `reloj_medicion`, con sus nombres de verdad. NO se vuelca
// en `wellness`: la HRV de Polar es RMSSD de cuatro horas de sueño y la que se
// teclea es otra medida, y mezclarlas haría saltar la línea base.

export async function sincronizarPolar(acceso: AccesoReloj): Promise<ResultadoSincronizar> {
  const t = await acceso.token('polar')
  if (!t?.access_token) return { ok: false, status: 400, error: 'No tienes Polar conectado.' }

  const anotar = async (error: string): Promise<ResultadoSincronizar> => {
    await acceso.guardar('polar', [], error)
    return { ok: false, status: 409, error }
  }

  /* Polar no renueva los tokens: dura un año y después hay que volver a
     conectar. Mejor decirlo antes que recibir un 401 sin explicación. */
  if (t.caduca_en && new Date(t.caduca_en).getTime() < Date.now()) {
    return anotar('La conexión con Polar ha caducado (dura un año). Desconecta y vuelve a conectar.')
  }

  const cab = { Authorization: 'Bearer ' + t.access_token, Accept: 'application/json' }
  const pedir = (ruta: string) =>
    fetch(POLAR.api + ruta, { headers: cab, cache: 'no-store', signal: AbortSignal.timeout(ESPERA_MS) })

  let rs: Response[]
  try {
    rs = await Promise.all(['/users/sleep', '/users/nightly-recharge', '/exercises'].map(pedir))
  } catch (e) {
    const agotado = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return anotar(agotado ? 'Polar ha tardado demasiado en responder. Prueba más tarde.' : 'No se ha podido hablar con Polar.')
  }

  /* 204 es «no hay nada», no un error. */
  const fallos = rs.filter(r => !r.ok && r.status !== 204)
  if (fallos.length === rs.length) return anotar(motivoDeError(fallos[0].status))

  const leer = async (r: Response) => (r.ok && r.status !== 204 ? await r.json().catch(() => null) : null)
  const [sueno, recarga, entrenos] = await Promise.all(rs.map(leer))
  const mediciones = medicionesDePolar({ sueno, recarga, entrenos })

  /* Un fallo parcial (una de las tres) no se guarda como error de la
     conexión: suele ser pasajero, y marcar «error» con datos recién llegados
     confundiría. Se devuelve para que la pantalla lo diga. */
  const { guardadas, error: eGuardar } = await acceso.guardar('polar', mediciones, null)
  if (eGuardar) return { ok: false, status: 500, error: 'No se ha podido guardar lo recibido: ' + eGuardar }

  /* El detalle de los entrenos que aún no lo tienen: su fichero FIT. */
  const detalles = await traerDetalles(acceso, 'polar', async e => {
    const r = await fetch(POLAR.api + '/exercises/' + encodeURIComponent(e.id_externo) + '/fit', {
      headers: { Authorization: 'Bearer ' + t.access_token, Accept: '*/*' }, cache: 'no-store', signal: AbortSignal.timeout(ESPERA_MS),
    })
    if (r.status === 429 || r.status >= 500) return { tipo: 'parar' }
    if (!r.ok || r.status === 204) return { tipo: 'sin', motivo: 'Polar no da el fichero de este entreno.' }
    return { tipo: 'fichero', bytes: new Uint8Array(await r.arrayBuffer()) }
  })

  return {
    ok: true,
    cuerpo: {
      guardadas,
      noches: contar(mediciones, 'sueno'),
      recargas: contar(mediciones, 'recarga'),
      entrenos: contar(mediciones, 'entreno'),
      detalles,
      aviso: fallos.length ? motivoDeError(fallos[0].status) : null,
    },
  }
}

// ---------------------------------------------------------------------------
// COROS
// ---------------------------------------------------------------------------
// COROS no tiene un API normal, sino un servidor MCP que contesta con TEXTO
// para un chat:
//
//   1. Se renueva el token si le queda menos de un minuto. COROS dice cuánto
//      dura al darlo: el de la primera cuenta real (17-10-2026), 30 días.
//   2. Se pide a COROS la lista de herramientas y se guarda lo que pide cada
//      una (también las de escribir entrenos y planes, para cuando se usen).
//   3. Se llama a las que interesan en el formato que ELLAS declaran
//      (lib/coros: argumentosCoros): el sueño y la FC en reposo de una vez, la
//      HRV del sueño de siete en siete días (no admite más). La primera vez,
//      cuando todavía no ha llegado ninguna noche, cuatro semanas; después, una.
//   4. Se TRADUCE el sueño, la HRV, la FC en reposo y los entrenos (lib/coros:
//      medicionesDeCoros, con el formato que devolvió la primera cuenta real)
//      y se guarda en `reloj_medicion`, igual que Polar. Los entrenos, cuatro
//      semanas la primera vez que se leen.
//   5. Se trae el DETALLE de los entrenos que aún no lo tienen: su fichero FIT
//      (downloadActivityFitFiles), que se lee y se tira (traerDetalles).
//   6. Se guarda en `reloj_crudo` lo último que contestó cada herramienta, tal
//      cual, salvo el sitio y las coordenadas de los entrenos. Del FIT, nada.
//
// Un fallo de una herramienta no tumba lo demás: se guarda lo que llegó y se
// devuelve un aviso para la pantalla.

interface Herramienta { name: string; description?: string; inputSchema?: EsquemaEntrada; outputSchema?: unknown }

/** Lo que ha fallado, dicho como lo entiende el deportista. */
const QUE_ES_COROS: Record<string, string> = {
  querySleepOverview: 'el sueño', querySleepData: 'el sueño', querySleepHrv: 'la HRV del sueño',
  queryRestingHeartRate: 'la FC en reposo', querySportRecords: 'los entrenos', 'la conexión': 'parte de la respuesta',
}

export async function sincronizarCoros(acceso: AccesoReloj): Promise<ResultadoSincronizar> {
  const t = await acceso.token('coros')
  if (!t?.access_token) return { ok: false, status: 400, error: 'No tienes COROS conectado.' }

  const anotar = async (error: string, status = 409): Promise<ResultadoSincronizar> => {
    await acceso.guardar('coros', [], error)
    return { ok: false, status, error }
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
      if (nuevo) {
        if (!(await acceso.renovar('coros', nuevo))) return anotar('No se ha podido guardar la conexión renovada con COROS.', 500)
        access = nuevo.accessToken
      } else {
        /* Puede que otra sincronización (la de su perfil, la automática o la
           del entrenador al mandarle entrenos) la haya renovado hace un momento
           con el mismo permiso, y COROS ya no acepte el viejo. Entonces vale
           el que quedó guardado: no es que COROS haya dejado de reconocerla. */
        const otro = await acceso.token('coros')
        if (otro?.access_token && otro.access_token !== t.access_token && !hayQueRenovar(otro.caduca_en)) access = otro.access_token
        else return anotar('COROS ya no reconoce la conexión. Desconecta y vuelve a conectar tu cuenta.')
      }
    } catch {
      return anotar('No se ha podido hablar con COROS. Prueba más tarde.')
    }
  }

  /* Cuánto pedir: cuatro semanas si todavía no ha llegado ninguna noche suya de
     COROS, y lo mismo con los entrenos (se leen desde el 19-10-2026: quien ya
     tenía noches recibe así su último mes de entrenos). */
  const [nochesYa, entrenosYa] = await Promise.all([acceso.yaHay('coros', 'sueno'), acceso.yaHay('coros', 'entreno')])
  const hasta = hoyISO()
  const desde = sumarDias(hasta, -((nochesYa ? DIAS_POR_LLAMADA : DIAS_PRIMERA_VEZ) - 1))
  const desdeEntrenos = entrenosYa ? desde : sumarDias(hasta, -(DIAS_PRIMERA_VEZ - 1))

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

  const crudo: FilaCruda[] = []
  /* Lo que contestó bien cada herramienta (la HRV, una vez por tanda), para traducirlo. */
  const textos: Record<string, string[]> = {}
  const fallos: string[] = []
  let id = 20
  /** Una llamada: guarda lo último que contestó y, si no es un error, su texto. */
  const pedir = async (h: Herramienta, de: string, a: string) => {
    const argumentos = argumentosCoros(h.inputSchema, de, a)
    const r = await llamar(peticionMcp(id++, 'tools/call', { name: h.name, arguments: argumentos }))
    const res = r.mensaje?.result as { isError?: boolean } | undefined
    const contenido = contenidoDeResultado(res)
    /* Los entrenos traen el sitio y las coordenadas de salida: fuera, antes de guardar nada. */
    const resultado = h.name === 'querySportRecords' && typeof contenido === 'string' ? sinUbicacionCoros(contenido) : contenido
    const motivo = pareceErrorCoros(resultado)
    const esError = r.status !== 200 || !!res?.isError || !!r.mensaje?.error || !!motivo
    const fila = { herramienta: h.name, datos: recortarParaAprender({ argumentos, status: r.status, esError, error: r.mensaje?.error ?? motivo, resultado }) }
    const i = crudo.findIndex(c => c.herramienta === h.name)
    if (i >= 0) crudo[i] = fila
    else crudo.push(fila)
    if (esError || typeof resultado !== 'string') fallos.push(h.name)
    else (textos[h.name] ||= []).push(resultado)
  }

  /* Fuera del try: el paso 5 (el detalle) también las mira. */
  const herramientas: Herramienta[] = []
  try {
    const ini = await llamar(inicializar(1))
    if (ini.status !== 200 || !ini.mensaje || 'error' in ini.mensaje) return anotar(motivoDeErrorCoros(ini.status || 500))
    iniciado = true
    /* El aviso de «ya estoy listo» no tiene respuesta (202): se manda y ya. */
    await llamar({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => null)

    // La lista, con paginación por si acaso (con tope: no se va a quedar dando vueltas).
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
      const tramos = h.name === 'querySleepHrv' ? tramosDeDias(desde, hasta, DIAS_POR_LLAMADA)
        : h.name === 'querySportRecords' ? [{ desde: desdeEntrenos, hasta }] : [{ desde, hasta }]
      for (const tr of tramos) await pedir(h, tr.desde, tr.hasta)
    }
    /* Su calendario de COROS de las dos semanas que vienen, SOLO EN CRUDO: para
       aprender cómo lo enseña (lo que le manda su entrenador desde «⌚ Su
       COROS», lo que tenga suyo y lo que ya borró). No se traduce ni avisa. */
    const calendario = herramientas.find(x => x.name === 'queryTrainingSchedule')
    if (calendario) await pedir(calendario, hasta, sumarDias(hasta, 13))
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
    entrenos: textos.querySportRecords?.[0] ?? null,
  })
  const { error: eGuardar } = await acceso.guardar('coros', mediciones, null)
  if (eGuardar) return { ok: false, status: 500, error: 'No se ha podido guardar lo recibido de COROS: ' + eGuardar }

  // ---- 5. El detalle de los entrenos que aún no lo tienen: su FIT ----
  const conFit = herramientas.find(x => x.name === 'downloadActivityFitFiles')
  const detalles = conFit && iniciado ? await traerDetalles(acceso, 'coros', async e => {
    const sportType = Number(e.deporte_codigo)
    if (!Number.isInteger(sportType)) return { tipo: 'sin', motivo: 'No se sabe qué deporte es para COROS.' }
    const r = await llamar(peticionMcp(id++, 'tools/call', { name: conFit.name, arguments: { labelId: e.id_externo, sportType } }))
    const res = r.mensaje?.result
    const bytes = ficheroDeResultado(res)
    if (bytes) return { tipo: 'fichero', bytes }
    const c = contenidoDeResultado(res)
    const texto = (typeof c === 'string' ? c : JSON.stringify(c ?? '')) + ' ' + JSON.stringify(r.mensaje?.error ?? '')
    return pareceLimite(texto, r.status) ? { tipo: 'parar' } : { tipo: 'sin', motivo: 'COROS no da el fichero de este entreno.' }
  }) : 0

  // ---- 6. Lo que contestó, tal cual (del FIT, nada) ----
  await acceso.guardarCrudo('coros', crudo)

  const falta = [...new Set(fallos.filter(f => QUE_ES_COROS[f]).map(f => QUE_ES_COROS[f]))]
  return {
    ok: true,
    cuerpo: {
      noches: contar(mediciones, 'sueno'),
      recargas: contar(mediciones, 'recarga'),
      entrenos: contar(mediciones, 'entreno'),
      detalles,
      aviso: falta.length ? 'COROS no ha mandado ' + falta.join(' ni ') + '. Lo demás se ha guardado; prueba otra vez dentro de un rato.' : null,
    },
  }
}

export const sincronizar = (marca: MarcaSincronizable, acceso: AccesoReloj): Promise<ResultadoSincronizar> =>
  marca === 'polar' ? sincronizarPolar(acceso) : sincronizarCoros(acceso)

// ---------------------------------------------------------------------------
// Todos los que tocan, desde el servidor
// ---------------------------------------------------------------------------

/** Quien sincronizó hace menos de esto (al abrir su perfil o su wellness) no se vuelve a traer. */
export const HORAS_SIN_TRAER = 3
/** Cuántos a la vez: cada uno son unas diez llamadas seguidas a su marca. */
export const A_LA_VEZ = 3
/** Pasado esto ya no se empieza ninguno más: el que empieza puede tardar, y la función tiene 300 s. */
export const NO_EMPEZAR_PASADOS_MS = 150_000

export interface ResultadoDeUno {
  id_deportista: number
  proveedor: MarcaSincronizable
  ok: boolean
  /** El error o el aviso, como lo vería el deportista. */
  mensaje: string | null
  /** Un fallo que no estaba previsto (un error del código, no de la marca). */
  inesperado?: unknown
}

export interface ResultadoDeTodos {
  pendientes: number
  resultados: ResultadoDeUno[]
  /** Los que no dio tiempo a empezar: llegan en la siguiente vuelta. */
  sinTiempo: number
}

/**
 * Trae lo de todas las conexiones que llevan más de HORAS_SIN_TRAER sin traer
 * nada, de A_LA_VEZ en A_LA_VEZ. Un fallo de uno no para a los demás: queda
 * apuntado en SU conexión (lo ve en su perfil, y su entrenador en «Su reloj»).
 */
export async function sincronizarTodos(
  sb: SupabaseClient,
  llave: string,
  { ahora = Date.now, aLaVez = A_LA_VEZ, tope = NO_EMPEZAR_PASADOS_MS }: { ahora?: () => number; aLaVez?: number; tope?: number } = {},
): Promise<{ ok: true; todos: ResultadoDeTodos } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc('reloj_servidor_pendientes', { p_llave: llave, p_horas: HORAS_SIN_TRAER })
  if (error) return { ok: false, error: error.message }
  const pendientes = (Array.isArray(data) ? data : []) as Pendiente[]

  const inicio = ahora()
  const resultados: ResultadoDeUno[] = []
  let siguiente = 0
  const trabajar = async () => {
    while (siguiente < pendientes.length && ahora() - inicio < tope) {
      const p = pendientes[siguiente++]
      try {
        const r = await sincronizar(p.proveedor, accesoDelServidor(sb, llave, p))
        resultados.push({ id_deportista: p.id_deportista, proveedor: p.proveedor, ok: r.ok, mensaje: r.ok ? r.cuerpo.aviso : r.error })
      } catch (e) {
        resultados.push({ id_deportista: p.id_deportista, proveedor: p.proveedor, ok: false, mensaje: 'Fallo inesperado al sincronizar.', inesperado: e })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, aLaVez), pendientes.length) }, trabajar))
  return { ok: true, todos: { pendientes: pendientes.length, resultados, sinTiempo: pendientes.length - resultados.length } }
}
