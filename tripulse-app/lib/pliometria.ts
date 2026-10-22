// ============================================================
// TRIPULSE — Pliometría: la escalera, los contactos y el aviso
// ============================================================
//
// UN TIPO MÁS DE LA BIBLIOTECA (pedido el 21-10-2026), con la ESCALERA de cinco
// niveles de la base de conocimiento (deporte/Resources/Perfiles-de-Prueba/
// ejercicios-pliometria-y-velocidad.md): de lo que menos impacta a lo que más.
// Se avanza por dominio técnico, no por calendario: primero volumen, luego
// complejidad, y por último la altura de caída.
//
// TRES PARTES DEL CUERPO, CADA UNA CON SU ESCALERA. La del tren inferior es la
// de la base. La del superior sigue la progresión de los lanzamientos (Motricidad,
// ficha 17: sentado contra la pared → de pie → reactivo → a una mano → cuerpo
// entero) y la del tronco, la rotacional. El nivel dice lo mismo en las tres:
// cuánto exige ese escalón.
//
// SE MIDE EN CONTACTOS, Y SE DAN POR HECHOS al marcar la serie (decidido con el
// usuario). Solo los del TREN INFERIOR son contactos de pie, que es lo que mide
// la NSCA y lo que lleva el aviso. Los del superior y el tronco son
// lanzamientos: se cuentan aparte y no avisan (su dosis va por series cortas).
//
// EL AVISO. En resistencia, 60-100 contactos por sesión («complemento
// neuromuscular, no volumen»); por encima, ámbar. Por encima del tope de la
// NSCA para su nivel (principiante 100, intermedio 120, avanzado 140), rojo. Y
// cada nivel del tren inferior tiene además su rango: si uno se pasa, se marca.
//
// Sin Supabase: todo lo de aquí se prueba con datos a mano.

import { sinTildes } from './tecnica'
import { PLIOMETRIA } from './grupo-ejercicio'
import { leerReps, repsParaCalcular, repsDePrescripcion } from './repeticiones'
import { seriesDe, paraGuardar, type SerieEditor } from './series-detalle'
import { vecesDe, bloquesDe } from './bloques-tarea'
import { esBloque } from './bloque-formato'
import type { NivelAtleta } from './plan-semana'

/** El tipo de la biblioteca, y también el grupo con el que salen al prescribir. */
export { PLIOMETRIA }

export type NivelPlio = 'a' | 'b' | 'c' | 'd' | 'e'
export type PartePlio = 'inferior' | 'superior' | 'tronco'

export const NIVELES_PLIO: NivelPlio[] = ['a', 'b', 'c', 'd', 'e']
export const PARTES_PLIO: { id: PartePlio; nombre: string }[] = [
  { id: 'inferior', nombre: 'Tren inferior' },
  { id: 'superior', nombre: 'Tren superior' },
  { id: 'tronco', nombre: 'Tronco' },
]

export interface Peldano {
  nombre: string
  /**
   * Lo que SUMA este nivel a los de abajo: «añade los de caída». Los niveles
   * son acumulativos (quien está en el 3 también hace CMJ, que es del 2), así
   * que un nivel no se nombra por un tipo de salto sino por lo que añade
   * (decidido con el usuario el 22-10-2026). El primero dice con qué se empieza.
   */
  anade: string
  /** Qué ciclo de estiramiento-acortamiento usa y cuánto impacta. */
  exige: string
  /** Contactos por sesión de ESE nivel. Solo en el tren inferior. */
  rango?: [number, number]
  /** Lo que hace falta antes de empezarlo. */
  antes: string
}

/*
 * POR DENTRO SIGUEN SIENDO a-e: es lo que guardan la biblioteca
 * (ejercicios_biblioteca.nivel_pliometria) y el historial de cada deportista
 * (pliometria_escalon). Lo que se ENSEÑA es el número, del 1 al 5:
 * `nombreNivel` y `etiquetaNivel`.
 */
