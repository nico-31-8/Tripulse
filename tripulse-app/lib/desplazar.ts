// ============================================================
// TRIPULSE — Mover sesiones y ciclos en el tiempo
// ============================================================
// Una sola operación a tres alturas: mover un microciclo arrastra sus sesiones,
// mover un mesociclo arrastra sus microciclos, y mover el macrociclo lo arrastra
// todo. Mover una sesión suelta es el caso pequeño y no necesita nada de esto.
//
// AQUÍ SOLO ESTÁ EL CÁLCULO. La escritura es la función `desplazar_ciclo` de
// supabase/desplazar-ciclo.sql, que lo hace en una transacción: 200 updates
// desde el navegador pueden fallar a la mitad, y medio plan desplazado es peor
// que uno sin desplazar.
//
// LO QUE ESTE FICHERO EXISTE PARA CONTAR
// Desplazar un plan no es una operación neutra: la competición no se mueve
// contigo. Si atrasas el plan cuatro días, tienes cuatro días MENOS de
// preparación, y esa frase tiene que estar en pantalla antes de confirmar, no
// descubrirse en noviembre.

export type NivelCiclo = 'macrociclo' | 'mesociclo' | 'microciclo'

export const ETIQUETA_NIVEL: Record<NivelCiclo, string> = {
  macrociclo: 'todo el plan',
  mesociclo: 'este mesociclo',
  microciclo: 'esta semana',
}

export interface CicloFila {
  id: number
  fecha_inicio: string
  duracion_semanas?: number | null
  objetivo?: string | null
  id_macrociclo?: number | null
  id_mesociclo?: number | null
}

export interface SesionFila {
  id: number
  fecha_sesion: string
  estado?: string | null
  disciplina?: string | null
  id_microciclo?: number | null
}

export interface CompeticionFila {
  id: number
  nombre: string
  fecha: string
}

// ------------------------------------------------------------
// Aritmética de fechas
// ------------------------------------------------------------
// Vivía aquí, en UTC sobre texto ISO, y esa decisión sigue siendo la buena: una
// fecha construida en local y vuelta a serializar puede saltar un día según el
// huso, y una sesión que se mueve un día de más no la ve nadie hasta que ya
// pasó. Lo que ha cambiado es DÓNDE vive: en lib/fechas, porque dieciséis
// ficheros más hacían esto mismo cada uno a su manera.
//
// Se siguen re-exportando desde aquí: media app las importa de este módulo y
// cambiar todos esos imports en la misma tanda sería mezclar dos cosas.
export { sumarDias, diasEntre } from './fechas'
import { sumarDias, diasEntre } from './fechas'

/** Fin (exclusivo) de un ciclo: los micros duran una semana; el resto, las suyas. */
export function finDeCiclo(c: CicloFila, nivel: NivelCiclo): string {
  const semanas = nivel === 'microciclo' ? 1 : (c.duracion_semanas || 4)
  return sumarDias(c.fecha_inicio, semanas * 7)
}

// ------------------------------------------------------------
// Qué microciclos arrastra cada nivel
// ------------------------------------------------------------
export function microsAfectados(
  nivel: NivelCiclo, id: number, mesos: CicloFila[], micros: CicloFila[],
): number[] {
  if (nivel === 'microciclo') return [id]
  if (nivel === 'mesociclo') return micros.filter(m => m.id_mesociclo === id).map(m => m.id)
  const mesoIds = new Set(mesos.filter(m => m.id_macrociclo === id).map(m => m.id))
  return micros.filter(m => m.id_mesociclo != null && mesoIds.has(m.id_mesociclo)).map(m => m.id)
}

// ------------------------------------------------------------
// La previsualización
// ------------------------------------------------------------

export interface EfectoCompeticion {
  nombre: string
  fecha: string
  /** Días entre el final del ciclo y la carrera, antes y después de mover. */
  margenAntes: number
  margenDespues: number
}

