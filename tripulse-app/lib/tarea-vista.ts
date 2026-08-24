// ============================================================
// TRIPULSE — Una tarea guardada, en texto
// ============================================================
// La misma tarea se enseña en la tabla del editor y, desde el panel de la
// semana, en la previa de otra sesión. Las dos tienen que leer los mismos
// números: si una contara el total y la otra el valor por serie, comparar dos
// sesiones daría una conclusión falsa — que es justo para lo que sirve el panel.
import { referenciaDeZona, type Tests } from './referencia-zona'
import { segAMmss } from './copiar-tarea'
import { zonaResistencia, zonaFuerza } from './zonas'
import { controlDeEjercicio } from './control-esfuerzo'

/** Lo que se hace en CADA serie: «400 m», «5:00 min», «8 reps». */
export function valorPorSerie(t: any): string {
  const seg = t?.p_duracion?.[0]?.tiempo_planeado
  if (seg) return segAMmss(seg) + ' min'
  const m = t?.p_distancia?.[0]?.metros_planeados
  if (m) return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m'
  const r = t?.p_repeticiones?.[0]?.repeticiones_planteadas
  if (r) return r + ' reps'
  return '—'
}

/** Lo que suma la tarea entera: el valor por serie × las series. */
export function totalDeTarea(t: any): string {
  const series = t?.series || 1
  const seg = t?.p_duracion?.[0]?.tiempo_planeado
  if (seg) {
    const total = seg * series
    const min = Math.floor(total / 60), s = total % 60
    return s > 0 ? min + ':' + String(s).padStart(2, '0') + ' min' : min + ' min'
  }
  const m = t?.p_distancia?.[0]?.metros_planeados
  if (m) {
    const total = m * series
    return total >= 1000 ? (total / 1000).toFixed(1) + ' km' : total + ' m'
  }
  const r = t?.p_repeticiones?.[0]?.repeticiones_planteadas
  if (r) return (r * series) + ' reps'
  return '—'
}

/** El nombre de una zona por su sigla, del sistema que sea. */
export function nombreDeZona(sigla: string | null | undefined): string {
  if (!sigla) return ''
  return zonaResistencia(sigla)?.nombre || zonaFuerza(sigla)?.nombre || ''
}

export interface CampoTarea { k: string; v: string; destaca?: boolean }

export interface VistaTarea {
  /** El nombre grande: el ejercicio en fuerza, la zona o el comentario en resistencia. */
  titulo: string
  zona: string
  nombreZona: string
  disciplina: string
  esFuerza: boolean
  /** Las casillas, ya en texto y en el orden en el que se leen. */
  campos: CampoTarea[]
  comentario: string
  /** El segundo ejercicio de una superserie, si lo hay. */
  encadenado: string
}

/**
 * Una tarea guardada, lista para pintar.
 *
 * En resistencia el título sale del comentario si lo hay, y si no del nombre de
 * la zona: la tarea no tiene columna de nombre —la identidad de un bloque son su
 * zona y su volumen— y poner «AEM» a secas de titular no dice nada que no diga
 * ya la línea de debajo.
 */
