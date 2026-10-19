// ============================================================
// TRIPULSE — Qué entreno del reloj va con qué sesión
// ============================================================
// Maqueta aprobada el 2026-10-19 («las 7 como propones»). Hasta entonces los
// entrenos del reloj (Polar o COROS) se enseñaban al lado de lo planificado sin
// unirse a nada. Esto decide, sin tocar la base, cómo está cada uno:
//
//   · unida      → va con una sesión (y una parte, si es un brick). Si esa
//                  sesión aún no tiene RPE, «falta su RPE»: no suma carga.
//   · sugerida   → ese día hay UNA sesión sin cerrar de esa disciplina.
//   · completar  → la sesión de ese día ya se cerró a mano, sin el reloj.
//   · varias     → ese día hay varias: se elige.
//   · sin_sesion → de una disciplina nuestra, y ese día no tenía nada.
//   · no_cuenta  → otro deporte (caminar…) o alguien dijo «no contarla».
//
// LA APP SOLO SUGIERE. Une quien cierra la sesión (el deportista, que pone el
// RPE) o su entrenador. Nunca se cierra una sesión sola: la carga es RPE ×
// minutos, y un RPE que nadie dijo ensucia la de toda la semana.
//
// Qué pasa del reloj a la sesión (decisión 3): la duración, la hora de empezar
// y, si la parte tiene UNA sola tarea, su FC media y sus metros o su tiempo.
// Con varias tareas la FC del reloj es de toda la sesión: repartirla sería
// inventar. El RPE, la sensación y el dolor, nunca: los pone el deportista.

import { lunesDe } from './fechas'
import { vecesDe } from './bloques-tarea'

export type Decision = 'unida' | 'rechazada' | 'no_cuenta'

/** Lo que la unión cambió en la sesión, para dejarla como estaba al desunir. */
export interface AntesUnion {
  duracion_real: number | null
  hora_inicio: string | null
  tareas: { id: number; fc_media?: number | null; metros_reales?: number | null; tiempo_real?: number | null }[]
}

/** Una fila de reloj_union. */
export interface UnionReloj {
  id: number
  id_medicion: number
  id_sesion: number | null
  parte: number
  decision: Decision
  antes?: AntesUnion | null
  decidido_por?: string | null
  decidido_en?: string | null
}

export interface TareaParaUnir {
  id: number
  orden?: number | null
  disciplina?: string | null
  fc_media?: number | null
  series?: number | null
  bloques?: number | null
  p_distancia?: { id?: number; metros_reales?: number | string | null } | { id?: number; metros_reales?: number | string | null }[] | null
  p_duracion?: { id?: number; tiempo_real?: number | string | null } | { id?: number; tiempo_real?: number | string | null }[] | null
}

export interface SesionParaUnir {
  id: number
  fecha: string
  disciplina: string | null
  estado: string | null
  /** Las disciplinas de sus partes, en orden: una en una sesión normal, las de sus bloques en un brick. */
  partes: string[]
  rpe_reportado?: number | null
  duracion_real?: number | null
  hora_inicio?: string | null
  tareas?: TareaParaUnir[]
}

/** Lo que hace falta de un entreno del reloj (lib/actividades-reloj lo trae así). */
export interface ActividadParaUnir {
  id: number
  fecha: string
  disciplina: string | null
  minutos: number | null
  metros: number | null
  fcMedia: number | null
  /** La hora de empezar, como la guardó el traductor de la marca. */
  inicio?: string | null
}

export type EstadoActividad =
  | { k: 'unida'; sesion: SesionParaUnir; parte: number; faltaRpe: boolean; union: UnionReloj }
  | { k: 'sugerida'; sesion: SesionParaUnir; parte: number }
  | { k: 'completar'; sesion: SesionParaUnir; parte: number }
  | { k: 'varias'; opciones: { sesion: SesionParaUnir; parte: number }[] }
  | { k: 'sin_sesion' }
  | { k: 'no_cuenta'; motivo: 'otro_deporte' | 'descartada'; union?: UnionReloj }

