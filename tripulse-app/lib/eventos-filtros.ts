// ============================================================
// Qué NO se manda al registro de errores
// ============================================================
// Aparte para que se pueda probar sin arrastrar el cliente de Supabase: son
// dos funciones puras y no tienen por qué necesitar una conexión para
// comprobarse.

/**
 * ¿Esto es la máquina de quien programa?
 *
 * Hacía falta porque el registro llevaba desde agosto llenándose de errores de
 * DESARROLLO. Al guardar un fichero a medias, Fast Refresh recarga el módulo en
 * un estado roto y salta un «X is not defined» que no le pasa a nadie. Con eso
 * dentro, la pantalla de /admin estaba al cien por cien de ruido: el día que un
 * usuario de verdad tuviera un fallo, quedaba sepultado.
 *
 * Un registro de errores donde no se puede distinguir lo real de lo mío no es
 * un registro, es un archivador.
 */
/* Las IP de red local. Van aquí porque el filtro de `localhost` solo tapaba
   media puerta: para ver la app en el móvil, el servidor de desarrollo se abre
   por la IP del portátil (192.168.1.40:3000) y entonces el navegador del móvil
   NO dice «localhost». Con eso, cada prueba en el móvil volvía a llenar el
   registro del mismo ruido de Fast Refresh que se filtró en agosto.

   Son los tres rangos privados de la RFC 1918 más el 169.254 de cuando no hay
   router. Ninguno de ellos es alcanzable desde internet, así que nada que venga
   de una de estas direcciones puede ser un usuario de verdad. */
const RED_LOCAL = [
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
]

export function esDesarrollo(host?: string): boolean {
  const h = (host ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')) return true
  return RED_LOCAL.some(r => r.test(h))
}

/**
 * Ruido conocido que no es un fallo de nadie.
 *
 * El del «lock» lo suelta el cliente de Supabase cuando hay varias pestañas
 * abiertas: se coordinan con la API de Web Locks para refrescar el token y una
 * le quita el turno a otra. Es lo esperado, no un problema, y llenaría la lista
 * de gente que trabaja con dos pestañas.
 */
const RUIDO = [
  /Lock broken by another request/i,
  /ResizeObserver loop/i,
  /Load failed$/i,
]

export function esRuido(mensaje: string): boolean {
  return RUIDO.some(r => r.test(mensaje || ''))
}
