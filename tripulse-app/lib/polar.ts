// ============================================================
// TRIPULSE — Polar AccessLink v3: hablar con él y traducir lo que manda
// ============================================================
// Todo lo que sabe TRIPULSE de Polar vive aquí: las direcciones, la forma del
// token y cómo se convierte cada noche y cada entreno en algo nuestro. Las
// rutas de /api/relojes/polar solo hacen de mensajero.
//
// POR QUÉ LA v3 Y NO LA v4. El cliente se registró en admin.polaraccesslink.com
// y su formulario pide los tipos de dato de la v3 (ejercicio, actividad diaria,
// info física); el ejemplo oficial de Polar también es v3. Se usan solo sus
// rutas NO transaccionales —/exercises, /users/sleep, /users/nightly-recharge—,
// que devuelven lo de los últimos 28-30 días sin tener que abrir y confirmar
// transacciones. Las transaccionales están marcadas como obsoletas.
//
// Comprobado contra https://www.polar.com/accesslink-api/ el 10/09/2026.

export const POLAR = {
  autorizar: 'https://flow.polar.com/oauth2/authorization',
  token: 'https://polarremote.com/v2/oauth2/token',
  api: 'https://www.polaraccesslink.com/v3',
  alcance: 'accesslink.read_all',
} as const

/**
 * La dirección de vuelta registrada en el panel de Polar.
 *
 * TIENE QUE SER IDÉNTICA, carácter a carácter, a la que está dada de alta en
 * admin.polaraccesslink.com: si no, Polar rechaza la conexión. Por eso no se
 * saca del dominio por el que haya entrado cada uno —el proyecto tiene varios—
 * sino que se fija aquí, y solo `localhost` usa la suya, para desarrollar.
 */
export const REDIRECT_PRODUCCION = 'https://tripulse-eight.vercel.app/api/relojes/polar/callback'

export function redirectPolar(origen: string, forzada?: string | null): string {
  if (forzada && forzada.trim()) return forzada.trim()
  try {
    const u = new URL(origen)
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return u.origin + '/api/relojes/polar/callback'
  } catch { /* un origen raro no debe tumbar la conexión: se usa la de producción */ }
  return REDIRECT_PRODUCCION
}

/** A dónde se manda al deportista para que autorice. `estado` es de un solo uso. */
export function urlAutorizacion(clientId: string, redirect: string, estado: string): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: POLAR.alcance,
    state: estado,
  })
  return POLAR.autorizar + '?' + q.toString()
}

/** Cabecera Basic con las credenciales del cliente, para pedir el token. */
export function basicAuth(clientId: string, secreto: string): string {
  return 'Basic ' + Buffer.from(clientId + ':' + secreto, 'utf8').toString('base64')
}

// ------------------------------------------------------------
// Números: nunca un cero inventado
// ------------------------------------------------------------

/**
 * Un número de verdad o `null`.
 *
 * NO `Number(x) || 0` y tampoco `Number(x)` a secas: `Number(null)` es 0, y un
 * 0 en la HRV o en la FC es un dato falso que el motor de wellness leería como
 * «el peor día de su vida». Lo que no viene se queda sin venir.
 */
export function num(x: unknown): number | null {
  if (x === null || x === undefined || x === '' || typeof x === 'boolean') return null
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : null
}

const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

// ------------------------------------------------------------
// El token
// ------------------------------------------------------------

export interface TokenLeido {
  accessToken: string
  /** `x_user_id`: el identificador del usuario en Polar. */
  idExterno: string
  /** Polar da tokens de un año y NO los renueva: al caducar hay que volver a conectar. */
  caducaEn: string | null
}

export function leerToken(json: unknown, ahora: Date = new Date()): TokenLeido | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  const accessToken = typeof j.access_token === 'string' ? j.access_token.trim() : ''
  const id = j.x_user_id
  if (!accessToken || id === null || id === undefined || id === '') return null
  const segundos = num(j.expires_in)
  return {
    accessToken,
    idExterno: String(id),
    caducaEn: segundos != null && segundos > 0 ? new Date(ahora.getTime() + segundos * 1000).toISOString() : null,
  }
}

// ------------------------------------------------------------
// Duraciones y disciplinas
// ------------------------------------------------------------

