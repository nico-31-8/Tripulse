// ============================================================
// TRIPULSE — Laboratorio: el constructor de tests (EN PRUEBAS)
// ============================================================
//
// QUÉ ES ESTO Y POR QUÉ ESTÁ APARTE. Es el modelo nuevo de «cualquier test»,
// puesto en la aplicación para poder probarlo de verdad antes de decidir si
// sustituye a lo que ya hay en /tests-propios. No lo toca: ficheros nuevos,
// ruta nueva, y no escribe en ninguna tabla. Deshacerlo es borrar estos dos
// ficheros y la carpeta de la ruta.
//
// EL MODELO. Un test = casillas sueltas + bloques de repeticiones.
//
//   LO REPETIDO NO ES LA CASILLA: ES LA REPETICIÓN. El número de veces vive en
//   el BLOQUE, así que dos columnas del mismo bloque no pueden desacoplarse: el
//   100 nº 3 y sus brazadas son la misma fila porque son la misma repetición,
//   no porque coincida el índice. Eso es lo que arregla el modelo anterior, que
//   enlazaba por posición y dejaba que una serie tuviera 6 y otra 5.
//
//   Y TODO, casilla o columna, es DADO o MEDIDO:
//     · DADO   — lo pone el entrenador antes. Es del PROTOCOLO, así que es
//                igual para todos los que hagan el test a la vez.
//     · MEDIDO — se toma durante el test. Es DE CADA UNO.
//   Esa distinción es la que deja pasar el mismo test a cinco personas sin
//   duplicar nada: el protocolo se comparte y lo medido se reparte.
//
//   Un bloque es CERRADO (6×100: si falta una repetición es un fallo de toma de
//   datos) o ABIERTO (escalonado: se para donde se para, y cuántas hubo ES el
//   dato, no un fallo).
//
// Este fichero es lógica pura: ni pantalla ni base de datos.

import type { Ancla } from './test-definicion'

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

/**
 * De dónde sale una casilla.
 *
 *   · dada      — la pone el entrenador antes. Es del PROTOCOLO: igual para todos.
 *   · medida    — se toma durante el test. Es DE CADA UNO.
 *   · calculada — sale de las otras columnas DE SU MISMA REPETICIÓN.
 *
 * La tercera existe porque sin ella tres tests muy usados daban un número
 * plausible y equivocado. En el RAST la potencia de cada sprint es
 * peso·35²/t³, y la media de las seis potencias NO es la potencia de la media
 * de los seis tiempos: con tiempos de 4,8 a 6,1 s se van un 4 %. Igual el RSI
 * del drop jump (altura/contacto de CADA salto) y el perfil carga-velocidad.
 */
export type Clase = 'dada' | 'medida' | 'calculada'
export type Instrumento = 'mano' | 'crono-seg' | 'crono-min' | 'contador'
export type TipoDada = 'progresion' | 'lista'
export type Ritmo = 'no' | 'segundos' | 'metros'

/**
 * Lo que se le puede pedir a una columna que se repite.
 *
 * SE LLAMAN `minimo` Y `maximo`, NO «mejor» Y «peor». En segundos el mejor es
 * el más pequeño y en vatios el más grande, así que «mejor» mentiría en la
 * mitad de los tests sin que nada fallara.
 */
export const FUNCIONES: Record<string, string> = {
  suma: 'todas sumadas',
  media: 'la media',
  minimo: 'la más pequeña',
  maximo: 'la más grande',
  primera: 'la primera',
  ultima: 'la última',
  cuantas: 'cuántas hubo',
}

export type Funcion = 'suma' | 'media' | 'minimo' | 'maximo' | 'primera' | 'ultima' | 'cuantas'

/**
 * Lo que se le pide a DOS columnas a la vez.
 *
 * Aquí está lo que no se resuelve sumando: el umbral a 4 mmol/L cae ENTRE dos
 * escalones y hay que buscarlo en la recta que los une, y el perfil
 * fuerza-velocidad es una recta ajustada a cuatro puntos de la que salen F0 y
 * V0. Ninguna de las dos es una media de nada.
 *
 * Y EL DMAX NO ES NI LO UNO NI LO OTRO. No se le pide a la curva un valor
 * concreto —el 4 de «umbral a 4» es un número elegido hace cuarenta años, que
 * a un atleta muy entrenado le cae demasiado arriba—: se le pregunta dónde se
 * dobla ELLA, tirando la cuerda de su primer punto al último y buscando el
 * punto que más se aparta. Eso no es una media ni una interpolación: es una
 * búsqueda por toda la curva, y por eso necesitaba su propia función.
 *
 * Y TODAS VAN CON RED, porque el peligro de estas no es que fallen: es que
 * SALEN AUNQUE ESTÉN MAL. Una media mala se ve —4.000 W en un RAST cantan—,
 * pero una recta mal ajustada devuelve su F0 y su V0 con aspecto impecable
 * aunque los puntos no formen una recta. Por eso `ajuste` existe, por eso
 * `pendiente` y `corte` avisan solos cuando el ajuste es malo o hay pocos
 * puntos, y por eso `interpola` se niega a extrapolar: pedir el umbral a 4
 * cuando el lactato solo llegó a 2,9 no es calcular, es inventar.
 */
export const FUNCIONES2: Record<string, string> = {
  interpola: 'dónde la otra llega a un valor',
  pendiente: 'cuánto sube la recta',
  corte: 'cuánto vale la recta en cero',
  ajuste: 'cuánto se fía la recta (0 a 1)',
  dmax: 'el umbral Dmax',
  dmaxmod: 'el Dmax modificado',
  curva: 'cuánto se fía la curva (0 a 1)',
}

export type Funcion2 = 'interpola' | 'pendiente' | 'corte' | 'ajuste' | 'dmax' | 'dmaxmod' | 'curva'

export const esFuncion2 = (n: string): n is Funcion2 =>
  Object.prototype.hasOwnProperty.call(FUNCIONES2, n)

/** Las que buscan el punto donde la curva más se aparta de su cuerda. */
export const esDmax = (f: Funcion2): boolean => f === 'dmax' || f === 'dmaxmod'

/** Por debajo de aquí, una recta —o una curva— dice poco. */
export const AJUSTE_MINIMO = 0.9
/** Con menos puntos que esto, la recta pasa por ellos por narices. */
export const PUNTOS_MINIMOS = 3

/**
 * El grado con el que se ajusta una curva. Tope 3, y no por gusto.
 *
 * Un polinomio de grado alto pasa cada vez más cerca de los puntos y cada vez
 * peor por en medio: se ondula entre escalón y escalón y el R² sale MEJOR
 * mientras la curva empeora. Con cuatro o siete escalones, el grado 3 es el
 * techo de lo que se puede ajustar sin empezar a dibujar ondas.
 */
export const GRADO_MAXIMO = 3
export const GRADO_CURVA = 3

/**
 * Cuánto tiene que subir el lactato de golpe para marcar el arranque del Dmax
 * modificado: 0,4 mmol/L, que es como está definido el método.
 *
 * Es una constante del protocolo, no un ajuste. Si se pudiera tocar, dos
 * entrenadores llamarían «Dmax modificado» a dos números distintos.
 */
export const SUBIDA_MOD = 0.4

/**
 * Cuánto tiene que apartarse la curva de su cuerda, como parte del recorrido
 * de la columna, para que el Dmax signifique algo. El porqué del 5 %, medido,
 * está en `dmaxDe`.
 */
export const SEPARACION_MINIMA = 0.05

/* `hasOwnProperty` y no `in`: con `in`, «toString» o «constructor» darían true
   —están en el prototipo de cualquier objeto— y una casilla llamada así se
   trataría como función. */
export const esFuncion = (n: string): n is Funcion =>
  Object.prototype.hasOwnProperty.call(FUNCIONES, n)

export const INSTRUMENTOS: Record<Instrumento, string> = {
  mano: 'A mano',
  'crono-seg': 'Cronómetro · s',
  'crono-min': 'Cronómetro · min',
  contador: 'Contador',
}