/** Un brick tiene como mucho tres partes (natación, bici y carrera). */
export const PARTES_MAXIMAS = 3

/** Los días hacia atrás que mira su panel («De tu reloj»): lo más viejo ya no se le pide. */
export const DIAS_PANEL_RELOJ = 14

const porOrden = (a: { orden?: number | null }, b: { orden?: number | null }) => (Number(a?.orden) || 0) - (Number(b?.orden) || 0)

/** Las partes de una sesión: su disciplina, o en un brick las de sus bloques seguidos. */
export function partesDeSesion(disciplina: string | null | undefined, tareas: { disciplina?: string | null; orden?: number | null }[] = []): string[] {
  if (disciplina !== 'Brick') return disciplina ? [disciplina] : []
  const out: string[] = []
  for (const t of [...(tareas || [])].sort(porOrden)) {
    const d = String(t?.disciplina || '')
    if (d && out[out.length - 1] !== d) out.push(d)
  }
  return out.slice(0, PARTES_MAXIMAS)
}

/** Las tareas de una parte: todas en una sesión normal, las de ese bloque en un brick. */
export function tareasDeParte(sesion: Pick<SesionParaUnir, 'disciplina'>, tareas: TareaParaUnir[] = [], parte: number): TareaParaUnir[] {
  const lista = [...(tareas || [])].sort(porOrden)
  if (sesion.disciplina !== 'Brick') return lista
  const out: TareaParaUnir[][] = []
  for (const t of lista) {
    const d = String(t?.disciplina || '')
    if (!d) continue
    const ultima = out[out.length - 1]
    if (ultima && String(ultima[0].disciplina) === d) ultima.push(t)
    else out.push([t])
  }
  return out[parte - 1] || []
}

/** La parte libre de esa sesión para un entreno de esa disciplina, o null. */
function parteLibre(s: SesionParaUnir, disciplina: string, uniones: UnionReloj[], idMedicion: number): number | null {
  for (let i = 0; i < s.partes.length; i++) {
    if (s.partes[i] !== disciplina) continue
    const ocupada = uniones.some(u => u.decision === 'unida' && u.id_sesion === s.id && u.parte === i + 1 && u.id_medicion !== idMedicion)
    if (!ocupada) return i + 1
  }
  return null
}

const cerrada = (s: SesionParaUnir) => s.estado === 'Realizada'

/** Cómo está un entreno del reloj (ver arriba). */
export function estadoDeActividad(a: ActividadParaUnir, sesiones: SesionParaUnir[], uniones: UnionReloj[]): EstadoActividad {
  const u = uniones.find(x => x.id_medicion === a.id)
  if (u?.decision === 'no_cuenta') return { k: 'no_cuenta', motivo: 'descartada', union: u }
  if (u?.decision === 'unida') {
    const s = sesiones.find(x => x.id === u.id_sesion)
    /* Sin su sesión (en la papelera, o fuera de lo cargado) se vuelve a mirar
       como si no estuviera unido: se puede unir a otra. */
    if (s) return { k: 'unida', sesion: s, parte: u.parte, faltaRpe: !cerrada(s), union: u }
  }
  if (!a.disciplina) return { k: 'no_cuenta', motivo: 'otro_deporte' }

  const rechazada = u?.decision === 'rechazada' ? u.id_sesion : null
  const candidatas = sesiones
    .filter(s => s.fecha === a.fecha && s.id !== rechazada)
    .map(s => ({ sesion: s, parte: parteLibre(s, a.disciplina!, uniones, a.id) }))
    .filter((x): x is { sesion: SesionParaUnir; parte: number } => x.parte != null)
  const abiertas = candidatas.filter(x => !cerrada(x.sesion))
  const hechas = candidatas.filter(x => cerrada(x.sesion))
  if (abiertas.length === 1) return { k: 'sugerida', ...abiertas[0] }
  if (abiertas.length > 1) return { k: 'varias', opciones: abiertas }
  if (hechas.length === 1) return { k: 'completar', ...hechas[0] }
  if (hechas.length > 1) return { k: 'varias', opciones: hechas }
  return { k: 'sin_sesion' }
}

