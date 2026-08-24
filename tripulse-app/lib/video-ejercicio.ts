// ============================================================
// TRIPULSE — El vídeo de un ejercicio se resuelve EN VIVO
// ============================================================
//
// EL VÍDEO NO ES PARTE DE LA PRESCRIPCIÓN. Que `ejercicios` guarde congelados el
// nombre, las series y los kilos está bien y es a propósito: si el entrenador
// renombra un ejercicio de la biblioteca, la sesión de hace tres meses tiene que
// seguir diciendo lo que dijo. Pero el vídeo no es lo que se prescribió, es
// material de referencia SOBRE EL MOVIMIENTO, y ese tiene que ser el de ahora.
//
// Hasta hoy se copiaba: al prescribir se metía `url_video` dentro de la fila de
// `ejercicios`. Consecuencia medida contra la base el 2026-08-24: la biblioteca
// tenía 28 vídeos y solo 4 de 39 ejercicios prescritos enseñaban uno. Los demás
// se prescribieron ANTES de que su vídeo existiera, así que su copia nació vacía
// y ahí se quedó — al atleta no le llegaba, y arreglarlo exigía volver a
// prescribir la sesión. Corregir una URL mal pegada tampoco llegaba a nada.
//
// La técnica ya lo hacía bien (ver lib/tecnica.ts): se resuelve por id contra la
// biblioteca al leer. Esto es lo mismo para la fuerza.
//
// POR QUÉ POR ID Y NO POR NOMBRE. Se midió antes de decidir. Con solo 39
// ejercicios prescritos ya había 3 con un nombre que YA NO EXISTE en la
// biblioteca (renombrados) y 1 nombre repetido apuntando a dos ejercicios
// distintos. Casar por nombre habría perdido los primeros y elegido a cara o
// cruz en el segundo, y un vídeo equivocado enseña OTRO ejercicio. Por eso
// `ejercicio_id`.

/** Lo que hace falta de una fila de `ejercicios` para resolverle el vídeo. */
export interface FilaConVideo {
  ejercicio_id?: number | string | null
  ejercicio_encadenado_id?: number | string | null
  /** La copia vieja. Solo se usa si no hay id que resolver. */
  url_video?: string | null
}

/** Los dos ids de la biblioteca que aparecen en estas filas, sin repetir. */
export function idsDeBiblioteca(filas: FilaConVideo[] | null | undefined): string[] {
  const set = new Set<string>()
  for (const f of filas || []) {
    if (f?.ejercicio_id != null) set.add(String(f.ejercicio_id))
    if (f?.ejercicio_encadenado_id != null) set.add(String(f.ejercicio_encadenado_id))
  }
  return [...set]
}

/**
 * Pega `video` y `videoEncadenado` a cada fila.
 *
 * `porId` son los vídeos de la biblioteca. Las claves se comparan como TEXTO: el
 * id llega como número o como cadena según de dónde venga, y un `12 !== '12'`
 * silencioso dejaría al ejercicio sin vídeo sin que nadie se entere. Es el mismo
 * cuidado que hay en lib/tecnica.
 *
 * Si no hay id que resolver —las filas anteriores a que existiera la columna—,
 * se cae a la `url_video` copiada. Esas siguen viéndose exactamente como hasta
 * ahora: el arreglo no le quita nada a nadie.
 */
export function conVideosResueltos<T extends FilaConVideo>(
  filas: T[] | null | undefined,
  porId: Map<string, string | null>,
): (T & { video: string | null; videoEncadenado: string | null })[] {
  return (filas || []).map(f => {
    /* Se pregunta si la biblioteca CONOCE el ejercicio, no si tiene vídeo. Si lo
       conoce, manda ella aunque diga que no hay: cuando el entrenador borra una
       URL mal pegada, la copia guardada no puede resucitarla — vaciarla es la
       otra mitad de poder editarla. Solo se cae a la copia cuando no hay id que
       resolver o cuando ese id ya no existe en la biblioteca. */
    const id = f?.ejercicio_id
    const conocido = id != null && porId.has(String(id))
    const enc = f?.ejercicio_encadenado_id != null ? porId.get(String(f.ejercicio_encadenado_id)) : undefined
    return {
      ...f,
      video: conocido ? (porId.get(String(id)) || null) : (f?.url_video || null),
      videoEncadenado: enc || null,
    }
  })
}

/**
 * Los vídeos de estas filas, en una sola consulta.
 *
 * Devuelve las filas con `video` y `videoEncadenado` puestos. Sin ids no
 * consulta nada y devuelve las filas tal cual con su copia vieja, así que se
 * puede llamar siempre sin pagar un viaje de más.
 *
 * El cliente se pide tarde y solo si hace falta, por lo mismo que en
 * lib/tecnica: importarlo arriba monta el cliente de Supabase al cargar el
 * módulo y eso revienta en los tests, donde no hay ni URL ni clave.
 */
export async function conVideos<T extends FilaConVideo>(
  filas: T[] | null | undefined,
  sb?: any,
): Promise<(T & { video: string | null; videoEncadenado: string | null })[]> {
  const lista = filas || []
  return conVideosResueltos(lista, await cargarVideos(idsDeBiblioteca(lista), sb))
}

/** Los vídeos de esos ids de la biblioteca. Sin ids no consulta nada. */
async function cargarVideos(ids: string[], sb?: any): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map()
  const cliente = sb || (await import('./supabase')).supabase
  const { data } = await cliente.from('ejercicios_biblioteca').select('id, url_video').in('id', ids)
  return new Map<string, string | null>((data || []).map((e: any) => [String(e.id), e.url_video || null]))
}

/**
 * Lo mismo cuando los ejercicios vienen ANIDADOS dentro de las tareas, que es
 * como los pide la ficha de sesión.
 *
 * Una sola consulta para todas las tareas, y cada fila se resuelve dentro de la
 * suya. No se aplanan y se vuelven a repartir por posición: esa clase de
 * reensamblado por índice es exactamente como se corrompe un fichero cuando algo
 * no cuadra, y aquí no hace falta — el mapa de vídeos sirve para todas.
 */
export async function conVideosEnTareas(tareas: any[] | null | undefined, sb?: any): Promise<any[]> {
  const filas = tareas || []
  const todos = filas.flatMap((t: any) => t?.ejercicios || [])
  const ids = idsDeBiblioteca(todos)
  if (!ids.length) return filas

  const porId = await cargarVideos(ids, sb)
  return filas.map((t: any) => (t?.ejercicios?.length
    ? { ...t, ejercicios: conVideosResueltos(t.ejercicios, porId) }
    : t))
}
