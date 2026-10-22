// ============================================================
// TRIPULSE — En qué escalón de pliometría está cada deportista
// ============================================================
//
// EL ESCALÓN LO PONE EL ENTRENADOR. Decidido con el usuario el 21-10-2026: «que
// todo sea opcional y que en todo momento, aparte de la recomendación de la
// aplicación, pueda cambiar en qué escalón está». Esto solo RECOMIENDA; lo que
// se guarda es lo que él elige (supabase/pliometria-escalon.sql).
//
// CÓMO RECOMIENDA. Cada escalón pide unos criterios para empezar en él, sacados
// de la base de conocimiento: la tabla 18.7 de la NSCA y las fichas 04, 05, 10,
// 12 y 16 de Motricidad. Se recomienda el más alto cuyos criterios se cumplen
// junto con los de todos los de abajo. Entrar en el siguiente es salir del
// actual: no hay dos listas.
//
// TRES CLASES DE CRITERIO.
//   · Obligatorio: si no se cumple, no se recomienda ese escalón. Es seguridad.
//   · Orientativo: avisa pero no frena, porque la fuente no lo da como umbral
//     validado (la sentadilla de 1,5 × su peso y el RSI de 1,5).
//   · Límite: quien aún crece, o es máster con la rodilla operada o con
//     desgaste, no pasa del b; con más de 100 kg, cajón de 46 cm como mucho.
//
// SIN MIRAR NO ES SUSPENDER. Lo que comprueba el entrenador tiene tres estados:
// sí, no o sin mirar (no está en el json). Si falta algo, se recomienda hasta
// donde llegan los datos y se dice qué mirar; sin nada, no se recomienda.
//
// Sin Supabase: todo lo de aquí se prueba con datos a mano. Lo que lee la base
// está en lib/pliometria-escalon-datos.

import { NIVELES_PLIO, peldano, type NivelPlio, type PartePlio } from './pliometria'

/** Lo que guarda pliometria_evaluacion.comprobaciones. Lo que no está, no se ha mirado. */
export interface Comprobaciones {
  /* Lo que comprueba el entrenador en cada escalón: sí, no o sin mirar. */
  eqPie?: boolean
  silencio?: boolean
  eqCuarto?: boolean
  caida30?: boolean
  eqMedia?: boolean
  unaPierna?: boolean
  tendones4?: boolean
  prueba?: boolean
  /* Lo que la app no sabe de él: sin marcar es que no. */
  dolor?: boolean
  creciendo?: boolean
  rodilla?: boolean
  unilateral?: boolean
  fuerzaFuera?: boolean
  /** Diferencia entre piernas en el salto horizontal a una pierna, en %. */
  asimetria?: number
}

/** Las comprobaciones de tres estados, en el orden de la escalera. */
export const COMPROBACIONES_DE_TRES = ['eqPie', 'silencio', 'eqCuarto', 'caida30', 'eqMedia', 'unaPierna', 'tendones4', 'prueba'] as const
export const MARCAS = ['dolor', 'creciendo', 'rodilla', 'unilateral', 'fuerzaFuera'] as const

/** Lo que sale solo de la app. null = no hay dato. */
export interface DatosApp {
  peso: number | null
  /** El 1RM de sentadilla más reciente. */
  sentadilla: number | null
  /** El último CMJ, en cm. */
  cmj: number | null
  /** El último drop jump: cajón (cm), contacto (ms), salto (cm) y RSI. */
  caja: number | null
  contacto: number | null
  salto: number | null
  rsi: number | null
  /** De las últimas 4 semanas, en cuántas hizo alguna sesión de fuerza. */
  semanasFuerza: number
  /** De cuándo es cada test, para enseñarlo. La recomendación no lo mira. */
  fechas?: { dropjump?: string; cmj?: string; sentadilla?: string }
}

export const DATOS_VACIOS: DatosApp = {
  peso: null, sentadilla: null, cmj: null, caja: null, contacto: null, salto: null, rsi: null, semanasFuerza: 0,
}

export type EstadoCriterio = 'si' | 'no' | 'sin' | 'na'
export type TipoCriterio = 'obligatorio' | 'orientativo' | 'dato' | 'solo si'
export type DeDonde = 'tu' | 'test' | 'app'

