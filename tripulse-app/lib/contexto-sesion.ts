// ============================================================
// TRIPULSE — Dónde cae una sesión dentro del plan
// ============================================================
// «Semana 2 de 4 · Carga», «faltan 19 días para la competición», «hoy tiene otra
// sesión». Es el contexto que hace que la misma sesión signifique una cosa en
// semana de choque y otra en descarga, y va en la cabecera del editor.
//
// ESTO VIVÍA DENTRO DE LA PANTALLA, metido en una cascada de siete consultas
// encadenadas. Aquí es lógica pura sobre listas: se puede probar, y sobre todo
// se puede cambiar la forma de traer los datos sin tocar la forma de contarlos.
//
// NI MESOCICLO NI MICROCICLO TIENEN COLUMNA DE NÚMERO. El «2 de 4» sale de la
// POSICIÓN por fecha dentro de su padre, y por eso hace falta la lista entera de
// hermanos y no basta con la fila de la sesión.
import { soloDia, diasEntre } from './fechas'

export interface MesoCtx {
  id: number
  fecha_inicio: string
  id_macrociclo: number | null
}

export interface MicroCtx {
  id: number
  fecha_inicio: string
  tipo: string | null
  id_mesociclo: number | null
}

export interface PosicionPlan {
  /** Qué bloque hace dentro de su macrociclo. */
  meso: number | null
  /** Qué semana hace dentro de su bloque. */
  semana: number | null
  /** «Carga», «Recuperación», «Competición». */
  tipo: string | null
}

const VACIA: PosicionPlan = { meso: null, semana: null, tipo: null }

const porFecha = <T extends { fecha_inicio: string }>(a: T, b: T) =>
  soloDia(a.fecha_inicio).localeCompare(soloDia(b.fecha_inicio))

/**
 * En qué punto del plan cae la sesión que cuelga de `idMicro`.
 *
 * `mesos` y `micros` pueden venir con TODO lo del deportista, de varios planes:
 * el filtrado al macrociclo que toca se hace aquí. Es a propósito — así la
 * pantalla trae los dos listados de una vez en lugar de encadenar cinco
 * consultas para acotar, y un atleta con dos temporadas sigue viendo «semana 2
 * de 4» de la suya y no un número contado sobre las dos.
 */
export function posicionEnPlan(
  idMicro: number | null | undefined,
  mesos: MesoCtx[],
  micros: MicroCtx[],
): PosicionPlan {
  if (idMicro == null) return VACIA
  const micro = micros.find(m => m.id === idMicro)
  if (!micro) return VACIA

  const meso = mesos.find(m => m.id === micro.id_mesociclo) || null

  // Los bloques de SU macrociclo, en orden. Sin meso no hay a qué compararlo,
  // pero la semana y el tipo sí se saben: se devuelve lo que se sabe.
  const nMeso = meso
    ? mesos.filter(m => m.id_macrociclo === meso.id_macrociclo).sort(porFecha)
        .findIndex(m => m.id === meso.id) + 1
    : 0

  const nSemana = micros.filter(m => m.id_mesociclo === micro.id_mesociclo).sort(porFecha)
    .findIndex(m => m.id === micro.id) + 1

  return {
    meso: nMeso > 0 ? nMeso : null,
    semana: nSemana > 0 ? nSemana : null,
    tipo: micro.tipo || null,
  }
}

/**
 * Cuántos días faltan para la próxima competición.
 *
 * La competición no es una fila propia aquí: es un microciclo marcado como
 * 'Competición'. Se busca el más cercano que no haya pasado ya.
 *
 * `micros` debe venir acotado al plan de la sesión (ver `microsDelPlan`): con
 * los de otra temporada, la cuenta atrás apuntaría a una carrera que no toca.
 */
export function diasHastaCompeticion(
  fechaSesion: string | null | undefined,
  micros: MicroCtx[],
): number | null {
  if (!fechaSesion) return null
  const desde = soloDia(fechaSesion)
  let mejor: number | null = null
  micros.forEach(m => {
    if (m.tipo !== 'Competición' || !m.fecha_inicio) return
    const d = diasEntre(desde, soloDia(m.fecha_inicio))
    // Las que ya pasaron no cuentan: la de la semana pasada no es «la próxima».
    if (d >= 0 && (mejor === null || d < mejor)) mejor = d
  })
  return mejor
}

/** Los microciclos del mismo macrociclo que la sesión. */
export function microsDelPlan(
  idMicro: number | null | undefined,
  mesos: MesoCtx[],
  micros: MicroCtx[],
): MicroCtx[] {
  const micro = micros.find(m => m.id === idMicro)
  const meso = micro ? mesos.find(m => m.id === micro.id_mesociclo) : null
  if (!meso) return []
  const ids = new Set(mesos.filter(m => m.id_macrociclo === meso.id_macrociclo).map(m => m.id))
  return micros.filter(m => m.id_mesociclo != null && ids.has(m.id_mesociclo))
}

/**
 * ¿Tiene el atleta otra sesión ese mismo día?
 *
 * Importa para la recomendación de recuperación: dos sesiones en un día no se
 * recuperan igual que una. Las canceladas no cuentan — están ahí pero no se
 * van a hacer.
 */
export function hayOtraSesionEseDia(
  sesionesDelDia: { id: number; estado?: string | null }[],
  idActual: number,
): boolean {
  return sesionesDelDia.some(s => s.id !== idActual && s.estado !== 'Cancelada')
}
