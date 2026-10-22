// ============================================================
// TRIPULSE — El avance en los saltos: qué sube la semana que viene
// ============================================================
//
// Fase 2 de la pliometría. La teoría y la maqueta las validó el usuario el
// 22-10-2026. Parte del NIVEL que pone el entrenador (lib/pliometria-escalon):
// sin nivel no se calcula nada. Cada semana propone UNA cosa, en este orden:
//
//   0. Su deporte. Si corre (carrera, triatlón, duatlón, HYROX), los saltos son
//      importantes. Si solo nada o solo pedalea, no le hacen falta para rendir
//      y no se propone subir nada. El entrenador puede decir lo contrario
//      (`comprobaciones.necesita`): el ciclista que esprinta, el nadador de
//      piscina por sus salidas.
//   1. Frenos: dolor de tendón marcado; menos de 2 días entre sesiones de
//      saltos (3 desde los 40 años); el dolor muscular del wellness 2 puntos o
//      más sobre su mediana de 4 semanas; el CMJ o el RSI por debajo de su base
//      menos un 3 %. Se baja a lo de la semana anterior a la última subida.
//   2. Se mantiene si su última semana subió más de un 20 %, o si su carrera
//      subió más de un 10 % (los saltos también son impacto: Máster, L6.3).
//   3. Volumen: +15 % (+10 % si es principiante o tiene 40 años o más), sin
//      pasar del techo de su nivel ni del tope de la NSCA.
//   4. Nivel: con el volumen en su techo, cumple lo que pide el siguiente y el
//      entrenador confirma que domina el suyo (`comprobaciones.domina`).
//   5. Altura de caída, desde el nivel 3: 10 cm más, hasta 40, si su RSI sube
//      de verdad (sus dos últimos tests por encima de su base más el error).
//
// LOS TESTS CADUCAN A LAS 4 SEMANAS: uno más viejo no frena ni confirma, y se
// avisa de que toca medir. Sin tests, todo funciona menos la altura de caída.
//
// De la base de conocimiento: ejercicios-pliometria-y-velocidad (niveles,
// 48-72 h), metodos-tests-y-pliometria (≤10-20 % por semana, RSI y CMJ como
// marcadores de fatiga), nsca-essentials-sc-02-pliometria (contactos por
// nivel, 3-4 días en máster), Motricidad 04 (CMJ cada 2-4 semanas) y 12 (a quién
// le sirve), las fichas de ciclismo, natación y triatlón (§4) y el Máster,
// L6.3. SON PROPUESTA, NO UMBRALES VALIDADOS: el 10 % para principiante o
// máster, volver a la semana anterior a la subida (o un 20 % menos si no la
// hubo), los 10 cm, la caducidad de 4 semanas y el 10 % de la carrera.
//
// Sin Supabase: lo que lee la base está en lib/pliometria-avance-datos.

import { NIVELES_PLIO, peldano, numeroNivel, TOPE_NSCA, type NivelPlio } from './pliometria'
import { CRITERIOS, limiteDe, type Comprobaciones, type DatosApp, type EstadoCriterio } from './pliometria-escalon'
import type { NivelAtleta } from './plan-semana'
import type { Senal } from './senales'
import { sinTildes } from './tecnica'
import { fechaCorta } from './fechas'

export const ERROR_TEST = 0.03
export const SUBIDA_MAX = 0.2
export const CARRERA_MAX = 0.1
export const ALTURA_MAX = 40
export const ALTURA_PASO = 10
export const CADUCA_DIAS = 28
/** Cuánto atrás se mira para la base de un test: los suyos de las 12 semanas anteriores. */
export const DIAS_BASE_TEST = 84
export const SEMANAS_AVANCE = 8

/** El dolor muscular del wellness, de 1 a 7 (app/wellness). */
export const DOLOR_WELLNESS = ['Sin dolor', 'Muy leve', 'Leve', 'Moderado', 'Alto', 'Muy alto', 'Intenso'] as const

export interface PuntoTest { fecha: string; valor: number }

/** Una semana de lunes a domingo. */
export interface SemanaSaltos {
  lunes: string
  /** Sesiones con contactos de pie. */
  sesiones: number
  /** Contactos de pie, también los de un salto propio sin nivel. */
  pies: number
  porNivel: Partial<Record<NivelPlio, number>>
  /** Del tren superior y del tronco: van aparte. */
  lanzamientos: number
  /** Minutos de sus sesiones de carrera. */
  carrera: number
  /** La caída más alta prescrita esa semana, en cm; null si no consta. */
  altura: number | null
}

