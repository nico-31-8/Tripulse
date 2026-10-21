// Volcar el plan del grupo a sus miembros.
//
// El grupo se planifica con su propia ficha de deportista, así que sus sesiones son
// sesiones normales que no son de nadie. Volcar = copiarlas al calendario de cada
// miembro, dentro de la semana que esa persona ya tenga.
//
// La copia en sí es la de siempre (lib/copiar-sesion), con CUATRO COSAS QUE HAY QUE
// CUIDAR AL COPIAR A OTRA PERSONA, Y LAS CUATRO SON SILENCIOSAS:
//
//   1. id_deportista. Cada fila de la cadena (sesion, tarea, p_distancia...) lleva
//      el suyo, y al copiar con {...resto} se arrastra el de la FICHA DEL GRUPO. La
//      copia acabaría perteneciendo al grupo y no a la persona: se la vería el
//      entrenador y no el atleta, porque la RLS mira justo esa columna. Aquí se
//      escribe siempre a mano el del destinatario, sin confiar en ningún trigger.
//
//   2. ritmo_objetivo. Se guarda, y en modo entreno el guardado LE GANA al
//      calculado. La ficha del grupo no tiene tests, así que vendría vacío... salvo
//      que alguien los ponga. Se quita a propósito (`sinRitmo`): así cada atleta ve
//      el ritmo que sale de SUS tests, que es el sentido entero de esto.
//
//   3. Lo que pasó, no lo que se planeó: estado, rpe_reportado, duracion_real. Una
//      copia es un encargo nuevo, no el historial de otro. Eso ya lo quita
//      lib/copiar-sesion para todo el mundo.
//
//   4. Las zonas propias (desde el 20-10-2026). Cada tarea congela su zona con
//      los porcentajes de la persona a la que se mandó, y en el grupo esa persona
//      es su ficha. Copiada tal cual, los ocho recibirían los porcentajes del
//      grupo y no los SUYOS (lib/zonas-ajuste). Se re-ancla cada zona mandada
//      entera; la afinada a mano se respeta, porque ese número lo escribió el
//      entrenador.
import { leerOrigen, escribirCopias, type DestinoCopia, type OrigenCopia } from './copiar-sesion'
import { leerCopia, esCopiaDeLimites, leerIdClasif } from './prescripcion-zona'
import { leerZonas } from './zonas-entrenador'
import { leerAjustesDeVarios, reanclarCopia } from './zonas-ajuste'
import type { SupabaseClient } from '@supabase/supabase-js'

type Fila = Record<string, unknown>

/**
 * Lo que retoca cada tarea al copiarla a un miembro: sus zonas propias con SUS
 * porcentajes. `null` si ninguna tarea lleva una zona de una clasificación (lo
 * normal), y entonces no se pregunta nada a la base.
 */
export async function reanclajeDeZonas(
  sb: SupabaseClient, origen: OrigenCopia, miembros: number[],
): Promise<((t: Fila, idDeportista: number | undefined) => Fila) | null> {
  const clasifs = new Set<number>()
  for (const tareas of origen.tareas.values()) {
    for (const t of tareas) {
      const c = leerCopia(t.zona_copia)
      const id = c && esCopiaDeLimites(c) ? leerIdClasif(c.fuente) : null
      if (id) clasifs.add(id)
    }
  }
  if (!clasifs.size) return null

  const { data: zs } = await sb.from('zona_entrenador').select('*')
    .in('id_clasificacion', [...clasifs]).eq('archivada', false)
  const zonas = leerZonas(zs)
  const ids = zonas.map(z => z.id).filter((x): x is number => !!x)
  if (!ids.length) return null

  /* La ficha del grupo es la dueña de las sesiones que se copian. */
  const ficha = Number([...origen.sesiones.values()][0]?.id_deportista) || null
  const deps = [...new Set([...(ficha ? [ficha] : []), ...miembros])]
  const { data: ajs } = await sb.from('zona_ajuste').select('id_zona, id_deportista, desde, hasta')
    .in('id_deportista', deps).in('id_zona', ids)
  const porDep = leerAjustesDeVarios(ajs)

  return (t, idDeportista) => {
    const c = leerCopia(t.zona_copia)
    if (!c || !esCopiaDeLimites(c)) return t
    const idClasif = leerIdClasif(c.fuente)
    const z = zonas.find(x => x.idClasificacion === idClasif && x.sigla.toUpperCase() === c.sigla.toUpperCase())
    if (!z?.id) return t
    const nueva = reanclarCopia(c, z,
      ficha ? porDep.get(ficha)?.get(z.id) : undefined,
      idDeportista != null ? porDep.get(idDeportista)?.get(z.id) : undefined)
    return nueva === c ? t : { ...t, zona_copia: nueva }
  }
}

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

