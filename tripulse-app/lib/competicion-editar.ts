// ============================================================
// Corregir una competición
// ============================================================
// Una competición NO SE PODÍA EDITAR en ninguna pantalla. En el lienzo se crea
// y se borra; en el calendario se crea, se le cambia la importancia y se borra.
// Si te equivocabas en el nombre o en la fecha, el único camino era borrarla y
// volver a crearla — y con ella se iban la prueba y las notas.
//
// Y esas dos se escriben SOLO al crearla desde el calendario, así que hasta
// ahora no había forma de verlas ni de cambiarlas después. El «Bajar de 31'»
// de una carrera llevaba meses guardado sin salir en ninguna pantalla.

import { fechaValida } from './fechas'

export interface FormCompeticion {
  nombre: string
  fecha: string
  tipo?: string
  notas?: string
  prioridad?: string
}

/** El motivo por el que no se puede guardar, o null si está bien. */
export function queLeFaltaComp(f: FormCompeticion | null | undefined): string | null {
  const nombre = (f?.nombre || '').trim()
  if (!nombre) return 'Ponle un nombre a la carrera.'
  if (!fechaValida(f?.fecha)) return 'Ponle una fecha.'
  return null
}

/**
 * Lo que se manda a la base.
 *
 * La prueba y las notas vacías van como `null`, no como cadena vacía: así una
 * carrera a la que le quitas la nota queda igual que una que nunca la tuvo, y
 * las pantallas que preguntan `if (notas)` no tienen que saber de las dos
 * formas de estar vacío.
 */
export function cambiosDeComp(f: FormCompeticion) {
  return {
    nombre: f.nombre.trim(),
    fecha: f.fecha,
    tipo: (f.tipo || '').trim() || null,
    notas: (f.notas || '').trim() || null,
    prioridad: f.prioridad || 'B',
  }
}
