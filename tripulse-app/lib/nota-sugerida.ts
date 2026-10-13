// ============================================================
// La nota que sugiere la app (fase 3 del analizador de vídeo)
// ============================================================
//
// Solo donde el criterio es geometría y una cámara lo puede medir:
//
//  · Movilidad de hombro (FMS y Nine Test). La distancia entre los puños en
//    palmas, que mide el entrenador con la palma y la distancia: nota entera.
//  · Elevación activa de pierna recta (FMS). Dónde cae la vertical del tobillo
//    que sube sobre el muslo de la otra pierna, con el esqueleto: nota entera de
//    lo que se mide (que la otra pierna siga apoyada se mira a ojo).
//  · Sentadilla profunda (FMS y Nine Test). De perfil, en el fondo, «tronco
//    paralelo a la tibia» (FMS) y «fémur por debajo de la horizontal». Las
//    rodillas se miran de frente, la pica no la ve el detector y la tabla o el
//    alza la sabe el entrenador: no hay nota entera, se dice a qué apunta y con
//    qué condición.
//  · Lo demás: a ojo. No se sugiere nada.
//
// ES UNA PROPUESTA. La nota la pone el entrenador, y la sugerencia se guarda a
// su lado para ver con el tiempo cuántas veces coinciden: era la condición de
// esta fase (comprobar que coincide con lo que puntúa el entrenador).
//
// EN EL LÍMITE. Cerca de cada umbral, el error de medida puede darle la vuelta
// al criterio; ahí la app no dice ni sí ni no, dice que lo mire el entrenador.
// Las franjas salen del error de cada medida: unos 5° en las del esqueleto de
// perfil (Yoma 2025), lo de tocar a mano en la palma, y en el muslo lo que va
// de los puntos del detector a las marcas del FMS (la espina ilíaca, la rótula).

import type { Prueba, Vista } from './baterias-movimiento'
import type { Trazo } from './movimiento-datos'
import { valorDe } from './trazos-fotograma'
import { enEjesDelSuelo, type Punto } from './geometria-fotograma'
import {
  conAjustes, indice, medidasCuerpo, serieCuerpo, sinPicos, VISIBLE_MINIMO,
  type Ajustes, type Cuerpo, type LadoCuerpo,
} from './cuerpo'

export type Veredicto = 'cumple' | 'no' | 'limite'

export interface CriterioVisto {
  /** La clave del criterio en la batería (lib/baterias-movimiento). */
  clave: string
  /** null cuando el criterio es un valor y no un sí o no (la distancia en palmas). */
  veredicto: Veredicto | null
  /** Lo medido, para leerlo: «fémur 8° por debajo». */
  texto: string
}

export interface Sugerencia {
  /** La nota a la que apunta lo medido; null si lo medido no basta para dar una. */
  nota: number | null
  /** Hay un criterio cerca del umbral: la nota podría ser la de al lado. */
  limite: boolean
  explicacion: string
  /** Lo que ha visto de cada criterio que puede medir. */
  criterios: CriterioVisto[]
  /** Lo que no puede ver la app y hace falta para la nota. */
  falta: string[]
  /** El fotograma que ha mirado, para ir a verlo. */
  clave: number | null
}

export interface DatosSugerencia {
  prueba: Prueba
  vista: Vista
  /** Lo dibujado en el fotograma de ahora: la palma y la distancia. */
  trazos: Trazo[]
  /** El esqueleto de cada fotograma y lo corregido a mano en cada uno. */
  cuerpos: Record<number, Cuerpo>
  ajustes: Record<number, Ajustes>
  ladoMedido: LadoCuerpo
  /** La inclinación del suelo marcado (0 = móvil recto). */
  inclinacion: number
  /** En las sentadillas: con el alza (FMS) o con la tabla de 4 cm (Nine Test). */
  alza: boolean
  /** El fotograma de ahora: el que se mira en una foto. */
  clave: number
}

