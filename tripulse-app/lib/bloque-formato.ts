// ============================================================
// TRIPULSE — Bloques con formato: rondas, AMRAP, EMOM, for time, Tabata
// ============================================================
//
// PARA QUÉ. Un HYROX es «8 × (1 km + estación)» y un WOD es «AMRAP 12′ de
// wall balls, burpees y remo». Con líneas sueltas, cada una con sus series, no
// se podía escribir: faltaba decir que varias líneas se hacen JUNTAS y cómo se
// encadenan en el tiempo. Eso es un bloque.
//
// QUÉ ES, POR DENTRO. Una tarea con `formato` y `formato_config`, y varias
// líneas: sus filas de `ejercicios`, en su `orden`. Así el orden de la sesión,
// arrastrar, duplicar y el reparto de carga por bloque funcionan como con
// cualquier tarea. Las líneas no llevan series: las pone el bloque.
//
// CADA LÍNEA SE MIDE en repeticiones, segundos, metros o calorías, y puede
// llevar kilos (un trineo o un paseo del granjero son metros con carga). Las de
// cardio siguen en sus columnas de siempre (lib/cardio-fuerza).
//
// DURACIÓN. En AMRAP, EMOM y Tabata la pone el formato: son minutos cerrados.
// En rondas y for time se ESTIMA con reglas gruesas —y se dice que es una
// estimación—; si el atleta cronometra la sesión, manda lo real (eso ya lo
// hace lib/duracion-carga). La carga sale de ahí: RPE × duración.
//
// LO QUE APUNTA EL ATLETA es el resultado del bloque, no serie a serie: un
// tiempo, unas rondas + repeticiones, los minutos que completó. Es lo que se
// compara con «la última vez».

import { segundosDeCardio, cuantoPorSerie, modalidadDe } from './cardio-fuerza'

export type Formato = 'rondas' | 'amrap' | 'emom' | 'fortime' | 'tabata'

export const FORMATOS: { id: Formato; nombre: string }[] = [
  { id: 'rondas', nombre: 'Rondas' },
  { id: 'amrap', nombre: 'AMRAP' },
  { id: 'emom', nombre: 'EMOM' },
  { id: 'fortime', nombre: 'For time' },
  { id: 'tabata', nombre: 'Tabata' },
]

export const esFormato = (f: unknown): f is Formato => FORMATOS.some(x => x.id === f)
export const nombreFormato = (f: string | null | undefined): string => FORMATOS.find(x => x.id === f)?.nombre || ''

/** Si una tarea es un bloque (y no una línea suelta). */
export const esBloque = (t: { formato?: string | null } | null | undefined): boolean => esFormato(t?.formato)

export interface ConfigBloque {
  /** Rondas (formato «rondas»; en for time, si no hay esquema). */
  rondas: number
  /** Segundos de descanso entre rondas. */
  descanso: number
  /** AMRAP y EMOM: minutos. */
  minutos: number
  /** EMOM: cada cuántos segundos empieza el siguiente (60 = cada minuto). */
  cada: number
  /** EMOM: cada minuto una línea (true) o todas cada minuto (false). */
  alternar: boolean
  /** For time: repeticiones por ronda, 21-15-9. Vacío = `rondas` con lo de cada línea. */
  esquema: number[]
  /** For time: minutos de límite. */
  limite: number
  /** Tabata: segundos de trabajo, de pausa, y cuántas vueltas por línea. */
  trabajo: number
  pausa: number
  vueltas: number
}

export const CONFIG_INICIAL: ConfigBloque = {
  rondas: 4, descanso: 120, minutos: 12, cada: 60, alternar: true,
  esquema: [21, 15, 9], limite: 10, trabajo: 20, pausa: 10, vueltas: 8,
}

const entero = (v: unknown, def: number, min = 1): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= min ? n : def
}

/** La configuración guardada, con lo que falte rellenado y lo absurdo corregido. */
export function leerConfig(raw: unknown): ConfigBloque {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const esquema = Array.isArray(r.esquema)
    ? r.esquema.map(Number).filter(n => Number.isFinite(n) && n > 0).map(Math.round)
    : CONFIG_INICIAL.esquema
  return {
    rondas: entero(r.rondas, CONFIG_INICIAL.rondas),
    descanso: entero(r.descanso, CONFIG_INICIAL.descanso, 0),
    minutos: entero(r.minutos, CONFIG_INICIAL.minutos),
    cada: entero(r.cada, CONFIG_INICIAL.cada),
    alternar: typeof r.alternar === 'boolean' ? r.alternar : CONFIG_INICIAL.alternar,
    esquema,
    limite: entero(r.limite, CONFIG_INICIAL.limite),
    trabajo: entero(r.trabajo, CONFIG_INICIAL.trabajo),
    pausa: entero(r.pausa, CONFIG_INICIAL.pausa, 0),
    vueltas: entero(r.vueltas, CONFIG_INICIAL.vueltas),
  }
}

