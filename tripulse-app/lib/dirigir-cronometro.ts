// ============================================================
// TRIPULSE — El cronómetro de los tests de campo
// ============================================================
//
// Dirigir un test es, casi siempre, medir tiempo: seis minutos exactos, treinta
// minutos, un 400 al máximo, doce repeticiones de 180 m hasta que se cae. Hoy
// eso se hace con el cronómetro del móvil en una mano y la app en la otra, y
// luego se teclea el número. Aquí el cronómetro ESTÁ en el test y el número cae
// solo en su casilla.
//
// EL `ahora` ENTRA POR PARÁMETRO Y NO SE LEE DENTRO. Así una cuenta atrás de
// treinta minutos se comprueba en un milisegundo en vez de esperando media
// hora, y el mismo estado siempre da el mismo resultado. La pantalla es la
// única que llama a `Date.now()`.
//
// SE GUARDA CUÁNDO ARRANCÓ, NO CUÁNTO LLEVA. Un contador que se incrementa cada
// décima se queda corto en cuanto el navegador ralentiza el temporizador —y lo
// hace en cuanto la pantalla se apaga o cambias de pestaña, que a pie de pista
// pasa todo el rato—. Restando marcas de tiempo, dé igual cuántas veces se
// pinte: el reloj no se puede desfasar.

export interface EstadoCrono {
  /** Cuándo arrancó el tramo en curso. `null` es que está parado. */
  desde: number | null
  /** Lo que llevaba acumulado de tramos anteriores, en ms. */
  acumulado: number
  /** Las vueltas ya cerradas, en ms. */
  vueltas: number[]
}

export const CRONO_PARADO: EstadoCrono = { desde: null, acumulado: 0, vueltas: [] }

export function corriendo(e: EstadoCrono): boolean {
  return e.desde != null
}

/** Está a cero y sin vueltas: nunca se ha usado. */
export function intacto(e: EstadoCrono): boolean {
  return e.desde == null && e.acumulado === 0 && e.vueltas.length === 0
}

/** Milisegundos del tramo en curso, contando lo de antes de la pausa. */
export function transcurrido(e: EstadoCrono, ahora: number): number {
  return e.acumulado + (e.desde == null ? 0 : Math.max(0, ahora - e.desde))
}

export function arrancar(e: EstadoCrono, ahora: number): EstadoCrono {
  /* Volver a arrancar uno que ya corre reiniciaría el tramo y se perderían los
     segundos que llevaba: se deja como está. */
  return corriendo(e) ? e : { ...e, desde: ahora }
}

export function pausar(e: EstadoCrono, ahora: number): EstadoCrono {
  if (!corriendo(e)) return e
  return { ...e, desde: null, acumulado: transcurrido(e, ahora) }
}

export function alternar(e: EstadoCrono, ahora: number): EstadoCrono {
  return corriendo(e) ? pausar(e, ahora) : arrancar(e, ahora)
}

export function reiniciar(): EstadoCrono {
  return { ...CRONO_PARADO, vueltas: [] }
}

/**
 * Cierra la vuelta en curso y empieza otra desde cero, sin parar.
 *
 * Es lo que hace falta en los tests de repeticiones hasta el agotamiento: cada
 * pulsación es una repetición terminada, y de ahí salen las tres cosas que se
 * apuntan —cuántas, la mejor y la última—. Parar y arrancar entre repeticiones
 * perdería el tiempo que tardas en pulsar dos veces.
 *
 * Una vuelta de cero no se guarda: es una pulsación doble sin querer, no una
 * repetición de 0 segundos.
 */
export function vuelta(e: EstadoCrono, ahora: number): EstadoCrono {
  const t = transcurrido(e, ahora)
  if (t <= 0) return e
  return {
    desde: corriendo(e) ? ahora : null,
    acumulado: 0,
    vueltas: [...e.vueltas, t],
  }
}

