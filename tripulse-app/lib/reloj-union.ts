// ============================================================
// TRIPULSE — Unir entrenos del reloj y sesiones, en la base
// ============================================================
// lib/reloj-sesion decide (puro); esto lee y escribe. Lo usan las tres
// pantallas de la maqueta del 2026-10-19: el cierre de la sesión del
// deportista, su panel («De tu reloj») y «Su reloj» del entrenador.
//
// La fila de `reloj_union` la escriben el deportista y su entrenador (lo dice
// la base). `decidido_por` va SIEMPRE explícito: al cambiar una decisión de
// otro (el deportista dijo «no es esa» y su entrenador la une), la regla pide
// que la fila quede a nombre de quien la cambia.
//
// ORDEN DE LAS ESCRITURAS: primero la fila con lo que había (`antes`), después
// los datos del reloj en la sesión. Si lo segundo falla, queda una unión cuyo
// `antes` es lo que sigue habiendo: desunir no rompe nada.

import { vivas } from './papelera'
import { lunesDe, sumarDias } from './fechas'
import { actividadesDeMediciones, type ActividadReloj } from './actividades-reloj'
import {
  partesDeSesion, escriturasConReloj, escriturasAlDesunir, antesDe, partesUnidas,
  type UnionReloj, type SesionParaUnir, type Escrituras, type ParteConReloj, type AntesUnion, type Decision,
} from './reloj-sesion'
import { rellenarRpeTareas } from './rpe-sesion'
import { guardarRegistroResistencia, type BloqueRegistro } from './registro-resistencia'
import { microDelDia } from './grupos-emision'
import { nombreDeEntreno } from './coros-envio'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

export interface SesionDelReloj extends SesionParaUnir {
  /** «Carrera · 4,5 km aeróbico lipolítico»: la sesión no tiene nombre en la base. */
  nombre: string
}

export interface DatosUnion {
  actividades: ActividadReloj[]
  sesiones: SesionDelReloj[]
  uniones: UnionReloj[]
  /** Si algo no se ha podido leer: la pantalla lo dice en vez de enseñar un vacío falso. */
  error: string | null
}

/* Lo que hace falta de cada sesión: su estado, lo que el reloj puede cambiar y
   las tareas con sus mediciones (para la FC y los metros de una tarea sola, y
   para el nombre). */
export const SELECT_SESION_RELOJ =
  'id, fecha_sesion, disciplina, estado, rpe_reportado, duracion_real, hora_inicio, ' +
  'tarea(id, orden, disciplina, zona_entrenamiento, series, bloques, fc_media, ' +
  'p_distancia(id, metros_planeados, metros_reales), p_duracion(id, tiempo_planeado, tiempo_real))'

const SELECT_UNION = 'id, id_medicion, id_sesion, parte, decision, antes, decidido_por, decidido_en'

/* Para el nombre basta con la forma que espera lib/coros-envio. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sesionDelReloj(fila: any): SesionDelReloj {
  const tareas = Array.isArray(fila?.tarea) ? fila.tarea : []
  const disciplina = fila?.disciplina ?? null
  return {
    id: fila.id,
    fecha: String(fila.fecha_sesion).slice(0, 10),
    disciplina,
    estado: fila.estado ?? null,
    rpe_reportado: fila.rpe_reportado ?? null,
    duracion_real: fila.duracion_real ?? null,
    hora_inicio: fila.hora_inicio ?? null,
    partes: partesDeSesion(disciplina, tareas),
    tareas,
    nombre: tareas.length ? nombreDeEntreno(String(disciplina || ''), tareas) : String(disciplina || 'Sesión'),
  }
}

const domingoDe = (f: string) => sumarDias(lunesDe(f), 6)

/**
 * Los entrenos del reloj de esas fechas, sus decisiones y las sesiones de esas
 * SEMANAS enteras (para poder unir uno a otro día de su semana).
 */
export async function cargarDatosUnion(sb: Sb, idDeportista: number, desde: string, hasta: string): Promise<DatosUnion> {
  const [med, ses, uni] = await Promise.all([
    sb.from('reloj_medicion').select('id, proveedor, fecha, id_externo, datos, recibido_en')
      .eq('id_deportista', idDeportista).eq('tipo', 'entreno')
      .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).limit(400),
    vivas(sb.from('sesion').select(SELECT_SESION_RELOJ).eq('id_deportista', idDeportista)
      .gte('fecha_sesion', lunesDe(desde)).lte('fecha_sesion', domingoDe(hasta))),
    sb.from('reloj_union').select(SELECT_UNION).eq('id_deportista', idDeportista),
  ])
  const error = med.error?.message || ses.error?.message || uni.error?.message || null
  return {
    actividades: actividadesDeMediciones(med.data || []),
    sesiones: (ses.data || []).map(sesionDelReloj),
    uniones: (uni.data || []) as UnionReloj[],
    error: error ? 'No se han podido leer los entrenos del reloj: ' + error : null,
  }
}