const ESCALERA: Record<PartePlio, Record<NivelPlio, Peldano>> = {
  inferior: {
    a: { nombre: 'Bajo, a dos pies, en el sitio', anade: 'saltos bajos a dos pies, en el sitio', exige: 'Ciclo rápido · impacto bajo', rango: [60, 100],
      antes: 'Aterrizar en silencio y aguantar 30 s a una pierna' },
    b: { nombre: 'Contramovimiento', anade: 'añade el contramovimiento', exige: 'Ciclo lento · impacto bajo-medio', rango: [80, 120],
      antes: 'Dominar el nivel 1' },
    c: { nombre: 'Reactivo de caída', anade: 'añade los de caída (reactivos)', exige: 'Ciclo rápido · impacto alto', rango: [40, 80],
      antes: 'Base de fuerza (≈1,5 × su peso en sentadilla, recomendación NSCA) y dominar los niveles 1 y 2' },
    d: { nombre: 'Unilateral y horizontal', anade: 'añade los de una pierna y horizontales', exige: 'Ciclo rápido · impacto alto', rango: [40, 100],
      antes: 'Estabilidad a una pierna y dominar los niveles 2 y 3' },
    e: { nombre: 'Específico de alta velocidad', anade: 'añade los de alta velocidad', exige: 'Ciclo rápido · impacto muy alto', rango: [20, 50],
      antes: 'Todo lo anterior y los tendones sanos' },
  },
  superior: {
    a: { nombre: 'Sentado, contra la pared', anade: 'lanzamientos sentado, contra la pared', exige: 'Empuje rápido aislado', antes: 'Nada: es por donde se empieza' },
    b: { nombre: 'De pie, a dos manos', anade: 'añade los de pie, a dos manos', exige: 'Empuje con todo el cuerpo', antes: 'Dominar el pase sentado' },
    c: { nombre: 'Reactivo', anade: 'añade los reactivos (recibir y devolver)', exige: 'Recibir y devolver sin pausa', antes: 'Flexiones completas con buena técnica' },
    d: { nombre: 'A una mano', anade: 'añade los de una mano', exige: 'Empuje unilateral con rotación', antes: 'Dominar los de dos manos' },
    e: { nombre: 'Cuerpo entero', anade: 'añade los de cuerpo entero', exige: 'De las piernas a los brazos, a máxima velocidad', antes: 'Gesto estable en todo lo anterior' },
  },
  tronco: {
    a: { nombre: 'Sentado', anade: 'lanzamientos sentado', exige: 'Rotación con balón ligero', antes: 'Nada: es por donde se empieza' },
    b: { nombre: 'Con abdominal', anade: 'añade los de abdominal', exige: 'Flexión rápida del tronco', antes: 'Dominar el pase sentado' },
    c: { nombre: 'Rotacional de pie', anade: 'añade los rotacionales de pie', exige: 'De la cadera al tronco', antes: 'Rotación estable sentado' },
    d: { nombre: 'Rotacional al suelo', anade: 'añade los rotacionales al suelo', exige: 'Rotación con impacto', antes: 'Dominar la rotación de pie' },
    e: { nombre: 'Rotacional con paso', anade: 'añade los rotacionales con paso', exige: 'Rotación máxima con impulso', antes: 'Gesto estable en todo lo anterior' },
  },
}

export const peldano = (parte: PartePlio, nivel: NivelPlio): Peldano => ESCALERA[parte][nivel]

/** El número que se enseña: a → 1, e → 5. */
export const numeroNivel = (k: NivelPlio): number => NIVELES_PLIO.indexOf(k) + 1

/** «Nivel 3». */
export const nombreNivel = (k: NivelPlio): string => 'Nivel ' + numeroNivel(k)

/** «Nivel 3 · añade los de caída (reactivos)», para desplegables y cabeceras. */
export const etiquetaNivel = (parte: PartePlio, k: NivelPlio): string => nombreNivel(k) + ' · ' + peldano(parte, k).anade

/**
 * «Antes: dominar los niveles 1 y 2.», lo que pide el nivel, para enseñarlo al
 * elegir el ejercicio. Solo desde el 3: los dos primeros no piden nada que avisar.
 */
export function requisitoDe(parte: PartePlio, nivel: NivelPlio): string | null {
  if (NIVELES_PLIO.indexOf(nivel) < NIVELES_PLIO.indexOf('c')) return null
  const a = peldano(parte, nivel).antes
  return 'Antes: ' + a.charAt(0).toLowerCase() + a.slice(1) + '.'
}

/**
 * Lo que se le dice al deportista en cada salto. En pliometría la serie se
 * corta cuando cae la calidad, no cuando llega el cansancio (base de
 * conocimiento: «se avanza por dominio técnico»).
 */
export const PARA_LA_SERIE = 'Para la serie si el contacto se alarga o pierdes altura o distancia: aquí cuenta la calidad, no el cansancio.'

