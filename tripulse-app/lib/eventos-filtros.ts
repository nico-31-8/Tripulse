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
export function esDesarrollo(host?: string): boolean {
  const h = (host ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')
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
