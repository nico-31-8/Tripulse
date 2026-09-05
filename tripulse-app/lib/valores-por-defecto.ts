// ============================================================
// TRIPULSE — Con qué nace cada fila nueva de tareas
// ============================================================
//
// EL PROBLEMA. Una sesión de seis bloques de carrera en metros es elegir seis
// veces la misma unidad, la misma disciplina y el mismo descanso. Y la unidad
// nace SIEMPRE en «und.»: hay que ponerla bloque a bloque o el volumen no se
// guarda.
//
// LA FRANJA. Encima de las filas se fija una vez con qué nacen las siguientes.
// Cuatro reglas, y las cuatro importan:
//
//   1. VIVEN EN ESA SESIÓN. Se guardan con ella; otra sesión empieza con los
//      suyos.
//   2. SOLO HACIA ADELANTE. Cambiar un valor no toca ninguna fila ya puesta,
//      ni guardada ni a medio escribir. Pisar lo escrito para «ponerlo al día»
//      sería peor que no tener franja.
//   3. NUNCA ES UN CANDADO. Cada fila se sigue editando a mano.
//   4. LO QUE NO SE FIJA SALE COMO HASTA AHORA. La franja no quita ni un
//      control de la fila: adelanta trabajo, no obliga a nada.
//
// TODO EN UNA COLUMNA (`sesion.valores_por_defecto`, jsonb) y no en diez.
// Diez columnas serían diez migraciones y otra más cada vez que se quiera
// predeterminar algo nuevo; y ninguna de ellas la lee nadie más que esta
// pantalla, que es justo el caso en que una columna por campo no aporta nada.
//
// LA ZONA NO ESTÁ AQUÍ DEL TODO, Y ES A PROPÓSITO. `sesion.zona_fuerza` y
// `sesion.zona_resistencia` ya existen y NO son valores por defecto: son datos
// de la sesión que leen el mesociclo, el calendario y la vista de semana —en
// fuerza simple, la zona de la sesión ES esa columna, sin tarea que la lleve—.
// Guardar aquí otra zona sería el mismo concepto en dos sitios, que es el fallo
// que este proyecto lleva persiguiendo. Así que la de aquí es RESPALDO: solo se
// mira cuando la sesión no tiene la suya, que es el caso «compleja», donde hoy
// cada fila nace sin zona.

export interface DefectoResistencia {
  zona?: string
  disciplina?: string
  unidad?: string
  series?: string
  descanso?: string
  /** El «@»: «140-150 ppm», «4:30 /km». Ver lib/intensidad-prescrita. */
  intensidad?: string
}

export interface DefectoFuerza {
  zona?: string
  grupoMuscular?: string
  tipoSerie?: string
  medida?: string
  control?: string
  /** El número del control: el «2» de «RIR 2». `control` dice de qué escala es. */
  controlValor?: string
  series?: string
  descanso?: string
}

export interface ValoresPorDefecto {
  resistencia: DefectoResistencia
  fuerza: DefectoFuerza
}

export const SIN_FIJAR: ValoresPorDefecto = { resistencia: {}, fuerza: {} }

/** Las claves que se admiten. Lo que venga fuera de aquí se ignora. */
export const CAMPOS_RESISTENCIA: (keyof DefectoResistencia)[] =
  ['zona', 'disciplina', 'unidad', 'series', 'descanso', 'intensidad']
export const CAMPOS_FUERZA: (keyof DefectoFuerza)[] =
  ['zona', 'grupoMuscular', 'tipoSerie', 'medida', 'control', 'controlValor', 'series', 'descanso']

const limpio = (v: unknown): string => String(v ?? '').trim()

function soloLosCampos<T extends object>(bruto: any, claves: (keyof T)[]): T {
  const out: any = {}
  if (bruto && typeof bruto === 'object') {
    for (const k of claves) {
      const v = limpio(bruto[k])
      if (v) out[k] = v
    }
  }
  return out as T
}

/**
 * Lee lo guardado, venga como venga.
 *
 * La columna es `jsonb`, así que normalmente llega ya como objeto; pero un
 * cliente que la pida como texto la devuelve en cadena, y una sesión anterior a
 * la columna la devuelve `null`. Ninguna de las tres puede romper el editor: si
 * no se entiende lo guardado, se empieza sin nada fijado, que es exactamente el
 * comportamiento de siempre.
 *
 * Solo se quedan los valores NO vacíos: una clave con cadena vacía es «sin
 * fijar», y distinguirla de la ausencia solo daría dos formas de decir lo mismo.
 */
export function leer(bruto: unknown): ValoresPorDefecto {
  let dato: any = bruto
  if (typeof dato === 'string') {
    try { dato = JSON.parse(dato) } catch { return { resistencia: {}, fuerza: {} } }
  }
  if (!dato || typeof dato !== 'object') return { resistencia: {}, fuerza: {} }
  return {
    resistencia: soloLosCampos<DefectoResistencia>(dato.resistencia, CAMPOS_RESISTENCIA),
    fuerza: soloLosCampos<DefectoFuerza>(dato.fuerza, CAMPOS_FUERZA),
  }
}

/** Si hay algo fijado, para saber si la franja tiene algo que enseñar. */
export function hayAlguno(v: ValoresPorDefecto | null | undefined): boolean {
  if (!v) return false
  return Object.keys(v.resistencia || {}).length > 0 || Object.keys(v.fuerza || {}).length > 0
}

export function cuantosFijados(uno: DefectoResistencia | DefectoFuerza | null | undefined): number {
  return Object.values(uno || {}).filter(x => limpio(x)).length
}