/** Si una línea guardada es de pliometría por su grupo: al prescribir, el grupo de los saltos es «Pliometría». */
export const esGrupoPlio = (grupo: unknown): boolean => sinTildes(grupo) === sinTildes(PLIOMETRIA)

/** Si un ejercicio de la biblioteca es de pliometría. Sin tildes: hay «Tecnica» escrita sin ella. */
export const esDePliometria = (ej: { tipo?: unknown } | null | undefined): boolean =>
  (Array.isArray(ej?.tipo) ? ej!.tipo as unknown[] : []).some(t => sinTildes(t) === sinTildes(PLIOMETRIA))

export const leerNivel = (v: unknown): NivelPlio | null =>
  NIVELES_PLIO.includes(v as NivelPlio) ? v as NivelPlio : null

/** La parte del cuerpo; uno de pliometría sin ella se trata como del tren inferior, que es lo habitual. */
export const leerParte = (v: unknown, esPlio = true): PartePlio | null =>
  PARTES_PLIO.some(p => p.id === v) ? v as PartePlio : esPlio ? 'inferior' : null

// ------------------------------------------------------------
// Los contactos de una sesión
// ------------------------------------------------------------

export interface PiezaPlio {
  parte: PartePlio
  nivel: NivelPlio | null
  /** Ya multiplicados: series × repeticiones (× bloques). */
  contactos: number
}

export interface ResumenContactos {
  /** Contactos de pie: solo el tren inferior. Es lo que lleva el aviso. */
  pies: number
  /** Los de pie, por nivel. */
  porNivel: Partial<Record<NivelPlio, number>>
  /** Lanzamientos del tren superior y del tronco, aparte. */
  lanzamientos: number
  /**
   * Ejercicios de pliometría que no se pueden contar: van por tiempo o no
   * llevan repeticiones. Se dicen para que el total no parezca completo.
   */
  sinContar: number
}

export function resumenContactos(piezas: PiezaPlio[]): ResumenContactos {
  const r: ResumenContactos = { pies: 0, porNivel: {}, lanzamientos: 0, sinContar: 0 }
  for (const p of piezas) {
    const n = Math.max(0, Math.round(Number(p.contactos) || 0))
    if (!n) { r.sinContar++; continue }
    if (p.parte !== 'inferior') { r.lanzamientos += n; continue }
    r.pies += n
    if (p.nivel) r.porNivel[p.nivel] = (r.porNivel[p.nivel] || 0) + n
  }
  return r
}

/** Los niveles del tren inferior que pasan de su rango en esta sesión. */
export const nivelesQueSePasan = (porNivel: Partial<Record<NivelPlio, number>>): NivelPlio[] =>
  NIVELES_PLIO.filter(k => (porNivel[k] || 0) > (ESCALERA.inferior[k].rango?.[1] ?? Infinity))

// ------------------------------------------------------------
// De las tareas a las piezas
// ------------------------------------------------------------
//
// Una tarea de carrera lleva el salto en `tecnica_id` y los contactos en
// `p_repeticiones` (series × contactos, × bloques). Una de fuerza, en sus
// líneas de `ejercicios`: el primero y, en una superserie, el encadenado; con
// «Serie a serie», cada serie con lo suyo. Un rango («8-10») cuenta por su
// centro, como en la duración. Los bloques con formato (AMRAP, por tiempo…) no
// se cuentan: sus vueltas no se saben de antemano.

export interface EjercicioBib {
  id: unknown
  nombre?: unknown
  tipo?: unknown
  nivel_pliometria?: unknown
  parte_pliometria?: unknown
}

const buscar = (bib: EjercicioBib[], id: unknown, nombre?: unknown): EjercicioBib | undefined => {
  if (id != null && id !== '') {
    const porId = bib.find(e => String(e.id) === String(id))
    if (porId) return porId
  }
  /* Las líneas sin id de la biblioteca (anteriores a guardarlo) se buscan por su nombre. */
  const n = sinTildes(nombre).trim()
  return n ? bib.find(e => sinTildes(e.nombre).trim() === n) : undefined
}

/** El ejercicio hecho pieza, si es de pliometría. */
const pieza = (ej: EjercicioBib | undefined, contactos: number): PiezaPlio | null =>
  esDePliometria(ej) ? { parte: leerParte(ej!.parte_pliometria) ?? 'inferior', nivel: leerNivel(ej!.nivel_pliometria), contactos } : null

