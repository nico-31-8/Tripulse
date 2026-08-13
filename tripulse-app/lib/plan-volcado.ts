// ============================================================
// TRIPULSE — Llevar la semana generada al calendario
// ============================================================
// El último paso, y el único de todo el planificador que ESCRIBE. Hasta aquí todo
// era proponer; esto crea sesiones de verdad en el calendario de una persona.
//
// Por eso el clic lo da el entrenador y por eso esto no se llama solo: la regla
// de oro del proyecto es que la IA propone y el humano aplica, y una semana
// entera son entre seis y diez sesiones. Volcar es una acción con consecuencias
// grandes, así que antes se dice exactamente qué va a pasar.
//
// TRES COSAS QUE NO SON OBVIAS
//
// 1. Si el atleta no tiene semana planificada para esas fechas, las sesiones
//    entran como LIBRES (sin microciclo, con id_deportista y origen 'entrenador').
//    Es el mismo camino que usa el calendario al pegar una plantilla en una
//    semana sin planificar. Sin esto, un atleta sin mesociclo montado no podría
//    recibir nada.
//
// 2. La FUERZA no se escribe como la resistencia. Un bloque de resistencia lleva
//    metros o tiempo (p_distancia / p_duracion) y uno de fuerza lleva
//    repeticiones (p_repeticiones), más el control de esfuerzo. `aplicarBloques`
//    solo sabe del primero: usarlo para la fuerza crea la sesión con las tareas
//    vacías, que es peor que no crearla porque parece que está.
//
// 3. Va sesión a sesión y NO se para en el primer fallo. Que una falle no puede
//    dejar la semana a medias sin decir cuál. Se devuelve el parte de cada una.
import type { Relleno } from './plan-relleno'
import type { DiaSemana } from './plan-colocacion'
import { DIAS } from './plan-colocacion'
import { plantillaFuerzaPorId } from './plantillas-fuerza'

export interface ParteSesion {
  dia: DiaSemana
  fecha: string
  nombre: string
  disciplina: string
  ok: boolean
  /** Cayó dentro de su microciclo, o entró como sesión libre. */
  enSuPlan: boolean
  error?: string
}

export interface ResultadoVolcado {
  parte: ParteSesion[]
  creadas: number
  error: string | null
}

/**
 * La fecha que le toca a un día de la semana, contando desde el lunes.
 *
 * Se hace con aritmética de texto sobre la fecha ISO y no con `new Date()` a
 * secas: construir una fecha local y volver a serializarla puede saltar un día
 * según la zona horaria, y una sesión que aparece el domingo cuando debía ser el
 * lunes no la ve nadie hasta que ya pasó.
 */
export function fechaDeDia(lunes: string, dia: DiaSemana): string {
  const i = DIAS.indexOf(dia)
  if (i < 0) return lunes
  const d = new Date(String(lunes).slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + i)
  return d.toISOString().slice(0, 10)
}

/** El domingo de esa semana, para poder preguntar por el rango entero. */
export const domingoDe = (lunes: string) => fechaDeDia(lunes, 'Domingo')

/**
 * Qué hay ya en el calendario esa semana.
 *
 * Volcar dos veces sin mirar deja al atleta con la semana duplicada y sin un
 * solo aviso. Se cuenta antes y decide el entrenador.
 */
export async function loQueYaHay(sb: any, idDeportista: number, lunes: string): Promise<number> {
  const micros = await microsDelDeportista(sb, idDeportista)
  const ids = micros.map((m: any) => m.id)
  const desde = lunes, hasta = domingoDe(lunes)

  const consulta = () => sb.from('sesion')
    .select('id')
    .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
    .or('eliminada.is.null,eliminada.eq.false')

  // Las suyas son las de su plan MÁS las libres. Mirar solo el microciclo deja
  // fuera justo las que el planificador crea cuando no tiene semana montada.
  const [enPlan, libres] = await Promise.all([
    ids.length ? consulta().in('id_microciclo', ids) : Promise.resolve({ data: [] }),
    consulta().eq('id_deportista', idDeportista).is('id_microciclo', null),
  ])
  return ((enPlan as any)?.data?.length || 0) + ((libres as any)?.data?.length || 0)
}

/** Los microciclos del atleta, para saber si la fecha cae en su plan. */
export async function microsDelDeportista(sb: any, idDeportista: number): Promise<any[]> {
  const { data: mac } = await sb.from('macrociclo').select('id').eq('id_deportista', idDeportista)
  if (!mac?.length) return []
  const { data: me } = await sb.from('mesociclo').select('id').in('id_macrociclo', mac.map((m: any) => m.id))
  if (!me?.length) return []
  const { data: mi } = await sb.from('microciclo')
    .select('id, fecha_inicio, duracion_dias').in('id_mesociclo', me.map((m: any) => m.id))
  return mi || []
}

/** El microciclo en el que cae una fecha, si hay alguno. */
export function microDelDia(micros: any[], fecha: string): any | null {
  for (const m of micros || []) {
    if (!m?.fecha_inicio) continue
    const ini = new Date(String(m.fecha_inicio).slice(0, 10) + 'T00:00:00Z')
    const fin = new Date(ini)
    fin.setUTCDate(ini.getUTCDate() + (m.duracion_dias || 7))
    const d = new Date(String(fecha).slice(0, 10) + 'T00:00:00Z')
    if (d >= ini && d < fin) return m
  }
  return null
}

