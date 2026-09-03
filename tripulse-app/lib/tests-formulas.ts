// ============================================================
// TRIPULSE — De lo que se mide en el test al número que se usa
// ============================================================
//
// Las tres fórmulas vivían DENTRO de la pantalla de tests de un deportista,
// cerradas sobre su estado. Al hacer el test de grupo habrían tenido que
// escribirse por segunda vez, y entonces la VAM de una persona y la del grupo
// podrían acabar diciendo cosas distintas sin que nadie se entere. Es el fallo
// que este proyecto lleva persiguiendo, así que se sacan aquí y las dos
// pantallas llaman a lo mismo.
//
// Todas devuelven `null` si falta algún dato en vez de un número inventado: un
// test a medias no es un test.

/** Lo que se mide en un test de Montreal. */
export interface MontrealEntrada {
  /** Velocidad del último escalón que empezó, en km/h. */
  velUltimo: number | string
  /** Cuánto dura un escalón completo, en segundos. */
  durTotal: number | string
  /** Cuánto aguantó del último escalón, en segundos. */
  tiempoAguantado: number | string
  /** Cuánto sube la velocidad de un escalón al siguiente, en km/h. */
  incrementoVel: number | string
}

const n = (v: number | string | null | undefined) => (v === '' || v == null ? NaN : Number(v))
const hay = (...vs: (number | string | null | undefined)[]) => vs.every(v => Number.isFinite(n(v)) && n(v) !== 0)

/**
 * VAM en km/h.
 *
 * Se cuenta el último escalón EN PROPORCIÓN a lo que se aguantó: quien se baja
 * a los diez segundos no ha corrido ese escalón, y quien lo aguanta entero sí.
 */
export function vamDeMontreal(e: MontrealEntrada): number | null {
  if (!hay(e.velUltimo, e.durTotal, e.tiempoAguantado, e.incrementoVel)) return null
  const v = n(e.velUltimo) - n(e.incrementoVel) * (1 - n(e.tiempoAguantado) / n(e.durTotal))
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
}

export interface CssEntrada {
  distanciaGrande: number | string
  distanciaPequena: number | string
  tiempoGrande: number | string
  tiempoPequeno: number | string
}

/**
 * CSS en m/s: la pendiente entre las dos distancias.
 *
 * La resta de tiempos va abajo, así que si los dos tiempos son iguales —o el
 * corto es más lento que el largo— sale infinito o negativo. Eso no es un CSS,
 * es un dato mal metido, y se devuelve null.
 */
export function cssDeDosDistancias(e: CssEntrada): number | null {
  if (!hay(e.distanciaGrande, e.distanciaPequena, e.tiempoGrande, e.tiempoPequeno)) return null
  const dd = n(e.distanciaGrande) - n(e.distanciaPequena)
  const dt = n(e.tiempoGrande) - n(e.tiempoPequeno)
  if (dd <= 0 || dt <= 0) return null
  return Math.round((dd / dt) * 1000) / 1000
}

export interface FtpEntrada {
  /** Potencia del último escalón alcanzado, en vatios. */
  potenciaPico: number | string
  /** Cuánto sube la potencia de un escalón al siguiente. */
  incrementoPot: number | string
  /** Cuánto aguantó del escalón que no completó, en segundos. */
  tiempoNoCompletado: number | string
  /** Cuánto dura un escalón completo, en segundos. */
  durEscalones: number | string
}

/** Cuánto factor del pico de la rampa es el FTP. Batería de tests, §2. */
export const FACTOR_FTP_RAMPA = 0.75

/**
 * PAM en vatios: la potencia del último escalón, contado en proporción.
 *
 * Quien se baja a los diez segundos no ha hecho ese escalón y quien lo aguanta
 * entero sí, así que se pondera. Es el mismo criterio que la VAM de Montreal.
 */
export function pamDeRampa(e: FtpEntrada): number | null {
  if (!hay(e.potenciaPico, e.incrementoPot, e.tiempoNoCompletado, e.durEscalones)) return null
  const w = (n(e.potenciaPico) - n(e.incrementoPot)) + n(e.incrementoPot) * n(e.tiempoNoCompletado) / n(e.durEscalones)
  return Number.isFinite(w) ? Math.round(w) : null
}

/**
 * FTP en vatios: el 75 % de la PAM.
 *
 * ESTO ESTABA MAL Y DURANTE MUCHO TIEMPO. La función devolvía la PAM y se
 * guardaba tal cual en `test3_ciclismo.ftp`: el factor 0,75 no se aplicaba en
 * ninguna parte del código. O sea que el FTP de todos los ciclistas era un
 * tercio más alto del que les correspondía.
 *
 * Y de ahí salen las zonas —en /zonas/[id] la Z2 es el 55-75 % del FTP, la Z3
 * el 75-90 %—, así que a un ciclista al que se le mandaba «Z3» se le estaba
 * mandando bastante por encima de Z3. No rompía nada y no avisaba nadie: el
 * número simplemente mentía.
 *
 * Que la tabla tuviera `potencia_pico` y `ftp` como columnas separadas ya decía
 * que la intención era guardar dos cosas distintas; se guardaba la misma.
 *
 * FUENTE: la batería de tests del proyecto, §2 Ciclismo — «FTP = último min ×
 * 0,75 · PAM = último min».
 */
export function ftpDeRampa(e: FtpEntrada): number | null {
  const pam = pamDeRampa(e)
  return pam == null ? null : Math.round(pam * FACTOR_FTP_RAMPA)
}

// ------------------------------------------------------------
// Cómo se leen esos números
// ------------------------------------------------------------
// Un CSS de 1,25 m/s no le dice nada a nadie; «1:20 /100m» sí.

/** «4:12 /km» a partir de una VAM en km/h. */
export function ritmoDeVam(vam: number | null | undefined): string {
  if (!vam || vam <= 0) return '—'
  const s = 3600 / vam
  return Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0') + ' /km'
}

/** «1:20 /100m» a partir de un CSS en m/s. */
export function ritmoDeCss(css: number | null | undefined): string {
  if (!css || css <= 0) return '—'
  const s = 100 / css
  return Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0') + ' /100m'
}
