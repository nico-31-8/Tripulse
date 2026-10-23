// ============================================================
// Alinear los dos vídeos de una prueba de dos vistas
// ============================================================
//
// Seis pruebas del FMS y del Nine Test se miran desde dos cámaras. Con dos
// móviles grabando a la vez, cada uno empieza en un momento distinto: para ver
// la misma repetición en los dos hay que saber cuántos fotogramas va uno por
// delante del otro. Eso es el desfase.
//
// CÓMO. Lo que sube y baja se ve igual desde las dos cámaras: las dos están
// rectas, así que lo vertical en la imagen es lo vertical en la sala, de frente,
// de perfil o desde atrás. De cada vídeo se saca, fotograma a fotograma, la
// altura de hombros, caderas, rodillas, tobillos y muñecas, cada una como la
// media de sus dos lados (así da igual qué lado tapa a cuál, o que desde atrás
// la izquierda y la derecha salgan cambiadas). Cada altura se resta su media y
// se divide por su desviación, porque cada cámara está a una distancia. Y se
// prueba cada desfase: gana el que más encaja, sumando los productos de las dos
// curvas donde se solapan (la correlación cruzada de siempre).
//
// SUMANDO, NO PROMEDIANDO. En una prueba de tres repeticiones casi iguales,
// correr el vídeo una repetición entera también encaja bien, pero solapa una
// repetición menos. Con la suma gana el desfase que solapa más; con la media
// podían empatar.
//
// SOLO LO QUE SE MUEVE. Una parte quieta (las rodillas en la elevación
// diagonal) es puro ruido: entra solo si se mueve en los dos vídeos.
//
// CUÁNDO NO. Si lo que mejor encaja se parece poco, o se solapa menos de un
// segundo y medio, no se alinea: mejor a mano que mal.

import { indice, type Cuerpo, type Parte } from './cuerpo'

/** Las partes cuya altura se compara. */
export const PARTES_ALINEAR: Parte[] = ['hombro', 'cadera', 'rodilla', 'tobillo', 'muneca']

/** Por debajo de esto (correlación media) no se da por alineado. */
export const PARECIDO_MINIMO = 0.6
/** Fotogramas que tienen que solaparse como poco: 1,5 s a 30 fotogramas por segundo. */
export const SOLAPE_MINIMO = 45
/** Una parte se mueve si su altura recorre al menos esta parte del tamaño del cuerpo. */
export const MOVIMIENTO_MINIMO = 0.04

export interface Alineacion {
  /** Fotogramas que B va por delante de A: el fotograma k de A es el k + desfase de B. */
  desfase: number
  /** Cuánto se parecen los dos movimientos con ese desfase: la correlación media, de -1 a 1. */
  parecido: number
  /** Cuántos fotogramas se solapan. */
  solape: number
}

type Serie = (number | null)[]

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

/** El valor que deja por debajo la fracción q de los datos (ordenados). */
function cuantil(ordenados: number[], q: number): number {
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.round(q * (ordenados.length - 1))))
  return ordenados[i]
}

/** Cuántos fotogramas tiene el vídeo según sus esqueletos: el último hallado más uno. */
function largo(cuerpos: Record<number, Cuerpo>): number {
  let n = 0
  for (const k of Object.keys(cuerpos)) n = Math.max(n, Number(k) + 1)
  return n
}

/** La altura de una parte en cada fotograma: la media de sus dos lados, o null si no hay cuerpo. */
export function alturaDe(cuerpos: Record<number, Cuerpo>, parte: Parte): Serie {
  const n = largo(cuerpos)
  const out: Serie = new Array(n).fill(null)
  for (const [k, c] of Object.entries(cuerpos)) {
    const ys = [c[indice(parte, 'i')], c[indice(parte, 'd')]]
      .filter(q => q && Number.isFinite(q.y)).map(q => q.y)
    if (ys.length) out[Number(k)] = media(ys)
  }
  return out
}

