// ============================================================
// TRIPULSE — Lo que lee y guarda la base para el escalón de pliometría
// ============================================================
//
// La lógica está en lib/pliometria-escalon y no sabe de Supabase. Aquí:
//
//   · De dónde sale cada dato de la app. El drop jump y el CMJ, de los tests
//     de campo (test_campo, claves «dropjump» y «bosco»): el cajón va en
//     `protocolo` porque se pone para todo el grupo, y el contacto en `brutos`,
//     los dos como texto. La sentadilla, del 1RM más reciente (test_fuerza). El
//     peso, de la anamnesis vigente. Las semanas con fuerza, de las sesiones
//     hechas de las 4 últimas semanas.
//   · Guardar: el escalón es una fila nueva del historial; la evaluación es una
//     fila por deportista que se reescribe. Quién y cuándo los pone la base.

import type { SupabaseClient } from '@supabase/supabase-js'
import { leerAnamnesis } from './anamnesis-vigente'
import { esDisciplinaDeFuerza } from './disciplinas'
import { hoyISO, sumarDias } from './fechas'
import { sinTildes } from './tecnica'
import { DATOS_VACIOS, type Comprobaciones, type DatosApp, type FilaEscalon } from './pliometria-escalon'
import { NIVELES_PLIO, type NivelPlio, type PartePlio } from './pliometria'

type Json = Record<string, unknown>

const numero = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : null
}

/** Una fila de test_campo con lo que se mira aquí. */
export interface FilaTestCampo { clave: string; fecha: string; brutos?: Json | null; protocolo?: Json | null; resultados?: Json | null }
export interface FilaTestFuerza { ejercicio: string | null; rm_estimado: number | string | null; fecha: string }
export interface SesionHecha { fecha_sesion: string; disciplina: string | null; eliminada?: boolean | null }

/*
 * LA SENTADILLA DE LAS DOS PIERNAS. «Sentadilla búlgara» o «jump squat» también
 * dicen sentadilla, y su 1RM no es el que pide la NSCA.
 */
const ES_SENTADILLA = /(sentadilla|squat)/
const NO_ES_LA_DE_DOS_PIERNAS = /(bulgar|goblet|split|una pierna|unilateral|pistol|zancada|isometr|salto|jump)/
export const esSentadilla = (ejercicio: string | null | undefined): boolean => {
  const n = sinTildes(ejercicio)
  return ES_SENTADILLA.test(n) && !NO_ES_LA_DE_DOS_PIERNAS.test(n)
}

/**
 * De las últimas 4 semanas (hoy y los 27 días de antes, en bloques de siete),
 * en cuántas hizo alguna sesión de fuerza.
 */
export function semanasConFuerza(sesiones: SesionHecha[], hoy: string): number {
  const bloques = new Set<number>()
  for (const s of sesiones || []) {
    if (s.eliminada || !esDisciplinaDeFuerza(s.disciplina)) continue
    const dias = Math.round((Date.parse(hoy + 'T00:00:00Z') - Date.parse(String(s.fecha_sesion).slice(0, 10) + 'T00:00:00Z')) / 86400000)
    if (dias >= 0 && dias < 28) bloques.add(Math.floor(dias / 7))
  }
  return bloques.size
}