/**
 * Minutos de una duración ISO 8601 como las de Polar («PT2H44M», «PT45M30S»).
 * Redondea al minuto, que es como se guarda `sesion.duracion_real`.
 */
export function minutosDeDuracion(iso: unknown): number | null {
  if (typeof iso !== 'string') return null
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso.trim())
  if (!m || iso.trim() === 'P' || iso.trim() === 'PT') return null
  const [, d, h, mi, s] = m
  if (d === undefined && h === undefined && mi === undefined && s === undefined) return null
  const total = Number(d || 0) * 1440 + Number(h || 0) * 60 + Number(mi || 0) + Number(s || 0) / 60
  return Math.round(total)
}

export type DisciplinaReloj = 'Carrera' | 'Ciclismo' | 'Natacion' | 'Fuerza'

/**
 * La disciplina de TRIPULSE que corresponde a un deporte de Polar, o `null`.
 *
 * Mira primero `detailed_sport_info` (ROAD_BIKING, TRAIL_RUNNING…), que es más
 * fino, y si no a `sport`. Lo que no reconoce devuelve `null` en vez de
 * adivinar: un triatlón o un esquí de fondo no son ninguna de las cuatro, y
 * meterlos en la que se parezca ensuciaría la carga de esa disciplina.
 */
export function disciplinaDePolar(sport: unknown, detalle?: unknown): DisciplinaReloj | null {
  for (const v of [detalle, sport]) {
    if (typeof v !== 'string' || !v) continue
    const s = v.toUpperCase()
    if (s.includes('STRENGTH')) return 'Fuerza'
    if (s.includes('SWIM')) return 'Natacion'
    if (s.includes('RUN')) return 'Carrera'
    if (s.includes('CYCL') || s.includes('BIK')) return 'Ciclismo'
  }
  return null
}

// ------------------------------------------------------------
// Lo que llega, traducido
// ------------------------------------------------------------

export type TipoMedicion = 'sueno' | 'recarga' | 'entreno'

export interface Medicion {
  tipo: TipoMedicion
  /** El día al que pertenece, en la hora local del deportista. */
  fecha: string
  /** Para no guardar dos veces lo mismo: la fecha en el sueño, el id en el entreno. */
  id_externo: string
  datos: Record<string, string | number | null>
}

/**
 * Una noche de sueño.
 *
 * `dormido_min` es la suma de las fases —ligero, profundo, REM y sin
 * clasificar—, que es lo que Polar llama «sueño real»: NO incluye las
 * interrupciones. Es lo más parecido a lo que el deportista escribe como
 * «horas de sueño». El tiempo en cama (de dormirse a despertar) va aparte.
 */
export function medicionDeSueno(n: unknown): Medicion | null {
  if (!n || typeof n !== 'object') return null
  const x = n as Record<string, unknown>
  if (!esFecha(x.date)) return null
  const fases = [x.light_sleep, x.deep_sleep, x.rem_sleep, x.unrecognized_sleep_stage].map(num)
  const conDato = fases.filter((v): v is number => v != null)
  const dormidoS = conDato.length ? conDato.reduce((a, b) => a + b, 0) : null
  const interrupcionesS = num(x.total_interruption_duration)
  return {
    tipo: 'sueno',
    fecha: x.date,
    id_externo: x.date,
    datos: {
      inicio: typeof x.sleep_start_time === 'string' ? x.sleep_start_time : null,
      fin: typeof x.sleep_end_time === 'string' ? x.sleep_end_time : null,
      dormido_min: dormidoS != null ? Math.round(dormidoS / 60) : null,
      profundo_min: num(x.deep_sleep) != null ? Math.round(num(x.deep_sleep)! / 60) : null,
      rem_min: num(x.rem_sleep) != null ? Math.round(num(x.rem_sleep)! / 60) : null,
      interrupciones_min: interrupcionesS != null ? Math.round(interrupcionesS / 60) : null,
      puntuacion: num(x.sleep_score),
    },
  }
}

/**
 * Una Nightly Recharge: de aquí sale la HRV nocturna.
 *
 * OJO, NO ES LA HRV QUE SE TECLEA A MANO. `heart_rate_variability_avg` es el
 * RMSSD en milisegundos medido durante cuatro horas, empezando media hora
 * después de dormirse. La que escribe el deportista suele ser una medida de un
 * minuto al despertar, a menudo con otra app y otra escala. Por eso se guarda
 * con su nombre —`rmssd_ms`— y no se vuelca en `wellness.hrv` todavía: mezclar
 * las dos haría saltar la línea base sin que el atleta haya cambiado nada.
 *
 * Y `fc_media` es la media de esas mismas cuatro horas, no la FC en reposo al
 * despertar. Misma advertencia.
 */