export interface ResumenVueltas {
  /** Cuántas se completaron. */
  repes: number
  /** La más rápida, en segundos con una décima. */
  mejor: number | null
  /** La última, en segundos con una décima. */
  ultima: number | null
}

export function resumenVueltas(vueltas: number[]): ResumenVueltas {
  if (vueltas.length === 0) return { repes: 0, mejor: null, ultima: null }
  const seg = (ms: number) => Math.round(ms / 100) / 10
  return {
    repes: vueltas.length,
    mejor: seg(Math.min(...vueltas)),
    ultima: seg(vueltas[vueltas.length - 1]),
  }
}

// ── Cuenta atrás ────────────────────────────────────────────

/**
 * Lo que falta, en ms. Nunca baja de cero.
 *
 * En un test de duración fija —seis minutos, treinta minutos— lo que hace falta
 * no es saber cuánto llevas sino cuánto queda: es lo que se le canta al atleta.
 */
export function restante(e: EstadoCrono, totalSeg: number, ahora: number): number {
  return Math.max(0, totalSeg * 1000 - transcurrido(e, ahora))
}

export function terminada(e: EstadoCrono, totalSeg: number, ahora: number): boolean {
  return restante(e, totalSeg, ahora) === 0 && !intacto(e)
}

/** Cuánto se ha hecho ya, de 0 a 1, para pintar la barra. */
export function progreso(e: EstadoCrono, totalSeg: number, ahora: number): number {
  if (totalSeg <= 0) return 0
  return Math.min(1, transcurrido(e, ahora) / (totalSeg * 1000))
}

// ── Escalones ───────────────────────────────────────────────

export interface Escalon {
  /** El primero es el 1, no el 0: es lo que se le canta al atleta. */
  numero: number
  /** La velocidad o la potencia que toca ahora. */
  intensidad: number
  /** Cuántos segundos lleva DE ESTE escalón. */
  dentro: number
}

/**
 * En qué escalón va un protocolo incremental, a partir del tiempo corrido.
 *
 * VIVE AQUÍ Y NO EN LA PANTALLA porque hay DOS pantallas que lo necesitan: el
 * Montreal de una persona y el mismo Montreal pasado a un grupo entero. Si cada
 * una lo calculase por su cuenta, el mismo test podría decir «escalón 9» en una
 * y «escalón 10» en la otra, y de ahí sale la VAM.
 *
 * La duración y el incremento entran por parámetro y no como constantes: si el
 * entrenador monta escalones de 30 s en vez de 60, esto va con él.
 */
export function escalonEn(
  ms: number, inicial: number, duracionSeg: number, incremento: number,
): Escalon {
  const dur = duracionSeg > 0 ? duracionSeg : 60
  const t = Math.max(0, ms) / 1000
  const k = Math.floor(t / dur)
  return {
    numero: k + 1,
    intensidad: Math.round((inicial + k * incremento) * 10) / 10,
    dentro: t - k * dur,
  }
}

// ── Cómo se enseña ──────────────────────────────────────────

/** «5:23» — para las cuentas atrás largas, donde las décimas sobran. */
export function relojMinutos(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

/**
 * «1:23.4» — para cronometrar, donde la décima sí importa.
 *
 * Se redondea HACIA ABAJO y no al más cercano: un cronómetro que enseña 4,0
 * cuando van 3,96 estaría diciendo que ya pasaron cuatro segundos y todavía no.
 */
export function relojDecimas(ms: number): string {
  const t = Math.max(0, ms)
  const m = Math.floor(t / 60000)
  const s = Math.floor((t % 60000) / 1000)
  const d = Math.floor((t % 1000) / 100)
  return m + ':' + String(s).padStart(2, '0') + '.' + d
}

/** Los segundos que se meten en la casilla, con una décima. */
export function enSegundos(ms: number): number {
  return Math.round(ms / 100) / 10
}

/** Los minutos que se meten en la casilla, con dos decimales. */
export function enMinutos(ms: number): number {
  return Math.round(ms / 600) / 100
}
