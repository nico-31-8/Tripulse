// ============================================================
// Encontrar un ejercicio sin tener que acertar su grupo
// ============================================================
//
// Para prescribir había que elegir primero el GRUPO y después el ejercicio. El
// problema es que el grupo hay que adivinarlo, y la biblioteca no ayuda:
// «Sentadilla» vive en tres grupos distintos —Cuádriceps, Cadera y aductores y
// Ciclismo — específico— y el «Paseo del granjero» está en Core y estabilidad.
// Si no acertabas el cajón, el segundo desplegable no te lo enseñaba nunca.
//
// LO QUE NO SE TOCA: el camino rápido. Con el grupo elegido y sin escribir
// nada sale la lista de ese grupo, igual que el desplegable de siempre. El
// usuario lo dijo claro al rechazar la primera propuesta: con el desplegable
// VE lo que tiene, y para lo de siempre dos clics son más rápidos que escribir.
//
// LO QUE SE AÑADE: al escribir se busca, y si hay un grupo elegido, lo que cae
// fuera de él no se esconde — se enseña aparte, bajo «también en otros grupos».
// Esa es la salida que antes no existía.

export interface EjercicioBuscable {
  id: number | string
  nombre?: string | null
  grupo_muscular?: string | null
  descripcion?: string | null
}

export interface Encontrados<T> {
  /** Los del grupo elegido (o todos los que casan, si no hay grupo). */
  enGrupo: T[]
  /** Los que casan pero están en OTRO grupo. Vacío si no hay grupo elegido. */
  enOtros: T[]
}

/** Sin tildes, sin mayúsculas y sin espacios de sobra. */
export const normalizar = (s: string | null | undefined): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/**
 * Cuánto encaja un ejercicio con lo escrito. Más alto, más arriba.
 *
 * El orden importa más de lo que parece: escribiendo «sentadilla» hay diez
 * resultados, y el que se llama exactamente así tiene que salir el primero, no
 * el noveno por orden alfabético.
 */
function puntos(e: EjercicioBuscable, t: string): number {
  if (!t) return 0
  const n = normalizar(e.nombre)
  if (n === t) return 4
  if (n.startsWith(t)) return 3
  if (n.includes(t)) return 2
  /* En la descripción también, como la lupa: «lordosis» encuentra el psoas.
     Pero por debajo de cualquier coincidencia en el nombre. */
  if (normalizar(e.descripcion).includes(t)) return 1
  return 0
}

const porNombre = (a: EjercicioBuscable, b: EjercicioBuscable) =>
  (a.nombre || '').localeCompare(b.nombre || '', 'es')

/**
 * Los ejercicios que tiene sentido enseñar, repartidos en dos.
 *
 * Sin grupo y sin texto no devuelve nada a propósito: enseñar los 238 de golpe
 * no es ayudar, y para eso está la lupa.
 */
export function buscarEjercicios<T extends EjercicioBuscable>(
  ejercicios: T[],
  { grupo, texto, tope = 8 }: { grupo?: string | null; texto?: string | null; tope?: number },
): Encontrados<T> {
  const lista = ejercicios || []
  const g = (grupo || '').trim()
  const t = normalizar(texto)

  if (!t) {
    if (!g) return { enGrupo: [], enOtros: [] }
    /* El camino de siempre: todos los del grupo, por orden alfabético y sin
       recortar. Es una lista para mirar, no un resultado de búsqueda. */
    return { enGrupo: lista.filter(e => e.grupo_muscular === g).sort(porNombre), enOtros: [] }
  }

  const casan = lista
    .map(e => ({ e, p: puntos(e, t) }))
    .filter(x => x.p > 0)
    .sort((a, b) => b.p - a.p || porNombre(a.e, b.e))
    .map(x => x.e)

  if (!g) return { enGrupo: casan.slice(0, tope), enOtros: [] }
  return {
    enGrupo: casan.filter(e => e.grupo_muscular === g).slice(0, tope),
    enOtros: casan.filter(e => e.grupo_muscular !== g).slice(0, tope),
  }
}

/** El ejercicio elegido, buscado por id. El id puede venir como texto del <select>. */
export function ejercicioDe<T extends EjercicioBuscable>(ejercicios: T[], id: string | number | null | undefined): T | null {
  if (id === null || id === undefined || id === '') return null
  return (ejercicios || []).find(e => String(e.id) === String(id)) || null
}