/**
 * Si entrenó otro día: las sesiones SIN CERRAR de esa semana con una parte
 * libre de esa disciplina (decisión 2). Primero las más cercanas a ese día.
 */
export function opcionesDeLaSemana(a: ActividadParaUnir, sesiones: SesionParaUnir[], uniones: UnionReloj[]): { sesion: SesionParaUnir; parte: number }[] {
  if (!a.disciplina) return []
  const semana = lunesDe(a.fecha)
  const rechazada = uniones.find(x => x.id_medicion === a.id && x.decision === 'rechazada')?.id_sesion ?? null
  const dias = (f: string) => Math.abs(Date.parse(f.slice(0, 10)) - Date.parse(a.fecha.slice(0, 10)))
  return sesiones
    .filter(s => !cerrada(s) && s.id !== rechazada && lunesDe(s.fecha) === semana)
    .map(s => ({ sesion: s, parte: parteLibre(s, a.disciplina!, uniones, a.id) }))
    .filter((x): x is { sesion: SesionParaUnir; parte: number } => x.parte != null)
    .sort((x, y) => dias(x.sesion.fecha) - dias(y.sesion.fecha) || x.sesion.fecha.localeCompare(y.sesion.fecha))
}

/**
 * Lo de su reloj para UNA sesión que se va a cerrar (el «¿Cómo fue?» de la
 * ficha y el final del modo entreno): lo que ya unió su entrenador, lo que
 * encaja ese día y lo de otros días de su semana (por si la hizo otro día).
 * null si la sesión no está entre las cargadas.
 */
export function relojParaSesion<A extends ActividadParaUnir>(
  idSesion: number, actividades: A[], sesiones: SesionParaUnir[], uniones: UnionReloj[],
): { unidas: { actividad: A; parte: number }[]; sugeridas: { actividad: A; parte: number }[]; otras: { actividad: A; parte: number }[] } | null {
  const s = sesiones.find(x => x.id === idSesion)
  if (!s) return null
  const unidas = uniones
    .filter(u => u.decision === 'unida' && u.id_sesion === s.id)
    .map(u => ({ actividad: actividades.find(a => a.id === u.id_medicion), parte: u.parte }))
    .filter((x): x is { actividad: A; parte: number } => !!x.actividad)
  const sugeridas: { actividad: A; parte: number }[] = []
  const otras: { actividad: A; parte: number }[] = []
  for (const a of actividades) {
    if (unidas.some(x => x.actividad.id === a.id)) continue
    const e = estadoDeActividad(a, sesiones, uniones)
    const aqui = e.k === 'sugerida' && e.sesion.id === s.id ? e.parte
      : e.k === 'varias' ? e.opciones.find(o => o.sesion.id === s.id)?.parte : undefined
    if (aqui != null && a.fecha === s.fecha) { sugeridas.push({ actividad: a, parte: aqui }); continue }
    if (e.k === 'unida' || e.k === 'no_cuenta') continue
    const o = opcionesDeLaSemana(a, sesiones, uniones).find(x => x.sesion.id === s.id)
    if (o) otras.push({ actividad: a, parte: o.parte })
  }
  return { unidas, sugeridas, otras }
}

export type Pendiente<A extends ActividadParaUnir = ActividadParaUnir> =
  | { k: 'falta_rpe'; actividad: A; sesion: SesionParaUnir; parte: number }
  | { k: 'completar'; actividad: A; sesion: SesionParaUnir; parte: number }
  | { k: 'sin_apuntar'; actividad: A }

/**
 * Lo que su panel le pide al deportista: lo unido sin su RPE, lo que cerró a
 * mano y puede completar con el reloj, y lo de sus disciplinas que no estaba en
 * el plan. Lo de otros deportes no se pide (decisión 5). Lo sugerido tampoco:
 * eso se cierra desde la propia sesión.
 */
