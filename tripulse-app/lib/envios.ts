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
//
// FASE 2, EL TRASPASO (supabase/envios-traspaso.sql): un deportista NO se
// copia, pasa a la lista del otro con todo su historial. Contesta el entrenador
// que lo recibe y, si el deportista tiene cuenta, también él; lo hace el último
// que acepta. Si se marca «lo tuyo que usa», van con él copias de los tests y
// las zonas de quien lo pasa que usa ese deportista.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { BloqueP } from './plantillas-tipos'
import { cargaZona } from './zonas'
import { zonaPico } from './plantillas-propias'
import { normalizar } from './buscar-ejercicio'

/** «varios»: plantillas, tests y zonas en un mismo envío (supabase/envios-varios.sql).
 *  «deportista»: un traspaso (supabase/envios-traspaso.sql). */
export type TipoEnvio = 'plantilla' | 'test' | 'zonas' | 'varios' | 'deportista'
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

/** Una plantilla tal como viaja. */
export interface PlantillaEnviada {
  nombre: string
  disciplina: string
  zona?: string
  objetivo?: string | null
  bloques: BloqueP[]
}

/** Unas zonas tal como viajan en unos «varios» o un traspaso: su clasificación y sus zonas. */
export interface ZonasEnviadas {
  /** En un traspaso: la clasificación de la que son copia. */
  origen?: number
  clasificacion: { nombre: string; deporte: string; hitos: string[] }
  zonas: ZonaEnviada[]
}

/** El deportista de un traspaso, tal como era al pedirlo. */
export interface DeportistaEnviado {
  id: number
  nombre: string
  tiene_cuenta: boolean
  solo_test: boolean
}

/** Un ejercicio de tu biblioteca, tal como viaja en un traspaso (supabase/envios-traspaso-ejercicios.sql). */
export interface EjercicioEnviado {
  id: number
  nombre: string
  grupo_muscular?: string | null
  url_video?: string | null
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
  /* varios (los tests van en `tests`, como siempre) */
  plantillas?: PlantillaEnviada[]
  clasificaciones?: ZonasEnviadas[]
  /* deportista: lo que usa viaja en `tests`, `clasificaciones` y `ejercicios` */
  deportista?: DeportistaEnviado
  con_lo_suyo?: boolean
  ejercicios?: EjercicioEnviado[]
}

export interface ResultadoEnvio {
  plantilla?: number
  clasificacion?: number
  /** En unos «varios», en el orden en que venían. */
  plantillas?: number[]
  clasificaciones?: number[]
  /** Del id del test original al de la copia de quien aceptó. */
  tests?: Record<string, number>
  /** En un traspaso: el deportista que pasó. */
  deportista?: number
  /** En un traspaso: del id del ejercicio original al de su copia. */
  ejercicios?: Record<string, number>
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
  /* Solo en un traspaso. */
  id_deportista?: number | null
  /** Su cuenta, si la tiene: entonces contesta también él. */
  deportista_usuario?: string | null
  acepta_entrenador_en?: string | null
  acepta_deportista_en?: string | null
  /** Quién dijo que no. */
  rechaza?: 'entrenador' | 'deportista' | null
  /** Quien lo recibe ya ha visto en qué quedó (null = le queda el aviso). */
  aviso_para_visto_en?: string | null
}

/** Las columnas que piden las pantallas, escritas UNA vez. En una sola línea:
 *  partida en trozos, el cliente de la base ya no sabe leerla. */
export const COLUMNAS_ENVIO =
  'id, de, para, tipo, titulo, contenido, mensaje, de_nombre, para_nombre, para_correo, estado, resultado, creado_en, contestado_en, respuesta_vista_en, id_deportista, deportista_usuario, acepta_entrenador_en, acepta_deportista_en, rechaza, aviso_para_visto_en'

/** Cuántas cosas caben en unos «varios», como mucho (lo mismo que dice la base). */
export const MAX_VARIOS = 30

/** Las disciplinas que tienen plantillas (las mismas que el editor de sesión). */
export const DISCIPLINAS_PLANTILLA = ['Natacion', 'Ciclismo', 'Carrera']

// ------------------------------------------------------------
// Textos
// ------------------------------------------------------------

