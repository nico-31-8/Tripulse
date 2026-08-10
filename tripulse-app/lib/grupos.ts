// Grupos de entrenamiento.
//
// El grupo NO es dueño de las sesiones: cada deportista tiene la suya, de verdad.
// El grupo guarda quién está dentro y de dónde salió cada prescripción. Ver
// supabase/grupos-1-esquema.sql.
//
// El cliente de Supabase se recibe por parámetro (igual que en plantillas-propias):
// importarlo arriba monta el cliente al cargar el módulo y eso revienta en los
// tests, donde no hay ni URL ni clave.

export interface Grupo {
  id: string
  nombre: string
  descripcion: string | null
  archivado: boolean
  created_at?: string
}

export interface MiembroGrupo {
  id_deportista: number
  nombre: string
  desde: string
  hasta: string | null
  // Viaja con el miembro porque es lo que decide el sistema de zonas del grupo.
  sistema_zonas?: number | null
}

export const ERROR_FALTA_ESQUEMA =
  'Faltan las tablas de grupos: ejecuta supabase/grupos-1-esquema.sql en el SQL Editor de Supabase.'

// Distingue "la migración no está puesta" de "ha fallado otra cosa".
//
// La primera versión buscaba el nombre de la tabla dentro del mensaje, y eso
// convertía CUALQUIER error de estas tablas en "falta la migración". Con el SQL ya
// aplicado, un error de políticas que decía «infinite recursion detected in policy
// for relation "grupo_entreno"» salía en pantalla como «faltan las tablas de
// grupos». Mandaba a ejecutar otra vez algo que ya estaba puesto y escondía el
// problema real. Un diagnóstico que miente es peor que no tener ninguno.
//
// Ahora se mira el CÓDIGO, y solo las frases que de verdad significan "no existe".
export function faltaEsquema(e: any): boolean {
  const code = String(e?.code || '').toUpperCase()
  if (code === '42P01' || code === 'PGRST205') return true
  const m = String(e?.message || '').toLowerCase()
  return m.includes('does not exist') || m.includes('schema cache')
}

export async function cargarGrupos(sb: any): Promise<{ grupos: Grupo[]; error: string | null }> {
  const { data, error } = await sb.from('grupo_entreno')
    .select('id, nombre, descripcion, archivado, created_at')
    .eq('archivado', false)
    .order('created_at', { ascending: false })
  if (error) return { grupos: [], error: faltaEsquema(error) ? ERROR_FALTA_ESQUEMA : error.message }
  return { grupos: data || [], error: null }
}

// Cuántos miembros activos tiene cada grupo, en una sola consulta. Con un grupo por
// consulta, diez grupos serían once viajes.
export async function contarMiembros(sb: any, ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {}
  const { data } = await sb.from('grupo_entreno_miembro')
    .select('id_grupo, hasta').in('id_grupo', ids).is('hasta', null)
  const cuenta: Record<string, number> = {}
  for (const m of data || []) cuenta[m.id_grupo] = (cuenta[m.id_grupo] || 0) + 1
  return cuenta
}

export async function miembrosDe(sb: any, idGrupo: string): Promise<MiembroGrupo[]> {
  const { data } = await sb.from('grupo_entreno_miembro')
    .select('id_deportista, desde, hasta, deportista(nombre, sistema_zonas)')
    .eq('id_grupo', idGrupo).is('hasta', null)
  return (data || []).map((m: any) => ({
    id_deportista: m.id_deportista,
    nombre: m.deportista?.nombre || '(sin nombre)',
    desde: m.desde,
    hasta: m.hasta,
    sistema_zonas: m.deportista?.sistema_zonas ?? null,
  }))
}

// Crea el grupo y mete a sus miembros. Si lo segundo falla, se deshace lo primero:
// un grupo vacío que nadie pidió es basura que el entrenador tendría que limpiar a
// mano, y encima parecería que la operación funcionó.
export async function crearGrupo(
  sb: any, idEntrenador: string, nombre: string, idsDeportistas: number[], descripcion?: string,
): Promise<{ id: string | null; error: string | null }> {
  const limpio = (nombre || '').trim()
  if (!limpio) return { id: null, error: 'El grupo necesita un nombre.' }
  if (!idsDeportistas.length) return { id: null, error: 'Elige al menos un deportista.' }

  const { data: g, error: eG } = await sb.from('grupo_entreno')
    .insert({ id_entrenador: idEntrenador, nombre: limpio, descripcion: descripcion?.trim() || null })
    .select('id').single()
  if (eG || !g) return { id: null, error: faltaEsquema(eG) ? ERROR_FALTA_ESQUEMA : (eG?.message || 'No se pudo crear el grupo.') }

  const { error: eM } = await sb.from('grupo_entreno_miembro')
    .insert(idsDeportistas.map(id => ({ id_grupo: g.id, id_deportista: id })))
  if (eM) {
    await sb.from('grupo_entreno').delete().eq('id', g.id)
    return { id: null, error: eM.message }
  }
  return { id: g.id, error: null }
}

// Sacar a alguien no borra su fila: se cierra con fecha. Lo que ya entrenó con el
// grupo sigue teniendo sentido, y se puede saber quién estaba dentro en marzo.
export async function sacarDelGrupo(sb: any, idGrupo: string, idDeportista: number): Promise<string | null> {
  const { error } = await sb.from('grupo_entreno_miembro')
    .update({ hasta: new Date().toISOString().slice(0, 10) })
    .eq('id_grupo', idGrupo).eq('id_deportista', idDeportista)
  return error ? error.message : null
}