/** Las pruebas en las que la app sugiere algo. */
export const CON_SUGERENCIA = ['fms.hombro', 'nine.hombro', 'fms.pierna_recta', 'fms.sentadilla', 'nine.sentadilla']

/** Lo que dice el interruptor de la tabla o el alza, en las sentadillas. */
export const TEXTO_ALZA: Record<string, string> = {
  'fms.sentadilla': 'Con los talones sobre el alza',
  'nine.sentadilla': 'Con la tabla de 4 cm',
}

const coma = (n: number, d = 1) => n.toFixed(d).replace('.', ',')

const sinNota = (explicacion: string, extra: Partial<Sugerencia> = {}): Sugerencia =>
  ({ nota: null, limite: false, explicacion, criterios: [], falta: [], clave: null, ...extra })

/* ── Movilidad de hombro ── */

/** A cuánto de los umbrales (1 y 1,5 palmas) se da por «en el límite»: lo que se yerra al tocar cuatro puntos. */
export const MARGEN_PALMAS = 0.08

function hombro(d: DatosSugerencia): Sugerencia {
  const dist = d.trazos.find(t => t.tipo === 'distancia' && t.puntos.length === 2)
  const v = dist ? valorDe(dist, d.trazos) : null
  if (v == null) {
    return sinNota(dist
      ? 'Mide la palma (del pliegue de la muñeca a la punta del dedo corazón) y la app dice a qué nota apunta.'
      : 'Mide la palma y la distancia entre los puños, y la app dice a qué nota apunta.')
  }
  const nota = v < 1 ? 3 : v < 1.5 ? 2 : 1
  const limite = Math.abs(v - 1) < MARGEN_PALMAS || Math.abs(v - 1.5) < MARGEN_PALMAS
  const donde = v < 1 ? 'a menos de una palma' : v < 1.5 ? 'entre una palma y palma y media' : 'a palma y media o más'
  return {
    nota, limite, clave: null, falta: [],
    explicacion: `Puños a ${coma(v)} palmas: ${donde}.` + (limite ? ' Está en el límite: míralo tú.' : ''),
    criterios: [{ clave: 'distancia', veredicto: null, texto: `${coma(v)} palmas` }],
  }
}

/* ── Elevación activa de pierna recta ── */

/** Las franjas «en el límite» alrededor de la mitad del muslo (0,5) y de la rodilla (1), en fracción del muslo. */
export const MARGEN_MUSLO = 0.12

/**
 * Dónde cae la vertical del tobillo que sube sobre el muslo de la otra pierna,
 * en fracción del muslo: 0 en la cadera, 1 en la rodilla, más de 1 por debajo de
 * la rodilla. La pierna que sube es la del tobillo más alto (más lejos del
 * suelo): no se fía de cuál llama el detector izquierda. La vertical es la del
 * suelo. null si algún punto que hace falta es dudoso o el muslo no se ve.
 */
export function caidaDelTobillo(c: Cuerpo, inclinacion = 0): number | null {
  const enSuelo = (p: Punto) => enEjesDelSuelo(p.x, p.y, inclinacion)
  const ti = c[indice('tobillo', 'i')], td = c[indice('tobillo', 'd')]
  if (!ti || !td) return null
  const sube = enSuelo(ti).y < enSuelo(td).y ? 'i' : 'd'
  const baja = sube === 'i' ? 'd' : 'i'
  const t = c[indice('tobillo', sube)], ca = c[indice('cadera', baja)], ro = c[indice('rodilla', baja)]
  if (!ca || !ro || [t, ca, ro].some(p => p.v < VISIBLE_MINIMO)) return null
  const T = enSuelo(t), H = enSuelo(ca), K = enSuelo(ro)
  const largo = K.x - H.x
  if (Math.abs(largo) < 1) return null
  return (T.x - H.x) / largo
}