export function medicionDeRecarga(r: unknown): Medicion | null {
  if (!r || typeof r !== 'object') return null
  const x = r as Record<string, unknown>
  if (!esFecha(x.date)) return null
  return {
    tipo: 'recarga',
    fecha: x.date,
    id_externo: x.date,
    datos: {
      rmssd_ms: num(x.heart_rate_variability_avg),
      fc_media: num(x.heart_rate_avg),
      rr_medio_ms: num(x.beat_to_beat_avg),
      respiracion: num(x.breathing_rate_avg),
      estado_recarga: num(x.nightly_recharge_status),
      carga_sna: num(x.ans_charge),
    },
  }
}

/**
 * Un entreno.
 *
 * `start_time` llega en la hora LOCAL de quien entrenó, sin zona, y la
 * diferencia con UTC viene aparte en minutos. La fecha se toma de ahí tal
 * cual: el entreno de las 23:30 es de ese día para el atleta, que es como lo
 * planifica el entrenador. Convertirlo a UTC lo mandaría al día siguiente.
 */
export function medicionDeEntreno(e: unknown): Medicion | null {
  if (!e || typeof e !== 'object') return null
  const x = e as Record<string, unknown>
  const id = x.id
  const inicio = typeof x.start_time === 'string' ? x.start_time : ''
  const fecha = inicio.slice(0, 10)
  if (id === null || id === undefined || id === '' || !esFecha(fecha)) return null
  const fc = (x.heart_rate && typeof x.heart_rate === 'object') ? x.heart_rate as Record<string, unknown> : {}
  return {
    tipo: 'entreno',
    fecha,
    id_externo: String(id),
    datos: {
      inicio,
      desfase_utc_min: num(x.start_time_utc_offset),
      duracion_min: minutosDeDuracion(x.duration),
      disciplina: disciplinaDePolar(x.sport, x.detailed_sport_info),
      deporte: typeof x.sport === 'string' ? x.sport : null,
      deporte_detalle: typeof x.detailed_sport_info === 'string' ? x.detailed_sport_info : null,
      fc_media: num(fc.average),
      fc_max: num(fc.maximum),
      distancia_m: num(x.distance),
      calorias: num(x.calories),
      carga_polar: num(x.training_load),
    },
  }
}

/** Las tres respuestas de Polar juntas, ya traducidas y sin lo que no se entiende. */
export function medicionesDePolar(r: { sueno?: unknown; recarga?: unknown; entrenos?: unknown }): Medicion[] {
  const lista = (v: unknown, clave?: string): unknown[] => {
    if (Array.isArray(v)) return v
    if (clave && v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>)[clave])) {
      return (v as Record<string, unknown[]>)[clave]
    }
    return []
  }
  return [
    ...lista(r.sueno, 'nights').map(medicionDeSueno),
    ...lista(r.recarga, 'recharges').map(medicionDeRecarga),
    ...lista(r.entrenos).map(medicionDeEntreno),
  ].filter((m): m is Medicion => m !== null)
}

// ------------------------------------------------------------
// Errores que el deportista tiene que entender
// ------------------------------------------------------------

/**
 * Qué decirle al deportista según lo que conteste Polar.
 *
 * El 403 es el que importa: pasa cuando el permiso está dado pero faltan los
 * consentimientos obligatorios de account.polar.com. Sin decírselo, la app
 * enseñaría «conectado» y nunca llegaría nada, sin ningún error a la vista.
 */
export function motivoDeError(status: number): string {
  if (status === 401) return 'Polar ya no reconoce la conexión. Desconecta y vuelve a conectar tu cuenta.'
  if (status === 403) return 'Falta aceptar los consentimientos obligatorios de Polar. Entra en account.polar.com, acéptalos y vuelve a sincronizar.'
  if (status === 429) return 'Polar está limitando las peticiones. Prueba dentro de un rato.'
  if (status >= 500) return 'Polar no responde ahora mismo. Prueba más tarde.'
  return 'Polar ha devuelto un error (' + status + ').'
}