// Lo que ESA persona ya tiene de este grupo en un rango. Se usa para no volver a
// darle lo que ya recibió cuando se le traen las sesiones futuras al entrar.
export async function loQueYaTiene(
  sb: any, idGrupo: string, idDeportista: number, desde: string, hasta: string,
): Promise<{ fecha_sesion: string; disciplina: string }[]> {
  /* Una consulta: las sesiones que vienen de una emisión de ESTE grupo, con el
     cruce dentro. Eran dos (las emisiones del grupo, y luego sus sesiones). */
  const { data } = await sb.from('sesion')
    .select('fecha_sesion, disciplina, grupo_entreno_emision!inner(id_grupo)')
    .eq('grupo_entreno_emision.id_grupo', idGrupo).eq('id_deportista', idDeportista)
    .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
    .or('eliminada.is.null,eliminada.eq.false')
  return ((data || []) as any[]).map(s => ({ fecha_sesion: s.fecha_sesion, disciplina: s.disciplina }))
}

// De las sesiones del grupo, las que a esa persona le faltan.
//
// Se comparan por día + deporte, que es lo único que se puede: la copia no guarda
// de qué sesión del grupo salió. Si el grupo tuviera dos del mismo deporte el mismo
// día, se le traería una sola. Es raro y prefiero quedarme corto: darle de menos se
// arregla volcando otra vez, darle de más le duplica la semana.
export function sesionesQueLeFaltan(
  delGrupo: SesionDelGrupo[], yaTiene: { fecha_sesion: string; disciplina: string }[],
): SesionDelGrupo[] {
  const tiene = new Set((yaTiene || []).map(s =>
    String(s.fecha_sesion).slice(0, 10) + '|' + String(s.disciplina || '')))
  return (delGrupo || []).filter(s =>
    !tiene.has(String(s.fecha_sesion).slice(0, 10) + '|' + String(s.disciplina || '')))
}

export interface VolcadoPrevio {
  planificadas: number[]   // se pueden apartar y rehacer
  realizadas: number       // ya entrenadas: no se tocan NUNCA
  personas: number
}

// Qué hay ya volcado de ESTE grupo en esas fechas y para esa gente.
//
// Sin esto, volcar dos veces el mismo rango deja a todo el mundo con las sesiones
// repetidas y sin ningún aviso. Pasa en cuanto corriges algo y vuelves a volcar,
// que es justo lo que uno hace.
export async function volcadoPrevio(
  sb: any, idGrupo: string, idsMiembros: number[], desde: string, hasta: string,
): Promise<VolcadoPrevio> {
  const vacio: VolcadoPrevio = { planificadas: [], realizadas: 0, personas: 0 }
  if (!idsMiembros.length) return vacio

  /* Una consulta: las sesiones que vienen de una emisión de ESTE grupo, con el
     cruce dentro. Eran dos (las emisiones del grupo, y luego sus sesiones). */
  const { data } = await sb.from('sesion')
    .select('id, estado, id_deportista, grupo_entreno_emision!inner(id_grupo)')
    .eq('grupo_entreno_emision.id_grupo', idGrupo).in('id_deportista', idsMiembros)
    .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
    .or('eliminada.is.null,eliminada.eq.false')

  const filas = data || []
  return {
    planificadas: filas.filter((s: any) => s.estado === 'Planificada').map((s: any) => s.id),
    realizadas: filas.filter((s: any) => s.estado !== 'Planificada').length,
    personas: new Set(filas.map((s: any) => String(s.id_deportista))).size,
  }
}

// Aparta las de antes en vez de borrarlas: `eliminada` es el borrado suave de la
// app y la papelera las recupera. Reemplazar no puede significar perder trabajo.
//
// Solo llegan aquí las que siguen planificadas: reescribir una sesión que alguien
// ya ha entrenado seria falsear su historial.
export async function apartarVolcadoPrevio(sb: any, ids: number[]): Promise<string | null> {
  if (!ids.length) return null
  const { error } = await sb.from('sesion').update({ eliminada: true }).in('id', ids)
  return error ? error.message : null
}

