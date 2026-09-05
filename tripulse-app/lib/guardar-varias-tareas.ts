// ============================================================
// TRIPULSE — Guardar de una vez todas las filas de la tabla de tareas
// ============================================================
//
// EL PROBLEMA. La tabla de tareas deja añadir filas de golpe («+ Añadir»), pero
// guardarlas hay que hacerlo una por una: cinco ejercicios son cinco botones, y
// cada uno recarga la sesión entera antes de dejarte pulsar el siguiente. Montar
// una sesión de fuerza es sobre todo esperar.
//
// QUÉ HACE ESTO. Recorre las filas EN ORDEN y las escribe una detrás de otra.
// El botón de cada fila se queda donde está: quien quiera guardar solo una,
// guarda solo una.
//
// NO ES UNA TRANSACCIÓN, Y NO SE FINGE QUE LO SEA. Supabase desde el navegador
// no las tiene: si la tercera falla, las dos primeras ya están escritas. Así que
// se devuelve el parte —cuáles entraron y cuáles no, con su motivo— y las que
// fallaron SE QUEDAN EN PANTALLA para reintentarlas. Decir «se han guardado 5»
// cuando entraron 3 sería el peor final posible: el entrenador cierra la sesión
// creyendo que está montada.
//
// EN ORDEN Y NO A LA VEZ, a propósito. El orden de las tareas dentro de la
// sesión es el orden en que se escriben, y una sesión de fuerza no se hace en
// cualquier orden. Lanzarlas en paralelo iría más rápido y llegarían barajadas.

import type { FilaFuerza, FilaResistencia } from './copiar-tarea'

/**
 * Si una fila se puede guardar.
 *
 * - `lista` — se escribe.
 * - `incompleta` — le falta lo imprescindible. NO se escribe, pero se cuenta y
 *   se dice: callarla es cómo el entrenador acaba creyendo que guardó cinco.
 * - `vacia` — se pulsó «+ Añadir» y no se tocó. Se salta sin ruido.
 */
export type Estado = 'lista' | 'incompleta' | 'vacia'

const algo = (...vs: (string | undefined)[]) => vs.some(v => !!(v || '').trim())

/**
 * Una fila de fuerza necesita ejercicio.
 *
 * Salvo que edite una tarea que ya existe: las que vienen de plantilla o del
 * planificador llevan el ejercicio en el comentario y no tienen fila propia en
 * `ejercicios`. Exigírselo dejaría sin poder guardar algo que ya se podía.
 */
export function estadoFuerza(f: FilaFuerza): Estado {
  if (f.ejercicioSelId || f.idTarea) return 'lista'
  return algo(f.grupoMuscularSel, f.series, f.repsFuerza, f.kgFuerza, f.rir,
    f.descanso, f.comentario, f.ejercicioSelId2, f.escalonDrop, f.zonaFuerzaTarea)
    ? 'incompleta' : 'vacia'
}

/**
 * Una fila de resistencia solo tiene un requisito duro: si es técnica, el drill.
 *
 * Zona y disciplina NO cuentan como «tocada»: la fila nace con las de la sesión
 * puestas, así que mirarlas daría por rellenada una fila en la que nadie escribió.
 */
export function estadoResistencia(f: FilaResistencia): Estado {
  if (f.esTecnica && !f.tecnicaId) return 'incompleta'
  if (f.idTarea) return 'lista'
  /* Elegir el drill ES el contenido de una fila de técnica: un drill sin metros
     ni minutos es una prescripción entera y legítima. */
  return algo(f.tecnicaId, f.valorMedicion, f.series, f.descanso, f.comentario, f.intensidadPersonalizada)
    ? 'lista' : 'vacia'
}

export interface Fallo<T> { i: number; fila: T; error: string }

export interface Parte<T> {
  /** Índices de las filas que entraron, para quitarlas de la pantalla. */
  guardadas: number[]
  fallidas: Fallo<T>[]
  /** Índices de las que les faltaba algo. Se quedan. */
  incompletas: number[]
  /** Índices de las filas en blanco. Se quedan, sin avisar de nada. */
  vacias: number[]
}

