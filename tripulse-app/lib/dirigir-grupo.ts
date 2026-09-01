// ============================================================
// El reloj común: dirigir a un grupo
// ============================================================
//
// Salen juntos y llegan escalonados. El entrenador tiene UN reloj corriendo y va
// tocando el nombre de cada uno según entra. Eso es todo lo que se puede hacer
// bien mirando a la pista y no al móvil.
//
// CADA UNO DESCANSA DISTINTO, Y ESO ES LO QUE ESTA PANTALLA REGALA
// Si salen a la vez y entran escalonados, el primero descansa más que el último
// —hasta la salida común siguiente—. Con treinta segundos de diferencia entre
// el primero y el último, el de atrás recupera treinta segundos menos, y eso no
// es un detalle: cambia el estímulo de la serie siguiente.
//
//     descanso de cada uno = (salida siguiente − salida de esta) − su entrada
//
// Nadie lo apunta hoy. Aquí sale sin hacer nada más que tocar el nombre.
//
// LOS TIEMPOS SE GUARDAN RELATIVOS A LA SALIDA, no como instantes absolutos.
// Así el estado se puede pintar, probar y comparar sin depender de en qué
// momento del día se corrió: la entrada de Marta es «3:52 desde que salieron»,
// que es lo que significa de verdad.

export type ModoGrupo = 'parado' | 'corriendo'

export interface EstadoGrupo {
  modo: ModoGrupo
  /** Índice de la serie en marcha. */
  serie: number
  /** Instante de la salida de la serie en marcha. */
  salida: number
  /** Por atleta, su entrada en cada serie en ms desde la salida. */
  entradas: Record<number, (number | null)[]>
  /** Por atleta, su descanso tras cada serie en ms. */
  descansos: Record<number, (number | null)[]>
}

export function estadoGrupoInicial(ids: number[], nSeries: number): EstadoGrupo {
  const entradas: Record<number, (number | null)[]> = {}
  const descansos: Record<number, (number | null)[]> = {}
  for (const id of ids) {
    entradas[id] = Array(nSeries).fill(null)
    descansos[id] = Array(nSeries).fill(null)
  }
  return { modo: 'parado', serie: 0, salida: 0, entradas, descansos }
}

/** Se da la salida de la serie en curso. */
export function darSalida(e: EstadoGrupo, ahora: number): EstadoGrupo {
  return { ...e, modo: 'corriendo', salida: ahora }
}

/**
 * Entra uno: se sella su tiempo.
 *
 * Volver a tocar a alguien que ya entró lo vuelve a sellar con el tiempo de
 * ahora. Es a propósito: si te adelantaste con el dedo, lo arreglas sin salir
 * de la pantalla ni buscar un botón de deshacer.
 */
export function marcar(e: EstadoGrupo, idDeportista: number, ahora: number): EstadoGrupo {
  if (e.modo !== 'corriendo') return e
  const fila = e.entradas[idDeportista]
  if (!fila) return e
  const nuevas = { ...e.entradas, [idDeportista]: fila.map((v, i) => i === e.serie ? ahora - e.salida : v) }
  return { ...e, entradas: nuevas }
}

/** Quita la marca de alguien: no entró, o se tocó por error. */
export function desmarcar(e: EstadoGrupo, idDeportista: number): EstadoGrupo {
  const fila = e.entradas[idDeportista]
  if (!fila) return e
  return { ...e, entradas: { ...e.entradas, [idDeportista]: fila.map((v, i) => i === e.serie ? null : v) } }
}

/**
 * Salida de la serie siguiente.
 *
 * Aquí se cierra el descanso de cada uno por separado, que es la razón de ser de
 * esta pantalla. Quien no entró no tiene descanso: no se le inventa uno a partir
 * de la salida, porque no se sabe cuándo terminó — ni si terminó.
 */
export function siguienteSerie(e: EstadoGrupo, ahora: number): EstadoGrupo {
  const total = ahora - e.salida
  const descansos = { ...e.descansos }
  for (const id of Object.keys(e.entradas).map(Number)) {
    const entrada = e.entradas[id][e.serie]
    if (entrada == null) continue
    descansos[id] = e.descansos[id].map((v, i) => i === e.serie ? total - entrada : v)
  }
  return { ...e, modo: 'corriendo', serie: e.serie + 1, salida: ahora, descansos }
}

/** Parar del todo, cerrando el descanso de la serie en curso. */
export function pararGrupo(e: EstadoGrupo, ahora: number): EstadoGrupo {
  const cerrado = siguienteSerie(e, ahora)
  return { ...cerrado, modo: 'parado', serie: e.serie }
}

/** Los ms que enseña el reloj común. */
export const msComun = (e: EstadoGrupo, ahora: number): number =>
  e.modo === 'corriendo' ? ahora - e.salida : 0

/** Cuántos han entrado ya en la serie en curso. */
export function dentro(e: EstadoGrupo): number {
  return Object.values(e.entradas).filter(f => f[e.serie] != null).length
}

export interface FilaGrupo {
  id_tarea: number
  numero_serie: number
  tiempo_real: number | null
  descanso_real: number | null
  completada: boolean
  anotado_por: string
}

/**
 * Las filas de un atleta, para su propia sesión.
 *
 * Cada miembro del grupo tiene SU sesión: el entrenamiento se emite una vez pero
 * se materializa en una sesión por persona (ver lib/grupos-emision). Así que
 * aquí sale un juego de filas por atleta, cada uno contra la tarea de la suya.
 *
 * Sin entrada no hay fila. Una serie que no se marcó no es una de cero: es una
 * de la que no se sabe nada, y guardarla metería un cero en cualquier media.
 */
export function filasDeAtleta(
  e: EstadoGrupo,
  idDeportista: number,
  idTarea: number,
  anotadoPor = 'entrenador',
): FilaGrupo[] {
  const entradas = e.entradas[idDeportista] || []
  const descansos = e.descansos[idDeportista] || []
  const filas: FilaGrupo[] = []
  entradas.forEach((ms, i) => {
    if (ms == null) return
    filas.push({
      id_tarea: idTarea,
      numero_serie: i + 1,
      tiempo_real: Math.round(ms / 1000),
      descanso_real: descansos[i] != null ? Math.round((descansos[i] as number) / 1000) : null,
      completada: true,
      anotado_por: anotadoPor,
    })
  })
  return filas
}

/**
 * La diferencia entre el primero y el último de una serie.
 *
 * Es el número que le dice al entrenador si el grupo va junto o se está
 * partiendo, y no hace falta mirar siete tiempos para verlo.
 */
export function horquilla(e: EstadoGrupo, serie: number): number | null {
  const t = Object.values(e.entradas).map(f => f[serie]).filter((v): v is number => v != null)
  if (t.length < 2) return null
  return Math.max(...t) - Math.min(...t)
}

/** Cuántas marcas hay en total, contando todas las series de todos. */
export function marcasTotales(e: EstadoGrupo): number {
  return Object.values(e.entradas).reduce((a, f) => a + f.filter(v => v != null).length, 0)
}