/** Las repeticiones de un texto («12», «8-10» → 9). 0 si no hay. */
const repsDe = (texto: unknown): number => {
  const r = leerReps(texto as string)
  return r ? repsParaCalcular(r.min, r.max) : 0
}

const positivo = (v: unknown, siNo: number) => (Number(v) > 0 ? Math.round(Number(v)) : siNo)

interface PrescripcionReps { repeticiones_planteadas?: number | null; repeticiones_planteadas_max?: number | null }

/** Una línea de `ejercicios`: lo que aquí se mira; el resto lo lee `seriesDe`. */
interface LineaEjercicio {
  ejercicio_id?: unknown
  nombre?: unknown
  ejercicio_encadenado_id?: unknown
  ejercicio_encadenado_nombre?: unknown
  [columna: string]: unknown
}

/** Una tarea guardada, con sus prescripciones y sus líneas dentro. */
export interface TareaPlio {
  formato?: string | null
  tecnica_id?: unknown
  series?: number | null
  bloques?: number | null
  p_repeticiones?: PrescripcionReps[] | PrescripcionReps | null
  ejercicios?: LineaEjercicio[] | null
}

/** Las piezas de una tarea guardada. */
export function piezasDeTarea(t: TareaPlio | null | undefined, bib: EjercicioBib[]): PiezaPlio[] {
  if (!t || esBloque(t)) return []
  const out: PiezaPlio[] = []
  if (t.tecnica_id != null) {
    const p = Array.isArray(t.p_repeticiones) ? t.p_repeticiones[0] : t.p_repeticiones
    const pz = pieza(buscar(bib, t.tecnica_id), vecesDe(t) * repsDe(repsDePrescripcion(p)))
    if (pz) out.push(pz)
  }
  for (const ej of Array.isArray(t.ejercicios) ? t.ejercicios : []) {
    const uno = pieza(buscar(bib, ej?.ejercicio_id, ej?.nombre),
      seriesDe(ej).reduce((a, s) => a + repsDe(s.reps), 0) * bloquesDe(t))
    if (uno) out.push(uno)
    if (ej?.ejercicio_encadenado_id != null || ej?.ejercicio_encadenado_nombre) {
      const dos = pieza(buscar(bib, ej.ejercicio_encadenado_id, ej.ejercicio_encadenado_nombre),
        seriesDe(ej, { encadenado: true }).reduce((a, s) => a + repsDe(s.reps), 0) * bloquesDe(t))
      if (dos) out.push(dos)
    }
  }
  return out
}

/** Una fila de carrera a medio escribir: lo que diría al guardarse. */
export interface FilaCarreraPlio {
  esTecnica?: boolean
  tecnicaId?: string
  series?: string
  tipoMedicion?: string
  valorMedicion?: string
  enBloques?: boolean
  bloques?: string
}

export function piezasDeFilaCarrera(f: FilaCarreraPlio, bib: EjercicioBib[]): PiezaPlio[] {
  if (!f?.esTecnica || !f.tecnicaId) return []
  const contactos = f.tipoMedicion === 'reps'
    ? repsDe(f.valorMedicion) * positivo(f.series, 1) * (f.enBloques ? positivo(f.bloques, 1) : 1)
    : 0
  const pz = pieza(buscar(bib, f.tecnicaId), contactos)
  return pz ? [pz] : []
}

/** Una fila de fuerza a medio escribir. */
export interface FilaFuerzaPlio {
  ejercicioSelId?: string
  medida?: string
  series?: string
  repsFuerza?: string
  detalle?: SerieEditor[] | null
  ejercicioSelId2?: string
  series2?: string
  repsFuerza2?: string
  detalle2?: SerieEditor[] | null
}

/** Lo que suman las series de una fila: la lista si la hay, si no series × reps (como al guardar). */
const contactosDeFila = (series: string | undefined, reps: string | undefined, lista: SerieEditor[] | null | undefined): number => {
  const n = positivo(series, 1)
  const g = paraGuardar(lista, n, false, { reps: reps ?? '', kg: '', rir: '' })
  return g.detalle ? g.detalle.reduce((a, s) => a + repsParaCalcular(s.reps, s.reps_max), 0) : n * repsDe(g.fila.reps)
}