/** Cuántas guardaría el botón ahora mismo. Es el número que lleva escrito. */
export function cuantasListas<T>(filas: T[], estado: (f: T) => Estado): number {
  return (filas || []).filter(f => estado(f) === 'lista').length
}

/**
 * Escribe las filas listas, una detrás de otra.
 *
 * EL ORDEN ARRANCA DESPUÉS DE LAS TAREAS QUE YA TIENE LA SESIÓN. Volver a
 * empezar en 1 dejaría dos tareas peleándose por el mismo puesto, y las dos
 * vistas las pintarían en un orden distinto cada una (ver lib/tareas-orden).
 *
 * El contador solo avanza cuando se CREA algo: una fila que edita una tarea que
 * ya existe conserva su sitio y no gasta número.
 */
export async function guardarEnOrden<T>(
  filas: T[],
  yaHay: number,
  estado: (f: T) => Estado,
  escribir: (fila: T, orden: number) => Promise<{ error?: string; creada?: boolean }>,
): Promise<Parte<T>> {
  const parte: Parte<T> = { guardadas: [], fallidas: [], incompletas: [], vacias: [] }
  let orden = (yaHay || 0) + 1

  for (let i = 0; i < (filas || []).length; i++) {
    const fila = filas[i]
    const e = estado(fila)
    if (e === 'vacia') { parte.vacias.push(i); continue }
    if (e === 'incompleta') { parte.incompletas.push(i); continue }

    let r: { error?: string; creada?: boolean }
    try {
      r = await escribir(fila, orden)
    } catch (err: any) {
      r = { error: err?.message || 'Error inesperado' }
    }

    if (r?.error) parte.fallidas.push({ i, fila, error: r.error })
    else { parte.guardadas.push(i); if (r?.creada !== false) orden++ }
  }
  return parte
}

/** Lo que sigue en pantalla: todo menos lo que llegó a la base. */
export function sinGuardar<T>(filas: T[], parte: Parte<T>): T[] {
  const fuera = new Set(parte.guardadas)
  return (filas || []).filter((_, i) => !fuera.has(i))
}

/**
 * Las filas que entraron, como objetos.
 *
 * SE QUITAN POR IDENTIDAD, NO POR POSICIÓN. Mientras se guarda, la pantalla
 * sigue viva: si se borra una fila a mitad del lote, los índices se corren y
 * quitar «la 2» borraría el trabajo de otra que nadie llegó a guardar. Por
 * identidad, lo peor que puede pasar es que una fila ya guardada se quede a la
 * vista —se ve y se borra— en vez de perderse en silencio lo que no lo estaba.
 */
export function filasGuardadas<T>(filas: T[], parte: Parte<T>): T[] {
  return parte.guardadas.map(i => filas[i]).filter(f => f !== undefined)
}

/**
 * La frase que ve el entrenador.
 *
 * Las filas vacías no se mencionan: saltarlas es lo que esperaba. Lo que falló
 * y lo que estaba a medias sí, siempre.
 */
export function textoParte<T>(p: Parte<T>): string {
  const n = p.guardadas.length
  const partes = [n === 1 ? '1 tarea guardada' : n + ' tareas guardadas']

  if (p.incompletas.length) {
    partes.push(p.incompletas.length === 1
      ? '1 fila sin terminar, ahí sigue'
      : p.incompletas.length + ' filas sin terminar, ahí siguen')
  }
  if (p.fallidas.length) {
    partes.push((p.fallidas.length === 1 ? '1 no se pudo guardar' : p.fallidas.length + ' no se pudieron guardar')
      + ': ' + p.fallidas[0].error)
  }
  return partes.join(' · ')
}

/** Si hace falta enseñar el parte o basta con que las filas desaparezcan. */
export function hayQueContarlo<T>(p: Parte<T>): boolean {
  return p.fallidas.length > 0 || p.incompletas.length > 0
}
