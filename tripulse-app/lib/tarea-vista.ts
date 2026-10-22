// ============================================================
// TRIPULSE — Una tarea guardada, en texto
// ============================================================
// La misma tarea se enseña en la tabla del editor y, desde el panel de la
// semana, en la previa de otra sesión. Las dos tienen que leer los mismos
// números: si una contara el total y la otra el valor por serie, comparar dos
// sesiones daría una conclusión falsa — que es justo para lo que sirve el panel.
import { cuantoPorSerie } from './cardio-fuerza'
import { mmssCorto } from './medicion'
import { vecesDe, hayBloques, bloquesDe } from './bloques-tarea'
import { referenciaDeZona, type Tests } from './referencia-zona'
import { segAMmss } from './copiar-tarea'
import { zonaResistencia, zonaFuerza } from './zonas'
import { controlDeEjercicio } from './control-esfuerzo'
import { repsDeEjercicio, repsDePrescripcion, repsTotalDePrescripcion, repsDeEncadenado } from './repeticiones'
import { seriesDe, tieneSeriesDistintas, textoRepsSeries, textoKgSeries, textoControlSeries } from './series-detalle'
import { esBloque, leerConfig, ordenarLineas, textoFormato, textoLinea, QUE_SE_APUNTA, type Formato, type LineaBloque } from './bloque-formato'
import { esDePliometria, esGrupoPlio, leerNivel, nombreNivel } from './pliometria'

/**
 * Si la tarea es de pliometría: en carrera, por el ejercicio que lleva pegado
 * (`conTecnica`); en fuerza, por el grupo, que al prescribir se copia del tipo.
 * Entonces sus repeticiones son CONTACTOS (lib/pliometria).
 */
type ConSalto = {
  tecnica?: { tipo?: unknown } | null
  ejercicios?: { grupo_muscular?: unknown }[] | null
} | null | undefined

export const tareaDePliometria = (t: ConSalto): boolean =>
  esDePliometria(t?.tecnica) || esGrupoPlio(t?.ejercicios?.[0]?.grupo_muscular)

/** «8 reps», o «8 contactos» en una de pliometría. */
const unidadReps = (t: ConSalto) => (tareaDePliometria(t) ? ' contactos' : ' reps')

/** Lo que se hace en CADA serie: «400 m», «5:00 min», «8 reps». */
export function valorPorSerie(t: any): string {
  const seg = t?.p_duracion?.[0]?.tiempo_planeado
  if (seg) return segAMmss(seg) + ' min'
  const m = t?.p_distancia?.[0]?.metros_planeados
  if (m) return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m'
  const reps = repsDePrescripcion(t?.p_repeticiones?.[0])
  if (reps) return reps + unidadReps(t)
  return '—'
}

