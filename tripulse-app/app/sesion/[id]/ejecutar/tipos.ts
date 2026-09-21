// Las filas con las que trabaja la pantalla de ejecución, y las que comparte con
// FuerzaRegistro. Solo lo que se lee: la base trae más columnas.
//
// Los tipos de las columnas están comprobados contra la base (21 sep 2026), no
// deducidos del código: `intensidad` y `metros_*` son numeric, `control_valor`
// es texto.

import type { TareaDuracion, EjercicioDuracion } from '@/lib/duracion'
import type { SerieHecha } from '@/lib/modo-mejora'

export interface SesionEjec {
  id: number
  id_deportista: number | null
  id_microciclo: number | null
  fecha_sesion: string
  estado: string | null
  disciplina: string
  duracion_minutos: number | null
  duracion_real: number | null
  hora_inicio: string | null
  notas_entrenador: string | null
  nutricion_ayuno: boolean | null
  rpe_estimado: number | null
}

export interface TareaEjec extends TareaDuracion {
  id: number
  comentario?: string | null
  /** El drill, si lo que se mandó es técnica (lo añade `conTecnica`). */
  tecnica?: { nombre: string; descripcion?: string | null; ejecucion?: string | null; url_video?: string | null } | null
  p_distancia?: { metros_planeados?: number | null; metros_reales?: number | null; ritmo_objetivo?: string | null }[] | null
  p_duracion?: { tiempo_planeado?: number | null; tiempo_real?: number | null; ritmo_objetivo?: string | null }[] | null
}

/** Un ejercicio de `ejercicios`, con el vídeo ya resuelto desde la biblioteca. */
export interface EjercicioEjec extends EjercicioDuracion {
  id: number
  id_tarea: number
  nombre: string
  ejercicio_id?: number | string | null
  ejercicio_encadenado_id?: number | string | null
  url_video?: string | null
  series?: number | null
  intensidad?: number | null
  descanso_segundos?: number | null
  tipo_serie?: string | null
  grupo_muscular?: string | null
  control_tipo?: string | null
  control_valor?: string | null
  escalones_drop?: string | null
  ejercicio_encadenado_nombre?: string | null
  video?: string | null
  videoEncadenado?: string | null
}

/** Lo que el atleta va escribiendo en una serie de fuerza. Son textos de casilla. */
export interface SerieEnCurso {
  numero_serie: number
  /** 1 = el ejercicio principal; 2 = el encadenado; en un drop set, el escalón. */
  ejercicio_numero: number
  peso_real?: string
  repeticiones_reales?: string
  tiempo_real?: string
  control_real?: string
  completada?: boolean
}

export type CampoSerie = 'peso_real' | 'repeticiones_reales' | 'tiempo_real' | 'control_real' | 'completada'

/** Una fila del RPC `ultima_ejecucion_fuerza`: la última vez que hizo ese ejercicio. */
export interface SerieUltimaVez extends SerieHecha {
  fecha: string
}

/** «La última vez», por nombre de ejercicio. */
export type HistorialFuerza = Record<string, { dias: number; series: SerieUltimaVez[] }>
