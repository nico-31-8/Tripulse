// ============================================================
// Serie a serie: cuando las series de un ejercicio no son iguales
// ============================================================
//
// Una prescripción de fuerza era UNA fila —«3 × 8 @ 60 · RIR 2»— con todas sus
// series iguales. Una pirámide (12/10/8 a 40/45/50 kg) no se podía escribir más
// que en las notas, donde no la lee nadie. Ahora cada serie puede llevar lo
// suyo en `ejercicios.series_detalle`, y el segundo ejercicio de una superserie
// en `encadenado_series_detalle` (supabase/serie-a-serie.sql).
//
// LA LISTA SOLO EXISTE SI HAY DIFERENCIAS. Con todas iguales se guarda null y
// mandan las columnas de la fila, como siempre: nada de lo que ya existe cambia,
// y quien lee no tiene que preguntarse cuál de las dos fuentes manda.
//
// CON LISTA, LAS COLUMNAS DE LA FILA GUARDAN EL RESUMEN —las repeticiones de la
// menor a la mayor, el control «1-3», el peso vacío si cambia— para que
// una pantalla que no sepa de la lista siga leyendo algo cierto, aunque menos
// preciso. Las que sí saben (las del deportista, la tabla, el resumen) leen la
// lista con `seriesDe`.
//
// LA BARRA ES SERIE A SERIE Y EL GUION ES RANGO: «12/10/8» son tres series;
// «8-10» es una serie de entre 8 y 10. Se pueden mezclar: «10-12/8-10». Con el
// guion para las dos cosas, «10-8» no se sabría si es un rango o dos series.

import { leerReps, textoReps, repsParaCalcular, repsDeCalculo, repsDeEjercicio, repsDeEncadenado } from './repeticiones'
import { mmssASegundos, mmssCorto } from './medicion'
import { textoControl } from './control-esfuerzo'

/** Una serie tal como se guarda. Lo que no lleve, no se prescribió. */
export interface SerieGuardada {
  reps?: number | null
  /** El tope si las repeticiones de esa serie son un rango («10-12»). */
  reps_max?: number | null
  /** Por tiempo: los segundos de esa serie, en lugar de repeticiones. */
  seg?: number | null
  kg?: number | null
  /** En la escala de la fila (`control_tipo`): «2» o «1-2». */
  control?: string | null
}

/**
 * Una serie en el editor, como se teclea. En modo tiempo `reps` lleva los
 * segundos («45» o «1:30»), igual que la casilla de la fila.
 */
export interface SerieEditor {
  reps: string
  kg: string
  rir: string
}

export type CampoSerie = keyof SerieEditor

const CAMPOS: CampoSerie[] = ['reps', 'kg', 'rir']

const vacia = (): SerieEditor => ({ reps: '', kg: '', rir: '' })

/* ── Leer lo que hay guardado ─────────────────────────────────────────────── */

const positivo = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * La lista guardada, comprobada. null si no hay, o si no es una lista de al
 * menos dos series: una sola serie no tiene nada que repartir.
 *
 * Viene de una columna jsonb, así que no se da por buena su forma: un valor
 * raro se lee como «no prescrito», nunca como un NaN que acabe en pantalla.
 */
export function leerDetalle(v: unknown): SerieGuardada[] | null {
  if (!Array.isArray(v) || v.length < 2) return null
  return v.map(x => {
    const o = x && typeof x === 'object' ? x as Record<string, unknown> : {}
    const reps = positivo(o.reps)
    const max = positivo(o.reps_max)
    const seg = positivo(o.seg)
    const control = typeof o.control === 'number' ? String(o.control)
      : typeof o.control === 'string' && o.control.trim() ? o.control.trim() : null
    return {
      reps: reps ? Math.round(reps) : null,
      reps_max: reps && max && Math.round(max) > Math.round(reps) ? Math.round(max) : null,
      seg: seg ? Math.round(seg) : null,
      kg: positivo(o.kg),
      control,
    }
  })
}

/* ── El editor ────────────────────────────────────────────────────────────── */

/** Las series nacen iguales a la fila: luego se toca solo la que cambia. */
export function seriesIguales(n: number, fila: SerieEditor): SerieEditor[] {
  return Array.from({ length: Math.max(0, Math.floor(n) || 0) }, () => ({ ...fila }))
}

/**
 * Al número de series de arriba: subir añade copiando la última, bajar quita
 * las últimas.
 *
 * Por debajo de 2 NO se toca la lista. Mientras se teclea el número se pasa por
 * «» o por «1» («3» → «» → «4»), y recortar ahí tiraría las series que el
 * entrenador ya había escrito. Con una serie la lista no se guarda (ver
 * `paraGuardar`), pero sigue ahí si vuelve a subir.
 */
