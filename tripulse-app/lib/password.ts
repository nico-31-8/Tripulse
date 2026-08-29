// ============================================================
// Contraseñas: verlas al escribirlas y escribirlas dos veces
// ============================================================
//
// Escribir una contraseña a ciegas en un móvil, con el teclado corrigiendo y la
// mayúscula automática metiéndose por medio, sale mal más veces de las que
// parece. Y sale mal en el peor momento: al CREARLA. La persona se equivoca,
// la cuenta se crea con una contraseña que no es la que cree que puso, y al día
// siguiente no puede entrar. Como el correo de recuperación no funciona todavía
// (ver el comentario en /login), eso es una cuenta perdida.
//
// De ahí las dos cosas de este fichero: el ojo para ver lo que escribes, y la
// repetición para que un error de dedo se note ANTES de crear la cuenta.
//
// POR QUÉ NO SE HACE trim()
// Tentador: quitar los espacios de los lados y ya no hay problema. Pero eso
// cambia la contraseña de la persona sin decírselo. Si escribe "hola " con
// espacio y se lo recortamos al crearla, luego escribe "hola " para entrar,
// Supabase recibe otra cosa distinta y no la deja pasar. Los espacios se
// respetan; lo que se hace es AVISAR cuando la única diferencia es esa, porque
// mirando la pantalla las dos líneas de puntos parecen idénticas.

/** Lo que pide Supabase por defecto. Menos que esto lo rechaza el servidor. */
export const MINIMO = 6

export interface EstadoPassword {
  /** Llega al mínimo de caracteres. */
  largoOk: boolean
  /** Las dos son la misma (y no están vacías). */
  coincide: boolean
  /** Se puede enviar el formulario. */
  valida: boolean
  /** Qué decirle a la persona, o null si no hay nada que decir todavía. */
  error: string | null
}

/**
 * Si las dos son iguales salvo por espacios de los lados, dilo.
 *
 * Es el fallo tonto de toda la vida: el teclado del móvil mete un espacio al
 * terminar de escribir. En pantalla los dos campos son puntitos, así que
 * «no coinciden» suena a mentira y la persona lo vuelve a escribir igual.
 */
export function pistaDeDiferencia(a: string, b: string): string | null {
  if (a === b) return null
  if (a.trim() === b.trim() && a.trim() !== '') {
    return 'Parece que a una de las dos le sobra un espacio al principio o al final.'
  }
  return null
}

/**
 * Estado de un par contraseña + repetición.
 *
 * El `error` solo aparece cuando ya hay algo escrito en los dos campos: no se
 * regaña a nadie por no haber terminado de teclear.
 */
export function revisarPassword(password: string, repetida: string): EstadoPassword {
  const largoOk = password.length >= MINIMO
  const coincide = password.length > 0 && password === repetida
  const valida = largoOk && coincide

  let error: string | null = null
  if (password.length > 0 && !largoOk) {
    error = `La contraseña necesita al menos ${MINIMO} caracteres.`
  } else if (largoOk && repetida.length > 0 && !coincide) {
    error = pistaDeDiferencia(password, repetida) || 'Las dos contraseñas no son iguales.'
  }

  return { largoOk, coincide, valida, error }
}

/**
 * El error que toca enseñar al pulsar el botón, cuando el formulario no se
 * puede enviar. Aquí sí se habla aunque el segundo campo esté vacío, porque ya
 * no es «aún estoy escribiendo», es «he intentado enviarlo».
 */
export function errorAlEnviar(password: string, repetida: string): string | null {
  if (password.length < MINIMO) return `La contraseña necesita al menos ${MINIMO} caracteres.`
  if (repetida.length === 0) return 'Escribe la contraseña otra vez para confirmarla.'
  if (password !== repetida) {
    return pistaDeDiferencia(password, repetida) || 'Las dos contraseñas no son iguales.'
  }
  return null
}
