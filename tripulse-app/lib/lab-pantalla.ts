// ============================================================
// TRIPULSE — La pantalla de pasar el test, a tu gusto
// ============================================================
//
// EL CASO. «Todo esto puede dar lugar a muchas cosas en una misma pantalla, y
// estaría bien que cualquier entrenador cree la suya: nosotros damos una
// predeterminada pero que la pueda mover como si fueran bloques.»
//
// DONDE DE VERDAD SIRVE ES EN EL MÓVIL: a pie de pista todo va en UNA columna,
// así que el orden decide lo que ves sin hacer scroll con el atleta esperando.
// Un escalonado y unas flexiones no se miran igual.
//
// LAS DOS REGLAS QUE EVITAN QUE ESTO SE ROMPA SOLO, y son el motivo de que el
// orden guardado no se use tal cual:
//
//   1. UNA SECCIÓN NUEVA NO PUEDE QUEDAR INVISIBLE. Si mañana añades un
//      pulsador a un test cuyo orden se guardó antes, esa sección no está en
//      la lista guardada. Si solo pintáramos lo guardado, el pulsador no
//      aparecería y parecería que no se ha creado. Va al final, visible.
//   2. LO GUARDADO QUE YA NO EXISTE SE IGNORA. Quitas los parciales del test y
//      su hueco no puede quedarse ahí.
//
// Y «guardar» no se puede esconder: sin ese trozo no hay forma de apuntar la
// medición, y una pantalla que no deja guardar no es una pantalla configurada,
// es una rota.

import {
  contadoresDe, contadoresSueltosDe, cronometradosDe, cronosDe, cronosSueltosDe, escalonadosDe,
  parcialesDe, parcialesBloqueDe, type TestLab,
} from './lab-constructor'

export type ClaveSeccion =
  | 'escalones' | 'cuenta' | 'cronos' | 'sueltos' | 'parciales' | 'pulsadores' | 'descanso' | 'guardar'

export interface Seccion {
  clave: ClaveSeccion
  etiqueta: string
  icono: string
  /** Si se puede esconder. «Guardar» no. */
  prescindible: boolean
}

/** El catálogo, en el orden DE SERIE: el que damos nosotros. */
export const SECCIONES: Seccion[] = [
  { clave: 'escalones', etiqueta: 'Escalones', icono: '📶', prescindible: true },
  { clave: 'cuenta', etiqueta: 'Cuenta atrás', icono: '⏱', prescindible: true },
  { clave: 'cronos', etiqueta: 'Cronómetro por repetición', icono: '⏱', prescindible: true },
  { clave: 'sueltos', etiqueta: 'Cronómetro', icono: '⏱', prescindible: true },
  { clave: 'parciales', etiqueta: 'Parciales', icono: '🚩', prescindible: true },
  { clave: 'pulsadores', etiqueta: 'Pulsadores', icono: '👆', prescindible: true },
  { clave: 'descanso', etiqueta: 'Descanso', icono: '☕', prescindible: true },
  { clave: 'guardar', etiqueta: 'Guardar lo medido', icono: '💾', prescindible: false },
]

export const seccionPorClave = (c: string): Seccion | undefined =>
  SECCIONES.find(s => s.clave === c)

/** Lo que se guarda con el test. */
export interface Pantalla {
  orden: ClaveSeccion[]
  ocultas: ClaveSeccion[]
}

export const PANTALLA_VACIA: Pantalla = { orden: [], ocultas: [] }

/**
 * Qué secciones TIENE este test de verdad.
 *
 * Sale de las mismas listas que pintan los relojes, no de una lista aparte:
 * si se preguntara dos veces, la pantalla podría ofrecer ordenar algo que no
 * se pinta — o peor, no ofrecer algo que sí.
 */
export function seccionesDeTest(t: TestLab | null): ClaveSeccion[] {
  const o: ClaveSeccion[] = []
  if (escalonadosDe(t).length) o.push('escalones')
  if (cronometradosDe(t).length) o.push('cuenta')
  if (cronosDe(t).length) o.push('cronos')
  if (cronosSueltosDe(t).length) o.push('sueltos')
  if (parcialesDe(t).length || parcialesBloqueDe(t).length) o.push('parciales')
  if (contadoresSueltosDe(t).length || contadoresDe(t).length) o.push('pulsadores')
  if (Number(t?.descanso) > 0) o.push('descanso')
  o.push('guardar')
  return o
}

/**
 * El orden de verdad: lo guardado, cuadrado con lo que el test tiene HOY.
 *
 * Devuelve TODAS las secciones que existen —para poder ordenarlas— y aparte
 * cuáles se pintan. Lo guardado manda en el orden, pero no puede inventarse
 * secciones ni esconder las que aparecieron después.
 */
/**
 * Las secciones que SOLO existen para dar un botón por persona.
 *
 * Desde que se puede tocar la casilla de la tabla, con UNA persona son la
 * misma cosa dos veces: la tabla ya dice de qué repetición y de qué columna
 * es cada casilla, y estas tienen que volver a decirlo —«vas por la 1 de 6»—
 * con un botón al lado.
 *
 * Con un GRUPO no sobran, y por eso no se borraron: la tabla enseña a UNA
 * persona —la que esté puesta arriba—, y a pie de pista no se puede ir
 * cambiando de atleta a mitad de serie. Ahí es donde «un reloj para todos y un
 * botón por persona» es justo lo que hace falta.
 *
 * La cuenta atrás y el descanso NO están aquí: esos cantan un número que no
 * sale en ningún otro sitio, haya quien haya.
 */
