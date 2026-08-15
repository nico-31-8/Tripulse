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
// Sobre texto ISO en UTC, igual que en lib/plan-volcado.ts: construir una fecha
// local y volver a serializarla puede saltar un día según la zona horaria, y una
// sesión que se mueve un día de más no la ve nadie hasta que ya pasó.

const dia = (iso: string) => new Date(String(iso).slice(0, 10) + 'T00:00:00Z')

export function sumarDias(iso: string, dias: number): string {
  const d = dia(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((dia(hasta).getTime() - dia(desde).getTime()) / 86400000)
}

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