/** Todo lo que necesita el motor de un deportista. */
export interface EntradaAvance {
  hoy: string
  /** Su nivel del tren inferior: lo pone el entrenador. */
  nivel: NivelPlio | null
  puestoEn: string | null
  comprobaciones: Comprobaciones
  /** Lo de la escalera: el último CMJ y drop jump, el 1RM, el peso, las semanas con fuerza. */
  datos: DatosApp
  experiencia: NivelAtleta | null
  edad: number | null
  /** Las marcadas en su ficha; null o vacío = todas, que es como se guarda «todas». */
  disciplinas: string[] | null
  /** Las de sus sesiones de las últimas semanas. */
  haceEnSesiones: string[]
  /** De la más antigua a la de esta semana. */
  semanas: SemanaSaltos[]
  /** La menor separación entre dos sesiones de saltos de las dos últimas semanas, en días; null con una o ninguna. */
  separacionDias: number | null
  /** El dolor muscular de los dos días siguientes a su última sesión de saltos, y su mediana de 4 semanas. */
  dolor: { despues: number | null; mediana: number | null }
  cmj: PuntoTest[]
  rsi: PuntoTest[]
  /** La fecha de su próxima sesión con saltos, si ya está puesta. */
  proximaSaltos: string | null
}

// ------------------------------------------------------------
// Su deporte
// ------------------------------------------------------------

export type TipoDeporte = 'corre' | 'nada' | 'pedalea' | 'sin-saber'

export interface Importancia {
  tipo: TipoDeporte
  /** De dónde lo sabe la app. */
  fuente: 'disciplinas' | 'sesiones' | null
  ds: string[]
  /** Lo que diría la app por su deporte. */
  segunApp: boolean
  /** Lo que vale: lo que marque el entrenador o, si no, lo de la app. */
  necesita: boolean
  decidido: boolean
}

const hay = (ds: string[], d: string) => ds.some(x => sinTildes(x) === d)

/**
 * Si su deporte necesita los saltos. Corre = carrera, híbrido o brick. Sin
 * saber su deporte, la app hace como si los necesitara: es como funcionaba.
 */
export function importancia(e: Pick<EntradaAvance, 'comprobaciones' | 'disciplinas' | 'haceEnSesiones'>): Importancia {
  const marcadas = (e.disciplinas || []).filter(Boolean)
  let ds: string[] = []
  let fuente: Importancia['fuente'] = null
  if (marcadas.length) { ds = marcadas; fuente = 'disciplinas' }
  else if ((e.haceEnSesiones || []).length) { ds = e.haceEnSesiones; fuente = 'sesiones' }
  let tipo: TipoDeporte = 'sin-saber'
  if (hay(ds, 'carrera') || hay(ds, 'hibrido') || hay(ds, 'brick')) tipo = 'corre'
  else if (hay(ds, 'natacion')) tipo = 'nada'
  else if (hay(ds, 'ciclismo')) tipo = 'pedalea'
  const segunApp = tipo === 'corre' || tipo === 'sin-saber'
  const marcado = e.comprobaciones?.necesita
  return { tipo, fuente, ds, segunApp, necesita: typeof marcado === 'boolean' ? marcado : segunApp, decidido: typeof marcado === 'boolean' }
}

// ------------------------------------------------------------
// Sus tests
// ------------------------------------------------------------

export type EstadoTest = 'sin' | 'caducado' | 'base' | 'cae' | 'mejora' | 'apunta' | 'estable'

export interface Tendencia {
  estado: EstadoTest
  /** La mediana de sus tests anteriores de 12 semanas. */
  base: number | null
  ultimo: PuntoTest | null
  /** El último contra su base. */
  cambio: number | null
  /** Días desde el último. */
  dias: number | null
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(hasta.slice(0, 10) + 'T00:00:00Z') - Date.parse(desde.slice(0, 10) + 'T00:00:00Z')) / 86400000)

export const mediana = (xs: number[]): number | null => {
  const o = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!o.length) return null
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * Cómo va un test. Su base es la mediana de sus tests anteriores de las 12
 * semanas antes del último: un mal día suelto no la mueve. Cae si el último
 * baja de la base menos el error (≈3 %); mejora de verdad si los dos últimos
 * pasan de lo de antes más el error; apunta si solo el último.
 */
export function tendencia(serie: PuntoTest[] | null | undefined, hoy: string): Tendencia {
  const pts = (serie || []).filter(p => p && p.fecha && Number.isFinite(p.valor) && p.valor > 0)
    .slice().sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (!pts.length) return { estado: 'sin', base: null, ultimo: null, cambio: null, dias: null }
  const ultimo = pts[pts.length - 1]
  const previos = pts.slice(0, -1).filter(p => diasEntre(p.fecha, ultimo.fecha) <= DIAS_BASE_TEST)
  const base = mediana(previos.map(p => p.valor))
  const dias = diasEntre(ultimo.fecha, hoy)
  const r = (estado: EstadoTest): Tendencia => ({ estado, base, ultimo, cambio: base ? ultimo.valor / base - 1 : null, dias })
  if (dias > CADUCA_DIAS) return r('caducado')
  if (base == null) return r('base')
  if (ultimo.valor < base * (1 - ERROR_TEST)) return r('cae')
  if (ultimo.valor > base * (1 + ERROR_TEST)) {
    const penultimo = previos[previos.length - 1]
    const antes = mediana(previos.slice(0, -1).map(p => p.valor))
    const dos = antes != null && penultimo.valor > antes * (1 + ERROR_TEST) && ultimo.valor > antes * (1 + ERROR_TEST)
    return r(dos ? 'mejora' : 'apunta')
  }
  return r('estable')
}

