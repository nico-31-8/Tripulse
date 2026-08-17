// ============================================================
// TRIPULSE — Encadenar bloques y ajustar a lo que pasó de verdad
// ============================================================
// `plan-mesociclo.ts` da la forma de UN bloque. Esto hace las dos cosas que
// faltaban para que sea un plan y no una lista:
//
//   1. ENCADENA los mesociclos del atleta en una sola tira de semanas, con
//      cuántas quedan hasta la carrera.
//   2. AJUSTA cada semana a lo que pasó en la anterior. Sin esto, si el atleta
//      se salta la semana 2, la 3 sigue pidiendo el 107 % — progresar sobre una
//      semana que no ocurrió es progresar desde una base que no existe.
//
// LA REGLA ASIMÉTRICA, OTRA VEZ. El ajuste solo puede BAJAR la carga o dejarla
// igual. Nunca subirla. Que el atleta hiciera menos de lo previsto no es permiso
// para pedirle más ahora: equivocarse bajando cuesta una semana, equivocarse
// subiendo cuesta una lesión. Es la misma decisión que gobierna `plan-ia.ts`.
//
// Y CADA CAMBIO LLEVA SU MOTIVO. Un plan que cambia sin decir por qué es un plan
// en el que el entrenador deja de confiar a la segunda vez.
import { UMBRALES_TSB, UMBRALES_ACWR, estadoACWR, estadoTSB } from './panel-metricas'
import { semanasDelMesociclo, claseDeMeso, semanasHasta, type ClaseMeso, type SemanaDelMeso } from './plan-mesociclo'
import type { DistanciaTri } from './distribucion-zonas'

export interface MesoDeCadena {
  id: number
  objetivo?: string | null
  tipo?: string | null
  fecha_inicio: string
  duracion_semanas?: number | null
}

export interface SemanaCadena extends SemanaDelMeso {
  mesoId: number
  mesoNombre: string
  clase: ClaseMeso
  /** Posición global en la cadena, desde 1. */
  global: number
  /** Semanas hasta la competición objetivo. `null` si no hay ninguna. */
  hastaMeta: number | null
}

/**
 * Todos los mesociclos del atleta en una sola tira de semanas.
 *
 * En orden de fecha, no de id: un mesociclo insertado después puede ir antes en
 * el calendario, y encadenar por id daría una progresión que sube y baja sin
 * sentido.
 */
export function cadenaDeMesos(
  mesos: MesoDeCadena[],
  opciones: { horasReferencia: number; distancia: DistanciaTri; competicion?: string | null },
): SemanaCadena[] {
  const orden = [...mesos]
    .filter(m => m.fecha_inicio)
    .sort((a, b) => String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)))

  const out: SemanaCadena[] = []
  for (const m of orden) {
    const clase = claseDeMeso(m.tipo)
    const semanas = semanasDelMesociclo({
      tipo: m.tipo,
      semanas: m.duracion_semanas || 4,
      horasReferencia: opciones.horasReferencia,
      distancia: opciones.distancia,
      lunes: String(m.fecha_inicio).slice(0, 10),
    })
    for (const s of semanas) {
      out.push({
        ...s,
        mesoId: m.id,
        mesoNombre: m.objetivo || m.tipo || 'Mesociclo',
        clase,
        global: out.length + 1,
        hastaMeta: opciones.competicion && s.lunes ? semanasHasta(s.lunes, opciones.competicion) : null,
      })
    }
  }
  return out
}

// ------------------------------------------------------------
// El ajuste
// ------------------------------------------------------------

export interface EstadoReal {
  /**
   * Carga hecha ÷ carga planificada de la semana anterior. 1 = la hizo entera.
   * `null` cuando no hay con qué comparar (la primera semana del plan).
   */
  cumplimiento?: number | null
  acwr?: number | null
  tsb?: number | null
}

export interface AjusteSemana {
  cargaOriginal: number
  cargaAjustada: number
  horasAjustadas: number
  /** Qué se hizo y por qué. Vacío = no se tocó nada. */
  motivos: string[]
  /** La semana pasa a ser de descarga aunque el patrón no lo pidiera. */
  convertidaEnDescarga: boolean
}

/** Por debajo de esto, la semana anterior no cuenta como hecha. */
export const CUMPLIMIENTO_MINIMO = 0.7

/** A dónde se baja una semana cuando la fatiga obliga a descargar. */
const CARGA_DESCARGA = 0.55

/**
 * Cuánto puede subir una semana respecto a lo que DE VERDAD se le pidió a la
 * anterior, cuando esa anterior se recortó.
 *
 * Los patrones de B1-03 nunca suben más de un 11 % de una semana a la siguiente
 * (0,90 → 1,00). El 15 % deja margen sin permitir un salto: si la semana pasada
 * hubo que bajarla al 55 % por fatiga, la siguiente no puede volver al 107 % como
 * si no hubiera pasado nada — eso es el escalón que nadie subió.
 *
 * NO se aplica después de una descarga PLANIFICADA. Ahí el salto es el objetivo:
 * la descarga existe justo para que el bloque siguiente pueda arrancar arriba.
 */
export const SALTO_MAXIMO = 1.15

const pct = (n: number) => Math.round(n * 100) + ' %'

/**
 * La carga de una semana a la vista de cómo llega el atleta.
 *
 * Las reglas se aplican todas y gana la más baja: si dos señales piden bajar, se
 * baja lo que pida la más exigente, no la suma de las dos.
 */
