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
//
// Y DOS QUE APRENDIMOS EL 2026-10-18, cuando «Mi plan» volcó un bloque encima
// de dos semanas que ya había llenado minuto y medio antes:
//
// 4. Una semana que ya tiene sesiones NO SE TOCA, salvo que se pida `sumar`.
//    Contarlas antes (loQueYaHay) solo servía para avisar, y el aviso se
//    quedaba viejo: se contaba al generar y se volcaba después. Se cuenta aquí,
//    justo antes de escribir.
// 5. El día de una competición no se escribe nada. El bloque ya no planifica
//    ese día (lib/plan-bloque); esto es la red de debajo para lo que llegue
//    montado de otra manera, como la semana suelta del planificador.
//
// Y UNA MÁS, DEL MISMO DÍA:
//
// 6. Cada sesión se escribe con LOS MINUTOS QUE LE DA EL PLAN (lib/plan-duracion),
//    no con el volumen fijo de su plantilla. Se escribía la plantilla tal cual
//    y los minutos del relleno se tiraban: la semana de descarga y la de
//    sobrecarga de un mesociclo salían idénticas en el calendario.
import type { Relleno } from './plan-relleno'
import type { DiaSemana } from './plan-colocacion'
import { DIAS } from './plan-colocacion'
import { plantillaFuerzaPorId, type BloqueFuerza } from './plantillas-fuerza'
import type { NivelPlantilla } from './plantillas-tipos'
import { ajustarAMinutos, ritmosDelDeportista } from './plan-duracion'

export interface ParteSesion {
  dia: DiaSemana
  fecha: string
  nombre: string
  disciplina: string
  ok: boolean
  /** Cayó dentro de su microciclo, o entró como sesión libre. */
  enSuPlan: boolean
  error?: string
  /** Se creó, pero no cabe en sus minutos sin salirse de lo documentado: por qué. */
  aviso?: string
}

