// ============================================================
// TRIPULSE — El atleta apunta su propia sesión de fuerza
// ============================================================
//
// Hasta ahora un atleta podía añadirse una sesión, pero solo la CABECERA:
// disciplina, día, duración, RPE y una nota. Podía decir «hice fuerza 50
// minutos» y nada más — ni qué ejercicios, ni con cuánto peso. Y sin eso no hay
// progresión que mirar: el «la última vez hiciste 80×8» solo funcionaba con lo
// que le prescribía el entrenador.
//
// Esto lo cierra: el atleta elige el ejercicio y apunta sus series, y lo que se
// guarda son filas NORMALES —`sesion`, `tarea`, `ejercicios`,
// `series_realizadas`— exactamente iguales a las que deja la pantalla de
// ejecución. Por eso su registro alimenta el histórico igual, y la próxima vez
// que haga ese ejercicio, le venga de donde le venga, verá lo de hoy.
//
// SE APUNTA MIENTRAS SE HACE, no se planifica y luego se ejecuta. Por eso la
// sesión nace ya como Realizada y no hay «planificado vs real»: lo que escribe
// es lo que hizo.

import { volumenDe } from './modo-mejora'

export interface SerieRegistro {
  peso: string
  reps: string
  tiempo: string
  control: string
}

export interface EjercicioRegistro {
  /** El id de la biblioteca, para poder resolver el vídeo en vivo. */
  ejercicioId: number | null
  nombre: string
  grupoMuscular: string | null
  /** Los de plancha y similares se miden en segundos, no en repeticiones. */
  porTiempo: boolean
  series: SerieRegistro[]
}

export const SERIE_VACIA: SerieRegistro = { peso: '', reps: '', tiempo: '', control: '' }

/** ¿Esta serie dice algo? Una fila en blanco no es una serie que se hizo. */
export function serieTieneAlgo(s: SerieRegistro, porTiempo = false): boolean {
  if (porTiempo) return !!(s?.tiempo || '').trim() || !!(s?.peso || '').trim()
  return !!(s?.reps || '').trim() || !!(s?.peso || '').trim()
}

/**
 * Las series que de verdad se hicieron, RENUMERADAS de 1 en adelante.
 *
 * Si dejó la segunda en blanco y rellenó la tercera, lo que hizo son dos series,
 * no «la 1 y la 3». Esto es un registro de lo que pasó, no un hueco en un plan.
 */
export function seriesConDatos(ej: EjercicioRegistro): SerieRegistro[] {
  return (ej?.series || []).filter(s => serieTieneAlgo(s, ej.porTiempo))
}

/** ¿Hay algo que guardar en este ejercicio? */
export function ejercicioCuenta(ej: EjercicioRegistro): boolean {
  return !!ej?.nombre && seriesConDatos(ej).length > 0
}

/** Los ejercicios que se van a guardar. El resto se descarta sin avisar: son huecos. */
export function ejerciciosQueCuentan(ejs: EjercicioRegistro[] | null | undefined): EjercicioRegistro[] {
  return (ejs || []).filter(ejercicioCuenta)
}

const n = (v: string) => {
  const x = Number((v || '').trim())
  return Number.isFinite(x) && (v || '').trim() !== '' ? x : null
}

/** La fila de `tarea`: una por ejercicio, como hace el entrenador al prescribir. */
export function tareaDe(ej: EjercicioRegistro, idSesion: number, orden: number) {
  return {
    id_sesion: idSesion,
    disciplina: 'Fuerza',
    orden,
    series: seriesConDatos(ej).length,
  }
}

/**
 * La fila de `ejercicios`.
 *
 * `series`, `repeticiones` e `intensidad` se rellenan con lo que HIZO, porque
 * aquí no hay prescripción de la que salgan: nadie le mandó esto. Se coge la
 * primera serie como referencia, que es la que suele marcar el ejercicio.
 */
export function ejercicioDe(ej: EjercicioRegistro, idTarea: number) {
  const series = seriesConDatos(ej)
  const primera = series[0]
  return {
    id_tarea: idTarea,
    nombre: ej.nombre,
    ejercicio_id: ej.ejercicioId ?? null,
    grupo_muscular: ej.grupoMuscular || null,
    series: series.length,
    repeticiones: ej.porTiempo ? null : n(primera?.reps || ''),
    intensidad: n(primera?.peso || ''),
    control_tipo: series.some(s => n(s.control) != null) ? 'rir' : null,
    tipo_serie: 'Normal',
  }
}

/**
 * Las filas de `series_realizadas`.
 *
 * `control_tipo` va también en cada serie y no solo en el ejercicio: si mañana
 * cambia la forma de anotar, estos registros seguirán diciendo la verdad sobre
 * en qué escala se apuntaron. Es el mismo criterio que en la ejecución.
 */