export interface Criterio {
  id: string
  texto: string
  ayuda?: string
  de: DeDonde
  /** El nombre de la fuente cuando no es el entrenador: «Drop Jump», «Sus sesiones»… */
  deTexto?: string
  tipo: TipoCriterio
  /** Si lo marca el entrenador con sí, no o sin mirar. */
  comprobacion?: (typeof COMPROBACIONES_DE_TRES)[number]
  evaluar: (c: Comprobaciones, d: DatosApp) => EstadoCriterio
  /** El dato con el que se ha decidido, en una frase. */
  dice?: (c: Comprobaciones, d: DatosApp) => string
}

const coma = (n: number, dec = 2) => n.toFixed(dec).replace('.', ',')
const positivo = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/** El RSI del último drop jump: el guardado o, si falta, altura ÷ contacto. */
export const rsiDe = (d: DatosApp): number | null =>
  positivo(d.rsi) ? d.rsi : positivo(d.salto) && positivo(d.contacto) ? (d.salto / 100) / (d.contacto / 1000) : null

const tres = (id: (typeof COMPROBACIONES_DE_TRES)[number]) =>
  (c: Comprobaciones): EstadoCriterio => (c[id] === true ? 'si' : c[id] === false ? 'no' : 'sin')

export const CRITERIOS: Record<'pre' | NivelPlio, Criterio[]> = {
  pre: [
    { id: 'dolor', texto: 'Sin dolor de tendón ni lesión de pierna', ayuda: 'Si le duele, primero la readaptación.', de: 'tu', tipo: 'obligatorio',
      evaluar: c => (c.dolor === true ? 'no' : 'si') },
    /* QUE NO CONSTE NO ES QUE NO LA HAGA: puede hacer la fuerza fuera de la
       app. Con menos de 4 semanas en sus sesiones queda SIN MIRAR, no
       suspendido; lo resuelve el entrenador marcando que la hace fuera. Antes
       decía «no saltar todavía» a quien no tenía nada evaluado. */
    { id: 'fuerza', texto: 'Un bloque de fuerza en marcha', ayuda: 'Fuerza las 4 últimas semanas.', de: 'app', deTexto: 'Sus sesiones', tipo: 'obligatorio',
      evaluar: (c, d) => (d.semanasFuerza >= 4 || c.fuerzaFuera === true ? 'si' : 'sin'),
      dice: (c, d) => (c.fuerzaFuera === true ? 'Hace la fuerza fuera de la app.'
        : d.semanasFuerza >= 4 ? 'Lleva las 4 últimas semanas con fuerza.'
        : 'En la app constan ' + d.semanasFuerza + ' de las 4 últimas semanas con fuerza. Si la hace fuera, márcalo en «Lo que sabes tú».') },
  ],
  a: [
    { id: 'eqPie', texto: 'Equilibrio a una pierna, de pie, 30 s', ayuda: 'Sin apoyar el otro pie ni agarrarse.', de: 'tu', tipo: 'obligatorio', comprobacion: 'eqPie', evaluar: tres('eqPie') },
    { id: 'silencio', texto: 'Aterriza en silencio y con la rodilla sobre el pie', ayuda: 'Cinco saltos seguidos.', de: 'tu', tipo: 'obligatorio', comprobacion: 'silencio', evaluar: tres('silencio') },
  ],
  b: [
    { id: 'eqCuarto', texto: 'Equilibrio a una pierna en cuarto de sentadilla, 30 s', de: 'tu', tipo: 'obligatorio', comprobacion: 'eqCuarto', evaluar: tres('eqCuarto') },
    { id: 'caida30', texto: 'Cae a dos pies desde un cajón de 30 cm', ayuda: 'Tres veces limpias en vídeo de perfil, y sin dolor al día siguiente.', de: 'tu', tipo: 'obligatorio', comprobacion: 'caida30', evaluar: tres('caida30') },
    { id: 'cmj', texto: 'Su CMJ medido', ayuda: 'No es un umbral: es su punto de partida para seguirlo.', de: 'test', deTexto: 'Saltos: SJ y CMJ', tipo: 'dato',
      evaluar: (_c, d) => (positivo(d.cmj) ? 'si' : 'sin'),
      dice: (_c, d) => (positivo(d.cmj) ? 'CMJ de ' + String(Math.round(d.cmj * 10) / 10).replace('.', ',') + ' cm.' : 'Sin CMJ: mídelo para tener su base.') },
  ],
  c: [
    { id: 'contacto', texto: 'Drop jump desde 20–30 cm con el contacto por debajo de 250 ms', ayuda: 'Si se alarga, el cajón es demasiado alto para él: se baja.', de: 'test', deTexto: 'Drop Jump', tipo: 'obligatorio',
      evaluar: (_c, d) => (!positivo(d.contacto) || !positivo(d.caja) ? 'sin' : d.contacto < 250 && d.caja >= 20 ? 'si' : 'no'),
      dice: (_c, d) => (!positivo(d.contacto) || !positivo(d.caja) ? 'Sin drop jump: mídelo desde 20 cm.'
        : d.contacto < 250 && d.caja >= 20 ? d.contacto + ' ms desde ' + d.caja + ' cm.'
        : d.contacto >= 250 && d.caja > 20 ? d.contacto + ' ms desde ' + d.caja + ' cm: baja a ' + Math.max(20, d.caja - 10) + ' cm y vuelve a medirlo.'
        : d.caja < 20 ? 'Desde ' + d.caja + ' cm: mídelo desde 20 cm por lo menos.'
        : d.contacto + ' ms desde ' + d.caja + ' cm: todavía no es reactivo.') },
    { id: 'sentadilla', texto: 'Sentadilla de 1,5 × su peso', ayuda: 'Recomendación de la NSCA, no un umbral validado.', de: 'test', deTexto: '1RM y peso', tipo: 'orientativo',
      evaluar: (_c, d) => (!positivo(d.sentadilla) || !positivo(d.peso) ? 'sin' : d.sentadilla / d.peso >= 1.5 ? 'si' : 'no'),
      dice: (_c, d) => (!positivo(d.sentadilla) ? 'Sin 1RM de sentadilla.' : !positivo(d.peso) ? 'Sin su peso en la anamnesis.'
        : coma(d.sentadilla / d.peso) + ' × su peso' + (d.sentadilla / d.peso >= 1.5 ? '.' : ' (le faltan ' + Math.ceil(1.5 * d.peso - d.sentadilla) + ' kg).')) },
  ],
  d: [
    { id: 'eqMedia', texto: 'Equilibrio a una pierna en media sentadilla, 30 s', de: 'tu', tipo: 'obligatorio', comprobacion: 'eqMedia', evaluar: tres('eqMedia') },
    { id: 'unaPierna', texto: 'Cae a una pierna y estabiliza 2 s', ayuda: 'Cinco veces por lado.', de: 'tu', tipo: 'obligatorio', comprobacion: 'unaPierna', evaluar: tres('unaPierna') },
    { id: 'asimetria', texto: 'Diferencia entre piernas por debajo del 13 %', ayuda: 'Solo si tuvo una lesión de una pierna. Por debajo del 13 % es ruido.', de: 'test', deTexto: 'Salto a una pierna', tipo: 'solo si',
      evaluar: c => (c.unilateral !== true ? 'na' : typeof c.asimetria !== 'number' ? 'sin' : c.asimetria < 13 ? 'si' : 'no'),
      dice: c => (c.unilateral !== true ? 'No aplica: sin lesión de una pierna.' : typeof c.asimetria !== 'number' ? 'Falta medirla.' : coma(c.asimetria, 1).replace(/,0$/, '') + ' % de diferencia.') },
  ],
  e: [
    { id: 'tendones4', texto: 'Sin dolor de tendón en las últimas 4 semanas', de: 'tu', tipo: 'obligatorio', comprobacion: 'tendones4', evaluar: tres('tendones4') },
    { id: 'rsi', texto: 'RSI de 1,5 o más', ayuda: 'Por debajo, «necesita trabajo reactivo».', de: 'test', deTexto: 'Drop Jump', tipo: 'orientativo',
      evaluar: (_c, d) => { const r = rsiDe(d); return r == null ? 'sin' : r >= 1.5 ? 'si' : 'no' },
      dice: (_c, d) => { const r = rsiDe(d); return r == null ? 'Sin RSI.' : 'RSI de ' + coma(r) + '.' } },
    { id: 'prueba', texto: 'Su prueba lo pide', ayuda: 'Velocidad o cambios de ritmo. En un triatleta, casi nunca.', de: 'tu', tipo: 'obligatorio', comprobacion: 'prueba', evaluar: tres('prueba') },
  ],
}