/** «21-15-9» → [21, 15, 9]. Acepta guiones, comas o espacios. */
export const leerEsquema = (s: string): number[] =>
  String(s || '').split(/[-,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0).map(Math.round)

// ============================================================
// Las líneas
// ============================================================

export type MedidaLinea = 'reps' | 'seg' | 'm' | 'cal'

export const MEDIDAS: { id: MedidaLinea; corto: string }[] = [
  { id: 'reps', corto: 'reps' }, { id: 'seg', corto: 'seg' }, { id: 'm', corto: 'm' }, { id: 'cal', corto: 'cal' },
]

/** Una línea de un bloque tal como está guardada: una fila de `ejercicios`. */
export interface LineaBloque {
  id?: number | null
  orden?: number | null
  series?: number | null
  nombre?: string | null
  tipo_serie?: string | null
  grupo_muscular?: string | null
  ejercicio_id?: number | string | null
  medida?: string | null
  cantidad?: number | string | null
  repeticiones?: number | null
  intensidad?: number | string | null
  cardio_modo?: string | null
  cardio_medida?: string | null
  cardio_valor?: number | null
  cardio_zona?: string | null
  cardio_objetivo?: string | null
}

/** Si la línea es de cardio. La modalidad es lo que lo dice; el tipo, por si falta. */
export const esCardioLinea = (l: LineaBloque): boolean => !!l.cardio_modo || l.tipo_serie === 'Cardio'

/** En su orden. Sin `orden`, el de creación: es como se guardaron. */
export function ordenarLineas<T extends LineaBloque>(lineas: T[] | null | undefined): T[] {
  return (lineas || []).slice().sort((a, b) =>
    (Number(a.orden) || 0) - (Number(b.orden) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0))
}

/** La medida de una línea de ejercicio. Las viejas no la traen: eran repeticiones. */
export const medidaDeLinea = (l: LineaBloque): MedidaLinea =>
  (['reps', 'seg', 'm', 'cal'] as const).find(m => m === l.medida) ?? 'reps'

/** Cuánto pide una línea de ejercicio, en su medida. */
export const cantidadDeLinea = (l: LineaBloque): number =>
  Number(l.cantidad ?? l.repeticiones) || 0

/* REGLAS GRUESAS, y a propósito: sirven para estimar cuánto dura una ronda, no
   para medir a nadie. Una repetición son 3 s (lo mismo que la fuerza de
   siempre, lib/duracion), un metro con el cuerpo o con carga 1,5 s —más lento
   que andar: se lleva algo o se va saltando—, y una caloría en máquina 4 s. Si
   el atleta cronometra la sesión, lo real manda. */
export const SEG_POR_REP = 3
export const SEG_POR_METRO = 1.5
export const SEG_POR_CAL = 4

/**
 * Cuánto dura UNA vez la línea, en segundos. `null` = no se sabe.
 *
 * `reps` sustituye lo prescrito (en un for time 21-15-9 cada ronda pide otra
 * cantidad). `segCardio` lo pasa quien tiene los tests del atleta, para que
 * un kilómetro de carrera salga a SU ritmo y no a uno inventado.
 */
export function segundosDeLinea(
  l: LineaBloque,
  reps?: number | null,
  segCardio?: (l: LineaBloque) => number | null,
): number | null {
  if (esCardioLinea(l)) {
    const valor = reps != null ? reps : l.cardio_valor
    const c = { modo: l.cardio_modo, medida: l.cardio_medida, valor, zona: l.cardio_zona }
    if (reps == null && segCardio) {
      const s = segCardio(l)
      if (s != null) return s
    }
    return segundosDeCardio(c)
  }
  const n = reps != null ? reps : cantidadDeLinea(l)
  if (!(n > 0)) return null
  switch (medidaDeLinea(l)) {
    case 'seg': return n
    case 'm': return n * SEG_POR_METRO
    case 'cal': return n * SEG_POR_CAL
    default: return n * SEG_POR_REP
  }
}

export interface DuracionBloque {
  segundos: number
  /** De dónde sale: la del formato (cerrada), estimada, o el límite del for time. */
  como: 'formato' | 'estimada' | 'limite'
}

/** Cuánto dura el bloque. */
export function duracionBloque(
  formato: Formato,
  cfg: ConfigBloque,
  lineas: LineaBloque[],
  segCardio?: (l: LineaBloque) => number | null,
): DuracionBloque {
  if (formato === 'amrap' || formato === 'emom') return { segundos: cfg.minutos * 60, como: 'formato' }
  if (formato === 'tabata') return { segundos: cfg.vueltas * (cfg.trabajo + cfg.pausa) * Math.max(1, lineas.length), como: 'formato' }
  if (formato === 'fortime') {
    const esquema = cfg.esquema.length ? cfg.esquema : Array(cfg.rondas).fill(null)
    const s = esquema.reduce((a: number, r: number | null) =>
      a + lineas.reduce((x, l) => x + (segundosDeLinea(l, r, segCardio) || 0), 0), 0)
    const tope = cfg.limite * 60
    return s > tope ? { segundos: tope, como: 'limite' } : { segundos: Math.round(s), como: 'estimada' }
  }
  const ronda = lineas.reduce((a, l) => a + (segundosDeLinea(l, null, segCardio) || 0), 0)
  return { segundos: Math.round(cfg.rondas * ronda + Math.max(0, cfg.rondas - 1) * cfg.descanso), como: 'estimada' }
}

/**
 * Cuántas veces se hace ESTA línea en el bloque: lo que cuentan las series por
 * grupo muscular.
 *
 * En rondas, una por ronda. En un EMOM que alterna, los minutos que le tocan.
 * En for time, una por ronda del esquema. En Tabata, sus vueltas. En AMRAP no
 * se sabe hasta que se hace: con `resultado`, las rondas que hizo; sin él, las
 * que salen de dividir el tiempo entre lo que dura una ronda.
 */
export function seriesDeLinea(
  formato: Formato,
  cfg: ConfigBloque,
  lineas: LineaBloque[],
  indice: number,
  resultado?: ResultadoBloque | null,
): number {
  const n = Math.max(1, lineas.length)
  switch (formato) {
    case 'rondas': return cfg.rondas
    case 'emom': return cfg.alternar ? Math.max(0, Math.ceil((cfg.minutos - indice) / n)) : cfg.minutos
    case 'fortime': return cfg.esquema.length || cfg.rondas
    case 'tabata': return cfg.vueltas
    case 'amrap': {
      if (resultado?.rondas != null) return Math.max(0, resultado.rondas) + ((resultado.reps || 0) > 0 ? 1 : 0)
      const ronda = lineas.reduce((a, l) => a + (segundosDeLinea(l) || 0), 0)
      return ronda > 0 ? Math.max(1, Math.floor(cfg.minutos * 60 / ronda)) : 1
    }
  }
}

// ============================================================
// Cómo se lee
// ============================================================

const mmss = (s: number) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0')
const minutos = (s: number) => s % 60 === 0 ? String(s / 60) : mmss(s)

/** «AMRAP 12′», «4 rondas · 2:00 de descanso», «EMOM 10′ alternando»… */
export function textoFormato(formato: Formato, cfg: ConfigBloque): string {
  switch (formato) {
    case 'rondas': return cfg.rondas + ' rondas' + (cfg.descanso ? ' · ' + mmss(cfg.descanso) + ' entre rondas' : '')
    case 'amrap': return 'AMRAP ' + cfg.minutos + '′'
    case 'emom': return (cfg.cada === 60 ? 'EMOM ' : 'Cada ' + minutos(cfg.cada) + ' · ') + cfg.minutos + '′' + (cfg.alternar ? ' alternando' : '')
    case 'fortime': return 'For time ' + (cfg.esquema.length ? cfg.esquema.join('-') : cfg.rondas + ' rondas') + ' · límite ' + cfg.limite + '′'
    case 'tabata': return 'Tabata ' + cfg.trabajo + '″/' + cfg.pausa + '″ × ' + cfg.vueltas
  }
}

const kgTexto = (kg: unknown) => Number(kg) > 0 ? ' @ ' + String(Number(kg)).replace('.', ',') + ' kg' : ''

/** «Wall balls · 20 reps @ 6 kg», «Remo · 15 cal · AEI», «Dominadas» (en for time, el esquema manda). */
export function textoLinea(l: LineaBloque, formato?: Formato | null): string {
  const sinCantidad = formato === 'fortime' || formato === 'tabata'
  if (esCardioLinea(l)) {
    const m = modalidadDe(l.cardio_modo)
    const cuanto = sinCantidad ? '' : cuantoPorSerie({ modo: l.cardio_modo, medida: l.cardio_medida, valor: l.cardio_valor })
    return [m?.nombre || l.nombre || 'Cardio', cuanto, l.cardio_zona || ''].filter(Boolean).join(' · ') +
      (l.cardio_objetivo ? ' @ ' + l.cardio_objetivo : '')
  }
  const n = cantidadDeLinea(l)
  const cuanto = sinCantidad || !n ? '' : String(n).replace('.', ',') + ' ' + medidaDeLinea(l)
  return [l.nombre || 'Ejercicio', cuanto].filter(Boolean).join(' · ') + kgTexto(l.intensidad)
}

/** Lo que tendrá que apuntar el atleta al terminar el bloque. */
export const QUE_SE_APUNTA: Record<Formato, string> = {
  rondas: 'el tiempo total',
  amrap: 'rondas + repeticiones',
  emom: 'los minutos que completó',
  fortime: 'el tiempo, o hasta dónde llegó si pasa el límite',
  tabata: 'las repeticiones de la peor vuelta',
}

// ============================================================
// El resultado
// ============================================================

export interface ResultadoBloque {
  /** Rondas y for time: el tiempo. */
  segundos?: number | null
  /** AMRAP: rondas completas + repeticiones sueltas. For time al límite: reps hechas. */
  rondas?: number | null
  reps?: number | null
  /** For time: llegó al límite sin acabar. */
  limite?: boolean | null
  /** EMOM: minutos completados. */
  minutos?: number | null
  /** Tabata: repeticiones de la peor vuelta. */
  peor?: number | null
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n
}

export function leerResultado(raw: unknown): ResultadoBloque | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: ResultadoBloque = {
    segundos: num(r.segundos), rondas: num(r.rondas), reps: num(r.reps),
    limite: r.limite === true, minutos: num(r.minutos), peor: num(r.peor),
  }
  const algo = out.segundos != null || out.rondas != null || out.reps != null || out.minutos != null || out.peor != null
  return algo ? out : null
}

