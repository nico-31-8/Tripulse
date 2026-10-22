// ============================================================
// TRIPULSE — Lo que lee la base para el avance de los saltos
// ============================================================
//
// La lógica está en lib/pliometria-avance y no sabe de Supabase. Aquí se pide
// y se ordena, para uno o para varios deportistas con las mismas consultas:
//
//   · Su nivel del tren inferior (la última fila de pliometria_escalon) y lo
//     que ha marcado el entrenador (pliometria_evaluacion).
//   · Sus sesiones de las últimas semanas, con sus tareas dentro. Los contactos
//     de cada semana salen de `piezasDeTarea`, la misma cuenta que el contador
//     de la sesión. Las pasadas cuentan si están hechas; la semana de hoy cuenta
//     también lo que lleva prescrito de hoy en adelante: los contactos «se dan
//     por hechos» (decidido el 21-10-2026).
//   · Sus tests de salto (test_campo: «bosco» y «dropjump»), su 1RM de
//     sentadilla, su peso y su nivel de la anamnesis, su edad y sus
//     disciplinas.
//   · El dolor muscular de su wellness.
//
// Para el panel (lib/senales-datos) solo cuentan los que tienen su nivel puesto:
// sin nivel no hay avance, y de los demás no se pide nada más.

import type { SupabaseClient } from '@supabase/supabase-js'
import { leerAnamnesisDeVarios } from './anamnesis-vigente'
import { nivelDeAnamnesis } from './anamnesis-datos'
import { calcularEdad, hoyISO, lunesDe, sumarDias } from './fechas'
import { vivas } from './papelera'
import { seriesDe } from './series-detalle'
import { sinTildes } from './tecnica'
import { NIVELES_PLIO, piezasDeTarea, resumenContactos, type EjercicioBib, type NivelPlio, type TareaPlio } from './pliometria'
import { escalonesActuales, type FilaEscalon } from './pliometria-escalon'
import { datosDeLaApp, leerComprobaciones, type FilaTestCampo, type FilaTestFuerza, type SesionHecha } from './pliometria-escalon-datos'
import { SEMANAS_AVANCE, mediana, type EntradaAvance, type PuntoTest, type SemanaSaltos } from './pliometria-avance'

type Json = Record<string, unknown>

const numero = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : null
}
const dia = (f: unknown) => String(f ?? '').slice(0, 10)
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)

/** Una tarea guardada con sus líneas dentro, tal como llega anidada en la sesión. */
export interface TareaAnidada extends TareaPlio {
  ejercicios?: (Json & { control_tipo?: unknown; encadenado_control_tipo?: unknown })[] | null
}

export interface SesionAnidada {
  id?: number
  id_deportista?: number
  fecha_sesion: string
  disciplina: string | null
  estado: string | null
  duracion_minutos?: number | null
  duracion_real?: number | null
  eliminada?: boolean | null
  tarea?: TareaAnidada[] | null
}

const hecha = (s: SesionAnidada) => s.estado === 'Realizada'
const esCarrera = (d: unknown) => sinTildes(d) === 'carrera'

/** La caída más alta que lleva prescrita una sesión: las líneas con control «altura» son siempre saltos. */
function alturaDe(s: SesionAnidada): number | null {
  let max: number | null = null
  const mira = (v: unknown) => { const n = numero(v); if (n != null && n <= 120) max = Math.max(max ?? 0, n) }
  for (const t of s.tarea || []) {
    for (const ej of t.ejercicios || []) {
      if (ej.control_tipo === 'altura') seriesDe(ej).forEach(x => mira(x.control))
      if (ej.encadenado_control_tipo === 'altura') seriesDe(ej, { encadenado: true }).forEach(x => mira(x.control))
    }
  }
  return max
}

export interface SemanasDeSaltos {
  semanas: SemanaSaltos[]
  /** Las fechas de las sesiones con saltos que cuentan, hechas o de hoy en adelante. */
  fechasSaltos: string[]
  /** Las de las hechas, hasta hoy. */
  fechasHechas: string[]
  proxima: string | null
  /** Las disciplinas de las sesiones que cuentan. */
  hace: string[]
  /** Las hechas, para las semanas con fuerza de la escalera. */
  sesionesHechas: SesionHecha[]
}

