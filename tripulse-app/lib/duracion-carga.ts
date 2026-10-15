// Carga en lote de la duración estimada de varias sesiones.
// Reúne tareas + parámetros (distancia/duración/ejercicios) de todas las
// sesiones de una vez y calcula la estimación de cada una con el helper puro.

import {
  calcularDuracionEstimada,
  type TestsDeportista, type ResultadoDuracion, type OpcionesDuracion,
} from './duracion'
import { SELECT_EJERCICIOS_CONTEO } from './cardio-fuerza'

export async function estimarDuraciones(
  supabase: any,
  sesionIds: number[],
  /**
   * Los tests del deportista, o una función que los da por sesión.
   *
   * La forma de función existe para las pantallas que miran a VARIOS atletas a
   * la vez (la entrada del panel): las consultas de aquí abajo no dependen del
   * deportista, así que se piden una vez para todas las sesiones y cada una se
   * calcula con los tests de su dueño. Sin esto habría que llamar a esta función
   * una vez por atleta —cuatro viajes por cabeza— o, peor, estimar distinto en
   * la entrada que en el panel.
   */
  tests: TestsDeportista | ((sesionId: number) => TestsDeportista),
  /** Ver `OpcionesDuracion`. Apagado por defecto: se enciende donde se ha revisado. */
  opciones: OpcionesDuracion = {},
): Promise<Record<number, ResultadoDuracion>> {
  if (!sesionIds.length) return {}

  const { data: tareas } = await supabase
    .from('tarea')
    .select('id, id_sesion, series, disciplina, zona_entrenamiento, zona_copia, descanso_segundos, bloques, descanso_bloques_segundos, formato, formato_config')
    .in('id_sesion', sesionIds)
  const tareaIds = (tareas || []).map((t: any) => t.id)

  /* Las tres a la vez: ninguna necesita a otra, y en fila eran dos esperas de
     más en cada pantalla que enseña una duración estimada. */
  const nada = Promise.resolve({ data: [] })
  const [{ data: dists }, { data: durs }, { data: ejs }] = await Promise.all([
    tareaIds.length ? supabase.from('p_distancia').select('id_tarea, metros_planeados').in('id_tarea', tareaIds) : nada,
    tareaIds.length ? supabase.from('p_duracion').select('id_tarea, tiempo_planeado').in('id_tarea', tareaIds) : nada,
    tareaIds.length ? supabase.from('ejercicios').select(SELECT_EJERCICIOS_CONTEO).in('id_tarea', tareaIds) : nada,
  ])

  return duracionesDe(sesionIds, tareas, dists, durs, ejs, tests, opciones)
}

/**
 * Las tareas DENTRO de una consulta de sesiones, con todo lo que hace falta
 * para estimar cuánto duran: `.select('id, fecha_sesion, ' + TAREAS_PARA_DURACION)`.
 *
 * Es lo mismo que pide `estimarDuraciones` (un test lo comprueba), pero en la
 * misma ronda que las sesiones en vez de en dos más detrás. Una sola lista para
 * todas las pantallas que lo usan: si cada una escribiera la suya, la primera
 * columna nueva se le olvidaría a alguna.
 */
export const TAREAS_PARA_DURACION =
  'tarea(id, id_sesion, orden, series, disciplina, zona_entrenamiento, zona_copia, descanso_segundos, bloques, descanso_bloques_segundos, formato, formato_config, '
  + 'p_distancia(id_tarea, metros_planeados), p_duracion(id_tarea, tiempo_planeado), ejercicios(' + SELECT_EJERCICIOS_CONTEO + '))'

const comoLista = (x: unknown): any[] => Array.isArray(x) ? x : x ? [x] : []

/** Las tareas de unas sesiones que las traen dentro (TAREAS_PARA_DURACION), en su orden. */
export function tareasAnidadas(sesiones: { tarea?: unknown }[] | null | undefined): any[] {
  return (sesiones || []).flatMap(s => comoLista(s?.tarea)
    .slice().sort((a: any, b: any) => (a.orden ?? Infinity) - (b.orden ?? Infinity) || Number(a.id) - Number(b.id)))
}

/** `duracionesDe` para sesiones que traen sus tareas dentro (TAREAS_PARA_DURACION). */
export function duracionesDeAnidadas(
  sesiones: { id: number; tarea?: unknown }[] | null | undefined,
  tests: TestsDeportista | ((sesionId: number) => TestsDeportista),
  opciones: OpcionesDuracion = {},
): Record<number, ResultadoDuracion> {
  const tareas = tareasAnidadas(sesiones)
  const hijas = (k: string) => tareas.flatMap(t => comoLista(t[k]))
  return duracionesDe((sesiones || []).map(s => s.id), tareas, hijas('p_distancia'), hijas('p_duracion'), hijas('ejercicios'), tests, opciones)
}

/**
 * La cuenta de `estimarDuraciones`, sin consultas: para quien ya trae las
 * tareas y sus parámetros en otra consulta y no quiere pedirlos dos veces.
 */
