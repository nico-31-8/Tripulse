// ============================================================
// Marcar tocando la casilla
// ============================================================
//
// LA IDEA, del usuario: «en vez de hacer un montón de botones, que al darle
// encima de la casilla se vayan contando los parciales, que sean ellas las que
// actúan como los propios botones».
//
// Y tiene razón en lo que no se ve: la tabla YA dice de qué repetición y de qué
// columna es cada casilla. Un botón aparte tiene que volver a decirlo —«vas por
// la 3 de 6»— y encima puede contradecirla. Tocando la casilla no hay nada que
// explicar ni nada que pueda desdecirse.
//
// LO QUE SE GUARDA SIGUE SIENDO LO MISMO: el tiempo de CADA repetición, que es
// la resta con la marca anterior DE ESA PERSONA. Restar contra el reloj le daría
// a todos el trozo del más rápido.
//
// Por eso hace falta recordar aparte los instantes absolutos: lo que se guarda
// son duraciones, y de una duración no se puede sacar cuándo pasó.

/** Los instantes de las marcas de una persona en una columna, por repetición. */
export type Marcas = (number | undefined)[]

/**
 * El instante de la última marca, mire a la fila que mire.
 *
 * NO es «la de la fila anterior»: si tocas la 4.ª con la 3.ª en blanco, el
 * trozo que acaba de correr empieza donde acabó lo último que marcaste, no en
 * un hueco que nunca ocurrió. Y como el reloj solo va hacia delante, la última
 * marca es la más grande.
 */
export function ultimaMarca(abs: Marcas | undefined): number {
  if (!Array.isArray(abs)) return 0
  let m = 0
  for (const x of abs) if (typeof x === 'number' && Number.isFinite(x) && x > m) m = x
  return m
}

/** La primera repetición sin marcar; -1 si están todas. */
export function primeroLibre(abs: Marcas | undefined, veces: number): number {
  for (let k = 0; k < veces; k++) if (typeof abs?.[k] !== 'number') return k
  return -1
}

/**
 * Lo que se apunta al tocar la casilla de la repetición k.
 *
 * Devuelve `null` cuando no hay nada que apuntar, y el que llama no toca nada:
 * - fuera de la tabla,
 * - en una casilla ya marcada (volver a tocarla la corrige a mano, no la pisa:
 *   pisar una marca buena por un dedo gordo es de las que no se perdonan),
 * - o si no ha pasado tiempo desde la anterior, que sería una repetición de
 *   cero segundos.
 */
export function marcaEn(
  abs: Marcas | undefined,
  k: number,
  ms: number,
  enMinutos: boolean,
): { valor: string; abs: Marcas } | null {
  if (!Number.isInteger(k) || k < 0) return null
  const lista: Marcas = Array.isArray(abs) ? [...abs] : []
  if (typeof lista[k] === 'number') return null
  const dur = ms - ultimaMarca(lista)
  if (!(dur > 0)) return null
  lista[k] = ms
  /* El mismo redondeo que el botón de siempre: en minutos con dos decimales
     —un 20' de FTP— y si no en segundos con uno. */
  const valor = enMinutos ? Math.round(dur / 600) / 100 : Math.round(dur / 100) / 10
  return { valor: String(valor), abs: lista }
}

/** Quitar la última marca: devuelve qué fila se queda en blanco, o -1. */
export function deshacer(abs: Marcas | undefined): { k: number; abs: Marcas } {
  const lista: Marcas = Array.isArray(abs) ? [...abs] : []
  let k = -1
  let m = 0
  lista.forEach((x, i) => { if (typeof x === 'number' && x >= m) { m = x; k = i } })
  if (k >= 0) lista[k] = undefined
  return { k, abs: lista }
}
