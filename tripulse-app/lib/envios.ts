// ============================================================
// TRIPULSE — Envíos entre entrenadores (fase 1)
// ============================================================
// Pedido del usuario el 23-10-2026: que un entrenador pueda mandar a otro una
// sesión (le llega como PLANTILLA), un test propio o unas zonas propias con el
// test del que salen, y que al otro le llegue un aviso en su panel. Maqueta
// aprobada: https://claude.ai/artifact/RUwkGr4VEPYsXVDK93z3ni
//
// Lo que se manda es una COPIA, y el que manda es la base
// (supabase/envios-entrenadores.sql): busca al otro por su correo exacto,
// guarda lo enviado tal como estaba, y al aceptar crea las copias enganchadas a
// los tests de quien acepta. Aquí solo se llama a esas funciones y se decide
// qué se le enseña a cada uno.
//
// Las sesiones de FUERZA no se mandan: no hay plantillas de fuerza (decidido
// por el usuario: «fuerza fuera»).

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { BloqueP } from './plantillas-tipos'
import { cargaZona } from './zonas'
import { zonaPico } from './plantillas-propias'
import { normalizar } from './buscar-ejercicio'

export type TipoEnvio = 'plantilla' | 'test' | 'zonas'
export type EstadoEnvio = 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado'

/** Un test tal como viaja: la fila de `test_definicion` sin su dueño. */
export interface TestEnviado {
  id: number
  nombre: string
  deporte: string
  campos: unknown
  resultados: unknown
  modelo: unknown
}

/** Un límite de zona: un % de un hito («propia:<test>:<resultado>» o «app:vam»). */
export interface LimiteEnviado { ref: string; pct: number }

export interface ZonaEnviada {
  sigla: string
  nombre: string
  pct_min: number | null
  pct_max: number | null
  rpe_min: number | null
  rpe_max: number | null
  color: string
  orden: number
  deporte: string
  ref_definicion: number | null
  ref_indice: number | null
  desde: LimiteEnviado | null
  hasta: LimiteEnviado | null
}

/** Lo que se guardó al enviarlo. Según el tipo, unas claves u otras. */
export interface ContenidoEnvio {
  /* plantilla */
  nombre?: string
  disciplina?: string
  zona?: string
  objetivo?: string | null
  bloques?: BloqueP[]
  /* test y zonas */
  tests?: TestEnviado[]
  clasificacion?: { nombre: string; deporte: string; hitos: string[] }
  zonas?: ZonaEnviada[]
}

export interface ResultadoEnvio {
  plantilla?: number
  clasificacion?: number
  /** Del id del test original al de la copia de quien aceptó. */
  tests?: Record<string, number>
}

export interface Envio {
  id: number
  de: string
  para: string
  tipo: TipoEnvio
  titulo: string
  contenido: ContenidoEnvio
  mensaje: string | null
  de_nombre: string | null
  para_nombre: string | null
  para_correo: string | null
  estado: EstadoEnvio
  resultado: ResultadoEnvio | null
  creado_en: string
  contestado_en: string | null
  respuesta_vista_en: string | null
}

/** Las columnas que piden las pantallas, escritas UNA vez. */
export const COLUMNAS_ENVIO =
  'id, de, para, tipo, titulo, contenido, mensaje, de_nombre, para_nombre, para_correo, estado, resultado, creado_en, contestado_en, respuesta_vista_en'

/** Las disciplinas que tienen plantillas (las mismas que el editor de sesión). */
export const DISCIPLINAS_PLANTILLA = ['Natacion', 'Ciclismo', 'Carrera']

// ------------------------------------------------------------
// Textos
// ------------------------------------------------------------

/** Cómo se llama lo que se manda. Unas zonas que salen de la app no llevan test. */
export function etiquetaTipo(e: Pick<Envio, 'tipo' | 'contenido'>): string {
  if (e.tipo === 'plantilla') return 'Plantilla'
  if (e.tipo === 'test') return 'Test'
  return (e.contenido?.tests?.length ?? 0) > 0 ? 'Zonas y test' : 'Zonas'
}

/** Lo que viaja y lo que no, para decirlo antes de pulsar «Enviar». */
export function queViaja(tipo: TipoEnvio): { viaja: string[]; noViaja: string[] } {
  if (tipo === 'plantilla') return {
    viaja: ['Los bloques: zona, series, volumen y descanso', 'El nombre y, si lo tiene, el objetivo'],
    noViaja: ['A quién se la pusiste ni cuándo', 'Lo que hizo tu deportista: tiempos, RPE, comentarios', 'Tus notas de la sesión'],
  }
  if (tipo === 'test') return {
    viaja: ['Los campos, las fórmulas y los resultados', 'Qué resultado sirve para las zonas'],
    noViaja: ['Las mediciones de tus deportistas'],
  }
  return {
    viaja: ['Las zonas, con sus porcentajes, su RPE y sus colores', 'Los tests de los que salen, enganchados a ellas'],
    noViaja: ['Lo que ajustaste a cada deportista', 'Las mediciones de tus deportistas'],
  }
}

