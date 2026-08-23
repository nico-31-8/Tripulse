// ============================================================
// TRIPULSE — Cuánto es una sesión, vista desde fuera
// ============================================================
// El calendario pinta cada día con lo que hay dentro: los metros, los minutos,
// la duración estimada y las zonas que toca. Nada de eso está en la fila de
// `sesion`: sale de sus tareas y de los parámetros que cuelgan de cada tarea
// (`p_distancia`, `p_duracion`, `ejercicios`), que vienen en listas aparte.
//
// ESTABA DENTRO DE LA PANTALLA, mezclado con la cascada de consultas que lo
// alimentaba. Sacarlo permite dos cosas: probarlo, y —lo que importaba— cambiar
// la forma de TRAER los datos sin tocar la forma de CONTARLOS.
//
// El total de una tarea es `valor × series`. Es el mismo criterio que usa la
// tabla del editor (lib/tarea-vista): si aquí se contara el valor por serie, el
// calendario diría 100 m donde el editor dice 800, y las dos pantallas hablarían
// de la misma sesión con números distintos.
import { calcularDuracionEstimada } from './duracion'
import type { TestsDeportista, ResultadoDuracion } from './duracion'
import { cargaZona } from './zonas'

export interface TareaCruda {
  id: number
  id_sesion: number
  series?: number | null
  disciplina?: string | null
  zona_entrenamiento?: string | null
  descanso_segundos?: number | null
}

export interface Distancia { id_tarea: number; metros_planeados?: number | null }
export interface Duracion { id_tarea: number; tiempo_planeado?: number | null }
export interface Ejercicio { id_tarea: number; repeticiones?: number | null }

export interface SesionConVolumen {
  metros_total: number
  seg_total: number
  dur_estimada: ResultadoDuracion
  /** De la zona más dura a la más suave. */
  zonas: string[]
  [k: string]: any
}

/** Agrupa una lista de hijos por `id_tarea`, en una pasada. */
function porTarea<T extends { id_tarea: number }>(filas: T[] | null | undefined): Map<number, T[]> {
  const m = new Map<number, T[]>()
  ;(filas || []).forEach(f => {
    const l = m.get(f.id_tarea)
    if (l) l.push(f); else m.set(f.id_tarea, [f])
  })
  return m
}

/**
 * Pega a cada sesión su volumen, su duración estimada y sus zonas.
 *
 * TODO EN MAPAS, no con `filter` dentro de un bucle. La versión anterior hacía
 * un `find`/`filter` sobre las listas completas por cada tarea de cada sesión:
 * con una temporada de 200 sesiones y 600 tareas eso son cientos de miles de
 * recorridos cada vez que se repinta el calendario. Aquí es una pasada para
 * agrupar y otra para montar.
 */
export function conVolumen(
  sesiones: any[],
  tareas: TareaCruda[] | null | undefined,
  distancias: Distancia[] | null | undefined,
  duraciones: Duracion[] | null | undefined,
  ejercicios: Ejercicio[] | null | undefined,
  tests: TestsDeportista,
): SesionConVolumen[] {
  const tareasDe = new Map<number, TareaCruda[]>()
  ;(tareas || []).forEach(t => {
    const l = tareasDe.get(t.id_sesion)
    if (l) l.push(t); else tareasDe.set(t.id_sesion, [t])
  })
  const dist = porTarea(distancias)
  const dur = porTarea(duraciones)
  const ejer = porTarea(ejercicios)

  return sesiones.map(s => {
    const suyas = tareasDe.get(s.id) || []
    let metros = 0, seg = 0
    const tareasDur = suyas.map(t => {
      const series = t.series || 1
      const d = dist.get(t.id) || []
      const u = dur.get(t.id) || []
      metros += (d[0]?.metros_planeados || 0) * series
      seg += (u[0]?.tiempo_planeado || 0) * series
      return {
        disciplina: t.disciplina,
        series: t.series,
        descanso_segundos: t.descanso_segundos,
        zona_entrenamiento: t.zona_entrenamiento,
        p_distancia: d,
        p_duracion: u,
        ejercicios: ejer.get(t.id) || [],
      }
    })

    /* Las zonas, de la más dura a la más suave. Es lo que dice de un vistazo si
       el martes es una tirada suave o unas series: hasta que se añadieron, el
       calendario solo decía el deporte y el volumen, y en una semana entera eso
       se lee todo igual. */
    const zonas = [...new Set(suyas.map(t => t.zona_entrenamiento).filter(Boolean))]
      .sort((a, b) => cargaZona(b as string).nivel - cargaZona(a as string).nivel) as string[]

    return {
      ...s,
      metros_total: metros,
      seg_total: seg,
      dur_estimada: calcularDuracionEstimada(tareasDur as any, tests),
      zonas,
    }
  })
}