/** Si un criterio decide: los obligatorios, y los «solo si» cuando aplican. */
const pesa = (c: Criterio) => c.tipo === 'obligatorio' || c.tipo === 'solo si'

export interface CriterioEvaluado { criterio: Criterio; estado: EstadoCriterio; escalon: 'pre' | NivelPlio }

export const evaluarEscalon = (k: 'pre' | NivelPlio, c: Comprobaciones, d: DatosApp): CriterioEvaluado[] =>
  CRITERIOS[k].map(criterio => ({ criterio, estado: criterio.evaluar(c, d), escalon: k }))

export type Recomendacion =
  | { tipo: 'no-salta'; no: CriterioEvaluado[] }
  | { tipo: 'sin-datos'; sinMirar: CriterioEvaluado[] }
  | { tipo: 'aterrizajes'; no: CriterioEvaluado[]; sinMirar: CriterioEvaluado[] }
  | {
      tipo: 'escalon'
      escalon: NivelPlio
      /** El siguiente; null si es el último. */
      siguiente: NivelPlio | null
      /** Lo del siguiente que NO cumple, y lo que está SIN MIRAR. */
      no: CriterioEvaluado[]
      sinMirar: CriterioEvaluado[]
      /** Lo orientativo del siguiente que no cumple o no consta: es lo próximo que va a pesar. */
      orientativoSiguiente: CriterioEvaluado[]
      /** Por qué no pasa de aquí, si es un límite y no un criterio. */
      limite: string | null
      /** Lo orientativo de lo ya pasado que no cumple, y el aviso de peso. */
      ojo: { criterio?: CriterioEvaluado; texto?: string }[]
    }