export function piezasDeFilaFuerza(f: FilaFuerzaPlio, bib: EjercicioBib[]): PiezaPlio[] {
  if (!f) return []
  const out: PiezaPlio[] = []
  if (f.ejercicioSelId) {
    const uno = pieza(buscar(bib, f.ejercicioSelId), f.medida === 'tiempo' ? 0 : contactosDeFila(f.series, f.repsFuerza, f.detalle))
    if (uno) out.push(uno)
  }
  if (f.ejercicioSelId2) {
    const dos = pieza(buscar(bib, f.ejercicioSelId2), contactosDeFila(f.series2 || f.series, f.repsFuerza2, f.detalle2))
    if (dos) out.push(dos)
  }
  return out
}

// ------------------------------------------------------------
// El aviso
// ------------------------------------------------------------

/** En resistencia, la pliometría es complemento neuromuscular, no volumen. */
export const RANGO_RESISTENCIA: [number, number] = [60, 100]

/** El tope de contactos de pie por sesión según la NSCA (tabla 18.4). */
export const TOPE_NSCA: Record<NivelAtleta, number> = { principiante: 100, intermedio: 120, avanzado: 140, elite: 140 }

const QUIEN: Record<NivelAtleta, string> = {
  principiante: 'un principiante', intermedio: 'un intermedio', avanzado: 'un avanzado', elite: 'un deportista de élite',
}

export type ClaseAviso = 'suave' | 'ok' | 'alto' | 'mucho'

export function avisoContactos(pies: number, nivel: NivelAtleta): { clase: ClaseAviso; texto: string } {
  const [lo, hi] = RANGO_RESISTENCIA
  const tope = TOPE_NSCA[nivel] ?? TOPE_NSCA.intermedio
  const quien = QUIEN[nivel] ?? QUIEN.intermedio
  if (pies > tope) return { clase: 'mucho', texto: `Pasa del tope de ${quien} (${tope}, según la NSCA). En resistencia se recomiendan ${lo}–${hi}.` }
  if (pies > hi) return { clase: 'alto', texto: `Por encima de lo recomendado en resistencia (${lo}–${hi}), dentro del tope de ${quien} (${tope}).` }
  if (pies < lo) return { clase: 'suave', texto: `Por debajo de ${lo}: una dosis suave.` }
  return { clase: 'ok', texto: `Dentro de lo recomendado en resistencia (${lo}–${hi}).` }
}

// ------------------------------------------------------------
// La regla del contador
// ------------------------------------------------------------

/** Dónde cae cada marca de la regla, en % de su ancho: la franja buena, el tope y el total. */
export function reglaContactos(total: number, nivel: NivelAtleta) {
  const tope = TOPE_NSCA[nivel] ?? TOPE_NSCA.intermedio
  const max = Math.max(160, tope + 20, total + 10)
  const pos = (x: number) => (Math.min(Math.max(0, x), max) / max) * 100
  return { tope, desde: pos(RANGO_RESISTENCIA[0]), hasta: pos(RANGO_RESISTENCIA[1]), enTope: pos(tope), marca: pos(total) }
}

// ------------------------------------------------------------
// La lista por la escalera
// ------------------------------------------------------------

/**
 * Los ejercicios de una parte del cuerpo (y de un escalón, si se elige), en el
 * orden de la escalera y por nombre; y cuántos hay en cada escalón. Lo usan la
 * biblioteca y el desplegable de los saltos al prescribir.
 */
export function porLaEscalera<T extends EjercicioBib>(
  lista: T[], parte: PartePlio, nivel: NivelPlio | null = null,
): { vistos: T[]; cuantos: Partial<Record<NivelPlio, number>> } {
  const deLaParte = (lista || []).filter(e => esDePliometria(e) && leerParte(e.parte_pliometria) === parte)
  const cuantos: Partial<Record<NivelPlio, number>> = {}
  for (const e of deLaParte) {
    const n = leerNivel(e.nivel_pliometria)
    if (n) cuantos[n] = (cuantos[n] || 0) + 1
  }
  /* Sin nivel, al final: es uno propio que aún no se ha puesto en su escalón. */
  const orden = (e: T) => leerNivel(e.nivel_pliometria) || 'z'
  const vistos = deLaParte
    .filter(e => !nivel || leerNivel(e.nivel_pliometria) === nivel)
    .sort((a, b) => orden(a).localeCompare(orden(b)) || String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'))
  return { vistos, cuantos }
}