export interface AvisoMedir {
  /** La clave del test en la batería (lib/catalogo-tests). */
  test: 'bosco' | 'dropjump'
  nombre: 'el CMJ' | 'el drop jump'
  texto: string
  porque: string
}

/** Los tests que toca hacer: solo con su nivel puesto y si su deporte los necesita. */
export function tocaMedir(e: Pick<EntradaAvance, 'nivel'>, imp: Importancia, cmj: Tendencia, rsi: Tendencia): AvisoMedir[] {
  if (!e.nivel || !imp.necesita) return []
  const out: AvisoMedir[] = []
  const hace = (t: Tendencia) => 'hace ' + Math.floor((t.dias ?? 0) / 7) + ' semanas'
  if (cmj.estado === 'sin') {
    out.push({ test: 'bosco', nombre: 'el CMJ', texto: 'No tiene ningún CMJ.', porque: 'Es su base para ver la fatiga' + (e.nivel === 'a' ? ', y el nivel 2 lo pide.' : '.') })
  } else if (cmj.estado === 'caducado' && cmj.ultimo) {
    out.push({ test: 'bosco', nombre: 'el CMJ', texto: 'Su último CMJ es del ' + fechaCorta(cmj.ultimo.fecha) + ', ' + hace(cmj) + '.', porque: 'Ya no cuenta: sin uno reciente, la app no ve si acumula fatiga.' })
  }
  if (NIVELES_PLIO.indexOf(e.nivel) >= NIVELES_PLIO.indexOf('c')) {
    if (rsi.estado === 'sin') {
      out.push({ test: 'dropjump', nombre: 'el drop jump', texto: 'No tiene ningún drop jump.', porque: 'Desde el nivel 3, sin su RSI no sube la altura de caída.' })
    } else if (rsi.estado === 'caducado' && rsi.ultimo) {
      out.push({ test: 'dropjump', nombre: 'el drop jump', texto: 'Su último drop jump es del ' + fechaCorta(rsi.ultimo.fecha) + ', ' + hace(rsi) + '.', porque: 'Sin uno reciente, la altura de caída no sube.' })
    }
  }
  return out
}

// ------------------------------------------------------------
// El motor
// ------------------------------------------------------------

export type ClaseVeredicto = 'bien' | 'ambar' | 'rojo' | 'neutro' | 'sin-nivel'
export type MarcaCondicion = 'si' | 'no' | 'falta' | 'nada'

export interface Condicion {
  id: string
  m: MarcaCondicion
  bloquea?: boolean
  titulo: string
  texto: string
  /** Para decir lo que falla en una frase. */
  corto?: string
  /** Si es propuesta mía, sin respaldo directo de la base. */
  propuesta?: boolean
}

export interface Variable { e: 'sube' | 'espera' | 'no' | 'gris'; t: string }

/** Lo que pide el nivel siguiente. */
export interface Requisito {
  id: string
  texto: string
  estado: EstadoCriterio
  /** Si frena: los obligatorios, los «solo si» que aplican y que domine el suyo. */
  obliga: boolean
  /** Si lo marca el entrenador (en la escalera, o «domina» en el avance). */
  tuyo: boolean
  /** Para decir lo que falta en una frase. */
  falta: string
}

export interface Veredicto {
  clase: ClaseVeredicto
  accion: string
  detalle: string
  porque: string
  /** La propuesta en minúscula, para seguir una frase: «subir a 96 por sesión». */
  corto: string
  /** Contactos de pie por sesión que propone para la semana que viene; null sin nivel. */
  prox: number | null
  /** Sesiones de saltos por semana con las que se calcula (las de su última semana). */
  sesionesSemana: number
  /** Su última semana con saltos: los de pie por sesión y los de su nivel por sesión. */
  porSesion: number
  enNivel: number
  techo: number
  tope: number
  vars: { volumen: Variable; nivel: Variable; altura: Variable }
  cond: Condicion[]
  siguiente: NivelPlio | null
  pide: Requisito[]
  /** Por qué no pasa del nivel en el que está, si es un límite. */
  limite: string | null
  /** El nivel al que propone pasar, para el botón. */
  pasarA: NivelPlio | null
  /** Lo que falla, en frases cortas, cuando toca bajar. */
  fallan: string[]
  /** La caída de ahora y la que propone, en cm, desde el nivel 3. */
  altura: { ahora: number | null; propuesta: number | null }
  imp: Importancia
  cmj: Tendencia
  rsi: Tendencia
  medir: AvisoMedir[]
  /** Si está parado por el dolor de tendón marcado. */
  parar: boolean
}

