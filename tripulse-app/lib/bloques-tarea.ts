// ============================================================
// Una tarea que se repite en bloques: 3 × (2 × 400)
// ============================================================
//
// QUÉ ES. Un botón por tarea, apagado por defecto, que la convierte en bloques:
// «2 × 400» pasa a «3 × (2 × 400)», con su descanso corto entre los 400 y uno
// largo entre bloques. No es algo que se use siempre, y por eso no ocupa sitio
// hasta que el entrenador lo enciende.
//
// Y LO PELIGROSO NO ES EL BOTÓN: ES CONTARLO. `series` se multiplica en muchos
// sitios —el volumen, la duración, la carga, la hoja de grupo, los cronómetros
// de dirigir— y un solo sitio que se olvide del «× 3» deja el volumen del
// atleta en un tercio sin que nada falle. Así que la cuenta vive AQUÍ y en
// ningún otro sitio: quien necesite saber cuántas veces se hace una tarea lo
// pregunta a `vecesDe`, no multiplica por su cuenta.

/** Lo que hace falta de una tarea para saber cuántas veces se hace. */
export interface ConBloques {
  series?: number | null
  bloques?: number | null
  descanso_segundos?: number | null
  descanso_bloques_segundos?: number | null
}

/**
 * Cuántos bloques. 1 = no está en bloques.
 *
 * Todo lo que no sea un entero mayor que 1 cuenta como 1: un «1 bloque» es una
 * tarea normal, y un cero o un negativo guardados a mano no pueden dejar el
 * volumen en nada.
 */
export const bloquesDe = (t: ConBloques | null | undefined): number => {
  const b = Math.round(Number(t?.bloques))
  return b > 1 ? b : 1
}

export const hayBloques = (t: ConBloques | null | undefined): boolean => bloquesDe(t) > 1

/** Las series de UN bloque. Sin series, una. */
export const seriesTarea = (t: ConBloques | null | undefined): number => {
  const s = Number(t?.series)
  return s > 0 ? s : 1
}

/**
 * Cuántas veces se hace la unidad de la tarea: series × bloques.
 *
 * ES LA ÚNICA MULTIPLICACIÓN. 3 × (2 × 400) son seis 400: 2.400 m, no 800.
 */
export const vecesDe = (t: ConBloques | null | undefined): number => seriesTarea(t) * bloquesDe(t)

const positivo = (x: unknown): number => (Number(x) > 0 ? Number(x) : 0)

/**
 * El descanso de DENTRO de la tarea, en segundos.
 *
 * Dentro de cada bloque hay (series − 1) descansos cortos, y entre bloques hay
 * (bloques − 1) descansos largos. En 3 × (2 × 400) con 1:00 y 3:00: tres
 * descansos de 1:00 —uno por bloque— y dos de 3:00. El del último 400 no está
 * aquí: es el paso a la tarea siguiente, y lo da `descansoFinalDe`.
 */
export const descansoTotalDe = (t: ConBloques | null | undefined): number => {
  const b = bloquesDe(t)
  return positivo(t?.descanso_segundos) * Math.max(0, seriesTarea(t) - 1) * b
    + positivo(t?.descanso_bloques_segundos) * Math.max(0, b - 1)
}

/**
 * El descanso que va detrás de la ÚLTIMA serie: el paso a la tarea siguiente.
 *
 * Lo pidió el entrenador el 24-10-2026 viendo la gráfica de una sesión: «falta
 * un descanso después del 3 mil y después del último 400». Quien escribe
 * «3 × 400, 2:00» y debajo un 3.000 descansa también entre el tercer 400 y el
 * 3.000, y el 3:00 de una tarea de una sola serie solo puede ser eso. Hasta
 * entonces no contaba en ninguna pantalla, y el reloj sí lo hacía con los 400.
 *
 * SOLO SI DETRÁS VIENE OTRA TAREA: al final de la sesión no se descansa. Eso
 * no lo sabe la tarea, lo sabe quien recorre la sesión (lib/duracion, el envío
 * a COROS, la gráfica de la sesión), así que aquí no se mira.
 *
 * En bloques es el LARGO, el que va detrás de cada bloque; sin largo, el corto.
 */
export const descansoFinalDe = (t: ConBloques | null | undefined): number => {
  const largo = positivo(t?.descanso_bloques_segundos)
  return hayBloques(t) && largo > 0 ? largo : positivo(t?.descanso_segundos)
}

/**
 * Cómo se lee la repetición: «3 × (2 × 400 m)», «2 × 400 m» o «400 m».
 *
 * Los paréntesis no son adorno: «3 × 2 × 400» se lee igual de bien como seis
 * 400 seguidos, y lo que distingue esta sesión de un 6 × 400 es justo que va
 * en bloques.
 */
export function repeticionTexto(t: ConBloques | null | undefined, unidad: string): string {
  const s = seriesTarea(t)
  const dentro = s > 1 ? s + ' × ' + unidad : unidad
  return hayBloques(t) ? bloquesDe(t) + ' × (' + dentro + ')' : dentro
}
