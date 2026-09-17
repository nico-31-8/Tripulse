// ============================================================
// TRIPULSE — Las fórmulas de un test propio
// ============================================================
//
// Un entrenador se crea su test: unos campos que rellena al pasarlo y una o
// varias fórmulas que salen de ahí. Este fichero es solo el motor —evaluar y
// validar—; ni sabe de pantallas ni de base de datos.
//
// LA FÓRMULA ES UNA LISTA DE BLOQUES, NO UN TEXTO. Cada bloque sabe qué es: un
// campo, un resultado anterior, una operación o un número. Así no se puede
// escribir mal el nombre de un campo, porque no se escribe: se pulsa.
//
// Y SE EVALÚA SIN `eval`. Un analizador de descenso recursivo que entiende
// números, + - * / ^ y paréntesis, y nada más. Lo que no está en esa lista no
// existe, así que no hay forma de colar código aunque el texto viniera de la
// base de datos.

/**
 * Lo que se le puede pedir a una SERIE —una casilla que se mide varias veces:
 * los seis 100 de un 6×100—. Es lo único que se puede hacer con ella en una
 * fórmula: una serie no es un número y no se puede sumar a pelo.
 *
 * SE LLAMAN `minimo` Y `maximo`, NO «mejor» Y «peor». En segundos el mejor es
 * el más pequeño y en vatios el más grande, así que «mejor» mentiría en la
 * mitad de los tests sin que nada fallara. Estas dos dicen lo que hacen.
 *
 * NO HAY `cuantas`. El número de repeticiones lo fija el test y una serie a
 * medias no se calcula, así que solo podría devolver una constante.
 */
export const FUNCIONES: Record<string, string> = {
  suma: 'todas sumadas',
  media: 'la media',
  minimo: 'la más pequeña',
  maximo: 'la más grande',
  primera: 'la primera',
  ultima: 'la última',
}

export type Funcion = 'suma' | 'media' | 'minimo' | 'maximo' | 'primera' | 'ultima'

/* `hasOwnProperty` y no `in`: con `in`, «toString», «constructor» o «valueOf»
   darían true —están en el prototipo de cualquier objeto— y un campo llamado
   así se trataría como función. Acabaría en un resultado indefinido en vez de
   en un error claro. */
export const esFuncion = (n: string): n is Funcion =>
  Object.prototype.hasOwnProperty.call(FUNCIONES, n)

/** Un trozo de fórmula. `ref` apunta a un resultado anterior del mismo test. */
export type Bloque =
  | { t: 'var'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'op'; v: string }
  | { t: 'num'; v: number }
  /** `suma(t100)`: qué se le pide (`v`) y a qué serie (`de`). */
  | { t: 'fn'; v: Funcion; de: string }

/* LAS LETRAS CON TILDE SON LETRAS.
   Con `[A-Za-z_]` a secas, «metrosñ» se troceaba en «metros» —que sí existe— y
   la fórmula devolvía el valor de OTRO campo sin quejarse: un número que miente,
   no un error. Y en español eso no es un caso raro: vUAñ, V0₂máx, ritmo medio.
   El espacio sigue fuera, y por eso el nombre se valida al escribirlo. */
const LETRA = 'A-Za-zÀ-ÖØ-öø-ÿ_'
const RE_TOKENS = new RegExp('\\d+\\.?\\d*|[' + LETRA + '][' + LETRA + '0-9]*|[+\\-*/^()]', 'g')
const RE_INICIAL = new RegExp('^[' + LETRA + ']')
export const RE_NOMBRE = new RegExp('^[' + LETRA + '][' + LETRA + '0-9]*$')

/** Si una casilla está sin rellenar. VACÍO NO ES CERO. */
const vacio = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/**
 * Los números de una serie, o el motivo por el que no se puede usar.
 *
 * UNA SERIE A MEDIAS NO SE CALCULA. Si el atleta hizo cinco de los seis 100,
 * los cinco tiempos se guardan —el dato no se pierde nunca— pero `suma` no
 * devuelve la suma de cinco llamándola «el total del 6×100»: eso sería un
 * número que miente, y en una gráfica de evolución no habría forma de ver que
 * ese punto vale menos que los demás. Falla, y dice cuántas faltan.
 */