/** Dónde queda lo que se acepta, para decírselo a quien acaba de aceptarlo. */
export function dondeQueda(e: Pick<Envio, 'tipo' | 'contenido'>): string {
  if (e.tipo === 'plantilla') {
    const d = e.contenido?.disciplina
    const nombre = d === 'Natacion' ? 'natación' : d === 'Ciclismo' ? 'ciclismo' : 'carrera'
    return 'Está en tus plantillas: en cualquier sesión de ' + nombre + ', panel «Plantillas», pestaña «Propias».'
  }
  if (e.tipo === 'test') return 'Está en tus Tests propios.'
  return (e.contenido?.tests?.length ?? 0) > 0
    ? 'Está en tus Zonas propias, y su test en tus Tests propios.'
    : 'Está en tus Zonas propias.'
}

/** El primer nombre: lo que va entre paréntesis en una copia con nombre repetido. */
export function primerNombre(nombre: string | null | undefined): string {
  return String(nombre ?? '').trim().split(/\s+/)[0] || ''
}

/**
 * Un nombre que no tengas ya: el suyo; si está cogido, «Nombre (Ana)»; si
 * también, «Nombre (Ana 2)». Sin mirar mayúsculas y sin pasar de 80 letras.
 * ES LA MISMA REGLA QUE LA BASE (envio_nombre_libre): la pantalla la usa para
 * proponer el nombre, y la base la vuelve a aplicar al aceptar.
 */
export function nombreLibre(base: string | null | undefined, usados: (string | null | undefined)[] | null | undefined, de: string | null | undefined): string {
  let b = String(base ?? '').trim().slice(0, 80)
  if (!b) b = 'Sin nombre'
  const quien = primerNombre(de).slice(0, 12) || 'copia'
  const cogidos = new Set((usados || []).map(u => String(u ?? '').trim().toLowerCase()))
  let cand = b
  let n = 1
  while (cogidos.has(cand.toLowerCase()) && n <= 99) {
    n++
    const cola = ' (' + quien + (n > 2 ? ' ' + (n - 1) : '') + ')'
    cand = b.slice(0, 80 - cola.length) + cola
  }
  return cand
}

/** «ahora», «hace 5 min», «hace 3 h», «ayer», «hace 4 días» o la fecha. */
export function haceCuanto(iso: string | null | undefined, ahora: Date = new Date()): string {
  const t = iso ? new Date(iso).getTime() : NaN
  if (!Number.isFinite(t)) return ''
  const min = Math.floor((ahora.getTime() - t) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return 'hace ' + min + ' min'
  const h = Math.floor(min / 60)
  if (h < 24) return 'hace ' + h + ' h'
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return 'hace ' + d + ' días'
  return new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/** El correo tiene pinta de correo (la misma regla que la base del director). */
export const correoValido = (s: string | null | undefined): boolean =>
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s ?? '').trim())

/**
 * A quién has mandado algo: uno por persona, el último primero. Es la lista
 * de debajo del correo; solo salen los tuyos, nunca la de la plataforma.
 */
export function destinatariosPrevios(
  filas: { para: string; para_nombre: string | null; para_correo: string | null; creado_en: string }[] | null | undefined,
  max = 8,
): { id: string; nombre: string; correo: string }[] {
  const vistos = new Set<string>()
  const out: { id: string; nombre: string; correo: string }[] = []
  for (const f of [...(filas || [])].sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)))) {
    if (vistos.has(f.para) || !f.para_correo) continue
    vistos.add(f.para)
    out.push({ id: f.para, nombre: f.para_nombre || f.para_correo, correo: f.para_correo })
    if (out.length >= max) break
  }
  return out
}

/** Las siglas de una plantilla que la app no conoce: las zonas propias de quien la manda. */
export function zonasDesconocidas(bloques: BloqueP[] | null | undefined): string[] {
  const out: string[] = []
  for (const b of bloques || []) {
    const s = String(b?.zona ?? '').trim()
    if (s && cargaZona(s).origen === 'supuesta' && !out.includes(s)) out.push(s)
  }
  return out
}

