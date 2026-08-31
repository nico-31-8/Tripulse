// ============================================================
// TRIPULSE — Una tarea guardada, de vuelta al formulario
// ============================================================
// Dos caminos acaban en lo mismo: darle a ✏️ en una tarea de esta sesión, y
// copiar una tarea de otra sesión desde el panel de la semana. En los dos casos
// hay que deshacer el guardado — coger la fila de `tarea` con sus
// p_duracion/p_distancia/p_repeticiones/ejercicios y devolverla a las casillas
// del formulario.
//
// ESTÁ AQUÍ Y NO EN LA TABLA para que sea UNA sola conversión. Con una copia por
// camino, el día que alguien añada un campo al formulario lo arreglaría en el
// suyo y el otro seguiría perdiéndolo en silencio; es exactamente la forma de
// fallo que más veces ha aparecido en este proyecto.
//
// LA ÚNICA DIFERENCIA ENTRE EDITAR Y COPIAR es `idTarea`. Con él, guardar
// actualiza la tarea existente; sin él, crea una nueva. Copiar no lo lleva, así
// que la de origen no se toca — que es justo lo que se le promete al entrenador
// en el panel.
import { detectarMedicion } from './medicion'
import { intensidadGuardada } from './intensidad-prescrita'
import { mmssCorto } from './duracion-carga'
import type { ControlTipo } from './control-esfuerzo'

export interface FilaResistencia {
  orden: number
  zona: string
  disciplina: string
  series: string
  descanso: string
  tipoMedicion: string
  valorMedicion: string
  intensidadPersonalizada: string
  comentario: string
  esTecnica: boolean
  tecnicaId: string
  guardado?: boolean
  /** Si viene, la fila EDITA esa tarea en vez de crear una nueva. */
  idTarea?: number
}

export interface FilaFuerza {
  orden: number
  grupoMuscularSel: string
  ejercicioSelId: string
  tipoSerie: string
  series: string
  medida: 'reps' | 'tiempo'
  controlTipo: ControlTipo
  repsFuerza: string
  kgFuerza: string
  rir: string
  descanso: string
  comentario: string
  grupoMuscular2: string
  ejercicioSelId2: string
  series2: string
  repsFuerza2: string
  kgFuerza2: string
  escalonDrop: string
  zonaFuerzaTarea: string
  guardado?: boolean
  idTarea?: number
}

/** «90» → «1:30». Los segundos sueltos no llevan minutos delante. */
/* Se llamaba `segAMmss`, igual que tres funciones locales que hacían otra cosa
   (esas nunca se comen el «:00»). Ahora vive en lib/duracion-carga con nombre
   propio; se reexporta porque media app la importa desde aquí. */
export { mmssCorto as segAMmss } from './duracion-carga'

export interface OpcionesFila {
  /** La fila vacía de la que se parte: trae los valores por defecto de la sesión. */
  base: any
  /** Dónde va en la lista. */
  orden: number
  /** true = copiar (crea una tarea nueva); false = editar la de origen. */
  copia: boolean
  /** Para resolver los ids de los ejercicios de fuerza. */
  ejerciciosBiblioteca?: any[]
}

/**
 * Lo que debe volver a la casilla del «@»: lo que haya guardado, tal cual.
 *
 * ANTES SE COMPARABA CON LO QUE PROPONE LA ZONA Y SE BORRABA SI COINCIDÍA.
 * Tenía sentido mientras la columna guardaba dos cosas distintas con la misma
 * pinta: lo que escribió el entrenador, o —con la casilla vacía— la propuesta
 * de la app guardándose sola. Comparar era la única forma de adivinar cuál era
 * cuál.
 *
 * Pero tenía un precio que no se veía: prescribir a propósito el MISMO valor
 * que proponía la app era imposible. Se escribía, se guardaba, y al recargar
 * había desaparecido. Y eso es justo lo que hace un entrenador cuando quiere
 * fijar un ritmo que hoy coincide con el del test pero no quiere que se mueva
 * cuando el atleta mejore.
 *
 * Ya no hace falta adivinar: desde el cambio de arriba solo se guarda lo
 * escrito (ver `aGuardar` en lib/intensidad-prescrita.ts). Lo calculado se
 * calcula al enseñarlo y sigue saliendo de fantasma en el placeholder.
 */
export function intensidadDeTarea(t: any): string {
  return intensidadGuardada(t) || ''
}