export function duracionesDe(
  sesionIds: number[],
  tareas: any[] | null | undefined,
  dists: any[] | null | undefined,
  durs: any[] | null | undefined,
  ejs: any[] | null | undefined,
  tests: TestsDeportista | ((sesionId: number) => TestsDeportista),
  opciones: OpcionesDuracion = {},
): Record<number, ResultadoDuracion> {
  const out: Record<number, ResultadoDuracion> = {}
  for (const sid of sesionIds) {
    const tarSes = (tareas || []).filter((t: any) => t.id_sesion === sid)
    const tareasDur = tarSes.map((t: any) => ({
      disciplina: t.disciplina,
      series: t.series,
      descanso_segundos: t.descanso_segundos,
      bloques: t.bloques,
      descanso_bloques_segundos: t.descanso_bloques_segundos,
      /* Sin el formato, un AMRAP 12′ contaría cero minutos. */
      formato: t.formato,
      formato_config: t.formato_config,
      zona_entrenamiento: t.zona_entrenamiento,
      /* Se pedía y no se pasaba: una zona propia se cronometraba con el ritmo
         de la zona del catálogo que se llamase igual. */
      zona_copia: t.zona_copia,
      p_distancia: (dists || []).filter((d: any) => d.id_tarea === t.id),
      p_duracion: (durs || []).filter((d: any) => d.id_tarea === t.id),
      ejercicios: (ejs || []).filter((e: any) => e.id_tarea === t.id),
    }))
    out[sid] = calcularDuracionEstimada(
      tareasDur, typeof tests === 'function' ? tests(sid) : tests, opciones)
  }
  return out
}

// Sesión, para lo mínimo que necesitan los helpers de abajo.
type SesionDur = { duracion_real?: number | null; duracion_minutos?: number | null }

// Minutos efectivos de una sesión: lo cronometrado si existe, si no lo manual, si
// no la estimación. Devuelve null cuando no hay ninguna de las tres.
//
// Toma la SESIÓN entera y no solo `duracion_minutos` a propósito: antes recibía el
// número suelto, así que `duracion_real` no lo miraba nadie y una sesión cerrada
// con el cronómetro seguía contando por lo PLANIFICADO. Misma prioridad que
// minutosCarga (del que solo se diferencia en devolver null en vez de 0), para que
// no haya dos respuestas distintas a "cuánto duró esto".
export function minutosEfectivos(
  sesion: SesionDur | null | undefined,
  est: ResultadoDuracion | undefined,
): number | null {
  if (sesion?.duracion_real && sesion.duracion_real > 0) return sesion.duracion_real
  if (sesion?.duracion_minutos && sesion.duracion_minutos > 0) return sesion.duracion_minutos
  if (est?.estimable && est.minutos > 0) return est.minutos
  return null
}

// ------------------------------------------------------------
// Minutos de una sesión PARA CALCULAR CARGA
// ------------------------------------------------------------
// Única fuente de verdad de "cuánto duró esto" en los motores de carga y volumen.
// Existe porque cada módulo leía `sesion.duracion_minutos` a pelo, y eso tiene dos
// agujeros silenciosos:
//   · una sesión sin duración manual valía 0 UA → no sumaba a CTL/ATL/TSB/ACWR
//     aunque tuviera 3,6 km de natación planificados;
//   · `duracion_real` (lo que el atleta cronometró) no lo miraba nadie.
//
// Prioridad: lo que PASÓ > lo que se planificó a mano > lo que estimamos.
// La estimación es opcional: los módulos que no cargan tareas simplemente no la
// pasan y se quedan con las dos primeras.
export function minutosCarga(
  sesion: { duracion_real?: number | null; duracion_minutos?: number | null } | null | undefined,
  est?: ResultadoDuracion,
): number {
  if (!sesion) return 0
  if (sesion.duracion_real && sesion.duracion_real > 0) return sesion.duracion_real
  if (sesion.duracion_minutos && sesion.duracion_minutos > 0) return sesion.duracion_minutos
  if (est?.estimable && est.minutos > 0) return est.minutos
  return 0
}

// De dónde salieron esos minutos, para poder decírselo al entrenador en vez de
// enseñar un número sin procedencia.
export function origenMinutos(
  sesion: { duracion_real?: number | null; duracion_minutos?: number | null } | null | undefined,
  est?: ResultadoDuracion,
): 'real' | 'manual' | 'estimada' | null {
  if (!sesion) return null
  if (sesion.duracion_real && sesion.duracion_real > 0) return 'real'
  if (sesion.duracion_minutos && sesion.duracion_minutos > 0) return 'manual'
  if (est?.estimable && est.minutos > 0) return 'estimada'
  return null
}