/** La plantilla lista para mandar, con su zona pico (la que la representa). */
export function plantillaParaEnviar(p: { nombre: string; disciplina: string; objetivo?: string | null; bloques: BloqueP[] }) {
  return {
    nombre: p.nombre.trim(),
    disciplina: p.disciplina,
    zona: zonaPico(p.bloques),
    objetivo: p.objetivo?.trim() || null,
    bloques: p.bloques,
  }
}

/** El estado contado a quien lo recibe o a quien lo mandó. */
export function textoEstado(e: Pick<Envio, 'estado' | 'para_nombre' | 'de_nombre'>, papel: 'recibe' | 'manda'): string {
  const otro = primerNombre(papel === 'recibe' ? e.de_nombre : e.para_nombre) || 'El otro entrenador'
  if (papel === 'recibe') {
    if (e.estado === 'pendiente') return 'Por revisar'
    if (e.estado === 'aceptado') return 'Lo aceptaste'
    if (e.estado === 'rechazado') return 'Lo rechazaste'
    return otro + ' lo canceló'
  }
  if (e.estado === 'pendiente') return otro + ' todavía no ha contestado'
  if (e.estado === 'aceptado') return otro + ' lo ha aceptado'
  if (e.estado === 'rechazado') return otro + ' lo ha rechazado'
  return 'Lo cancelaste'
}

// ------------------------------------------------------------
// Nombres repetidos al aceptar
// ------------------------------------------------------------

/** Lo que ya tiene quien acepta, para saber qué nombres chocarían. */
export interface LoQueTengo {
  tests: { id: number; nombre: string }[]
  clasificaciones: string[]
  /** Por disciplina: las plantillas solo chocan con las de su disciplina. */
  plantillas: Record<string, string[]>
  /** Copias de envíos anteriores del mismo entrenador: id del original → id de la copia. */
  copiasPrevias: Record<string, number>
}

export interface Conflictos {
  plantilla: string | null
  clasificacion: string | null
  /** Por id del test original: el nombre propuesto si choca. */
  tests: Record<string, string>
  /** Tests que ya tiene de un envío anterior: se usará ese si no ha cambiado. */
  yaLosTiene: string[]
}

/**
 * Qué nombres chocarían al aceptar y qué nombre se propone para cada uno. Un
 * test que ya llegó en otro envío del mismo entrenador no choca: si no ha
 * cambiado, la base usa esa copia (y si ha cambiado, le pone el «(Ana)»).
 */
export function conflictosDe(e: Pick<Envio, 'tipo' | 'contenido' | 'de_nombre'>, mio: LoQueTengo): Conflictos {
  const out: Conflictos = { plantilla: null, clasificacion: null, tests: {}, yaLosTiene: [] }
  const c = e.contenido || {}
  const misTests = mio.tests.map(t => t.nombre)
  for (const t of c.tests || []) {
    const previa = mio.copiasPrevias[String(t.id)]
    if (previa && mio.tests.some(x => x.id === previa)) { out.yaLosTiene.push(String(t.id)); continue }
    const libre = nombreLibre(t.nombre, misTests, e.de_nombre)
    if (libre !== String(t.nombre ?? '').trim().slice(0, 80)) out.tests[String(t.id)] = libre
  }
  if (e.tipo === 'plantilla' && c.nombre) {
    const usadas = mio.plantillas[c.disciplina || ''] || []
    const libre = nombreLibre(c.nombre, usadas, e.de_nombre)
    if (libre !== c.nombre.trim().slice(0, 80)) out.plantilla = libre
  }
  if (e.tipo === 'zonas' && c.clasificacion) {
    const libre = nombreLibre(c.clasificacion.nombre, mio.clasificaciones, e.de_nombre)
    if (libre !== String(c.clasificacion.nombre ?? '').trim().slice(0, 80)) out.clasificacion = libre
  }
  return out
}

/** Las copias que ya le llegaron de ese entrenador (de los envíos aceptados). */
export function copiasPreviasDe(envios: Pick<Envio, 'de' | 'estado' | 'resultado'>[], de: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of envios) {
    if (e.de !== de || e.estado !== 'aceptado') continue
    for (const [orig, copia] of Object.entries(e.resultado?.tests || {})) {
      if (out[orig] === undefined && Number.isFinite(Number(copia))) out[orig] = Number(copia)
    }
  }
  return out
}

// ------------------------------------------------------------
// Las zonas: cómo se leen sus límites
// ------------------------------------------------------------

/** Nombres de los resultados de los tests que viajan, por «propia:<test>:<i>». */
export function nombresDeHitos(tests: TestEnviado[] | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of tests || []) {
    const res = resultadosDe(t)
    res.forEach((r, i) => { out['propia:' + t.id + ':' + i] = r || t.nombre })
  }
  return out
}