export const POR_PERSONA: ClaveSeccion[] = ['escalones', 'cronos', 'sueltos', 'parciales', 'pulsadores']

/**
 * @param gente Cuántos la están pasando. Con uno o nadie, las de `POR_PERSONA`
 *   se caen solas: no se esconden —que obligaría a saber que existen y a ir al
 *   engranaje—, es que ahí no tienen nada que aportar. Sin decirlo se dibuja la
 *   pantalla entera, que es lo que hace falta al montar el test.
 */
export function pantallaDe(t: TestLab | null, guardada?: Pantalla | null, gente?: number): {
  /** Las que se DIBUJAN ahora mismo, en su orden. */
  todas: ClaveSeccion[]
  /** De esas, las que no están escondidas. */
  visibles: ClaveSeccion[]
  /**
   * TODAS las que este test puede llegar a enseñar, dibujadas o no.
   *
   * Es lo que mira el engranaje, y va aparte por un fallo que se cometió dos
   * veces en una tarde. Con una sola persona las de botón por persona no se
   * dibujan, y el engranaje —que listaba lo dibujado— se quedó sin nada que
   * ordenar y desapareció. Al devolverlas para recuperarlo, volvieron a la
   * pantalla las filas que se acababan de quitar.
   *
   * Son dos preguntas distintas: QUÉ SE VE AHORA y QUÉ SE PUEDE ORDENAR. Lo
   * segundo es del test; lo primero, de quién lo esté pasando.
   */
  delTest: ClaveSeccion[]
} {
  const solo = typeof gente === 'number' && gente <= 1
  const ordenar = (todos: ClaveSeccion[]) => {
    const orden = (guardada?.orden || []).filter(c => todos.includes(c))
    /* Las que existen y no estaban guardadas van AL FINAL, nunca fuera: una
       sección nueva que no se viera parecería que no se ha creado. */
    return [...orden, ...todos.filter(c => !orden.includes(c))]
  }

  const delTest = ordenar(seccionesDeTest(t))
  const todas = ordenar(seccionesDeTest(t).filter(c => !solo || !POR_PERSONA.includes(c)))

  const ocultas = new Set((guardada?.ocultas || []).filter(c => {
    const s = seccionPorClave(c)
    return !!s && s.prescindible
  }))
  return { todas, visibles: todas.filter(c => !ocultas.has(c)), delTest }
}

/** Mover una sección una posición arriba o abajo. */
export function mover(orden: ClaveSeccion[], clave: ClaveSeccion, paso: -1 | 1): ClaveSeccion[] {
  const i = orden.indexOf(clave)
  const j = i + paso
  if (i < 0 || j < 0 || j >= orden.length) return orden
  const o = [...orden]
  o[i] = o[j]; o[j] = clave
  return o
}

/**
 * Mover una sección HASTA la posición de otra, que es lo que hace arrastrar.
 *
 * No es lo mismo que subir o bajar de uno en uno: aquí se saca de donde está
 * y se mete donde la sueltas, y el resto corre. Lo de «sacar primero y mirar
 * el destino después» importa — con la sección ya fuera, el índice de
 * destino es el de la lista nueva, y hacerlo al revés deja las cosas
 * cambiadas de sitio por uno cuando se arrastra hacia abajo.
 */
export function moverA(orden: ClaveSeccion[], clave: ClaveSeccion, destino: number): ClaveSeccion[] {
  const i = orden.indexOf(clave)
  if (i < 0) return orden
  const sin = orden.filter(c => c !== clave)
  const d = Math.max(0, Math.min(sin.length, destino))
  return [...sin.slice(0, d), clave, ...sin.slice(d)]
}

/** Esconder o volver a enseñar. «Guardar» no se puede esconder. */
export function alternar(ocultas: ClaveSeccion[], clave: ClaveSeccion): ClaveSeccion[] {
  if (!seccionPorClave(clave)?.prescindible) return ocultas
  return ocultas.includes(clave) ? ocultas.filter(c => c !== clave) : [...ocultas, clave]
}

/**
 * Lo guardado, leído a la defensiva.
 *
 * Una clave que ya no existe —o que nunca existió— se tira aquí y no más
 * adelante: un test guardado con una versión vieja no puede dejar la pantalla
 * a medias.
 */
export function leerPantalla(bruto: unknown): Pantalla {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const limpia = (x: unknown): ClaveSeccion[] =>
    (Array.isArray(x) ? x : [])
      .map(v => String(v))
      .filter((v, i, a) => a.indexOf(v) === i && !!seccionPorClave(v)) as ClaveSeccion[]
  return { orden: limpia(o.orden), ocultas: limpia(o.ocultas) }
}

/** Si hay algo que guardar: una pantalla sin tocar no ocupa sitio. */
export const tienePantalla = (p: Pantalla | null | undefined): boolean =>
  !!p && (p.orden.length > 0 || p.ocultas.length > 0)
