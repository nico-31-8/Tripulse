// ============================================================
// TRIPULSE — La anamnesis de un deportista: se lee y se guarda AQUÍ
// ============================================================
// Cada deportista tiene una anamnesis, pero la tabla no lo impide: no hay un
// único por `id_deportista`, y la deportista 20 llegó a tener cinco filas.
//
// CÓMO SE LLEGÓ A CINCO. Todo el que la leía usaba `.maybeSingle()`, y con dos
// filas eso no devuelve la primera: devuelve un ERROR y `data` a null. Nadie
// miraba el error, así que para la app no tenía anamnesis:
//   · /alta y /anamnesis, al no ver ninguna, INSERTABAN otra. Cada pasada por
//     el alta dejaba una fila más: el bucle se alimentaba solo.
//   · el planificador y /mi-plan usaban 8 h / 5 días por defecto en vez de sus
//     «5–8 h, 3–4 días», las zonas perdían su FC de reposo y el asistente
//     decía que no la había rellenado.
// La primera repetida no la hizo el alta, sino el autoguardado de /anamnesis:
// con un guardado en vuelo y la persona tecleando, el siguiente salía con el id
// todavía a null e insertaba otra (las filas 10 y 11, a 1,5 s).
//
// LA REGLA (la vigila lib/anamnesis-repetida.test.ts: fuera de este fichero
// nadie hace `.from('anamnesis')`):
//   · LEER es leer la VIGENTE: la más reciente, la de id más alto. Con filas
//     repetidas se lee una, no ninguna.
//   · GUARDAR es actualizar la vigente. Solo se crea una fila si no hay
//     NINGUNA, y eso se le pregunta a la base justo antes de crearla.
//   · Si la base no contesta, no se crea nada: un error no es «no hay fila».

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Lo que devuelve una lectura: la forma de supabase, para que encaje en un Promise.all. */
export interface LecturaAnamnesis<T = any> {
  data: T | null
  error: { message: string; code?: string } | null
}

/** Lo que devuelve un guardado: la fila en la que quedó y, si falló, por qué. */
export interface GuardadoAnamnesis {
  id: number | null
  error: string | null
}

/**
 * La anamnesis vigente de un deportista, o `null` si no tiene. `columnas` es el
 * select de siempre; por defecto, todas.
 *
 * Se ordena por id y no por `updated_at`: el id no es nunca null y no empata, y
 * como solo se escribe en la vigente, la de id más alto es también la última
 * que se tocó.
 */
export async function leerAnamnesis<T = any>(
  sb: any, idDeportista: number | string, columnas = '*',
): Promise<LecturaAnamnesis<T>> {
  const { data, error } = await sb.from('anamnesis').select(columnas)
    .eq('id_deportista', idDeportista)
    .order('id', { ascending: false })
    .limit(1)
  return { data: (data?.[0] ?? null) as T | null, error: error ?? null }
}

/**
 * De filas de varios deportistas, la vigente de cada uno. No se fía del orden
 * en que lleguen: quedarse con «la última que pasa» era quedarse con la que
 * tocara. Las filas tienen que traer `id` e `id_deportista`.
 */
export function vigentePorDeportista(filas: any[] | null | undefined): Map<number, any> {
  const m = new Map<number, any>()
  for (const f of filas || []) {
    if (f?.id_deportista == null) continue
    const k = Number(f.id_deportista)
    const ya = m.get(k)
    if (!ya || Number(f.id) > Number(ya.id)) m.set(k, f)
  }
  return m
}

/**
 * La vigente de cada uno de varios deportistas, en UNA consulta (para las
 * pantallas de grupo, que no pueden hacer una por cabeza). Además de
 * `columnas`, cada fila trae `id` e `id_deportista`, que hacen falta para elegir.
 */