export function vistaDeTarea(t: any, tests: Tests, fcMax: number): VistaTarea {
  const ej = t?.ejercicios?.[0]
  const esFuerza = !!ej
  const zona = t?.zona_entrenamiento || ''
  const nombreZona = nombreDeZona(zona)
  const disciplina = t?.disciplina || ''
  const comentario = t?.comentario || ''
  const descanso = t?.descanso_segundos != null ? segAMmss(t.descanso_segundos) : '—'

  if (esFuerza) {
    const porTiempo = !!t?.p_duracion?.[0]?.tiempo_planeado
    return {
      titulo: ej.nombre || comentario || 'Ejercicio',
      zona, nombreZona, disciplina: 'Fuerza', esFuerza: true,
      campos: [
        { k: 'Grupo', v: ej.grupo_muscular || '—' },
        { k: 'Tipo de serie', v: ej.tipo_serie || 'Normal' },
        { k: 'Series', v: String(ej.series ?? t.series ?? '—') },
        { k: porTiempo ? 'Tiempo' : 'Repeticiones', v: porTiempo ? valorPorSerie(t) : (ej.repeticiones != null ? ej.repeticiones + ' reps' : '—') },
        { k: 'Carga', v: ej.intensidad != null ? ej.intensidad + ' kg' : '—', destaca: true },
        // «Control», no «RIR»: el RIR es una de las cuatro escalas, y con la
        // etiqueta fija un %1RM salía bajo el nombre equivocado.
        { k: 'Control', v: controlDeEjercicio(ej) || '—', destaca: true },
        { k: 'Descanso', v: descanso },
      ],
      comentario,
      encadenado: textoEncadenado(ej),
    }
  }

  /* Un bloque de técnica guarda AER como zona: es lo que hace que cuente como el
     volumen suave que realmente es. Pero enseñarlo como «AER · Recuperación» en
     la previa engaña — parece un rodaje flojo cuando es trabajo técnico, que es
     otra cosa a la hora de decidir qué le pones al día siguiente. */
  const esTecnica = !!t?.tecnica_id
  const ref = referenciaDeZona(zona, disciplina, tests, fcMax)
  const campos: CampoTarea[] = [
    { k: 'Series', v: t?.series != null ? String(t.series) : '1' },
    { k: 'Por serie', v: valorPorSerie(t) },
    { k: 'Total', v: totalDeTarea(t), destaca: true },
    { k: 'Descanso', v: descanso },
  ]
  // El ritmo solo si el atleta tiene el test que toca. Sin test no se enseña un
  // número inventado; se enseña el porcentaje, que sí es cierto.
  if (ref?.ritmo) campos.push({ k: 'Objetivo', v: ref.ritmo, destaca: true })
  else if (ref?.porcentaje) campos.push({ k: 'Objetivo', v: ref.porcentaje })
  if (ref?.rpe) campos.push({ k: 'Esfuerzo', v: ref.rpe })
  if (ref?.fc) campos.push({ k: 'Frecuencia', v: ref.fc })

  return {
    titulo: comentario ? comentario.split('\n')[0].slice(0, 60) : (esTecnica ? 'Técnica' : nombreZona || 'Bloque'),
    zona,
    nombreZona: esTecnica ? 'Técnica · cuenta como ' + (nombreZona || zona) : nombreZona,
    disciplina, esFuerza: false,
    campos,
    // Si el comentario ya es el título, no se repite debajo.
    comentario: comentario && comentario.split('\n')[0].slice(0, 60) !== comentario ? comentario : '',
    encadenado: '',
  }
}

/** Las zonas distintas que toca una sesión, para el resumen del día. */
export function zonasDeSesion(tareas: any[]): string[] {
  return [...new Set((tareas || []).map(t => t?.zona_entrenamiento).filter(Boolean))] as string[]
}

/**
 * El segundo ejercicio de una superserie, con sus números.
 *
 * «Press banca · 3×10 · 40 kg», o solo «Press banca» si no los tiene.
 *
 * Esos tres números vivían METIDOS COMO TEXTO dentro de `notas_ejecucion`
 * (« | EJ2: Press banca 3x10 @40kg »), que es el mismo apaño que ya se pagó caro
 * con el RIR. Ahora tienen columnas propias, así que se pueden leer, editar y
 * copiar — pero por eso mismo el texto hay que armarlo en algún sitio, y ese
 * sitio es este y no las cinco pantallas que lo pintan.
 *
 * Las tareas VIEJAS no tienen las columnas rellenas: ahí sale el nombre solo, y
 * sus números se siguen viendo donde siempre, dentro de las notas.
 */
export function textoEncadenado(ej: any): string {
  const nombre = ej?.ejercicio_encadenado_nombre
  if (!nombre) return ''
  const ser = ej.encadenado_series
  const rep = ej.encadenado_repeticiones
  const kg = ej.encadenado_intensidad
  const trozos = [
    ser != null && rep != null ? ser + '×' + rep
      : ser != null ? ser + (Number(ser) === 1 ? ' serie' : ' series')
      : rep != null ? rep + ' reps' : '',
    kg != null ? kg + ' kg' : '',
  ].filter(Boolean)
  return trozos.length ? nombre + ' · ' + trozos.join(' · ') : String(nombre)
}