/** Los nombres de los resultados de un test, venga del modelo que venga. */
export function resultadosDe(t: Pick<TestEnviado, 'resultados' | 'modelo'>): string[] {
  const deLista = (x: unknown): string[] =>
    Array.isArray(x) ? x.map(r => String((r as any)?.nombre ?? '').trim()) : []
  const modelo = t.modelo && typeof t.modelo === 'object' ? (t.modelo as any) : null
  if (modelo && Array.isArray(modelo.resultados) && (Array.isArray(modelo.sueltos) || Array.isArray(modelo.bloques))) {
    return deLista(modelo.resultados)
  }
  return deLista(t.resultados)
}

const HITO_APP: Record<string, string> = { 'app:vam': 'VAM', 'app:ftp': 'FTP', 'app:css': 'CSS' }

/** «Su VAM», «VIFT» o «resultado 2»: cómo se lee un hito. */
export function nombreDeHito(ref: string | null | undefined, nombres: Record<string, string>): string {
  const r = String(ref ?? '')
  return HITO_APP[r] ?? nombres[r] ?? (r.startsWith('propia:') ? 'un resultado de su test' : r)
}

/** Un límite de zona leído: «95 % de VIFT». Sin límite, el extremo. */
export function textoLimite(l: LimiteEnviado | null | undefined, nombres: Record<string, string>, extremo: string): string {
  if (!l || !Number.isFinite(Number(l.pct))) return extremo
  return Number(l.pct).toLocaleString('es-ES') + ' % de ' + nombreDeHito(l.ref, nombres)
}

/** La zona leída de punta a punta, también las de antes (un hito, % mínimo y máximo). */
export function textoZona(z: ZonaEnviada, nombres: Record<string, string>): string {
  if (z.desde || z.hasta) {
    if (!z.desde) return 'hasta ' + textoLimite(z.hasta, nombres, '')
    if (!z.hasta) return 'desde ' + textoLimite(z.desde, nombres, '')
    return textoLimite(z.desde, nombres, '') + ' → ' + textoLimite(z.hasta, nombres, '')
  }
  const hito = z.ref_definicion != null && z.ref_indice != null
    ? nombreDeHito('propia:' + z.ref_definicion + ':' + z.ref_indice, nombres)
    : 'la referencia de la app'
  const min = z.pct_min, max = z.pct_max
  if (min == null && max == null) return ''
  if (min == null) return 'hasta ' + max + ' % de ' + hito
  if (max == null) return 'desde ' + min + ' % de ' + hito
  return min + '–' + max + ' % de ' + hito
}

/** El RPE de una zona: «6–7» o «6». */
export function textoRpe(z: Pick<ZonaEnviada, 'rpe_min' | 'rpe_max'>): string {
  if (z.rpe_min == null) return ''
  return z.rpe_max == null || z.rpe_max === z.rpe_min ? String(z.rpe_min) : z.rpe_min + '–' + z.rpe_max
}

// ------------------------------------------------------------
// Elegir qué mandar desde la página Envíos
// ------------------------------------------------------------

/** De qué tests propios salen unas zonas: sus nombres, y si alguno no es tuyo. */
export function testsDeHitos(
  hitos: string[] | null | undefined,
  misTests: { id: number; nombre: string }[],
): { nombres: string[]; ajenos: boolean } {
  const ids = [...new Set((hitos || [])
    .map(h => /^propia:(\d+):\d+$/.exec(String(h ?? ''))?.[1])
    .filter((x): x is string => !!x)
    .map(Number))]
  const nombres: string[] = []
  let ajenos = false
  for (const id of ids) {
    const t = misTests.find(x => x.id === id)
    if (t) nombres.push(t.nombre)
    else ajenos = true
  }
  return { nombres, ajenos }
}

/**
 * Por qué no se puede mandar algo, o null si se puede. Son las mismas reglas
 * que pone la base al enviar (envio_plantilla_limpia, enviar_a_entrenador):
 * aquí se dicen ANTES, con el botón apagado, en vez de después de pulsar.
 */