/** «7 rondas + 12», «7:42», «Límite · 96 reps», «10 de 10 min», «Peor vuelta: 9». */
export function textoResultado(formato: Formato, r: ResultadoBloque | null | undefined, cfg?: ConfigBloque): string {
  if (!r) return ''
  switch (formato) {
    case 'amrap': return (r.rondas ?? 0) + ' rondas' + ((r.reps || 0) > 0 ? ' + ' + r.reps : '')
    case 'fortime': return r.limite ? 'Límite · ' + (r.reps ?? 0) + ' reps' : (r.segundos != null ? mmss(r.segundos) : '')
    case 'rondas': return r.segundos != null ? mmss(r.segundos) : ''
    case 'emom': return r.minutos != null ? r.minutos + (cfg ? ' de ' + cfg.minutos : '') + ' min' : ''
    case 'tabata': return r.peor != null ? 'Peor vuelta: ' + r.peor : ''
  }
}

/**
 * Si hoy fue mejor que la otra vez. `null` si no se pueden comparar.
 *
 * Menos tiempo es mejor en rondas y en for time; pero un for time al límite es
 * siempre peor que uno terminado, y entre dos al límite gana el de más reps.
 */
export function comparar(formato: Formato, antes: ResultadoBloque | null, hoy: ResultadoBloque | null): 'mejor' | 'igual' | 'peor' | null {
  if (!antes || !hoy) return null
  const cmp = (a: number, b: number, masEsMejor: boolean) => a === b ? 'igual' : (a > b) === masEsMejor ? 'mejor' : 'peor'
  switch (formato) {
    case 'amrap': {
      if (hoy.rondas == null || antes.rondas == null) return null
      return cmp(hoy.rondas * 1000 + (hoy.reps || 0), antes.rondas * 1000 + (antes.reps || 0), true)
    }
    case 'fortime': {
      if (hoy.limite && !antes.limite) return 'peor'
      if (!hoy.limite && antes.limite) return 'mejor'
      if (hoy.limite && antes.limite) return cmp(hoy.reps || 0, antes.reps || 0, true)
      if (hoy.segundos == null || antes.segundos == null) return null
      return cmp(hoy.segundos, antes.segundos, false)
    }
    case 'rondas': return hoy.segundos == null || antes.segundos == null ? null : cmp(hoy.segundos, antes.segundos, false)
    case 'emom': return hoy.minutos == null || antes.minutos == null ? null : cmp(hoy.minutos, antes.minutos, true)
    case 'tabata': return hoy.peor == null || antes.peor == null ? null : cmp(hoy.peor, antes.peor, true)
  }
}

/**
 * Qué bloques son «el mismo» para comparar con la última vez: el mismo formato
 * con los mismos ejercicios, en cualquier orden. Los kilos o las rondas pueden
 * cambiar de una semana a otra; lo que no puede cambiar es QUÉ se hace.
 */
export function firmaBloque(formato: string | null | undefined, lineas: LineaBloque[] | null | undefined): string {
  const nombres = (lineas || [])
    .map(l => (esCardioLinea(l) ? 'cardio:' + (l.cardio_modo || '') : (l.nombre || '')).trim().toLowerCase())
    .filter(Boolean).sort()
  return (formato || '') + '|' + nombres.join('+')
}