/** Hasta dónde puede llegar por un límite que no depende de lo que demuestre. */
export function limiteDe(c: Comprobaciones): { tope: NivelPlio; motivo: string } | null {
  if (c.creciendo === true) return { tope: 'b', motivo: 'Aún está creciendo: la NSCA desaconseja los de caída y la alta intensidad.' }
  if (c.rodilla === true) return { tope: 'b', motivo: 'Máster con la rodilla operada o con desgaste: la NSCA desaconseja los de caída y los de una pierna.' }
  return null
}

/**
 * Lo que recomienda: el escalón más alto cuyos obligatorios se cumplen junto
 * con los de abajo. Se para en el primero que NO se cumple (no llega) o que
 * está SIN MIRAR (no se sabe), y dice qué falta.
 */
export function recomendar(c: Comprobaciones, d: DatosApp): Recomendacion {
  const pre = evaluarEscalon('pre', c, d)
  const noPre = pre.filter(x => pesa(x.criterio) && x.estado === 'no')
  if (noPre.length) return { tipo: 'no-salta', no: noPre }
  /* Lo de antes de saltar sin mirar: no se puede recomendar ningún escalón.
     Se dice junto con lo del a que también falte mirar. */
  const sinPre = pre.filter(x => pesa(x.criterio) && x.estado === 'sin')
  if (sinPre.length) {
    return { tipo: 'sin-datos', sinMirar: [...sinPre, ...evaluarEscalon('a', c, d).filter(x => pesa(x.criterio) && x.estado === 'sin')] }
  }

  const limite = limiteDe(c)
  let escalon: NivelPlio | null = null
  let no: CriterioEvaluado[] = []
  let sinMirar: CriterioEvaluado[] = []
  let limitado = false
  const ojo: { criterio?: CriterioEvaluado; texto?: string }[] = []

  for (const k of NIVELES_PLIO) {
    /* El límite va antes que los criterios: a quien no va a pasar del b no se
       le dice qué le falta para el c. */
    if (limite && NIVELES_PLIO.indexOf(k) > NIVELES_PLIO.indexOf(limite.tope)) { limitado = true; break }
    const cs = evaluarEscalon(k, c, d)
    const noCumple = cs.filter(x => pesa(x.criterio) && x.estado === 'no')
    const sin = cs.filter(x => pesa(x.criterio) && x.estado === 'sin')
    if (noCumple.length || sin.length) { no = noCumple; sinMirar = sin; break }
    escalon = k
    cs.filter(x => x.criterio.tipo === 'orientativo' && x.estado === 'no').forEach(x => ojo.push({ criterio: x }))
  }

  if (!escalon) {
    if (!no.length) return { tipo: 'sin-datos', sinMirar }
    return { tipo: 'aterrizajes', no, sinMirar }
  }

  const siguiente = NIVELES_PLIO[NIVELES_PLIO.indexOf(escalon) + 1] ?? null
  const orientativoSiguiente = siguiente && !limitado
    ? evaluarEscalon(siguiente, c, d).filter(x => x.criterio.tipo === 'orientativo' && x.estado !== 'si')
    : []
  if (positivo(d.peso) && d.peso > 100) ojo.push({ texto: 'Pesa más de 100 kg: cajón de 46 cm como mucho, y volumen e intensidad bajos (NSCA).' })

  return {
    tipo: 'escalon', escalon, siguiente: limitado ? null : siguiente,
    no: limitado ? [] : no, sinMirar: limitado ? [] : sinMirar, orientativoSiguiente,
    limite: limitado && limite ? limite.motivo : null, ojo,
  }
}

