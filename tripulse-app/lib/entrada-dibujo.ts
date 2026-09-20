// ============================================================
// A qué pantalla se entra al abrir el lienzo de periodización
// ============================================================
//
// Parece una tontería y costó una temporada entera de trabajo.
//
// El lienzo guarda de dos maneras distintas: el DIBUJO se autoguarda solo en
// `dibujo_borrador` cada vez que tocas algo, y el PLAN de verdad —las filas de
// `macrociclo`, `mesociclo` y `microciclo` que leen el calendario y la vista de
// mesociclo— solo se escribe al pulsar «Generar planificación».
//
// La pantalla de entrada miraba SOLO el plan. Así que quien dibujaba una
// temporada y no pulsaba el botón volvía al día siguiente, no encontraba nada y
// se le ofrecía empezar de cero, con su dibujo intacto en la base y nadie
// buscándolo. Y al dibujar el primer bloque nuevo, el autoguardado lo escribía
// encima: `dibujo_borrador` se actualiza en su sitio y no hay histórico.
//
// Esto vive aparte de la página, y no dentro, porque la misma pregunta se hacía
// en dos sitios —al entrar y al cargar— y dos sitios contestando lo mismo es
// como empiezan a contestar distinto.

/** Lo único que hace falta mirar del borrador para saber si hay algo dentro. */
export interface BorradorMinimo {
  macros?: unknown[] | null
}

/**
 * Si hay un dibujo guardado con algo dentro.
 *
 * SE MIRA POR LOS MACROCICLOS, no por si la fila existe: el borrador se crea en
 * cuanto se toca cualquier cosa, así que una fila vacía no significa que haya
 * trabajo que recuperar. Y sin macrociclos el lienzo no tiene nada que dibujar
 * —el propio autoguardado se niega a escribir si no hay ninguno—.
 */
export const hayDibujoGuardado = (b: BorradorMinimo | null | undefined): boolean =>
  Array.isArray(b?.macros) && b.macros.length > 0

/**
 * Dónde se aterriza al abrir el lienzo.
 *
 * `elegir` cuando hay ALGO que recuperar —plan confirmado, dibujo a medias, o
 * los dos—, y `setup` solo cuando de verdad no hay nada. Mandar a `setup` con
 * un dibujo guardado detrás es lo que costó la temporada.
 */
export const pantallaDeEntrada = (
  macrosEnBase: unknown[] | null | undefined,
  borrador: BorradorMinimo | null | undefined,
): 'elegir' | 'setup' => {
  const hayPlan = Array.isArray(macrosEnBase) && macrosEnBase.length > 0
  return hayPlan || hayDibujoGuardado(borrador) ? 'elegir' : 'setup'
}