// Volver a meter a alguien reabre su fila en vez de crear otra: la clave es
// (grupo, deportista), así que un insert chocaría.
export async function meterEnGrupo(sb: any, idGrupo: string, idsDeportistas: number[]): Promise<string | null> {
  if (!idsDeportistas.length) return null
  const { data: previos } = await sb.from('grupo_entreno_miembro')
    .select('id_deportista').eq('id_grupo', idGrupo).in('id_deportista', idsDeportistas)
  const yaEstaban = new Set((previos || []).map((p: any) => String(p.id_deportista)))

  const reabrir = idsDeportistas.filter(id => yaEstaban.has(String(id)))
  const nuevos = idsDeportistas.filter(id => !yaEstaban.has(String(id)))

  if (reabrir.length) {
    const { error } = await sb.from('grupo_entreno_miembro')
      .update({ hasta: null, desde: new Date().toISOString().slice(0, 10) })
      .eq('id_grupo', idGrupo).in('id_deportista', reabrir)
    if (error) return error.message
  }
  if (nuevos.length) {
    const { error } = await sb.from('grupo_entreno_miembro')
      .insert(nuevos.map(id => ({ id_grupo: idGrupo, id_deportista: id })))
    if (error) return error.message
  }
  return null
}

// La ficha de planificación del grupo: para el calendario y el dibujo, un grupo es
// un deportista más, y así todo eso funciona sin tocarse. Se crea la primera vez que
// hace falta, no al crear el grupo: un grupo al que nunca planificas no necesita
// ninguna.
//
// La crea una función de base de datos y no la app a propósito. La ficha DEBE ir con
// id_entrenador nulo —es lo que la mantiene fuera de las listas de atletas y del
// cupo— y eso no puede depender de que quien la inserte se acuerde.
export async function fichaDeGrupo(sb: any, idGrupo: string): Promise<{ id: number | null; error: string | null }> {
  const { data, error } = await sb.rpc('ficha_de_grupo', { _id_grupo: idGrupo })
  if (error) return { id: null, error: faltaEsquema(error) ? ERROR_FALTA_PLAN : error.message }
  return { id: data as number, error: null }
}

export const ERROR_FALTA_PLAN =
  'Falta el paso 2: ejecuta supabase/grupos-2-plan.sql en el SQL Editor de Supabase.'

// Borra el grupo entero.
//
// Se lleva por delante sus miembros y su ficha de planificación — o sea el
// calendario y la periodización DEL GRUPO (van en cascada desde grupo_entreno).
//
// Lo que NO se toca son las sesiones ya volcadas a la gente: `sesion.id_emision`
// es `on delete set null`, así que se quedan en su calendario y solo pierden la
// etiqueta de dónde vinieron. Es lo correcto: una vez mandado, el entrenamiento es
// suyo, y borrar un grupo no puede vaciarle la semana a nadie.
export async function borrarGrupo(sb: any, idGrupo: string): Promise<string | null> {
  const { error } = await sb.from('grupo_entreno').delete().eq('id', idGrupo)
  return error ? error.message : null
}

// Renombra el grupo Y su ficha de planificación. Las dos, porque la cabecera del
// calendario lee el nombre de la ficha: si solo se cambiara una, el grupo se
// llamaría de una forma en la lista y de otra en su propio calendario.
export async function renombrarGrupo(
  sb: any, idGrupo: string, nombre: string, idFicha?: number | null,
): Promise<string | null> {
  const limpio = (nombre || '').trim()
  if (!limpio) return 'El grupo necesita un nombre.'
  const { error } = await sb.from('grupo_entreno').update({ nombre: limpio }).eq('id', idGrupo)
  if (error) return error.message
  if (idFicha) await sb.from('deportista').update({ nombre: limpio }).eq('id', idFicha)
  return null
}

// El sistema de zonas que usan la mayoría. Empate → gana el 2, que es donde viven
// las siglas y todo lo nuevo de la app.
//
// Esto importa más de lo que parece: el sistema decide QUÉ ZONAS EXISTEN (Z1–Z7 o
// las siglas AER/AEL/AEM…). Si el grupo planifica en uno y sus miembros trabajan en
// otro, lo que se vuelca llega escrito en un idioma que sus referencias no
// reconocen. No falla nada; las zonas simplemente no significan lo mismo.
export function sistemaZonasMayoritario(valores: (number | null | undefined)[]): number {
  if (!valores?.length) return 2
  const cuenta: Record<number, number> = {}
  for (const v of valores) { const s = v === 2 ? 2 : 1; cuenta[s] = (cuenta[s] || 0) + 1 }
  if ((cuenta[2] || 0) >= (cuenta[1] || 0)) return 2
  return 1
}

export async function sincronizarZonasDelGrupo(
  sb: any, idFicha: number, valoresDeLosMiembros: (number | null | undefined)[],
): Promise<{ sistema: number; error: string | null }> {
  const sistema = sistemaZonasMayoritario(valoresDeLosMiembros)
  const { error } = await sb.from('deportista').update({ sistema_zonas: sistema }).eq('id', idFicha)
  return { sistema, error: error ? error.message : null }
}

// Qué tests le faltan a cada uno. En un grupo esto importa: la zona se prescribe
// igual para todos, pero sin VAM, FTP o CSS esa persona no ve ritmo ni vatios, solo
// el porcentaje teórico. Con ocho atletas es casi seguro que alguno no los tenga, y
// hoy no hay ninguna pantalla que lo diga.
export const TEST_DE_DISCIPLINA: Record<string, string> = {
  Carrera: 'VAM', Ciclismo: 'FTP', Natacion: 'CSS',
}

export function testsQueFaltan(
  tests: { vam?: number | null; ftp?: number | null; css?: number | null } | null | undefined,
): string[] {
  const t = tests || {}
  const faltan: string[] = []
  if (!t.vam) faltan.push('VAM')
  if (!t.ftp) faltan.push('FTP')
  if (!t.css) faltan.push('CSS')
  return faltan
}
