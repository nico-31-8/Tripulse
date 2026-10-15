// ============================================================
// TRIPULSE — Copiar sesiones enteras, de golpe
// ============================================================
// Pegar una sesión en el calendario, pegar una semana, pegar en la vista del
// mesociclo y volcar el plan de un grupo son la misma operación: una sesión con
// sus tareas, y de cada tarea sus metros, su tiempo, sus repeticiones y sus
// ejercicios. Cada pantalla lo hacía a su manera, y de ahí salían dos fallos.
//
// 1. LENTO. Iba tarea a tarea: insertar la tarea, esperar su id, insertar sus
//    metros, esperar, sus repeticiones, esperar... Pegar una sesión de seis
//    tareas eran unos veinte viajes en serie a la base, y una semana entera,
//    más de cien. Aquí son CUATRO, se copie una sesión o veinte: leer el
//    origen, escribir las sesiones, escribir las tareas y escribir lo que
//    cuelga de ellas, cada paso de una vez.
//
// 2. CADA UNA COPIABA COLUMNAS DISTINTAS. El calendario tenía la lista de lo que
//    SÍ se copiaba y se le habían quedado fuera la zona propia congelada de la
//    tarea (`zona_copia`), la técnica, el test del día de test, los valores por
//    defecto, las transiciones del brick y la nutrición. La vista del mesociclo
//    copiaba TODO, también lo que el atleta hizo: pegar una sesión ya entrenada
//    arrastraba su RPE, su FC y sus metros reales a un encargo nuevo.
//
// Aquí se copia todo MENOS lo que pasó. Las listas son de lo que NO se copia,
// para que una columna nueva de prescripción viaje sola, sin que nadie tenga
// que acordarse — que es justo lo que falló con las seis de arriba. Lo que hay
// que recordar es lo contrario: si una columna nueva guarda lo que el atleta
// HIZO, va en estas listas. El test lee los .sql para que no se escape ninguna.

type Fila = Record<string, any>

/** De la sesión no se copia dónde va, de quién es, ni nada de lo que pasó. */
export const SIN_COPIAR_SESION = new Set([
  'id', 'created_at',
  // Dónde va y de quién es: lo dice el destino.
  'id_microciclo', 'fecha_sesion', 'id_deportista', 'origen', 'id_emision',
  // Lo que pasó.
  'estado', 'eliminada', 'notas_atleta', 'duracion_real', 'hora_inicio',
  'rpe_reportado', 'rpe_origen', 'notas_post',
  // El rastro de la ORIGINAL: qué propuso el asistente, quién la tocó.
  'propuesta_ia', 'cambiada_por', 'cambiada_en',
])

/** De la tarea, lo mismo; y lo que llega anidado, que se copia en su tabla. */
export const SIN_COPIAR_TAREA = new Set([
  'id', 'created_at', 'id_sesion', 'id_deportista',
  'fc_media', 'duracion_real', 'rpe_reportado', 'sensacion_tecnica',
  'dolor_muscular', 'sensacion_general', 'notas_post',
  'valoracion_tecnica_entrenador', 'hrv_del_dia', 'comentario_leido', 'resultado',
  'p_distancia', 'p_duracion', 'p_repeticiones', 'ejercicios',
])

/** De lo que cuelga de la tarea: lo real. Lo planeado y el objetivo, sí. */
export const SIN_COPIAR_HIJA = new Set([
  'id', 'created_at', 'id_tarea', 'id_deportista',
  'metros_reales', 'ritmo_medio', 'tiempo_real', 'potencia_real', 'repeticiones_reales',
])

/** Las cuatro tablas que cuelgan de una tarea. */
export const HIJAS = ['p_distancia', 'p_duracion', 'p_repeticiones', 'ejercicios'] as const

export function limpiar(fila: Fila | null | undefined, fuera: Set<string>): Fila {
  const salida: Fila = {}
  for (const k of Object.keys(fila || {})) if (!fuera.has(k)) salida[k] = (fila as Fila)[k]
  return salida
}