async function quienSoy(sb: Sb): Promise<string | null> {
  const { data } = await sb.auth.getSession()
  return data?.session?.user?.id ?? null
}

/** Una decisión sobre un entreno: la crea o cambia la que hubiera (una por entreno). */
export async function guardarDecision(sb: Sb, d: {
  idDeportista: number; idMedicion: number; decision: Decision
  idSesion?: number | null; parte?: number; antes?: AntesUnion | null
}): Promise<string | null> {
  const uid = await quienSoy(sb)
  if (!uid) return 'Tu sesión ha caducado: vuelve a entrar.'
  const { error } = await sb.from('reloj_union').upsert({
    id_deportista: d.idDeportista,
    id_medicion: d.idMedicion,
    id_sesion: d.decision === 'no_cuenta' ? null : d.idSesion ?? null,
    parte: d.parte ?? 1,
    decision: d.decision,
    antes: d.antes ?? null,
    decidido_por: uid,
    decidido_en: new Date().toISOString(),
  }, { onConflict: 'id_medicion' })
  return error ? 'No se ha podido guardar: ' + error.message : null
}

/** Quitar la decisión (deshacer un «no contarla» o un «no es esa»). */
export async function quitarDecision(sb: Sb, union: Pick<UnionReloj, 'id'>): Promise<string | null> {
  const { error } = await sb.from('reloj_union').delete().eq('id', union.id)
  return error ? 'No se ha podido deshacer: ' + error.message : null
}

/** Escribe en la sesión lo que sale del reloj. Una sesión que no se deja cambiar (0 filas) es un fallo. */
export async function aplicarEscrituras(sb: Sb, idSesion: number, e: Escrituras): Promise<string | null> {
  const ops: Promise<{ error?: { message: string } | null; data?: unknown[] | null }>[] = []
  if (Object.keys(e.sesion).length) ops.push(sb.from('sesion').update(e.sesion).eq('id', idSesion).select('id'))
  for (const t of e.tareas) ops.push(sb.from('tarea').update(t.campos).eq('id', t.id))
  for (const d of e.distancias) ops.push(sb.from('p_distancia').update(d.campos).eq('id', d.id))
  for (const d of e.duraciones) ops.push(sb.from('p_duracion').update(d.campos).eq('id', d.id))
  const r = await Promise.all(ops)
  const mal = r.find(x => x?.error)
  if (mal?.error) return 'No se han podido poner los datos del reloj en la sesión: ' + mal.error.message
  if (Object.keys(e.sesion).length && Array.isArray(r[0]?.data) && r[0].data.length === 0) {
    return 'No se han podido poner los datos del reloj en la sesión: no te deja cambiarla.'
  }
  return null
}

/** Lo que había antes del reloj: el de una unión de esa sesión que ya lo guardó, o lo de ahora. */
function antesDeLaSesion(sesion: SesionParaUnir, uniones: UnionReloj[], partes: ParteConReloj[]): AntesUnion {
  const ya = uniones.find(u => u.decision === 'unida' && u.id_sesion === sesion.id && u.antes)
  return ya?.antes ? { ...ya.antes, tareas: [...(ya.antes.tareas || []), ...antesDe(sesion, partes).tareas.filter(t => !ya.antes!.tareas?.some(x => x.id === t.id))] } : antesDe(sesion, partes)
}

/**
 * Unir sin cerrar (el entrenador, sin RPE): solo la fila. La sesión no se toca
 * hasta que alguien ponga el RPE (decisión 4: sin RPE no suma carga).
 */
export async function unirSinCerrar(sb: Sb, idDeportista: number, idMedicion: number, sesion: SesionParaUnir, parte: number): Promise<string | null> {
  return guardarDecision(sb, { idDeportista, idMedicion, decision: 'unida', idSesion: sesion.id, parte })
}

/**
 * Poner en la sesión los datos del reloj de TODAS sus partes unidas (y de las
 * `nuevas`, que se unen ahora). Con `cierre`, además se cierra con ese RPE;
 * sin él, se completa una ya cerrada y su RPE se queda (decisión 6).
 */