export function pendientesDelDeportista<A extends ActividadParaUnir>(actividades: A[], sesiones: SesionParaUnir[], uniones: UnionReloj[]): Pendiente<A>[] {
  const out: Pendiente<A>[] = []
  for (const a of [...actividades].sort((x, y) => y.fecha.localeCompare(x.fecha))) {
    const e = estadoDeActividad(a, sesiones, uniones)
    if (e.k === 'unida' && e.faltaRpe) out.push({ k: 'falta_rpe', actividad: a, sesion: e.sesion, parte: e.parte })
    /* Unida por su entrenador y cerrada después sin el reloj (por el modo
       entreno): sus datos no llegaron a la sesión. */
    else if (e.k === 'unida' && !e.union.antes) out.push({ k: 'completar', actividad: a, sesion: e.sesion, parte: e.parte })
    else if (e.k === 'completar') out.push({ k: 'completar', actividad: a, sesion: e.sesion, parte: e.parte })
    else if (e.k === 'sin_sesion') out.push({ k: 'sin_apuntar', actividad: a })
  }
  return out
}

// ------------------------------------------------------------
// Qué se escribe
// ------------------------------------------------------------

const una = <T,>(rel: T | T[] | null | undefined): T | null => (Array.isArray(rel) ? rel[0] ?? null : rel ?? null)
const num = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? n : null
}
const positivo = (v: unknown): number | null => {
  const n = num(v)
  return n != null && n > 0 ? n : null
}

/** Un entreno ya unido (o a punto de unirse) con su parte. */
export interface ParteConReloj { actividad: ActividadParaUnir; parte: number }

export interface Escrituras {
  sesion: Record<string, unknown>
  tareas: { id: number; campos: Record<string, unknown> }[]
  distancias: { id: number; campos: Record<string, unknown> }[]
  duraciones: { id: number; campos: Record<string, unknown> }[]
}

/**
 * Los metros y el tiempo de una tarea van POR SERIE (`p_distancia.metros_reales`
 * de un 6×800 es 800: el volumen los multiplica por sus veces, lib/atribucion).
 * Así que lo del reloj, que es el TOTAL, solo cabe ahí si la tarea es una sola
 * vez. En un 2×1500 escribir los 8,1 km del reloj contaría 16,2.
 */
const unaSolaVez = (t: TareaParaUnir) => vecesDe(t) === 1

/** Lo que tenía la sesión antes del reloj: lo que se restaura al desunir. */
export function antesDe(sesion: SesionParaUnir, partes: ParteConReloj[]): AntesUnion {
  const tareas = partes.flatMap(p => {
    const t = tareasDeParte(sesion, sesion.tareas, p.parte)
    if (t.length !== 1) return []
    const d = unaSolaVez(t[0]) ? una(t[0].p_distancia) : null
    const du = unaSolaVez(t[0]) ? una(t[0].p_duracion) : null
    return [{
      id: t[0].id,
      fc_media: num(t[0].fc_media),
      ...(d ? { metros_reales: num(d.metros_reales) } : {}),
      ...(du ? { tiempo_real: num(du.tiempo_real) } : {}),
    }]
  })
  return { duracion_real: num(sesion.duracion_real), hora_inicio: sesion.hora_inicio ?? null, tareas }
}

/**
 * Lo que se escribe para poner en la sesión los datos del reloj de esas
 * partes (todas las unidas). Con `rpe`, además se CIERRA: estado, RPE y quién
 * lo dijo. Sin `rpe`, solo se completa (decisión 6: su RPE se queda).
 */
