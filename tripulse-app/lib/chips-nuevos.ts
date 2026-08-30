// ============================================================
// Elegir varias zonas de una vez en «Añadir sesión»
// ============================================================
//
// El modal añadía una zona y se cerraba. Una semana de seis sesiones eran seis
// vueltas: abrir, elegir deporte, elegir zona, añadir, se cierra, otra vez.
//
// Ahora se marcan las que quieras y entran juntas.
//
// LA SELECCIÓN ES UNA LISTA CON REPETICIONES, NO UN CONJUNTO
// Y esa es la única decisión de este fichero. Con un conjunto de zonas marcadas
// —lo obvio— cada zona entra una vez y ya está: para meter dos AER habría que
// pulsar Añadir dos veces, lo que repite la tanda ENTERA. Si llevabas AER y PAE
// marcadas, acabas con dos de cada.
//
// Tres sesiones fáciles en una semana no son un caso raro, son la semana normal
// de casi cualquier plan. Así que `['AER', 'PAE', 'AER']` es una selección
// legítima: dos AER y una PAE. Guardar las repeticiones dentro de la lista sale
// gratis —el orden y el recuento ya están ahí— y `chipsNuevos` no se entera.
//
// POR QUÉ ESTO ESTÁ EN UN FICHERO APARTE
// Por los ids. Cada chip necesita el suyo: si se genera uno y se reparte entre
// los tres chips de una tanda, los tres son el mismo para React y para todo lo
// que venga después —borrar uno los borra todos, y el enlace con la sesión que
// se crea al arrastrarlo apuntaría a tres sitios—. Es un fallo que no da la
// cara al escribirlo y sí al usarlo, así que se prueba.
//
// El generador se pasa por argumento en vez de llamar a Math.random() aquí
// dentro: es lo que permite comprobar en un test que salen distintos.

import type { ChipZona } from './chips'
import type { BrickValor } from './bricks'

/** Una más de esa zona. Al final, que es el orden en que se irán apilando. */
export function anadirZona(seleccion: string[], zona: string): string[] {
  return [...seleccion, zona]
}

/**
 * Una menos de esa zona.
 *
 * Quita la ÚLTIMA, no la primera: así pulsar y despulsar deja la lista como
 * estaba. Quitando la primera, `AER, PAE, AER` menos un AER dejaría `PAE, AER`
 * y el orden de lo que ya habías elegido cambiaría a tu espalda.
 */
export function quitarZona(seleccion: string[], zona: string): string[] {
  const i = seleccion.lastIndexOf(zona)
  if (i < 0) return seleccion
  return [...seleccion.slice(0, i), ...seleccion.slice(i + 1)]
}

/** Cuántas veces está marcada esa zona. */
export function cuantasDe(seleccion: string[], zona: string): number {
  return seleccion.filter(z => z === zona).length
}

/**
 * Los chips de una tanda: uno por cada marca, en el orden en que se marcaron.
 *
 * No mira si esa zona ya está en la semana a propósito. Tres AER en una semana
 * son tres sesiones fáciles, no un error: quien planifica sabe lo que hace y
 * las repeticiones se quitan desde la lista de abajo.
 */
export function chipsNuevos(
  semana: number,
  disciplina: string,
  zonas: string[],
  nuevoId: () => string,
): ChipZona[] {
  return zonas.map(zona => ({ id: nuevoId(), semana, disciplina, zona }))
}

/** El chip de un brick, que siempre va solo: se lleva sus bloques encima. */
export function chipDeBrick(
  semana: number,
  zonaPico: string,
  brick: BrickValor,
  nuevoId: () => string,
): ChipZona {
  return { id: nuevoId(), semana, disciplina: 'Brick', zona: zonaPico, brick }
}

/** «Añadir (3)», o «Añadir» a secas cuando no hay nada marcado. */
export function textoBoton(n: number): string {
  return n > 1 ? `Añadir (${n})` : 'Añadir'
}

/** «2 AER · PAE», para ver de un vistazo lo que va a entrar y en qué orden. */
export function resumenSeleccion(seleccion: string[]): string {
  const vistas: string[] = []
  const trozos: string[] = []
  for (const z of seleccion) {
    if (vistas.includes(z)) continue
    vistas.push(z)
    const n = cuantasDe(seleccion, z)
    trozos.push(n > 1 ? n + ' ' + z : z)
  }
  return trozos.join(' · ')
}