/** Un embed de PostgREST llega como lista, como objeto suelto o como null. */
export const comoLista = (x: unknown): Fila[] =>
  Array.isArray(x) ? x : x && typeof x === 'object' ? [x as Fila] : []

/**
 * Los ids de lo recién insertado, en el orden en que se mandaron las filas.
 *
 * Una inserción de golpe devuelve sus filas, pero nada promete que en el mismo
 * orden. Lo que sí es seguro es que la base reparte los ids de uno en uno y en
 * el orden de llegada, así que ordenados de menor a mayor, el primero es el de
 * la primera fila. Si las cuentas no cuadran, null: emparejar a ciegas sería
 * colgar los metros de una tarea en otra, y eso no se ve hasta que alguien
 * entrena con ellos.
 */
export function idsEnOrden(creadas: { id: unknown }[] | null | undefined, cuantas: number): number[] | null {
  const ids = (creadas || []).map(f => Number(f?.id)).filter(Number.isFinite)
  if (ids.length !== cuantas) return null
  return ids.sort((a, b) => a - b)
}

const porOrden = (a: Fila, b: Fila) => {
  const oa = a.orden ?? Infinity, ob = b.orden ?? Infinity
  return oa !== ob ? oa - ob : Number(a.id) - Number(b.id)
}
const porId = (a: Fila, b: Fila) => Number(a.id) - Number(b.id)

export interface OrigenCopia {
  sesiones: Map<number, Fila>
  /** Las tareas de cada sesión, en su orden, con sus hijas anidadas. */
  tareas: Map<number, Fila[]>
  error: string | null
}

/**
 * Lo que se va a copiar: las sesiones y sus tareas con todo lo que cuelga.
 *
 * Dos consultas a la vez. Las hijas vienen anidadas en la tarea para no
 * necesitar una tercera ronda que esperase a saber los ids.
 */
export async function leerOrigen(sb: any, ids: number[]): Promise<OrigenCopia> {
  const origenes = [...new Set((ids || []).map(Number).filter(Number.isFinite))]
  const vacio: OrigenCopia = { sesiones: new Map(), tareas: new Map(), error: null }
  if (!origenes.length) return vacio

  const [rs, rt] = await Promise.all([
    sb.from('sesion').select('*').in('id', origenes),
    sb.from('tarea').select('*, ' + HIJAS.map(h => h + '(*)').join(', '))
      .in('id_sesion', origenes).order('orden', { ascending: true }),
  ])
  if (rs?.error || rt?.error) return { ...vacio, error: (rs?.error || rt?.error).message || 'No se pudo leer la sesión de origen.' }

  const sesiones = new Map<number, Fila>()
  for (const s of rs?.data || []) sesiones.set(Number(s.id), s)
  const tareas = new Map<number, Fila[]>()
  for (const t of rt?.data || []) {
    const k = Number(t.id_sesion)
    const l = tareas.get(k)
    if (l) l.push(t); else tareas.set(k, [t])
  }
  for (const l of tareas.values()) l.sort(porOrden)
  return { sesiones, tareas, error: null }
}

export interface DestinoCopia {
  /** La sesión de la que se copia. */
  origen: number
  /**
   * Lo que la nueva lleva distinto: fecha, microciclo, deportista, origen...
   * Que TODOS los destinos de una llamada traigan las mismas claves: en una
   * inserción de golpe, la que falte en una fila se escribe como null.
   */
  campos: Fila
  /** Si viene, se escribe en tareas e hijas en vez de dejárselo al disparador. */
  idDeportista?: number
}

export interface OpcionesCopia {
  /**
   * Sin el ritmo guardado. Para copiar a OTRA persona: en modo entreno el
   * ritmo guardado le gana al calculado, y le enseñaría el ritmo de otro (ver
   * lib/grupos-volcado).
   */
  sinRitmo?: boolean
}

export interface ResultadoCopia {
  /** El id de cada sesión nueva, en el orden de los destinos; null si no se creó. */
  ids: (number | null)[]
  /** El primer fallo, dicho para el entrenador. Puede haber sesiones creadas igual. */
  error: string | null
}

