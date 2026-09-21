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
// QUE SE OIGA EN UN MÓVIL. Al principio era un tono puro de 880 Hz a un tercio
// de volumen que se iba apagando: sonaba flojo, porque el altavoz de un móvil
// casi no reproduce esa frecuencia pura. Ahora es una onda cuadrada —la de los
// cronos deportivos—, cuyos armónicos caen donde el altavoz del móvil sí suena
// y el oído es más sensible, y se mantiene a volumen alto hasta el final. Un
// limitador a la salida evita que dos pitidos a la vez saturen.
//
// Y VIBRA. Con el móvil en la mano o en el bolsillo, el cambio de escalón se
// nota aunque haya ruido. Solo en Android: Safari (iPhone) no deja vibrar desde
// una web, y ahí el interruptor ni aparece. El truco que daba un «tic» en
// iPhone lo cerró Apple en iOS 26.5: ahora solo responde a un dedo de verdad.
//
// Y DESTELLA. Para el iPhone, y para quien tenga el móvil en la mano sin mirar
// los números: la pantalla se tiñe de naranja medio segundo y se desvanece. Se
// ve de reojo.
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
let limitador: DynamicsCompressorNode | null = null

/** Volumen de cada pitido (0 a 1). La onda cuadrada ya suena mucho más que la pura. */
const VOLUMEN = 0.9
/** Silencio entre dos pitidos seguidos, en ms. */
const HUECO_MS = 90

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

/** La salida común: un limitador, para que dos pitidos que coinciden no saturen. */
function salida(c: AudioContext): AudioNode {
  if (!limitador || limitador.context !== c) {
    limitador = c.createDynamicsCompressor()
    limitador.threshold.value = -3
    limitador.knee.value = 0
    limitador.ratio.value = 20
    limitador.attack.value = 0.002
    limitador.release.value = 0.05
    limitador.connect(c.destination)
  }
  return limitador
}

/**
 * Un tono corto, o varios seguidos.
 *
 * 880 Hz porque tiene que oírse en una pista con viento y con gente, y esa
 * octava se abre paso mejor que un grave. Sube de golpe, se mantiene a tope y
 * cae en 20 ms al final: cortar la onda en seco dejaría un chasquido.
 */
export function pitar(hz = 880, ms = 160, veces = 1): void {
  if (!pitidoEncendido()) return
  despertarAudio()
  if (!ctx || ctx.state !== 'running') return
  try {
    const dur = Math.max(ms, 40) / 1000
    const t0 = ctx.currentTime
    for (let k = 0; k < veces; k++) {
      const t = t0 + k * (dur + HUECO_MS / 1000)
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = hz
      vol.gain.setValueAtTime(0.0001, t)
      vol.gain.exponentialRampToValueAtTime(VOLUMEN, t + 0.005)
      vol.gain.setValueAtTime(VOLUMEN, t + dur - 0.02)
      vol.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.connect(vol).connect(salida(ctx))
      osc.start(t)
      osc.stop(t + dur + 0.02)
    }
  } catch { /* si el navegador no deja, el test sigue */ }
}

// ============================================================
// La vibración
// ============================================================

const CLAVE_VIBRA = 'tp_vibra_tests'

/** Dos golpes largos: se notan en la mano y en el bolsillo, y no se confunden con una notificación. */
export const PATRON_ESCALON = [250, 120, 250]

/** Si este navegador sabe vibrar. En iPhone (Safari) no: Apple no lo deja a las webs. */
export function puedeVibrar(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** Si la vibración está encendida. Encendida por defecto, como el pitido. */
export function vibracionEncendida(): boolean {
  try { return localStorage.getItem(CLAVE_VIBRA) !== 'no' } catch { return true }
}

export function ponVibracion(encendida: boolean): void {
  try { localStorage.setItem(CLAVE_VIBRA, encendida ? 'si' : 'no') } catch { /* modo privado */ }
}

/**
 * Vibra, si se puede y si está encendida.
 *
 * El navegador solo deja vibrar después de que se haya tocado la página: aquí
 * siempre es así, porque el reloj lo arranca una pulsación.
 */
export function vibrar(patron: number[] = PATRON_ESCALON): void {
  if (!vibracionEncendida() || !puedeVibrar()) return
  try { navigator.vibrate(patron) } catch { /* sin vibración, el test sigue */ }
}

// ============================================================
// El aviso de cambio de escalón
// ============================================================

/** Cómo suena el cambio de escalón: dos pitidos. */
export function sonarEscalon(): void {
  pitar(880, 200, 2)
}

// ============================================================
// El destello
// ============================================================

const CLAVE_DESTELLO = 'tp_destello_tests'

/** Si el destello está encendido. Encendido por defecto, como el resto. */
export function destelloEncendido(): boolean {
  try { return localStorage.getItem(CLAVE_DESTELLO) !== 'no' } catch { return true }
}

export function ponDestello(encendido: boolean): void {
  try { localStorage.setItem(CLAVE_DESTELLO, encendido ? 'si' : 'no') } catch { /* modo privado */ }
}

/** Cuánto dura el destello, en ms. */
export const DURACION_DESTELLO = 650

/**
 * La pantalla se tiñe de naranja y se desvanece.
 *
 * Se pinta a mano sobre el documento y no con React: así vale igual en las tres
 * pantallas sin que cada una tenga que reservarle un sitio. No bloquea nada
 * (pointer-events: none) y deja ver los números a través, para no tapar el
 * escalón justo cuando cambia.
 *
 * Con «reducir movimiento» activado en el móvil no hay fundido: aparece y
 * desaparece de golpe, que sigue avisando sin animar nada.
 */
export function destellar(): void {
  if (!destelloEncendido()) return
  if (typeof document === 'undefined' || !document.body) return
  try {
    const quieto = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const capa = document.createElement('div')
    capa.setAttribute('aria-hidden', 'true')
    Object.assign(capa.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9999',
      background: '#fb923c', opacity: quieto ? '0.7' : '0',
    })
    document.body.appendChild(capa)
    /* El fundido con la API de animaciones y no con una transición de CSS: la
       transición necesita que el navegador pinte la capa opaca en un fotograma
       y la cambie en el siguiente, y eso depende de cuándo le toque pintar. */
    if (!quieto && typeof capa.animate === 'function') {
      capa.animate([{ opacity: 0.7 }, { opacity: 0 }], { duration: DURACION_DESTELLO, easing: 'ease-out' })
    }
    /* Se quita por reloj y no al acabar la animación: con la pantalla apagada
       la animación no termina nunca, y la capa se quedaría puesta. */
    setTimeout(() => capa.remove(), quieto ? 400 : DURACION_DESTELLO + 50)
  } catch { /* sin destello, el test sigue */ }
}

/**
 * Lo que pasa al cambiar de escalón, en todas las pantallas: dos pitidos, dos
 * vibraciones y un destello. Cada uno se calla por su lado si el entrenador lo
 * ha apagado.
 */
export function avisarEscalon(): void {
  sonarEscalon()
  vibrar()
  destellar()
}
