// Plantillas de sesión PROPIAS del entrenador (tabla plantilla_sesion).
//
// Las del sistema están en lib/plantillas.ts (código, sacadas de la base de
// Obsidian). Estas nacen de una sesión que el entrenador ya ha montado: por eso
// tienen un único volumen y no 3 niveles.
//
// Requiere supabase/plantilla-sesion.sql.
import { cargaZona } from './zonas'
import type { BloqueP } from './plantillas'

export interface PlantillaPropia {
  id: number
  nombre: string
  disciplina: string
  zona: string
  objetivo: string | null
  bloques: BloqueP[]
  created_at?: string
}

export const ERROR_MIGRACION_PLANTILLAS =
  'Falta la tabla plantilla_sesion: ejecuta supabase/plantilla-sesion.sql en el SQL Editor de Supabase.'

function faltaTabla(e: any): boolean {
  const t = ((e?.message || '') + (e?.code || '')).toLowerCase()
  return t.includes('plantilla_sesion') || t.includes('pgrst205') || t.includes('42p01')
}

export async function cargarPropias(supabase: any, disciplina: string): Promise<PlantillaPropia[]> {
  const { data, error } = await supabase.from('plantilla_sesion')
    .select('id, nombre, disciplina, zona, objetivo, bloques, created_at')
    .eq('disciplina', disciplina)
    .order('created_at', { ascending: false })
  if (error) return []   // sin migración o sin permisos: el panel sigue funcionando con las del sistema
  return data || []
}

// Convierte las tareas de una sesión en los bloques de una plantilla.
// Se queda solo con lo que define el ENTRENAMIENTO (zona, series, volumen, descanso)
// y tira todo lo demás: nada de RPE reportado, fechas ni datos del atleta — una
// plantilla es un molde, no una copia de esa sesión concreta.
export function bloquesDesdeTareas(tareas: any[]): BloqueP[] {
  return tareas
    .slice()
    .sort((a, b) => (a.orden || 0) - (b.orden || 0))
    .map(t => {
      const metros = t.p_distancia?.[0]?.metros_planeados ?? null
      const segundos = t.p_duracion?.[0]?.tiempo_planeado ?? null
      const b: BloqueP = { zona: t.zona_entrenamiento }
      if (t.series && t.series > 1) b.series = t.series
      if (metros) b.metros = metros
      else if (segundos) b.segundos = segundos
      if (t.descanso_segundos) b.descansoSeg = t.descanso_segundos
      return b
    })
    .filter(b => b.zona && (b.metros || b.segundos))
}

// La zona pico: la más dura de la sesión. Es la que representa la plantilla.
//
// OJO: cargaZona() comprime las 9 zonas en 7 niveles (AER y AEL empatan; PLA y
// CALA también), así que en un empate gana la primera. Es lo mismo que hace el
// resto de la app (/volumen, sicat-zonas), así que aquí se mantiene el criterio
// por coherencia.
export function zonaPico(bloques: BloqueP[]): string {
  if (!bloques.length) return 'AEL'
  return bloques.reduce((mejor, b) =>
    cargaZona(b.zona).nivel > cargaZona(mejor).nivel ? b.zona : mejor, bloques[0].zona)
}

export async function guardarPropia(
  supabase: any,
  p: { nombre: string; disciplina: string; objetivo?: string | null; bloques: BloqueP[] },
): Promise<string | null> {
  const { data: sesion } = await supabase.auth.getUser()
  const uid = sesion?.user?.id
  if (!uid) return 'No se ha podido identificar al entrenador. Vuelve a iniciar sesión.'
  if (!p.bloques.length) return 'La sesión no tiene bloques con zona y volumen que guardar.'

  const { error } = await supabase.from('plantilla_sesion').insert({
    id_entrenador: uid,
    nombre: p.nombre,
    disciplina: p.disciplina,
    zona: zonaPico(p.bloques),
    objetivo: p.objetivo || null,
    bloques: p.bloques,
  })
  if (error) return faltaTabla(error) ? ERROR_MIGRACION_PLANTILLAS : error.message
  return null
}

export async function borrarPropia(supabase: any, id: number): Promise<string | null> {
  const { error } = await supabase.from('plantilla_sesion').delete().eq('id', id)
  return error ? error.message : null
}