/**
 * Escribe las copias de un origen ya leído. Tres rondas: sesiones, tareas, hijas.
 *
 * Separado de `leerOrigen` para quien copia lo mismo a varias personas: se lee
 * una vez y se escribe para cada una.
 */
export async function escribirCopias(
  sb: any, origen: OrigenCopia, destinos: DestinoCopia[], o: OpcionesCopia = {},
): Promise<ResultadoCopia> {
  const ids: (number | null)[] = destinos.map(() => null)
  if (!destinos.length) return { ids, error: null }
  if (origen.error) return { ids, error: origen.error }

  // ---- 1. Las sesiones ----
  const validos = destinos
    .map((d, i) => ({ d, i, src: origen.sesiones.get(Number(d.origen)) }))
    .filter(v => v.src)
  if (!validos.length) return { ids, error: 'No se encontró la sesión que se quería copiar.' }

  const filasSes = validos.map(v => ({ ...limpiar(v.src, SIN_COPIAR_SESION), estado: 'Planificada', ...v.d.campos }))
  const rS = await sb.from('sesion').insert(filasSes).select('id')
  if (rS?.error) return { ids, error: rS.error.message }
  const idsSes = idsEnOrden(rS?.data, filasSes.length)
  if (!idsSes) return { ids, error: 'La base no devolvió las sesiones creadas: revisa el calendario antes de volver a pegar.' }
  validos.forEach((v, k) => { ids[v.i] = idsSes[k] })
  const faltan = validos.length < destinos.length ? 'Alguna sesión de origen ya no existe y no se copió.' : null

  // ---- 2. Las tareas ----
  const filasTar: Fila[] = []
  const deDonde: { t: Fila; idDep?: number }[] = []
  validos.forEach((v, k) => {
    for (const t of origen.tareas.get(Number(v.d.origen)) || []) {
      filasTar.push({
        ...limpiar(t, SIN_COPIAR_TAREA),
        id_sesion: idsSes[k],
        ...(v.d.idDeportista != null ? { id_deportista: v.d.idDeportista } : {}),
      })
      deDonde.push({ t, idDep: v.d.idDeportista })
    }
  })
  if (!filasTar.length) return { ids, error: faltan }

  const rT = await sb.from('tarea').insert(filasTar).select('id')
  if (rT?.error) return { ids, error: 'Las sesiones se han creado, pero sus tareas no: ' + rT.error.message }
  const idsTar = idsEnOrden(rT?.data, filasTar.length)
  if (!idsTar) return { ids, error: 'Las sesiones se han creado, pero no se pudo comprobar que sus tareas también.' }

  // ---- 3. Lo que cuelga de cada tarea: las cuatro tablas a la vez ----
  const fuera = o.sinRitmo ? new Set([...SIN_COPIAR_HIJA, 'ritmo_objetivo']) : SIN_COPIAR_HIJA
  const lotes = HIJAS.map(tabla => {
    const filas: Fila[] = []
    deDonde.forEach((x, k) => {
      for (const h of comoLista(x.t[tabla]).slice().sort(porId)) {
        filas.push({
          ...limpiar(h, fuera),
          id_tarea: idsTar[k],
          ...(x.idDep != null ? { id_deportista: x.idDep } : {}),
        })
      }
    })
    return { tabla, filas }
  }).filter(l => l.filas.length)

  const rH = await Promise.all(lotes.map(l => sb.from(l.tabla).insert(l.filas)))
  const fallo = rH.find(r => r?.error)
  if (fallo) return { ids, error: 'Las tareas se han creado, pero no todo lo que llevan dentro: ' + fallo.error.message }
  return { ids, error: faltan }
}

/** Leer y escribir: la copia completa en cuatro viajes. */
export async function copiarSesiones(sb: any, destinos: DestinoCopia[], o: OpcionesCopia = {}): Promise<ResultadoCopia> {
  if (!destinos.length) return { ids: [], error: null }
  const origen = await leerOrigen(sb, destinos.map(d => d.origen))
  return escribirCopias(sb, origen, destinos, o)
}
