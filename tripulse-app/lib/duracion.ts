// Estimación de duración de una sesión a partir de sus tareas.
//
// Cálculo por tarea:
//   - Por tiempo (p_duracion):      tiempo_planeado por serie
//   - Por distancia (p_distancia):  metros / velocidad_zona por serie
//       · Carrera:  velocidad = VAM(km/h) · %zona / 3.6  → m/s
//       · Natación: velocidad = CSS(m/s) · %zona         → m/s
//       · Ciclismo: NO estimable (se entrena por potencia) → se marca aviso
//   - Fuerza (disciplina 'Fuerza'):
//       trabajo   = series · (Σ reps de sus ejercicios) · SEG_POR_REP
//       descanso  = descanso_segundos · (series - 1)
//       + transición de 90s entre cambios de ejercicio: TRANSICION · (nEjercicios - 1)
//
//   total_tarea = (tiempo_trabajo · series) + descanso_segundos · (series - 1)
//
// El % de zona es el punto medio del rango de ZONAS_REF (ver tareas-tabla.tsx).
// Z1 tiene rango [0, x] así que usamos un valor fijo del 60%.

// Punto medio del % de intensidad por zona y disciplina (respecto a VAM / CSS).
// Z1 fijo al 60% porque su rango real empieza en 0.
const PCT_ZONA: Record<number, { vam: number; css: number }> = {
  1: { vam: 60,  css: 60  },
  2: { vam: 70,  css: 70  },
  3: { vam: 80,  css: 80  },
  4: { vam: 90,  css: 90  },
  5: { vam: 100, css: 100 },
  6: { vam: 113, css: 113 },
  7: { vam: 135, css: 135 },
}

// Segundos por repetición de fuerza (tempo concéntrico + excéntrico).
const SEG_POR_REP = 3
// Transición entre cambios de ejercicio de fuerza (montar máquina, cambiar discos).
const TRANSICION_EJERCICIO = 90

export interface TareaDuracion {
  disciplina?: string | null
  series?: number | null
  descanso_segundos?: number | null
  zona_entrenamiento?: string | null
  p_distancia?: { metros_planeados?: number | null }[] | null
  p_duracion?: { tiempo_planeado?: number | null }[] | null
  p_repeticiones?: { repeticiones_planteadas?: number | null }[] | null
  ejercicios?: { repeticiones?: number | null }[] | null
}

export interface TestsDeportista {
  vam?: number | null   // km/h (carrera)
  css?: number | null   // m/s  (natación)
  ftp?: number | null   // W    (ciclismo)
}

export interface ResultadoDuracion {
  segundos: number          // duración estimada total en segundos
  minutos: number           // redondeado a minutos
  estimable: boolean        // false si no hay ninguna tarea estimable
  avisoCiclismo: boolean    // hay tareas de ciclismo por distancia (no estimables)
  faltanTests: boolean      // hay tareas por distancia sin el test necesario
}

function numZona(zona?: string | null): number | null {
  if (!zona) return null
  const n = parseInt(String(zona).replace(/[^0-9]/g, ''))
  return isNaN(n) ? null : n
}

// Tiempo de trabajo de UNA serie de la tarea, en segundos. null si no es estimable.
function segTrabajoPorSerie(t: TareaDuracion, tests: TestsDeportista): number | null {
  const dur = t.p_duracion?.[0]?.tiempo_planeado
  if (dur != null && dur > 0) return dur

  const metros = t.p_distancia?.[0]?.metros_planeados
  if (metros != null && metros > 0) {
    const z = numZona(t.zona_entrenamiento) ?? 2
    const pct = PCT_ZONA[z] || PCT_ZONA[2]
    const disc = t.disciplina
    if (disc === 'Carrera' && tests.vam) {
      const velMs = (tests.vam * pct.vam / 100) / 3.6
      return velMs > 0 ? metros / velMs : null
    }
    if (disc === 'Natacion' && tests.css) {
      const velMs = tests.css * pct.css / 100
      return velMs > 0 ? metros / velMs : null
    }
    // Ciclismo por distancia o falta el test → no estimable
    return null
  }
  return null
}

export function calcularDuracionEstimada(
  tareas: TareaDuracion[],
  tests: TestsDeportista,
): ResultadoDuracion {
  let segundos = 0
  let algunaEstimada = false
  let avisoCiclismo = false
  let faltanTests = false
  let ejerciciosFuerza = 0   // nº de tareas de fuerza estimadas (para transiciones)

  for (const t of tareas) {
    const series = t.series && t.series > 0 ? t.series : 1

    // Fuerza: se calcula a partir de reps × tempo, no de tiempo/distancia
    if (t.disciplina === 'Fuerza') {
      const totalReps = (t.ejercicios || []).reduce((acc, e) => acc + (e.repeticiones || 0), 0)
      if (totalReps > 0) {
        const trabajo = series * totalReps * SEG_POR_REP
        const descanso = (t.descanso_segundos || 0) * Math.max(0, series - 1)
        segundos += trabajo + descanso
        ejerciciosFuerza++
        algunaEstimada = true
      }
      continue
    }

    const trabajoSerie = segTrabajoPorSerie(t, tests)
    if (trabajoSerie != null) {
      const descanso = (t.descanso_segundos || 0) * Math.max(0, series - 1)
      segundos += trabajoSerie * series + descanso
      algunaEstimada = true
    } else {
      // No estimable: distinguir el porqué para el aviso
      const metros = t.p_distancia?.[0]?.metros_planeados
      if (metros != null && metros > 0) {
        if (t.disciplina === 'Ciclismo') avisoCiclismo = true
        else if (t.disciplina === 'Carrera' && !tests.vam) faltanTests = true
        else if (t.disciplina === 'Natacion' && !tests.css) faltanTests = true
      }
    }
  }

  // Transición entre cambios de ejercicio de fuerza
  if (ejerciciosFuerza > 1) segundos += TRANSICION_EJERCICIO * (ejerciciosFuerza - 1)

  return {
    segundos,
    minutos: Math.round(segundos / 60),
    estimable: algunaEstimada,
    avisoCiclismo,
    faltanTests,
  }
}