export interface Previsualizacion {
  nivel: NivelCiclo
  dias: number
  de: string
  a: string
  /** Las que se mueven. */
  sesiones: SesionFila[]
  /** Las realizadas, que se quedan donde están. */
  hechas: SesionFila[]
  micros: number
  mesos: number
  competiciones: EfectoCompeticion[]
  avisos: string[]
  /** Nada que hacer: ni un update. */
  vacio: boolean
}

export interface EntradaPrevisualizacion {
  nivel: NivelCiclo
  id: number
  /** La nueva fecha de inicio elegida. */
  nuevaFecha: string
  macros: CicloFila[]
  mesos: CicloFila[]
  micros: CicloFila[]
  sesiones: SesionFila[]
  competiciones?: CompeticionFila[]
  /** Para avisar de que el ciclo se iría al pasado. Formato ISO. */
  hoy?: string
}

export function previsualizar(e: EntradaPrevisualizacion): Previsualizacion {
  const lista = e.nivel === 'macrociclo' ? e.macros : e.nivel === 'mesociclo' ? e.mesos : e.micros
  const ciclo = lista.find(c => c.id === e.id)
  const de = ciclo?.fecha_inicio ? String(ciclo.fecha_inicio).slice(0, 10) : ''
  const a = String(e.nuevaFecha).slice(0, 10)
  const dias = de && a ? diasEntre(de, a) : 0

  const idsMicro = new Set(microsAfectados(e.nivel, e.id, e.mesos, e.micros))
  const delCiclo = e.sesiones.filter(s => s.id_microciclo != null && idsMicro.has(s.id_microciclo))
  const hechas = delCiclo.filter(s => s.estado === 'Realizada')
  const sesiones = delCiclo.filter(s => s.estado !== 'Realizada')

  const mesos = e.nivel === 'macrociclo' ? e.mesos.filter(m => m.id_macrociclo === e.id).length
    : e.nivel === 'mesociclo' ? 1 : 0

  const avisos: string[] = []
  if (!ciclo) avisos.push('No se encuentra el ciclo: recarga la página.')
  if (dias === 0) avisos.push('Ya empieza ese día. No hay nada que mover.')

  if (hechas.length) {
    avisos.push(
      hechas.length + (hechas.length === 1 ? ' sesión ya realizada se queda' : ' sesiones ya realizadas se quedan') +
      ' en su fecha: lo que se entrenó, se entrenó. Quedarán fuera de su microciclo.',
    )
  }

  if (e.hoy && dias !== 0 && diasEntre(e.hoy, a) < 0) {
    avisos.push('La nueva fecha de inicio es anterior a hoy.')
  }

  // Huecos y solapes con los hermanos. Mover un mesociclo del medio deja el plan
  // con un agujero o con dos bloques pisándose, y eso no se ve en el calendario
  // hasta que faltan semanas.
  if (ciclo && dias !== 0 && e.nivel !== 'macrociclo') {
    const padre = e.nivel === 'mesociclo' ? ciclo.id_macrociclo : ciclo.id_mesociclo
    const hermanos = (e.nivel === 'mesociclo' ? e.mesos : e.micros)
      .filter(c => c.id !== ciclo.id &&
        (e.nivel === 'mesociclo' ? c.id_macrociclo : c.id_mesociclo) === padre)

    const nuevoIni = a
    const nuevoFin = finDeCiclo({ ...ciclo, fecha_inicio: a }, e.nivel)
    hermanos.forEach(h => {
      const hIni = String(h.fecha_inicio).slice(0, 10)
      const hFin = finDeCiclo(h, e.nivel)
      if (diasEntre(nuevoIni, hFin) > 0 && diasEntre(hIni, nuevoFin) > 0) {
        avisos.push('Se solapará con «' + (h.objetivo || hIni) + '», que empieza el ' + hIni + '.')
      }
    })
    // El hueco que deja atrás. Atrasando, quedan libres los días entre donde
    // empezaba y donde empieza ahora; adelantando, los del final que ya no
    // cubre. Solo es hueco de verdad si no lo tapa un hermano.
    const huecoIni = dias > 0 ? de : nuevoFin
    const huecoFin = dias > 0 ? nuevoIni : finDeCiclo(ciclo, e.nivel)
    const tapado = hermanos.some(h => {
      const hIni = String(h.fecha_inicio).slice(0, 10)
      return diasEntre(huecoIni, finDeCiclo(h, e.nivel)) > 0 && diasEntre(hIni, huecoFin) > 0
    })
    if (!tapado) {
      const n = Math.abs(dias)
      avisos.push('Dejará ' + n + (n === 1 ? ' día' : ' días') + ' sin plan donde estaba.')
    }
  }

  // La competición no se mueve contigo. Es el aviso que de verdad importa.
  const competiciones: EfectoCompeticion[] = []
  if (ciclo && dias !== 0) {
    const finAntes = finDeCiclo(ciclo, e.nivel)
    const finDespues = finDeCiclo({ ...ciclo, fecha_inicio: a }, e.nivel)
    ;(e.competiciones || []).forEach(c => {
      const f = String(c.fecha).slice(0, 10)
      // Solo las que están por delante del ciclo: las anteriores no cambian.
      if (diasEntre(de, f) < 0) return
      competiciones.push({
        nombre: c.nombre, fecha: f,
        margenAntes: diasEntre(finAntes, f),
        margenDespues: diasEntre(finDespues, f),
      })
    })
    if (competiciones.length && dias > 0) {
      avisos.push('Las competiciones NO se mueven: pierdes ' + dias + ' días de preparación antes de cada una.')
    }
  }

  return {
    nivel: e.nivel, dias, de, a, sesiones, hechas,
    micros: idsMicro.size, mesos, competiciones, avisos,
    vacio: dias === 0 || !ciclo,
  }
}