/**
 * Las `n` semanas que acaban en la de hoy, de lunes a domingo. Una sesión cuenta
 * si está hecha o si es de esta semana y de hoy en adelante: de lo que se quedó
 * sin hacer antes de hoy no se sabe nada.
 */
export function semanasDeSaltos(sesiones: SesionAnidada[], bib: EjercicioBib[], hoy: string, n = SEMANAS_AVANCE): SemanasDeSaltos {
  const lunesHoy = lunesDe(hoy)
  const lunes = Array.from({ length: n }, (_, k) => sumarDias(lunesHoy, -7 * (n - 1 - k)))
  const semanas: SemanaSaltos[] = lunes.map(l => ({ lunes: l, sesiones: 0, pies: 0, porNivel: {}, lanzamientos: 0, carrera: 0, altura: null }))
  const fechasSaltos: string[] = []
  const fechasHechas: string[] = []
  const hace = new Set<string>()
  const sesionesHechas: SesionHecha[] = []
  let proxima: string | null = null

  for (const s of sesiones || []) {
    if (s.eliminada) continue
    const f = dia(s.fecha_sesion)
    const r = resumenContactos((s.tarea || []).flatMap(t => piezasDeTarea(t, bib)))
    if (!hecha(s) && f >= hoy && r.pies > 0 && (!proxima || f < proxima)) proxima = f
    const k = Math.floor(diasEntre(lunes[0], f) / 7)
    if (k < 0 || k >= n) continue
    const cuenta = hecha(s) ? f <= sumarDias(lunesHoy, 6) : k === n - 1 && f >= hoy
    if (!cuenta) continue
    if (hecha(s)) sesionesHechas.push({ fecha_sesion: f, disciplina: s.disciplina, eliminada: s.eliminada })
    if (s.disciplina) hace.add(s.disciplina)
    const sem = semanas[k]
    if (esCarrera(s.disciplina)) sem.carrera += Math.round(Number(s.duracion_real ?? s.duracion_minutos) || 0)
    sem.lanzamientos += r.lanzamientos
    if (r.pies > 0) {
      sem.sesiones++
      sem.pies += r.pies
      for (const nv of NIVELES_PLIO) if (r.porNivel[nv]) sem.porNivel[nv] = (sem.porNivel[nv] || 0) + (r.porNivel[nv] as number)
      fechasSaltos.push(f)
      if (hecha(s) && f <= hoy) fechasHechas.push(f)
      const a = alturaDe(s)
      if (a != null) sem.altura = Math.max(sem.altura ?? 0, a)
    }
  }
  return { semanas, fechasSaltos, fechasHechas, proxima, hace: [...hace], sesionesHechas }
}

/** La menor separación, en días, entre dos sesiones de saltos de las dos últimas semanas (con la de hoy entera). */
export function separacionMinima(fechas: string[], hoy: string): number | null {
  const desde = sumarDias(hoy, -13)
  const hasta = sumarDias(lunesDe(hoy), 6)
  const fs = fechas.filter(f => f >= desde && f <= hasta).sort()
  if (fs.length < 2) return null
  let min = Infinity
  for (let i = 1; i < fs.length; i++) min = Math.min(min, diasEntre(fs[i - 1], fs[i]))
  return min
}

export interface FilaWellness { fecha: string; dolor_muscular: number | null }

/**
 * El dolor muscular de los dos días siguientes a su última sesión de saltos
 * hecha (si fue en las dos últimas semanas), y su mediana de 4 semanas. Con
 * menos de 7 registros no hay mediana: no se sabe lo suyo.
 */
export function dolorTrasSaltos(wellness: FilaWellness[], fechasHechas: string[], hoy: string): EntradaAvance['dolor'] {
  const valor = (w: FilaWellness) => (Number.isFinite(Number(w.dolor_muscular)) && Number(w.dolor_muscular) > 0 ? Number(w.dolor_muscular) : null)
  const ultimos = (wellness || []).filter(w => dia(w.fecha) >= sumarDias(hoy, -27) && dia(w.fecha) <= hoy && valor(w) != null)
  const med = ultimos.length >= 7 ? mediana(ultimos.map(w => valor(w) as number)) : null
  const ultima = [...fechasHechas].filter(f => f <= hoy && f >= sumarDias(hoy, -13)).sort().pop()
  if (!ultima) return { despues: null, mediana: med }
  const tras = new Set([sumarDias(ultima, 1), sumarDias(ultima, 2)])
  const vals = ultimos.filter(w => tras.has(dia(w.fecha))).map(w => valor(w) as number)
  return { despues: vals.length ? Math.max(...vals) : null, mediana: med }
}

