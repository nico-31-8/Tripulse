// ============================================================
// TRIPULSE — Un test que se crea el entrenador
// ============================================================
//
// QUÉ ES UN TEST AQUÍ. Unos campos que se rellenan al pasarlo y uno o varios
// resultados que salen de ellos. Cada resultado declara PARA QUÉ SIRVE:
//
//   ⚓ referencia  — un número del que se pueden colgar zonas. Da igual que sea
//                    un punto de la fisiología (VO₂máx, umbral) o una marca
//                    suya (1:13 el 100, mejor 800): la mecánica es la misma,
//                    tomar un tanto por ciento de él.
//   ◦ seguimiento — no. Está para verlo avanzar en su gráfica y nada más.
//
// LO QUE **NO** DECIDE ESTA DECLARACIÓN es si ese número puede ser la
// referencia de LA APP -la VAM, el FTP, el CSS-. Eso es otra pregunta, mucho
// más estrecha, y la contesta lib/ancla-propia: solo cabe si mide la misma
// magnitud que la columna. Un 1:13 el 100 es una referencia perfectamente
// válida para colgarle zonas propias y a la vez NO es un CSS.
//
// LAS MEDICIONES GUARDAN LOS CAMPOS EN BRUTO, NUNCA LOS RESULTADOS. Si mañana
// se corrige una fórmula, el historial entero se corrige solo. Guardando los
// resultados quedarían congelados con la fórmula vieja, y al mirar la gráfica
// no habría forma de saber cuáles se calcularon con cuál.
//
// Este fichero es lógica pura: ni pantalla ni base de datos.

import {
  evaluar, textoDe, dependencias, motivoNombreMalo,
  type Bloque,
} from './formula'

export type Ancla = 'vo2max' | 'umbral' | 'umbral_aer' | 'sprint' | 'especifica' | 'nada'
export type TipoAncla = 'referencia' | 'seguimiento'

export interface InfoAncla {
  /** Lo que se lee en el desplegable. */
  etiqueta: string
  tipo: TipoAncla
  /** Cómo se le llama en una frase: «reparto del umbral». */
  nombre: string
}

export const ANCLAS: Record<Ancla, InfoAncla> = {
  vo2max:     { etiqueta: 'VO₂máx — VAM, PAM, vVO₂máx',                tipo: 'referencia',  nombre: 'VO₂máx' },
  umbral:     { etiqueta: 'Umbral — FTP, CSS, VT2, LT2',               tipo: 'referencia',  nombre: 'umbral' },
  umbral_aer: { etiqueta: 'Umbral aeróbico — VT1, LT1',                tipo: 'referencia',  nombre: 'umbral aeróbico' },
  sprint:     { etiqueta: 'Velocidad máxima — MSS, MPP',               tipo: 'referencia',  nombre: 'velocidad máxima' },
  especifica: { etiqueta: 'Una marca tuya (1:13 el 100, mejor 800…)',  tipo: 'referencia',  nombre: 'marca' },
  nada:       { etiqueta: 'Solo seguimiento',                          tipo: 'seguimiento', nombre: 'seguimiento' },
}

/**
 * Las que se ofrecen como referencia, en el orden del desplegable.
 *
 * La marca va CON las demás y no aparte: separarlas fue el error de encuadre
 * del que salió todo esto. Lo único que la distingue es que nunca podrá ser la
 * referencia de la app, y de eso ya se encarga otro fichero.
 */
export const ANCLAS_REFERENCIA: Ancla[] =
  (Object.keys(ANCLAS) as Ancla[]).filter(a => ANCLAS[a].tipo === 'referencia')

export const esAncla = (a: string): a is Ancla => a in ANCLAS
export const tipoDeAncla = (a: string): TipoAncla => (esAncla(a) ? ANCLAS[a].tipo : 'seguimiento')

export interface CampoTest {
  clave: string
  etiqueta: string
}

export interface ResultadoTest {
  nombre: string
  unidad: string
  ancla: Ancla
  formula: Bloque[]
  /** Si sale en las gráficas de evolución. */
  graf: boolean
  /**
   * Si en esta unidad BAJAR es mejorar.
   *
   * `undefined` = lo decide la unidad (ver `menosEsMejor`). Se puede fijar a
   * mano porque de esto dependen dos cosas que mienten en silencio si se
   * equivocan: el color de la flecha en la gráfica, y hacia dónde va el
   * porcentaje de una zona colgada de aquí -el 95 % de 1:13 es más LENTO, no
   * más rápido-. La unidad la escribe el entrenador en texto libre, así que
   * adivinarla siempre no es una opción.
   */
  inverso?: boolean
}

export interface DefinicionTest {
  nombre: string
  deporte: string
  campos: CampoTest[]
  resultados: ResultadoTest[]
}

export const TEST_VACIO: DefinicionTest = {
  nombre: '', deporte: 'Carrera', campos: [], resultados: [],
}

const txt = (v: unknown): string => String(v ?? '').trim()

// ------------------------------------------------------------
// Leer lo guardado
// ------------------------------------------------------------

