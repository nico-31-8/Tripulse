// ============================================================
// El «espacio» en el que trabaja un director
// ============================================================
// Un director puede entrar en el espacio de uno de sus entrenadores: a partir
// de ahí la app le carga los deportistas de ESE entrenador en vez de los suyos.
// Es el mismo truco que el atleta activo (lib/atletaActivo): se guarda en el
// navegador para sobrevivir a recargas y al menú lateral.
//
// LA PANTALLA NO DA PERMISOS. Aunque alguien escriba aquí el id de cualquier
// entrenador, la base solo le enseña los deportistas que ese entrenador le ha
// abierto (dep_ids_director en supabase/director-1-base.sql). Lo de aquí solo
// decide QUÉ LISTA se pide; QUÉ se ve lo decide la regla de la base.
//
// Avisa con un evento al cambiar, para que el menú y la franja de arriba se
// enteren sin recargar la página.

export type Espacio = { id: string; nombre: string }

const CLAVE = 'tripulse_espacio'
export const EVENTO_ESPACIO = 'tripulse:espacio'

export function getEspacio(): Espacio | null {
  if (typeof window === 'undefined') return null
  try {
    const t = localStorage.getItem(CLAVE)
    if (!t) return null
    const e = JSON.parse(t)
    return e && typeof e.id === 'string' && e.id ? { id: e.id, nombre: String(e.nombre || '') } : null
  } catch {
    return null
  }
}

export function setEspacio(e: Espacio | null) {
  if (typeof window === 'undefined') return
  try {
    if (e) localStorage.setItem(CLAVE, JSON.stringify({ id: e.id, nombre: e.nombre }))
    else localStorage.removeItem(CLAVE)
  } catch { /* sin almacenamiento el espacio dura lo que la página */ }
  window.dispatchEvent(new Event(EVENTO_ESPACIO))
}

/** El entrenador cuyos deportistas se cargan: el del espacio, si hay uno; si
 *  no, quien ha entrado. Es lo que va en `.eq('id_entrenador', …)` de las
 *  pantallas que listan «sus deportistas». */
export function entrenadorEfectivo(miId: string): string {
  return getEspacio()?.id || miId
}

/** Para las listas que se piden SIN filtrar en la base y se fían de la regla
 *  (RLS) para saber qué devolver, como la del planificador. A un director la
 *  base le da también los deportistas que otros entrenadores le han abierto, y
 *  mezclados con los suyos no se distinguen. Se quedan:
 *    · dentro de un espacio, solo los de ese entrenador;
 *    · fuera, los suyos y las fichas sin entrenador (los grupos): exactamente
 *      lo que veía cualquier entrenador antes de que existieran los directores.
 *  Las filas tienen que traer `id_entrenador`. */
export function filtrarPorEspacio<T extends { id_entrenador?: string | null }>(
  filas: T[], miId: string, idEspacio: string | null,
): T[] {
  if (idEspacio) return filas.filter(f => f.id_entrenador === idEspacio)
  return filas.filter(f => f.id_entrenador == null || f.id_entrenador === miId)
}