export interface Anterior {
  /** Lo que de verdad se le pidió, ya ajustado. */
  carga: number
  /** Se recortó por debajo de lo que decía el patrón. */
  recortada: boolean
  /** Era la descarga del bloque, planificada de antemano. */
  eraDescarga: boolean
}

export function ajustarSemana(
  s: { cargaRelativa: number; esDescarga: boolean; clase: ClaseMeso; horasSemana: number },
  estado: EstadoReal,
  anterior?: Anterior | number | null,
): AjusteSemana {
  // Se acepta un número suelto por comodidad de quien solo tiene la carga.
  const ant: Anterior | null = anterior == null ? null
    : typeof anterior === 'number' ? { carga: anterior, recortada: false, eraDescarga: false }
    : anterior
  const cargaSemanaAnterior = ant?.carga ?? null
  const motivos: string[] = []
  let carga = s.cargaRelativa
  let descarga = false

  const enTaper = s.clase === 'competicion'

  // 1. Fatiga alta → la semana se convierte en descarga.
  //    No se toca el tapering: ya es volumen bajo por diseño, y recortarlo más
  //    por un TSB negativo sería recortar justo lo que lo está haciendo bajar.
  const tsbMal = estado.tsb != null && estado.tsb < UMBRALES_TSB.sobrecarga
  const acwrMal = estado.acwr != null && estado.acwr > UMBRALES_ACWR.precaucion
  if ((tsbMal || acwrMal) && !s.esDescarga && !enTaper) {
    carga = Math.min(carga, CARGA_DESCARGA)
    descarga = true
    const razon = tsbMal
      ? 'TSB ' + Math.round(estado.tsb!) + ' (' + estadoTSB(estado.tsb!).label + ')'
      : 'ACWR ' + estado.acwr!.toFixed(2) + ' (' + estadoACWR(estado.acwr!).label + ')'
    motivos.push('Pasa a descarga por ' + razon + ': la semana que venía pedía ' + pct(s.cargaRelativa) + '.')
  }

  // 2. Precaución → no sube. Mantiene la carga de la semana anterior.
  const acwrOjo = estado.acwr != null && estado.acwr > UMBRALES_ACWR.optima && estado.acwr <= UMBRALES_ACWR.precaucion
  if (acwrOjo && !descarga && !s.esDescarga && cargaSemanaAnterior != null && s.cargaRelativa > cargaSemanaAnterior) {
    carga = Math.min(carga, cargaSemanaAnterior)
    motivos.push('No sube: ACWR ' + estado.acwr!.toFixed(2) + ' está en precaución. Se repite la carga de la semana anterior.')
  }

  // 3. La semana anterior no se hizo → no se progresa sobre ella.
  if (estado.cumplimiento != null && estado.cumplimiento < CUMPLIMIENTO_MINIMO
      && !descarga && !s.esDescarga && cargaSemanaAnterior != null && s.cargaRelativa > cargaSemanaAnterior) {
    carga = Math.min(carga, cargaSemanaAnterior)
    motivos.push('No sube: de la semana anterior se hizo el ' + pct(estado.cumplimiento) +
      '. Progresar sobre una semana que no ocurrió es progresar desde una base que no existe.')
  }

  // 4. Y el tope de salto. Esta es la regla que no depende de que ESTA semana
  //    tenga datos: si a la anterior hubo que recortarla, esta no puede volver
  //    al patrón como si no hubiera pasado nada. Sin esto, una semana sin
  //    métricas detrás de una descarga forzada saltaba del 55 % al 107 %.
  if (ant && ant.recortada && !ant.eraDescarga && !s.esDescarga) {
    const tope = Math.round(ant.carga * SALTO_MAXIMO * 1000) / 1000
    if (carga > tope) {
      carga = tope
      motivos.push('Techo por el recorte de la semana anterior: de ' + pct(ant.carga) +
        ' no se sube a ' + pct(s.cargaRelativa) + ' de golpe.')
    }
  }

  // La regla asimétrica: de aquí nunca sale una carga mayor que la del patrón.
  carga = Math.min(carga, s.cargaRelativa)

  return {
    cargaOriginal: s.cargaRelativa,
    cargaAjustada: Math.round(carga * 1000) / 1000,
    // Las horas se recalculan desde la proporción, para que no se separen del %.
    horasAjustadas: Math.round((s.horasSemana * (carga / s.cargaRelativa)) * 2) / 2,
    motivos,
    convertidaEnDescarga: descarga,
  }
}

/**
 * La cadena entera ajustada, arrastrando la carga de cada semana a la siguiente.
 *
 * El estado se da por semana (por su lunes). Lo que no tenga estado va sin
 * ajustar: no saber cómo llegó el atleta no es motivo para recortarle la semana.
 */
export function ajustarCadena(
  cadena: SemanaCadena[],
  estadoPorLunes: Record<string, EstadoReal>,
): (SemanaCadena & { ajuste: AjusteSemana })[] {
  let anterior: Anterior | null = null
  return cadena.map(s => {
    const ajuste = ajustarSemana(s, (s.lunes && estadoPorLunes[s.lunes]) || {}, anterior)
    // Lo que arrastra a la siguiente es lo que de verdad se le va a pedir, no lo
    // que el patrón decía: si esta bajó, la siguiente no puede apoyarse en un
    // escalón que nadie subió. Y se arrastra también SI se recortó, que es lo
    // que distingue «bajó porque toca» de «bajó porque hubo que bajarla».
    anterior = {
      carga: ajuste.cargaAjustada,
      recortada: ajuste.cargaAjustada < ajuste.cargaOriginal,
      eraDescarga: s.esDescarga,
    }
    return { ...s, ajuste }
  })
}
