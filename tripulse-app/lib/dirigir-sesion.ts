// ============================================================
// El cronómetro del modo entrenador
// ============================================================
//
// El entrenador está a pie de pista con el atleta delante y va apuntando lo que
// pasa. El ritmo de la pantalla es el del entrenamiento: serie, descanso, serie.
//
// UN SOLO RELOJ, NO DOS. Se podría tener un cronómetro para la serie y otro
// para el descanso, y entonces habría dos relojes que parar y arrancar en el
// orden correcto — y el momento entre serie y serie es justo cuando el
// entrenador está hablando con el atleta y no mirando el móvil. Aquí hay un
// reloj y un modo: al parar una serie el reloj no se para, cambia de significado
// y pasa a contar el descanso. Al empezar la siguiente, el descanso se cierra
// solo. Nunca hay que acordarse de pulsar nada entre medias.
//
// EL ESTADO ES UN VALOR, NO TRES BANDERAS. `modo` + `indice` + `desde` dicen
// todo lo que hay que saber, y las transiciones son una función pura que se
// puede probar sin montar la pantalla ni esperar a que corra un reloj de verdad.

export type Modo = 'parado' | 'serie' | 'descanso'

export interface Serie {
  /** Milisegundos que duró la serie. null = todavía no se ha hecho. */
  ms: number | null
  /** Milisegundos de descanso DESPUÉS de esta serie. */
  descansoMs: number | null
  nota: string
}

export interface Estado {
  modo: Modo
  /** A qué serie se refiere el reloj. -1 cuando está parado del todo. */
  indice: number
  /** Instante en que arrancó lo que se está contando. */
  desde: number
  series: Serie[]
}

export const serieVacia = (): Serie => ({ ms: null, descansoMs: null, nota: '' })

export function estadoInicial(cuantas: number): Estado {
  return { modo: 'parado', indice: -1, desde: 0, series: Array.from({ length: cuantas }, serieVacia) }
}

/**
 * Lo que pasa al pulsar el botón de la serie `i`.
 *
 * Tres caminos, y el segundo es el que hace que esto se pueda usar de pie:
 *
 *   · Estás contando ESA serie  → se para y arranca su descanso.
 *   · Estás contando otra cosa  → si era un descanso, se cierra y se guarda;
 *                                 y empieza la serie `i`.
 *   · La serie ya estaba hecha  → se rehace: se borra y vuelve a empezar.
 *
 * No muta nada: devuelve un estado nuevo.
 */
export function pulsar(e: Estado, i: number, ahora: number): Estado {
  if (i < 0 || i >= e.series.length) return e
  const series = e.series.map(s => ({ ...s }))

  // Parar la serie que se estaba contando → empieza su descanso.
  if (e.modo === 'serie' && e.indice === i) {
    series[i].ms = ahora - e.desde
    return { modo: 'descanso', indice: i, desde: ahora, series }
  }

  // Se cierra el descanso que hubiera en marcha, venga de donde venga.
  if (e.modo === 'descanso' && e.indice >= 0) {
    series[e.indice].descansoMs = ahora - e.desde
  }

  /* Rehacer: si esa serie ya tenía tiempo, se limpia. También su descanso, que
     describía el hueco DESPUÉS de un tiempo que ya no existe — conservarlo
     dejaría un descanso colgando de nada. */
  if (series[i].ms != null) {
    series[i].ms = null
    series[i].descansoMs = null
  }

  return { modo: 'serie', indice: i, desde: ahora, series }
}

/** Parar del todo, cerrando lo que estuviera contando. */
export function parar(e: Estado, ahora: number): Estado {
  const series = e.series.map(s => ({ ...s }))
  if (e.modo === 'serie' && e.indice >= 0) series[e.indice].ms = ahora - e.desde
  if (e.modo === 'descanso' && e.indice >= 0) series[e.indice].descansoMs = ahora - e.desde
  return { modo: 'parado', indice: -1, desde: 0, series }
}

/** Los milisegundos que enseña el reloj de la serie `i` ahora mismo. */
export function msDeSerie(e: Estado, i: number, ahora: number): number | null {
  if (e.modo === 'serie' && e.indice === i) return ahora - e.desde
  return e.series[i]?.ms ?? null
}

/** Los milisegundos del descanso que sigue a la serie `i`. */
export function msDeDescanso(e: Estado, i: number, ahora: number): number | null {
  if (e.modo === 'descanso' && e.indice === i) return ahora - e.desde
  return e.series[i]?.descansoMs ?? null
}