const pct = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x * 100)) + ' %'
const porcentaje = (x: number) => Math.abs(Math.round(x * 100)) + ' %'
const coma = (n: number, dec = 1) => (Math.round(n * 10 ** dec) / 10 ** dec).toFixed(dec).replace('.', ',').replace(/,0+$/, '')
const parAbajo = (x: number) => Math.floor(x / 2) * 2
export const yLista = (xs: string[]) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1] : xs[0] || '')
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/* En minúscula para seguir la frase, salvo las siglas («RSI», «CMJ»). */
const seguido = (s: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const textoDias = (n: number) => (n <= 0 ? 'el mismo día' : n === 1 ? '1 día' : n + ' días')
const dolorTexto = (v: number) => DOLOR_WELLNESS[Math.min(7, Math.max(1, Math.round(v))) - 1]

const QUIEN: Record<NivelAtleta, string> = {
  principiante: 'un principiante', intermedio: 'un intermedio', avanzado: 'un avanzado', elite: 'un deportista de élite',
}

/** Lo que dice su deporte, en una palabra, para seguir una frase. */
export const NOMBRE_TIPO: Record<TipoDeporte, string> = {
  corre: 'corre', nada: 'natación', pedalea: 'ciclismo', 'sin-saber': 'sin saber su deporte',
}

/** Los saltos de cada nivel, para decir con qué se empieza. */
const LOS: Record<NivelPlio, string> = {
  a: 'los saltos bajos a dos pies', b: 'los de contramovimiento', c: 'los de caída',
  d: 'los de una pierna y los horizontales', e: 'los de alta velocidad',
}

const pesa = (tipo: string) => tipo === 'obligatorio' || tipo === 'solo si'

/** Lo que pide el nivel `sig` para pasar a él: sus criterios de la escalera y que domine el suyo. */
export function requisitosDe(sig: NivelPlio, actual: NivelPlio, c: Comprobaciones, d: DatosApp): Requisito[] {
  const out: Requisito[] = CRITERIOS[sig].map(cr => {
    const estado = cr.evaluar(c, d)
    return { id: cr.id, texto: cr.texto, estado, obliga: pesa(cr.tipo), tuyo: !!cr.comprobacion, falta: seguido(cr.texto) }
  })
  out.push({
    id: 'domina', texto: 'Domina el nivel ' + numeroNivel(actual) + ': 5 repeticiones limpias en vídeo de perfil y sin dolor al día siguiente',
    estado: c.domina === actual ? 'si' : 'sin', obliga: true, tuyo: true, falta: 'que confirmes que domina el nivel ' + numeroNivel(actual),
  })
  return out
}

/** La caída de ahora (la última que consta) y la de antes de ella, de su historia. */
function alturas(semanas: SemanaSaltos[], hasta: number): { ahora: number | null; antes: number | null } {
  let ahora: number | null = null
  for (let j = hasta; j >= 0; j--) {
    const a = semanas[j]?.altura
    if (a == null) continue
    if (ahora == null) ahora = a
    else if (a !== ahora) return { ahora, antes: a }
  }
  return { ahora, antes: null }
}

/** La semana que viene, una cosa cada vez. */
export function decidirAvance(e: EntradaAvance): Veredicto {
  const c = e.comprobaciones || {}
  const imp = importancia(e)
  const cmj = tendencia(e.cmj, e.hoy)
  const rsi = tendencia(e.rsi, e.hoy)
  const medir = tocaMedir(e, imp, cmj, rsi)
  const gris = (t: string): Variable => ({ e: 'gris', t })
  const vacio = {
    imp, cmj, rsi, medir, cond: [] as Condicion[], siguiente: null, pide: [] as Requisito[], limite: null, pasarA: null,
    fallan: [] as string[], altura: { ahora: null, propuesta: null }, parar: false,
    porSesion: 0, enNivel: 0, techo: 0, tope: 0, sesionesSemana: 0,
  }

  if (!e.nivel) {
    return {
      ...vacio, clase: 'sin-nivel', accion: 'Sin nivel puesto', prox: null, corto: 'ponerle su nivel',
      detalle: 'Ponle su nivel del tren inferior y la app propondrá cada semana qué puede subir.',
      porque: 'El avance parte del nivel que pones tú.',
      vars: { volumen: gris('—'), nivel: gris('—'), altura: gris('—') },
    }
  }

  const nivel = e.nivel
  const i = NIVELES_PLIO.indexOf(nivel)
  const conCaida = i >= NIVELES_PLIO.indexOf('c')
  const [suelo, techo] = peldano('inferior', nivel).rango ?? [0, 0]
  const exp: NivelAtleta = e.experiencia ?? 'intermedio'
  const tope = TOPE_NSCA[exp] ?? TOPE_NSCA.intermedio
  const master = (e.edad ?? 0) >= 40
  const minDias = master ? 3 : 2
  const sems = e.semanas || []
  const n = sems.length
  const conSaltos = (s?: SemanaSaltos) => !!s && s.pies > 0
  const iRef = conSaltos(sems[n - 1]) ? n - 1 : conSaltos(sems[n - 2]) ? n - 2 : -1
  const ref = iRef >= 0 ? sems[iRef] : null
  const ant = iRef > 0 ? sems[iRef - 1] : null
  const ultimaConSaltos = [...sems].reverse().find(conSaltos)
  const sesionesSemana = (ref ?? ultimaConSaltos)?.sesiones || 2
  const porSesion = ref ? Math.round(ref.pies / Math.max(1, ref.sesiones)) : 0
  const enNivel = ref ? Math.round((ref.porNivel[nivel] || 0) / Math.max(1, ref.sesiones)) : 0
  const subida = ref && ant && ant.pies > 0 ? ref.pies / ant.pies - 1 : null
  const { ahora: alturaAhora, antes: alturaAntes } = alturas(sems, iRef >= 0 ? iRef : n - 1)
  const comun = { ...vacio, porSesion, enNivel, techo, tope, sesionesSemana, altura: { ahora: conCaida ? alturaAhora : null, propuesta: null } }

  // ---- Las condiciones de esta semana ----
  const cond: Condicion[] = []
  if (c.dolor === true) {
    cond.push({ id: 'tendon', m: 'no', bloquea: true, titulo: 'Dolor de tendón o lesión de pierna', corto: 'el dolor de tendón que has marcado',
      texto: 'Lo has marcado en «Lo que sabes tú»: primero la readaptación.' })
  }
  if (e.separacionDias != null) {
    const juntas = e.separacionDias < minDias
    cond.push({ id: 'separacion', m: juntas ? 'no' : 'si', bloquea: juntas, titulo: 'Días entre sesiones de saltos',
      corto: 'la separación (' + textoDias(e.separacionDias) + ' entre sesiones)',
      texto: 'La menor de las dos últimas semanas fue de ' + textoDias(e.separacionDias) + '; '
        + (master ? 'con ' + e.edad + ' años, 3 días como mínimo (72 h).' : 'hacen falta 2 días como mínimo (48 h; 3 desde los 40 años).') })
  } else {
    cond.push({ id: 'separacion', m: 'nada', titulo: 'Días entre sesiones de saltos', texto: 'Una sola sesión de saltos en las dos últimas semanas: no hay separación que mirar.' })
  }
  const { despues, mediana: med } = e.dolor || { despues: null, mediana: null }
  if (despues != null && med != null) {
    const duele = despues >= med + 2
    cond.push({ id: 'dolor', m: duele ? 'no' : 'si', bloquea: duele, titulo: 'Dolor muscular (wellness)',
      corto: 'el dolor (' + dolorTexto(despues).toLowerCase() + ', y lo suyo es ' + dolorTexto(med).toLowerCase() + ')',
      texto: dolorTexto(despues) + ' (' + despues + ' de 7) en los dos días siguientes a su última sesión de saltos; su mediana de 4 semanas es '
        + coma(med) + ' (' + dolorTexto(med).toLowerCase() + '). Frena con 2 puntos o más por encima.' })
  } else {
    cond.push({ id: 'dolor', m: 'nada', titulo: 'Dolor muscular (wellness)',
      texto: med == null ? 'Sin bastante wellness para saber lo suyo: no frena ni confirma.' : 'Sin wellness en los dos días siguientes a su última sesión de saltos: no frena ni confirma.' })
  }
  const TEXTO_TEST: Partial<Record<EstadoTest, (t: Tendencia) => string>> = {
    cae: t => 'Por debajo de su base (' + pct(t.cambio ?? 0) + '): fatiga.',
    mejora: t => 'Mejora de verdad: ' + pct(t.cambio ?? 0) + ' sobre su base, y sus dos últimos tests por encima.',
    apunta: t => 'Sube un ' + porcentaje(t.cambio ?? 0) + ', pero en un solo test: falta otro para darlo por bueno.',
    estable: t => 'Estable: ' + pct(t.cambio ?? 0) + ', dentro de su error.',
  }
  for (const [id, nombre, t, sinTest] of [
    ['cmj', 'CMJ', cmj, 'Sin tests: no frena ni confirma nada.'],
    ['rsi', 'RSI', rsi, conCaida ? 'Sin drop jump: no frena, pero la altura de caída no puede subir.' : 'Sin drop jump: hace falta desde el nivel 3.'],
  ] as const) {
    if (t.estado === 'sin' || !t.ultimo) cond.push({ id, m: 'nada', titulo: nombre, texto: sinTest })
    else if (t.estado === 'caducado') cond.push({ id, m: 'nada', titulo: nombre, texto: 'El último es del ' + fechaCorta(t.ultimo.fecha) + ', hace ' + Math.floor((t.dias ?? 0) / 7) + ' semanas: ya no cuenta, ni para frenar ni para confirmar.' })
    else if (t.estado === 'base') cond.push({ id, m: 'si', titulo: nombre, texto: 'Un solo test, del ' + fechaCorta(t.ultimo.fecha) + ': es su base. Con el siguiente ya se compara.' })
    else cond.push({ id, m: t.estado === 'cae' ? 'no' : 'si', bloquea: t.estado === 'cae', titulo: nombre, corto: 'el ' + nombre + ' (' + pct(t.cambio ?? 0) + ')',
      texto: (TEXTO_TEST[t.estado]?.(t) ?? '') + ' El último, del ' + fechaCorta(t.ultimo.fecha) + '.' })
  }
  const pasada = subida != null && subida > SUBIDA_MAX
  if (ref) {
    cond.push({ id: 'subida', m: pasada ? 'falta' : 'si', titulo: iRef === n - 1 ? 'Subida de esta semana' : 'Subida de su última semana',
      texto: subida == null ? 'Su primera semana con saltos: nada con que comparar.'
        : pct(subida) + ' (' + ant!.pies + ' → ' + ref.pies + ' contactos); el máximo es +20 %.' })
  }
  let subidaCarrera: number | null = null
  if (imp.tipo === 'corre' && ref && ant && ant.carrera > 0 && ref.carrera > 0) {
    subidaCarrera = ref.carrera / ant.carrera - 1
    cond.push({ id: 'carrera', propuesta: true, m: subidaCarrera > CARRERA_MAX ? 'falta' : 'si', titulo: 'Su carrera de la semana',
      texto: pct(subidaCarrera) + ' de minutos (' + ant.carrera + ' → ' + ref.carrera + '). Los saltos también son impacto: si la carrera sube más de un 10 %, esperan.' })
  }
  if (ref) {
    cond.push({ id: 'tope', m: porSesion >= tope ? 'falta' : 'si', titulo: 'Tope de la sesión (NSCA)',
      texto: porSesion + ' contactos por sesión; el tope de ' + QUIEN[exp] + ' es ' + tope + (e.experiencia ? '.' : ' (sin nivel en su anamnesis: como intermedio).') })
  }
  const base = { ...comun, cond }
  const desdeTres = gris('Desde el nivel 3')

  /* 0. El dolor de tendón que ha marcado el entrenador: no se salta. */
  if (c.dolor === true) {
    return {
      ...base, clase: 'rojo', parar: true, accion: 'Parar los saltos', prox: 0, corto: 'parar los saltos hasta que no le duela',
      fallan: ['el dolor de tendón que has marcado'],
      detalle: 'Has marcado que le duele un tendón o tiene una lesión de pierna: primero la readaptación.',
      porque: 'Con dolor de tendón no se salta. Cuando lo quites, la app vuelve a proponer.',
      vars: { volumen: { e: 'no', t: 'Parar' }, nivel: { e: 'no', t: 'No sube' }, altura: conCaida ? { e: 'no', t: 'No sube' } : desdeTres },
    }
  }

  const noLesHaceFalta = (): Veredicto => ({
    ...base, clase: 'neutro', accion: 'Nada que subir: no le hacen falta', prox: porSesion || null,
    corto: 'nada que subir: no le hacen falta',
    detalle: !ref ? 'Para su deporte no hacen falta. Si quieres que los haga, marca «Sí, los necesita».'
      : ref.sesiones <= 1 && porSesion <= 100 ? 'Si los hace igual, puede seguir así: ' + porSesion + ' contactos, una vez por semana.'
      : 'Si los hace igual, con 60–100 contactos una vez por semana basta; ahora hace ' + ref.sesiones + ' sesiones de ' + porSesion + '.',
    porque: (imp.decidido ? 'Lo has decidido tú.' : 'Su deporte (' + NOMBRE_TIPO[imp.tipo] + ') no los pide.')
      + ' La app no propone subir el volumen, ni el nivel, ni la altura.',
    vars: { volumen: gris('No sube'), nivel: gris('No sube'), altura: gris('No sube') },
  })

  /* Todavía no ha saltado, o lleva dos semanas sin hacerlo: se empieza por el suelo de su nivel. */
  if (!sems.some(conSaltos) || iRef < 0) {
    if (!imp.necesita) return noLesHaceFalta()
    const nunca = !sems.some(conSaltos)
    return {
      ...base, clase: nunca ? 'bien' : 'ambar', accion: nunca ? 'Empezar' : 'Volver a empezar', prox: suelo,
      corto: (nunca ? 'empezar con ' : 'volver con ') + suelo + ' por sesión',
      detalle: (nunca ? 'Empezar con ' : 'Volver con ') + suelo + ' contactos por sesión de ' + LOS[nivel] + ': el suelo de su nivel.',
      porque: nunca ? 'No consta ninguna sesión de saltos en las últimas semanas.' : 'Lleva dos semanas o más sin saltos: se vuelve por el suelo de su nivel.',
      vars: { volumen: { e: 'sube', t: nunca ? 'Empezar' : 'Volver' }, nivel: gris('Después'), altura: conCaida ? gris('Después') : desdeTres },
    }
  }

  /* 1. Si algo va mal, se baja: a lo de la semana anterior a la última subida (o un 20 % menos, si no la hubo). */
  const fallan = cond.filter(x => x.bloquea).map(x => x.corto || x.titulo.toLowerCase())
  if (fallan.length) {
    let destino: number | null = null
    for (let j = iRef; j > 0; j--) {
      if (sems[j].pies > sems[j - 1].pies && sems[j - 1].pies > 0) { destino = Math.round(sems[j - 1].pies / Math.max(1, sems[j - 1].sesiones)); break }
    }
    if (destino == null || destino >= porSesion) destino = parAbajo(porSesion * 0.8)
    const caida = !conCaida ? '' : alturaAhora != null && alturaAntes != null && alturaAntes < alturaAhora
      ? '; y la caída, de vuelta a ' + alturaAntes + ' cm' : '; y la caída, sin subir'
    return {
      ...base, clase: 'rojo', fallan, accion: 'Bajar y no subir nada', prox: destino,
      corto: 'bajar a ' + destino + ' por sesión' + (conCaida && alturaAntes != null && alturaAhora != null && alturaAntes < alturaAhora ? ', y la caída a ' + alturaAntes + ' cm' : ''),
      altura: { ahora: conCaida ? alturaAhora : null, propuesta: conCaida && alturaAntes != null && alturaAhora != null && alturaAntes < alturaAhora ? alturaAntes : null },
      detalle: 'Volver a ' + destino + ' contactos por sesión' + caida + '.',
      porque: 'Fallan ' + yLista(fallan) + '. Hasta que vuelva a lo suyo, no sube nada.',
      vars: { volumen: { e: 'no', t: 'Bajar' }, nivel: { e: 'no', t: 'No sube' }, altura: conCaida ? { e: 'no', t: caida.includes('vuelta') ? 'Bajar' : 'No sube' } : desdeTres },
    }
  }

  /* 2. Si su deporte no los necesita, no se propone subir. */
  if (!imp.necesita) return noLesHaceFalta()

  /* 3. Si acaba de subir mucho, o si sube su carrera, se mantiene. */
  if (pasada || (subidaCarrera != null && subidaCarrera > CARRERA_MAX)) {
    return {
      ...base, clase: 'ambar', accion: 'Mantener esta semana', prox: porSesion, corto: 'mantener ' + porSesion + ' por sesión',
      detalle: 'Repetir ' + porSesion + ' contactos por sesión.',
      porque: pasada
        ? 'Su última semana subió un ' + porcentaje(subida as number) + ', más del 20 %: antes de volver a subir, que lo consolide.'
        : 'Su carrera sube un ' + porcentaje(subidaCarrera as number) + ' (' + ant!.carrera + ' → ' + ref!.carrera + ' min). Los saltos también son impacto: mejor no subir las dos cosas a la vez.',
      vars: { volumen: { e: 'espera', t: 'Mantener' }, nivel: gris('Después'), altura: conCaida ? gris('Después') : desdeTres },
    }
  }

  /* 4. Primero, el volumen. */
  if (enNivel < techo && porSesion < tope) {
    const paso = master || exp === 'principiante' ? 0.1 : 0.15
    const sube = Math.max(0, Math.min(Math.min(parAbajo(porSesion * (1 + paso)), tope) - porSesion, techo - enNivel))
    if (sube > 0) {
      const nuevo = porSesion + sube
      return {
        ...base, clase: 'bien', accion: 'Subir el volumen', prox: nuevo, corto: 'subir a ' + nuevo + ' por sesión',
        detalle: 'De ' + porSesion + ' a ' + nuevo + ' contactos por sesión (' + pct(nuevo / porSesion - 1) + '). Lo nuevo, de su nivel: '
          + LOS[nivel] + ', de ' + enNivel + ' a ' + (enNivel + sube) + '.',
        porque: (paso === 0.1 ? 'Paso prudente, de hasta un 10 %, ' + (master ? 'por tener ' + e.edad + ' años' : 'por ser principiante') : 'Un paso de hasta un 15 %, dentro del 10–20 % por semana')
          + '. Aún no está en el techo de su nivel (' + enNivel + ' de ' + techo + ') ni en el tope de su sesión (' + tope + ').',
        vars: { volumen: { e: 'sube', t: 'Subir' }, nivel: gris('Después'), altura: conCaida ? gris('Después') : desdeTres },
      }
    }
  }

  /* 5. Después, el nivel. */
  const sig = NIVELES_PLIO[i + 1] ?? null
  const lim = limiteDe(c)
  const limitado = !!(lim && sig && NIVELES_PLIO.indexOf(sig) > NIVELES_PLIO.indexOf(lim.tope))
  const pide = sig && !limitado ? requisitosDe(sig, nivel, c, e.datos) : []
  const listo = pide.length > 0 && pide.filter(r => r.obliga).every(r => r.estado === 'si' || r.estado === 'na')
  const conNivel = { ...base, siguiente: limitado ? null : sig, pide, limite: limitado && lim ? lim.motivo : null }
  if (listo && sig) {
    const sueloSig = peldano('inferior', sig).rango?.[0] ?? 0
    return {
      ...conNivel, clase: 'bien', accion: 'Pasar al nivel ' + numeroNivel(sig), pasarA: sig, prox: porSesion,
      corto: 'pasar al nivel ' + numeroNivel(sig) + ', con ' + sueloSig + ' por sesión de ' + LOS[sig],
      detalle: 'Empezar con ' + LOS[sig] + ': ' + sueloSig + ' contactos por sesión, y quitar otros tantos de los de abajo para no pasar de ' + porSesion + ' en total.',
      porque: 'El volumen ya no puede subir, cumple lo que pide el nivel ' + numeroNivel(sig) + ' y has confirmado que domina el suyo. A más dificultad, menos volumen. La app lo propone; lo pones tú.',
      vars: { volumen: gris('En su techo'), nivel: { e: 'sube', t: 'Subir' }, altura: conCaida ? gris('Después') : desdeTres },
    }
  }
  const faltan = pide.filter(r => r.obliga && r.estado !== 'si' && r.estado !== 'na').map(r => r.falta)
  const porQueNoSube = limitado && lim ? ' y no pasa de aquí: ' + seguido(lim.motivo.replace(/\.$/, ''))
    : sig ? ' y para el nivel ' + numeroNivel(sig) + ' falta ' + yLista(faltan) : ' y ya está en el último nivel'
  const varNivel: Variable = limitado ? gris('Su límite') : sig ? { e: 'espera', t: 'Le falta algo' } : gris('Ya en el 5')

  /* 6. Por último, la altura de caída. */
  if (conCaida && rsi.estado === 'mejora' && (alturaAhora == null || alturaAhora < ALTURA_MAX)) {
    const nueva = alturaAhora != null ? Math.min(alturaAhora + ALTURA_PASO, ALTURA_MAX) : null
    return {
      ...conNivel, clase: 'bien', accion: 'Subir la altura de caída', prox: porSesion,
      corto: nueva != null ? 'caída de ' + nueva + ' cm, con los mismos contactos' : 'subir 10 cm la caída, con los mismos contactos',
      altura: { ahora: alturaAhora, propuesta: nueva },
      detalle: nueva != null
        ? 'De ' + alturaAhora + ' a ' + nueva + ' cm, con los mismos contactos. Si con ' + nueva + ' cm el contacto pasa de 250 ms o su RSI baja, se vuelve a ' + alturaAhora + '.'
        : 'Subir 10 cm la caída (hasta 40), con los mismos contactos. Si el contacto pasa de 250 ms o su RSI baja, se vuelve a la de ahora.',
      porque: 'El volumen está en su techo' + porQueNoSube + '. Su RSI sube de verdad (' + pct(rsi.cambio ?? 0) + ', sus dos últimos tests).',
      vars: { volumen: gris('En su techo'), nivel: varNivel, altura: { e: 'sube', t: 'Subir' } },
    }
  }
  return {
    ...conNivel, clase: 'ambar', accion: 'Mantener', prox: porSesion, corto: 'mantener ' + porSesion + ' por sesión',
    detalle: 'Repetir ' + porSesion + ' contactos por sesión.',
    porque: 'El volumen está en su techo' + porQueNoSube + '.',
    vars: {
      volumen: gris('En su techo'), nivel: varNivel,
      altura: !conCaida ? desdeTres : rsi.estado === 'sin' || rsi.estado === 'caducado' ? { e: 'espera', t: 'Falta un test' }
        : alturaAhora != null && alturaAhora >= ALTURA_MAX ? gris('En 40 cm') : { e: 'espera', t: 'No todavía' },
    },
  }
}

// ------------------------------------------------------------
// Fuera de su ficha: las señales del panel (lib/senales)
// ------------------------------------------------------------

/**
 * Solo sale fuera de su ficha lo que pide hacer algo: bajar, en ámbar, y toca
 * medir, en azul (las azules no llegan a su informe semanal: medir es cosa del
 * entrenador). Que pueda subir no es un aviso. Solo de quien tiene su nivel puesto.
 */
export function senalesSaltos(e: EntradaAvance | null | undefined): Senal[] {
  if (!e?.nivel) return []
  const v = decidirAvance(e)
  const out: Senal[] = []
  if (v.clase === 'rojo') {
    out.push({
      id: 'saltos_bajar', nivel: 'ambar',
      titulo: v.parar ? 'Saltos: parar, le duele un tendón' : 'Saltos: bajar esta semana',
      tituloAtleta: v.parar ? 'tus saltos paran hasta que no te duela' : 'tus saltos piden bajar esta semana',
      porque: (v.fallan.length > 1 ? 'Fallan ' : 'Falla ') + yLista(v.fallan) + '.',
      accion: mayuscula(v.corto) + '.',
    })
  }
  if (v.medir.length) {
    out.push({
      id: 'saltos_medir', nivel: 'info',
      titulo: 'Saltos: toca medir ' + yLista(v.medir.map(m => m.nombre)),
      tituloAtleta: 'toca medir tu salto',
      porque: v.medir.map(m => m.texto).join(' '),
      accion: 'Mídelo al principio de su próxima sesión de saltos' + (e.proximaSaltos ? ', el ' + fechaCorta(e.proximaSaltos) : '') + '.',
    })
  }
  return out
}
