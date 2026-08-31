// ============================================================
// Qué intensidad se le enseña al deportista
// ============================================================
//
// En el editor de la sesión hay un campo «@» donde el entrenador escribe la
// intensidad de un bloque: «4:30 /km», «95–105% VAM», «180–220 W», lo que
// decida. En gris, de fantasma, sale lo que la app calcularía a partir de sus
// tests. Escribir encima manda.
//
// DOS COSAS QUE NO ERAN LO MISMO Y SE GUARDABAN EN EL MISMO SITIO
// Hasta ahora, con el campo vacío se guardaba la sugerencia calculada:
//
//     const _intensidad = f.intensidadPersonalizada.trim() || _ref?.ritmo || null
//
// Así que la columna acababa conteniendo o lo que escribió el entrenador o lo
// que dedujo la app, sin forma de saber cuál. Al leerla había que adivinarlo
// comparándola otra vez con el cálculo, y si coincidían se borraba la casilla,
// de modo que prescribir a propósito el mismo valor que proponía la app era
// imposible: al recargar desaparecía.
//
// Ahora se guarda SOLO lo que el entrenador escribe. Lo calculado se calcula
// cuando hace falta, que para eso es calculado. Con eso se puede enseñar una
// cosa encima de la otra sin que se pisen.

export interface QueEnsenar {
  /** Lo que manda: la prescripción. */
  principal: string | null
  /** Lo que calcula la app a partir de sus tests, si aporta algo distinto. */
  gris: string | null
}

const limpio = (s: string | null | undefined): string => String(s ?? '').trim()

/**
 * La intensidad que el entrenador escribió, venga del bloque que venga.
 *
 * Un bloque por metros guarda en `p_distancia` y uno por tiempo en
 * `p_duracion`. Se miran las dos porque una tarea es una u otra, nunca las dos,
 * y quien lee no tiene por qué saber cuál le tocó.
 */
export function intensidadGuardada(tarea: any): string | null {
  const dist = limpio(tarea?.p_distancia?.[0]?.ritmo_objetivo)
  if (dist) return dist
  const dur = limpio(tarea?.p_duracion?.[0]?.ritmo_objetivo)
  return dur || null
}

/**
 * Qué se pinta: la prescripción arriba y el cálculo en gris debajo.
 *
 * Las tres reglas, y todas son para no decir dos veces lo mismo:
 *
 *   · Sin nada escrito, lo calculado ES la prescripción y sube a principal. No
 *     tiene sentido enseñarlo en gris como si fuera una nota al pie de nada.
 *   · Si coinciden, el gris sobra.
 *   · Con algo escrito y ningún test hecho, no hay gris que enseñar.
 */
export function queEnsenar(guardada: string | null | undefined, calculada: string | null | undefined): QueEnsenar {
  const g = limpio(guardada)
  const c = limpio(calculada)

  if (!g) return { principal: c || null, gris: null }
  if (!c || g === c) return { principal: g, gris: null }
  return { principal: g, gris: c }
}

/** Lo que se guarda en la base: solo lo que se escribió, nunca lo calculado. */
export function aGuardar(escrito: string | null | undefined): string | null {
  return limpio(escrito) || null
}

/**
 * Las intensidades prescritas de varias sesiones, para pintarlas en una lista.
 *
 * Va aparte de `estimarDuraciones` —que ya trae estas mismas tablas— porque a
 * esa la llaman nueve pantallas y cambiarle lo que devuelve para esto sería
 * mover nueve sitios por una línea de texto en uno.
 *
 * `select('*')` y no la lista de columnas: `p_duracion.ritmo_objetivo` la añade
 * supabase/intensidad-en-bloques-por-tiempo.sql, y hasta que se corra en una
 * base, nombrarla tumbaría la consulta ENTERA y la lista se quedaría sin
 * ninguna intensidad sin que nada avisara. Es el mismo tropiezo que con
 * `competicion.prioridad`.
 */
export async function intensidadesPorSesion(
  supabase: any,
  sesionIds: number[],
): Promise<Record<number, string[]>> {
  const out: Record<number, string[]> = {}
  if (!sesionIds.length) return out

  const { data: tareas } = await supabase.from('tarea')
    .select('id, id_sesion, orden').in('id_sesion', sesionIds).order('orden')
  const ids = (tareas || []).map((t: any) => t.id)
  if (!ids.length) return out

  const [dist, dur] = await Promise.all([
    supabase.from('p_distancia').select('*').in('id_tarea', ids),
    supabase.from('p_duracion').select('*').in('id_tarea', ids),
  ])

  const porTarea: Record<number, string> = {}
  for (const fila of [...(dist.data || []), ...(dur.data || [])]) {
    const v = limpio(fila?.ritmo_objetivo)
    if (v) porTarea[fila.id_tarea] = v
  }

  for (const t of tareas || []) {
    const v = porTarea[t.id]
    if (v) (out[t.id_sesion] ||= []).push(v)
  }
  return out
}
