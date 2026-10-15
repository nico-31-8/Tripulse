// ============================================================
// TRIPULSE — Quitar un deportista
// ============================================================
// Lo decidió el usuario el 15-10-2026: CON cuenta propia se DESVINCULA (sus
// datos son suyos, no del entrenador: sale de su lista y de su cupo y conserva
// su cuenta, su plan y su historial) y SIN cuenta —una ficha que creó el
// entrenador— se BORRA con todo, escribiendo su nombre.
//
// Lo hace la función de la base `quitar_deportista`
// (supabase/quitar-deportista.sql), entera o nada, y es la que manda: ella
// decide qué se hace según tenga cuenta, y ella comprueba el nombre. Aquí solo
// se elige qué se le dice a quien pulsa, y se la llama.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ModoQuitar = 'desvincular' | 'borrar'

/** Con cuenta propia se desvincula; sin ella, la ficha es del entrenador y se borra. */
export function modoDeQuitar(dep: { id_usuario?: string | null } | null | undefined): ModoQuitar {
  return dep?.id_usuario ? 'desvincular' : 'borrar'
}

/** Lo mismo que compara la base: sin espacios alrededor y sin mirar mayúsculas. */
export function nombreCoincide(escrito: string | null | undefined, nombre: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()
  return n(escrito) !== '' && n(escrito) === n(nombre)
}

/**
 * Quita al deportista. Devuelve lo que se ha hecho de verdad —que lo decide la
 * base, no quien llama— o el error con palabras de entrenador.
 */
export async function quitarDeportista(
  sb: any, id: number, nombre?: string | null,
): Promise<{ hecho: ModoQuitar | null; error: string | null }> {
  const { data, error } = await sb.rpc('quitar_deportista', { _id: id, _nombre: nombre ?? null })
  if (error) {
    const m = String(error.message || '')
    if (error.code === 'PGRST202' || /could not find the function/i.test(m)) {
      return { hecho: null, error: 'Falta aplicar supabase/quitar-deportista.sql en la base de datos.' }
    }
    return { hecho: null, error: m || 'No se ha podido.' }
  }
  return { hecho: data === 'borrado' ? 'borrar' : 'desvincular', error: null }
}