function serieDe(nombre: string, vars: Record<string, unknown>): number[] {
  if (!(nombre in vars)) throw new Error('no existe «' + nombre + '»')
  const bruto = vars[nombre]
  if (!Array.isArray(bruto)) throw new Error('«' + nombre + '» no es una serie')
  if (bruto.length === 0) throw new Error('«' + nombre + '» está vacía')

  const faltan = bruto.filter(vacio).length
  if (faltan > 0) {
    throw new Error('faltan ' + faltan + ' de ' + bruto.length + ' en «' + nombre + '»')
  }

  return bruto.map(v => {
    const n = Number(v)
    if (!Number.isFinite(n)) throw new Error('«' + nombre + '» tiene algo que no es un número')
    return n
  })
}

function aplicar(f: Funcion, xs: number[]): number {
  switch (f) {
    case 'suma': return xs.reduce((a, b) => a + b, 0)
    case 'media': return xs.reduce((a, b) => a + b, 0) / xs.length
    case 'minimo': return Math.min(...xs)
    case 'maximo': return Math.max(...xs)
    case 'primera': return xs[0]
    case 'ultima': return xs[xs.length - 1]
    /* Una función que no conocemos no puede acabar devolviendo `undefined` y
       colándose como número: si algún día se añade una arriba y se olvida
       aquí, que se note al primer cálculo. */
    default: throw new Error('no sé calcular «' + f + '»')
  }
}

/**
 * Calcula una expresión con las variables dadas. Lanza si algo no cuadra.
 *
 * Lanzar y no devolver `null` es a propósito: el motivo importa. «No existe
 * «VAM»» y «falta un paréntesis» se le enseñan al entrenador tal cual, y con un
 * null no habría nada que enseñarle.
 */
