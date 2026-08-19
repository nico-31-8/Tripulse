// ============================================================
// TRIPULSE — Escribir la temporada calculada en la base
// ============================================================
// `plan-macrociclo` decide la forma de la temporada; esto la convierte en las
// filas que el resto de la app ya sabe leer: macrociclo → mesociclo →
// microciclo. A partir de ahí funciona todo lo demás sin enterarse de que lo
// dibujó la app y no una persona: el calendario, el lienzo, la cadena de
// semanas y el mover ciclos.
//
// OJO CON `id_deportista`. Está desnormalizado en las tres tablas desde la Fase
// A, y las políticas de RLS filtran POR ESA COLUMNA. Un mesociclo sin ella no
// es que quede feo: es que su propio dueño no lo puede leer.
import { semanasDelMesociclo } from './plan-mesociclo'
import type { Temporada } from './plan-macrociclo'
import type { DistanciaTri } from './distribucion-zonas'

export interface OpcionesTemporada {
  idDeportista: number
  temporada: Temporada
  distancia: DistanciaTri
  /** Nombre del macrociclo. El del objetivo del atleta. */
  nombre: string
  modelo?: string
}

export interface ResultadoTemporada {
  idMacrociclo: number | null
  mesos: number
  micros: number
  error: string | null
}

/**
 * Cuántos planes tiene ya el atleta.
 *
 * Se pregunta ANTES de crear porque crear el segundo no falla: simplemente
 * quedan dos macrociclos solapados y el calendario empieza a pintar semanas de
 * los dos. Eso lo decide quien pulsa, no esto.
 */
export async function planesExistentes(sb: any, idDeportista: number): Promise<number> {
  const { count } = await sb.from('macrociclo')
    .select('id', { count: 'exact', head: true })
    .eq('id_deportista', idDeportista)
  return count || 0
}

export async function crearTemporada(sb: any, o: OpcionesTemporada): Promise<ResultadoTemporada> {
  const t = o.temporada
  if (t.imposible || !t.bloques.length) {
    return { idMacrociclo: null, mesos: 0, micros: 0, error: 'La temporada no se puede dibujar: ' + (t.avisos[0] || '') }
  }

  const { data: macro, error: eMacro } = await sb.from('macrociclo').insert({
    id_deportista: o.idDeportista,
    objetivo: o.nombre,
    fecha_inicio: t.desde,
    duracion_semanas: t.semanas,
    tipo_periodizacion: o.modelo || 'ATR',
  }).select().single()
  if (eMacro || !macro) return { idMacrociclo: null, mesos: 0, micros: 0, error: eMacro?.message || 'No se pudo crear el macrociclo.' }

  let mesos = 0, micros = 0

  for (const b of t.bloques) {
    const { data: meso, error: eMeso } = await sb.from('mesociclo').insert({
      id_macrociclo: macro.id,
      id_deportista: o.idDeportista,
      objetivo: b.nombre,
      tipo: b.tipo,
      fecha_inicio: b.lunes,
      duracion_semanas: b.semanas,
      // La intensidad relativa del bloque, para que el lienzo lo pinte con
      // altura. Es una escala 1–10 y aquí solo hay tres alturas honestas.
      intensidad_relativa: b.clase === 'competicion' ? 8 : b.clase === 'transmutacion' ? 7 : b.clase === 'descarga' ? 3 : 5,
    }).select().single()
    if (eMeso || !meso) return { idMacrociclo: macro.id, mesos, micros, error: eMeso?.message || 'No se pudo crear un mesociclo.' }
    mesos++

    // Las semanas del bloque, con su carga: de aquí sale cuál es la de descarga,
    // que es lo que distingue un microciclo de otro en el calendario.
    const semanas = semanasDelMesociclo({
      tipo: b.tipo, semanas: b.semanas, horasReferencia: 10, distancia: o.distancia, lunes: b.lunes,
    })

    const filas = semanas.map((s, i) => ({
      id_mesociclo: meso.id,
      id_deportista: o.idDeportista,
      objetivo: 'Semana ' + (i + 1) + ' — ' + b.nombre,
      tipo: s.esDescarga ? 'Recuperación' : b.clase === 'competicion' ? 'Taper' : 'Carga',
      fecha_inicio: s.lunes,
      duracion_dias: 7,
      // La UA se deja en blanco A PROPÓSITO: es lo que dibuja quien planifica, y
      // rellenarla aquí con el patrón haría que la cadena de semanas leyera su
      // propia suposición como si fuera una decisión.
      ua_planificada: null,
    }))
    const { error: eMicro } = await sb.from('microciclo').insert(filas)
    if (eMicro) return { idMacrociclo: macro.id, mesos, micros, error: eMicro.message }
    micros += filas.length
  }

  return { idMacrociclo: macro.id, mesos, micros, error: null }
}
