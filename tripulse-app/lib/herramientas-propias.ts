// ============================================================
// TRIPULSE — Con qué se dirige un test que se ha creado el entrenador
// ============================================================
//
// QUÉ HACE. Traduce las casillas de un test propio a los MISMOS instrumentos
// que lleva la batería. Nada más: ni pinta, ni guarda, ni calcula.
//
// POR QUÉ UN TRADUCTOR Y NO UN RELOJ NUEVO. En la batería, qué instrumento
// lleva cada test está escrito a mano en `herramientas-test`, test por test.
// En los tests propios eso lo decide el entrenador al crearlos, así que el mapa
// no sirve — pero el reloj sí. Escribir aquí un cronómetro aparte sería tener
// dos, y el día que se tocara uno el Montreal y un 6×100 contarían distinto.
// Ese es el fallo que este proyecto lleva persiguiendo.
//
// LO QUE NO SE TRADUCE. Una casilla sin instrumento no genera nada: es una
// casilla de toda la vida y se escribe a mano, que es como están todos los
// tests creados hasta hoy y como siguen estando.

import { esSerie, vecesDe, type CampoTest, type DefinicionTest } from './test-definicion'
import type { Herramienta } from './herramientas-test'

/**
 * El instrumento de una casilla, o nada.
 *
 * UNA SERIE SOLO LLEVA CRONÓMETRO, y no por falta de ganas: un contador por
 * repetición habría que llevarlo a la vez que el reloj, y no hay dos manos. Lo
 * que se hace de verdad —te lo canta alguien y lo apuntas al acabar— es una
 * serie a mano, que ya se puede. `pegasDe` no deja guardar la combinación que
 * no existe, así que aquí basta con ignorarla.
 */
export function herramientaDeCampo(c: CampoTest): Herramienta | null {
  const ins = c?.instrumento
  if (!ins || !c.clave) return null
  const que = c.etiqueta || c.clave

  if (esSerie(c)) {
    return ins.tipo === 'cronometro'
      ? { tipo: 'serie', campo: c.clave, veces: vecesDe(c), unidad: ins.unidad, que }
      : null
  }

  if (ins.tipo === 'cronometro') return { tipo: 'cronometro', campo: c.clave, unidad: ins.unidad, que }
  if (ins.tipo === 'contador') return { tipo: 'contador', campo: c.clave, que }
  return { tipo: 'cuentaAtras', segundos: ins.segundos, que }
}

/** Todos los instrumentos del test, en el orden en que están las casillas. */
export function herramientasPropias(def: DefinicionTest | null | undefined): Herramienta[] {
  const out: Herramienta[] = []
  for (const c of def?.campos || []) {
    const h = herramientaDeCampo(c)
    if (h) out.push(h)
  }
  return out
}

/**
 * Si este test se puede pasar con reloj.
 *
 * De esto depende que salga o no el selector «A mano / Test de campo»: un test
 * sin instrumentos no tiene nada que elegir, y enseñar un selector de una sola
 * opción es hacerle perder un toque al entrenador cada vez.
 */
export const seTomaConReloj = (def: DefinicionTest | null | undefined): boolean =>
  herramientasPropias(def).length > 0
