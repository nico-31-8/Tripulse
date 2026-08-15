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
 * APAGADO a propósito. El planificador por reglas sí está en producción; la
 * parte de IA todavía no la ha usado un humano y gasta créditos por llamada,
 * así que no se abre hasta probarla a mano.
 *
 * Apaga las DOS cosas: los botones de la pantalla y las rutas. Solo los botones
 * no bastaría — las rutas seguirían contestando a cualquier entrenador que
 * supiera la URL, y «no está desplegado» tiene que ser verdad, no una capa de
 * pintura.
 *
 * Para encenderlo: `true` aquí. No hay nada más que tocar.
 */
export const IA_PLANIFICADOR = false