export function ajustarSeries(lista: SerieEditor[], n: number): SerieEditor[] {
  const total = Math.floor(n) || 0
  if (total < 2 || lista.length === total) return lista
  if (lista.length > total) return lista.slice(0, total)
  const ultima = lista[lista.length - 1] || vacia()
  return [...lista, ...Array.from({ length: total - lista.length }, () => ({ ...ultima }))]
}

/**
 * La forma de comparar dos valores: «8 - 10» y «8-10» son lo mismo, y «40,0»
 * y «40» también. Sin esto, una coma bastaría para que la fila dijera que las
 * series son distintas.
 */
function canon(campo: CampoSerie, v: string, porTiempo: boolean): string {
  const t = String(v ?? '').trim()
  if (!t) return ''
  if (campo === 'reps') {
    if (porTiempo) {
      const s = mmssASegundos(t)
      return s > 0 ? String(s) : t
    }
    const r = leerReps(t)
    return r ? textoReps(r.min, r.max) : t
  }
  if (campo === 'kg') {
    const n = Number(t.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? String(n) : t
  }
  return t.replace(/\s+/g, '')
}

/** El valor de un campo si es el mismo en todas las series; null si cambia. */
export function valorComun(lista: SerieEditor[], campo: CampoSerie, porTiempo = false): string | null {
  if (!lista.length) return null
  const primero = canon(campo, lista[0][campo], porTiempo)
  return lista.every(s => canon(campo, s[campo], porTiempo) === primero) ? String(lista[0][campo] ?? '').trim() : null
}

/** ¿Alguna serie distinta en algún campo? */
export function sonDistintas(lista: SerieEditor[], porTiempo = false): boolean {
  return lista.length >= 2 && CAMPOS.some(c => valorComun(lista, c, porTiempo) === null)
}

/** «12/10/8» para la fila de arriba. La serie que no lleva ese dato sale «—». */
export function resumenCampo(lista: SerieEditor[], campo: CampoSerie, porTiempo = false): string {
  return lista.map(s => {
    const c = canon(campo, s[campo], porTiempo)
    if (!c) return '—'
    /* Por tiempo se enseña como se teclea («1:30»), no en segundos sueltos. */
    return campo === 'reps' && porTiempo && /^\d+$/.test(c) ? (Number(c) < 60 ? c : mmssCorto(Number(c))) : c
  }).join('/')
}

/** Lo que se teclea arriba mientras el campo es igual en todas: va a todas. */
export function ponerEnTodas(lista: SerieEditor[], campo: CampoSerie, valor: string): SerieEditor[] {
  return lista.map(s => ({ ...s, [campo]: valor }))
}

/** Lo que se teclea en una serie. */
export function ponerEnUna(lista: SerieEditor[], k: number, campo: CampoSerie, valor: string): SerieEditor[] {
  return lista.map((s, i) => i === k ? { ...s, [campo]: valor } : s)
}

/** «Igualar todas a la serie 1». */
export function igualarALaPrimera(lista: SerieEditor[]): SerieEditor[] {
  return lista.length ? lista.map(() => ({ ...lista[0] })) : lista
}

/** De la base al editor, para editar o duplicar una tarea guardada. */
export function seriesParaEditar(det: unknown, porTiempo: boolean): SerieEditor[] | null {
  const lista = leerDetalle(det)
  if (!lista) return null
  return lista.map(s => ({
    reps: porTiempo
      ? (s.seg ? (s.seg < 60 ? String(s.seg) : mmssCorto(s.seg)) : '')
      : textoReps(s.reps, s.reps_max),
    kg: s.kg != null ? String(s.kg) : '',
    rir: s.control ?? '',
  }))
}

/* ── Guardar ──────────────────────────────────────────────────────────────── */

function serieGuardada(s: SerieEditor, porTiempo: boolean): SerieGuardada {
  const out: SerieGuardada = {}
  const reps = String(s.reps ?? '').trim()
  if (porTiempo) {
    const seg = mmssASegundos(reps)
    if (seg > 0) out.seg = seg
  } else {
    const r = leerReps(reps)
    if (r) {
      out.reps = r.min
      if (r.max) out.reps_max = r.max
    }
  }
  const kg = positivo(String(s.kg ?? '').replace(',', '.'))
  if (kg) out.kg = kg
  const c = String(s.rir ?? '').trim()
  if (c) out.control = c
  return out
}

/** Los números que hay en un control escrito: «1-2» → [1, 2]; «0.60» → [0.6]. */
function numerosDe(control: string | null | undefined): number[] {
  return (String(control ?? '').replace(/,/g, '.').match(/\d+(?:\.\d+)?/g) || []).map(Number)
}

export interface ResumenFila {
  /** «8-12»: de la menor a la mayor. Vacío por tiempo o sin repeticiones. */
  reps: string
  /**
   * La media de los segundos, redondeada. Va a `p_duracion`, que se lee como
   * «por serie»: con la media, series × media da el total de verdad.
   */
  seg: number | null
  /** El peso si es el mismo en todas; null si cambia. */
  kg: number | null
  /** «1-3»: del menor al mayor control escrito. */
  control: string | null
}

/** Lo que va a las columnas de la fila cuando hay lista. */
export function resumenParaFila(det: SerieGuardada[]): ResumenFila {
  const mins = det.map(s => s.reps).filter((v): v is number => !!v)
  const maxs = det.map(s => s.reps_max || s.reps).filter((v): v is number => !!v)
  const min = mins.length ? Math.min(...mins) : 0
  const max = maxs.length ? Math.max(...maxs) : 0

  const segs = det.map(s => s.seg || 0)
  const conSeg = segs.filter(s => s > 0)
  const seg = conSeg.length ? Math.round(segs.reduce((a, b) => a + b, 0) / det.length) : null

  const kgs = det.map(s => s.kg ?? null)
  const kg = kgs[0] != null && kgs.every(k => k === kgs[0]) ? kgs[0] : null

  const nums = det.flatMap(s => numerosDe(s.control))
  const cMin = nums.length ? Math.min(...nums) : null
  const cMax = nums.length ? Math.max(...nums) : null
  const control = cMin == null ? (det.find(s => s.control)?.control ?? null)
    : cMin === cMax ? String(cMin) : cMin + '-' + cMax

  return { reps: textoReps(min, max > min ? max : null), seg, kg, control }
}

/**
 * Lo que se guarda de una fila del editor: la lista (o null) y lo que va a las
 * columnas de la fila, en el mismo texto que teclearía el entrenador, para que
 * el guardado de siempre lo trate igual.
 *
 *  · Sin lista: lo de siempre, la fila tal cual.
 *  · Con menos de 2 series: no hay nada que repartir. Manda la primera serie,
 *    que es lo que el entrenador estaba viendo.
 *  · Con todas iguales: null, y la fila con sus valores.
 *  · Con alguna distinta: la lista, y la fila con el resumen.
 */
export function paraGuardar(
  lista: SerieEditor[] | null | undefined,
  n: number,
  porTiempo: boolean,
  fila: SerieEditor,
): { detalle: SerieGuardada[] | null; fila: SerieEditor } {
  if (!lista || !lista.length) return { detalle: null, fila }
  if ((Math.floor(n) || 0) < 2) return { detalle: null, fila: { ...lista[0] } }
  const ajustada = ajustarSeries(lista, n)
  if (!sonDistintas(ajustada, porTiempo)) return { detalle: null, fila: { ...ajustada[0] } }
  const detalle = ajustada.map(s => serieGuardada(s, porTiempo))
  const r = resumenParaFila(detalle)
  return {
    detalle,
    fila: {
      reps: porTiempo ? (r.seg ? String(r.seg) : '') : r.reps,
      kg: r.kg != null ? String(r.kg) : '',
      rir: r.control ?? '',
    },
  }
}

/* ── Lo que se enseña ─────────────────────────────────────────────────────── */

/** Una serie para pintarla o para el fantasma de una casilla. */
export interface SerieVista {
  /** «12» o «10-12». Vacío por tiempo o si no se prescribió. */
  reps: string
  seg: number | null
  kg: number | null
  /** En la escala del ejercicio. Vacío si no se prescribió. */
  control: string
}

export interface OpcionesSeries {
  /** El segundo ejercicio de una superserie. */
  encadenado?: boolean
  /**
   * Los segundos por serie de la tarea (`p_duracion`) cuando el principal va
   * por tiempo: viven en la tarea, no en el ejercicio.
   */
  segFila?: number | null
  /** Cuántas series pintar. Por defecto, las del ejercicio. */
  n?: number
}

/**
 * Las series de un ejercicio, una por una: de la lista si la tiene; si no,
 * todas iguales desde las columnas de la fila, que es lo de siempre.
 */
export function seriesDe(ej: any, o: OpcionesSeries = {}): SerieVista[] {
  const enc = !!o.encadenado
  const det = leerDetalle(enc ? ej?.encadenado_series_detalle : ej?.series_detalle)
  const nEj = Number(enc ? (ej?.encadenado_series ?? ej?.series) : ej?.series) || 0
  const n = Math.max(1, Math.floor(o.n ?? (det ? det.length : nEj)) || 1)

  const fila: SerieVista = {
    reps: enc ? repsDeEncadenado(ej) : repsDeEjercicio(ej),
    seg: enc ? null : (positivo(o.segFila) ? Math.round(Number(o.segFila)) : null),
    kg: positivo(enc ? ej?.encadenado_intensidad : ej?.intensidad),
    control: String((enc ? ej?.encadenado_control_valor : ej?.control_valor) ?? '').trim(),
  }
  if (!det) return Array.from({ length: n }, () => ({ ...fila }))

  return Array.from({ length: n }, (_, k) => {
    const s = det[k]
    /* Si la tarea tiene más series que la lista (se cambió a mano en otro
       sitio), las que sobran no tienen nada propio: llevan el resumen. */
    if (!s) return { ...fila }
    return {
      reps: textoReps(s.reps, s.reps_max),
      seg: s.seg ?? null,
      kg: s.kg ?? null,
      control: s.control ?? '',
    }
  })
}

/** ¿Lleva series distintas? */
export function tieneSeriesDistintas(ej: any, encadenado = false): boolean {
  return !!leerDetalle(encadenado ? ej?.encadenado_series_detalle : ej?.series_detalle)
}

/** «40», «27.5». */
const numero = (n: number) => String(Math.round(n * 100) / 100)

/** Un valor por serie, unidos con barra; uno solo si es el mismo en todas. */
function unir(valores: string[]): string {
  if (!valores.length || valores.every(v => !v)) return ''
  if (valores.every(v => v === valores[0])) return valores[0]
  return valores.map(v => v || '—').join('/')
}

/** «12/10/8» (o «8» si son iguales); por tiempo, «45/40/30 s». '' si nada. */
export function textoRepsSeries(series: SerieVista[], porTiempo: boolean): string {
  if (porTiempo) {
    const t = unir(series.map(s => s.seg ? String(s.seg) : ''))
    return t ? t + ' s' : ''
  }
  return unir(series.map(s => s.reps))
}

/** «40/45/50 kg», con «—» en la serie que no lleva; '' si ninguna lleva. */
export function textoKgSeries(series: SerieVista[]): string {
  const t = unir(series.map(s => s.kg != null ? numero(s.kg) : ''))
  return t ? t + ' kg' : ''
}

/** «RIR 3/2/1» o «70/75/80 % 1RM»; '' si ninguna lleva. */
export function textoControlSeries(series: SerieVista[], tipo: string | null | undefined): string {
  return textoControl(tipo, unir(series.map(s => s.control)))
}

/** Lo que suman las repeticiones de todas las series: «30», o «28-34» con rangos. */
export function textoRepsTotalSeries(series: SerieVista[]): string {
  let min = 0, max = 0
  for (const s of series) {
    const r = leerReps(s.reps)
    if (!r) continue
    min += r.min
    max += r.max ?? r.min
  }
  return textoReps(min, max > min ? max : null)
}

/**
 * Una serie en una línea, para el resumen del deportista: «12 reps · 40 kg ·
 * RIR 3», «40 s · 24 kg · RPE 7». Los trozos que no se prescribieron no salen.
 */
export function trozosSerie(s: SerieVista, tipo: string | null | undefined, porTiempo: boolean): string[] {
  return [
    porTiempo ? (s.seg ? s.seg + ' s' : '') : (s.reps ? s.reps + ' reps' : ''),
    s.kg != null ? numero(s.kg) + ' kg' : '',
    textoControl(tipo, s.control),
  ]
}

/* ── Las cuentas ──────────────────────────────────────────────────────────── */

/**
 * Las repeticiones por serie con las que se calcula la duración. Con lista, la
 * media de los centros de cada serie: series × media da lo que suman todas, que
 * es lo que dura de verdad. Sin lista, lo de siempre (lib/repeticiones).
 */
export function repsDeCalculoPorSerie(ej: any): number {
  const det = leerDetalle(ej?.series_detalle)
  if (!det) return repsDeCalculo(ej)
  return det.reduce((a, s) => a + repsParaCalcular(s.reps, s.reps_max), 0) / det.length
}

/** Lo mismo con los segundos de un ejercicio por tiempo. */
export function segDeCalculoPorSerie(ej: any, segFila: number): number {
  const det = leerDetalle(ej?.series_detalle)
  if (!det || !det.some(s => s.seg)) return segFila
  return det.reduce((a, s) => a + (s.seg || 0), 0) / det.length
}
