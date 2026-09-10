// ============================================================
// TRIPULSE — Qué pregunta el wellness según lo que haya llegado del reloj
// ============================================================
// La regla, aprobada con la maqueta del 10/09/2026: el formulario pregunta lo
// que FALTA HOY, no lo que el atleta tenga en casa.
//
// - Manda el reloj CONECTADO: con un Garmin sin conectar se teclea como siempre.
// - Se decide DÍA A DÍA: si la noche de ese día ha llegado, las horas de sueño
//   no se preguntan; si no durmió con el reloj o no lo sincronizó, sí.
// - La HRV y la FC de la mañana se dejan de pedir con reloj, SALVO que el
//   entrenador marque que ese atleta hace el ritual de medirse al despertar.
// - Lo subjetivo —calidad del sueño, fatiga, estrés, dolor, ánimo, motivación,
//   malestar— se pregunta SIEMPRE: el reloj no sabe cómo se encuentra.
//
// Vive aquí, sin nada de pantalla, para poder probarlo.

/** Lo que interesa de una noche para el wellness, ya junto: sueño y recarga. */
export interface NocheReloj {
  dormido_min: number | null
  rmssd_ms: number | null
  fc_media: number | null
}

const n = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/**
 * Las noches de un deportista, por fecha. La fecha es la de DESPERTARSE —Polar
 * la llama «fecha de resultado»—, que es la misma con la que se rellena el
 * wellness por la mañana. Junta el sueño y la recarga de cada día.
 */
export function nochesPorFecha(
  filas: { tipo: string; fecha: string; datos: Record<string, unknown> | null }[] | null | undefined,
): Record<string, NocheReloj> {
  const salida: Record<string, NocheReloj> = {}
  for (const f of filas || []) {
    if (!f?.fecha) continue
    const d = salida[f.fecha] || (salida[f.fecha] = { dormido_min: null, rmssd_ms: null, fc_media: null })
    if (f.tipo === 'sueno') d.dormido_min = n(f.datos?.dormido_min)
    if (f.tipo === 'recarga') { d.rmssd_ms = n(f.datos?.rmssd_ms); d.fc_media = n(f.datos?.fc_media) }
  }
  return salida
}

/** Horas con dos decimales a partir de los minutos del reloj (432 → 7,2). Nunca un cero. */
/**
 * Las filas de una sola marca. Si el atleta tuvo antes otro reloj, sus noches
 * se quedan en la base; pero no pueden hacerse pasar por las del de ahora, que
 * es el que dice «esta noche ha llegado» o «todavía no».
 */
export function delProveedor<T extends { proveedor?: unknown }>(filas: T[] | null | undefined, proveedor: string): T[] {
  return proveedor ? (filas || []).filter(f => f?.proveedor === proveedor) : []
}

export const horasDeMinutos =(min: number | null | undefined): number | null =>
  typeof min === 'number' && Number.isFinite(min) && min > 0 ? Math.round((min / 60) * 100) / 100 : null

/** «7 h 12», para enseñar. */
export function textoHoras(min: number | null | undefined): string {
  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) return '—'
  const m = Math.round(min)
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0')
}

export type ModoWellness = 'sin_reloj' | 'noche_recibida' | 'noche_pendiente'

export interface QuePreguntar {
  modo: ModoWellness
  /** El deslizador de horas de sueño. */
  horas: boolean
  /** La franja «De tu Polar, anoche». */
  franjaReloj: boolean
  /** HRV y FC tecleadas: «Datos objetivos» sin reloj, «Tu medición de la mañana» con él. */
  manana: boolean
}

/**
 * Qué campos lleva el formulario de un día.
 *
 * `corrigiendo` es que el atleta ha pulsado «¿No dormiste eso? Corregir las
 * horas»: vuelve el deslizador y lo que guarde cuenta como escrito a mano.
 */
export function quePreguntar(p: {
  conectado: boolean
  noche: NocheReloj | null | undefined
  mideManana: boolean
  corrigiendo?: boolean
}): QuePreguntar {
  if (!p.conectado) return { modo: 'sin_reloj', horas: true, franjaReloj: false, manana: true }
  const llego = horasDeMinutos(p.noche?.dormido_min) != null
  return {
    modo: llego ? 'noche_recibida' : 'noche_pendiente',
    horas: !llego || !!p.corrigiendo,
    franjaReloj: llego,
    manana: p.mideManana,
  }
}

/**
 * Lo que se guarda de lo objetivo, según lo que se preguntó.
 *
 * - Las horas: las del reloj si llegó la noche y no se corrigieron; si no, las
 *   del deslizador. `sueno_del_reloj` dice cuál de las dos es, porque el motor
 *   las compara en series distintas.
 * - HRV y FC de la noche: lo que haya llegado del reloj, se pregunte lo que se
 *   pregunte. Van a sus columnas propias.
 * - HRV y FC de la mañana: solo si el formulario las preguntó.
 */
export function objetivosAGuardar(p: {
  q: QuePreguntar
  noche: NocheReloj | null | undefined
  horasMano: number | null
  hrvMano: string
  fcMano: string
}): {
  horas_sueno: number | null
  sueno_del_reloj: boolean
  hrv: number | null
  fc_reposo: number | null
  hrv_noche: number | null
  fc_noche: number | null
} {
  const delReloj = p.q.franjaReloj && !p.q.horas
  const numMano = (s: string): number | null => {
    const t = (s || '').trim().replace(',', '.')
    if (!t) return null
    const v = Number(t)
    return Number.isFinite(v) && v > 0 ? v : null
  }
  return {
    horas_sueno: delReloj ? horasDeMinutos(p.noche?.dormido_min) : p.horasMano,
    sueno_del_reloj: delReloj,
    hrv: p.q.manana ? numMano(p.hrvMano) : null,
    fc_reposo: p.q.manana ? (v => (v == null ? null : Math.round(v)))(numMano(p.fcMano)) : null,
    hrv_noche: p.q.modo === 'sin_reloj' ? null : (p.noche?.rmssd_ms ?? null),
    fc_noche: p.q.modo === 'sin_reloj' ? null : (p.noche?.fc_media != null ? Math.round(p.noche.fc_media) : null),
  }
}

/** Cuántas preguntas tiene el formulario: las 7 subjetivas más lo objetivo que toque. */
export function numeroDePreguntas(q: QuePreguntar): number {
  return 7 + (q.horas ? 1 : 0) + (q.manana ? 2 : 0)
}
