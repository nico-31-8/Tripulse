// Volcar el plan del grupo a sus miembros.
//
// El grupo se planifica con su propia ficha de deportista, así que sus sesiones son
// sesiones normales que no son de nadie. Volcar = copiarlas al calendario de cada
// miembro, dentro de la semana que esa persona ya tenga.
//
// TRES COSAS QUE HAY QUE QUITAR AL COPIAR, Y LAS TRES SON SILENCIOSAS:
//
//   1. id_deportista. Cada fila de la cadena (sesion, tarea, p_distancia...) lleva
//      el suyo, y al copiar con {...resto} se arrastra el de la FICHA DEL GRUPO. La
//      copia acabaría perteneciendo al grupo y no a la persona: se la vería el
//      entrenador y no el atleta, porque la RLS mira justo esa columna. Aquí se
//      escribe siempre a mano el del destinatario, sin confiar en ningún trigger.
//
//   2. ritmo_objetivo. Se guarda, y en modo entreno el guardado LE GANA al
//      calculado. La ficha del grupo no tiene tests, así que vendría vacío... salvo
//      que alguien los ponga. Se pone a null a propósito: así cada atleta ve el ritmo
//      que sale de SUS tests, que es el sentido entero de esto.
//
//   3. Lo que pasó, no lo que se planeó: estado, rpe_reportado, duracion_real. Una
//      copia es un encargo nuevo, no el historial de otro.

export interface SesionDelGrupo {
  id: number
  fecha_sesion: string
  disciplina: string
  nTareas?: number
}

export interface ResultadoVolcado {
  id_deportista: number
  nombre: string
  creadas: number
  fallos: number
  enSuPlan: number
  error?: string
}

const SIN_COPIAR = new Set([
  'id', 'created_at', 'id_deportista', 'id_sesion', 'id_tarea', 'id_microciclo',
  'id_emision', 'estado', 'rpe_reportado', 'duracion_real', 'eliminada',
  'sensacion_tecnica', 'sensacion_general', 'notas_post', 'ritmo_objetivo',
])

// Deja solo lo que describe el ENTRENAMIENTO. Todo lo demás se pone después, a mano,
// para que no dependa de qué columnas tenga la tabla el día de mañana: si se añade
// una que no debería copiarse, esta lista es el único sitio que hay que tocar.
export function limpiar(fila: any): any {
  const salida: any = {}
  for (const k of Object.keys(fila || {})) if (!SIN_COPIAR.has(k)) salida[k] = fila[k]
  return salida
}

export async function sesionesDelGrupo(
  sb: any, idFicha: number, desde: string, hasta: string,
): Promise<SesionDelGrupo[]> {
  const { data } = await sb.from('sesion')
    .select('id, fecha_sesion, disciplina')
    .eq('id_deportista', idFicha)
    .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
    .or('eliminada.is.null,eliminada.eq.false')
    .order('fecha_sesion')
  return data || []
}

/**
 * Copia las sesiones del grupo al calendario de cada miembro.
 *
 * Va persona a persona y sesión a sesión sin pararse en el primer fallo: con ocho
 * personas, que una falle no puede dejar a las otras siete sin su semana. Devuelve
 * el parte de cada una.
 */