/**
 * Fija (o desfija) un campo. Devuelve un objeto nuevo, sin tocar el de entrada.
 *
 * Un valor vacío BORRA la clave en vez de guardarla vacía: «sin fijar» es la
 * ausencia, no una cadena en blanco. Si no, al leer habría que distinguir dos
 * formas de decir lo mismo y una de las dos acabaría comportándose distinto.
 */
export function fijar(
  v: ValoresPorDefecto,
  tabla: 'resistencia' | 'fuerza',
  campo: string,
  valor: string | null | undefined,
): ValoresPorDefecto {
  const nuevo: ValoresPorDefecto = {
    resistencia: { ...(v?.resistencia || {}) },
    fuerza: { ...(v?.fuerza || {}) },
  }
  const rama: any = nuevo[tabla]
  const val = limpio(valor)
  if (val) rama[campo] = val
  else delete rama[campo]
  return nuevo
}

/** Lo que se manda a la base. `null` cuando no queda nada fijado. */
export function paraGuardar(v: ValoresPorDefecto): ValoresPorDefecto | null {
  return hayAlguno(v) ? { resistencia: v.resistencia, fuerza: v.fuerza } : null
}

export interface ContextoSesion {
  /** La zona que ya lleva la sesión (`zona_resistencia` / `zona_fuerza`). Manda. */
  zonaSesion?: string | null
  /** La disciplina de la sesión. En un brick no vale: cada bloque tiene la suya. */
  disciplinaSesion?: string | null
}

/**
 * Los campos con los que nace una fila de resistencia.
 *
 * Devuelve SOLO lo que está fijado. Lo que no, ni se menciona, para que la fila
 * conserve lo que ya hacía —la zona de la sesión, su disciplina— en vez de que
 * un valor vacío lo pise. Esa es la regla 4, y en código es la diferencia entre
 * `{}` y `{ zona: '' }`.
 *
 * LA ZONA DE LA SESIÓN GANA. La de la franja es el respaldo para las sesiones
 * «complejas», que son las que no tienen zona propia.
 */
export function paraFilaResistencia(
  v: ValoresPorDefecto | null | undefined,
  ctx: ContextoSesion = {},
): Record<string, string> {
  const d = v?.resistencia || {}
  const out: Record<string, string> = {}

  const zona = limpio(ctx.zonaSesion) || limpio(d.zona)
  if (zona) out.zona = zona

  // En un brick, la disciplina de la sesión NO es un deporte: ahí la franja es
  // la única forma de no elegirlo bloque a bloque (ver lib/atribucion).
  const disc = limpio(ctx.disciplinaSesion) === 'Brick'
    ? limpio(d.disciplina)
    : (limpio(ctx.disciplinaSesion) || limpio(d.disciplina))
  if (disc) out.disciplina = disc

  if (limpio(d.unidad)) out.tipoMedicion = limpio(d.unidad)
  if (limpio(d.series)) out.series = limpio(d.series)
  if (limpio(d.descanso)) out.descanso = limpio(d.descanso)
  /* La intensidad SÍ se predetermina, aunque parezca lo que más cambia de un
     bloque a otro: en una sesión de una sola zona —que son la mayoría— los seis
     bloques van a la misma, y escribirla seis veces es justo el trabajo que
     esta franja existe para quitar.
     No es el fantasma que se quitó el 30/08: aquello guardaba lo que CALCULABA
     la app con la casilla vacía; esto es lo que el entrenador escribe, una vez
     en lugar de seis. */
  if (limpio(d.intensidad)) out.intensidadPersonalizada = limpio(d.intensidad)
  return out
}

/** Lo mismo para una fila de fuerza. Misma regla con la zona. */
export function paraFilaFuerza(
  v: ValoresPorDefecto | null | undefined,
  ctx: ContextoSesion = {},
): Record<string, string> {
  const d = v?.fuerza || {}
  const out: Record<string, string> = {}

  const zona = limpio(ctx.zonaSesion) || limpio(d.zona)
  if (zona) out.zonaFuerzaTarea = zona

  if (limpio(d.grupoMuscular)) out.grupoMuscularSel = limpio(d.grupoMuscular)
  if (limpio(d.tipoSerie)) out.tipoSerie = limpio(d.tipoSerie)
  if (limpio(d.medida)) out.medida = limpio(d.medida)
  if (limpio(d.control)) out.controlTipo = limpio(d.control)
  // El equivalente de la intensidad en fuerza: el número del control. Una
  // sesión entera a RIR 2 es de lo más corriente.
  if (limpio(d.controlValor)) out.rir = limpio(d.controlValor)
  if (limpio(d.series)) out.series = limpio(d.series)
  if (limpio(d.descanso)) out.descanso = limpio(d.descanso)
  return out
}

/**
 * Guarda la franja en la sesión.
 *
 * NO REVIENTA SI LA COLUMNA NO ESTÁ. Hasta que se corra
 * supabase/valores-por-defecto.sql en una base, esta escritura falla; y perder
 * la franja es molesto, pero perder el editor de sesión por la franja sería
 * absurdo. Se avisa por consola y se sigue: las filas nacen como siempre.
 */
export async function guardar(
  sb: any,
  idSesion: number,
  v: ValoresPorDefecto,
): Promise<string | null> {
  const { error } = await sb.from('sesion')
    .update({ valores_por_defecto: paraGuardar(v) }).eq('id', idSesion)
  if (!error) return null
  console.warn('[tripulse] valores_por_defecto no se guardó (¿falta la columna?):', error.message)
  return error.message || 'No se pudo guardar'
}
