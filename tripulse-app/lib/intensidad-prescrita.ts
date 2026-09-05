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
  const dist = limpio(una(tarea?.p_distancia)?.ritmo_objetivo)
  if (dist) return dist
  const dur = limpio(una(tarea?.p_duracion)?.ritmo_objetivo)
  return dur || null
}

/**
 * La fila de medición, venga como venga.
 *
 * PostgREST devuelve una LISTA o un OBJETO según cómo vea la relación, y no
 * todas las pantallas la piden igual. Con `[0]` a secas, la forma objeto daba
 * `undefined` y la tarea se quedaba sin intensidad sin que nada fallara. Es la
 * misma comprobación que ya hacía a mano `/mis-analisis`.
 */
function una(rel: any): any {
  if (!rel) return null
  return Array.isArray(rel) ? rel[0] ?? null : rel
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
 * Si lo escrito en el «@» tiene dónde guardarse. Devuelve el aviso, o null.
 *
 * La intensidad vive en `ritmo_objetivo`, y esa columna solo existe en
 * `p_distancia` y `p_duracion`. Un bloque medido en repeticiones —o al que
 * todavía no se le ha puesto unidad— no tiene dónde meterla, así que se perdía
 * al guardar: la casilla aceptaba el texto, la tarea se creaba, y la intensidad
 * no llegaba a ninguna parte. Nadie se enteraba hasta que el atleta abría la
 * sesión y no estaba.
 *
 * No se calla y no se inventa un segundo hogar para el dato (el comentario de la
 * tarea era la tentación, y eso es exactamente cómo el mismo concepto acaba en
 * dos sitios diciendo cosas distintas). Se avisa y el entrenador decide.
 */
export function intensidadSinSitio(
  tabla: string | null | undefined,
  intensidad: string | null | undefined,
): string | null {
  if (!limpio(intensidad)) return null
  if (tabla === 'p_distancia' || tabla === 'p_duracion') return null
  if (tabla === 'p_repeticiones') {
    return 'Has escrito una intensidad, pero un bloque medido en repeticiones no tiene dónde guardarla. Cámbialo a metros o a tiempo, o borra la intensidad.'
  }
  return 'Has escrito una intensidad, pero al bloque le falta la unidad. Elige metros o tiempo, o borra la intensidad.'
}

// ------------------------------------------------------------
// Cómo se TITULA lo que se le enseña
// ------------------------------------------------------------

export type Medida = 'Ritmo' | 'Pulso' | 'Potencia' | 'Esfuerzo' | 'Intensidad'

/**
 * Qué está midiendo esta intensidad, leído de lo que pone.
 *
 * EL RÓTULO LO DECIDÍA LA DISCIPLINA, Y POR ESO MENTÍA. En la pantalla de
 * ejecución, un bloque de carrera titulaba su caja «Ritmo objetivo» pasara lo
 * que pasara dentro: al atleta con «140-150 ppm» prescrito le salía
 *
 *     Ritmo objetivo
 *     140-150 ppm
 *
 * y al lado una casilla «Ritmo real» pidiéndole un ritmo cuando el objetivo era
 * el pulso. El número era correcto; el título, no. Y ahí es donde nace el fallo
 * de siempre: la pantalla afirmando una cosa distinta de la que guarda el dato.
 *
 * El campo «@» es texto libre CON LA UNIDAD DENTRO —«4:30 /km», «180–220 W»,
 * «140-150 ppm», «RPE 6–7»—, así que el propio valor sabe lo que es. Se le
 * pregunta a él.
 *
 * La disciplina se queda como último recurso: cuando el entrenador no escribió
 * nada, lo que se enseña es el cálculo de los tests, y ese sí es siempre el
 * ritmo o los vatios del deporte.
 */
export function queSeMide(valor: string | null | undefined, disciplina?: string | null): Medida {
  const v = limpio(valor)

  if (v) {
    if (/\b(ppm|bpm|lpm|puls\w*|fc\b|fcm)/i.test(v)) return 'Pulso'
    if (/\b(w|vatios|watts?)\b/i.test(v)) return 'Potencia'
    if (/\b(rpe|esfuerzo)\b/i.test(v)) return 'Esfuerzo'
    // La barra del ritmo: «/km», «/100m», «/400». Y «ritmo de 10K», que lo dice.
    if (/\/\s*\d*\s*[a-z]|ritmo/i.test(v)) return 'Ritmo'
    if (v.includes('%')) return 'Intensidad'
  }

  const d = String(disciplina || '')
  if (d === 'Ciclismo') return 'Potencia'
  if (d === 'Carrera' || d.startsWith('Nat')) return 'Ritmo'
  return 'Intensidad'
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