export interface Columna {
  clave: string
  etiqueta: string
  unidad: string
  clase: Clase
  instrumento: Instrumento
  /** Solo en las casillas sueltas dadas: con qué llega puesta. */
  valor?: string
  /** Solo en las dadas. */
  tipo?: TipoDada
  desde?: number
  paso?: number
  /**
   * De qué casilla se lee el arranque y el incremento.
   *
   * Existe para no repetir el fallo clásico: si el 0,5 va escrito dentro de la
   * fórmula, el día que le cambies el incremento a un atleta lento la fórmula
   * se queda con el viejo y la VAM sale mal SIN QUE NADA AVISE.
   */
  desdeRef?: string
  pasoRef?: string
  etiquetas?: string[]
  /**
   * Solo en las calculadas: de qué sale, dentro de su repetición.
   *
   * Aquí los nombres valen UN número, no la serie entera: `ts` es el tiempo de
   * ESTA repetición. Por eso no se pueden usar funciones de serie dentro —no
   * hay serie dentro de una fila— y `pegasDe` no deja guardarlo.
   */
  formula?: Bloq[]
}

/** Un trozo de una repetición: «30 s corriendo», «15 s andando». */
export interface Tramo {
  nombre: string
  segundos: number
}

export interface Bloque {
  clave: string
  etiqueta: string
  modo: 'cerrado' | 'abierto'
  veces: number
  /** Segundos que dura cada repetición. 0 = sin reloj. Si hay tramos, manda la suma. */
  duracion: number
  /** Solo para enseñarlo: dentro SIEMPRE son segundos. */
  duracionUd?: 's' | 'min'
  /**
   * La repetición partida en trozos, cuando no es todo lo mismo.
   *
   * El 30-15 IFT son 30 s corriendo y 15 s andando; el Yo-Yo IR1, 2×20 m y 10 s
   * de pausa. Sin esto el reloj sabía cuándo cambiaba de escalón pero no cuándo
   * había que dejar de correr, que es medio test.
   *
   * Cuando hay tramos, la duración de la repetición es SU SUMA y no el campo de
   * arriba: dos sitios diciendo cuánto dura una repetición es la forma segura
   * de que acaben diciendo cosas distintas. Se pregunta con `duracionDe`.
   */
  tramos?: Tramo[]
  pitaCambio?: boolean
  avisoAntes?: number
  ritmo?: Ritmo
  ritmoCada?: number
  columnas: Columna[]
}

export type Bloq =
  | { t: 'var'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'op'; v: string }
  | { t: 'num'; v: number }
  /** `media(t100, 2, 3)`: qué se pide, a qué columna y de qué tramo. */
  | { t: 'fn'; v: Funcion; de: string; d?: number; h?: number }
  /** `interpola(vel, lac, 4)`: lo que mira dos columnas a la vez. */
  | { t: 'fn2'; v: Funcion2; x: string; y: string; a?: number }
  /**
   * `antes(vam)`: lo que valió ESE resultado la vez anterior.
   *
   * Es lo único de aquí que se sale de una medición. Todo lo demás mira los
   * datos de una pasada; esto mira la de antes, para que «cuánto ha mejorado»
   * pueda ser un resultado más y no solo un número de la gráfica.
   */
  | { t: 'antes'; v: string }

export interface Resultado {
  nombre: string
  unidad: string
  formula: Bloq[]
  /**
   * Para qué sirve este número. Se reusa el vocabulario de /tests-propios
   * (lib/test-definicion) en vez de inventar otro: es la misma pregunta, y dos
   * listas de anclas acabarían diciendo cosas distintas.
   */
  ancla?: Ancla
  /** Si sale en las gráficas de evolución. Ausente = sí. */
  graf?: boolean
  /**
   * Si en esta unidad BAJAR es mejorar.
   *
   * Ausente = lo decide la unidad. Se puede fijar a mano porque de esto
   * dependen dos cosas que mienten en silencio si se equivocan: el color de la
   * flecha en la gráfica y hacia dónde va el porcentaje de una zona colgada de
   * aquí — el 95 % de 1:13 es más LENTO, no más rápido.
   */
  inverso?: boolean
}

export interface TestLab {
  nombre: string
  deporte: string
  sueltos: Columna[]
  bloques: Bloque[]
  resultados: Resultado[]
}

/** Lo medido o lo dado, tal cual se guardaría. `@clave` = hasta dónde llegó. */
export type Datos = Record<string, unknown>

export const MAX_VECES = 40

export const TEST_VACIO: TestLab = { nombre: '', deporte: 'Carrera', sueltos: [], bloques: [], resultados: [] }

export function col(o: Partial<Columna> & { clave: string }): Columna {
  return { etiqueta: '', unidad: '', clase: 'medida', instrumento: 'mano', valor: '', ...o }
}
export function fnB(v: Funcion, de: string, d?: number, h?: number): Bloq {
  const b: Bloq = { t: 'fn', v, de }
  if (d) b.d = d
  if (h !== undefined && h !== 0) b.h = h
  return b
}

// ------------------------------------------------------------
// El motor
// ------------------------------------------------------------

const LETRA = 'A-Za-zÀ-ÖØ-öø-ÿ_'
const RE_TOK = new RegExp('\\d+\\.?\\d*|[' + LETRA + '][' + LETRA + '0-9]*|[+\\-*/^(),]', 'g')
const RE_INI = new RegExp('^[' + LETRA + ']')
export const RE_NOMBRE = new RegExp('^[' + LETRA + '][' + LETRA + '0-9]*$')

/** Sin rellenar. VACÍO NO ES CERO, y JavaScript opina lo contrario. */
export const vacio = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** La palabra reservada para mirar al test anterior. */
export const PALABRA_ANTES = 'antes'

/**
 * Con qué nombre viaja hasta el motor lo del test anterior.
 *
 * Lleva `@` y `:` A PROPÓSITO: ninguna casilla puede llamarse así —`RE_NOMBRE`
 * no los admite—, de modo que un resultado del test pasado no puede taparle el
 * sitio a una columna ni al revés.
 */
export const PREFIJO_ANTES = '@antes:'

function aplicar(f: Funcion, xs: number[]): number {
  const s = xs.reduce((a, b) => a + b, 0)
  switch (f) {
    case 'suma': return s
    case 'media': return s / xs.length
    case 'minimo': return Math.min(...xs)
    case 'maximo': return Math.max(...xs)
    case 'primera': return xs[0]
    case 'ultima': return xs[xs.length - 1]
    case 'cuantas': return xs.length
    default: throw new Error('no sé calcular «' + f + '»')
  }
}

/**
 * El tramo pedido de una lista.
 *
 * `hasta` 0 = hasta la última; negativo = contando desde el final, así que -1
 * es «hasta la penúltima», o sea «sin la última». Hace falta porque en un
 * 6×100 la primera sale de pared y no compara con las demás, y porque la 1.ª
 * mitad contra la 2.ª es el índice de fatiga.
 */
export function recorta(lista: unknown[], nombre: string, d?: number, h?: number): unknown[] {
  const n = lista.length
  const de = d ? Math.max(1, d) : 1
  const a = !h ? n : (h < 0 ? n + h : Math.min(h, n))
  if (de > n) throw new Error('pides «' + nombre + '» desde la ' + de + '.ª y solo hay ' + n)
  if (a < de) throw new Error('el tramo que pides de «' + nombre + '» se queda sin ninguna: solo hay ' + n)
  return lista.slice(de - 1, a)
}

// ------------------------------------------------------------
// Las dos columnas a la vez: la recta y el punto que cae en medio
// ------------------------------------------------------------

interface Punto { x: number; y: number }

/** Las parejas (x, y) de dos columnas del mismo bloque. */
function paresDe(vars: Record<string, unknown>, nx: string, ny: string): Punto[] {
  for (const n of [nx, ny]) {
    if (!(n in vars)) throw new Error('no existe «' + n + '»')
    if (!Array.isArray(vars[n])) throw new Error('«' + n + '» no se repite: esto necesita dos columnas de un bloque')
  }
  const xs = vars[nx] as unknown[], ys = vars[ny] as unknown[]
  if (xs.length !== ys.length) {
    throw new Error('«' + nx + '» y «' + ny + '» no tienen el mismo número de repeticiones: ¿son del mismo bloque?')
  }
  const out: Punto[] = []
  for (let i = 0; i < xs.length; i++) {
    if (vacio(xs[i]) || vacio(ys[i])) continue
    const x = Number(xs[i]), y = Number(ys[i])
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('«' + nx + '» o «' + ny + '» tienen algo que no es un número')
    out.push({ x, y })
  }
  return out
}

