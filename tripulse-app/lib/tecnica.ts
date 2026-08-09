// Las dos puntas de esto no coinciden y nunca coincidirán del todo: la disciplina
// de una tarea es «Natacion» y la etiqueta de la biblioteca es «Natación». Comparar
// tal cual devuelve lista vacía, que en pantalla se lee como «no hay ejercicios» y
// no como «están escritos distinto», que es lo que pasa de verdad.
export const sinTildes = (s: any) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

const TECNICA = sinTildes('Tecnica')

export const esDeTecnica = (ej: any) =>
  (ej?.tipo || []).some((t: any) => sinTildes(t) === TECNICA)

// Los drills de una disciplina. Sin disciplina, todos: más vale enseñar de más que
// dejar el desplegable vacío sin explicar por qué.
export function filtrarDrills(biblioteca: any[], disciplina: string): any[] {
  return (biblioteca || []).filter(e => esDeTecnica(e) &&
    (!disciplina || (e.disciplina || []).some((d: any) => sinTildes(d) === sinTildes(disciplina))))
}

// Catálogo para pintar un desplegable. Trae solo las cuatro columnas que hacen falta:
// `ejecucion` es un texto largo y multiplicado por toda la biblioteca no pinta nada
// en una lista de nombres.
export async function catalogoTecnica(sb?: any): Promise<any[]> {
  const cliente = sb || (await import('./supabase')).supabase
  const { data } = await cliente.from('ejercicios_biblioteca').select('id, nombre, tipo, disciplina')
  return (data || []).filter(esDeTecnica)
}

// El ejercicio de técnica que se ha prescrito vive en `ejercicios_biblioteca`, y la
// tarea solo guarda su id.
//
// NO se trae con un embed de PostgREST a propósito. Entre `tarea` y
// `ejercicios_biblioteca` hay más de un camino posible (la tabla `ejercicios` hace
// de puente entre las dos), así que el embed puede resolverse mal; y si esa consulta
// falla, no falla solo la técnica: se cae la consulta de tareas ENTERA y la sesión
// se queda en blanco. Una segunda consulta no puede tirar nada.
//
// De regalo: mientras la columna `tecnica_id` no exista, no hay ids, no hay segunda
// consulta, y todo se comporta exactamente igual que antes. Este código se puede
// subir antes de correr el SQL.
// El cliente se pide tarde y solo si hace falta: importarlo arriba monta el cliente
// de Supabase al cargar el módulo, y eso revienta en los tests, donde no hay ni URL
// ni clave. Mismo motivo por el que lib/plantillas-propias.ts lo recibe por fuera.
export async function conTecnica(tareas: any[] | null, sb?: any): Promise<any[]> {
  const filas = tareas || []
  const ids = [...new Set(filas.map(t => t?.tecnica_id).filter(Boolean))]
  if (!ids.length) return filas

  const cliente = sb || (await import('./supabase')).supabase
  const { data } = await cliente.from('ejercicios_biblioteca')
    .select('id, nombre, descripcion, ejecucion, url_video').in('id', ids)

  // Las claves se comparan como texto: el id puede llegar como número o como cadena
  // según de dónde venga, y un 12 !== '12' silencioso dejaría la técnica sin nombre
  // sin que nadie se entere.
  const porId = new Map((data || []).map((e: any) => [String(e.id), e]))
  return filas.map(t => t?.tecnica_id
    ? { ...t, tecnica: porId.get(String(t.tecnica_id)) || null }
    : t)
}
