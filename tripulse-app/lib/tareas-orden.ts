// Orden de las tareas dentro de una sesión.
//
// El campo `tarea.orden` es la fuente de verdad de la secuencia. Las dos vistas de
// tareas (Formulario y Tabla) leen con el MISMO criterio para que coincidan:
// primero por `orden`, y como desempate `id` (tareas antiguas con orden nulo caen al
// final de forma estable). La primera vez que se arrastra, se reescribe un 1..N limpio.

// Consulta ordenada, idéntica en las dos vistas. `nullsFirst: false` deja las tareas
// sin `orden` (creadas antes de este sistema) al final en vez de al principio.
export function ordenarTareasQuery(query: any) {
  return query.order('orden', { ascending: true, nullsFirst: false }).order('id', { ascending: true })
}

// Mueve un elemento de `from` a `to` en un array nuevo (no muta el original).
export function moverItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr
  const copia = arr.slice()
  const [item] = copia.splice(from, 1)
  copia.splice(to, 0, item)
  return copia
}

/**
 * La lista con `orden` = su posición (1..N). Es lo que hay que dejar en pantalla
 * después de reordenar: si la pantalla se queda con los números de antes, el
 * siguiente arrastre compara contra números que ya no son los de la base.
 */
export function renumerar<T extends { orden?: number | null }>(lista: T[]): T[] {
  return lista.map((t, i) => (t.orden === i + 1 ? t : { ...t, orden: i + 1 }))
}

/**
 * El número de orden más alto de la sesión, para colocar una tarea nueva DETRÁS
 * con `ultimoOrden(tareas) + 1`.
 *
 * No vale «cuántas hay»: si se borró una del medio (1, 2, 4), habría tres y la
 * nueva sería otra 4, empatada con la que ya existe. Las tareas viejas sin orden
 * cuentan por su sitio, que es el final.
 */
export function ultimoOrden(tareas: { orden?: number | null }[]): number {
  return tareas.reduce((max, t) => Math.max(max, t.orden ?? 0), tareas.length)
}

/* Los guardados de orden van EN FILA, uno detrás de otro. Dos arrastres
   seguidos lanzan dos tandas de escrituras; si fueran a la vez, una fila de la
   primera podría llegar después que la de la segunda y dejar la sesión con una
   mezcla de los dos órdenes. */
let cola: Promise<unknown> = Promise.resolve()

/**
 * Escribe `orden` = posición (1..N) de TODAS las tareas de la lista.
 *
 * Antes solo escribía las que «cambiaban» comparando con el `orden` que tenía la
 * pantalla, y la pantalla no se actualizaba después de guardar. Al segundo
 * arrastre comparaba contra números viejos: mover una tarea y devolverla a su
 * sitio no escribía nada y la sesión se quedaba como tras el primer movimiento.
 * Una sesión tiene pocas tareas; escribirlas todas cuesta nada y no depende de
 * lo que crea saber la pantalla.
 */
export function persistirOrden(
  supabase: any,
  tareasEnOrden: { id: number }[],
): Promise<{ ok: boolean }> {
  const filas = tareasEnOrden.map((t, i) => ({ id: t.id, orden: i + 1 }))
  const tanda = cola.then(async () => {
    const res = await Promise.all(filas.map(f => supabase.from('tarea').update({ orden: f.orden }).eq('id', f.id)))
    return { ok: res.every((r: { error?: unknown } | undefined) => !r?.error) }
  })
  cola = tanda.catch(() => null)
  return tanda.catch(() => ({ ok: false }))
}