/** Cómo se llama lo que se manda. Unas zonas que salen de la app no llevan test. */
export function etiquetaTipo(e: Pick<Envio, 'tipo' | 'contenido'>): string {
  if (e.tipo === 'plantilla') return 'Plantilla'
  if (e.tipo === 'test') return 'Test'
  if (e.tipo === 'varios') return 'Varios'
  if (e.tipo === 'deportista') return 'Deportista'
  return (e.contenido?.tests?.length ?? 0) > 0 ? 'Zonas y test' : 'Zonas'
}

/** Lo que viaja y lo que no, para decirlo antes de pulsar «Enviar». En un
 *  traspaso, `otro` es quien lo recibe (para decir quién empieza de cero). */
export function queViaja(tipo: TipoEnvio, otro?: string | null): { viaja: string[]; noViaja: string[] } {
  if (tipo === 'deportista') return {
    viaja: ['Su historial: sesiones hechas, tests, wellness y lo de su reloj', 'Su plan y su calendario'],
    noViaja: [
      'Tus cobros: siguen en tu libreta',
      'Vuestros mensajes: ' + (primerNombre(otro) || 'su nuevo entrenador') + ' empieza de cero',
      'Tus grupos: sale de ellos',
    ],
  }
  if (tipo === 'plantilla') return {
    viaja: ['Los bloques: zona, series, volumen y descanso', 'El nombre y, si lo tiene, el objetivo'],
    noViaja: ['A quién se la pusiste ni cuándo', 'Lo que hizo tu deportista: tiempos, RPE, comentarios', 'Tus notas de la sesión'],
  }
  if (tipo === 'test') return {
    viaja: ['Los campos, las fórmulas y los resultados', 'Qué resultado sirve para las zonas'],
    noViaja: ['Las mediciones de tus deportistas'],
  }
  if (tipo === 'varios') return {
    viaja: ['Cada cosa entera: los bloques, los campos y las fórmulas, las zonas', 'Los tests de los que salen las zonas, enganchados a ellas'],
    noViaja: ['Las mediciones de tus deportistas', 'Lo que hizo tu deportista: tiempos, RPE, comentarios', 'Lo que ajustaste a cada deportista'],
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
  if (e.tipo === 'deportista') {
    const c = e.contenido || {}
    const nombre = primerNombre(c.deportista?.nombre)
    const suyo = [
      (c.tests?.length ?? 0) > 0 ? 'tus Tests propios' : '',
      (c.clasificaciones?.length ?? 0) > 0 ? 'tus Zonas propias' : '',
      (c.ejercicios?.length ?? 0) > 0 ? 'tu biblioteca de ejercicios' : '',
    ].filter(Boolean)
    return (nombre ? nombre + ' ya está' : 'Ya está') + (c.deportista?.solo_test ? ' en tus Evaluados.' : ' en tu lista de deportistas.')
      + (suyo.length ? ' Lo que usaba te ha llegado a ' + listaY(suyo) + '.' : '')
  }
  if (e.tipo === 'varios') {
    const c = e.contenido || {}
    const donde = [
      (c.plantillas?.length ?? 0) > 0 ? 'tus plantillas' : '',
      (c.tests?.length ?? 0) > 0 ? 'tus Tests propios' : '',
      (c.clasificaciones?.length ?? 0) > 0 ? 'tus Zonas propias' : '',
    ].filter(Boolean)
    return 'Está en ' + listaY(donde) + '.'
  }
  return (e.contenido?.tests?.length ?? 0) > 0
    ? 'Está en tus Zonas propias, y su test en tus Tests propios.'
    : 'Está en tus Zonas propias.'
}

/** «a», «a y b», «a, b y c». */
export function listaY(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]
}

/** Lo que lleva unos «varios», contado: «1 test, 1 clasificación de zonas y 2 plantillas». */
export function resumenVarios(c: { tests?: unknown[] | null; clasificaciones?: unknown[] | null; plantillas?: unknown[] | null } | null | undefined): string {
  const n = (k: number, uno: string, varios: string) => k ? k + ' ' + (k === 1 ? uno : varios) : ''
  return listaY([
    n(c?.tests?.length ?? 0, 'test', 'tests'),
    n(c?.clasificaciones?.length ?? 0, 'clasificación de zonas', 'clasificaciones de zonas'),
    n(c?.plantillas?.length ?? 0, 'plantilla', 'plantillas'),
  ].filter(Boolean)) || 'nada'
}

