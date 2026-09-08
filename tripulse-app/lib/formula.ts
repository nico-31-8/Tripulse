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

/** Un trozo de fórmula. `ref` apunta a un resultado anterior del mismo test. */
export type Bloque =
  | { t: 'var'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'op'; v: string }
  | { t: 'num'; v: number }

/* LAS LETRAS CON TILDE SON LETRAS.
   Con `[A-Za-z_]` a secas, «metrosñ» se troceaba en «metros» —que sí existe— y
   la fórmula devolvía el valor de OTRO campo sin quejarse: un número que miente,
   no un error. Y en español eso no es un caso raro: vUAñ, V0₂máx, ritmo medio.
   El espacio sigue fuera, y por eso el nombre se valida al escribirlo. */
const LETRA = 'A-Za-zÀ-ÖØ-öø-ÿ_'
const RE_TOKENS = new RegExp('\\d+\\.?\\d*|[' + LETRA + '][' + LETRA + '0-9]*|[+\\-*/^()]', 'g')
const RE_INICIAL = new RegExp('^[' + LETRA + ']')
export const RE_NOMBRE = new RegExp('^[' + LETRA + '][' + LETRA + '0-9]*$')

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
      if (!(x in vars)) throw new Error('no existe «' + x + '»')
      const bruto = vars[x]
      /* VACÍO NO ES CERO, y hay que decirlo aquí porque JavaScript opina lo
         contrario: `Number(null)`, `Number('')` y `Number([])` son 0. Sin esta
         guarda, un campo que el entrenador no rellenó calcularía tan campante
         —una VAM de 0, un ritmo infinito— en vez de avisar de que falta. */
      if (bruto === null || bruto === undefined ||
          (typeof bruto === 'string' && bruto.trim() === '')) {
        throw new Error('falta rellenar «' + x + '»')
      }
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
  (formula || []).map(b => String(b.v)).join(' ')

/** A qué apunta una fórmula: campos por un lado, resultados por otro. */
export function dependencias(formula: Bloque[]): { campos: string[]; refs: string[] } {
  const campos = new Set<string>(), refs = new Set<string>()
  for (const b of formula || []) {
    if (b.t === 'var') campos.add(String(b.v))
    if (b.t === 'ref') refs.add(String(b.v))
  }
  return { campos: [...campos], refs: [...refs] }
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
    (f || []).map(bl => (bl.t === tipo && String(bl.v) === a ? { ...bl, v: b } : bl)))
}
