// ============================================================
// TRIPULSE — La medición de una tarea, con su intensidad dentro
// ============================================================
// La intensidad («4:30 /km», «140-150 ppm») iba en un SEGUNDO paso: primero se
// insertaba la distancia o el tiempo y luego, en otra espera, se le ponía el
// ritmo. No era un descuido. La columna fue `numeric` y se le metía texto, y
// luego la de `p_duracion` llegó con una migración que podía no estar corrida:
// dentro del insert, cualquiera de las dos cosas tumbaba la fila entera y la
// tarea se quedaba SIN DISTANCIA NI TIEMPO, en silencio, por no poder guardar
// lo accesorio.
//
// Ahora va en la MISMA escritura, y la garantía es la misma: si con la
// intensidad falla —por lo que sea—, se repite sin ella. Lo peor que pasa es
// que no haya intensidad, igual que antes; y en el caso normal es una espera
// menos por cada tarea que se guarda.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type TablaConIntensidad = 'p_distancia' | 'p_duracion'

/** Inserta la fila con su `ritmo_objetivo`. Devuelve el error, o null. */
export async function insertarMedicion(
  sb: any, tabla: TablaConIntensidad, fila: Record<string, unknown>, intensidad: string | null | undefined,
): Promise<{ message: string } | null> {
  if (!intensidad) return (await sb.from(tabla).insert(fila))?.error ?? null
  const r = await sb.from(tabla).insert({ ...fila, ritmo_objetivo: intensidad })
  if (!r?.error) return null
  // No se avisa al entrenador: si la fila entra, la tarea está guardada y esto
  // no lo puede arreglar él. Pero tampoco se calla.
  console.warn('[tripulse] ritmo_objetivo no se guardó en ' + tabla + ':', r.error.message)
  return (await sb.from(tabla).insert(fila))?.error ?? null
}
