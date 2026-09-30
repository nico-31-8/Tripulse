// ============================================================
// TRIPULSE — Colgar zonas propias de una referencia propia
// ============================================================
//
// EL CASO QUE ESTO RESUELVE. Un entrenador pasa un 6×100 y de ahí saca que a su
// nadador le interesa 1:13 el 100. Quiere sus zonas de ahí. Ese número NO es un
// CSS, no va a la columna `css` y no tiene por qué parecerse a nada que la app
// conozca: es SU referencia. Antes no cabía, porque los % de una zona propia
// eran siempre de la VAM, el FTP o el CSS.
//
// NO HACE FALTA GUARDAR NADA POR ATLETA. La referencia de alguien ya está en la
// base: es su última medición de ese test pasada por la fórmula de ese
// resultado. Así se conserva la propiedad que tiene todo esto desde el
// principio — corriges la fórmula y se corrige el historial entero—, y no
// aparece un tercer sitio donde el mismo número podría estar de otra manera.
//
// SIEMPRE LA ÚLTIMA, NUNCA CONGELADA. Se decidió así a propósito. Lo que sí se
// enseña siempre es LA FECHA de la que salió, para que nadie confunda un número
// de julio con el de hoy.
//
// EL PORCENTAJE TIENE SENTIDO, NO ES UNA MULTIPLICACIÓN. El 95 % de 1:13 es más
// LENTO —1:17—, no más rápido. Un porcentaje es del esfuerzo, y en una unidad
// de tiempo eso significa dividir en vez de multiplicar. Hacerlo al revés no
// rompe nada: deja unas zonas que van hacia el lado contrario, calculadas y
// enseñadas tan tranquilas. Por eso `esInverso` es un solo sitio y no una
// suposición repetida.

import {
  calcularResultados, esInverso, leerDefinicion, referenciasDe, tipoDeAncla,
  type DefinicionTest, type Medicion, type ResultadoTest,
} from './test-definicion'
import { calcular, comoResultadoViejo, type TestLab } from './lab-constructor'
import { leerModelo } from './lab-guardar'

/** A qué resultado de qué test apunta una zona. */
export interface RefPropia {
  idDefinicion: number
  /** La posición del resultado dentro del test. */
  indice: number
}

/** Un test del entrenador con lo que ese atleta lleva medido. */
export interface TestConMediciones {
  id: number
  nombre: string
  deporte: string
  def: DefinicionTest
  /**
   * Si es del LABORATORIO, su modelo. Los dos modelos conviven, y un test del
   * laboratorio deja `def` vacío a propósito (ver `lab-guardar`).
   *
   * POR QUÉ ESTÁ AQUÍ. Sin esto, los tests del laboratorio no aparecían al
   * prescribir ni al montar zonas propias: no salían vacíos, es que no salían.
   * Podías sacar un umbral de una curva de lactato, verlo, pintarlo en su
   * gráfica — y después no había forma de colgarle un 95 % a una tarea. Y el
   * propio laboratorio te decía «◈ Referencia tuya», que era una promesa sin
   * destino.
   */
  lab?: TestLab | null
  /** Las de ESE atleta. El orden da igual: aquí se ordena. */
  mediciones: Medicion[]
}

/**
 * Una fila de `test_definicion` tal como la devuelve la base.
 *
 * Los tres campos de siempre y los dos cuerpos, sin índice abierto: cada
 * pantalla la pide con `select('*')` y su propio tipo, y con un índice de
 * cadena ninguno de esos tipos encajaría.
 */
export interface FilaTest {
  id: number
  nombre: string
  deporte: string
  /** El modelo nuevo. Un test de /tests-propios no lo trae. */
  modelo?: unknown
  campos?: unknown
  resultados?: unknown
}

/**
 * Un test del entrenador, sea del modelo que sea, con las mediciones de alguien.
 *
 * UN SOLO SITIO LEE LA FILA. Cada pantalla que quería los tests del entrenador
 * llamaba a `leerDefinicion` por su cuenta, y `leerDefinicion` solo entiende el
 * modelo viejo: por eso los del laboratorio desaparecían en tres pantallas a la
 * vez sin que nada fallara. Quien necesite los tests de un atleta pasa por aquí.
 */
export function testDeFila(fila: FilaTest, mediciones: Medicion[]): TestConMediciones {
  const nombre = String(fila?.nombre || '')
  const deporte = String(fila?.deporte || '')
  return {
    id: Number(fila?.id),
    nombre,
    deporte,
    def: leerDefinicion(fila),
    lab: leerModelo(fila?.modelo, nombre, deporte || 'Carrera'),
    mediciones: mediciones || [],
  }
}

/**
 * El test con la cara del modelo viejo, venga del modelo que venga.
 *
 * Así todo lo de este fichero se escribe UNA vez: cuál sirve de referencia, en
 * qué orden van, si en su unidad bajar es mejorar. Son preguntas que no
 * dependen de cómo se montó el test, y contestarlas dos veces —una por modelo—
 * es cómo se acaba con un test que se ofrece en una pantalla y en la otra no.
 *
 * El índice se conserva: es la posición del resultado, y es lo que queda
 * guardado en la zona que cuelga de él.
 */
const comoDefinicion = (t: TestConMediciones): DefinicionTest =>
  t.lab
    ? {
      nombre: t.nombre, deporte: t.deporte, campos: [],
      resultados: (t.lab.resultados || []).map(comoResultadoViejo),
    }
    : t.def

/** Lo que vale hoy una referencia para un atleta. */
export interface ValorRef {
  nombre: string
  unidad: string
  valor: number
  /** En esta unidad, bajar es mejorar. Decide hacia dónde va el porcentaje. */
  inverso: boolean
  /** De qué día salió. Se enseña SIEMPRE. */
  fecha: string
}