export function seriesDe(ej: EjercicioRegistro, idEjercicio: number) {
  return seriesConDatos(ej).map((s, i) => ({
    id_ejercicio: idEjercicio,
    numero_serie: i + 1,
    peso_real: n(s.peso),
    repeticiones_reales: ej.porTiempo ? null : n(s.reps),
    tiempo_real: ej.porTiempo ? n(s.tiempo) : null,
    control_real: n(s.control),
    control_tipo: n(s.control) != null ? 'rir' : null,
    completada: true,
    ejercicio_numero: 1,
  }))
}

/** El volumen de hoy en un ejercicio, con la misma cuenta que el modo mejora. */
export function volumenHoy(ej: EjercicioRegistro): number {
  return volumenDe(
    seriesConDatos(ej).map(s => ({
      peso_real: s.peso, repeticiones_reales: s.reps, tiempo_real: s.tiempo, ejercicio_numero: 1,
    })),
    ej.porTiempo,
  )
}

/** «3 ejercicios · 9 series» para el botón de guardar. */
export function resumenRegistro(ejs: EjercicioRegistro[] | null | undefined): string {
  const cuentan = ejerciciosQueCuentan(ejs)
  const series = cuentan.reduce((a, e) => a + seriesConDatos(e).length, 0)
  if (!cuentan.length) return 'Nada que guardar todavía'
  return cuentan.length + (cuentan.length === 1 ? ' ejercicio' : ' ejercicios')
    + ' · ' + series + (series === 1 ? ' serie' : ' series')
}

export interface ResultadoRegistro {
  idSesion: number | null
  guardados: number
  error: string | null
}

/**
 * Lo escribe todo.
 *
 * Va en cascada porque cada nivel necesita el id del anterior, pero las series
 * de todos los ejercicios se escriben DE UNA VEZ al final: cuatro ejercicios de
 * cuatro series eran dieciséis viajes seguidos en la pantalla de ejecución hasta
 * que se juntaron, y aquí no vamos a repetir el error.
 *
 * Si algo falla a mitad se borra la sesión entera. Media sesión guardada es peor
 * que ninguna: contaría como entrenamiento en la carga con la mitad del trabajo.
 */
export async function guardarRegistroFuerza(
  sb: any,
  opciones: {
    idDeportista: number
    fecha: string
    idMicrociclo: number | null
    duracionMinutos: number | null
    rpe: number | null
    notas: string | null
    ejercicios: EjercicioRegistro[]
  },
): Promise<ResultadoRegistro> {
  const { idDeportista, fecha, idMicrociclo, duracionMinutos, rpe, notas, ejercicios } = opciones
  const cuentan = ejerciciosQueCuentan(ejercicios)
  if (!fecha) return { idSesion: null, guardados: 0, error: 'Falta el día.' }
  if (!cuentan.length) return { idSesion: null, guardados: 0, error: 'Añade al menos un ejercicio con sus series.' }

  const { data: ses, error: eS } = await sb.from('sesion').insert({
    id_deportista: idDeportista,
    id_microciclo: idMicrociclo,
    origen: 'deportista',
    disciplina: 'Fuerza',
    fecha_sesion: fecha,
    estado: 'Realizada',
    duracion_minutos: duracionMinutos,
    rpe_reportado: rpe,
    notas_entrenador: notas || null,
  }).select('id').single()

  if (eS || !ses) return { idSesion: null, guardados: 0, error: eS?.message || 'No se pudo crear la sesión.' }

  const deshacer = async (msg: string): Promise<ResultadoRegistro> => {
    await sb.from('sesion').delete().eq('id', ses.id)
    return { idSesion: null, guardados: 0, error: msg }
  }

  const filasSeries: any[] = []
  let orden = 1
  for (const ej of cuentan) {
    const { data: tarea, error: eT } = await sb.from('tarea').insert(tareaDe(ej, ses.id, orden++)).select('id').single()
    if (eT || !tarea) return deshacer(eT?.message || 'No se pudo guardar un ejercicio.')

    const { data: fila, error: eE } = await sb.from('ejercicios').insert(ejercicioDe(ej, tarea.id)).select('id').single()
    if (eE || !fila) return deshacer(eE?.message || 'No se pudo guardar un ejercicio.')

    filasSeries.push(...seriesDe(ej, fila.id))
  }

  if (filasSeries.length) {
    const { error: eSer } = await sb.from('series_realizadas').insert(filasSeries)
    if (eSer) return deshacer(eSer.message || 'No se pudieron guardar las series.')
  }

  return { idSesion: ses.id, guardados: cuentan.length, error: null }
}
