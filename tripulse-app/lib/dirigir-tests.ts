// ============================================================
// TRIPULSE — Guardar los tests de campo
// ============================================================
//
// El catálogo (lib/catalogo-tests) no toca la base: son datos y cuentas, y así
// se puede comprobar contra los ejemplos del documento sin levantar nada. Aquí
// está lo otro: leer del deportista lo que el test necesita y escribir lo que
// sale.
//
// TODO VA A `test_campo`, UNA FILA POR TEST HECHO: lo que se midió, lo que se
// calculó, el principal aparte en numeric para poder graficarlo, y con qué
// ajustes de protocolo se hizo.
//
// Antes iba a `tests_libres` —la tabla de las notas sueltas— con una fila por
// número y el resultado guardado como TEXTO. Por eso la batería no tenía ni
// evolución ni récords: un RSI de 1,42 estaba escrito como la palabra «1,42».

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CATALOGO,
  type TestCampo, type Valores, type Contexto,
  filaDeCampo, estaCompleto,
  type FilaCampo, type ModoTest,
} from './catalogo-tests'

/** Lo que hace falta del deportista para calcular, por id. */
export type Contextos = Record<number, Contexto>

/**
 * El peso y el sexo de cada uno.
 *
 * SE PIDE EN DOS CONSULTAS Y NO EN UNA POR PERSONA: con doce atletas serían
 * veinticuatro idas y vueltas mientras el entrenador espera a pie de pista.
 *
 * `select('*')` en las tablas de test a propósito. Nombrar una columna que no
 * exista en esta base tumba la consulta ENTERA y devuelve cero filas sin error
 * visible: el peso desaparecería y la potencia del CMJ saldría en blanco sin
 * que nadie supiera por qué. Ya ha pasado dos veces en este proyecto.
 */