/**
 * Las zonas que salen de un test: las clasificaciones que lo usan de hito.
 * Para ofrecer «mandar también sus zonas» al mandar un test.
 */
export function zonasDeTest<T extends { hitos: string[] | null | undefined }>(idTest: number, clasificaciones: T[]): T[] {
  const prefijo = 'propia:' + idTest + ':'
  return clasificaciones.filter(c => (c.hitos || []).some(h => String(h ?? '').startsWith(prefijo)))
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

/** Lo que hace falta para contar un envío (los campos del traspaso, si los hay). */
export type EnvioContado = Pick<Envio, 'estado' | 'para_nombre' | 'de_nombre'>
  & Partial<Pick<Envio, 'tipo' | 'contenido' | 'rechaza' | 'deportista_usuario' | 'acepta_entrenador_en' | 'acepta_deportista_en'>>

/** El estado contado a quien lo recibe o a quien lo mandó. */
export function textoEstado(e: EnvioContado, papel: 'recibe' | 'manda'): string {
  if (e.tipo === 'deportista') return textoTraspaso(e, papel)
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

/** El color de un estado: lo que pide atención, en ámbar. */
export type TonoEstado = 'ambar' | 'bien' | 'rojo' | 'neutro'

/** El chip de un envío en las listas. */
export function chipEstado(e: EnvioContado, papel: 'recibe' | 'manda'): { texto: string; tono: TonoEstado } {
  if (e.tipo === 'deportista') {
    const f = faseTraspaso(e)
    const dep = primerNombre(e.contenido?.deportista?.nombre) || 'el deportista'
    const para = primerNombre(e.para_nombre) || 'el entrenador'
    if (f === 'falta-deportista') return { texto: 'Falta ' + dep, tono: 'ambar' }
    if (f === 'falta-entrenador') return { texto: papel === 'recibe' ? 'Por revisar' : 'Falta ' + para, tono: 'ambar' }
    if (f === 'rechazado' && e.rechaza === 'deportista') return { texto: mayuscula(dep) + ' dijo que no', tono: 'rojo' }
  }
  if (e.estado === 'pendiente') return { texto: papel === 'recibe' ? 'Por revisar' : 'Sin contestar', tono: 'ambar' }
  if (e.estado === 'aceptado') return { texto: 'Aceptado', tono: 'bien' }
  if (e.estado === 'rechazado') return { texto: 'Rechazado', tono: 'rojo' }
  return { texto: 'Cancelado', tono: 'neutro' }
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ------------------------------------------------------------
// El traspaso de un deportista (fase 2)
// ------------------------------------------------------------

/** En qué va un traspaso: tiene dos respuestas, la del entrenador que lo
 *  recibe y, si el deportista tiene cuenta, la suya. */
export type FaseTraspaso = 'pendiente' | 'falta-deportista' | 'falta-entrenador' | 'aceptado' | 'rechazado' | 'cancelado'

export function faseTraspaso(e: Pick<EnvioContado, 'estado' | 'deportista_usuario' | 'acepta_entrenador_en' | 'acepta_deportista_en'>): FaseTraspaso {
  if (e.estado !== 'pendiente') return e.estado
  if (e.acepta_entrenador_en && !e.acepta_deportista_en && e.deportista_usuario) return 'falta-deportista'
  if (e.acepta_deportista_en && !e.acepta_entrenador_en) return 'falta-entrenador'
  return 'pendiente'
}

/** Si a quien lo recibe le toca contestar: un traspaso que ya aceptó, no. */
export function puedoContestar(e: Pick<Envio, 'estado' | 'tipo'> & Pick<EnvioContado, 'acepta_entrenador_en'>): boolean {
  return e.estado === 'pendiente' && !(e.tipo === 'deportista' && e.acepta_entrenador_en)
}

/** Un traspaso contado a quien lo recibe o a quien lo pidió (como la maqueta). */
function textoTraspaso(e: EnvioContado, papel: 'recibe' | 'manda'): string {
  const f = faseTraspaso(e)
  const dep = primerNombre(e.contenido?.deportista?.nombre) || 'el deportista'
  const de = primerNombre(e.de_nombre) || 'su entrenador'
  const para = primerNombre(e.para_nombre) || 'el otro entrenador'
  if (papel === 'recibe') {
    if (f === 'pendiente') return 'Por revisar'
    if (f === 'falta-entrenador') return mayuscula(dep) + ' ya ha dicho que sí: falta que contestes tú'
    if (f === 'falta-deportista') return 'Falta que conteste ' + dep + '. Hasta entonces sigue con ' + de
    if (f === 'aceptado') return mayuscula(dep) + (e.contenido?.deportista?.solo_test ? ' ya está en tus Evaluados' : ' ya está en tu lista')
    if (f === 'rechazado') return e.rechaza === 'deportista' ? mayuscula(dep) + ' prefiere seguir con ' + de + ': no cambia nada' : 'Lo rechazaste: no cambia nada'
    return mayuscula(de) + ' lo canceló'
  }
  if (f === 'pendiente') return e.deportista_usuario ? 'Esperando a ' + para + ' y a ' + dep : mayuscula(para) + ' todavía no ha contestado'
  if (f === 'falta-deportista') return mayuscula(para) + ' lo ha aceptado. Falta que conteste ' + dep
  if (f === 'falta-entrenador') return mayuscula(dep) + ' lo ha aceptado. Falta que conteste ' + para
  if (f === 'aceptado') return mayuscula(dep) + ' ya está con ' + para
  if (f === 'rechazado') return e.rechaza === 'deportista' ? mayuscula(dep) + ' prefiere seguir contigo' : mayuscula(para) + ' lo ha rechazado'
  return 'Lo cancelaste'
}

/** Lo que se le dice a quien acaba de contestar un traspaso. */
export function traspasoContestado(
  e: Pick<Envio, 'de_nombre' | 'contenido' | 'tipo'>,
  aceptar: boolean,
  r: { estado?: string; motivo?: string } | null | undefined,
): string {
  const dep = primerNombre(e.contenido?.deportista?.nombre) || 'El deportista'
  const de = primerNombre(e.de_nombre) || 'su entrenador'
  if (!aceptar) return 'Rechazado: ' + dep + ' sigue con ' + de + '.'
  if (r?.estado === 'cancelado') return 'Ya no se puede: ' + (r.motivo || 'el traspaso se ha cancelado').replace(/\.$/, '') + '.'
  if (r?.estado === 'pendiente') return 'Aceptado. Falta que conteste ' + dep + ': hasta entonces sigue con ' + de + '.'
  return 'Aceptado. ' + dondeQueda(e)
}

/**
 * El aviso a quien recibe un traspaso de en qué quedó, cuando lo cerró otro:
 * el deportista (aceptando el último o diciendo que no) o quien lo pidió
 * (cancelándolo). La base solo deja el aviso pendiente en esos casos
 * (supabase/envios-traspaso-aviso.sql); aquí se cuenta.
 */
export function avisoParaQuienRecibe(
  e: Pick<Envio, 'tipo' | 'estado' | 'contenido' | 'de_nombre'> & Pick<EnvioContado, 'rechaza'>,
): { texto: string; bien: boolean } | null {
  if (e.tipo !== 'deportista') return null
  const dep = primerNombre(e.contenido?.deportista?.nombre) || 'El deportista'
  const de = primerNombre(e.de_nombre) || 'su entrenador'
  if (e.estado === 'aceptado') return { texto: dep + ' ha aceptado: ya está en ' + (e.contenido?.deportista?.solo_test ? 'tus Evaluados.' : 'tu lista.'), bien: true }
  if (e.estado === 'rechazado') return { texto: dep + ' prefiere seguir con ' + de + ': el traspaso no sigue.', bien: false }
  if (e.estado === 'cancelado') return { texto: 'El traspaso de ' + dep + ' se ha cancelado: no cambia nada para ti.', bien: false }
  return null
}

/** Tu cupo, para decirlo antes de aceptar un traspaso. `lleno` apaga «Aceptar». */
export function textoCupo(c: { cupo: number | null; tengo: number } | null | undefined): { texto: string; lleno: boolean } | null {
  if (!c || c.cupo == null) return null
  const libres = c.cupo - c.tengo - 1
  if (libres < 0) return { texto: 'Tu cupo está lleno (' + c.tengo + ' de ' + c.cupo + ' deportistas): para aceptarlo tienes que hacer sitio.', lleno: true }
  return {
    texto: 'Ocupa un sitio de tu cupo: ' + (libres === 0 ? 'no te quedaría ninguno libre.' : 'te quedaría' + (libres === 1 ? ' 1 libre.' : 'n ' + libres + ' libres.')),
    lleno: false,
  }
}

/** Lo que hace falta para saber qué usa un deportista de lo tuyo. */
export interface LoQueUsaEntrada {
  /** Todos tus tests, también los archivados (la base los manda igual). */
  misTests: { id: number; nombre: string }[]
  /** Tus clasificaciones sin archivar, en su orden. */
  misClasificaciones: { id: number; nombre: string; hitos: string[] | null }[]
  /** Tus zonas, también las archivadas (un ajuste puede estar en una). */
  misZonas: { id: number; id_clasificacion: number | null; ref_definicion: number | null; desde: LimiteEnviado | null; hasta: LimiteEnviado | null; archivada?: boolean | null }[]
  /** Del deportista: sus mediciones, sus ajustes de zona y sus sesiones con test. */
  mediciones: { id_definicion: number }[]
  ajustes: { id_zona: number; desde: LimiteEnviado | null; hasta: LimiteEnviado | null }[]
  sesiones: { test: unknown }[]
  /** Tus ejercicios de la biblioteca (los tuyos: ni los del común ni los de un deportista). */
  misEjercicios?: { id: number; nombre: string }[]
  /** Del deportista: los ejercicios de sus sesiones (fuerza, encadenado) y de sus tareas (técnica, saltos). */
  usosDeEjercicios?: { ejercicio_id?: number | null; ejercicio_encadenado_id?: number | null; tecnica_id?: number | null }[]
}

const idDeHito = (ref: unknown): number | null => {
  const m = /^propia:(\d+):\d+$/.exec(String(ref ?? ''))
  return m ? Number(m[1]) : null
}

/** Lo tuyo que va con un deportista si marcas la casilla. */
export interface LoQueUsa {
  tests: { id: number; nombre: string }[]
  zonas: { id: number; nombre: string }[]
  ejercicios: { id: number; nombre: string }[]
}

/**
 * Lo tuyo que usa un deportista: lo que va con él si marcas «mandar también lo
 * tuyo». ES LA MISMA REGLA QUE pedir_traspaso: tus tests con mediciones suyas,
 * en sus ajustes de zona o en sus días de test; tus zonas que salen de ellos o
 * en las que tiene ajustes, con los tests de los que salen; y los ejercicios de
 * tu biblioteca que tiene en sus sesiones. Unas zonas sin zonas, o que salen de
 * un test que no es tuyo, se quedan (como en la base).
 */
export function loQueUsa(x: LoQueUsaEntrada): LoQueUsa {
  const mios = new Map(x.misTests.map(t => [Number(t.id), t]))
  const usados = new Set<number>()
  const usar = (id: number | null) => { if (id != null && mios.has(id)) usados.add(id) }
  x.mediciones.forEach(m => usar(Number(m.id_definicion)))
  x.ajustes.forEach(a => { usar(idDeHito(a.desde?.ref)); usar(idDeHito(a.hasta?.ref)) })
  x.sesiones.forEach(s => {
    const t = s.test as { origen?: unknown; id?: unknown } | null
    if (t && typeof t === 'object' && t.origen === 'propio' && Number.isFinite(Number(t.id))) usar(Number(t.id))
  })

  const conAjuste = new Set(x.ajustes
    .map(a => x.misZonas.find(z => z.id === a.id_zona)?.id_clasificacion)
    .filter((c): c is number => c != null))
  const tests = new Set(usados)
  const zonas: { id: number; nombre: string }[] = []
  for (const c of x.misClasificaciones) {
    const suyas = x.misZonas.filter(z => z.id_clasificacion === c.id && !z.archivada)
    const refs = [
      ...(c.hitos || []).map(idDeHito),
      ...suyas.flatMap(z => [idDeHito(z.desde?.ref), idDeHito(z.hasta?.ref), z.ref_definicion]),
    ].filter((n): n is number => n != null)
    if (!refs.some(id => usados.has(id)) && !conAjuste.has(c.id)) continue
    if (!suyas.length || refs.some(id => !mios.has(id))) continue
    zonas.push({ id: c.id, nombre: c.nombre })
    refs.forEach(id => tests.add(id))
  }

  /* Los ejercicios de tu biblioteca que tiene en sus sesiones. */
  const misEjercicios = new Map((x.misEjercicios || []).map(e => [Number(e.id), e]))
  const ejercicios = new Set<number>()
  for (const u of x.usosDeEjercicios || []) {
    for (const id of [u.ejercicio_id, u.ejercicio_encadenado_id, u.tecnica_id]) {
      if (id != null && misEjercicios.has(Number(id))) ejercicios.add(Number(id))
    }
  }
  return {
    tests: [...tests].sort((a, b) => a - b).map(id => mios.get(id)!),
    zonas,
    ejercicios: [...ejercicios].map(id => misEjercicios.get(id)!)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id),
  }
}

/** «El test «30-15 IFT», las zonas «Zonas 30-15» y 2 ejercicios tuyos («A» y «B»)». */
export function textoLoQueUsa(l: { tests: { nombre: string }[]; zonas: { nombre: string }[]; ejercicios?: { nombre: string }[] }): string {
  const q = (xs: { nombre: string }[]) => listaY(xs.map(x => '«' + x.nombre + '»'))
  const ejs = l.ejercicios || []
  /* Los ejercicios pueden ser muchos: se nombran tres y se cuentan los demás. */
  const nombres = ejs.slice(0, 3).map(e => '«' + e.nombre + '»')
  if (ejs.length > 3) nombres.push((ejs.length - 3) + ' más')
  const texto = listaY([
    l.tests.length ? (l.tests.length === 1 ? 'el test ' : 'los tests ') + q(l.tests) : '',
    l.zonas.length ? 'las zonas ' + q(l.zonas) : '',
    ejs.length ? (ejs.length === 1 ? 'un ejercicio tuyo' : ejs.length + ' ejercicios tuyos') + ' (' + listaY(nombres) + ')' : '',
  ].filter(Boolean))
  return mayuscula(texto)
}

/** Lo que no tendrá quien lo recibe si no se marca la casilla, para decirlo al lado. */
export function sinLoSuyo(l: { tests: unknown[]; zonas: unknown[]; ejercicios?: unknown[] }, otro: string): string {
  const pierde = [
    l.tests.length ? 'no podrá apuntarle mediciones nuevas con esos tests' : '',
    l.zonas.length ? 'no podrá usar esas zonas' : '',
    (l.ejercicios || []).length ? 'verá sus sesiones sin el vídeo ni la técnica de esos ejercicios' : '',
  ].filter(Boolean)
  return pierde.length ? 'Si no, ' + otro + ' ' + listaY(pierde) + '.' : ''
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
  /** En unos «varios», por su posición: el nombre propuesto si choca. */
  plantillas: Record<string, string>
  clasificaciones: Record<string, string>
  /** Por id del test original: el nombre propuesto si choca. */
  tests: Record<string, string>
  /** Tests que ya tiene de un envío anterior: se usará ese si no ha cambiado. */
  yaLosTiene: string[]
}

/**
 * Qué nombres chocarían al aceptar y qué nombre se propone para cada uno. Un
 * test que ya llegó en otro envío del mismo entrenador no choca: si no ha
 * cambiado, la base usa esa copia (y si ha cambiado, le pone el «(Ana)»).
 *
 * En unos «varios» se cuenta lo que se va creando, como hace la base al
 * aceptar: dos plantillas con el mismo nombre en el mismo envío también
 * chocan entre ellas, y la segunda sale con su «(Ana)».
 */
export function conflictosDe(e: Pick<Envio, 'tipo' | 'contenido' | 'de_nombre'>, mio: LoQueTengo): Conflictos {
  const out: Conflictos = { plantilla: null, clasificacion: null, plantillas: {}, clasificaciones: {}, tests: {}, yaLosTiene: [] }
  const c = e.contenido || {}
  const misTests = mio.tests.map(t => t.nombre)
  const igual = (a: string, b: string | null | undefined) => a === String(b ?? '').trim().slice(0, 80)
  for (const t of c.tests || []) {
    const previa = mio.copiasPrevias[String(t.id)]
    if (previa && mio.tests.some(x => x.id === previa)) { out.yaLosTiene.push(String(t.id)); continue }
    const libre = nombreLibre(t.nombre, misTests, e.de_nombre)
    if (!igual(libre, t.nombre)) out.tests[String(t.id)] = libre
    misTests.push(libre)
  }
  if (e.tipo === 'varios') {
    const usadas: Record<string, string[]> = Object.fromEntries(Object.entries(mio.plantillas).map(([d, ns]) => [d, [...ns]]))
    ;(c.plantillas || []).forEach((p, i) => {
      const lista = (usadas[p.disciplina] ||= [])
      const libre = nombreLibre(p.nombre, lista, e.de_nombre)
      if (!igual(libre, p.nombre)) out.plantillas[String(i)] = libre
      lista.push(libre)
    })
    const clas = [...mio.clasificaciones]
    ;(c.clasificaciones || []).forEach((z, i) => {
      const libre = nombreLibre(z.clasificacion?.nombre, clas, e.de_nombre)
      if (!igual(libre, z.clasificacion?.nombre)) out.clasificaciones[String(i)] = libre
      clas.push(libre)
    })
    return out
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
    return /aviso_visto/.test(m)
      ? 'Falta aplicar supabase/envios-traspaso-aviso.sql en la base de datos.'
      : /traspaso|tiene_sitio/.test(m)
        ? 'Falta aplicar supabase/envios-traspaso.sql en la base de datos.'
        : 'Falta aplicar supabase/envios-entrenadores.sql en la base de datos.'
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
  /** En unos «varios», por su posición. */
  plantillas?: Record<string, string>
  clasificaciones?: Record<string, string>
  tests?: Record<string, string>
}

/** Acepta (crea las copias) o rechaza. */
export async function contestar(sb: any, id: number, aceptar: boolean, nombres?: NombresAlAceptar): Promise<{ resultado: (ResultadoEnvio & { estado?: string; reusados?: number[] }) | null; error: string | null }> {
  const { data, error } = await sb.rpc('contestar_envio', { _id: id, _aceptar: aceptar, _nombres: nombres ?? {} })
  if (error) return { resultado: null, error: errorDeEnvio(error) }
  return { resultado: (data || {}) as ResultadoEnvio & { estado?: string; reusados?: number[] }, error: null }
}

/** Manda varias cosas en un solo envío: a quien lo recibe le llega todo junto. */
export async function enviarVarios(
  sb: any, para: string,
  que: { plantillas: ReturnType<typeof plantillaParaEnviar>[]; tests: number[]; clasificaciones: number[] },
  mensaje?: string | null,
): Promise<{ id: number | null; error: string | null }> {
  const { data, error } = await sb.rpc('enviar_varios_a_entrenador', {
    _para: para,
    _plantillas: que.plantillas,
    _tests: que.tests,
    _clasificaciones: que.clasificaciones,
    _mensaje: mensaje?.trim() || null,
  })
  if (error) return { id: null, error: errorDeEnvio(error) }
  return { id: Number(data), error: null }
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

/** Quien recibió un traspaso ya ha visto en qué quedó: se va su aviso del panel. */
export async function marcarAvisosVistos(sb: any, ids: number[]): Promise<string | null> {
  if (!ids.length) return null
  const { error } = await sb.rpc('envio_aviso_visto', { _ids: ids })
  return error ? errorDeEnvio(error) : null
}

/** Pide pasar un deportista tuyo a otro entrenador. Devuelve el id del envío. */
export async function pedirTraspaso(
  sb: any, para: string, idDeportista: number, conLoSuyo: boolean, mensaje?: string | null,
): Promise<{ id: number | null; error: string | null }> {
  const { data, error } = await sb.rpc('pedir_traspaso', {
    _para: para, _id_deportista: idDeportista, _con_lo_suyo: conLoSuyo, _mensaje: mensaje?.trim() || null,
  })
  if (error) return { id: null, error: errorDeEnvio(error) }
  return { id: Number(data), error: null }
}

/** Si ese entrenador tiene sitio en su cupo. Solo eso: cuántos tiene no se dice. null = no se sabe. */
export async function entrenadorTieneSitio(sb: any, para: string): Promise<boolean | null> {
  const { data, error } = await sb.rpc('entrenador_tiene_sitio', { _para: para })
  return error || typeof data !== 'boolean' ? null : data
}

/** Lo que tiene que contestar el deportista: quién lo pide y a quién pasaría. */
export interface TraspasoPendiente {
  id: number
  de_nombre: string | null
  para_nombre: string | null
  mensaje: string | null
  creado_en: string
  /** Ya dijo que sí: falta el entrenador. */
  ya_acepte: boolean
}

export async function misTraspasosPendientes(sb: any): Promise<{ traspasos: TraspasoPendiente[]; error: string | null }> {
  const { data, error } = await sb.rpc('mis_traspasos_pendientes')
  if (error) return { traspasos: [], error: errorDeEnvio(error) }
  return {
    traspasos: (Array.isArray(data) ? data : []).map((t: any) => ({
      id: Number(t.id), de_nombre: t.de_nombre ?? null, para_nombre: t.para_nombre ?? null,
      mensaje: t.mensaje ?? null, creado_en: String(t.creado_en ?? ''), ya_acepte: !!t.ya_acepte,
    })),
    error: null,
  }
}

/** El deportista contesta su traspaso. Si es el último en aceptar, se hace. */
export async function contestarTraspasoDeportista(
  sb: any, id: number, aceptar: boolean,
): Promise<{ resultado: { estado?: string; falta?: string; motivo?: string } | null; error: string | null }> {
  const { data, error } = await sb.rpc('contestar_traspaso_deportista', { _id: id, _aceptar: aceptar })
  if (error) return { resultado: null, error: errorDeEnvio(error) }
  return { resultado: (data || {}) as { estado?: string; falta?: string; motivo?: string }, error: null }
}

/** Lo tuyo que usa un deportista, mirado en la base (lo que dice loQueUsa).
 *  Sus sesiones no se suman: se mira cuáles son día de test, y cuentan también
 *  las de la papelera (`eliminada`), porque la base las reenlaza todas. */
export async function cargarLoQueUsa(sb: any, yo: string, idDeportista: number): Promise<ReturnType<typeof loQueUsa>> {
  const [ts, cs, zs, ms, aj, ss, eb, ej, ta] = await Promise.all([
    sb.from('test_definicion').select('id, nombre').eq('id_entrenador', yo),
    sb.from('zona_clasificacion').select('id, nombre, hitos').eq('id_entrenador', yo).eq('archivada', false).order('orden'),
    sb.from('zona_entrenador').select('id, id_clasificacion, ref_definicion, desde, hasta, archivada').eq('id_entrenador', yo),
    sb.from('test_medicion').select('id_definicion').eq('id_deportista', idDeportista),
    sb.from('zona_ajuste').select('id_zona, desde, hasta').eq('id_deportista', idDeportista),
    sb.from('sesion').select('test').eq('id_deportista', idDeportista).not('test', 'is', null),
    /* Los ejercicios de tu biblioteca, y dónde los tiene él: en la fuerza y en la técnica. */
    sb.from('ejercicios_biblioteca').select('id, nombre').eq('id_entrenador', yo).is('id_deportista', null),
    sb.from('ejercicios').select('ejercicio_id, ejercicio_encadenado_id').eq('id_deportista', idDeportista),
    sb.from('tarea').select('tecnica_id').eq('id_deportista', idDeportista).not('tecnica_id', 'is', null),
  ])
  return loQueUsa({
    misTests: ts.data || [], misClasificaciones: cs.data || [], misZonas: zs.data || [],
    mediciones: ms.data || [], ajustes: aj.data || [], sesiones: ss.data || [],
    misEjercicios: eb.data || [], usosDeEjercicios: [...(ej.data || []), ...(ta.data || [])],
  })
}