/** El CMJ y el RSI de cada test, con su fecha. El RSI, el guardado o altura ÷ contacto. */
export function seriesDeTests(campo: FilaTestCampo[]): { cmj: PuntoTest[]; rsi: PuntoTest[] } {
  const cmj: PuntoTest[] = []
  const rsi: PuntoTest[] = []
  for (const f of campo || []) {
    if (f.clave === 'bosco') {
      const v = numero(f.resultados?.cmj)
      if (v != null) cmj.push({ fecha: dia(f.fecha), valor: v })
    } else if (f.clave === 'dropjump') {
      const salto = numero(f.resultados?.salto), contacto = numero(f.brutos?.contacto)
      const v = numero(f.resultados?.rsi) ?? (salto != null && contacto != null ? (salto / 100) / (contacto / 1000) : null)
      if (v != null) rsi.push({ fecha: dia(f.fecha), valor: Math.round(v * 100) / 100 })
    }
  }
  const orden = (a: PuntoTest, b: PuntoTest) => a.fecha.localeCompare(b.fecha)
  return { cmj: cmj.sort(orden), rsi: rsi.sort(orden) }
}

/** Todas las filas de una consulta, de mil en mil: Supabase no da más de 1000 de una vez, y sin avisar. */
async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>, tam = 1000): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; desde < tam * 50; desde += tam) {
    const { data, error } = await pedir(desde, desde + tam - 1)
    if (error || !data) break
    filas.push(...data)
    if (data.length < tam) break
  }
  return filas
}

export interface OpcionesAvance {
  hoy?: string
  /** Semanas que se piden; el motor mira las 8 últimas. */
  semanas?: number
  /** Solo los que tienen su nivel puesto: lo que usa el panel. */
  soloConNivel?: boolean
}