export function escriturasConReloj(
  sesion: SesionParaUnir,
  partes: ParteConReloj[],
  cierre?: { rpe: number; origen: 'atleta' | 'entrenador' },
  /**
   * Lo que NO se toca porque ya lo escribió el deportista al cerrar: la FC de
   * su casilla, la duración de su casilla (el modo entreno la deja corregir) y
   * los metros o el tiempo de las tareas que anotó serie a serie.
   */
  opciones: { fc?: boolean; duracion?: boolean; tareasAnotadas?: number[] } = {},
): Escrituras {
  const conFc = opciones.fc !== false
  const anotadas = opciones.tareasAnotadas || []
  const minutos = partes.map(p => positivo(p.actividad.minutos))
  const inicios = partes.map(p => p.actividad.inicio).filter((x): x is string => !!x).sort()
  const conMinutos = minutos.filter((m): m is number => m != null)
  const out: Escrituras = {
    sesion: {
      ...(conMinutos.length && opciones.duracion !== false ? { duracion_real: Math.round(conMinutos.reduce((a, b) => a + b, 0)) } : {}),
      ...(inicios.length ? { hora_inicio: inicios[0] } : {}),
      ...(cierre ? { estado: 'Realizada', rpe_reportado: cierre.rpe, rpe_origen: cierre.origen } : {}),
    },
    tareas: [], distancias: [], duraciones: [],
  }
  for (const p of partes) {
    const t = tareasDeParte(sesion, sesion.tareas, p.parte)
    /* Con varias tareas, la FC y los metros del reloj son de toda la parte. */
    if (t.length !== 1) continue
    const fc = positivo(p.actividad.fcMedia)
    if (conFc && fc != null) out.tareas.push({ id: t[0].id, campos: { fc_media: Math.round(fc) } })
    if (!unaSolaVez(t[0]) || anotadas.includes(t[0].id)) continue
    const d = una(t[0].p_distancia), du = una(t[0].p_duracion)
    const metros = positivo(p.actividad.metros), min = positivo(p.actividad.minutos)
    if (d?.id != null && metros != null) out.distancias.push({ id: d.id, campos: { metros_reales: Math.round(metros) } })
    if (du?.id != null && min != null) out.duraciones.push({ id: du.id, campos: { tiempo_real: Math.round(min * 60) } })
  }
  return out
}

/**
 * Lo que se escribe al desunir: los datos del reloj se van y vuelve lo que
 * había (su RPE y si estaba hecha, no se tocan). Si siguen unidas otras partes
 * (un brick), la duración y la hora salen de ellas.
 */
export function escriturasAlDesunir(sesion: SesionParaUnir, quitada: UnionReloj, quedan: ParteConReloj[]): Escrituras {
  const antes = quitada.antes || { duracion_real: null, hora_inicio: null, tareas: [] }
  const out: Escrituras = { sesion: {}, tareas: [], distancias: [], duraciones: [] }
  if (quedan.length) {
    const r = escriturasConReloj(sesion, quedan)
    out.sesion = {
      duracion_real: (r.sesion.duracion_real as number | undefined) ?? antes.duracion_real,
      hora_inicio: (r.sesion.hora_inicio as string | undefined) ?? antes.hora_inicio,
    }
  } else {
    out.sesion = { duracion_real: antes.duracion_real, hora_inicio: antes.hora_inicio }
  }
  const tareasParte = tareasDeParte(sesion, sesion.tareas, quitada.parte)
  for (const a of antes.tareas || []) {
    if (!tareasParte.some(t => t.id === a.id)) continue
    const t = tareasParte.find(x => x.id === a.id)!
    out.tareas.push({ id: a.id, campos: { fc_media: a.fc_media ?? null } })
    const d = una(t.p_distancia), du = una(t.p_duracion)
    if (d?.id != null && 'metros_reales' in a) out.distancias.push({ id: d.id, campos: { metros_reales: a.metros_reales ?? null } })
    if (du?.id != null && 'tiempo_real' in a) out.duraciones.push({ id: du.id, campos: { tiempo_real: a.tiempo_real ?? null } })
  }
  return out
}

/** Las partes unidas de una sesión, con su entreno, para recalcular lo que sale del reloj. */
export function partesUnidas(idSesion: number, uniones: UnionReloj[], actividades: ActividadParaUnir[], sin?: number): ParteConReloj[] {
  return uniones
    .filter(u => u.decision === 'unida' && u.id_sesion === idSesion && u.id_medicion !== sin)
    .map(u => ({ actividad: actividades.find(a => a.id === u.id_medicion), parte: u.parte }))
    .filter((x): x is ParteConReloj => !!x.actividad)
}