// ------------------------------------------------------------
// Cambiar la duración de un mesociclo
// ------------------------------------------------------------
// Acortar de 4 a 3 semanas no es editar un número: hay una semana que deja de
// caber, y hay quince semanas detrás que o se mueven o dejan un agujero.

/** Qué hacer con las sesiones de la semana que ya no cabe. */
export type Sobrante = 'liberar' | 'papelera'

export const ETIQUETA_SOBRANTE: Record<Sobrante, string> = {
  liberar: 'Sacarlas del plan y dejarlas en el calendario',
  papelera: 'Mandarlas a la papelera',
}

export interface SemanaFuera {
  id: number
  fecha_inicio: string
  sesiones: SesionFila[]
}

export interface PrevisualizacionDuracion {
  antes: number
  ahora: number
  delta: number
  fuera: SemanaFuera[]
  sesionesFuera: SesionFila[]
  hechasFuera: SesionFila[]
  mesosMovidos: number
  avisos: string[]
  vacio: boolean
}

export function previsualizarDuracion(e: {
  id: number
  semanas: number
  arrastrar: boolean
  sobrante: Sobrante
  mesos: CicloFila[]
  micros: CicloFila[]
  sesiones: SesionFila[]
}): PrevisualizacionDuracion {
  const meso = e.mesos.find(m => m.id === e.id)
  const antes = meso?.duracion_semanas || 4
  const ahora = e.semanas
  const delta = ahora - antes
  const avisos: string[] = []

  if (!meso) {
    return { antes, ahora, delta: 0, fuera: [], sesionesFuera: [], hechasFuera: [], mesosMovidos: 0, vacio: true, avisos: ['No se encuentra el mesociclo: recarga la página.'] }
  }
  if (ahora < 1) avisos.push('Un mesociclo no puede durar menos de una semana.')
  if (delta === 0) avisos.push('Ya dura ' + antes + (antes === 1 ? ' semana' : ' semanas') + '. No hay nada que cambiar.')

  const ini = String(meso.fecha_inicio).slice(0, 10)
  const finNuevo = sumarDias(ini, ahora * 7)

  // Al acortar, las semanas que caen más allá del nuevo final.
  const fuera: SemanaFuera[] = e.micros
    .filter(m => m.id_mesociclo === e.id && String(m.fecha_inicio).slice(0, 10) >= finNuevo)
    .map(m => ({
      id: m.id,
      fecha_inicio: String(m.fecha_inicio).slice(0, 10),
      sesiones: e.sesiones.filter(s => s.id_microciclo === m.id),
    }))
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))

  const sesionesFuera = fuera.flatMap(f => f.sesiones)
  const hechasFuera = sesionesFuera.filter(s => s.estado === 'Realizada')

  if (fuera.length) {
    avisos.push(
      fuera.length + (fuera.length === 1 ? ' semana sale' : ' semanas salen') + ' del mesociclo, con ' +
      sesionesFuera.length + (sesionesFuera.length === 1 ? ' sesión' : ' sesiones') + ' dentro.',
    )
  }
  // Mandar a la papelera algo que el atleta YA hizo borra historia, y la carga
  // de esas semanas desaparece de las gráficas sin explicación.
  if (hechasFuera.length && e.sobrante === 'papelera') {
    avisos.push(
      'Hay ' + hechasFuera.length + (hechasFuera.length === 1 ? ' sesión ya realizada' : ' sesiones ya realizadas') +
      ' entre ellas: a la papelera desaparecen de las gráficas de carga. Mejor sacarlas del plan.',
    )
  }

  const posteriores = e.mesos.filter(m =>
    m.id !== e.id && m.id_macrociclo === meso.id_macrociclo &&
    String(m.fecha_inicio).slice(0, 10) > ini).length

  if (delta !== 0) {
    if (e.arrastrar && posteriores) {
      avisos.push(posteriores + (posteriores === 1 ? ' mesociclo posterior se mueve' : ' mesociclos posteriores se mueven') +
        ' ' + Math.abs(delta * 7) + ' días ' + (delta < 0 ? 'hacia adelante en el calendario' : 'hacia atrás') + ', con sus sesiones.')
    } else if (!e.arrastrar && posteriores) {
      avisos.push(delta < 0
        ? 'Quedará un hueco de ' + Math.abs(delta * 7) + ' días antes del siguiente mesociclo.'
        : 'Se solapará ' + delta * 7 + ' días con el siguiente mesociclo.')
    }
  }

  return {
    antes, ahora, delta, fuera, sesionesFuera, hechasFuera,
    mesosMovidos: e.arrastrar ? posteriores : 0,
    avisos, vacio: delta === 0 || ahora < 1,
  }
}

