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

  /**
   * Deshacer a mano lo que se lleve creado.
   *
   * Esto son tres inserts encadenados desde el navegador, no una transacción:
   * si el tercero falla, los dos primeros ya están escritos. Sin esto el atleta
   * se queda con medio plan Y con la pantalla diciéndole que ya tiene uno, que
   * es la peor combinación posible — ni sirve ni deja crear otro.
   */
  const deshacer = async (motivo: string) => {
    const { data: ms } = await sb.from('mesociclo').select('id').eq('id_macrociclo', macro.id)
    const ids = (ms || []).map((m: any) => m.id)
    if (ids.length) await sb.from('microciclo').delete().in('id_mesociclo', ids)
    await sb.from('mesociclo').delete().eq('id_macrociclo', macro.id)
    await sb.from('macrociclo').delete().eq('id', macro.id)
    return { idMacrociclo: null, mesos: 0, micros: 0, error: motivo }
  }

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
    if (eMeso || !meso) return deshacer(eMeso?.message || 'No se pudo crear un mesociclo.')
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
    let { error: eMicro } = await sb.from('microciclo').insert(filas)

    /* `microciclo.tipo` tiene un CHECK con una lista cerrada de valores, y esa
       lista NO está en el repo: el esquema completo vive solo en la base. Dos
       pantallas de la app ya discrepan sobre ella —el lienzo escribe
       «Recuperación» con tilde y la ficha del microciclo compara contra
       «Recuperacion» sin ella—, así que adivinar cuál pasa el CHECK es tirar una
       moneda.

       Lo que SÍ está probado es que «Carga» entra: es lo que inserta
       /mis-sesiones desde hace tiempo. Así que si el CHECK rechaza el valor
       fino, se reintenta con el seguro. Perder el color verde de la semana de
       descarga en el calendario es un precio ridículo comparado con no poder
       crear el plan — y nada funcional depende de este campo: si una semana es
       de descarga se deduce del patrón del mesociclo, no de aquí. */
    if (eMicro && /tipo_check/i.test(eMicro.message || '')) {
      const seguras = filas.map(f => ({ ...f, tipo: 'Carga' }))
      const r = await sb.from('microciclo').insert(seguras)
      eMicro = r.error
    }

    if (eMicro) return deshacer(eMicro.message)
    micros += filas.length
  }

  return { idMacrociclo: macro.id, mesos, micros, error: null }
}