/**
 * Escribe los bloques de una sesión de FUERZA.
 *
 * Camino aparte porque la fuerza se guarda distinto: series y repeticiones
 * (`p_repeticiones`) en vez de metros o tiempo, más el control de esfuerzo. El
 * ejercicio va en el comentario de la tarea y no como vínculo a la biblioteca:
 * la plantilla sugiere cuál, pero elegirlo de verdad es del entrenador.
 */
export async function aplicarBloquesFuerza(sb: any, idSesion: number, idPlantilla: string): Promise<string | null> {
  const p = plantillaFuerzaPorId(idPlantilla)
  if (!p) return 'No existe la plantilla de fuerza ' + idPlantilla

  const { data: creadas, error } = await sb.from('tarea').insert(
    p.bloques.map((b, i) => ({
      id_sesion: idSesion,
      disciplina: 'Fuerza',
      zona_entrenamiento: b.zona,
      series: b.series,
      descanso_segundos: b.descansoSeg,
      orden: i + 1,
      comentario: [b.ejercicio, b.carga, b.unilateral ? 'cada lado' : '', b.nota].filter(Boolean).join(' · '),
    })),
  ).select()
  if (error) return error.message

  // Las repeticiones van en su tabla. Los isométricos (plancha) no tienen: esos
  // llevan tiempo, y ahí sí sirve p_duracion.
  const reps: any[] = []
  const durs: any[] = []
  ;(creadas || []).forEach((t: any) => {
    const b = p.bloques[t.orden - 1]
    if (!b) return
    if (b.repeticiones) reps.push({ id_tarea: t.id, repeticiones_planteadas: b.repeticiones })
    else if (b.segundos) durs.push({ id_tarea: t.id, tiempo_planeado: b.segundos })
  })
  if (reps.length) await sb.from('p_repeticiones').insert(reps)
  if (durs.length) await sb.from('p_duracion').insert(durs)
  return null
}

export interface OpcionesVolcado {
  idDeportista: number
  /** Lunes de la semana destino, en ISO. */
  lunes: string
  relleno: Relleno[]
  /** Se inyecta para poder probar esto entero con un doble. */
  aplicarBloques: (sb: any, idSesion: number, disciplina: string, bloques: any[]) => Promise<string | null>
  /** Los bloques de cada sesión de resistencia, por clave del catálogo. */
  bloquesDe: (clave: string) => any[]
}

export async function volcarSemana(sb: any, o: OpcionesVolcado): Promise<ResultadoVolcado> {
  if (!o.idDeportista) return { parte: [], creadas: 0, error: 'Falta el deportista.' }
  if (!o.lunes) return { parte: [], creadas: 0, error: 'Falta la semana de destino.' }
  if (!o.relleno?.length) return { parte: [], creadas: 0, error: 'La semana está vacía.' }

  const micros = await microsDelDeportista(sb, o.idDeportista)
  const parte: ParteSesion[] = []

  for (const r of o.relleno) {
    const fecha = fechaDeDia(o.lunes, r.dia)
    const micro = microDelDia(micros, fecha)
    const disciplina = r.hueco.bloque
    const base: ParteSesion = { dia: r.dia, fecha, nombre: r.nombre, disciplina, ok: false, enSuPlan: !!micro }

    try {
      const { data: ses, error: eS } = await sb.from('sesion').insert({
        id_microciclo: micro ? micro.id : null,
        ...(micro ? {} : { id_deportista: o.idDeportista, origen: 'entrenador' }),
        disciplina,
        fecha_sesion: fecha,
        estado: 'Planificada',
        nombre: r.nombre,
      }).select('id').single()

      if (eS || !ses) { parte.push({ ...base, error: eS?.message || 'No se pudo crear la sesión' }); continue }

      const err = r.claveFuerza
        ? await aplicarBloquesFuerza(sb, ses.id, r.claveFuerza)
        : await o.aplicarBloques(sb, ses.id, disciplina, o.bloquesDe(r.clave))
      parte.push({ ...base, ok: !err, error: err || undefined })
    } catch (e: any) {
      parte.push({ ...base, error: e?.message || 'Error inesperado' })
    }
  }

  const creadas = parte.filter(p => p.ok).length
  return { parte, creadas, error: creadas ? null : 'No se pudo crear ninguna sesión.' }
}

/** Resumen del volcado, para decirlo en una línea. */
export function resumenVolcado(r: ResultadoVolcado): string {
  if (r.error && !r.creadas) return r.error
  const fallos = r.parte.filter(p => !p.ok)
  const libres = r.parte.filter(p => p.ok && !p.enSuPlan).length
  return [
    `${r.creadas} sesión(es) creadas.`,
    libres ? `${libres} entraron como sesión libre: esos días no tenía semana planificada.` : '',
    fallos.length ? `${fallos.length} fallaron: ${fallos.map(f => f.dia).join(', ')}.` : '',
  ].filter(Boolean).join(' ')
}
