// ============================================================
// TRIPULSE — Rehacer los chips del lienzo desde el calendario
// ============================================================
// Un chip de zona es semana + disciplina + zona. Una sesión ya programada tiene
// las tres cosas: su fecha dice la semana, su disciplina es la suya y su zona es
// la más dura de sus tareas. O sea que los chips de lo YA programado se pueden
// reconstruir enteros — no hay que adivinar nada.
//
// Existe porque el autoguardado del dibujo llegó a escribir `sesiones_zonas: []`
// encima de los buenos (ver el comentario de `borradorCargadoRef`). Eso ya no
// puede pasar, pero lo que se perdió se recupera por aquí.
//
// LO QUE NO VUELVE: los chips que el entrenador dibujó y todavía NO había bajado
// al calendario. De esos no queda rastro en ninguna tabla, y por eso la fusión
// respeta los que sigan sin programar en vez de barrerlos.
import { cargaZona } from './zonas'
import { diasEntre } from './desplazar'
import type { ChipZona } from './chips'

export interface SesionParaChip {
  id: number
  fecha_sesion: string
  disciplina?: string | null
  /** Zonas de sus tareas. La más dura es la que representa la sesión. */
  zonas?: (string | null | undefined)[]
}

/** La semana del lienzo en la que cae una fecha. Negativa = antes de empezar. */
export function semanaDe(fechaInicio: string, fecha: string): number {
  return Math.floor(diasEntre(fechaInicio, fecha) / 7)
}

/** La más dura de las zonas de una sesión, que es la que la define. */
export function zonaPicoDe(zonas: (string | null | undefined)[]): string | null {
  const limpias = zonas.filter((z): z is string => !!z)
  if (!limpias.length) return null
  return limpias.reduce((a, b) => cargaZona(b).nivel > cargaZona(a).nivel ? b : a)
}

/**
 * Un chip por sesión programada, ya marcado como hecho.
 *
 * Se saltan las sesiones sin zona (no hay chip que dibujar) y las que caen fuera
 * del lienzo: una sesión de antes de que empezara el plan no tiene semana donde
 * ponerse, y colocarla en la 0 sería mentir sobre cuándo se hizo.
 */
export function chipsDeSesiones(
  sesiones: SesionParaChip[], fechaInicio: string, totalSemanas: number,
): ChipZona[] {
  if (!fechaInicio) return []
  const out: ChipZona[] = []
  for (const s of sesiones) {
    if (!s.fecha_sesion) continue
    const semana = semanaDe(fechaInicio, s.fecha_sesion)
    if (semana < 0 || semana >= totalSemanas) continue
    const zona = zonaPicoDe(s.zonas || [])
    if (!zona) continue
    out.push({
      // El id lleva el de la sesión: así rehacerlo dos veces da el mismo chip y
      // no se duplica nada.
      id: 'ses-' + s.id,
      semana,
      disciplina: s.disciplina || '',
      zona,
      hecho: true,
    })
  }
  return out.sort((a, b) => a.semana - b.semana || a.disciplina.localeCompare(b.disciplina))
}

/**
 * Los reconstruidos, respetando lo que el entrenador aún no ha programado.
 *
 * Barrer los chips sin programar sería cambiar un agujero por otro: esos son
 * justo los que no están en ninguna otra tabla.
 */
export function fusionarChips(actuales: ChipZona[], reconstruidos: ChipZona[]): ChipZona[] {
  const sinProgramar = (actuales || []).filter(c => !c.hecho)
  return [...sinProgramar, ...reconstruidos]
}