/** Una tarea de resistencia, de vuelta a su fila. */
export function filaResistenciaDesde(t: any, o: OpcionesFila): FilaResistencia {
  const med = detectarMedicion(t)
  return {
    ...o.base,
    ...(o.copia ? {} : { idTarea: t.id }),
    orden: o.orden,
    zona: t.zona_entrenamiento || '',
    disciplina: t.disciplina || '',
    series: t.series != null ? String(t.series) : '',
    descanso: t.descanso_segundos != null ? String(t.descanso_segundos) : '',
    tipoMedicion: med.tipo,
    valorMedicion: med.valor,
    comentario: t.comentario || '',
    intensidadPersonalizada: intensidadDeTarea(t),
    // «Técnica» no es una zona: la tarea guarda AER y `tecnica_id` aparte. Que
    // la casilla vuelva a decir «Técnica» se deduce de ahí, no de una columna
    // propia — si hubiera dos, se contradirían.
    esTecnica: !!t.tecnica_id,
    tecnicaId: t.tecnica_id ? String(t.tecnica_id) : '',
  }
}

/** Una tarea de fuerza, de vuelta a su fila. */
export function filaFuerzaDesde(t: any, o: OpcionesFila): FilaFuerza {
  const bib = o.ejerciciosBiblioteca || []
  const ej = t.ejercicios?.[0]
  const segundos = t.p_duracion?.[0]?.tiempo_planeado
  const esTiempo = !!segundos
  // OJO: aquí NO vale el texto de leer («45 s», «1:30 min»): al guardar,
  // mmssASegundos no lo entiende. La casilla acepta «45» o «1:30».
  const tiempoEditable = esTiempo ? (segundos < 60 ? String(segundos) : mmssCorto(segundos)) : ''
  // El grupo del encadenado, para que su desplegable lo enseñe: sin él, una
  // superserie seguía guardada pero no había forma de verla ni cambiarla.
  const ej2 = ej?.ejercicio_encadenado_id
    ? bib.find((e: any) => e.id === Number(ej.ejercicio_encadenado_id))
    : null

  return {
    ...o.base,
    ...(o.copia ? {} : { idTarea: t.id }),
    orden: o.orden,
    grupoMuscularSel: ej?.grupo_muscular || '',
    ejercicioSelId: ej ? String(bib.find((e: any) => e.nombre === ej.nombre)?.id ?? '') : '',
    tipoSerie: ej?.tipo_serie || 'Normal',
    medida: esTiempo ? 'tiempo' : 'reps',
    controlTipo: (ej?.control_tipo as ControlTipo) || 'rir',
    series: t.series != null ? String(t.series) : '',
    // En modo tiempo la casilla de «reps» es la que lleva los segundos.
    repsFuerza: esTiempo ? tiempoEditable : (ej?.repeticiones != null ? String(ej.repeticiones) : ''),
    kgFuerza: ej?.intensidad != null ? String(ej.intensidad) : '',
    rir: ej?.control_valor || '',
    descanso: t.descanso_segundos != null ? String(t.descanso_segundos) : '',
    comentario: t.comentario || '',
    grupoMuscular2: ej2?.grupo_muscular || '',
    ejercicioSelId2: ej2 ? String(ej2.id) : '',
    /* Los tres números del encadenado ya tienen columna propia, así que vuelven.
       Antes se quedaban como estaban en la fila vacía porque vivían metidos como
       texto dentro de `notas_ejecucion`, y sacarlos de ahí habría exigido una
       expresión regular — el mismo apaño que costó caro con el RIR.

       Las tareas creadas ANTES de la migración siguen sin ellos: vuelven vacíos,
       igual que antes, y sus números se siguen leyendo en las notas. No se
       rellenan hacia atrás, que exigiría justo el parser que se ha evitado. */
    series2: ej?.encadenado_series != null ? String(ej.encadenado_series) : '',
    repsFuerza2: ej?.encadenado_repeticiones != null ? String(ej.encadenado_repeticiones) : '',
    kgFuerza2: ej?.encadenado_intensidad != null ? String(ej.encadenado_intensidad) : '',
    escalonDrop: ej?.escalones_drop || '',
    zonaFuerzaTarea: t.zona_entrenamiento || '',
  }
}

/**
 * ¿Hay que avisar de que esta fila viene de otro deporte?
 *
 * El objetivo y los chips de referencia se calculan con la disciplina de la
 * fila: 285–310 W no significa nada corriendo. Traerla es legítimo —un brick,
 * un cambio de plan—, así que se avisa en vez de impedirlo o de convertirlo a
 * ciegas.
 *
 * En un Brick no se avisa: ahí mezclar deportes es lo normal y el aviso sería
 * ruido en todas las filas.
 */
export function avisaOtraDisciplina(fila: { disciplina?: string }, disciplinaSesion: string): boolean {
  if (!fila.disciplina) return false
  if (disciplinaSesion === 'Brick') return false
  return fila.disciplina !== disciplinaSesion
}