export interface ResultadoVolcado {
  parte: ParteSesion[]
  creadas: number
  error: string | null
  /** Las que ya tenía la semana. Si hay alguna y no se pidió sumar, no se escribe nada. */
  yaHabia: number
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
 * solo aviso. Se cuenta antes para avisar, y volcarSemana lo vuelve a contar
 * justo antes de escribir.
 *
 * Si la consulta falla, LANZA en vez de decir «0»: un cero que en realidad es
 * «no lo sé» es exactamente lo que deja pasar una semana duplicada.
 */
export async function loQueYaHay(sb: any, idDeportista: number, lunes: string): Promise<number> {
  /* Ya no hace falta saber sus microciclos para esto: se preguntaba por ellos
     para pedir «las sesiones de su plan». */
  const desde = lunes, hasta = domingoDe(lunes)

  const consulta = () => sb.from('sesion')
    .select('id')
    .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
    .or('eliminada.is.null,eliminada.eq.false')

  /* Las suyas son las de su plan MÁS las libres —mirar solo el microciclo deja
     fuera justo las que el planificador crea cuando no tiene semana montada—, y
     las dos juntas son «las del deportista», que la sesión lo lleva. */
  const { data, error } = await consulta().eq('id_deportista', idDeportista)
  if (error) throw new Error(error.message || 'No se pudo leer el calendario')
  return (data as any[] | null)?.length || 0
}

/**
 * Las competiciones del deportista que caen en esa semana.
 *
 * `select('*')` y no la lista de columnas: `prioridad` la añadió una migración
 * que puede no estar en todas las bases, y nombrar una columna que no existe
 * tumba la consulta entera sin avisar (ver lib/competicion-prioridad).
 */
export async function competicionesDeLaSemana(sb: any, idDeportista: number, lunes: string): Promise<{ fecha: string; nombre: string }[]> {
  const { data } = await sb.from('competicion').select('*')
    .eq('id_deportista', idDeportista)
    .gte('fecha', lunes).lte('fecha', domingoDe(lunes))
  return ((data as any[] | null) || []).map(c => ({
    fecha: String(c.fecha).slice(0, 10),
    nombre: String(c.nombre || '').trim() || 'una competición',
  }))
}

/** Los microciclos del atleta, para saber si la fecha cae en su plan.
 *
 * Una consulta y no tres en fila (macrociclo → mesociclo → microciclo): el
 * microciclo lleva su `id_deportista` desde la Fase A y la RLS mira justo esa
 * columna. Es la misma cadena que se quitó de las demás pantallas. */
export async function microsDelDeportista(sb: any, idDeportista: number): Promise<any[]> {
  const { data: mi } = await sb.from('microciclo')
    .select('id, fecha_inicio, duracion_dias').eq('id_deportista', idDeportista)
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
  return escribirBloquesFuerza(sb, idSesion, p.bloques)
}

/**
 * Los bloques, sin saber de qué catálogo vienen.
 *
 * Se separó de lo de arriba porque la movilidad usa el MISMO formato
 * (`BloqueFuerza`) y el mismo destino, pero vive en otro catálogo — y lo que no
 * puede pasar es que exista un segundo escritor de tareas de fuerza: en cuanto
 * hay dos, uno de los dos se olvida de `p_duracion` y las planchas se guardan
 * sin tiempo.
 *
 * `ordenBase` es para AÑADIR a una sesión que ya tiene tareas. Sin él, la
 * movilidad que se mete al final de una sesión de fuerza pisaría el orden de
 * las que ya estaban.
 */
export async function escribirBloquesFuerza(
  sb: any, idSesion: number, bloques: BloqueFuerza[], ordenBase = 0,
): Promise<string | null> {
  if (!bloques.length) return null

  const { data: creadas, error } = await sb.from('tarea').insert(
    bloques.map((b, i) => ({
      id_sesion: idSesion,
      disciplina: 'Fuerza',
      zona_entrenamiento: b.zona,
      series: b.series,
      descanso_segundos: b.descansoSeg,
      orden: ordenBase + i + 1,
      comentario: [b.ejercicio, b.carga, b.unilateral ? 'cada lado' : '', b.nota].filter(Boolean).join(' · '),
    })),
  ).select()
  if (error) return error.message

  // Las repeticiones van en su tabla. Los isométricos (plancha, y todos los
  // estiramientos estáticos) no tienen: esos llevan tiempo, y ahí sí sirve
  // p_duracion.
  const reps: any[] = []
  const durs: any[] = []
  ;(creadas || []).forEach((t: any) => {
    const b = bloques[t.orden - 1 - ordenBase]
    if (!b) return
    if (b.repeticiones) reps.push({ id_tarea: t.id, repeticiones_planteadas: b.repeticiones })
    else if (b.segundos) durs.push({ id_tarea: t.id, tiempo_planeado: b.segundos })
  })
  /* Las dos a la vez (iban en fila), y su error se devuelve: antes se tiraba y
     la sesión quedaba con sus ejercicios y sin repeticiones ni tiempo. */
  const [rR, rU] = await Promise.all([
    reps.length ? sb.from('p_repeticiones').insert(reps) : null,
    durs.length ? sb.from('p_duracion').insert(durs) : null,
  ])
  return rR?.error?.message ?? rU?.error?.message ?? null
}

export interface OpcionesVolcado {
  idDeportista: number
  /** Lunes de la semana destino, en ISO. */
  lunes: string
  relleno: Relleno[]
  /** Se inyecta para poder probar esto entero con un doble. */
  aplicarBloques: (sb: any, idSesion: number, disciplina: string, bloques: any[]) => Promise<string | null>
  /**
   * El nivel de las plantillas de este deportista. Los bloques de cada sesión
   * los saca el volcado y no quien llama: así no hay forma de escribir una
   * sesión sin pasar por sus minutos (lib/plan-duracion). Antes cada pantalla
   * pasaba sus bloques hechos, y las cuatro los sacaban sin mirar los minutos.
   */
  nivel: NivelPlantilla
  /**
   * Sumarlas a las que ya tenga esa semana. Sin esto, una semana con alguna
   * sesión no se toca. Solo lo pide la semana suelta del planificador, y
   * después de haber enseñado cuántas hay.
   */
  sumar?: boolean
}

export async function volcarSemana(sb: any, o: OpcionesVolcado): Promise<ResultadoVolcado> {
  if (!o.idDeportista) return { parte: [], creadas: 0, error: 'Falta el deportista.', yaHabia: 0 }
  if (!o.lunes) return { parte: [], creadas: 0, error: 'Falta la semana de destino.', yaHabia: 0 }
  if (!o.relleno?.length) return { parte: [], creadas: 0, error: 'La semana está vacía.', yaHabia: 0 }

  /* Lo que hay que saber antes de escribir, todo a la vez. Lo que ya tiene la
     semana se pregunta AQUÍ y no se fía de lo que se contó al generar: entre
     una cosa y otra pudo volcarse otra pasada (es lo que pasó el 18-10). */
  let micros: any[], yaHabia: number, carreras: { fecha: string; nombre: string }[]
  // Sus ritmos no tumban el volcado: sin ellos se usa el de referencia.
  const ritmos = ritmosDelDeportista(sb, o.idDeportista)
  try {
    ;[micros, yaHabia, carreras] = await Promise.all([
      microsDelDeportista(sb, o.idDeportista),
      loQueYaHay(sb, o.idDeportista, o.lunes),
      competicionesDeLaSemana(sb, o.idDeportista, o.lunes),
    ])
  } catch (e: any) {
    // Sin saber lo que hay no se escribe: duplicar una semana entera es peor
    // que tener que pulsar otra vez.
    return { parte: [], creadas: 0, yaHabia: 0, error: 'No se pudo comprobar qué hay ya esa semana; no se ha creado nada. ' + (e?.message || '') }
  }

  if (yaHabia > 0 && !o.sumar) {
    return { parte: [], creadas: 0, yaHabia, error: `La semana ya tenía ${yaHabia} sesión(es): no se ha tocado.` }
  }
  const susRitmos = await ritmos

  /* TODAS A LA VEZ. Iban una detrás de otra, y cada una son tres esperas (la
     sesión, sus tareas, lo que cuelga de ellas): una semana de seis sesiones
     eran dieciocho en fila. Cada sesión es independiente de las demás, y el
     parte sale igual en el orden de la semana. */
  const parte: ParteSesion[] = await Promise.all(o.relleno.map(async (r): Promise<ParteSesion> => {
    const fecha = fechaDeDia(o.lunes, r.dia)
    const micro = microDelDia(micros, fecha)
    const disciplina = r.hueco.bloque
    const base: ParteSesion = { dia: r.dia, fecha, nombre: r.nombre, disciplina, ok: false, enSuPlan: !!micro }

    // La carrera ES la sesión de ese día.
    const carrera = carreras.find(c => c.fecha === fecha)
    if (carrera) return { ...base, error: 'Ese día compite en «' + carrera.nombre + '»: no se le pone nada más.' }

    /* Los bloques ANTES de crear la sesión: una clave que no está en el
       catálogo dejaba una sesión vacía en el calendario, que parece que está. */
    const ajuste = r.claveFuerza ? null : ajustarAMinutos(r.clave, o.nivel, r.minutos, susRitmos)
    if (!r.claveFuerza && !ajuste) return { ...base, error: 'La sesión «' + r.clave + '» no está en el catálogo.' }

    try {
      const { data: ses, error: eS } = await sb.from('sesion').insert({
        id_microciclo: micro ? micro.id : null,
        /* `id_deportista` va SIEMPRE, cuelgue de un microciclo o no.
           Antes solo se escribía en las sueltas, dando por hecho que la de
           dentro del plan lo heredaba del microciclo. Pero la política de RLS
           es `id_deportista in (auth_dep_ids())` sobre la propia fila, así que
           una sesión con ese campo a null no pasa el WITH CHECK y el insert se
           rechaza. Escribirlo aquí no depende de que exista un disparador que
           lo rellene. */
        id_deportista: o.idDeportista,
        ...(micro ? {} : { origen: 'entrenador' }),
        disciplina,
        fecha_sesion: fecha,
        estado: 'Planificada',
        /* NO va `nombre`: esa columna no existe en `sesion`. Me la inventé
           porque el relleno trae el nombre de la plantilla y parecía el sitio
           natural, pero el resto de la app crea sesiones solo con disciplina,
           fecha y estado — la identidad de una sesión sale de sus TAREAS (zona
           y volumen), que es justo lo que pintan el calendario y el briefing.
           El nombre sigue viajando en el parte que se le enseña al usuario. */
      }).select('id').single()

      if (eS || !ses) return { ...base, error: eS?.message || 'No se pudo crear la sesión' }

      const err = r.claveFuerza
        ? await aplicarBloquesFuerza(sb, ses.id, r.claveFuerza)
        : await o.aplicarBloques(sb, ses.id, disciplina, ajuste!.bloques)
      return { ...base, ok: !err, error: err || undefined, ...(ajuste?.aviso && !err ? { aviso: ajuste.aviso } : {}) }
    } catch (e: any) {
      return { ...base, error: e?.message || 'Error inesperado' }
    }
  }))

  const creadas = parte.filter(p => p.ok).length
  return { parte, creadas, yaHabia, error: creadas ? null : 'No se pudo crear ninguna sesión.' }
}

/** Resumen del volcado, para decirlo en una línea. */
export function resumenVolcado(r: ResultadoVolcado): string {
  if (r.error && !r.creadas) return r.error
  const fallos = r.parte.filter(p => !p.ok)
  const libres = r.parte.filter(p => p.ok && !p.enSuPlan).length
  const descuadradas = r.parte.filter(p => p.ok && p.aviso)
  return [
    `${r.creadas} sesión(es) creadas.`,
    libres ? `${libres} entraron como sesión libre: esos días no tenía semana planificada.` : '',
    descuadradas.length ? `${descuadradas.length} no caben en sus minutos: ${descuadradas.map(f => f.dia).join(', ')}.` : '',
    fallos.length ? `${fallos.length} fallaron: ${fallos.map(f => f.dia).join(', ')}.` : '',
  ].filter(Boolean).join(' ')
}