/** Lo que se guarda en pliometria_escalon.recomendado al cambiar el escalón. */
export function recomendadoParaGuardar(r: Recomendacion): NivelPlio | 'aterrizajes' | 'no-salta' | null {
  if (r.tipo === 'escalon') return r.escalon
  if (r.tipo === 'aterrizajes') return 'aterrizajes'
  if (r.tipo === 'no-salta') return 'no-salta'
  return null
}

/** Cuántos contactos por sesión de su escalón al empezar: el suelo del rango. */
export const contactosParaEmpezar = (k: NivelPlio): number => peldano('inferior', k).rango?.[0] ?? 0

// ------------------------------------------------------------
// El historial
// ------------------------------------------------------------

export interface FilaEscalon {
  id?: number
  parte: string
  escalon: string | null
  recomendado: string | null
  nota?: string | null
  puesto_por?: string | null
  puesto_en: string
}

const leerNivel = (v: unknown): NivelPlio | null => (NIVELES_PLIO.includes(v as NivelPlio) ? v as NivelPlio : null)

/** El escalón de hoy de cada parte: la última fila de esa parte. */
export function escalonesActuales(filas: FilaEscalon[]): Record<PartePlio, { escalon: NivelPlio | null; fila: FilaEscalon | null }> {
  const out: Record<PartePlio, { escalon: NivelPlio | null; fila: FilaEscalon | null }> = {
    inferior: { escalon: null, fila: null }, superior: { escalon: null, fila: null }, tronco: { escalon: null, fila: null },
  }
  const orden = (filas || []).slice().sort((a, b) =>
    (b.puesto_en || '').localeCompare(a.puesto_en || '') || (Number(b.id) || 0) - (Number(a.id) || 0))
  for (const f of orden) {
    const p = f.parte as PartePlio
    if (!(p in out) || out[p].fila) continue
    out[p] = { escalon: leerNivel(f.escalon), fila: f }
  }
  return out
}

/** Si un ejercicio de ese nivel está por encima del escalón del deportista. Sin escalón, nada lo está. */
export function porEncimaDeSuEscalon(nivelEjercicio: NivelPlio | null, escalon: NivelPlio | null): boolean {
  if (!nivelEjercicio || !escalon) return false
  return NIVELES_PLIO.indexOf(nivelEjercicio) > NIVELES_PLIO.indexOf(escalon)
}

// ------------------------------------------------------------
// Para enseñarlo
// ------------------------------------------------------------

/** Si el entrenador ha marcado algo de lo que solo puede comprobar él. */
export const hayEvaluacion = (c: Comprobaciones): boolean =>
  COMPROBACIONES_DE_TRES.some(k => typeof c[k] === 'boolean')

/* En minúscula para seguir la frase, salvo las siglas («RSI», «CMJ»). */
const seguido = (s: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)

/**
 * Lo que pide un escalón del tren inferior, en una frase, para la tabla de la
 * ficha. Sale de los mismos criterios que la escalera: no hay dos listas.
 */
export function criteriosEnUnaFrase(k: 'pre' | NivelPlio): string {
  const partes = CRITERIOS[k].map((c, i) => {
    const t = i === 0 ? c.texto : seguido(c.texto)
    return t + (c.tipo === 'orientativo' ? ' (orientativo)' : c.tipo === 'dato' ? ' (como punto de partida)' : c.tipo === 'solo si' ? ' (solo tras una lesión de un lado)' : '')
  })
  return partes.join('; ') + '.'
}