export const mismaRef = (a: RefPropia | null, b: RefPropia | null): boolean =>
  !!a && !!b && a.idDefinicion === b.idDefinicion && a.indice === b.indice

const normDeporte = (d: string): string => {
  const s = String(d ?? '').trim()
  return s.startsWith('Nat') ? 'Natacion' : s
}

export const mismoDeporte = (a: string, b: string): boolean =>
  normDeporte(a).toLowerCase() === normDeporte(b).toLowerCase()

// ------------------------------------------------------------
// Qué referencias hay
// ------------------------------------------------------------

export interface OpcionRef {
  ref: RefPropia
  /** Lo que se lee en el desplegable: «6×100 · ritmo100». */
  etiqueta: string
  test: TestConMediciones
  resultado: ResultadoTest
}

/**
 * Las referencias que se le pueden colgar a una zona de ese deporte.
 *
 * FILTRADAS POR DEPORTE, y no por comodidad. Una zona de natación colgada de un
 * número que sacó corriendo daría un ritmo de piscina salido de una velocidad
 * de asfalto. No hay ningún caso en que eso sea lo que se quería.
 */
export function opcionesDeRef(tests: TestConMediciones[], deporte: string): OpcionRef[] {
  const out: OpcionRef[] = []
  for (const t of tests) {
    if (!mismoDeporte(t.deporte, deporte)) continue
    /* La regla de qué resultado vale como referencia es UNA y está en
       `test-definicion`: aquí solo se le da el test con la cara que entiende. */
    for (const { indice, resultado } of referenciasDe(comoDefinicion(t))) {
      out.push({
        ref: { idDefinicion: t.id, indice },
        etiqueta: t.nombre + ' · ' + resultado.nombre,
        test: t, resultado,
      })
    }
  }
  return out
}

export const buscarOpcion = (opciones: OpcionRef[], ref: RefPropia | null): OpcionRef | null =>
  opciones.find(o => mismaRef(o.ref, ref)) ?? null

// ------------------------------------------------------------
// Cuánto vale
// ------------------------------------------------------------

/**
 * Lo que vale esa referencia para el atleta cuyas mediciones se pasan.
 *
 * SE COGE LA MÁS RECIENTE QUE DÉ NÚMERO, no la más reciente a secas. Un test de
 * varios resultados puede tener una medición donde solo se rellenó parte: si de
 * ahí no sale este resultado, no hay razón para dejar la zona sin referencia
 * teniendo la del mes pasado. Lo que no se hace nunca es esconder de cuándo es:
 * la fecha va en `ValorRef` y quien pinta la enseña.
 */
export function valorDe(test: TestConMediciones, indice: number): ValorRef | null {
  const r = comoDefinicion(test)?.resultados?.[indice]
  if (!r) return null
  if (tipoDeAncla(r.ancla) !== 'referencia') return null

  const orden = [...(test.mediciones || [])].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  for (let i = 0; i < orden.length; i++) {
    const m = orden[i]
    /* CADA MODELO SE CALCULA CON SU MOTOR. El del laboratorio recibe además la
       medición anterior, porque una fórmula suya puede llevar `antes()` —«lo
       que mejoró desde la última vez»— y sin ella ese resultado no daría
       número justo aquí, que es donde se decide si la referencia existe. */
    const calc = test.lab
      ? calcular(test.lab, m.datos || {}, orden[i + 1]?.datos || null)[indice]
      : calcularResultados(test.def, m.datos || {})[indice]
    if (!calc || calc.error || calc.valor == null) continue
    if (!Number.isFinite(calc.valor) || calc.valor <= 0) continue
    return {
      nombre: r.nombre, unidad: r.unidad, valor: calc.valor,
      inverso: esInverso(r), fecha: m.fecha,
    }
  }
  return null
}

/**
 * El número al que sale un porcentaje de esa referencia.
 *
 * En una unidad normal, el 95 % es multiplicar. En una de tiempo es DIVIDIR: al
 * 95 % del esfuerzo se tarda más, no menos.
 */
export function aplicarPct(valor: number, pct: number, inverso: boolean): number | null {
  const v = Number(valor), p = Number(pct)
  if (!Number.isFinite(v) || v <= 0) return null
  if (!Number.isFinite(p) || p <= 0) return null
  return inverso ? v * 100 / p : v * p / 100
}

/**
 * El tramo de una zona sobre esa referencia.
 *
 * `desde` es el número del % más bajo y `hasta` el del más alto, que en una
 * unidad de tiempo significa que `desde` es MAYOR que `hasta`. Es lo correcto y
 * es lo que la app ya hace con las zonas de carrera, que se leen «4:50 – 4:35».
 */
export function tramoDe(v: ValorRef, pctMin: number, pctMax: number): { desde: number; hasta: number } | null {
  const desde = aplicarPct(v.valor, pctMin, v.inverso)
  const hasta = aplicarPct(v.valor, pctMax, v.inverso)
  if (desde == null || hasta == null) return null
  return { desde, hasta }
}

/**
 * Un número en la unidad que escribió el entrenador, sin adornos.
 *
 * NO SE INTENTA PASAR 73 A «1:13». La unidad es texto libre: interpretarla para
 * embellecerla es exactamente el paso donde se cuelan los números que mienten.
 * Se enseña lo que se calculó, con la unidad tal como la escribió.
 */
export const leerValor = (n: number, unidad: string): string =>
  (Math.round(n * 100) / 100).toString().replace('.', ',') + (unidad ? ' ' + unidad : '')