export function evaluar(expr: string, vars: Record<string, unknown>): number {
  const t = String(expr).match(RE_TOKENS) || []
  let i = 0
  const mirar = () => t[i]
  const comer = () => t[i++]

  function expresion(): number {
    let v = termino()
    while (mirar() === '+' || mirar() === '-') {
      const o = comer(); const d = termino()
      v = o === '+' ? v + d : v - d
    }
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
    if (x === '(') {
      const v = expresion()
      if (comer() !== ')') throw new Error('falta cerrar un paréntesis')
      return v
    }
    if (/^\d/.test(x)) return parseFloat(x)
    if (RE_INICIAL.test(x)) {
      /* Una función de serie: `suma(t100)`. Se reconoce porque el nombre es una
         de las nuestras Y detrás viene un paréntesis. No hay ambigüedad posible
         con un campo que se llamara igual: `motivoNombreMalo` no deja ponerle a
         un campo el nombre de una función, justo para que esto no pueda pasar. */
      if (esFuncion(x) && mirar() === '(') {
        comer()
        const serie = comer()
        if (serie === undefined || !RE_INICIAL.test(serie)) {
          throw new Error('«' + x + '» necesita una serie dentro del paréntesis')
        }
        if (comer() !== ')') throw new Error('falta cerrar el paréntesis de «' + x + '»')
        return aplicar(x, serieDe(serie, vars))
      }

      if (!(x in vars)) throw new Error('no existe «' + x + '»')
      const bruto = vars[x]
      /* UNA SERIE NO ES UN NÚMERO, y hay que decirlo aquí porque JavaScript
         opina lo contrario: `Number(['74.2'])` es 74,2 tan tranquilo. Sin esta
         guarda, una serie de una sola repetición se colaría como número suelto
         y la de seis daría NaN — dos comportamientos distintos para la misma
         casilla según cuántas veces se hubiera medido. */
      if (Array.isArray(bruto)) {
        throw new Error('«' + x + '» es una serie: usa suma(' + x + '), media(' + x + ')…')
      }
      /* VACÍO NO ES CERO, y hay que decirlo aquí porque JavaScript opina lo
         contrario: `Number(null)`, `Number('')` y `Number([])` son 0. Sin esta
         guarda, un campo que el entrenador no rellenó calcularía tan campante
         —una VAM de 0, un ritmo infinito— en vez de avisar de que falta. */
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

/** Los bloques se juntan en texto solo para el evaluador. */
export const textoDe = (formula: Bloque[]): string =>
  (formula || []).map(b => (b.t === 'fn' ? b.v + '(' + b.de + ')' : String(b.v))).join(' ')

/**
 * A qué apunta una fórmula: campos por un lado, resultados por otro.
 *
 * Un `suma(t100)` depende de `t100` igual que si lo nombrara suelto, así que
 * cuenta como campo. Si no, validar no vería esa dependencia y una fórmula que
 * usa una serie borrada se guardaría tan contenta.
 */
export function dependencias(formula: Bloque[]): { campos: string[]; refs: string[] } {
  const campos = new Set<string>(), refs = new Set<string>()
  for (const b of formula || []) {
    if (b.t === 'var') campos.add(String(b.v))
    if (b.t === 'fn') campos.add(String(b.de))
    if (b.t === 'ref') refs.add(String(b.v))
  }
  return { campos: [...campos], refs: [...refs] }
}

/** Las series que usa una fórmula, con lo que se le pide a cada una. */
export function seriesQueUsa(formula: Bloque[]): { campo: string; funcion: Funcion }[] {
  return (formula || [])
    .filter((b): b is Extract<Bloque, { t: 'fn' }> => b.t === 'fn')
    .map(b => ({ campo: String(b.de), funcion: b.v }))
}

/** Los campos que la fórmula usa como NÚMERO SUELTO, sin pasar por una función. */
export function camposSueltos(formula: Bloque[]): string[] {
  return [...new Set((formula || []).filter(b => b.t === 'var').map(b => String(b.v)))]
}

/**
 * Si una fórmula está ENCADENADA (usa otro resultado) o SUELTA (solo campos).
 *
 * No son dos mecanismos ni hay que elegir: un resultado es suelto simplemente
 * porque no nombra a ninguno anterior. Lo único que cambia es qué se mueve
 * cuando tocas otra fórmula.
 */
export const estaEncadenada = (formula: Bloque[]): boolean =>
  dependencias(formula).refs.length > 0

// ------------------------------------------------------------
// Los nombres
// ------------------------------------------------------------

export type TipoNombre = 'campo' | 'resultado'

/**
 * Si un nombre sirve para usarse en una fórmula. Devuelve el motivo, o null.
 *
 * SE VALIDA AL ESCRIBIRLO, no al evaluar, porque un nombre inválido no siempre
 * da error: «metrosñ» perdía la eñe, se quedaba en «metros» —que existe— y
 * devolvía su valor tan tranquilo. Un error se ve; un número equivocado, no.
 */
export function motivoNombreMalo(
  nombre: string | null | undefined,
  tipo: TipoNombre,
  indice: number,
  claves: { campos: string[]; resultados: string[] },
): string | null {
  const n = String(nombre ?? '').trim()
  if (!n) return 'Ponle un nombre'
  if (/\s/.test(n)) return 'Sin espacios: usa guion bajo'
  if (!RE_NOMBRE.test(n)) return 'Solo letras, números y guion bajo, y que empiece por letra'
  /* Ni «suma» ni «media» ni las demás: al evaluar, `suma(x)` se reconoce por el
     nombre, así que un campo llamado `suma` tendría dos significados según
     llevara paréntesis detrás. Se corta aquí, al escribirlo, y no al calcular. */
  if (esFuncion(n)) return 'Ese nombre ya es una función de serie: elige otro'

  const choca =
    (claves.campos || []).some((c, k) => !(tipo === 'campo' && k === indice) && String(c).trim() === n) ||
    (claves.resultados || []).some((r, k) => !(tipo === 'resultado' && k === indice) && String(r).trim() === n)
  return choca ? 'Ya hay otro que se llama así' : null
}

/**
 * Renombra en todas las fórmulas lo que apuntaba al nombre viejo.
 *
 * Los bloques ya saben a qué apuntan, así que dejarlos con el nombre antiguo
 * sería romper la cadena a propósito y obligar a recomponerla a mano. Devuelve
 * listas nuevas: no muta nada.
 *
 * Y renombra también DENTRO de las funciones: `suma(t100)` apunta a `t100` sin
 * que haya un bloque `var` que lo diga. Sin esta segunda rama, renombrar la
 * serie dejaría la fórmula apuntando a un campo que ya no existe.
 */
export function renombrarEn(
  formulas: Bloque[][],
  tipo: 'var' | 'ref',
  viejo: string,
  nuevo: string,
): Bloque[][] {
  const a = String(viejo ?? '').trim(), b = String(nuevo ?? '').trim()
  if (!a || !b || a === b) return formulas
  return (formulas || []).map(f =>
    (f || []).map(bl => {
      if (bl.t === tipo && String(bl.v) === a) return { ...bl, v: b }
      if (tipo === 'var' && bl.t === 'fn' && String(bl.de) === a) return { ...bl, de: b }
      return bl
    }))
}