export interface Recta { m: number; b: number; ajuste: number; n: number }

/** Mínimos cuadrados, con el R² que dice cuánto vale lo que ha salido. */
export function recta(p: Punto[]): Recta {
  const n = p.length
  if (n < 2) throw new Error('con ' + n + ' punto' + (n === 1 ? '' : 's') + ' no hay recta que ajustar')
  const sx = p.reduce((a, q) => a + q.x, 0), sy = p.reduce((a, q) => a + q.y, 0)
  const sxx = p.reduce((a, q) => a + q.x * q.x, 0), sxy = p.reduce((a, q) => a + q.x * q.y, 0)
  const den = n * sxx - sx * sx
  if (den === 0) throw new Error('todos los puntos están en la misma X: no hay recta')
  const m = (n * sxy - sx * sy) / den
  const b = (sy - m * sx) / n
  const my = sy / n
  const sst = p.reduce((a, q) => a + (q.y - my) ** 2, 0)
  const sse = p.reduce((a, q) => a + (q.y - (m * q.x + b)) ** 2, 0)
  return { m, b, ajuste: sst === 0 ? 1 : 1 - sse / sst, n }
}

/** Lo que hay que decir de una recta antes de fiarse de ella. */
function avisosDeRecta(r: Recta, nx: string, ny: string): string[] {
  const av: string[] = []
  if (r.n < PUNTOS_MINIMOS) {
    av.push('la recta de «' + nx + '»–«' + ny + '» sale de ' + r.n + ' puntos: con tan pocos pasa por ellos por narices y el ajuste no dice nada')
  } else if (r.ajuste < AJUSTE_MINIMO) {
    av.push('los puntos de «' + nx + '»–«' + ny + '» no caen bien en una recta (se fía ' +
      (Math.round(r.ajuste * 100) / 100).toString().replace('.', ',') + ' de 1): mira si el protocolo dio suficiente rango')
  }
  return av
}

/**
 * Dónde vale `objetivo` la columna `y`, buscándolo en la recta entre los dos
 * puntos que lo rodean.
 *
 * SE NIEGA A EXTRAPOLAR. Pedir el umbral a 4 mmol/L cuando el lactato solo
 * llegó a 2,9 no es calcular: es inventarse un dato que además sale con dos
 * decimales de aspecto serio.
 */
function interpolar(p: Punto[], objetivo: number, nx: string, ny: string, avisos?: string[]): number {
  if (p.length < 2) throw new Error('con ' + p.length + ' punto(s) no se puede interpolar')
  const ys = p.map(q => q.y)
  const min = Math.min(...ys), max = Math.max(...ys)
  const nEs = (v: number) => (Math.round(v * 100) / 100).toString().replace('.', ',')
  if (objetivo < min || objetivo > max) {
    throw new Error('pides ' + nEs(objetivo) + ' de «' + ny + '», que solo se movió entre ' +
      nEs(min) + ' y ' + nEs(max) + ': fuera de ahí sería inventarlo')
  }
  let cruces = 0, primero: number | null = null
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i]
    if ((a.y - objetivo) * (b.y - objetivo) > 0) continue
    if (a.y === b.y) continue
    cruces++
    if (primero === null) primero = a.x + (objetivo - a.y) * (b.x - a.x) / (b.y - a.y)
  }
  if (primero === null) throw new Error('«' + ny + '» no cruza ' + nEs(objetivo) + ' en ningún sitio')
  if (cruces > 1 && avisos) {
    avisos.push('«' + ny + '» pasa por ' + nEs(objetivo) + ' ' + cruces + ' veces: se ha cogido la primera')
  }
  return primero
}

// ------------------------------------------------------------
// La curva, y el punto donde más se aparta de su cuerda: el Dmax
// ------------------------------------------------------------

export interface Curva {
  /** Van sobre la x CENTRADA Y ESCALADA, no sobre la de verdad: usa `enCurva`. */
  coef: number[]
  ajuste: number
  n: number
  grado: number
  xm: number
  xs: number
}

const enU = (coef: number[], u: number): number =>
  coef.reduce((a, c, i) => a + c * Math.pow(u, i), 0)

/** Cuánto vale la curva en una x de las de verdad. */
export const enCurva = (c: Curva, x: number): number => enU(c.coef, (x - c.xm) / c.xs)

/**
 * Ajusta un polinomio a los puntos, por mínimos cuadrados.
 *
 * LA X SE CENTRA Y SE ESCALA antes de ajustar. Sin eso, con velocidades de 8 a
 * 20 el sistema maneja sumas de x⁶ y pierde cifras por el camino: el mismo test
 * daría un ajuste distinto según la columna estuviera en km/h o en m/s, que es
 * justo lo que no puede pasar.
 */
export function polinomio(p: Punto[], grado: number): Curva {
  const g = Math.max(1, Math.min(GRADO_MAXIMO, Math.round(grado)))
  const n = p.length
  if (n < g + 1) {
    throw new Error('una curva de grado ' + g + ' necesita al menos ' + (g + 1) + ' puntos y hay ' + n)
  }
  const equis = p.map(q => q.x)
  const xm = equis.reduce((a, v) => a + v, 0) / n
  const ancho = (Math.max(...equis) - Math.min(...equis)) / 2
  const xs = ancho > 0 ? ancho : 1
  const u = equis.map(v => (v - xm) / xs)

  /* Ecuaciones normales: A·c = b, con A[i][j] = suma de u^(i+j) y b[i] = suma
     de y·u^i. */
  const m = g + 1
  const A: number[][] = []
  for (let i = 0; i < m; i++) {
    const fila: number[] = []
    for (let j = 0; j < m; j++) fila.push(u.reduce((a, v) => a + Math.pow(v, i + j), 0))
    fila.push(p.reduce((a, q, k) => a + q.y * Math.pow(u[k], i), 0))
    A.push(fila)
  }
  /* Gauss con pivoteo: sin buscar el pivote más grande, un cero en la diagonal
     parte la eliminación y salen coeficientes infinitos. */
  for (let i = 0; i < m; i++) {
    let mejor = i
    for (let k = i + 1; k < m; k++) if (Math.abs(A[k][i]) > Math.abs(A[mejor][i])) mejor = k
    if (Math.abs(A[mejor][i]) < 1e-12) {
      throw new Error('estos puntos no dan para una curva de grado ' + g + ': ¿se repiten los valores de la columna de abajo?')
    }
    const guarda = A[i]
    A[i] = A[mejor]
    A[mejor] = guarda
    for (let k = 0; k < m; k++) {
      if (k === i) continue
      const f = A[k][i] / A[i][i]
      for (let j = i; j <= m; j++) A[k][j] -= f * A[i][j]
    }
  }
  const coef = A.map((fila, i) => fila[m] / A[i][i])

  const my = p.reduce((a, q) => a + q.y, 0) / n
  const sst = p.reduce((a, q) => a + (q.y - my) ** 2, 0)
  const sse = p.reduce((a, q, k) => a + (q.y - enU(coef, u[k])) ** 2, 0)
  return { coef, ajuste: sst === 0 ? 1 : 1 - sse / sst, n, grado: g, xm, xs }
}

/** Lo que hay que decir de una curva antes de fiarse de ella. */
function avisosDeCurva(c: Curva, nx: string, ny: string): string[] {
  const av: string[] = []
  const nEs = (v: number) => (Math.round(v * 100) / 100).toString().replace('.', ',')
  /* Con grado+1 puntos el polinomio pasa por TODOS y el R² sale 1 sin que eso
     signifique nada: el aviso tiene que salir justo cuando el número es
     perfecto, que es cuando nadie sospecha. */
  if (c.n < c.grado + 2) {
    av.push('la curva de «' + nx + '»–«' + ny + '» es de grado ' + c.grado + ' y sale de ' + c.n +
      ' puntos: con tan pocos pasa por ellos por narices y el ajuste no dice nada')
  } else if (c.ajuste < AJUSTE_MINIMO) {
    av.push('los puntos de «' + nx + '»–«' + ny + '» no caen bien en la curva (se fía ' + nEs(c.ajuste) +
      ' de 1): mira si hay alguna toma mal hecha')
  }
  return av
}