/**
 * ¿Se ha pasado del descanso prescrito?
 *
 * No lo impide ni avisa con nada molesto: lo pinta distinto. Pasarse a veces es
 * la decisión correcta, y una pantalla que riñe al entrenador por decidir se
 * acaba ignorando.
 */
export function descansoPasado(ms: number | null, prescritoSeg: number | null | undefined): boolean {
  if (ms == null || !prescritoSeg) return false
  return ms / 1000 > prescritoSeg
}

// ── Formato ─────────────────────────────────────────────────
// Con una décima: en 1000 m sobra, pero en 100 de natación un segundo entero
// esconde justo la diferencia que se está buscando.

export function reloj(ms: number | null): string {
  if (ms == null) return '—:——'
  const s = ms / 1000
  const m = Math.floor(s / 60)
  const r = s % 60
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1)
}

/** El descanso se lee en segundos: las décimas ahí no dicen nada. */
export function relojCorto(ms: number | null): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m ? m + ':' + (r < 10 ? '0' : '') + r : r + ' s'
}

// ── Lo que se guarda ────────────────────────────────────────

export interface FilaSerie {
  id_tarea: number
  numero_serie: number
  tiempo_real: number | null
  descanso_real: number | null
  completada: boolean
  anotado_por: string
}

/**
 * Las filas de `series_realizadas` de una tarea de resistencia.
 *
 * Solo las series con tiempo. Una serie que no se llegó a cronometrar no es una
 * serie de cero segundos: es una serie de la que no se sabe nada, y guardarla
 * como fila haría que cualquier media posterior contara un cero que nadie hizo.
 *
 * Los segundos van redondeados porque la columna es entera. La décima sirve
 * para leerla en el momento, no para guardarla.
 */
export function filasDe(series: Serie[], idTarea: number, anotadoPor = 'entrenador'): FilaSerie[] {
  const filas: FilaSerie[] = []
  series.forEach((s, i) => {
    if (s.ms == null) return
    filas.push({
      id_tarea: idTarea,
      numero_serie: i + 1,
      tiempo_real: Math.round(s.ms / 1000),
      descanso_real: s.descansoMs != null ? Math.round(s.descansoMs / 1000) : null,
      completada: true,
      anotado_por: anotadoPor,
    })
  })
  return filas
}

/** Cuántas se han hecho ya, para el «2 de 4» de la cabecera. */
export const hechas = (series: Serie[]): number => series.filter(s => s.ms != null).length

/** Las notas que el entrenador escribió, con su número de serie delante. */
export function notasDe(series: Serie[]): string {
  return series
    .map((s, i) => (s.nota.trim() ? 'S' + (i + 1) + ': ' + s.nota.trim() : ''))
    .filter(Boolean)
    .join(' · ')
}

/**
 * Qué se pierde al salir sin guardar, en una frase. `null` = no se pierde nada.
 *
 * DOS PROBLEMAS EN UN BOTÓN, Y EL SEGUNDO ES EL GRAVE. El primero es no saber
 * si «Salir» guarda algo: entras por error, sales, y te quedas con la duda de
 * si le has metido una sesión a medias al atleta. Se arregla diciéndolo.
 *
 * El segundo es salir con trabajo dentro. Cronometras cuatro series, le das a
 * Salir pensando en «cerrar la pantalla», y desaparecen sin que nadie diga
 * nada. Eso no se arregla con un texto: hace falta pararle a uno.
 *
 * Por eso esto devuelve null cuando de verdad no hay nada — y entonces la
 * pantalla se cierra sin preguntar, que es lo que quiere quien entró por
 * error. Preguntar siempre convierte el aviso en un trámite que se pulsa sin
 * leer, y el día que sí había algo tampoco se lee.
 */
export function avisoAlSalir(series: number, notas: number, rpe: boolean): string | null {
  const partes: string[] = []
  if (series > 0) partes.push(series + (series === 1 ? ' serie cronometrada' : ' series cronometradas'))
  if (notas > 0) partes.push(notas + (notas === 1 ? ' nota' : ' notas'))
  if (rpe) partes.push('el RPE')
  if (!partes.length) return null

  const lista = partes.length > 1
    ? partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1]
    : partes[0]
  return 'Vas a salir sin guardar.\n\nSe pierde ' + lista + '.'
}

/** Cuántas notas se han escrito en un bloque. */
export const conNota = (series: Serie[]): number => series.filter(s => s.nota.trim()).length
