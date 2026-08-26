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

/* El cajon de los que no dicen de que son. Se importa de donde vive la
   metrica para que el formulario y el grafico usen la MISMA cadena: si aqui
   pusiera otra, lo que crea el atleta saldria en un monton aparte. */
export { SIN_CLASIFICAR } from './series-por-grupo'
import { SIN_CLASIFICAR } from './series-por-grupo'

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
export function queLeFalta(
  e: EjercicioNuevo,
  yaExisten: string[] = [],
  /* Al CORREGIR uno, su propio nombre no cuenta como repetido: si no, no se
     podría cambiar solo la descripción sin cambiar también el nombre. */
  nombreActual?: string | null,
): string | null {
  const nombre = limpio(e?.nombre)
  if (!nombre) return 'Ponle un nombre.'
  if (nombre.length < 3) return 'El nombre se queda corto. Con tres letras no lo vas a reconocer dentro de un mes.'

  /* Repetir un nombre que ya está rompe el histórico: el «la última vez» casa
     los ejercicios POR NOMBRE, así que dos filas distintas con el mismo nombre
     se mezclarían en una sola progresión. */
  const propio = sinTildes(nombreActual || '')
  const igual = yaExisten.some(n => sinTildes(n) === sinTildes(nombre) && sinTildes(n) !== propio)
  if (igual) return 'Ya hay un ejercicio que se llama así. Búscalo en la lista o ponle otro nombre.'

  return null
}

/** ¿Este ejercicio se lo creó él? Solo esos se pueden tocar. */
export function esMio(ej: { id_deportista?: number | null } | null | undefined, idDeportista: number | null | undefined): boolean {
  return ej?.id_deportista != null && Number(ej.id_deportista) === Number(idDeportista)
}

/** En cuántas sesiones se ha usado ya. Decide si se puede borrar. */
export async function vecesUsado(sb: any, idEjercicio: number): Promise<number> {
  const { count } = await sb.from('ejercicios')
    .select('id', { count: 'exact', head: true })
    .eq('ejercicio_id', idEjercicio)
  return count || 0
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

/**
 * Corregir uno propio.
 *
 * SI CAMBIA EL NOMBRE, TAMBIÉN CAMBIA EN EL HISTÓRICO.
 * `ejercicios.nombre` es una COPIA que se hizo al apuntar la sesión, y el «la
 * última vez» casa por ese nombre, no por el id. Cambiar solo la biblioteca
 * partiría la progresión en dos: lo de antes bajo el nombre viejo y lo de ahora
 * bajo el nuevo, sin que nada lo dijera. Se arrastra el cambio.
 */
export async function editarEjercicioPropio(
  sb: any,
  idEjercicio: number,
  e: EjercicioNuevo,
  yaExisten: string[] = [],
  nombreActual?: string | null,
): Promise<ResultadoAlta> {
  const falta = queLeFalta(e, yaExisten, nombreActual)
  if (falta) return { ejercicio: null, error: falta }

  const fila = filaDe(e, 0)
  delete (fila as any).id_deportista   // el dueño no se toca al corregir

  const { data, error } = await sb.from('ejercicios_biblioteca')
    .update(fila).eq('id', idEjercicio)
    .select('id, nombre, grupo_muscular, descripcion, url_video, id_deportista')
    .single()

  if (error || !data) return { ejercicio: null, error: error?.message || 'No se pudo guardar el cambio.' }

  const nuevo = limpio(e.nombre)
  if (nombreActual && nuevo !== nombreActual) {
    const { error: eH } = await sb.from('ejercicios')
      .update({ nombre: nuevo, grupo_muscular: fila.grupo_muscular })
      .eq('ejercicio_id', idEjercicio)
    /* Si el histórico no se deja renombrar, el ejercicio YA se cambió. Se avisa
       en vez de callarlo: a partir de ahora la progresión saldrá partida. */
    if (eH) {
      return {
        ejercicio: data,
        error: 'Se cambió el ejercicio, pero no las sesiones anteriores: seguirán con el nombre viejo y su progresión saldrá aparte.',
      }
    }
  }

  return { ejercicio: data, error: null }
}

/**
 * Borrar uno propio, SOLO si no se ha usado nunca.
 *
 * Si se ha usado, no se borra y punto. El repo no define qué le pasa a
 * `ejercicios.ejercicio_id` cuando desaparece la fila de la biblioteca, y una
 * clave ajena en cascada se llevaría por delante el histórico de fuerza del
 * atleta. No se averigua eso probando en la base de alguien.
 */
export async function borrarEjercicioPropio(
  sb: any,
  idEjercicio: number,
): Promise<{ borrado: boolean; error: string | null }> {
  const usos = await vecesUsado(sb, idEjercicio)
  if (usos > 0) {
    return {
      borrado: false,
      error: 'No se puede borrar: ya lo has usado en ' + usos + (usos === 1 ? ' sesión' : ' sesiones') +
        '. Si te equivocaste con el nombre, corrígelo y el cambio llega también a lo que ya apuntaste.',
    }
  }

  const { error } = await sb.from('ejercicios_biblioteca').delete().eq('id', idEjercicio)
  return { borrado: !error, error: error?.message || null }
}