// Texto para mostrar: '50 min' (medido o manual), '~45 min' (estimada) o '—'.
// La tilde sigue significando "esto es una estimación nuestra"; lo cronometrado y
// lo que puso el entrenador a mano son igual de reales y van sin ella.
export function duracionSesionTexto(
  sesion: SesionDur | null | undefined,
  est: ResultadoDuracion | undefined,
): string {
  const min = minutosEfectivos(sesion, est)
  if (min === null) return '—'
  const estimada = !sesion?.duracion_real && !sesion?.duracion_minutos
  return (estimada ? '~' : '') + min + ' min'
}

// ------------------------------------------------------------
// Carga de una sesión, en unidades arbitrarias (UA)
// ------------------------------------------------------------
// UA = RPE × minutos. La fórmula es de una línea, y por eso estaba copiada en
// el panel de métricas, en la pantalla de carga, en la ficha del deportista y en
// el lienzo de periodización. Tres decían lo mismo; la del lienzo NO:
//
//   (rpe_estimado || 0) * (duracion_minutos || 0)
//
// Con ese || 0 doble, una sesión sin RPE escrito y sin duración manual valía
// CERO — y como casi ninguna lleva duración a mano, la capa «Programado» del
// dibujo salía a 0 teniendo 18 sesiones en el calendario. No fallaba nada: el
// número simplemente mentía.
//
// El 5 por defecto no es un invento de aquí: es el que ya usaban las otras tres.

const RPE_POR_DEFECTO = 5

type SesionCarga = {
  duracion_real?: number | null
  duracion_minutos?: number | null
  rpe_estimado?: number | null
  rpe_reportado?: number | null
}

/**
 * Los minutos que se MANDARON: los de a mano si los hay, y si no la estimación.
 *
 * NO MIRA `duracion_real`, Y ESA ES TODA LA GRACIA. `minutosCarga` sí la mira,
 * porque para saber lo que costó una sesión lo que manda es lo que pasó. Pero
 * para saber lo que se PIDIÓ, lo que pasó es justo lo que sobra.
 */
export function minutosPlanificados(
  sesion: { duracion_minutos?: number | null } | null | undefined,
  est?: ResultadoDuracion,
): number {
  if (!sesion) return 0
  if (sesion.duracion_minutos && sesion.duracion_minutos > 0) return sesion.duracion_minutos
  if (est?.estimable && est.minutos > 0) return est.minutos
  return 0
}

/**
 * Lo que el entrenador MANDÓ: RPE estimado × minutos planificados.
 *
 * ESTO ESTABA MAL Y HACÍA QUE LA GRÁFICA NO SE PUDIERA LEER. Evitaba el
 * `rpe_reportado` a propósito —bien— pero se quedaba con `duracion_real` a
 * través de `minutosCarga`. O sea que la capa «Programado» de una semana ya
 * entrenada era *RPE planificado × minutos reales*: ni una cosa ni la otra.
 *
 * La consecuencia se veía en el dibujo. Una semana pasada se dibujaba con lo
 * que COSTÓ y la siguiente con lo que se piensa hacer, las dos con la misma
 * barra, el mismo color y la misma escala. Un bloque podía parecer que baja de
 * carga cuando lo único que pasaba es que aún no se había entrenado.
 *
 * Un caso real: una sesión de 10 km cerrada con 158 minutos —que son 15:48 el
 * kilómetro, o sea que se dejó la pantalla abierta— inflaba la barra de
 * «Programado» de su semana como si eso se hubiera prescrito.
 *
 * Para lo que pasó de verdad está `cargaReal`, que es la capa «Realizado».
 */
export function cargaPlanificada(s: SesionCarga | null | undefined, est?: ResultadoDuracion): number {
  if (!s) return 0
  return (s.rpe_estimado || RPE_POR_DEFECTO) * minutosPlanificados(s, est)
}

/**
 * Lo que COSTÓ de verdad: el RPE que reportó el atleta si lo hay, y si no el
 * previsto. Es la que alimenta CTL/ATL/TSB.
 */
export function cargaReal(s: SesionCarga | null | undefined, est?: ResultadoDuracion): number {
  if (!s) return 0
  return (s.rpe_reportado || s.rpe_estimado || RPE_POR_DEFECTO) * minutosCarga(s, est)
}

// ------------------------------------------------------------
// Segundos → texto
// ------------------------------------------------------------
// Había CUATRO `segAMmss` repartidas, y no eran la misma función: tres siempre
// devolvían «m:ss» y la cuarta se comía el «:00» cuando los segundos eran
// exactos. Dos comportamientos bajo un nombre, que es la forma en que estos
// fallos se esconden. No se fusionan —los dos hacen falta— pero se les separa el
// nombre y la implementación vive aquí una sola vez.

/* Viven en lib/medicion, al lado de su inversa (`mmssASegundos`) y en un
   fichero que no importa NADA: así lo puede pedir hasta lib/zonas —que es quien
   escribe los ritmos— sin montar un círculo de importaciones. Se reexportan
   porque media app las pide aquí. */
export { mmss, mmssCorto } from './medicion'