function piernaRecta(d: DatosSugerencia): Sugerencia {
  if (d.vista !== 'perfil') return sinNota('La app mide esta prueba de perfil.')
  if (!Object.keys(d.cuerpos).length) return sinNota('Pulsa «Detectar el cuerpo» y la app mira hasta dónde sube la pierna.')
  /* El mejor momento del vídeo: donde el tobillo cae más cerca de la cadera. */
  const serie: { clave: number; valor: number }[] = []
  for (const k of Object.keys(d.cuerpos).map(Number).sort((a, b) => a - b)) {
    const f = caidaDelTobillo(conAjustes(d.cuerpos[k], d.ajustes[k]), d.inclinacion)
    if (f != null) serie.push({ clave: k, valor: f })
  }
  const limpia = sinPicos(serie, 0.25)
  if (!limpia.length) return sinNota('La app no ve bien las piernas: corrige los puntos dudosos en el momento más alto, o mírala a ojo.')
  const mejor = limpia.reduce((a, b) => (b.valor < a.valor ? b : a))
  const f = mejor.valor
  const nota = f < 0.5 ? 3 : f <= 1 ? 2 : 1
  const limite = Math.abs(f - 0.5) <= MARGEN_MUSLO || Math.abs(f - 1) <= MARGEN_MUSLO
  const donde = f < 0.5 ? 'entre la cadera y la mitad del muslo' : f <= 1 ? 'entre la mitad del muslo y la rodilla' : 'por debajo de la rodilla'
  const tanto = Math.round(Math.max(0, f) * 100)
  return {
    nota, limite, clave: mejor.clave,
    explicacion: `En lo más alto, la vertical del tobillo cae ${donde} (al ${tanto} % del muslo desde la cadera).`
      + (limite ? ' Está en el límite, y la mitad del muslo sale de los puntos del detector, no de la espina ilíaca: míralo tú.' : ''),
    criterios: [{ clave: 'tobillo', veredicto: null, texto: `al ${tanto} % del muslo` }],
    falta: ['Que la otra pierna siga apoyada y neutra (a ojo).'],
  }
}

/* ── Sentadilla profunda ── */

/** Las franjas «en el límite»: lo que yerran de perfil el tronco y la tibia, y el punto de la cadera. */
export const MARGEN_TRONCO_TIBIA = 5
export const MARGEN_FEMUR = 5

