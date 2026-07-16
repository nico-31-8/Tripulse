// ============================================================
// TRIPULSE — Atribución por bloque
// ============================================================
// Un BRICK es un FORMATO, no una disciplina: una sesión con bloques ordenados
// (= tareas, cada una con su propio deporte) y transiciones entre ellas.
//
// Consecuencia: ningún cálculo por deporte puede leer `sesion.disciplina`.
// En un brick vale 'Brick', que no es un deporte y no casa con ningún filtro
// (`.eq('disciplina','Ciclismo')`, `if (s.disciplina === ...)`), así que la bici
// y la carrera del brick desaparecerían del volumen y de la carga.
//
// Esta capa expande cada sesión en sus bloques reales:
//   · sesión normal → 1 bloque con toda su duración y su UA
//   · brick         → N bloques, cada uno con su deporte, sus minutos y su UA
//
// Invariantes (para que el refactor no mueva ni un número en lo que ya existe):
//   · Σ minutos de los bloques = minutos de la sesión
//   · sin transiciones, Σ UA de los bloques = UA de la sesión
//
// Fuente: deporte/Resources/Triatlón/B1-04-Microciclo-Semanal.md
import { calcularDuracionEstimada, type TestsDeportista, type TareaDuracion } from './duracion'
import { minutosEfectivos } from './duracion-carga'
import { factorConcatenacion } from './bricks'

// El coste extra del bloque que va JUSTO DESPUÉS de una transición depende del
// PAR de deportes, no es plano: B1-04 mide un 10-15% en bici→carrera, pero dice
// que natación→lo que sea tiene interferencia baja (no carga el tren inferior).
// La tabla vive en lib/bricks.ts.

export interface Transicion {
  despues_de: number       // `orden` de la tarea tras la que va la transición
  segundos?: number | null
  nota?: string | null
}

export interface SesionAtribuible {
  id: number
  fecha_sesion: string
  disciplina?: string | null
  duracion_minutos?: number | null
  rpe_estimado?: number | null
  rpe_reportado?: number | null
  transiciones?: Transicion[] | null
}

export interface TareaAtribuible extends TareaDuracion {
  id?: number
  id_sesion: number
  orden?: number | null
  // Feedback del bloque. Si existe, manda sobre el RPE de la sesión: es lo que el
  // atleta dijo de ESE esfuerzo (ver el reporte por bloque en app/sesion/[id]).
  rpe_reportado?: number | null
}

export interface Bloque {
  id_sesion: number
  fecha: string
  disciplina: string        // el deporte REAL del bloque
  minutos: number
  rpe: number
  ua: number                // rpe × minutos × factor de concatenación
  zona: string | null
  orden: number
  trasTransicion: boolean
  esBrick: boolean          // el bloque viene de una sesión multideporte
}

export interface OpcionesAtribucion {
  tests?: TestsDeportista
  // Cómo se resuelve el RPE de la sesión. Cada página tenía el suyo, así que lo
  // decide quien llama para no cambiar sus números al migrar.
  rpe?: (s: SesionAtribuible) => number
  // Aplicar el sobrecoste de concatenación (solo cuando la sesión trae transiciones).
  concatenacion?: boolean
  // Factor de concatenación individualizado del atleta (lib/sicat-brick). Devuelve
  // null si no lo ha aprendido → se cae al de B1-04.
  factorPar?: (de: string, a: string) => number | null
  // Usar el RPE que el atleta reportó de cada bloque, cuando exista. Por defecto NO:
  // hay páginas (CargaPorDisciplina) que quieren a propósito el RPE planificado, y
  // encenderlo a todas movería sus números. Lo activan las que reparten la UA de un
  // brick entre sus deportes, donde el RPE por bloque es justo lo que hace falta.
  usarRpeDeBloque?: boolean
  // Si la sesión no tiene duración manual, estimarla desde sus tareas. Las páginas
  // de carga NO lo hacían (una sesión sin duración pesaba 0); false conserva eso.
  estimar?: boolean
}

const rpePorDefecto = (s: SesionAtribuible) => s.rpe_reportado || s.rpe_estimado || 5

// Reparte los minutos de la sesión entre sus tareas según la duración estimada
// de cada una. Si ninguna es estimable, reparto a partes iguales.
function pesos(tareas: TareaAtribuible[], tests: TestsDeportista): number[] {
  const seg = tareas.map(t => calcularDuracionEstimada([t], tests).segundos)
  const suma = seg.reduce((a, b) => a + b, 0)
  if (suma > 0) return seg.map(s => s / suma)
  return tareas.map(() => 1 / tareas.length)
}