/** Lo que suma la tarea entera: el valor por serie × las series × los bloques. */
export function totalDeTarea(t: any): string {
  const series = vecesDe(t)
  const seg = t?.p_duracion?.[0]?.tiempo_planeado
  if (seg) {
    const total = seg * series
    return mmssCorto(total) + ' min'
  }
  const m = t?.p_distancia?.[0]?.metros_planeados
  if (m) {
    const total = m * series
    return total >= 1000 ? (total / 1000).toFixed(1) + ' km' : total + ' m'
  }
  const totalReps = repsTotalDePrescripcion(t?.p_repeticiones?.[0], series)
  if (totalReps) return totalReps + unidadReps(t)
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
export function vistaDeTarea(t: any, tests: Tests, fcMax: number, fcReposo: number = 0): VistaTarea {
  /* UN BLOQUE se lee por su formato y sus líneas, no por su primer ejercicio:
     «AMRAP 12′» de titular y una casilla por línea. Leído como una línea suelta
     saldría solo el primer ejercicio y sin decir que va en ronda con los otros. */
  if (esBloque(t)) {
    const formato = t.formato as Formato
    const lineas = ordenarLineas(t.ejercicios as LineaBloque[] | null)
    return {
      titulo: textoFormato(formato, leerConfig(t.formato_config)),
      zona: t?.zona_entrenamiento || '', nombreZona: nombreDeZona(t?.zona_entrenamiento),
      disciplina: t?.disciplina || '', esFuerza: true,
      campos: [
        ...lineas.map((l, i) => ({ k: String(i + 1), v: textoLinea(l, formato) })),
        { k: 'Apunta', v: QUE_SE_APUNTA[formato] },
      ],
      comentario: t?.comentario || '',
      encadenado: '',
    }
  }
  const ej = t?.ejercicios?.[0]
  const esFuerza = !!ej
  const zona = t?.zona_entrenamiento || ''
  const nombreZona = nombreDeZona(zona)
  const disciplina = t?.disciplina || ''
  const comentario = t?.comentario || ''
  const descanso = t?.descanso_segundos != null ? segAMmss(t.descanso_segundos) : '—'

  /* UNA LÍNEA DE CARDIO no es un ejercicio: sin grupo, sin carga y sin RIR.
     Con los campos de fuerza saldría «Carga — · Control —», que es ruido, y
     faltaría justo lo que importa: cuánto, a qué zona y a qué ritmo. */
  if (esFuerza && ej.tipo_serie === 'Cardio') {
    const porSerie = cuantoPorSerie({ modo: ej.cardio_modo, medida: ej.cardio_medida, valor: ej.cardio_valor }) || '—'
    return {
      titulo: ej.nombre || comentario || 'Cardio',
      zona, nombreZona, disciplina: disciplina || 'Fuerza', esFuerza: true,
      campos: [
        { k: 'Tipo', v: 'Cardio' },
        { k: 'Series', v: String(ej.series ?? t.series ?? '—') },
        { k: 'Por serie', v: porSerie, destaca: true },
        { k: 'Zona', v: ej.cardio_zona || '—', destaca: true },
        { k: 'Objetivo', v: ej.cardio_objetivo || '—' },
        { k: 'Descanso', v: descanso },
      ],
      comentario,
      encadenado: '',
    }
  }

  if (esFuerza) {
    const porTiempo = !!t?.p_duracion?.[0]?.tiempo_planeado
    /* Serie a serie: «12/10/8 reps», «40/45/50 kg», «RIR 3/2/1». */
    const sas = tieneSeriesDistintas(ej) ? seriesDe(ej, { segFila: t?.p_duracion?.[0]?.tiempo_planeado }) : null
    const repsSas = sas ? textoRepsSeries(sas, porTiempo) : ''
    /* En pliometría las repeticiones son contactos (lib/pliometria). */
    const plio = tareaDePliometria(t)
    const unidad = plio ? ' contactos' : ' reps'
    return {
      titulo: ej.nombre || comentario || 'Ejercicio',
      zona, nombreZona, disciplina: disciplina || 'Fuerza', esFuerza: true,
      campos: [
        { k: 'Grupo', v: ej.grupo_muscular || '—' },
        { k: 'Tipo de serie', v: ej.tipo_serie || 'Normal' },
        { k: 'Series', v: String(ej.series ?? t.series ?? '—') },
        {
          k: porTiempo ? 'Tiempo' : plio ? 'Contactos' : 'Repeticiones',
          v: sas ? (repsSas ? (porTiempo ? repsSas : repsSas + unidad) : '—')
            : porTiempo ? valorPorSerie(t) : (repsDeEjercicio(ej) ? repsDeEjercicio(ej) + unidad : '—'),
        },
        { k: 'Carga', v: sas ? (textoKgSeries(sas) || '—') : ej.intensidad != null ? ej.intensidad + ' kg' : '—', destaca: true },
        // «Control», no «RIR»: el RIR es una de las cuatro escalas, y con la
        // etiqueta fija un %1RM salía bajo el nombre equivocado.
        { k: 'Control', v: sas ? (textoControlSeries(sas, ej.control_tipo) || '—') : controlDeEjercicio(ej) || '—', destaca: true },
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
  /* La pliometría va por el mismo camino, con su nivel: «Pliometría · nivel 1». */
  const plio = esTecnica && esDePliometria(t?.tecnica)
  const nivelPlio = plio ? leerNivel(t.tecnica.nivel_pliometria) : null
  const textoPlio = 'Pliometría' + (nivelPlio
    ? ' · ' + nombreNivel(nivelPlio).toLowerCase()
    : '')
  const ref = referenciaDeZona(zona, disciplina, tests, fcMax, fcReposo)
  const campos: CampoTarea[] = [
    { k: 'Series', v: t?.series != null ? String(t.series) : '1' },
    /* Solo si va en bloques: si no, dos campos vacíos en cada tarea serían
       justo el ruido que el entrenador pidió que no hubiera. */
    ...(hayBloques(t) ? [{ k: 'Bloques', v: String(bloquesDe(t)) }] : []),
    { k: 'Por serie', v: valorPorSerie(t) },
    { k: 'Total', v: totalDeTarea(t), destaca: true },
    { k: 'Descanso', v: descanso },
    ...(hayBloques(t) && t?.descanso_bloques_segundos
      ? [{ k: 'Entre bloques', v: segAMmss(t.descanso_bloques_segundos) }] : []),
  ]
  // El ritmo solo si el atleta tiene el test que toca. Sin test no se enseña un
  // número inventado; se enseña el porcentaje, que sí es cierto — sin destacar,
  // porque no es su número. En Zonas 2 llegaba por `ritmo` y salía destacado.
  if (ref?.ritmo) campos.push({ k: 'Objetivo', v: ref.ritmo, destaca: true })
  else if (ref?.relativo) campos.push({ k: 'Objetivo', v: ref.relativo })
  if (ref?.rpe) campos.push({ k: 'Esfuerzo', v: ref.rpe })
  if (ref?.fc) campos.push({ k: 'Frecuencia', v: ref.fc })

  return {
    titulo: comentario ? comentario.split('\n')[0].slice(0, 60) : (plio ? 'Pliometría' : esTecnica ? 'Técnica' : nombreZona || 'Bloque'),
    zona,
    nombreZona: plio ? textoPlio : esTecnica ? 'Técnica · cuenta como ' + (nombreZona || zona) : nombreZona,
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
  /* Serie a serie (lib/series-detalle): «3×12/10/8 · 25/27.5/30 kg». */
  const sas = tieneSeriesDistintas(ej, true) ? seriesDe(ej, { encadenado: true }) : null
  /* Con el tope del rango: «3×8-10», no «3×8». */
  const rep = sas ? textoRepsSeries(sas, false) : repsDeEncadenado(ej)
  const kg = sas ? textoKgSeries(sas) : ej.encadenado_intensidad != null ? ej.encadenado_intensidad + ' kg' : ''
  const trozos = [
    ser != null && rep ? ser + '×' + rep
      : ser != null ? ser + (Number(ser) === 1 ? ' serie' : ' series')
      : rep ? rep + ' reps' : '',
    kg,
  ].filter(Boolean)
  return trozos.length ? nombre + ' · ' + trozos.join(' · ') : String(nombre)
}
