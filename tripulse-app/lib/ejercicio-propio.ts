// ============================================================
// TRIPULSE — El deportista se crea sus propios ejercicios
// ============================================================
//
// La biblioteca la escribía solo el entrenador. Si el atleta hace algo que no
// está en el catálogo —una máquina rara de su gimnasio, un ejercicio que le dio
// el fisio— no tenía dónde apuntarlo, así que o elegía otro parecido (y el
// histórico mentía) o no lo apuntaba.
//
// EL GRUPO MUSCULAR NO ES DECORACIÓN
// Es el único campo de este formulario que sale en una pantalla del entrenador:
// el reparto de series por grupo de la semana lo agrupa por esta cadena exacta,
// y lo que no la trae cae en «Sin clasificar». Por eso se ofrecen los grupos que
// ya existen en la biblioteca en vez de un campo de texto libre: «Glúteos» y
// «Gluteo» serían dos barras distintas de lo mismo.

export interface EjercicioNuevo {
  nombre: string
  descripcion: string
  grupoMuscular: string
  /** Fuerza | Movilidad | Tecnica | Rehab. Va a la columna `tipo`, que es text[]. */
  tipo: string
}

export const EJERCICIO_NUEVO_VACIO: EjercicioNuevo = {
  nombre: '', descripcion: '', grupoMuscular: '', tipo: 'Fuerza',
}

export const TIPOS_EJERCICIO = ['Fuerza', 'Movilidad', 'Tecnica', 'Rehab']

/** El grupo que se guarda cuando no se dice ninguno. */
export const SIN_CLASIFICAR = 'Sin clasificar'

const limpio = (s: string | null | undefined) => (s || '').trim()

/**
 * Los grupos musculares que YA existen, para ofrecerlos en vez de texto libre.
 *
 * Ordenados alfabéticamente y sin repetir. Se sacan de la biblioteca que ya
 * tiene cargada quien llama, así que no cuesta una consulta.
 */
export function gruposExistentes(ejercicios: { grupo_muscular?: string | null }[]): string[] {
  const vistos = new Set<string>()
  for (const e of ejercicios || []) {
    const g = limpio(e?.grupo_muscular)
    if (g) vistos.add(g)
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * ¿Se puede guardar esto? Devuelve el motivo, o null si está bien.
 *
 * El nombre es lo único imprescindible: sin él la fila no se puede ni enseñar
 * en una lista. El resto se puede rellenar después.
 */
export function queLeFalta(e: EjercicioNuevo, yaExisten: string[] = []): string | null {
  const nombre = limpio(e?.nombre)
  if (!nombre) return 'Ponle un nombre.'
  if (nombre.length < 3) return 'El nombre se queda corto. Con tres letras no lo vas a reconocer dentro de un mes.'

  /* Repetir un nombre que ya está rompe el histórico: el «la última vez» casa
     los ejercicios POR NOMBRE, así que dos filas distintas con el mismo nombre
     se mezclarían en una sola progresión. */
  const igual = yaExisten.some(n => sinTildes(n) === sinTildes(nombre))
  if (igual) return 'Ya hay un ejercicio que se llama así. Búscalo en la lista o ponle otro nombre.'

  return null
}

export const sinTildes = (s: string) =>
  (s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** La fila tal y como va a la base. */
export function filaDe(e: EjercicioNuevo, idDeportista: number) {
  const tipo = limpio(e.tipo)
  return {
    nombre: limpio(e.nombre),
    descripcion: limpio(e.descripcion) || null,
    grupo_muscular: limpio(e.grupoMuscular) || SIN_CLASIFICAR,
    /* `tipo` es text[] en la base, no texto. Mandarlo como cadena suelta lo
       rechaza Postgres. */
    tipo: tipo ? [tipo] : [],
    id_deportista: idDeportista,
  }
}

export interface ResultadoAlta {
  ejercicio: any | null
  error: string | null
}

export async function crearEjercicioPropio(
  sb: any,
  e: EjercicioNuevo,
  idDeportista: number,
  yaExisten: string[] = [],
): Promise<ResultadoAlta> {
  const falta = queLeFalta(e, yaExisten)
  if (falta) return { ejercicio: null, error: falta }

  const { data, error } = await sb.from('ejercicios_biblioteca')
    .insert(filaDe(e, idDeportista))
    .select('id, nombre, grupo_muscular, descripcion, url_video')
    .single()

  if (error || !data) {
    /* El caso que se va a dar de verdad si falta correr el SQL: la política no
       le deja escribir, o la columna no existe. Decirlo con el mensaje crudo de
       Postgres no ayuda a nadie. */
    const crudo = error?.message || ''
    if (/row-level security|policy/i.test(crudo)) {
      return { ejercicio: null, error: 'La base no te deja crear ejercicios todavía. Avisa a tu entrenador.' }
    }
    if (/id_deportista/i.test(crudo)) {
      return { ejercicio: null, error: 'Falta preparar la base para esto. Avisa a tu entrenador.' }
    }
    return { ejercicio: null, error: crudo || 'No se pudo crear el ejercicio.' }
  }

  return { ejercicio: data, error: null }
}
