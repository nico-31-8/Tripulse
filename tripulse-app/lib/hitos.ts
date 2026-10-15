// ============================================================
// TRIPULSE — Los hitos de los que cuelgan las zonas propias
// ============================================================
//
// UN HITO ES UN NÚMERO DEL ATLETA DEL QUE SE CUELGAN ZONAS. Puede ser el que la
// app trae para ese deporte —su VAM, su FTP, su CSS— o un resultado de un test
// del entrenador: el VT1, el VT2 y el VO2máx de una prueba de esfuerzo, o el
// ritmo de 100 que sale de un 6×100.
//
// SE NOMBRA CON UNA CADENA: 'app:vam' o 'propia:<test>:<resultado>'. Es lo que
// se guarda en la clasificación, en los dos límites de cada zona y en la copia
// de la tarea; por eso hay un solo sitio que la escribe y la lee.
//
// LO QUE VALE SE PREGUNTA AQUÍ, y siempre con la última medición que dé número
// (ver referencia-propia): corriges la fórmula del test y se corrigen todas las
// zonas que cuelgan de él, sin guardar nada por atleta.
//
// ESTE FICHERO NO SABE DE ZONAS NI DE PANTALLAS: dice qué hitos hay, cómo se
// llaman, en qué unidad van y cuánto valen para alguien.

import { esInverso } from './test-definicion'
import { opcionesDeRef, valorDe, normDeporte, type TestConMediciones } from './referencia-propia'

/** Cómo se escribe el rango de una zona sobre su referencia. */
export type ModoRango = 'pct' | 'seg'

/** La referencia que la app trae para cada deporte. */
export const ANCLA_DE: Record<string, { ancla: 'vam' | 'ftp' | 'css'; nombre: string; unidad: string; modo: ModoRango; inverso: boolean }> = {
  Carrera:   { ancla: 'vam', nombre: 'VAM', unidad: 'km/h',  modo: 'pct', inverso: false },
  Ciclismo:  { ancla: 'ftp', nombre: 'FTP', unidad: 'W',     modo: 'pct', inverso: false },
  /* El CSS es el único que en las zonas DE LA APP no se manda con un
     porcentaje: sus zonas son un desfase en segundos («CSS +10 a +20 s»).
     Como hito de una clasificación sí va en %, igual que los demás: ahí todos
     los límites se leen igual, y el 95 % de un ritmo es más lento. */
  Natacion:  { ancla: 'css', nombre: 'CSS', unidad: 's/100', modo: 'seg', inverso: true },
}

export interface TestsApp { vam?: number | null; ftp?: number | null; css?: number | null }

export const idApp = (ancla: string): string => 'app:' + ancla
export const idPropia = (idDefinicion: number, indice: number): string => 'propia:' + idDefinicion + ':' + indice

/** `propia:7:0` → `{ idDefinicion: 7, indice: 0 }`. `null` si no es de esa forma. */
export function leerIdPropia(id: string): { idDefinicion: number; indice: number } | null {
  const p = String(id ?? '').split(':')
  if (p[0] !== 'propia' || p.length !== 3) return null
  const d = Number(p[1]), i = Number(p[2])
  return Number.isInteger(d) && d > 0 && Number.isInteger(i) && i >= 0 ? { idDefinicion: d, indice: i } : null
}

/** `app:vam` → `'vam'`. `null` si no es una de las tres de la app. */
export function leerIdApp(id: string): 'vam' | 'ftp' | 'css' | null {
  const m = /^app:(vam|ftp|css)$/.exec(String(id ?? ''))
  return m ? (m[1] as 'vam' | 'ftp' | 'css') : null
}

/** Si esa cadena tiene la forma de un hito. La misma regla que la base. */
export const esIdHito = (id: unknown): id is string =>
  typeof id === 'string' && (leerIdApp(id) !== null || leerIdPropia(id) !== null)

// ------------------------------------------------------------
// Qué hitos hay
// ------------------------------------------------------------

