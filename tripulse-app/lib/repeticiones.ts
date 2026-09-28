// ============================================================
// Repeticiones: un número, o un rango
// ============================================================
//
// Hasta ahora una prescripción de fuerza solo sabía decir «8». Pero un
// entrenador no siempre quiere ocho exactas: quiere «entre 8 y 10, las que te
// salgan con ese RIR», que es como se prescribe la hipertrofia y buena parte de
// la fuerza. Eso se escribía en las notas, donde no lo lee ningún cálculo.
//
// CÓMO SE GUARDA. El mínimo se queda donde estaba —`ejercicios.repeticiones`,
// `p_repeticiones.repeticiones_planteadas`— y el tope va en una columna nueva al
// lado. Así todo lo que ya leía las repeticiones sigue leyendo un número y no se
// rompe: enseña el extremo bajo. Lo que sepa del rango, enseña «8-10». No hay
// nada que migrar.
//
// DÓNDE SE ESCRIBE EL TEXTO. Aquí y en ningún otro sitio. Son tres pantallas del
// entrenador y cuatro del atleta las que enseñan esto; con la frase escrita a
// mano en cada una, un día una diría «8-10» y otra «8».

/** Lo prescrito: un mínimo y, si es un rango, un tope. */
export interface Reps {
  min: number
  /** null cuando son exactas. Nunca menor o igual que `min`. */
  max: number | null
}

/**
 * Lee lo que ha escrito el entrenador: «10», «8-10», «8 - 10», «8–10».
 *
 * Devuelve null si no hay nada legible, que es lo que distingue «lo ha borrado»
 * de «ha escrito algo raro»: quien llama decide, pero los dos acaban guardando
 * null y no un 0 ni un NaN. Un `Number('8-10')` es NaN, y NaN en una columna
 * integer es lo que hacía que el guion ni se pudiera teclear.
 */
export function leerReps(texto: string | number | null | undefined): Reps | null {
  if (texto == null) return null
  const t = String(texto).trim()
  if (!t) return null

  /* El guion corto y el largo: el largo sale solo en Word y al copiar de una
     web, y quien lo pega no tiene por qué saber que es otro carácter. */
  const m = t.match(/^(\d+)\s*[-–]\s*(\d+)$/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (!a || !b) return null
    /* «10-8» es un rango escrito al revés, no un error que valga la pena
       cantarle a nadie: se ordena. Y «8-8» son ocho exactas. */
    const min = Math.min(a, b), max = Math.max(a, b)
    return { min, max: max > min ? max : null }
  }

  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return null
  return { min: Math.round(n), max: null }
}

/** Cómo se escribe para que lo lea una persona: «10» o «8-10». */
export function textoReps(min: number | null | undefined, max?: number | null): string {
  if (!min) return ''
  return max && max > min ? min + '-' + max : String(min)
}

/**
 * El número con el que se calcula (duración, y detrás de ella la carga).
 *
 * EL CENTRO DEL RANGO, no el mínimo. Prescribir «8-10» y que la sesión se
 * estime como si fueran ocho la dejaría corta siempre, y la carga detrás. El
 * centro es lo que se espera que haga; con repeticiones exactas es el número de
 * siempre, así que ninguna sesión que ya existe cambia de duración.
 */
export function repsParaCalcular(min: number | null | undefined, max?: number | null): number {
  if (!min) return 0
  if (!max || max <= min) return min
  return Math.round((min + max) / 2)
}

/** Lo que suma la tarea entera: el rango multiplicado, «24-30». */
export function textoRepsTotal(min: number | null | undefined, max: number | null | undefined, veces: number): string {
  if (!min) return ''
  return textoReps(min * veces, max ? max * veces : null)
}

/* ── Las columnas, desde un solo sitio ──────────────────────────────────────
   Las repeticiones se escriben en SIETE sitios entre los dos editores del
   entrenador, el volcado de un plan y el copiar-pegar de tareas. Con el mínimo
   y el tope en dos columnas, cada uno de esos sitios es una ocasión de escribir
   uno y olvidar el otro — y olvidar el tope al bajar el mínimo deja un rango al
   revés, que la propia base rechaza. Así que las columnas se arman aquí y hay
   un test que falla si alguien las vuelve a teclear. */

/** Lo que va a `ejercicios`, desde lo que escribió el entrenador. */
export function columnasEjercicio(texto: string | number | null | undefined) {
  const r = leerReps(texto)
  return { repeticiones: r?.min ?? null, repeticiones_max: r?.max ?? null }
}

/** Lo que va al ejercicio encadenado de una superserie. */
export function columnasEncadenado(texto: string | number | null | undefined) {
  const r = leerReps(texto)
  return { encadenado_repeticiones: r?.min ?? null, encadenado_repeticiones_max: r?.max ?? null }
}

/** Lo que va a `p_repeticiones`. */
export function columnasPrescripcion(texto: string | number | null | undefined) {
  const r = leerReps(texto)
  return { repeticiones_planteadas: r?.min ?? null, repeticiones_planteadas_max: r?.max ?? null }
}

/** Lo que enseña una fila de `ejercicios`: «10 reps» o «8-10 reps». */
export function repsDeEjercicio(ej: { repeticiones?: number | null; repeticiones_max?: number | null } | null | undefined): string {
  return textoReps(ej?.repeticiones, ej?.repeticiones_max)
}

/** Lo que enseña una fila de `p_repeticiones`. */
export function repsDePrescripcion(p: { repeticiones_planteadas?: number | null; repeticiones_planteadas_max?: number | null } | null | undefined): string {
  return textoReps(p?.repeticiones_planteadas, p?.repeticiones_planteadas_max)
}

/** Lo que suma una prescripción entera: «24-30» para 3 × 8-10. */
export function repsTotalDePrescripcion(
  p: { repeticiones_planteadas?: number | null; repeticiones_planteadas_max?: number | null } | null | undefined,
  veces: number,
): string {
  return textoRepsTotal(p?.repeticiones_planteadas, p?.repeticiones_planteadas_max, veces)
}

/** Las repeticiones de un ejercicio con las que se calcula la duración. */
export function repsDeCalculo(ej: { repeticiones?: number | null; repeticiones_max?: number | null } | null | undefined): number {
  return repsParaCalcular(ej?.repeticiones, ej?.repeticiones_max)
}