/** El Dmax solo admite estos dos. El porqué está en `aplicar2`. */
export const gradoDmaxVale = (a: number | undefined): boolean =>
  a === undefined || a === 0 || a === GRADO_CURVA

/**
 * El Dmax: dónde la curva se aparta más de la cuerda que une sus extremos.
 *
 * SE MIDE EN VERTICAL, NO EN PERPENDICULAR. Sale EXACTAMENTE el mismo punto
 * —la distancia perpendicular es la vertical multiplicada por el coseno de la
 * cuerda, y ese coseno es el mismo para todos los puntos— y se ahorra el
 * problema que trae la perpendicular: mezcla km/h con mmol/L, así que pasar la
 * velocidad a m/s movería el umbral sin que nadie tocara un dato. Además, la
 * vertical se lee: son mmol/L por debajo de la cuerda.
 *
 * Y SE APARTA HACIA ABAJO. La curva de lactato se dobla hacia arriba, así que
 * queda por debajo de su cuerda. Si ningún punto quedara por debajo, la curva
 * se dobla al revés y aquí no hay umbral que buscar: se dice, en vez de
 * devolver el menos malo.
 */
export function dmaxDe(
  bruto: Punto[], mod: boolean, grado: number,
  nx: string, ny: string, avisos?: string[],
): number {
  /* EL GRADO NO ES UN GUSTO, y se rechaza AQUÍ y no en quien llama: con grado
     1 la curva ajustada ES una recta, la cuerda une dos de sus puntos y la
     separación vale cero en todas partes —el barrido acaba devolviendo el
     máximo del ruido de la coma flotante, un número creíble salido de la
     nada—; con grado 2 la cuerda une dos puntos de una parábola, y el punto
     que más se aparta de la cuerda de una parábola cae SIEMPRE en el centro
     exacto del rango, se midiera lo que se midiera. Las dos devuelven un
     número impecable que no mide nada, que es justo el fallo del que hay que
     protegerse aquí. */
  if (!gradoDmaxVale(grado)) {
    throw new Error('el Dmax se busca sobre los escalones medidos (0) o sobre una curva de grado ' + GRADO_CURVA +
      ': con grado 1 la curva es la propia cuerda y con grado 2 el punto sale siempre en el centro del rango')
  }
  /* Ordenado por x: la cuerda va del primer escalón al último, y «la primera
     subida de 0,4» es entre escalones consecutivos. Tal y como venga tecleado
     no tiene por qué estarlo. */
  const p = [...bruto].sort((a, b) => a.x - b.x)
  const n = p.length
  if (n < 3) throw new Error('el Dmax necesita al menos 3 escalones y hay ' + n + ': con dos, la cuerda ES la curva')

  const nEs = (v: number) => String(v).replace('.', ',')
  let i0 = 0
  if (mod) {
    i0 = -1
    /* El pelín de margen NO es manía: 1,7 − 1,3 da 0,3999999999999999 en coma
       flotante, así que la subida de 0,4 que el entrenador ve escrita en su
       hoja se colaba por debajo del listón. Costaba un escalón entero de
       umbral —15 km/h en vez de 14— sin que nada fallara. */
    for (let i = 0; i + 1 < n; i++) if (p[i + 1].y - p[i].y >= SUBIDA_MOD - 1e-9) { i0 = i; break }
    if (i0 < 0) {
      throw new Error('«' + ny + '» nunca sube ' + nEs(SUBIDA_MOD) +
        ' de un escalón al siguiente: el Dmax modificado no tiene dónde empezar')
    }
    if (i0 > n - 3) {
      throw new Error('la subida de ' + nEs(SUBIDA_MOD) + ' de «' + ny +
        '» aparece ya al final: de ahí al último escalón no queda curva que medir')
    }
  }

  const A = p[i0], B = p[n - 1]
  if (!(B.x > A.x)) throw new Error('los valores de «' + nx + '» no suben: no hay cuerda que trazar')

  const sinDoblar = () => new Error('«' + ny + '» no se dobla hacia arriba entre esos escalones: ' +
    'ninguno queda por debajo de la cuerda, así que el Dmax no tiene dónde caer')

  /**
   * CUÁNTO SE DOBLA, y no solo dónde.
   *
   * Un lactato que sube en línea recta también tiene un punto que se aparta un
   * pelín de su cuerda, y el Dmax lo devuelve tan contento. Con seis escalones
   * clavados en una recta salía un umbral de 11,045, con una separación de
   * 0,00003 mmol/L: un número inventado con toda la pinta de dato.
   *
   * El listón sale de medirlo: las curvas que de verdad hacen codo se separan
   * entre un 17 % y un 70 % del recorrido del lactato, y las que no llegan a
   * doblarse se quedan por debajo del 1 %. En medio no hay nada, así que el
   * 5 % separa las dos familias con sitio de sobra a los dos lados.
   */
  const rango = Math.max(...p.map(q => q.y)) - Math.min(...p.map(q => q.y))
  const tres = (v: number) => (Math.round(v * 1000) / 1000).toString().replace('.', ',')
  const avisaSiApenas = (s: number) => {
    if (!avisos || !(rango > 0) || s / rango >= SEPARACION_MINIMA) return
    avisos.push('«' + nx + '»–«' + ny + '» apenas se dobla: se separa ' + tres(s) +
      ' de la cuerda en un recorrido de ' + tres(rango) + '. El Dmax sale donde sale, pero ahí no hay codo')
  }

  if (grado <= 0) {
    /* Sobre los escalones medidos: el umbral CAE en uno de ellos. Los dos
       extremos están en la cuerda por definición, así que no se miran. */
    const cuerda = (x: number) => A.y + (B.y - A.y) * (x - A.x) / (B.x - A.x)
    let mejor = -1, sep = 0
    for (let i = i0 + 1; i < n - 1; i++) {
      const s = cuerda(p[i].x) - p[i].y
      if (mejor < 0 || s > sep) { mejor = i; sep = s }
    }
    if (mejor < 0 || !(sep > 0)) throw sinDoblar()
    avisaSiApenas(sep)
    return p[mejor].x
  }

  const c = polinomio(p, grado)
  if (avisos) for (const av of avisosDeCurva(c, nx, ny)) avisos.push(av)
  const yA = enCurva(c, A.x), yB = enCurva(c, B.x)
  const sepEn = (x: number) => yA + (yB - yA) * (x - A.x) / (B.x - A.x) - enCurva(c, x)

  /* Barrido grueso y luego fino alrededor del mejor. Una cúbica menos una
     recta puede tener dos jorobas, así que una búsqueda que dé por hecha una
     sola se quedaría tan contenta en la equivocada. */
  const barre = (a: number, b: number, pasos: number) => {
    let mx = a, ms = -Infinity
    for (let k = 0; k <= pasos; k++) {
      const x = a + (b - a) * k / pasos
      const s = sepEn(x)
      if (s > ms) { ms = s; mx = x }
    }
    return { x: mx, s: ms }
  }
  const paso = (B.x - A.x) / 500
  const g1 = barre(A.x, B.x, 500)
  const g2 = barre(Math.max(A.x, g1.x - paso), Math.min(B.x, g1.x + paso), 200)
  if (!(g2.s > 0)) throw sinDoblar()
  avisaSiApenas(g2.s)

  /* En el borde significa que la curva no llega a doblarse dentro de lo
     medido. El número sale igual —y con aspecto de umbral— así que se dice. */
  if (avisos && (g2.x - A.x <= paso || B.x - g2.x <= paso)) {
    avisos.push('el Dmax de «' + nx + '»–«' + ny + '» cae en el borde de lo medido: la curva no llega a doblarse dentro del rango, ' +
      'mira si el test subió lo suficiente')
  }
  return Math.round(g2.x * 1000) / 1000
}