export function motivoNoSeManda(
  q:
    | { tipo: 'plantilla'; disciplina: string | null | undefined; bloques: unknown }
    | { tipo: 'test' }
    | { tipo: 'zonas'; zonas: number; testsAjenos: boolean },
): string | null {
  if (q.tipo === 'plantilla') {
    if (!DISCIPLINAS_PLANTILLA.includes(String(q.disciplina ?? ''))) return 'Solo se mandan plantillas de natación, ciclismo o carrera'
    if (!Array.isArray(q.bloques) || q.bloques.length === 0) return 'No tiene bloques que mandar'
    return null
  }
  if (q.tipo === 'zonas') {
    if (q.zonas === 0) return 'Todavía no tiene zonas'
    if (q.testsAjenos) return 'Sale de un test que no es tuyo: solo se mandan las que salen de tus tests o de los de la app'
  }
  return null
}

/** Si el nombre casa con lo que se busca: sin tildes ni mayúsculas. */
export const casaConBusqueda = (nombre: string | null | undefined, busqueda: string | null | undefined): boolean =>
  !String(busqueda ?? '').trim() || normalizar(nombre).includes(normalizar(busqueda))

// ------------------------------------------------------------
// Las llamadas a la base
// ------------------------------------------------------------

/** El error con palabras de entrenador. Si falta la migración, se dice cuál. */
export function errorDeEnvio(error: { code?: string; message?: string } | null | undefined): string {
  const m = String(error?.message || '')
  if (error?.code === 'PGRST202' || /could not find the function/i.test(m)) {
    return 'Falta aplicar supabase/envios-entrenadores.sql en la base de datos.'
  }
  if (error?.code === 'PGRST205' || error?.code === '42P01' || (/envio_entrenador/.test(m) && /does not exist|schema cache/i.test(m))) {
    return 'Falta aplicar supabase/envios-entrenadores.sql en la base de datos.'
  }
  return m || 'No se ha podido.'
}

/** Si el error es que la tabla aún no existe: entonces el aviso no se pinta. */
export const faltaLaTabla = (error: { code?: string; message?: string } | null | undefined): boolean =>
  !!error && (error.code === 'PGRST205' || error.code === '42P01' || /envio_entrenador/.test(String(error.message || '')))

/** Busca a un entrenador por su correo exacto. null = no hay ninguno. */
export async function buscarEntrenador(sb: any, correo: string): Promise<{ entrenador: { id: string; nombre: string } | null; error: string | null }> {
  const { data, error } = await sb.rpc('envio_buscar_entrenador', { _email: correo.trim() })
  if (error) return { entrenador: null, error: errorDeEnvio(error) }
  const fila = Array.isArray(data) ? data[0] : null
  return { entrenador: fila ? { id: String(fila.id), nombre: String(fila.nombre || 'Sin nombre') } : null, error: null }
}

export type QueSeEnvia =
  | { tipo: 'plantilla'; plantilla: ReturnType<typeof plantillaParaEnviar> }
  | { tipo: 'test' | 'zonas'; id: number }

/** Lo manda. Devuelve el id del envío o el error. */
export async function enviar(sb: any, para: string, que: QueSeEnvia, mensaje?: string | null): Promise<{ id: number | null; error: string | null }> {
  const { data, error } = await sb.rpc('enviar_a_entrenador', {
    _para: para,
    _tipo: que.tipo,
    _id: que.tipo === 'plantilla' ? null : que.id,
    _plantilla: que.tipo === 'plantilla' ? que.plantilla : null,
    _mensaje: mensaje?.trim() || null,
  })
  if (error) return { id: null, error: errorDeEnvio(error) }
  return { id: Number(data), error: null }
}

export interface NombresAlAceptar {
  plantilla?: string
  clasificacion?: string
  tests?: Record<string, string>
}

/** Acepta (crea las copias) o rechaza. */
export async function contestar(sb: any, id: number, aceptar: boolean, nombres?: NombresAlAceptar): Promise<{ resultado: (ResultadoEnvio & { estado?: string; reusados?: number[] }) | null; error: string | null }> {
  const { data, error } = await sb.rpc('contestar_envio', { _id: id, _aceptar: aceptar, _nombres: nombres ?? {} })
  if (error) return { resultado: null, error: errorDeEnvio(error) }
  return { resultado: (data || {}) as ResultadoEnvio & { estado?: string; reusados?: number[] }, error: null }
}

/** Lo cancela quien lo mandó, mientras nadie ha contestado. */
export async function cancelar(sb: any, id: number): Promise<string | null> {
  const { error } = await sb.rpc('cancelar_envio', { _id: id })
  return error ? errorDeEnvio(error) : null
}

/** Quien lo mandó ya ha visto la respuesta: se va su aviso del panel. */
export async function marcarRespuestasVistas(sb: any, ids: number[]): Promise<string | null> {
  if (!ids.length) return null
  const { error } = await sb.rpc('envio_respuesta_vista', { _ids: ids })
  return error ? errorDeEnvio(error) : null
}
