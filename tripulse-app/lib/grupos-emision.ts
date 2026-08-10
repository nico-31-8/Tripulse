// Emitir un entrenamiento a todo un grupo.
//
// El grupo no es dueño de nada: esto CREA UNA SESIÓN DE VERDAD por cada miembro.
// A partir de ahí son sesiones normales y corrientes, y todo lo que ya existe
// —carga, SICAT, calendario, ejecutar, briefing— funciona sin enterarse de nada.
//
// La sesión se guarda con ZONAS, nunca con ritmos. Es lo que hace que ocho personas
// puedan recibir el mismo entrenamiento y cada una vea SU ritmo, calculado con sus
// propios tests al abrirla. Ojo con esto si algún día se emite copiando tareas ya
// creadas a mano: `p_distancia.ritmo_objetivo` SÍ se guarda, y en modo entreno el
// guardado le gana al calculado, así que copiarlo tal cual le mostraría a los ocho
// el ritmo del primero. Sin fallo visible, y mintiendo a siete.

export interface BloqueEmision {
  zona: string
  series?: number
  metros?: number
  segundos?: number
  descansoSeg?: number
}

export interface ResultadoMiembro {
  id_deportista: number
  nombre: string
  ok: boolean
  enSuPlan: boolean      // cayó dentro de su microciclo, o entró como sesión libre
  error?: string
}

// El microciclo que cubre esa fecha, si lo hay. Un microciclo dura 7 días desde su
// fecha_inicio; se compara solo la parte de fecha para que la hora no descoloque el
// último día.
export function microDelDia(micros: any[], fecha: string): any | null {
  for (const m of micros || []) {
    if (!m?.fecha_inicio) continue
    const ini = new Date(String(m.fecha_inicio).slice(0, 10))
    const fin = new Date(ini)
    fin.setDate(ini.getDate() + (m.duracion_dias || 7))
    const d = new Date(String(fecha).slice(0, 10))
    if (d >= ini && d < fin) return m
  }
  return null
}

// Todos los microciclos de un deportista. La cadena es
// deportista → macrociclo → mesociclo → microciclo, y se corta en cuanto un eslabón
// viene vacío: sin plan no hay microciclos, y eso NO es un error.
export async function microsDeDeportista(sb: any, idDeportista: number): Promise<any[]> {
  const { data: mac } = await sb.from('macrociclo').select('id').eq('id_deportista', idDeportista)
  if (!mac?.length) return []
  const { data: me } = await sb.from('mesociclo').select('id').in('id_macrociclo', mac.map((m: any) => m.id))
  if (!me?.length) return []
  const { data: mi } = await sb.from('microciclo')
    .select('id, fecha_inicio, duracion_dias').in('id_mesociclo', me.map((m: any) => m.id))
  return mi || []
}

/**
 * Crea la sesión en el calendario de cada miembro.
 *
 * Si el deportista no tiene semana planificada para esa fecha, la sesión entra como
 * LIBRE (sin microciclo, con id_deportista y origen 'entrenador'). Es el mismo
 * camino que ya usa el calendario al pegar una plantilla en una semana sin planificar:
 * sin esto, medio grupo se quedaría fuera por no tener mesociclo montado.
 *
 * Va uno a uno y NO se para en el primer fallo: con ocho personas, que uno falle no
 * puede dejar a los otros siete sin su entrenamiento. Se devuelve el parte de cada
 * uno para poder decir exactamente quién sí y quién no.
 */
export async function emitirSesion(
  sb: any,
  opciones: {
    idGrupo: string
    nombre: string
    fecha: string
    disciplina: string
    bloques: BloqueEmision[]
    miembros: { id_deportista: number; nombre: string }[]
    aplicarBloques: (sb: any, idSesion: number, disciplina: string, bloques: BloqueEmision[]) => Promise<string | null>
  },
): Promise<{ idEmision: string | null; resultados: ResultadoMiembro[]; error: string | null }> {
  const { idGrupo, nombre, fecha, disciplina, bloques, miembros, aplicarBloques } = opciones

  if (!miembros.length) return { idEmision: null, resultados: [], error: 'El grupo no tiene a nadie.' }
  if (!fecha) return { idEmision: null, resultados: [], error: 'Falta la fecha.' }
  if (!disciplina) return { idEmision: null, resultados: [], error: 'Falta la disciplina.' }

  const { data: emi, error: eE } = await sb.from('grupo_entreno_emision')
    .insert({ id_grupo: idGrupo, nombre: nombre || null }).select('id').single()
  if (eE || !emi) return { idEmision: null, resultados: [], error: eE?.message || 'No se pudo abrir la emisión.' }

  const resultados: ResultadoMiembro[] = []
  for (const m of miembros) {
    try {
      const micros = await microsDeDeportista(sb, m.id_deportista)
      const micro = microDelDia(micros, fecha)

      const { data: ses, error: eS } = await sb.from('sesion').insert({
        id_microciclo: micro ? micro.id : null,
        ...(micro ? {} : { id_deportista: m.id_deportista, origen: 'entrenador' }),
        disciplina,
        fecha_sesion: fecha,
        estado: 'Planificada',
        id_emision: emi.id,
      }).select('id').single()

      if (eS || !ses) {
        resultados.push({ ...m, ok: false, enSuPlan: !!micro, error: eS?.message || 'No se pudo crear la sesión' })
        continue
      }

      const eB = bloques.length ? await aplicarBloques(sb, ses.id, disciplina, bloques) : null
      resultados.push({ ...m, ok: !eB, enSuPlan: !!micro, error: eB || undefined })
    } catch (e: any) {
      resultados.push({ ...m, ok: false, enSuPlan: false, error: e?.message || 'Error inesperado' })
    }
  }

  // Si no le llegó a nadie, la emisión no representa nada: se borra en vez de dejar
  // una fila fantasma que luego aparecería en el historial como si se hubiera mandado.
  if (!resultados.some(r => r.ok)) {
    await sb.from('grupo_entreno_emision').delete().eq('id', emi.id)
    return { idEmision: null, resultados, error: 'No se pudo crear ninguna sesión.' }
  }

  return { idEmision: emi.id, resultados, error: null }
}

// De qué grupo viene una sesión. El deportista tiene derecho a saber por qué le ha
// aparecido algo que no habló contigo.
//
// Dos consultas en vez de un embed de PostgREST, por lo mismo que en lib/tecnica:
// si el embed se resuelve mal no falla solo la etiqueta, se cae la consulta de la
// sesión entera. Y así también funciona antes de que exista la columna: sin
// id_emision no se pregunta nada.
export async function nombreDelGrupo(sb: any, idEmision: string | null | undefined): Promise<string | null> {
  if (!idEmision) return null
  const { data: e } = await sb.from('grupo_entreno_emision')
    .select('id_grupo').eq('id', idEmision).maybeSingle()
  if (!e?.id_grupo) return null
  const { data: g } = await sb.from('grupo_entreno')
    .select('nombre').eq('id', e.id_grupo).maybeSingle()
  return g?.nombre || null
}

export function resumenEmision(resultados: ResultadoMiembro[]): string {
  const ok = resultados.filter(r => r.ok)
  const libres = ok.filter(r => !r.enSuPlan).length
  let t = ok.length + ' de ' + resultados.length + (ok.length === 1 ? ' sesión creada' : ' sesiones creadas')
  if (libres > 0) t += ' · ' + libres + (libres === 1 ? ' sin semana planificada' : ' sin semana planificada')
  return t
}