function aplicar2(f: Funcion2, vars: Record<string, unknown>, nx: string, ny: string, a: number | undefined, avisos?: string[]): number {
  const p = paresDe(vars, nx, ny)
  if (f === 'interpola') {
    if (a === undefined || !Number.isFinite(a)) throw new Error('«interpola» necesita saber a qué valor')
    return interpolar(p, a, nx, ny, avisos)
  }

  /* Qué grado vale lo dice `dmaxDe`, no esto: si lo mirasen los dos, un día
     dirían cosas distintas. */
  if (esDmax(f)) return dmaxDe(p, f === 'dmaxmod', a === undefined ? GRADO_CURVA : a, nx, ny, avisos)

  if (f === 'curva') {
    const c = polinomio(p, a === undefined ? GRADO_CURVA : a)
    if (avisos) for (const av of avisosDeCurva(c, nx, ny)) avisos.push(av)
    return c.ajuste
  }

  const r = recta(p)
  if (avisos) for (const av of avisosDeRecta(r, nx, ny)) avisos.push(av)
  if (f === 'pendiente') return r.m
  if (f === 'corte') return r.b
  return r.ajuste
}

/**
 * Calcula una expresión. Lanza con el motivo, porque el motivo es lo que se
 * enseña. Y si hay algo que decir sin llegar a fallar, cae en `avisos`.
 */
export function evaluar(expr: string, vars: Record<string, unknown>, avisos?: string[]): number {
  const t = String(expr).match(RE_TOK) || []
  let i = 0
  const mirar = () => t[i]
  const comer = () => t[i++]

  function expresion(): number {
    let v = termino()
    while (mirar() === '+' || mirar() === '-') { const o = comer(); const d = termino(); v = o === '+' ? v + d : v - d }
    return v
  }
  function termino(): number {
    let v = potencia()
    while (mirar() === '*' || mirar() === '/') {
      const o = comer(); const d = potencia()
      if (o === '/' && d === 0) throw new Error('división por cero')
      v = o === '*' ? v * d : v / d
    }
    return v
  }
  function potencia(): number {
    const v = unario()
    if (mirar() === '^') { comer(); return Math.pow(v, potencia()) }
    return v
  }
  function unario(): number {
    if (mirar() === '-') { comer(); return -unario() }
    if (mirar() === '+') { comer(); return unario() }
    return atomo()
  }
  function atomo(): number {
    const x = comer()
    if (x === undefined) throw new Error('la fórmula está a medias')
    if (x === '(') { const v = expresion(); if (comer() !== ')') throw new Error('falta cerrar un paréntesis'); return v }
    if (/^\d/.test(x)) return parseFloat(x)
    if (RE_INI.test(x)) {
      /* El test anterior: `antes(vam)`.
         SE DISTINGUE «no hay anterior» DE «el anterior no salió» porque se
         arreglan distinto: lo primero se arregla pasando el test otra vez
         dentro de unas semanas, y lo segundo yendo a la medición de aquel día
         a ver qué le faltaba. Un solo mensaje para los dos mandaría a buscar
         datos que no existen. */
      if (x === PALABRA_ANTES && mirar() === '(') {
        comer()
        const quien = comer()
        if (quien === undefined || !RE_INI.test(quien)) throw new Error('«antes» necesita el nombre de un resultado dentro')
        if (comer() !== ')') throw new Error('falta cerrar el paréntesis de «antes»')
        const clave = PREFIJO_ANTES + quien
        if (!(clave in vars)) throw new Error('no hay un test anterior con el que comparar «' + quien + '»')
        const previo = vars[clave]
        if (previo === null || previo === undefined) throw new Error('en el test anterior, «' + quien + '» no llegó a salir')
        const n = Number(previo)
        if (!Number.isFinite(n)) throw new Error('en el test anterior, «' + quien + '» no llegó a salir')
        return n
      }

      /* Las de dos columnas: `interpola(vel, lac, 4)`, `pendiente(carga, vel)`. */
      if (esFuncion2(x) && mirar() === '(') {
        comer()
        const nx = comer()
        if (nx === undefined || !RE_INI.test(nx)) throw new Error('«' + x + '» necesita dos columnas dentro')
        if (comer() !== ',') throw new Error('«' + x + '» necesita dos columnas separadas por una coma')
        const ny = comer()
        if (ny === undefined || !RE_INI.test(ny)) throw new Error('a «' + x + '» le falta la segunda columna')
        let a: number | undefined
        if (mirar() === ',') {
          comer()
          let neg = 1
          if (mirar() === '-') { comer(); neg = -1 }
          const num = parseFloat(comer())
          a = Number.isFinite(num) ? neg * num : undefined
        }
        if (comer() !== ')') throw new Error('falta cerrar el paréntesis de «' + x + '»')
        return aplicar2(x, vars, nx, ny, a, avisos)
      }

      if (esFuncion(x) && mirar() === '(') {
        comer()
        const serie = comer()
        if (serie === undefined || !RE_INI.test(serie)) throw new Error('«' + x + '» necesita una columna dentro')
        /* El signo va aparte del número: el troceador saca «-» y «1» como dos
           piezas, así que un «hasta» negativo se leería como un menos suelto. */
        const leerArg = () => {
          let neg = 1
          if (mirar() === '-') { comer(); neg = -1 }
          const v = parseFloat(comer())
          return Number.isFinite(v) ? neg * v : 0
        }
        let d = 0, h = 0
        if (mirar() === ',') { comer(); d = leerArg(); if (mirar() === ',') { comer(); h = leerArg() } }
        if (comer() !== ')') throw new Error('falta cerrar el paréntesis de «' + x + '»')
        if (!(serie in vars)) throw new Error('no existe «' + serie + '»')
        const lista = vars[serie]
        if (!Array.isArray(lista)) throw new Error('«' + serie + '» no se repite: quita el ' + x + '()')
        if (lista.length === 0) throw new Error('«' + serie + '» está vacía')
        return aplicar(x, recorta(lista, serie, d, h).map(v => {
          const n = Number(v)
          if (!Number.isFinite(n)) throw new Error('«' + serie + '» tiene algo que no es un número')
          return n
        }))
      }
      if (!(x in vars)) throw new Error('no existe «' + x + '»')
      const bruto = vars[x]
      /* `Number(['74.2'])` es 74,2 tan tranquilo: sin esta guarda, una columna
         de una sola repetición se colaría como número suelto y la de seis daría
         NaN — la misma casilla comportándose de dos maneras. */
      if (Array.isArray(bruto)) throw new Error('«' + x + '» se repite: usa suma(' + x + '), media(' + x + ')…')
      if (vacio(bruto)) throw new Error('falta rellenar «' + x + '»')
      const n = Number(bruto)
      if (!Number.isFinite(n)) throw new Error('«' + x + '» no es un número')
      return n
    }
    throw new Error('no entiendo «' + x + '»')
  }

  const r = expresion()
  if (i < t.length) throw new Error('sobra «' + t[i] + '»')
  if (!Number.isFinite(r)) throw new Error('el resultado no es un número')
  return r
}

export const textoFn = (b: Extract<Bloq, { t: 'fn' }>): string =>
  b.v + '(' + b.de + (b.d || b.h ? ', ' + (b.d || 1) + ', ' + (b.h || 0) : '') + ')'

export const textoFn2 = (b: Extract<Bloq, { t: 'fn2' }>): string =>
  b.v + '(' + b.x + ', ' + b.y + (b.a === undefined ? '' : ', ' + b.a) + ')'

/** Cómo se lee una de dos columnas: por lo que pregunta, no por su sintaxis. */
export function etiquetaFn2(b: Extract<Bloq, { t: 'fn2' }>): string {
  const n = (v: number) => String(v).replace('.', ',')
  if (b.v === 'interpola') return b.x + ' cuando ' + b.y + ' = ' + (b.a === undefined ? '?' : n(b.a))
  if (b.v === 'pendiente') return 'pendiente ' + b.x + '→' + b.y
  if (b.v === 'corte') return 'corte ' + b.x + '→' + b.y
  /* Sobre qué se ha buscado va EN LA ETIQUETA y no escondido en el número: el
     Dmax de los escalones y el de la curva son dos números distintos, y el
     entrenador tiene que ver cuál está mirando sin abrir nada. */
  if (esDmax(b.v)) {
    return (b.v === 'dmaxmod' ? 'Dmax mod ' : 'Dmax ') + b.x + '→' + b.y +
      ' (' + (b.a === 0 ? 'escalones' : 'curva') + ')'
  }
  if (b.v === 'curva') return 'se fía la curva ' + b.x + '→' + b.y
  return 'se fía ' + b.x + '→' + b.y
}