export async function ponerDatosDelReloj(sb: Sb, d: {
  idDeportista: number
  sesion: SesionParaUnir
  datos: Pick<DatosUnion, 'uniones' | 'actividades'>
  nuevas?: ParteConReloj[]
  cierre?: { rpe: number; origen: 'atleta' | 'entrenador' }
  /** false al cerrar desde el cuestionario: la FC ya la guardó él (la del reloj, o la que corrigió). */
  fc?: boolean
}): Promise<string | null> {
  const nuevas = d.nuevas || []
  const yaUnidas = partesUnidas(d.sesion.id, d.datos.uniones, d.datos.actividades)
    .filter(p => !nuevas.some(n => n.actividad.id === p.actividad.id))
  const partes = [...yaUnidas, ...nuevas]
  if (!partes.length) return 'No hay ningún entreno del reloj unido a esta sesión.'
  const antes = antesDeLaSesion(d.sesion, d.datos.uniones, partes)

  /* Primero las filas, con lo que había: si después falla la sesión, desunir no rompe nada. */
  for (const p of partes) {
    const err = await guardarDecision(sb, {
      idDeportista: d.idDeportista, idMedicion: p.actividad.id, decision: 'unida', idSesion: d.sesion.id, parte: p.parte, antes,
    })
    if (err) return err
  }
  const err = await aplicarEscrituras(sb, d.sesion.id, escriturasConReloj(d.sesion, partes, d.cierre, { fc: d.fc !== false }))
  if (err) return err
  if (d.cierre) await rellenarRpeTareas(sb, d.sesion.id, d.cierre.rpe)
  return null
}

/**
 * Desunir: los datos del reloj salen de la sesión (vuelve lo que había) y la
 * fila se borra. Su RPE y si estaba hecha, no se tocan. Si la unión nunca
 * llegó a poner nada (`antes` vacío), solo se borra la fila.
 */
export async function desunir(sb: Sb, union: UnionReloj, sesion: SesionParaUnir | null, datos: Pick<DatosUnion, 'uniones' | 'actividades'>): Promise<string | null> {
  if (sesion && union.antes) {
    const quedan = partesUnidas(sesion.id, datos.uniones, datos.actividades, union.id_medicion)
    const err = await aplicarEscrituras(sb, sesion.id, escriturasAlDesunir(sesion, union, quedan))
    if (err) return err
  }
  return quitarDecision(sb, union)
}

/**
 * Apuntar un entreno del reloj que no estaba en el plan (decisión 5): una
 * sesión ya hecha, con su RPE y los datos del reloj, unida a él. Es la misma
 * sesión que se crearía en «Apuntar», sin escribir nada más.
 */
export async function apuntarDesdeReloj(sb: Sb, d: {
  idDeportista: number
  actividad: ActividadReloj
  rpe: number
  quien: 'atleta' | 'entrenador'
}): Promise<{ idSesion: number | null; error: string | null }> {
  const a = d.actividad
  if (!a.disciplina) return { idSesion: null, error: 'Ese entreno no es de ninguna de tus disciplinas.' }
  const { data: micros } = await sb.from('microciclo').select('id, fecha_inicio, duracion_dias').eq('id_deportista', d.idDeportista)
  const idMicrociclo = microDelDia(micros || [], a.fecha)?.id ?? null
  const resistencia = ['Carrera', 'Ciclismo', 'Natacion'].includes(a.disciplina)
  const bloques: BloqueRegistro[] = resistencia && (a.metros || a.minutos) ? [{
    zona: '', series: '1', ritmo: '', descanso: '',
    ...(a.metros ? { cantidad: String(Math.round(a.metros)), unidad: 'm' as const } : { cantidad: String(Math.round(a.minutos!)), unidad: 'min' as const }),
  }] : []
  const r = await guardarRegistroResistencia(sb, {
    idDeportista: d.idDeportista, disciplina: a.disciplina, fecha: a.fecha, idMicrociclo,
    realizada: true, duracionMinutos: a.minutos != null ? Math.round(a.minutos) : null, rpe: d.rpe, notas: null, bloques,
  })
  if (r.error || !r.idSesion) return { idSesion: null, error: r.error || 'No se ha podido crear la sesión.' }

  /* Quién la apuntó y de dónde sale el RPE. «Apuntar» la crea como del deportista. */
  await sb.from('sesion').update({
    rpe_origen: d.quien,
    ...(d.quien === 'entrenador' ? { origen: 'entrenador' } : {}),
  }).eq('id', r.idSesion)

  const { data: fila } = await sb.from('sesion').select(SELECT_SESION_RELOJ).eq('id', r.idSesion).maybeSingle()
  if (!fila) return { idSesion: r.idSesion, error: null }
  const err = await ponerDatosDelReloj(sb, {
    idDeportista: d.idDeportista,
    sesion: sesionDelReloj(fila),
    datos: { uniones: [], actividades: [a] },
    nuevas: [{ actividad: a, parte: 1 }],
  })
  return { idSesion: r.idSesion, error: err ? 'La sesión está apuntada, pero ' + err.charAt(0).toLowerCase() + err.slice(1) : null }
}