/**
 * Copia las sesiones del grupo al calendario de cada miembro.
 *
 * Cada persona por su lado y sin pararse en el primer fallo: con ocho personas,
 * que una falle no puede dejar a las otras siete sin su semana. Devuelve el parte
 * de cada una.
 *
 * Y TODAS A LA VEZ. Iba persona a persona, sesión a sesión y tarea a tarea: con
 * ocho personas y una semana de seis sesiones eran varios cientos de viajes en
 * serie, y el entrenador esperando delante. Ahora el grupo se lee una vez y cada
 * persona son tres escrituras (sesiones, tareas, lo que cuelga), en paralelo.
 */
export async function volcar(
  sb: any,
  opciones: {
    idGrupo: string
    nombre: string
    sesiones: SesionDelGrupo[]
    miembros: { id_deportista: number; nombre: string }[]
    /* Los microciclos de TODO el grupo de una vez. Se inyecta —en vez de
       consultar aquí— para poder probar el volcado sin base de datos. Antes era
       `microsDe(idDeportista)`, una llamada por persona, y cada llamada eran
       tres consultas encadenadas. */
    microsDeTodos: (ids: number[]) => Promise<Map<number, any[]>>
    microDelDia: (micros: any[], fecha: string) => any | null
  },
): Promise<{ idEmision: string | null; resultados: ResultadoVolcado[]; error: string | null }> {
  const { idGrupo, nombre, sesiones, miembros, microsDeTodos, microDelDia } = opciones

  if (!sesiones.length) return { idEmision: null, resultados: [], error: 'No hay nada que volcar en esas fechas.' }
  if (!miembros.length) return { idEmision: null, resultados: [], error: 'El grupo no tiene a nadie.' }

  /* Lo del grupo se lee UNA vez —sesiones, tareas y lo que cuelga— y las semanas de
     todos también: con 8 personas serían 8 lecturas de lo mismo. Y a la vez que se
     abre la emisión, que no depende de ninguna de las dos (iba antes, sola). */
  const [{ data: emi, error: eE }, origen, microsPorDep] = await Promise.all([
    sb.from('grupo_entreno_emision')
      .insert({ id_grupo: idGrupo, nombre: nombre || null }).select('id').single(),
    leerOrigen(sb, sesiones.map(s => s.id)),
    microsDeTodos(miembros.map(m => m.id_deportista)),
  ])
  if (eE || !emi) return { idEmision: null, resultados: [], error: eE?.message || 'No se pudo abrir la emisión.' }

  /* Una vez para todos: las zonas propias de esas tareas y los porcentajes de
     cada miembro. Si algo de esto falla, se copia como antes (los del grupo):
     mejor eso que dejar a nadie sin su semana. */
  const ajustarTarea = await reanclajeDeZonas(sb, origen, miembros.map(m => m.id_deportista)).catch(() => null)

  const resultados = await Promise.all(miembros.map(async (m): Promise<ResultadoVolcado> => {
    const parte: ResultadoVolcado = { ...m, creadas: 0, fallos: 0, enSuPlan: 0 }
    try {
      const micros = microsPorDep.get(Number(m.id_deportista)) || []
      const enSuPlan: boolean[] = []
      const destinos: DestinoCopia[] = sesiones.map(s => {
        const fecha = origen.sesiones.get(Number(s.id))?.fecha_sesion ?? s.fecha_sesion
        const micro = microDelDia(micros, fecha)
        enSuPlan.push(!!micro)
        return {
          origen: s.id,
          /* Las mismas claves en todas: en una inserción de golpe, la que falta
             en una fila se escribe como null. */
          campos: {
            fecha_sesion: fecha,
            id_microciclo: micro ? micro.id : null,
            id_deportista: m.id_deportista,
            origen: 'entrenador',
            id_emision: emi.id,
          },
          idDeportista: m.id_deportista,
        }
      })

      const r = await escribirCopias(sb, origen, destinos, { sinRitmo: true, ...(ajustarTarea ? { ajustarTarea } : {}) })
      r.ids.forEach((nueva, k) => {
        if (nueva == null) { parte.fallos++; return }
        parte.creadas++
        if (enSuPlan[k]) parte.enSuPlan++
      })
      if (r.error) parte.error = r.error
    } catch (e: any) {
      parte.error = e?.message || 'Error inesperado'
    }
    return parte
  }))

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