export async function leerAnamnesisDeVarios(
  sb: any, ids: (number | string)[], columnas = '*',
): Promise<Map<number, any>> {
  const pedidas = columnas.split(',').map(c => c.trim()).filter(Boolean)
  const lista = pedidas.includes('*') ? '*'
    : [...new Set(['id', 'id_deportista', ...pedidas])].join(', ')
  const { data } = await sb.from('anamnesis').select(lista).in('id_deportista', ids)
  return vigentePorDeportista(data)
}

const NO_ESTA = 'Tu anamnesis ha cambiado mientras la tenías abierta. Recarga la página para no pisarla.'

/** Escribe en UNA fila concreta de ese deportista y dice cuántas tocó. */
async function escribirEn(sb: any, id: number, idDeportista: number, cambios: Record<string, unknown>) {
  const { data, error } = await sb.from('anamnesis').update(cambios)
    .eq('id', id).eq('id_deportista', idDeportista).select('id')
  return { tocadas: (data as unknown[] | null)?.length ?? 0, error: error ? String(error.message) : null }
}

/**
 * Guarda `cambios` en la anamnesis del deportista sin crear una segunda fila.
 *
 *   · Con `id` —la fila que la pantalla cargó—, escribe en esa y en ninguna
 *     otra. Si ya no está (se limpiaron las repetidas con la pantalla abierta)
 *     no se escribe en otra: el formulario tiene los datos de AQUELLA, y
 *     guardarlos encima de la que quedó la pisaría entera. Se avisa.
 *   · Sin `id`, se pregunta a la base cuál es la vigente y se actualiza esa.
 *     Solo si no hay ninguna se crea, con `alCrear` de partida (lo que traiga
 *     `cambios` manda sobre ello). Si la pregunta falla, no se crea nada.
 */
export async function guardarAnamnesis(
  sb: any, idDeportista: number, cambios: Record<string, unknown>,
  opciones: { id?: number | null; alCrear?: Record<string, unknown> } = {},
): Promise<GuardadoAnamnesis> {
  if (opciones.id != null) {
    const r = await escribirEn(sb, opciones.id, idDeportista, cambios)
    if (r.error) return { id: opciones.id, error: r.error }
    return r.tocadas ? { id: opciones.id, error: null } : { id: null, error: NO_ESTA }
  }

  const vigente = await leerAnamnesis(sb, idDeportista, 'id')
  if (vigente.error) return { id: null, error: vigente.error.message }
  if (vigente.data) {
    const r = await escribirEn(sb, vigente.data.id, idDeportista, cambios)
    if (r.error) return { id: vigente.data.id, error: r.error }
    return r.tocadas ? { id: vigente.data.id, error: null } : { id: null, error: NO_ESTA }
  }

  const { data, error } = await sb.from('anamnesis')
    .insert({ ...opciones.alCrear, ...cambios, id_deportista: idDeportista })
    .select('id').single()
  if (error) return { id: null, error: String(error.message) }
  return { id: data.id, error: null }
}

/**
 * Para una pantalla que guarda sola (el autoguardado de /anamnesis): cada
 * guardado espera a que acabe el anterior y sigue con la fila que ese encontró
 * o creó.
 *
 * Sin la cola, dos guardados que se cruzan preguntan a la vez si hay fila, los
 * dos oyen que no y los dos insertan. Y tampoco basta con que la pantalla
 * guarde el id en su estado: el temporizador ya programado se lleva el de
 * cuando se programó, que era null. Aquí el id vive en un sitio y es el mismo
 * para todos los guardados.
 */
export function guardadorDeAnamnesis(sb: any, idDeportista: number, idInicial: number | null = null) {
  let id = idInicial
  let cola: Promise<unknown> = Promise.resolve()
  return {
    /** La fila en la que se está guardando, o null si aún no hay ninguna. */
    get id() { return id },
    guardar(cambios: Record<string, unknown>, alCrear?: Record<string, unknown>): Promise<GuardadoAnamnesis> {
      const turno = cola.then(() => guardarAnamnesis(sb, idDeportista, cambios, { id, alCrear }))
        .then(r => { if (r.id != null) id = r.id; return r })
      cola = turno.catch(() => undefined)
      return turno
    },
  }
}