function sentadilla(d: DatosSugerencia): Sugerencia {
  const fms = d.prueba.clave === 'fms.sentadilla'
  const conAlza = fms ? 'con el alza' : 'con la tabla de 4 cm'
  const sinAlza = fms ? 'sin alza' : 'con la tabla de 2 cm'
  const falta = fms
    ? ['Rodillas alineadas sobre los pies (de frente).', 'Pica alineada sobre los pies (el detector no la ve).']
    : ['Cadera, rodilla y pie en línea, y pies paralelos (de frente).', 'Talones sobre la tabla y brazos junto a las orejas (a ojo).', 'Que la pica no pase de las puntas (el detector no la ve).']
  if (d.vista !== 'perfil') return sinNota('La app mide la sentadilla de perfil.', { falta })
  const claves = Object.keys(d.cuerpos).map(Number)
  if (!claves.length) return sinNota('Pulsa «Detectar el cuerpo» y la app mira el fondo de la sentadilla.', { falta })

  /* El fondo: la rodilla más cerrada del vídeo (sin los fotogramas raros); en una foto, la de ahora. */
  const rodilla = serieCuerpo(d.cuerpos, d.ajustes, d.ladoMedido, 'perfil', 'rodilla', d.inclinacion)
  const fondo = rodilla.length ? rodilla.reduce((a, b) => (b.valor < a.valor ? b : a)).clave : d.cuerpos[d.clave] ? d.clave : null
  if (fondo == null) return sinNota('La app no ve bien la pierna: corrige los puntos dudosos en el fondo, o mírala a ojo.', { falta })
  const m = medidasCuerpo(conAjustes(d.cuerpos[fondo], d.ajustes[fondo]), d.ladoMedido, 'perfil', d.inclinacion)
  const tt = m.find(x => x.clave === 'tronco_tibia')!
  const fe = m.find(x => x.clave === 'femur')!

  const criterios: CriterioVisto[] = []
  if (fms) {
    const v = tt.valor
    criterios.push({
      clave: 'tronco_tibia',
      veredicto: v == null || tt.dudosa ? 'limite' : v <= MARGEN_TRONCO_TIBIA ? 'cumple' : v <= 2 * MARGEN_TRONCO_TIBIA ? 'limite' : 'no',
      texto: tt.dudosa ? 'punto dudoso: corrígelo' : 'tronco ' + tt.texto + ' que la tibia',
    })
  }
  const vf = fe.valor
  criterios.push({
    clave: 'femur',
    veredicto: vf == null || fe.dudosa ? 'limite' : vf >= MARGEN_FEMUR ? 'cumple' : vf > -MARGEN_FEMUR ? 'limite' : 'no',
    texto: fe.dudosa ? 'punto dudoso: corrígelo' : 'fémur ' + fe.texto + (fe.texto === 'horizontal' ? '' : ' de la horizontal'),
  })
  /* «paralelos» y no «0° más vertical que la tibia». */
  for (const c of criterios) if (c.texto === 'tronco paralelos que la tibia') c.texto = 'tronco y tibia paralelos'

  const nombre = (c: CriterioVisto) => (c.clave === 'femur' ? 'el fémur no baja de la horizontal' : 'el tronco va más inclinado que la tibia')
  const fallan = criterios.filter(c => c.veredicto === 'no')
  const dudan = criterios.filter(c => c.veredicto === 'limite')
  const base = { criterios, falta, clave: fondo }

  if (fallan.length) {
    const que = fallan.map(nombre).join(' y ')
    return d.alza
      ? { ...base, nota: 1, limite: dudan.length > 0, explicacion: `En el fondo, ${conAlza}, ${que}: apunta a 1.` }
      : { ...base, nota: null, limite: false, explicacion: `En el fondo, ${que}: ${sinAlza} no llega al 3. Repite ${conAlza}: si se cumple, 2; si no, 1.` }
  }
  if (dudan.length) {
    return { ...base, nota: null, limite: true, explicacion: 'En el fondo, lo que se mide está en el límite: míralo tú.' }
  }
  return {
    ...base, nota: d.alza ? 2 : 3, limite: false,
    explicacion: `En el fondo, ${d.alza ? conAlza : sinAlza}, se cumple lo que se mide de perfil. Apunta a ${d.alza ? 2 : 3} si también se cumple lo de abajo.`,
  }
}

/** Lo que la app sugiere para esta prueba; null en las que la nota es a ojo. */
export function sugerirNota(d: DatosSugerencia): Sugerencia | null {
  switch (d.prueba.clave) {
    case 'fms.hombro': case 'nine.hombro': return hombro(d)
    case 'fms.pierna_recta': return piernaRecta(d)
    case 'fms.sentadilla': case 'nine.sentadilla': return sentadilla(d)
    default: return null
  }
}

/** Cómo se hizo la sentadilla, para guardarlo con la sugerencia. */
const COMO_SE_HIZO: Record<string, [string, string]> = {
  'fms.sentadilla': ['sin alza', 'con el alza'],
  'nine.sentadilla': ['con la tabla de 2 cm', 'con la tabla de 4 cm'],
}

/** Una línea para guardar con las medidas, y poder compararla luego con la nota que se puso. */
export function textoParaGuardar(s: Sugerencia, prueba: Prueba, alza: boolean): string {
  const como = COMO_SE_HIZO[prueba.clave]
  return [
    s.nota != null ? String(s.nota) : 'sin nota entera',
    s.limite ? 'en el límite' : '',
    ...s.criterios.map(c => c.texto + (c.veredicto === 'cumple' ? ' ✓' : c.veredicto === 'no' ? ' ✗' : c.veredicto === 'limite' ? ' ≈' : '')),
    como ? como[alza ? 1 : 0] : '',
  ].filter(Boolean).join(' · ')
}
