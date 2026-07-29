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
// Para Zonas 2 la sigla se resuelve a su nivel 1–7 equivalente vía cargaZona().
import { cargaZona, pctVamZona, velNatacionZona, zonaResistencia } from './zonas'

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

// ------------------------------------------------------------
// Duración real medida en el modo entreno
// ------------------------------------------------------------
// El modo entreno no tiene cronómetro: mide desde que el atleta pulsa Empezar.
// Ese número es bueno si entrenó con el móvil delante, y basura si se dejó la
// sesión abierta y volvió al día siguiente. Por eso NO se guarda a ciegas: si el
// reloj marca algo desproporcionado se devuelve `minutos: null` para que la casilla
// salga vacía y la escriba él (el salvaconducto), pero se conserva `medidos` para
// poder enseñarle qué se midió y por qué no nos fiamos.
export interface DuracionMedida {
  minutos: number | null   // lo que se propone; null = que lo ponga a mano
  medidos: number          // lo que marcó el reloj, fiable o no
  fiable: boolean
}

export function medirDuracion(
  inicioMs: number | null | undefined,
  finMs: number,
  minutosPlan: number,
): DuracionMedida {
  if (!inicioMs || !finMs || finMs <= inicioMs) return { minutos: null, medidos: 0, fiable: false }
  const medidos = Math.round((finMs - inicioMs) / 60000)
  // Margen generoso sobre lo planificado (uno puede entretenerse), con tope duro de
  // 12 h: por encima de eso no hay sesión que valga, es una pestaña olvidada.
  const techo = Math.min(720, minutosPlan > 0 ? minutosPlan * 2 + 60 : 240)
  const fiable = medidos > 0 && medidos <= techo
  return { minutos: fiable ? medidos : null, medidos, fiable }
}

// Nivel de intensidad 1–7 de la zona (Z1–Z7 o sigla Zonas 2), vía catálogo.
function numZona(zona?: string | null): number {
  return cargaZona(zona).nivel
}

// Velocidad de CARRERA de una zona, en m/s. Si la zona es una sigla del catálogo
// Zonas 2, su % sale del propio catálogo; si es una Z1–Z7 clásica, del mapa de
// niveles. NO se pasa por cargaZona() para las siglas: comprime 9 zonas en 7 y AEL
// acababa estimándose al 60% de VAM (el de AER) en vez de al 70%.
function velCarrera(zona: string | null | undefined, vam: number): number | null {
  const pct = pctVamZona(zona) ?? PCT_ZONA[numZona(zona)]?.vam ?? PCT_ZONA[2].vam
  const velMs = (vam * pct / 100) / 3.6
  return velMs > 0 ? velMs : null
}

// Velocidad de NATACIÓN de una zona, en m/s. Para las siglas se usa el desfase real
// en segundos sobre el CSS; para las Z1–Z7 clásicas, el mapa de niveles.
function velNatacion(zona: string | null | undefined, css: number): number | null {
  if (zonaResistencia(zona)) return velNatacionZona(zona, css)
  const velMs = css * (PCT_ZONA[numZona(zona)]?.css ?? PCT_ZONA[2].css) / 100
  return velMs > 0 ? velMs : null
}

// Tiempo de trabajo de UNA serie de la tarea, en segundos. null si no es estimable.
function segTrabajoPorSerie(t: TareaDuracion, tests: TestsDeportista): number | null {
  const dur = t.p_duracion?.[0]?.tiempo_planeado
  if (dur != null && dur > 0) return dur

  const metros = t.p_distancia?.[0]?.metros_planeados
  if (metros != null && metros > 0) {
    const disc = t.disciplina
    if (disc === 'Carrera' && tests.vam) {
      const velMs = velCarrera(t.zona_entrenamiento, tests.vam)
      return velMs ? metros / velMs : null
    }
    if (disc === 'Natacion' && tests.css) {
      const velMs = velNatacion(t.zona_entrenamiento, tests.css)
      return velMs ? metros / velMs : null
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

    // Fuerza: reps × tempo (normal) o series × segundos (isométrico)
    if (t.disciplina === 'Fuerza') {
      const totalReps = (t.ejercicios || []).reduce((acc, e) => acc + (e.repeticiones || 0), 0)
      const isoSeg = t.p_duracion?.[0]?.tiempo_planeado || 0
      let trabajo = 0
      if (totalReps > 0) trabajo = series * totalReps * SEG_POR_REP
      else if (isoSeg > 0) trabajo = series * isoSeg
      if (trabajo > 0) {
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