/**
 * Rehace una definición desde lo que hay en la base, venga como venga.
 *
 * `jsonb` normalmente llega ya como objeto, pero un cliente que lo pida como
 * texto lo devuelve en cadena, y una fila vieja puede devolver null. Ninguna de
 * las tres puede reventar la pantalla: si no se entiende, sale un test vacío.
 *
 * Y se filtra lo que no se reconoce. Lo guardado NO manda sobre el código: un
 * ancla que ya no existe se degrada a seguimiento en vez de colarse hasta el
 * cálculo de zonas.
 */
export function leerDefinicion(bruto: unknown): DefinicionTest {
  let d: any = bruto
  if (typeof d === 'string') { try { d = JSON.parse(d) } catch { return { ...TEST_VACIO } } }
  if (!d || typeof d !== 'object') return { ...TEST_VACIO }

  const campos: CampoTest[] = Array.isArray(d.campos)
    ? d.campos.map((c: any) => ({ clave: txt(c?.clave), etiqueta: txt(c?.etiqueta) })).filter((c: CampoTest) => c.clave)
    : []

  const resultados: ResultadoTest[] = Array.isArray(d.resultados)
    ? d.resultados.map((r: any) => ({
        nombre: txt(r?.nombre),
        unidad: txt(r?.unidad),
        ancla: esAncla(txt(r?.ancla)) ? txt(r?.ancla) as Ancla : 'nada',
        formula: leerFormula(r?.formula),
        graf: r?.graf !== false,
        ...(typeof r?.inverso === 'boolean' ? { inverso: r.inverso } : {}),
      })).filter((r: ResultadoTest) => r.nombre)
    : []

  return { nombre: txt(d.nombre), deporte: txt(d.deporte) || 'Carrera', campos, resultados }
}

/** Los bloques de una fórmula, tirando lo que no sea un bloque de verdad. */
export function leerFormula(bruto: unknown): Bloque[] {
  if (!Array.isArray(bruto)) return []
  const out: Bloque[] = []
  for (const b of bruto) {
    const t = txt(b?.t)
    if (t === 'num') {
      const n = Number(b?.v)
      if (Number.isFinite(n)) out.push({ t: 'num', v: n })
    } else if (t === 'var' || t === 'ref' || t === 'op') {
      const v = txt(b?.v)
      if (v) out.push({ t, v } as Bloque)
    }
  }
  return out
}

// ------------------------------------------------------------
// Calcular
// ------------------------------------------------------------

export interface ValorResultado {
  valor: number | null
  error: string | null
}

/**
 * Calcula TODOS los resultados en orden, encadenándolos.
 *
 * Cada resultado ve los campos y los resultados YA calculados, así que uno puede
 * apoyarse en otro anterior. Nombrar a uno posterior falla, y debe fallar: en
 * ese momento todavía no existe, y permitirlo abriría la puerta a que dos se
 * refieran el uno al otro sin salida.
 *
 * Un resultado que falla NO tumba a los demás: se queda con su error y los que
 * no dependían de él siguen calculándose. Los que sí dependían fallarán solos,
 * diciendo que no existe — que es la verdad.
 */
export function calcularResultados(
  def: DefinicionTest,
  datos: Record<string, unknown>,
): ValorResultado[] {
  const vars: Record<string, unknown> = {}
  for (const c of def.campos || []) if (c.clave) vars[c.clave] = datos?.[c.clave]

  return (def.resultados || []).map(r => {
    if (!r.formula?.length) return { valor: null, error: 'sin fórmula' }
    try {
      const v = evaluar(textoDe(r.formula), vars)
      if (r.nombre) vars[r.nombre] = v
      return { valor: v, error: null }
    } catch (e: any) {
      return { valor: null, error: e?.message || 'no se pudo calcular' }
    }
  })
}

// ------------------------------------------------------------
// Validar
// ------------------------------------------------------------

export interface Pega {
  donde: 'test' | 'campo' | 'resultado'
  indice: number
  texto: string
}

/**
 * Todo lo que impide guardar este test. Lista vacía = se puede guardar.
 *
 * Se valida la definición ENTERA de una vez y no campo a campo: así el
 * entrenador ve de golpe lo que le falta en vez de descubrirlo de uno en uno.
 */
