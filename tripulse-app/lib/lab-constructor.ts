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

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export type Clase = 'dada' | 'medida'
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
}

export interface Bloque {
  clave: string
  etiqueta: string
  modo: 'cerrado' | 'abierto'
  veces: number
  /** Segundos que dura cada repetición. 0 = sin reloj. */
  duracion: number
  /** Solo para enseñarlo: dentro SIEMPRE son segundos. */
  duracionUd?: 's' | 'min'
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

export interface Resultado {
  nombre: string
  unidad: string
  formula: Bloq[]
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

/** Calcula una expresión. Lanza con el motivo, porque el motivo es lo que se enseña. */
export function evaluar(expr: string, vars: Record<string, unknown>): number {
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

/** Cómo se lee en pantalla, que no es cómo se le da al motor. */
export function etiquetaFn(b: Extract<Bloq, { t: 'fn' }>): string {
  if (!b.d && !b.h) return b.v + '(' + b.de + ')'
  if (b.d === 2 && !b.h) return b.v + '(' + b.de + ' · sin la 1.ª)'
  if (!b.d && b.h === -1) return b.v + '(' + b.de + ' · sin la última)'
  return b.v + '(' + b.de + ' · ' + (b.d || 1) + '–' + (b.h ? b.h : 'fin') + ')'
}

export const textoDe = (f: Bloq[]): string =>
  (f || []).map(b => (b.t === 'fn' ? textoFn(b) : String(b.v))).join(' ')

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

export function variablesDe(test: TestLab, datos: Datos, errores: Record<string, string>): Record<string, unknown> {
  const vars: Record<string, unknown> = {}
  for (const c of test.sueltos || []) vars[c.clave] = datos[c.clave]

  for (const bl of test.bloques || []) {
    const hechas = hechasDe(bl, datos)
    for (const c of bl.columnas) {
      const lista: unknown[] = []
      for (let k = 0; k < hechas; k++) {
        lista.push(c.clase === 'dada' ? valorDado(c, k, datos) : (datos[c.clave] as unknown[] | undefined)?.[k])
      }
      const faltan = lista.filter(vacio).length
      if (hechas === 0) {
        errores[c.clave] = '«' + c.clave + '» todavía no tiene nada' +
          (bl.modo === 'abierto' ? ': marca hasta dónde llegó' : '')
      } else if (faltan > 0) {
        /* Se dice distinto porque se arregla distinto: en un bloque cerrado
           faltan repeticiones; en uno abierto hay un hueco en medio, que
           significa que alguien se saltó una fila. */
        errores[c.clave] = bl.modo === 'cerrado'
          ? 'faltan ' + faltan + ' de ' + bl.veces + ' en «' + c.clave + '»'
          : 'hay ' + faltan + ' hueco' + (faltan === 1 ? '' : 's') + ' dentro de «' + c.clave + '»'
      }
      vars[c.clave] = lista
    }
  }
  return vars
}

export interface ValorResultado { valor: number | null; error: string | null }

export function calcular(test: TestLab, datos: Datos): ValorResultado[] {
  const errores: Record<string, string> = {}
  const vars = variablesDe(test, datos, errores)

  return (test.resultados || []).map(r => {
    if (!r.formula?.length) return { valor: null, error: 'sin fórmula' }
    /* Si una columna que usa está incompleta se dice ESO y no «no es un
       número»: el motivo es lo que le dice al entrenador qué hacer. */
    const dep = r.formula.map(b => (b.t === 'fn' ? b.de : b.t === 'var' ? b.v : null)).filter(Boolean) as string[]
    for (const d of dep) if (errores[d]) return { valor: null, error: errores[d] }
    try {
      const v = evaluar(textoDe(r.formula), vars)
      if (r.nombre) vars[r.nombre] = v
      return { valor: v, error: null }
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
  (t?.bloques || []).filter(bl => bl.duracion > 0 && bl.columnas.some(c => c.clase === 'dada' && c.tipo === 'progresion'))

/**
 * Qué relojes lleva este test, dicho en palabras.
 *
 * UN SOLO SITIO lo decide, y de él sale tanto el aviso de la vista previa como
 * los relojes de verdad: si lo dijeran dos, el aviso podría prometer un
 * cronómetro que luego no aparece.
 */
export function relojesDe(t: TestLab | null): string[] {
  const o = escalonadosDe(t).map(bl => {
    let x = 'escalones de ' + bl.duracion + ' s en «' + (bl.etiqueta || bl.clave) + '»'
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

export const escalonAhora = (bl: Bloque, ms: number): number =>
  Math.min(bl.veces, Math.floor(ms / 1000 / bl.duracion) + 1)

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
  const cd = bl.columnas.find(c => c.clase === 'dada' && c.tipo === 'progresion')
  if (!cd) return 0
  const v = Number(valorDado(cd, n - 1, datos))
  if (!Number.isFinite(v) || v <= 0) return 0
  return m / (v / 3.6) * 1000
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
    if (c.clase !== 'dada') d[c.clave] = Array.from({ length: bl.veces }, () => '')
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
  }

  t.bloques.forEach((bl, i) => {
    if (bl.ritmo === 'metros' && !bl.columnas.some(c => c.clase === 'dada' && c.tipo === 'progresion')) {
      p.push({ donde: 'bloque', indice: i, texto: 'Para pitar por metros hace falta una intensidad que suba sola' })
    }
  })

  t.resultados.forEach((r, i) => {
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
      if (b.t === 'ref' && !antes.includes(String(b.v))) {
        p.push({ donde: 'resultado', indice: i, texto: 'Usa «' + b.v + '», que no va antes que este' })
      }
    }
  })
  return p
}

export const sePuedeGuardar = (t: TestLab): boolean => pegasDe(t).length === 0
