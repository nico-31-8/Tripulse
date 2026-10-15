// ============================================================
// TRIPULSE — Borrar una tarea, o vaciar su medición
// ============================================================
// Estaba escrito tres veces (la tabla del editor, su borrado silencioso y la
// vista Formulario) y las tres hacían cinco borrados uno detrás de otro: los
// metros, el tiempo, las repeticiones, los ejercicios y la tarea. Ahora es UNA
// orden (lo de dentro se va en cascada) y la medición, cuando se rehace una
// fila, sus tres tablas a la vez. Una espera en vez de cinco.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Las tres tablas donde vive la medición de una tarea: una tarea solo tiene una. */
export const TABLAS_MEDICION = ['p_distancia', 'p_duracion', 'p_repeticiones'] as const

/**
 * Vacía la medición de una tarea: las tres tablas a la vez.
 *
 * Al editar se limpian las tres antes de escribir la nueva: si solo se tocara
 * la nueva, cambiar de metros a minutos dejaría las dos, y el volumen se
 * contaría por partida doble sin que nada se queje.
 */
export async function vaciarMedicion(sb: any, idTarea: number): Promise<string | null> {
  const r = await Promise.all(TABLAS_MEDICION.map(t => sb.from(t).delete().eq('id_tarea', idTarea)))
  return r.find((x: any) => x?.error)?.error?.message ?? null
}

/**
 * Borra una tarea con todo lo que cuelga de ella. Devuelve el error, o null.
 *
 * CON UNA SOLA ORDEN: sus metros, su tiempo, sus repeticiones, sus ejercicios y
 * sus series cuelgan de ella con ON DELETE CASCADE, y una orden es todo o nada.
 * Se borraban primero los hijos y la tarea después, y eso tenía un agujero: si
 * el deportista ya había apuntado series de fuerza, la base no deja borrar los
 * ejercicios (las series cuelgan de ellos, sin cascada), pero para entonces los
 * metros y el tiempo ya se habían ido. La tarea se quedaba sin su medición.
 */
export async function borrarTareaEntera(sb: any, idTarea: number): Promise<string | null> {
  const { error } = await sb.from('tarea').delete().eq('id', idTarea)
  return error ? mensajeDeBorrado(error) : null
}

/** El porqué de un borrado que no se ha podido hacer, dicho para el entrenador. */
export function mensajeDeBorrado(error: { message?: string; code?: string } | null | undefined): string {
  const m = error?.message || ''
  if (error?.code === '23503' || /series_realizadas/.test(m)) {
    return 'El deportista ya apuntó series en esta tarea. Borrarla se llevaría lo que entrenó, así que no se ha borrado.'
  }
  return m || 'No se ha podido borrar.'
}
