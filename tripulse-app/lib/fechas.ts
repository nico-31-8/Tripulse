// ============================================================
// TRIPULSE — Fechas, en un solo sitio
// ============================================================
// Dieciséis ficheros hacían aritmética de fechas a mano, y no de la misma
// forma: `getLunesDeSemana` estaba escrita tres veces con tres estrategias
// distintas (medianoche UTC en una, mediodía local en otra, salida por
// `toISOString()` aquí y por `getFullYear()` allá). En España, UTC+1/+2, las
// tres dan el mismo lunes, así que nadie lo ha notado nunca. En un huso
// negativo darían días distintos, y en la app eso significa una sesión que
// aparece en la semana que no es.
//
// LA REGLA DE ESTE FICHERO, y es la que hace que todo cuadre:
//
//   · Una fecha SIN hora («2026-08-19») es un día del calendario, no un
//     instante. Se opera en UTC, porque es el único huso que no mueve el día al
//     serializar. Es lo que ya hacía lib/desplazar y por lo que se hizo así.
//
//   · «Hoy» SÍ es local. A las 00:30 del 23 en Madrid, en UTC todavía es el 22:
//     preguntarle la fecha a UTC le diría al atleta que hoy es ayer. Para esto
//     y solo para esto se mira el reloj de quien está delante.
//
// Todo lo que entra y sale son cadenas 'YYYY-MM-DD'. Los `Date` no salen de
// aquí: son la fuente de casi todos los errores de un día arriba o abajo.

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const
export const LETRAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const
export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const

/** El día del calendario de una cadena, como instante UTC. */
const dia = (iso: string) => new Date(String(iso).slice(0, 10) + 'T00:00:00Z')

/** ¿Es una fecha que se puede usar? Vale con o sin hora detrás. */
export function fechaValida(iso: unknown): boolean {
  if (typeof iso !== 'string') return false
  const s = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(dia(s).getTime())
}

/** Solo la parte de día: «2026-08-19T10:30:00» → «2026-08-19». */
export function soloDia(iso: string | null | undefined): string {
  return String(iso ?? '').slice(0, 10)
}

/**
 * Hoy, en el calendario de quien está delante.
 *
 * LOCAL A PROPÓSITO, y es la única función de aquí que lo es. Con
 * `new Date().toISOString()` un atleta que abre la app a las 00:30 en Madrid
 * vería el día de ayer, porque en UTC todavía lo es.
 */
export function hoyISO(): string {
  return aISO(new Date())
}

/** Un `Date` al día que marca el reloj LOCAL. */
export function aISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + dd
}

export function sumarDias(iso: string, dias: number): string {
  const d = dia(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((dia(hasta).getTime() - dia(desde).getTime()) / 86400000)
}

export function sumarSemanas(iso: string, semanas: number): string {
  return sumarDias(iso, semanas * 7)
}

/** Semanas enteras entre dos fechas. Redondea, así que el desfase horario da igual. */
export function semanasEntre(desde: string, hasta: string): number {
  return Math.round(diasEntre(desde, hasta) / 7)
}

/** 0 = lunes … 6 = domingo. La semana de la app empieza en lunes. */
export function indiceDia(iso: string): number {
  return (dia(iso).getUTCDay() + 6) % 7
}

/**
 * El lunes de la semana en la que cae esta fecha.
 *
 * El domingo pertenece a la semana que ACABA, no a la que empieza: en
 * JavaScript el domingo es el día 0, así que un `1 - getDay()` ingenuo lo manda
 * a la semana siguiente y la sesión del domingo desaparece del calendario.
 */
export function lunesDe(iso: string): string {
  return sumarDias(soloDia(iso), -indiceDia(iso))
}

/** El lunes que viene. Nunca hoy, aunque hoy sea lunes. */
export function proximoLunes(desde: string = hoyISO()): string {
  return sumarDias(lunesDe(desde), 7)
}

/** «Miércoles 19 ago». Cadena vacía si no hay fecha. */
export function fechaLarga(iso: string | null | undefined): string {
  if (!fechaValida(iso)) return String(iso ?? '')
  const s = soloDia(iso as string)
  const d = dia(s)
  return DIAS_SEMANA[indiceDia(s)] + ' ' + d.getUTCDate() + ' ' + MESES_CORTOS[d.getUTCMonth()]
}

/**
 * «Miércoles 19 de agosto».
 *
 * Hay DOS formatos largos a propósito, no es un descuido: la cabecera del
 * editor va apretada y usa el mes corto, y el briefing que lee el atleta lo
 * escribe entero porque ahí se lee como una frase. Lo que se comparte es la
 * maquinaria, no el formato.
 */
export function fechaLargaCompleta(iso: string | null | undefined): string {
  if (!fechaValida(iso)) return String(iso ?? '')
  const s = soloDia(iso as string)
  const d = dia(s)
  return DIAS_SEMANA[indiceDia(s)] + ' ' + d.getUTCDate() + ' de ' + MESES_LARGOS[d.getUTCMonth()]
}

/** «17–23 ago», o «31 ago – 6 sep» si la semana cambia de mes. */
export function rangoLegible(lunes: string, dias = 6): string {
  const fin = sumarDias(lunes, dias)
  const dL = dia(lunes), dF = dia(fin)
  return dL.getUTCMonth() === dF.getUTCMonth()
    ? dL.getUTCDate() + '–' + dF.getUTCDate() + ' ' + MESES_CORTOS[dF.getUTCMonth()]
    : dL.getUTCDate() + ' ' + MESES_CORTOS[dL.getUTCMonth()] + ' – '
      + dF.getUTCDate() + ' ' + MESES_CORTOS[dF.getUTCMonth()]
}

/**
 * Los años cumplidos.
 *
 * `hoy` se puede pasar para poder probarlo: una función que lee el reloj por su
 * cuenta no se puede testear sin congelar el tiempo.
 */
export function calcularEdad(fechaNacimiento: string | null | undefined, hoy: string = hoyISO()): number | null {
  if (!fechaValida(fechaNacimiento)) return null
  const n = dia(soloDia(fechaNacimiento as string)), h = dia(hoy)
  let edad = h.getUTCFullYear() - n.getUTCFullYear()
  const m = h.getUTCMonth() - n.getUTCMonth()
  if (m < 0 || (m === 0 && h.getUTCDate() < n.getUTCDate())) edad--
  return edad
}