/** Lo que necesita el motor de varios deportistas, con las mismas consultas que para uno. */
export async function cargarAvanceDeVarios(
  sb: SupabaseClient, ids: number[], o: OpcionesAvance = {},
): Promise<Map<number, EntradaAvance>> {
  const hoy = o.hoy ?? hoyISO()
  const n = Math.max(SEMANAS_AVANCE, o.semanas ?? SEMANAS_AVANCE)
  const salida = new Map<number, EntradaAvance>()
  const limpios = [...new Set((ids || []).filter(x => x != null).map(Number))]
  if (!limpios.length) return salida

  const esc = await sb.from('pliometria_escalon').select('id, id_deportista, parte, escalon, recomendado, puesto_en')
    .in('id_deportista', limpios).eq('parte', 'inferior').order('puesto_en', { ascending: false })
  const filasDe = new Map<number, FilaEscalon[]>()
  for (const f of (esc.data || []) as (FilaEscalon & { id_deportista: number })[]) {
    filasDe.set(f.id_deportista, [...(filasDe.get(f.id_deportista) || []), f])
  }
  const actual = (id: number) => escalonesActuales(filasDe.get(id) || []).inferior
  const quienes = o.soloConNivel ? limpios.filter(id => actual(id).escalon) : limpios
  if (!quienes.length) return salida

  const desde = sumarDias(lunesDe(hoy), -7 * (n - 1))
  const hasta = sumarDias(lunesDe(hoy), 13)
  const [ev, deps, an, ses, campo, fuerza, well, bib] = await Promise.all([
    sb.from('pliometria_evaluacion').select('id_deportista, comprobaciones').in('id_deportista', quienes),
    sb.from('deportista').select('id, disciplinas, fecha_nacimiento').in('id', quienes),
    leerAnamnesisDeVarios(sb, quienes, 'nivel_competitivo, peso').catch(() => new Map<number, Json>()),
    todas<SesionAnidada>((a, b) => vivas(sb.from('sesion')
      .select('id, id_deportista, fecha_sesion, disciplina, estado, duracion_minutos, duracion_real, eliminada, tarea(id, tecnica_id, series, bloques, formato, p_repeticiones(*), ejercicios(*))')
      .in('id_deportista', quienes).gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
      .order('fecha_sesion', { ascending: true }).order('id', { ascending: true }))
      .range(a, b) as unknown as PromiseLike<{ data: SesionAnidada[] | null; error: unknown }>),
    sb.from('test_campo').select('id_deportista, clave, fecha, brutos, protocolo, resultados')
      .in('id_deportista', quienes).in('clave', ['dropjump', 'bosco']).gte('fecha', sumarDias(hoy, -365)).order('fecha', { ascending: true }),
    sb.from('test_fuerza').select('id_deportista, ejercicio, rm_estimado, fecha')
      .in('id_deportista', quienes).not('rm_estimado', 'is', null).order('fecha', { ascending: false }).limit(500),
    todas<FilaWellness & { id_deportista: number }>((a, b) => sb.from('wellness').select('id_deportista, fecha, dolor_muscular')
      .in('id_deportista', quienes).gte('fecha', sumarDias(hoy, -27)).lte('fecha', hoy)
      .order('fecha', { ascending: true }).order('id', { ascending: true }).range(a, b) as unknown as PromiseLike<{ data: (FilaWellness & { id_deportista: number })[] | null; error: unknown }>),
    todas<EjercicioBib>((a, b) => sb.from('ejercicios_biblioteca').select('id, nombre, tipo, nivel_pliometria, parte_pliometria')
      .order('id', { ascending: true }).range(a, b) as unknown as PromiseLike<{ data: EjercicioBib[] | null; error: unknown }>),
  ])

  const evDe = new Map<number, unknown>(((ev.data || []) as { id_deportista: number; comprobaciones: unknown }[]).map(f => [f.id_deportista, f.comprobaciones]))
  const depDe = new Map<number, { disciplinas: string[] | null; fecha_nacimiento: string | null }>(
    ((deps.data || []) as { id: number; disciplinas: string[] | null; fecha_nacimiento: string | null }[]).map(d => [d.id, d]))
  const campoDe = (id: number) => ((campo.data || []) as (FilaTestCampo & { id_deportista: number })[]).filter(f => f.id_deportista === id)
  const fuerzaDe = (id: number) => ((fuerza.data || []) as (FilaTestFuerza & { id_deportista: number })[]).filter(f => f.id_deportista === id)

  for (const id of quienes) {
    const suyas = ses.filter(s => s.id_deportista === id)
    const sem = semanasDeSaltos(suyas, bib, hoy, n)
    const anam = (an as Map<number, Json>).get(id)
    const dep = depDe.get(id)
    const nivel = actual(id)
    const tests = seriesDeTests(campoDe(id))
    salida.set(id, {
      hoy,
      nivel: (nivel.escalon as NivelPlio | null) ?? null,
      puestoEn: nivel.fila?.puesto_en ?? null,
      comprobaciones: leerComprobaciones(evDe.get(id)),
      datos: datosDeLaApp({ campo: campoDe(id), fuerza: fuerzaDe(id), peso: anam?.peso, sesiones: sem.sesionesHechas, hoy }),
      experiencia: anam?.nivel_competitivo ? nivelDeAnamnesis(anam.nivel_competitivo) : null,
      edad: calcularEdad(dep?.fecha_nacimiento ?? null, hoy),
      disciplinas: dep?.disciplinas ?? null,
      haceEnSesiones: sem.hace,
      semanas: sem.semanas,
      separacionDias: separacionMinima(sem.fechasSaltos, hoy),
      dolor: dolorTrasSaltos(well.filter(w => w.id_deportista === id), sem.fechasHechas, hoy),
      cmj: tests.cmj,
      rsi: tests.rsi,
      proximaSaltos: sem.proxima,
    })
  }
  return salida
}

/** Lo de un deportista, tenga o no su nivel puesto: en su ficha, en Volumen y al prescribir. */
export async function cargarAvance(sb: SupabaseClient, idDeportista: number, o: OpcionesAvance = {}): Promise<EntradaAvance | null> {
  const todos = await cargarAvanceDeVarios(sb, [idDeportista], { ...o, soloConNivel: false })
  return todos.get(idDeportista) ?? null
}