export function expandirEnBloques(
  sesiones: SesionAtribuible[],
  tareas: TareaAtribuible[],
  opts: OpcionesAtribucion = {},
): Bloque[] {
  const tests = opts.tests || {}
  const resolverRpe = opts.rpe || rpePorDefecto
  const concatenacion = opts.concatenacion !== false

  const porSesion: Record<number, TareaAtribuible[]> = {}
  tareas.forEach(t => {
    if (!porSesion[t.id_sesion]) porSesion[t.id_sesion] = []
    porSesion[t.id_sesion].push(t)
  })

  const out: Bloque[] = []

  for (const s of sesiones) {
    const rpe = resolverRpe(s)
    const tar = (porSesion[s.id] || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0))

    // Sin tareas: la sesión es su propio bloque (lo que la app hace hoy).
    if (!tar.length) {
      const minutos = s.duracion_minutos || 0
      if (minutos <= 0 && !s.disciplina) continue
      out.push({
        id_sesion: s.id, fecha: s.fecha_sesion, disciplina: s.disciplina || 'Otra',
        minutos, rpe, ua: rpe * minutos, zona: null, orden: 1,
        trasTransicion: false, esBrick: false,
      })
      continue
    }

    // Minutos de la sesión: el manual manda; si no, la estimación del conjunto
    // (con todas las tareas a la vez, como lib/duracion-carga).
    const minutosSesion = opts.estimar === false
      ? (s.duracion_minutos || 0)
      : (minutosEfectivos(s.duracion_minutos, calcularDuracionEstimada(tar, tests)) || 0)

    const deportes = new Set(tar.map(t => t.disciplina || s.disciplina || 'Otra'))
    const esBrick = deportes.size > 1

    const reparto = pesos(tar, tests)
    const trans = concatenacion ? (s.transiciones || []) : []

    tar.forEach((t, i) => {
      const orden = t.orden || i + 1
      const disciplina = t.disciplina || s.disciplina || 'Otra'
      // Hay transición inmediatamente antes de este bloque?
      const previo = tar[i - 1]
      const trasTransicion = i > 0 && trans.some(x => x.despues_de === (previo?.orden ?? orden - 1))

      // El RPE del bloque manda sobre el de la sesión: es lo que el atleta dijo de ESE esfuerzo.
      const medido = opts.usarRpeDeBloque ? (t.rpe_reportado ?? null) : null
      const rpeBloque = medido ?? rpe

      // El sobrecoste de concatenación es una PREDICCIÓN. Si el atleta ya reportó el
      // RPE de este bloque, ese número YA lleva dentro lo que le costó correr después
      // de la bici: aplicarle además el factor sería contarlo dos veces.
      const de = previo?.disciplina || s.disciplina
      const factor = trasTransicion && medido == null
        ? (opts.factorPar?.(de || '', disciplina) ?? factorConcatenacion(de, disciplina))
        : 1

      const minutos = minutosSesion * reparto[i]
      out.push({
        id_sesion: s.id,
        fecha: s.fecha_sesion,
        disciplina,
        // El tiempo NO se infla: la transición encarece el bloque, no lo alarga.
        minutos,
        rpe: rpeBloque,
        ua: rpeBloque * minutos * factor,
        zona: t.zona_entrenamiento || null,
        orden,
        trasTransicion,
        esBrick,
      })
    })
  }

  return out
}

// Carga de Supabase las tareas (y sus parámetros) de unas sesiones y las expande
// en bloques. Un solo viaje por tabla para todas las sesiones.
export async function cargarBloques(
  supabase: any,
  sesiones: SesionAtribuible[],
  opts: OpcionesAtribucion = {},
): Promise<Bloque[]> {
  const ids = sesiones.map(s => s.id)
  if (!ids.length) return []

  const { data: tareas } = await supabase
    .from('tarea')
    .select('id, id_sesion, orden, series, disciplina, zona_entrenamiento, descanso_segundos, rpe_reportado')
    .in('id_sesion', ids)
  const tareaIds = (tareas || []).map((t: any) => t.id)

  const [dists, durs, ejs] = tareaIds.length
    ? await Promise.all([
        supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds),
        supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds),
        supabase.from('ejercicios').select('id_tarea, repeticiones').in('id_tarea', tareaIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const enriquecidas: TareaAtribuible[] = (tareas || []).map((t: any) => ({
    id: t.id,
    id_sesion: t.id_sesion,
    orden: t.orden,
    disciplina: t.disciplina,
    series: t.series,
    descanso_segundos: t.descanso_segundos,
    zona_entrenamiento: t.zona_entrenamiento,
    rpe_reportado: t.rpe_reportado,
    p_distancia: (dists.data || []).filter((d: any) => d.id_tarea === t.id),
    p_duracion: (durs.data || []).filter((d: any) => d.id_tarea === t.id),
    ejercicios: (ejs.data || []).filter((e: any) => e.id_tarea === t.id),
  }))

  return expandirEnBloques(sesiones, enriquecidas, opts)
}

// Agrupa bloques por disciplina → minutos y UA totales.
export function porDisciplina(bloques: Bloque[]): Record<string, { minutos: number; ua: number; n: number }> {
  const out: Record<string, { minutos: number; ua: number; n: number }> = {}
  bloques.forEach(b => {
    if (!out[b.disciplina]) out[b.disciplina] = { minutos: 0, ua: 0, n: 0 }
    out[b.disciplina].minutos += b.minutos
    out[b.disciplina].ua += b.ua
    out[b.disciplina].n++
  })
  return out
}
