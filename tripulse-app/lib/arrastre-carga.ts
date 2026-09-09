/**
 * Arrastrar una barra de carga del lienzo para cambiar sus UA.
 *
 * Vive aquí y no dentro de la página porque tiene una trampa que no se ve
 * leyendo el código: **cuánto vale un píxel**. La barra mide 180 px de alto y
 * representa el máximo del plan; en un plan de 4.000 UA cada píxel son 22 UA, y
 * como el valor se redondea a múltiplos de 25, **mover el ratón un solo píxel ya
 * cambia la semana en 25 UA**. Con la barra vieja —de tres píxeles de ancho— eso
 * daba igual, porque acertarle era tan difícil que nadie la rozaba sin querer.
 * Al agrandar la zona de agarre, sí importa.
 */

/** Píxeles que hay que mover antes de que el número empiece a cambiar. */
export const UMBRAL_ARRASTRE = 4

/** A cuánto se redondea el resultado. */
export const PASO_UA = 25

export interface MedidasArrastre {
  /** UA que tenía la semana al empezar a arrastrar. */
  uaInicial: number
  /** El máximo de la escala cuando empezó el arrastre. */
  maxUA: number
  /** Alto en píxeles de la zona del gráfico. */
  altoPx: number
}

/**
 * Las UA que corresponden a haber subido `dy` píxeles.
 *
 * `dy` positivo = el ratón ha subido = más carga.
 *
 * Devuelve `null` mientras el movimiento no pase del umbral: eso es lo que
 * distingue un clic de un arrastre. Sin ello, cualquier temblor de la mano al
 * pinchar movía la semana 25 UA, y el entrenador no tenía forma de saber que
 * había cambiado algo.
 */
export function uaArrastrada(dy: number, { uaInicial, maxUA, altoPx }: MedidasArrastre): number | null {
  if (Math.abs(dy) < UMBRAL_ARRASTRE) return null
  if (!(altoPx > 0)) return null

  /* Se descuenta el umbral en vez de saltárselo: si no, al cruzarlo el valor
     pegaría un brinco de cuatro píxeles de golpe y la barra daría un tirón. */
  const efectivo = dy - Math.sign(dy) * UMBRAL_ARRASTRE
  const bruto = uaInicial + efectivo * maxUA / altoPx

  return Math.max(0, Math.round(bruto / PASO_UA) * PASO_UA)
}