/** Cómo se lee en pantalla, que no es cómo se le da al motor. */
export function etiquetaFn(b: Extract<Bloq, { t: 'fn' }>): string {
  /* Un tramo de UNA repetición no necesita función: la suma, la media y el
     máximo de un solo número son el mismo número. Así que se lee por lo que
     es —«la 2.ª de t100»— en vez de por cómo está guardado. */
  if (b.d && b.d === b.h) return 'la ' + b.d + '.ª de ' + b.de
  if (!b.d && !b.h) return b.v + '(' + b.de + ')'
  if (b.d === 2 && !b.h) return b.v + '(' + b.de + ' · sin la 1.ª)'
  if (!b.d && b.h === -1) return b.v + '(' + b.de + ' · sin la última)'
  return b.v + '(' + b.de + ' · ' + (b.d || 1) + '–' + (b.h ? b.h : 'fin') + ')'
}

export const textoDe = (f: Bloq[]): string =>
  (f || []).map(b => (
    b.t === 'fn' ? textoFn(b)
      : b.t === 'fn2' ? textoFn2(b)
        : b.t === 'antes' ? PALABRA_ANTES + '(' + b.v + ')'
          : String(b.v)
  )).join(' ')

/** A qué casillas apunta una fórmula, sean sueltas o de un bloque. */
export const camposDe = (f: Bloq[]): string[] => {
  const o: string[] = []
  for (const b of f || []) {
    if (b.t === 'fn') o.push(b.de)
    else if (b.t === 'var') o.push(b.v)
    else if (b.t === 'fn2') o.push(b.x, b.y)
  }
  return [...new Set(o)]
}

/** El valor de una columna dada en la repetición `k` (desde 0). */
export function valorDado(c: Columna, k: number, datos: Datos): string | number {
  if (c.tipo === 'lista') { const e = (c.etiquetas || [])[k]; return e === undefined ? '' : e }
  const d0 = c.desdeRef ? Number(datos[c.desdeRef]) : Number(c.desde)
  const p0 = c.pasoRef ? Number(datos[c.pasoRef]) : Number(c.paso)
  const d = Number.isFinite(d0) ? d0 : 0
  const p = Number.isFinite(p0) ? p0 : 0
  return Math.round((d + p * k) * 1000) / 1000
}

/**
 * Hasta dónde llegó ESTA persona.
 *
 * En un bloque abierto manda el marcador, no las columnas medidas. Sin él, un
 * escalonado sin nada que medir —una VAM: solo anotas hasta dónde llegó— daría
 * cero repeticiones hechas.
 */
export function hechasDe(bl: Bloque, datos: Datos): number {
  if (bl.modo !== 'abierto') return bl.veces
  const m = Number(datos['@' + bl.clave])
  if (Number.isFinite(m) && m > 0) return Math.min(m, bl.veces)
  const med = bl.columnas.filter(c => c.clase === 'medida')
  let ult = 0
  for (let k = 0; k < bl.veces; k++) {
    if (med.some(c => !vacio((datos[c.clave] as unknown[] | undefined)?.[k]))) ult = k + 1
  }
  return ult
}

/**
 * Lo que vale cada columna del bloque en la repetición `k`.
 *
 * LAS CALCULADAS SE HACEN AQUÍ, dentro de la fila, y en el orden en que están:
 * cada una ve las de antes. Así `potencia` puede salir del tiempo de SU sprint
 * y no del promedio de los seis, que es otro número.
 *
 * Si a una calculada le falta algún ingrediente, el hueco se propaga: la
 * repetición se queda vacía y lo dirá el recuento de huecos, que es el mensaje
 * que de verdad ayuda. Un error de la fórmula —dividir por cero— sí se guarda,
 * porque ese hay que arreglarlo y no se arregla midiendo otra vez.
 */
export function filaDe(
  bl: Bloque, k: number, datos: Datos,
  sueltos: Record<string, unknown>,
  errores?: Record<string, string>,
): Record<string, unknown> {
  const fila: Record<string, unknown> = { ...sueltos }
  for (const c of bl.columnas) {
    if (c.clase === 'dada') { fila[c.clave] = valorDado(c, k, datos); continue }
    if (c.clase === 'medida') { fila[c.clave] = (datos[c.clave] as unknown[] | undefined)?.[k]; continue }

    if (!c.formula?.length) { fila[c.clave] = ''; continue }
    if (camposDe(c.formula).some(d => vacio(fila[d]))) { fila[c.clave] = ''; continue }
    try {
      fila[c.clave] = evaluar(textoDe(c.formula), fila)
    } catch (e) {
      fila[c.clave] = ''
      if (errores && !errores[c.clave]) {
        errores[c.clave] = 'en «' + c.clave + '», repetición ' + (k + 1) + ': ' + ((e as Error)?.message || 'no se pudo calcular')
      }
    }
  }
  return fila
}

export function variablesDe(test: TestLab, datos: Datos, errores: Record<string, string>): Record<string, unknown> {
  const vars: Record<string, unknown> = {}
  for (const c of test.sueltos || []) vars[c.clave] = datos[c.clave]

  for (const bl of test.bloques || []) {
    const hechas = hechasDe(bl, datos)
    const series: Record<string, unknown[]> = {}
    for (const c of bl.columnas) series[c.clave] = []
    /* Repetición a repetición y no columna a columna: una calculada necesita a
       sus compañeras de FILA, no la serie de al lado. */
    for (let k = 0; k < hechas; k++) {
      const fila = filaDe(bl, k, datos, vars, errores)
      for (const c of bl.columnas) series[c.clave].push(fila[c.clave])
    }

    for (const c of bl.columnas) {
      const lista = series[c.clave]
      const faltan = lista.filter(vacio).length
      if (hechas === 0) {
        errores[c.clave] = '«' + c.clave + '» todavía no tiene nada' +
          (bl.modo === 'abierto' ? ': marca hasta dónde llegó' : '')
      } else if (faltan > 0 && !errores[c.clave]) {
        /* Se dice distinto porque se arregla distinto: en un bloque cerrado
           faltan repeticiones; en uno abierto hay un hueco en medio, que
           significa que alguien se saltó una fila. Y si la columna ya traía un
           error suyo —una fórmula que revienta— ese manda: «faltan 6 de 6» le
           haría buscar datos que sí están. */
        errores[c.clave] = bl.modo === 'cerrado'
          ? 'faltan ' + faltan + ' de ' + bl.veces + ' en «' + c.clave + '»'
          : 'hay ' + faltan + ' hueco' + (faltan === 1 ? '' : 's') + ' dentro de «' + c.clave + '»'
      }
      vars[c.clave] = lista
    }
  }
  return vars
}

export interface ValorResultado {
  valor: number | null
  error: string | null
  /**
   * Lo que hay que saber antes de fiarse del número, sin que llegue a ser un
   * fallo. Una media mala se ve; una recta mal ajustada devuelve su F0 y su V0
   * con aspecto impecable, así que el aviso tiene que salir SOLO — no depender
   * de que el entrenador se acuerde de añadir un resultado con el ajuste.
   */
  avisos?: string[]
}

/**
 * Los resultados de una pasada.
 *
 * `anterior` son los datos EN BRUTO de la vez de antes, y se recalculan aquí
 * igual que los de esta: los resultados no se guardan nunca, así que corregir
 * una fórmula corrige también aquello contra lo que se compara. Guardando el
 * número de aquel día, «cuánto ha mejorado» acabaría restando dos cosas
 * calculadas con fórmulas distintas.
 *
 * Y LA CADENA SE CORTA EN UNO: el test anterior se calcula SIN historial, así
 * que dentro de él `antes()` no existe. No es una limitación técnica —sería
 * fácil seguir tirando del hilo—: es que «el anterior del anterior» obligaría
 * a cargar el historial entero para pintar una fila, y nadie ha pedido nunca
 * eso. `pegasDe` lo rechaza al montarlo, que es donde se entiende.
 */