export async function volcar(
  sb: any,
  opciones: {
    idGrupo: string
    nombre: string
    sesiones: SesionDelGrupo[]
    miembros: { id_deportista: number; nombre: string }[]
    microsDe: (idDeportista: number) => Promise<any[]>
    microDelDia: (micros: any[], fecha: string) => any | null
  },
): Promise<{ idEmision: string | null; resultados: ResultadoVolcado[]; error: string | null }> {
  const { idGrupo, nombre, sesiones, miembros, microsDe, microDelDia } = opciones

  if (!sesiones.length) return { idEmision: null, resultados: [], error: 'No hay nada que volcar en esas fechas.' }
  if (!miembros.length) return { idEmision: null, resultados: [], error: 'El grupo no tiene a nadie.' }

  const { data: emi, error: eE } = await sb.from('grupo_entreno_emision')
    .insert({ id_grupo: idGrupo, nombre: nombre || null }).select('id').single()
  if (eE || !emi) return { idEmision: null, resultados: [], error: eE?.message || 'No se pudo abrir la emisión.' }

  // Las tareas del grupo se leen UNA vez, no una por miembro: con 8 personas y 6
  // sesiones serían 48 lecturas de lo mismo.
  const ids = sesiones.map(s => s.id)
  const [srcSes, srcTar] = await Promise.all([
    sb.from('sesion').select('*').in('id', ids),
    sb.from('tarea').select('*').in('id_sesion', ids).order('orden'),
  ])
  const porSesion = (srcSes.data || []).reduce((a: any, s: any) => { a[s.id] = s; return a }, {})
  const tareasDe = (idSes: number) => (srcTar.data || []).filter((t: any) => t.id_sesion === idSes)

  const idsTareas = (srcTar.data || []).map((t: any) => t.id)
  const hijas = idsTareas.length ? await Promise.all([
    sb.from('p_distancia').select('*').in('id_tarea', idsTareas),
    sb.from('p_duracion').select('*').in('id_tarea', idsTareas),
    sb.from('p_repeticiones').select('*').in('id_tarea', idsTareas),
    sb.from('ejercicios').select('*').in('id_tarea', idsTareas),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
  const TABLAS = ['p_distancia', 'p_duracion', 'p_repeticiones', 'ejercicios']

  const resultados: ResultadoVolcado[] = []

  for (const m of miembros) {
    const parte: ResultadoVolcado = { ...m, creadas: 0, fallos: 0, enSuPlan: 0 }
    try {
      const micros = await microsDe(m.id_deportista)

      for (const s of sesiones) {
        const src = porSesion[s.id]
        if (!src) { parte.fallos++; continue }
        const micro = microDelDia(micros, src.fecha_sesion)

        const { data: nueva, error: eS } = await sb.from('sesion').insert({
          ...limpiar(src),
          id_deportista: m.id_deportista,
          id_microciclo: micro ? micro.id : null,
          ...(micro ? {} : { origen: 'entrenador' }),
          estado: 'Planificada',
          id_emision: emi.id,
        }).select('id').single()

        if (eS || !nueva) { parte.fallos++; continue }
        parte.creadas++
        if (micro) parte.enSuPlan++

        const mapa: Record<number, number> = {}
        for (const t of tareasDe(s.id)) {
          const { data: nt } = await sb.from('tarea')
            .insert({ ...limpiar(t), id_sesion: nueva.id, id_deportista: m.id_deportista })
            .select('id').single()
          if (nt) mapa[t.id] = nt.id
        }

        for (let i = 0; i < TABLAS.length; i++) {
          const filas = (hijas[i].data || [])
            .filter((r: any) => mapa[r.id_tarea])
            .map((r: any) => ({ ...limpiar(r), id_tarea: mapa[r.id_tarea], id_deportista: m.id_deportista }))
          if (filas.length) await sb.from(TABLAS[i]).insert(filas)
        }
      }
    } catch (e: any) {
      parte.error = e?.message || 'Error inesperado'
    }
    resultados.push(parte)
  }

  if (!resultados.some(r => r.creadas > 0)) {
    await sb.from('grupo_entreno_emision').delete().eq('id', emi.id)
    return { idEmision: null, resultados, error: 'No se pudo crear ninguna sesión.' }
  }
  return { idEmision: emi.id, resultados, error: null }
}

export function resumenVolcado(r: ResultadoVolcado[]): string {
  const total = r.reduce((a, x) => a + x.creadas, 0)
  const conAlgo = r.filter(x => x.creadas > 0).length
  const sueltas = r.reduce((a, x) => a + (x.creadas - x.enSuPlan), 0)
  let t = total + (total === 1 ? ' sesión creada' : ' sesiones creadas') + ' en ' + conAlgo + ' de ' + r.length
  if (sueltas > 0) t += ' · ' + sueltas + ' sin semana planificada'
  return t
}
