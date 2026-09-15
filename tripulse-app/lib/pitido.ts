// ============================================================
// TRIPULSE — El pitido del cambio de escalón
// ============================================================
// En el Montreal y en la rampa el entrenador va cantando la velocidad: «8,5…
// 9,0… 9,5». Para eso tiene que estar mirando el reloj, y mirar el reloj es no
// mirar a los atletas — que es justo lo que hay que hacer para ver quién se
// está descolgando. Un pitido al cambiar de escalón le devuelve los ojos.
//
// SE SINTETIZA, NO SE DESCARGA. Un fichero de sonido hay que pedirlo a la red, y
// esto se usa en una pista, con el móvil a dos rayas o sin cobertura. El
// navegador sabe hacer un tono sin bajarse nada.
//
// LOS NAVEGADORES NO DEJAN SONAR SIN UNA PULSACIÓN, y es una norma razonable:
// si no, cualquier página pitaría sola. Por eso el audio se despierta en el
// botón de «Dar la salida», que es una pulsación de verdad, y no al cargar la
// pantalla — donde el navegador lo bloquearía en silencio y el entrenador
// pensaría que la app no pita.

/**
 * ¿Toca pitar?
 *
 * Aparte del audio porque es donde puede estar el fallo, y el fallo se oye: un
 * pitido de más en mitad de un test confunde al que está corriendo.
 *
 *   · Parado no se pita. Ni al cargar la pantalla ni con el reloj en pausa.
 *   · Al arrancar tampoco: el primer escalón no es un CAMBIO de escalón.
 *   · Y solo hacia arriba, para que reiniciar el reloj no suene.
 */
export function debePitar(
  anterior: number | null | undefined,
  actual: number,
  corriendo: boolean,
): boolean {
  if (!corriendo) return false
  if (anterior == null) return false
  return actual > anterior
}

let ctx: AudioContext | null = null

/** Con qué nombre lo guarda el navegador de este entrenador. */
const CLAVE = 'tp_pitido_tests'

/** Si el pitido está encendido. Encendido por defecto: se pidió para oírlo. */
export function pitidoEncendido(): boolean {
  try { return localStorage.getItem(CLAVE) !== 'no' } catch { return true }
}

export function ponPitido(encendido: boolean): void {
  try { localStorage.setItem(CLAVE, encendido ? 'si' : 'no') } catch { /* modo privado */ }
}

/**
 * Prepara el audio. Se llama DESDE la pulsación que da la salida.
 *
 * Si el navegador lo tenía suspendido —pasa al volver de otra pestaña— se
 * reanuda aquí, que si no el primer cambio de escalón sonaría mudo.
 */
export function despertarAudio(): void {
  if (typeof window === 'undefined') return
  try {
    const AC = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    if (!ctx) ctx = new AC()
    if (ctx.state === 'suspended') ctx.resume()
  } catch { /* sin audio, el test sigue funcionando igual */ }
}

/**
 * Un tono corto.
 *
 * 880 Hz porque tiene que oírse en una pista con viento y con gente, y esa
 * octava se abre paso mejor que un grave. La rampa de volumen al final evita el
 * chasquido que deja cortar una onda en seco.
 */
export function pitar(hz = 880, ms = 160): void {
  if (!pitidoEncendido()) return
  despertarAudio()
  if (!ctx || ctx.state !== 'running') return
  try {
    const osc = ctx.createOscillator()
    const vol = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = hz
    const t = ctx.currentTime
    vol.gain.setValueAtTime(0.0001, t)
    vol.gain.exponentialRampToValueAtTime(0.35, t + 0.01)
    vol.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
    osc.connect(vol).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + ms / 1000 + 0.02)
  } catch { /* si el navegador no deja, el test sigue */ }
}