export function calcular(test: TestLab, datos: Datos, anterior?: Datos | null): ValorResultado[] {
  const errores: Record<string, string> = {}
  const vars = variablesDe(test, datos, errores)
  const lista = test.resultados || []

  if (anterior) {
    const previos = calcular(test, anterior)
    lista.forEach((r, i) => {
      if (!r.nombre) return
      const v = previos[i]
      /* La casilla se pone SIEMPRE que hay anterior, aunque aquel día no
         saliera: con la casilla puesta y vacía se puede decir «el anterior no
         salió», y sin ella solo «no hay anterior», que es otra cosa. */
      vars[PREFIJO_ANTES + r.nombre] = v && !v.error && v.valor != null ? v.valor : null
    })
  }

  return lista.map(r => {
    if (!r.formula?.length) return { valor: null, error: 'sin fórmula' }
    /* Si una columna que usa está incompleta se dice ESO y no «no es un
       número»: el motivo es lo que le dice al entrenador qué hacer. */
    const dep = r.formula.map(b => (b.t === 'fn' ? b.de : b.t === 'var' ? b.v : null)).filter(Boolean) as string[]
    for (const d of dep) if (errores[d]) return { valor: null, error: errores[d] }
    try {
      const avisos: string[] = []
      const v = evaluar(textoDe(r.formula), vars, avisos)
      if (r.nombre) vars[r.nombre] = v
      return { valor: v, error: null, ...(avisos.length ? { avisos } : {}) }
    } catch (e) {
      return { valor: null, error: (e as Error)?.message || 'no se pudo calcular' }
    }
  })
}

// ------------------------------------------------------------
// Preguntas sobre un test
// ------------------------------------------------------------

export function todasLasColumnas(t: TestLab | null): { c: Columna; bl: Bloque }[] {
  const o: { c: Columna; bl: Bloque }[] = []
  for (const bl of t?.bloques || []) for (const c of bl.columnas) o.push({ c, bl })
  return o
}

export function buscaCol(t: TestLab | null, clave: string): { c: Columna; bl: Bloque | null } | null {
  const s = (t?.sueltos || []).find(c => c.clave === clave)
  if (s) return { c: s, bl: null }
  return todasLasColumnas(t).find(x => x.c.clave === clave) || null
}

export function clavesRepetidas(t: TestLab): string[] {
  const vistas: Record<string, boolean> = {}, malas: string[] = []
  for (const c of (t.sueltos || []).concat(todasLasColumnas(t).map(x => x.c))) {
    if (vistas[c.clave]) malas.push(c.clave)
    vistas[c.clave] = true
  }
  return [...new Set(malas)]
}

export function nuevaClave(t: TestLab, base: string): string {
  let n = 1, c = base
  while (buscaCol(t, c)) { n++; c = base + n }
  return c
}

export const cronosDe = (t: TestLab | null) =>
  todasLasColumnas(t).filter(x => x.c.clase === 'medida' && x.c.instrumento.indexOf('crono') === 0)

export const escalonadosDe = (t: TestLab | null): Bloque[] =>
  (t?.bloques || []).filter(bl => duracionDe(bl) > 0 && !!columnaDeVelocidad(bl, {}))

/**
 * Qué relojes lleva este test, dicho en palabras.
 *
 * UN SOLO SITIO lo decide, y de él sale tanto el aviso de la vista previa como
 * los relojes de verdad: si lo dijeran dos, el aviso podría prometer un
 * cronómetro que luego no aparece.
 */
export function relojesDe(t: TestLab | null): string[] {
  const o = escalonadosDe(t).map(bl => {
    let x = bl.tramos?.length
      ? 'repeticiones de ' + bl.tramos.map(tr => tr.segundos + ' s ' + tr.nombre).join(' + ') + ' en «' + (bl.etiqueta || bl.clave) + '»'
      : 'escalones de ' + duracionDe(bl) + ' s en «' + (bl.etiqueta || bl.clave) + '»'
    if (bl.ritmo === 'metros') x += ' (pita cada ' + bl.ritmoCada + ' m)'
    else if (bl.ritmo === 'segundos') x += ' (pita cada ' + bl.ritmoCada + ' s)'
    return x
  })
  for (const x of cronosDe(t)) o.push('cronómetro en «' + (x.c.etiqueta || x.c.clave) + '»')
  for (const c of t?.sueltos || []) {
    if (c.instrumento !== 'mano' && c.clase !== 'dada') {
      o.push((c.instrumento === 'contador' ? 'contador' : 'cronómetro') + ' en «' + (c.etiqueta || c.clave) + '»')
    }
  }
  return o
}

/**
 * Cuánto dura una repetición. UN SOLO SITIO lo decide.
 *
 * Con tramos manda su suma, no el campo `duracion`: dos sitios diciendo cuánto
 * dura una repetición es la forma segura de que acaben diciendo cosas
 * distintas, y aquí eso sería el reloj cantando el cambio cuando no toca.
 */
export function duracionDe(bl: Bloque): number {
  if (bl.tramos?.length) return bl.tramos.reduce((a, t) => a + (Number(t.segundos) || 0), 0)
  return bl.duracion
}

export const escalonAhora = (bl: Bloque, ms: number): number => {
  const d = duracionDe(bl)
  if (d <= 0) return 1
  return Math.min(bl.veces, Math.floor(ms / 1000 / d) + 1)
}

/** En qué trozo de la repetición se va, y cuánto le queda. */
export interface EnTramo { indice: number; nombre: string; restante: number; dentro: number }

export function tramoEn(bl: Bloque, msDentro: number): EnTramo | null {
  if (!bl.tramos?.length) return null
  const s = Math.floor(msDentro / 1000)
  let acumulado = 0
  for (let i = 0; i < bl.tramos.length; i++) {
    const dur = Number(bl.tramos[i].segundos) || 0
    if (s < acumulado + dur) {
      return { indice: i, nombre: bl.tramos[i].nombre, restante: acumulado + dur - s, dentro: s - acumulado }
    }
    acumulado += dur
  }
  const ult = bl.tramos.length - 1
  return { indice: ult, nombre: bl.tramos[ult].nombre, restante: 0, dentro: Number(bl.tramos[ult].segundos) || 0 }
}

/**
 * Cada cuánto pita DENTRO de la repetición, en ms. 0 = no pita.
 *
 * Por METROS es la course navette: el hueco se acorta solo porque la velocidad
 * sube, sin tener que escribir a mano una tabla de tiempos.
 */
export function intervaloRitmo(bl: Bloque, n: number, datos: Datos): number {
  if (bl.ritmo === 'segundos') return (Number(bl.ritmoCada) || 0) * 1000
  if (bl.ritmo !== 'metros') return 0
  const m = Number(bl.ritmoCada) || 0
  if (!m) return 0
  const cd = columnaDeVelocidad(bl, datos)
  if (!cd) return 0
  const v = Number(valorDado(cd, n - 1, datos))
  if (!Number.isFinite(v) || v <= 0) return 0
  return m / (v / 3.6) * 1000
}

/**
 * De qué columna sale la velocidad que canta el reloj.
 *
 * Vale una progresión o una LISTA de números, porque hay protocolos cuya tabla
 * de velocidades no sube parejo —el Yo-Yo IR1— y escribirla a mano era la única
 * salida. Pidiendo solo progresiones, esos tests se quedaban sin pitido.
 */
export function columnaDeVelocidad(bl: Bloque, datos: Datos): Columna | null {
  const dadas = bl.columnas.filter(c => c.clase === 'dada')
  const prog = dadas.find(c => c.tipo === 'progresion')
  if (prog) return prog
  const lista = dadas.find(c => c.tipo === 'lista' && Number.isFinite(Number(valorDado(c, 0, datos))))
  return lista || null
}

// ------------------------------------------------------------
// Los datos vacíos
// ------------------------------------------------------------

export function protoVacio(t: TestLab): Datos {
  const d: Datos = {}
  for (const c of t.sueltos || []) if (c.clase === 'dada') d[c.clave] = c.valor || ''
  return d
}

export function medVacia(t: TestLab): Datos {
  const d: Datos = {}
  for (const c of t.sueltos || []) if (c.clase !== 'dada') d[c.clave] = c.valor || ''
  for (const bl of t.bloques || []) for (const c of bl.columnas) {
    /* Las calculadas no se teclean, así que no llevan casilla: si la llevaran,
       el entrenador podría escribir encima de algo que se recalcula solo. */
    if (c.clase === 'medida') d[c.clave] = Array.from({ length: bl.veces }, () => '')
  }
  return d
}