export async function contextosDe(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Contextos> {
  const ctx: Contextos = {}
  for (const id of ids) ctx[id] = {}
  if (ids.length === 0) return ctx

  const [deps, pesos] = await Promise.all([
    supabase.from('deportista').select('id, sexo').in('id', ids),
    supabase.from('registro_peso').select('*').in('id_deportista', ids).order('fecha', { ascending: false }),
  ])

  for (const d of deps.data ?? []) {
    if (ctx[d.id]) ctx[d.id].sexo = d.sexo ?? null
  }
  /* Vienen ordenados de más nuevo a más viejo, así que el primero de cada uno
     es el último pesaje. El `??=` deja pasar solo ese. */
  for (const p of pesos.data ?? []) {
    const c = ctx[p.id_deportista]
    if (c && c.pesoKg == null) c.pesoKg = p.peso_kg ?? null
  }
  return ctx
}

export interface PersonaDeTest {
  id_deportista: number
  nombre: string
  valores: Valores
}

export interface EncargoDeTest {
  test: TestCampo
  fecha: string
  protocolo: Valores
  personas: PersonaDeTest[]
  contextos?: Contextos
  notas?: string
  /** Dirigido con cronómetro o metido a mano después. Cambia lo que vale el número. */
  modo?: ModoTest
}

export interface ResultadoGuardado {
  id_deportista: number
  nombre: string
  ok: boolean
  /** 1 si se guardó, 0 si no. Se conserva el nombre por los avisos que lo leen. */
  filas: number
}

export interface ParteDeGuardado {
  error: string | null
  resultados: ResultadoGuardado[]
}

/**
 * Escribe el test de todos los que lo tengan terminado.
 *
 * A QUIEN LE FALTE ALGO SE LE SALTA, en vez de guardarle un test sin resultado.
 * En un grupo siempre falta alguien o alguien se retira, y una fila a medias
 * aparecería después en su historial como si hubiera hecho el test.
 *
 * Se intenta de una sentada y, si el lote falla, se reintenta persona a persona:
 * así un atleta al que la RLS no deje escribir no se lleva por delante el test
 * de los otros once.
 */
export async function guardarTestsDeCampo(
  supabase: SupabaseClient,
  e: EncargoDeTest,
): Promise<ParteDeGuardado> {
  if (!e.fecha) return { error: 'Sin fecha no se guarda: un test sin día no sirve para ordenar nada.', resultados: [] }

  const ctxs = e.contextos ?? {}
  const conFila = e.personas
    .map(p => {
      const v = { ...e.protocolo, ...p.valores }
      const ctx = ctxs[p.id_deportista] ?? {}
      const fila = estaCompleto(e.test, v, ctx)
        ? filaDeCampo(e.test, p.id_deportista, e.fecha, v, ctx, { modo: e.modo, notas: e.notas })
        : null
      return { p, fila }
    })
    .filter((x): x is { p: typeof e.personas[number]; fila: FilaCampo } => x.fila !== null)

  if (conFila.length === 0) return { error: 'Ningún test está completo todavía.', resultados: [] }

  const { error: errLote } = await supabase.from('test_campo').insert(conFila.map(x => x.fila))
  if (!errLote) {
    return {
      error: null,
      resultados: conFila.map(x => ({ id_deportista: x.p.id_deportista, nombre: x.p.nombre, ok: true, filas: 1 })),
    }
  }

  const resultados: ResultadoGuardado[] = []
  for (const x of conFila) {
    const { error } = await supabase.from('test_campo').insert(x.fila)
    resultados.push({ id_deportista: x.p.id_deportista, nombre: x.p.nombre, ok: !error, filas: error ? 0 : 1 })
  }
  return { error: null, resultados }
}

/**
 * Qué tests de la batería ya se le han hecho hoy a cada uno.
 *
 * Sirve para el aviso del §9 de «no dos disciplinas el mismo día». Ahora se
 * reconocen por su CLAVE, que es una columna: antes había que adivinarlos
 * mirando si el nombre de la fila empezaba por el del test, porque la tabla de
 * notas sueltas no tenía dónde guardar de qué test venía.
 */
export async function testsDeHoy(
  supabase: SupabaseClient,
  ids: number[],
  fecha: string,
): Promise<Record<number, TestCampo[]>> {
  const por: Record<number, TestCampo[]> = {}
  for (const id of ids) por[id] = []
  if (ids.length === 0 || !fecha) return por

  const { data } = await supabase.from('test_campo').select('id_deportista, clave')
    .in('id_deportista', ids).eq('fecha', fecha)
  for (const f of data ?? []) {
    const lista = por[f.id_deportista]
    if (!lista) continue
    const t = CATALOGO.find(x => x.clave === f.clave)
    if (t && !lista.includes(t)) lista.push(t)
  }
  return por
}

/**
 * Días hasta la próxima competición de prioridad A, por deportista.
 *
 * `null` cuando no la hay o cuando esta base no guarda la prioridad: entonces
 * el aviso de tapering no sale. Avisar en falso —«estás en tapering» a quien no
 * lo está— hace que se deje de leer el resto de avisos.
 */
export async function diasHastaCarreraA(
  supabase: SupabaseClient,
  ids: number[],
  desde: string,
): Promise<Record<number, number | null>> {
  const por: Record<number, number | null> = {}
  for (const id of ids) por[id] = null
  if (ids.length === 0 || !desde) return por

  const { data } = await supabase.from('competicion').select('*').in('id_deportista', ids).gte('fecha', desde)
  const hoy = Date.parse(desde)
  for (const c of data ?? []) {
    if (!(c.id_deportista in por)) continue
    const p = String(c.prioridad ?? '').trim().toUpperCase()
    if (p !== 'A') continue
    const dias = Math.round((Date.parse(c.fecha) - hoy) / 86400000)
    if (!isFinite(dias) || dias < 0) continue
    const actual = por[c.id_deportista]
    if (actual == null || dias < actual) por[c.id_deportista] = dias
  }
  return por
}

/** «3 tests guardados · 2 sin terminar.» */
export function resumenDeTests(resultados: ResultadoGuardado[], total: number): string {
  const ok = resultados.filter(r => r.ok).length
  const mal = resultados.length - ok
  const sinTerminar = total - resultados.length

  const partes = [ok === 1 ? '1 test guardado' : ok + ' tests guardados']
  if (mal > 0) partes.push(mal === 1 ? '1 con error' : mal + ' con error')
  if (sinTerminar > 0) partes.push(sinTerminar + ' sin terminar')
  return partes.join(' · ') + '.'
}