export function pegasDe(def: DefinicionTest): Pega[] {
  const pegas: Pega[] = []
  const claves = {
    campos: (def.campos || []).map(c => c.clave),
    resultados: (def.resultados || []).map(r => r.nombre),
  }

  if (!txt(def.nombre)) pegas.push({ donde: 'test', indice: -1, texto: 'Ponle nombre al test' })
  if (!(def.campos || []).length) pegas.push({ donde: 'test', indice: -1, texto: 'Añade al menos un campo' })
  if (!(def.resultados || []).length) pegas.push({ donde: 'test', indice: -1, texto: 'Añade al menos un resultado' })

  ;(def.campos || []).forEach((c, i) => {
    const m = motivoNombreMalo(c.clave, 'campo', i, claves)
    if (m) pegas.push({ donde: 'campo', indice: i, texto: m })
  })

  ;(def.resultados || []).forEach((r, i) => {
    const m = motivoNombreMalo(r.nombre, 'resultado', i, claves)
    if (m) pegas.push({ donde: 'resultado', indice: i, texto: m })
    if (!r.formula?.length) {
      pegas.push({ donde: 'resultado', indice: i, texto: 'Sin fórmula no sale nada' })
      return
    }
    /* Referencias hacia adelante o a nada. Se comprueba aquí y no al evaluar
       porque al evaluar depende de los datos: una fórmula rota daría error solo
       cuando alguien intentara usarla, y para entonces el test ya está guardado. */
    const { campos, refs } = dependencias(r.formula)
    const antes = claves.resultados.slice(0, i).map(txt)
    for (const c of campos) {
      if (!claves.campos.map(txt).includes(c)) {
        pegas.push({ donde: 'resultado', indice: i, texto: 'Usa «' + c + '», que no es ningún campo' })
      }
    }
    for (const ref of refs) {
      if (antes.includes(ref)) continue
      pegas.push({
        donde: 'resultado', indice: i,
        texto: claves.resultados.map(txt).includes(ref)
          ? 'Usa «' + ref + '», que va DESPUÉS: súbelo o cámbialo'
          : 'Usa «' + ref + '», que no existe',
      })
    }
  })

  return pegas
}

export const sePuedeGuardar = (def: DefinicionTest): boolean => pegasDe(def).length === 0

/** Las pegas de una fila concreta, para pintarlas donde tocan. */
export const pegaDe = (pegas: Pega[], donde: Pega['donde'], indice: number): string | null =>
  pegas.find(p => p.donde === donde && p.indice === indice)?.texto ?? null

// ------------------------------------------------------------
// Las gráficas
// ------------------------------------------------------------

export interface Medicion {
  fecha: string
  datos: Record<string, unknown>
}

export interface PuntoSerie {
  fecha: string
  valor: number
}

export interface SerieResultado {
  nombre: string
  unidad: string
  puntos: PuntoSerie[]
  /** Cuánto ha cambiado desde el punto anterior. */
  delta: number | null
  /** Si ese cambio es a mejor. Ver `menosEsMejor`. */
  mejora: boolean | null
}

/**
 * Si en esa unidad bajar es mejorar.
 *
 * El ritmo mejora BAJANDO y la velocidad mejora subiendo. Sin esto, cada mejora
 * de un atleta en min/km se pintaría en rojo — el gráfico diciendo lo contrario
 * de lo que pasó.
 */
export function menosEsMejor(nombre: string, unidad: string): boolean {
  return /min|\/km|\/100|seg|tiempo|ritmo|pace/i.test(nombre + ' ' + unidad)
}

/**
 * Lo mismo, pero respetando lo que haya dicho el entrenador.
 *
 * ES EL ÚNICO SITIO DONDE SE DECIDE ESTO. La gráfica y el porcentaje de una
 * zona colgada de este resultado tienen que estar de acuerdo: si la flecha dice
 * que mejoró y el porcentaje va al revés, uno de los dos miente y no hay forma
 * de saber cuál.
 */
export const esInverso = (r: ResultadoTest): boolean =>
  typeof r.inverso === 'boolean' ? r.inverso : menosEsMejor(r.nombre, r.unidad)

/**
 * Las series para pintar, una por resultado marcado con gráfica.
 *
 * UNA GRÁFICA POR RESULTADO, y no todas en la misma: la VAM va en km/h y el
 * ritmo en min/km. En un eje común la línea del ritmo sería una raya plana
 * pegada al suelo y no compararía nada.
 *
 * Los resultados se RECALCULAN desde los campos guardados en cada medición, así
 * que corregir una fórmula corrige el historial entero.
 */
export function seriesDe(def: DefinicionTest, mediciones: Medicion[]): SerieResultado[] {
  const orden = [...(mediciones || [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  const calculado = orden.map(m => ({ fecha: m.fecha, vals: calcularResultados(def, m.datos || {}) }))

  return (def.resultados || []).map((r, i) => {
    const puntos = calculado
      .map(c => ({ fecha: c.fecha, valor: c.vals[i]?.error ? NaN : (c.vals[i]?.valor ?? NaN) }))
      .filter(p => Number.isFinite(p.valor)) as PuntoSerie[]

    let delta: number | null = null, mejora: boolean | null = null
    if (puntos.length >= 2) {
      const ult = puntos[puntos.length - 1].valor, prev = puntos[puntos.length - 2].valor
      delta = ult - prev
      mejora = delta === 0 ? null : (esInverso(r) ? delta < 0 : delta > 0)
    }
    return { nombre: r.nombre, unidad: r.unidad, puntos, delta, mejora }
  }).filter((_, i) => def.resultados[i].graf)
}

/** Los resultados de los que se pueden colgar zonas. */
export const referenciasDe = (def: DefinicionTest): { indice: number; resultado: ResultadoTest }[] =>
  (def.resultados || [])
    .map((resultado, indice) => ({ indice, resultado }))
    .filter(x => tipoDeAncla(x.resultado.ancla) === 'referencia')
