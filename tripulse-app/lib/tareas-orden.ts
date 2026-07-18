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

// Persiste el nuevo orden: `orden` = posición (1..N) de cada tarea en la lista.
// Solo escribe las que cambian, para no lanzar updates de más.
export async function persistirOrden(
  supabase: any,
  tareasEnOrden: { id: number; orden?: number | null }[],
): Promise<void> {
  const cambios = tareasEnOrden
    .map((t, i) => ({ id: t.id, nuevo: i + 1, actual: t.orden }))
    .filter(c => c.actual !== c.nuevo)
  await Promise.all(cambios.map(c => supabase.from('tarea').update({ orden: c.nuevo }).eq('id', c.id)))
}