/**
 * Devuelve cuántas sesiones se han visto afectadas además del error, porque
 * quien llama a esto tiene que poder decirlo en voz alta: acortar un mesociclo
 * saca sesiones del plan, y hacerlo en silencio es la mitad del problema que
 * esta función viene a arreglar.
 */
export async function aplicarDuracion(
  sb: any, id: number, semanas: number, arrastrar: boolean, sobrante: Sobrante,
): Promise<{ error: string | null; sesiones: number }> {
  const { data, error } = await sb.rpc('redimensionar_mesociclo', {
    _id: id, _semanas: semanas, _arrastrar: arrastrar, _sobrante: sobrante,
  })
  if (!error) return { error: null, sesiones: data?.[0]?.sesiones_afectadas ?? 0 }
  if (/redimensionar_mesociclo|does not exist|PGRST202/i.test(error.message || '')) {
    return { error: 'Falta ejecutar supabase/desplazar-ciclo.sql en la base de datos.', sesiones: 0 }
  }
  return { error: error.message, sesiones: 0 }
}

/**
 * Lanza el desplazamiento. Devuelve el mensaje de error, o `null` si fue bien.
 *
 * La transacción vive en Postgres (`desplazar_ciclo`); aquí solo se llama y se
 * traduce el fallo. Si la función no existe todavía, se dice qué falta en vez de
 * soltar el error crudo de PostgREST, que no le dice nada a nadie.
 */
export async function aplicarDesplazamiento(
  sb: any, nivel: NivelCiclo, id: number, dias: number,
): Promise<string | null> {
  if (!dias) return null
  const { error } = await sb.rpc('desplazar_ciclo', { _nivel: nivel, _id: id, _dias: dias })
  if (!error) return null
  if (/function .*desplazar_ciclo|does not exist|PGRST202/i.test(error.message || '')) {
    return 'Falta ejecutar supabase/desplazar-ciclo.sql en la base de datos.'
  }
  return error.message
}