/** Lo que sale de la app, desde las filas tal cual llegan. */
export function datosDeLaApp(o: {
  campo: FilaTestCampo[]
  fuerza: FilaTestFuerza[]
  peso: unknown
  sesiones: SesionHecha[]
  hoy: string
}): DatosApp {
  const porFecha = <T extends { fecha: string }>(xs: T[]) => (xs || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  const drop = porFecha((o.campo || []).filter(f => f.clave === 'dropjump'))[0]
  const bosco = porFecha((o.campo || []).filter(f => f.clave === 'bosco' && numero(f.resultados?.cmj) != null))[0]
  const sentadilla = porFecha((o.fuerza || []).filter(f => esSentadilla(f.ejercicio) && numero(f.rm_estimado) != null))[0]

  return {
    ...DATOS_VACIOS,
    peso: numero(o.peso),
    sentadilla: sentadilla ? numero(sentadilla.rm_estimado) : null,
    cmj: bosco ? numero(bosco.resultados?.cmj) : null,
    caja: drop ? numero(drop.protocolo?.caja ?? drop.brutos?.caja) : null,
    contacto: drop ? numero(drop.brutos?.contacto) : null,
    salto: drop ? numero(drop.resultados?.salto) : null,
    rsi: drop ? numero(drop.resultados?.rsi) : null,
    semanasFuerza: semanasConFuerza(o.sesiones, o.hoy),
    fechas: {
      ...(drop ? { dropjump: drop.fecha } : {}),
      ...(bosco ? { cmj: bosco.fecha } : {}),
      ...(sentadilla ? { sentadilla: sentadilla.fecha } : {}),
    },
  }
}

/** Las comprobaciones guardadas, solo con lo que tiene la forma que toca. */
export function leerComprobaciones(v: unknown): Comprobaciones {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {}
  const out: Comprobaciones = {}
  for (const [k, val] of Object.entries(o)) {
    if (k === 'asimetria') { if (typeof val === 'number' && Number.isFinite(val) && val >= 0) out.asimetria = val }
    else if (k === 'domina') { if (NIVELES_PLIO.includes(val as NivelPlio)) out.domina = val as NivelPlio }
    else if (typeof val === 'boolean') (out as Record<string, boolean>)[k] = val
  }
  return out
}

export interface SaltosDeportista {
  historial: FilaEscalon[]
  comprobaciones: Comprobaciones
  evaluadaEn: string | null
  datos: DatosApp
  error: string | null
}

/** Todo lo que hace falta para la pestaña: seis consultas a la vez. */
export async function cargarSaltos(sb: SupabaseClient, idDeportista: number): Promise<SaltosDeportista> {
  const hoy = hoyISO()
  const [esc, ev, campo, fuerza, an, ses] = await Promise.all([
    sb.from('pliometria_escalon').select('id, parte, escalon, recomendado, nota, puesto_por, puesto_en')
      .eq('id_deportista', idDeportista).order('puesto_en', { ascending: false }).limit(60),
    sb.from('pliometria_evaluacion').select('comprobaciones, actualizado_en').eq('id_deportista', idDeportista).maybeSingle(),
    sb.from('test_campo').select('clave, fecha, brutos, protocolo, resultados')
      .eq('id_deportista', idDeportista).in('clave', ['dropjump', 'bosco']).order('fecha', { ascending: false }).limit(20),
    sb.from('test_fuerza').select('ejercicio, rm_estimado, fecha')
      .eq('id_deportista', idDeportista).not('rm_estimado', 'is', null).order('fecha', { ascending: false }).limit(60),
    leerAnamnesis(sb, idDeportista, 'peso'),
    sb.from('sesion').select('fecha_sesion, disciplina, eliminada')
      .eq('id_deportista', idDeportista).eq('estado', 'Realizada').gte('fecha_sesion', sumarDias(hoy, -27)).lte('fecha_sesion', hoy),
  ])
  const error = esc.error?.message || ev.error?.message || null
  return {
    historial: (esc.data || []) as FilaEscalon[],
    comprobaciones: leerComprobaciones(ev.data?.comprobaciones),
    evaluadaEn: ev.data?.actualizado_en ?? null,
    datos: datosDeLaApp({
      campo: (campo.data || []) as FilaTestCampo[],
      fuerza: (fuerza.data || []) as FilaTestFuerza[],
      peso: an.data?.peso,
      sesiones: (ses.data || []) as SesionHecha[],
      hoy,
    }),
    error,
  }
}

/** Pone el escalón de una parte: una fila nueva del historial. */
export async function ponerEscalon(
  sb: SupabaseClient, idDeportista: number, parte: PartePlio, escalon: string | null, recomendado: string | null,
): Promise<{ fila: FilaEscalon | null; error: string | null }> {
  const { data, error } = await sb.from('pliometria_escalon')
    .insert({ id_deportista: idDeportista, parte, escalon, recomendado })
    .select('id, parte, escalon, recomendado, nota, puesto_por, puesto_en').single()
  return { fila: (data as FilaEscalon) ?? null, error: error ? 'No se ha podido guardar el escalón: ' + error.message : null }
}

/** Guarda la evaluación entera (una fila por deportista). */
export async function guardarComprobaciones(sb: SupabaseClient, idDeportista: number, c: Comprobaciones): Promise<string | null> {
  const { error } = await sb.from('pliometria_evaluacion')
    .upsert({ id_deportista: idDeportista, comprobaciones: c }, { onConflict: 'id_deportista' })
  return error ? 'No se ha podido guardar la evaluación: ' + error.message : null
}