/** El tamaño del cuerpo en el vídeo: la mediana de lo que ocupan sus puntos (la diagonal de su caja). */
function tamanoDe(cuerpos: Record<number, Cuerpo>): number {
  const tam: number[] = []
  for (const c of Object.values(cuerpos)) {
    const qs = PARTES_ALINEAR.flatMap(p => [c[indice(p, 'i')], c[indice(p, 'd')]]).filter(q => q && Number.isFinite(q.x) && Number.isFinite(q.y))
    if (qs.length < 4) continue
    const xs = qs.map(q => q.x), ys = qs.map(q => q.y)
    tam.push(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
  }
  if (!tam.length) return 0
  tam.sort((a, b) => a - b)
  return cuantil(tam, 0.5)
}

/** La serie restada su media y dividida por su desviación; null si casi no se mueve o hay pocos fotogramas. */
function tipificar(s: Serie, tamano: number): Serie | null {
  const vals = s.filter((v): v is number => v != null)
  if (vals.length < SOLAPE_MINIMO || tamano <= 0) return null
  const orden = [...vals].sort((a, b) => a - b)
  if (cuantil(orden, 0.9) - cuantil(orden, 0.1) < MOVIMIENTO_MINIMO * tamano) return null
  const m = media(vals)
  const sd = Math.sqrt(media(vals.map(v => (v - m) ** 2)))
  if (!(sd > 0)) return null
  return s.map(v => (v == null ? null : (v - m) / sd))
}

/** Las alturas tipificadas de cada parte que se mueve en el vídeo. */
function curvasDe(cuerpos: Record<number, Cuerpo>): Partial<Record<Parte, Serie>> {
  const tamano = tamanoDe(cuerpos)
  const out: Partial<Record<Parte, Serie>> = {}
  for (const p of PARTES_ALINEAR) {
    const t = tipificar(alturaDe(cuerpos, p), tamano)
    if (t) out[p] = t
  }
  return out
}

/** La correlación de dos series donde las dos tienen dato, con B corrida `d` fotogramas. */
function correlacion(a: Serie, b: Serie, d: number): { r: number; n: number } {
  const xs: number[] = [], ys: number[] = []
  for (let k = Math.max(0, -d); k < a.length && k + d < b.length; k++) {
    const x = a[k], y = b[k + d]
    if (x != null && y != null) { xs.push(x); ys.push(y) }
  }
  if (xs.length < 3) return { r: 0, n: xs.length }
  const mx = media(xs), my = media(ys)
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy
  }
  return { r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0, n: xs.length }
}

/**
 * El desfase entre dos vídeos de la misma prueba, por sus esqueletos. null si
 * no hay con qué (sin esqueleto, nada se mueve en los dos) o si lo que mejor
 * encaja se parece poco o se solapa poco.
 */
export function alinear(a: Record<number, Cuerpo>, b: Record<number, Cuerpo>): Alineacion | null {
  const ca = curvasDe(a), cb = curvasDe(b)
  const partes = PARTES_ALINEAR.filter(p => ca[p] && cb[p])
  if (!partes.length) return null
  const na = largo(a), nb = largo(b)
  const puntua = (d: number) => {
    let suma = 0, solape = 0
    for (const p of partes) {
      const sa = ca[p]!, sb = cb[p]!
      let n = 0
      for (let k = Math.max(0, -d); k < sa.length && k + d < sb.length; k++) {
        const x = sa[k], y = sb[k + d]
        if (x != null && y != null) { suma += x * y; n++ }
      }
      solape = Math.max(solape, n)
    }
    return { d, suma, solape }
  }
  let mejor: { d: number; suma: number; solape: number } | null = null
  for (let d = -(na - 1); d <= nb - 1; d++) {
    const p = puntua(d)
    if (p.solape >= SOLAPE_MINIMO && (!mejor || p.suma > mejor.suma)) mejor = p
  }
  if (!mejor) return null
  /* Si lo mejor está en el borde de lo que se puede comparar (un fotograma más
     allá ya se solapa poco), lo de verdad puede estar fuera: no se fía. */
  if (puntua(mejor.d - 1).solape < SOLAPE_MINIMO || puntua(mejor.d + 1).solape < SOLAPE_MINIMO) return null
  const parecido = media(partes.map(p => correlacion(ca[p]!, cb[p]!, mejor!.d).r))
  if (parecido < PARECIDO_MINIMO) return null
  return { desfase: mejor.d, parecido, solape: mejor.solape }
}

/**
 * El fondo de la repetición más cercana a `cerca`: donde la cadera está más
 * abajo (la y más grande) que en el medio segundo de cada lado, y por debajo
 * de su altura mediana (así no cuenta un temblor estando de pie). null si no
 * hay esqueleto.
 */
export function fotogramaMasBajo(cuerpos: Record<number, Cuerpo>, cerca: number): number | null {
  const cadera = alturaDe(cuerpos, 'cadera')
  const vals = cadera.filter((v): v is number => v != null)
  if (!vals.length) return null
  const mediana = cuantil([...vals].sort((a, b) => a - b), 0.5)
  const fondos: number[] = []
  for (let k = 0; k < cadera.length; k++) {
    const y = cadera[k]
    if (y == null || y <= mediana) continue
    let fondo = true
    for (let j = Math.max(0, k - 15); j <= Math.min(cadera.length - 1, k + 15) && fondo; j++) {
      const o = cadera[j]
      if (j !== k && o != null && (o > y || (o === y && j < k))) fondo = false
    }
    if (fondo) fondos.push(k)
  }
  if (!fondos.length) return cadera.reduce<number>((m, y, k) => (y != null && y > (cadera[m] ?? -Infinity) ? k : m), 0)
  return fondos.reduce((a, b) => (Math.abs(b - cerca) < Math.abs(a - cerca) ? b : a))
}

/** La altura de la cadera tipificada, para dibujar las dos curvas una encima de la otra. */
export function curvaCadera(cuerpos: Record<number, Cuerpo>): Serie {
  const s = alturaDe(cuerpos, 'cadera')
  const vals = s.filter((v): v is number => v != null)
  if (vals.length < 2) return s.map(() => null)
  const m = media(vals)
  const sd = Math.sqrt(media(vals.map(v => (v - m) ** 2))) || 1
  return s.map(v => (v == null ? null : (v - m) / sd))
}