// ------------------------------------------------------------
// Validar
// ------------------------------------------------------------

export interface Pega { donde: 'test' | 'suelto' | 'bloque' | 'columna' | 'resultado'; indice: number; texto: string }

export function pegasDe(t: TestLab): Pega[] {
  const p: Pega[] = []
  if (!t.nombre.trim()) p.push({ donde: 'test', indice: -1, texto: 'Ponle nombre al test' })
  if (!t.sueltos.length && !t.bloques.length) p.push({ donde: 'test', indice: -1, texto: 'Añade algo que se apunte' })

  for (const clave of clavesRepetidas(t)) {
    p.push({ donde: 'test', indice: -1, texto: 'La clave «' + clave + '» está dos veces' })
  }

  const todas = (t.sueltos || []).concat(todasLasColumnas(t).map(x => x.c))
  for (const c of todas) {
    if (!RE_NOMBRE.test(c.clave)) p.push({ donde: 'test', indice: -1, texto: '«' + c.clave + '» no vale de clave: solo letras, números y guion bajo' })
    else if (esFuncion(c.clave)) p.push({ donde: 'test', indice: -1, texto: '«' + c.clave + '» ya es una función de serie: elige otra clave' })
    else if (c.clave === PALABRA_ANTES) p.push({ donde: 'test', indice: -1, texto: '«antes» está reservado para mirar al test anterior: elige otra clave' })
  }

  t.bloques.forEach((bl, i) => {
    if (bl.ritmo === 'metros' && !columnaDeVelocidad(bl, {})) {
      p.push({ donde: 'bloque', indice: i, texto: 'Para pitar por metros hace falta una velocidad en el bloque' })
    }
    if (bl.tramos?.length) {
      if (bl.tramos.some(tr => !(Number(tr.segundos) > 0))) {
        p.push({ donde: 'bloque', indice: i, texto: 'Hay un tramo sin duración en «' + (bl.etiqueta || bl.clave) + '»' })
      }
      if (bl.tramos.some(tr => !tr.nombre.trim())) {
        p.push({ donde: 'bloque', indice: i, texto: 'Ponle nombre a cada tramo de «' + (bl.etiqueta || bl.clave) + '»' })
      }
    }

    /* Una calculada solo ve lo de SU fila, y solo lo que va ANTES que ella.
       Nombrar a una posterior la dejaría apoyándose en algo que todavía no
       existe, y dos que se nombraran entre sí no tendrían salida. */
    bl.columnas.forEach((c, ci) => {
      if (c.clase !== 'calculada') return
      if (!c.formula?.length) {
        p.push({ donde: 'columna', indice: i, texto: '«' + c.clave + '» no tiene de qué salir: ponle una fórmula' })
        return
      }
      if (c.formula.some(b => b.t === 'fn' || b.t === 'fn2')) {
        p.push({ donde: 'columna', indice: i, texto: 'En «' + c.clave + '» no valen suma(), media() ni las de dos columnas: aquí cada nombre es UNA repetición, no la serie' })
      }
      /* Ni mirar atrás: una columna se calcula con lo de SU fila, y la fila
         equivalente del test pasado no existe —aquel día pudo tener otro
         número de repeticiones—. Lo que se compara entre tests son los
         resultados, que sí son un número cada uno. */
      if (c.formula.some(b => b.t === 'antes')) {
        p.push({ donde: 'columna', indice: i, texto: 'En «' + c.clave + '» no vale mirar al test anterior: eso se hace en un resultado, no en una columna' })
      }
      const antes = bl.columnas.slice(0, ci).map(x => x.clave)
      const fuera = t.sueltos.map(x => x.clave)
      for (const d of camposDe(c.formula)) {
        if (fuera.includes(d) || antes.includes(d)) continue
        p.push({
          donde: 'columna', indice: i,
          texto: bl.columnas.map(x => x.clave).includes(d)
            ? '«' + c.clave + '» usa «' + d + '», que va DESPUÉS: súbelo o cámbialo'
            : '«' + c.clave + '» usa «' + d + '», que no está en su bloque ni es una casilla suelta',
        })
      }
    })
  })

  t.resultados.forEach((r, i) => {
    if (r.nombre === PALABRA_ANTES) {
      p.push({ donde: 'resultado', indice: i, texto: '«antes» está reservado para mirar al test anterior: ponle otro nombre' })
    }
    if (!r.formula.length) { p.push({ donde: 'resultado', indice: i, texto: 'Sin fórmula no sale nada' }); return }
    const antes = t.resultados.slice(0, i).map(x => x.nombre)
    for (const b of r.formula) {
      if (b.t === 'var' || b.t === 'fn') {
        const clave = b.t === 'fn' ? b.de : b.v
        const x = buscaCol(t, clave)
        if (!x) { p.push({ donde: 'resultado', indice: i, texto: 'Usa «' + clave + '», que no existe' }); continue }
        if (b.t === 'var' && x.bl) p.push({ donde: 'resultado', indice: i, texto: '«' + clave + '» se repite: usa suma(' + clave + '), media(' + clave + ')…' })
        if (b.t === 'fn' && !x.bl) p.push({ donde: 'resultado', indice: i, texto: '«' + clave + '» se mide una sola vez: quita el ' + b.v + '()' })
      }
      if (b.t === 'fn2') {
        for (const clave of [b.x, b.y]) {
          const x = buscaCol(t, clave)
          if (!x) { p.push({ donde: 'resultado', indice: i, texto: 'Usa «' + clave + '», que no existe' }); continue }
          if (!x.bl) p.push({ donde: 'resultado', indice: i, texto: '«' + clave + '» se mide una sola vez: ' + b.v + '() necesita dos columnas que se repitan' })
        }
        const bx = buscaCol(t, b.x)?.bl, by = buscaCol(t, b.y)?.bl
        if (bx && by && bx !== by) {
          p.push({ donde: 'resultado', indice: i, texto: '«' + b.x + '» y «' + b.y + '» son de bloques distintos: no hay parejas que cruzar' })
        }
        if (b.v === 'interpola' && (b.a === undefined || !Number.isFinite(b.a))) {
          p.push({ donde: 'resultado', indice: i, texto: 'A «interpola» le falta decir a qué valor de «' + b.y + '»' })
        }
        /* Lo mismo que rechaza el motor, dicho aquí: si solo lo dijera al
           calcular, el test se guardaría tan tranquilo y el fallo aparecería
           el día del test, con el atleta delante. */
        if (esDmax(b.v) && !gradoDmaxVale(b.a)) {
          p.push({
            donde: 'resultado', indice: i,
            texto: 'El Dmax va sobre los escalones medidos o sobre una curva de grado ' + GRADO_CURVA +
              ': con cualquier otro grado el número sale igual y no mide nada',
          })
        }
      }
      if (b.t === 'ref' && !antes.includes(String(b.v))) {
        p.push({ donde: 'resultado', indice: i, texto: 'Usa «' + b.v + '», que no va antes que este' })
      }
      /* `antes` SÍ puede nombrar a un resultado posterior: lo que lee es el
         valor de la vez pasada, que no depende del orden de hoy. Lo que no
         puede es encadenarse, porque el test anterior se calcula sin
         historial: dentro de él `antes()` no existe. */
      if (b.t === 'antes') {
        const quien = String(b.v)
        const otro = t.resultados.find(x => x.nombre === quien)
        if (!otro) {
          p.push({ donde: 'resultado', indice: i, texto: 'Pide el anterior de «' + quien + '», que no es un resultado de este test' })
        } else if (otro === r) {
          p.push({
            donde: 'resultado', indice: i,
            texto: '«' + quien + '» no puede pedirse a sí mismo el anterior: en el test de antes tendría que mirar al de más atrás. ' +
              'Haz otro resultado que reste los dos',
          })
        } else if ((otro.formula || []).some(z => z.t === 'antes')) {
          p.push({ donde: 'resultado', indice: i, texto: '«' + quien + '» ya mira al test anterior: no se puede pedir el anterior del anterior' })
        }
      }
    }
  })
  return p
}

export const sePuedeGuardar = (t: TestLab): boolean => pegasDe(t).length === 0