/** Un hito tal como lo ve el editor. No depende del atleta. */
export interface HitoDisponible {
  id: string
  /** Lo que se lee en una zona: «VT1», «VAM». */
  corto: string
  /** Lo que se lee al elegirlo: «Prueba de esfuerzo · VT1». */
  largo: string
  unidad: string
  /** En esta unidad bajar es mejorar: decide hacia dónde va el porcentaje. */
  inverso: boolean
  tipo: 'app' | 'propia'
}

/**
 * Los hitos que puede usar una clasificación de ese deporte.
 *
 * PRIMERO EL DE LA APP, y después los resultados de los tests del entrenador
 * que valen como referencia. FILTRADOS POR DEPORTE, y no por comodidad: una
 * zona de natación colgada de un número de carrera daría un ritmo de piscina
 * salido de una velocidad de asfalto.
 *
 * Los tests salen aunque el atleta no los tenga medidos: un hito existe por el
 * test, no por la medición, y montar las zonas antes de pasar la prueba es lo
 * normal.
 */
export function hitosDisponibles(deporte: string, propios: TestConMediciones[] | null | undefined): HitoDisponible[] {
  const dep = normDeporte(deporte)
  const out: HitoDisponible[] = []
  const a = ANCLA_DE[dep]
  if (a) {
    out.push({
      id: idApp(a.ancla), corto: a.nombre, largo: 'Su ' + a.nombre + ' · la de la app',
      unidad: a.unidad, inverso: a.inverso, tipo: 'app',
    })
  }
  for (const o of opcionesDeRef(propios || [], dep)) {
    out.push({
      id: idPropia(o.ref.idDefinicion, o.ref.indice),
      corto: o.resultado.nombre || o.test.nombre,
      largo: o.etiqueta,
      unidad: o.resultado.unidad,
      inverso: esInverso(o.resultado),
      tipo: 'propia',
    })
  }
  return out
}

export const buscarHito = (hitos: HitoDisponible[] | null | undefined, id: string | null | undefined): HitoDisponible | null =>
  (hitos || []).find(h => h.id === id) ?? null

/**
 * Si dos hitos se pueden mezclar en una misma clasificación.
 *
 * UNA CLASIFICACIÓN, UNA UNIDAD. Una zona que empieza en un VT1 en km/h y acaba
 * en un VT2 en lpm no tiene sentido: no hay un número que esté «entre» los dos.
 * La unidad la escribe el entrenador a mano, así que se compara sin espacios y
 * sin mayúsculas, y además en el mismo sentido (un tiempo no se mezcla con una
 * velocidad aunque alguien les ponga el mismo nombre).
 */
export function mismaUnidad(a: HitoDisponible, b: HitoDisponible): boolean {
  const u = (s: string) => String(s || '').toLowerCase().replace(/\s/g, '')
  return u(a.unidad) === u(b.unidad) && a.inverso === b.inverso
}

// ------------------------------------------------------------
// Cuánto vale
// ------------------------------------------------------------

export interface ValorHito {
  valor: number
  /** De qué día salió. Null en los de la app: esa fecha no viaja con ellos. */
  fecha: string | null
}

/**
 * Lo que vale ese hito para el atleta. `null` si no lo tiene medido.
 *
 * El CSS se guarda en m/s y como hito se cuenta en segundos por 100: se pasa
 * aquí, una vez, en vez de en cada pantalla que lo enseñe.
 */
export function valorHito(
  id: string,
  tests: TestsApp | null | undefined,
  propios: TestConMediciones[] | null | undefined,
): ValorHito | null {
  const app = leerIdApp(id)
  if (app) {
    const bruto = Number(tests?.[app])
    if (!Number.isFinite(bruto) || bruto <= 0) return null
    return { valor: app === 'css' ? 100 / bruto : bruto, fecha: null }
  }
  const p = leerIdPropia(id)
  if (!p) return null
  const test = (propios || []).find(t => t.id === p.idDefinicion)
  if (!test) return null
  const v = valorDe(test, p.indice)
  return v ? { valor: v.valor, fecha: v.fecha } : null
}
