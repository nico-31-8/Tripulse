// ============================================================
// TRIPULSE — Interruptores de funcionalidad
// ============================================================
// Para lo que está escrito y probado en local pero todavía no se quiere en
// producción. La alternativa —dejarlo fuera de `main`— obliga a mantener ramas
// divergentes y a resolver conflictos cada vez que se toca un fichero cercano.

/**
 * Las dos capas de IA del planificador de semanas: la revisión de la semana
 * determinista (`/api/plan`) y la opción C, en la que el modelo monta la semana
 * entera (`/api/plan/generar`).
 *
 * ENCENDIDO desde el 16/08/2026, a petición del entrenador.
 *
 * Lo que eso abre: los dos botones de `/planificador` y las rutas `/api/plan` y
 * `/api/plan/generar`. Cada pulsación cuesta créditos de la API — la revisión
 * unas centésimas, montar la semana entera del orden de 0,18 $.
 *
 * Lo que NO abre, porque no depende de esto: la IA no puede escribir en el
 * calendario. Propone, y el volcado sigue siendo un clic del entrenador. Y en
 * la capa de revisión solo puede BAJAR la intensidad, nunca subirla.
 *
 * El interruptor gobierna las dos cosas —pantalla y rutas— a propósito: solo
 * esconder los botones dejaría las rutas contestando a cualquier entrenador que
 * supiera la URL. Para volver a cerrarlo, `false` aquí y nada más.
 */
export const IA_PLANIFICADOR = true
