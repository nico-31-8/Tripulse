// Quién ha hecho lo que mandaste y quién no.
//
// Es lo que le faltaba al panel del grupo para servir de algo: mandas ocho
// entrenamientos y hasta ahora no había ningún sitio donde ver qué ha pasado con
// ellos. El dato ya estaba en la base — cada copia es una sesión normal con su
// estado —, solo había que juntarlo.

export type EstadoSesion = 'Realizada' | 'Planificada' | 'Cancelada'

export interface ColumnaCumplimiento {
  clave: string
  fecha: string
  disciplina: string
}

export interface FilaCumplimiento {
  id_deportista: number
  nombre: string
  hechas: number
  mandadas: number
  porColumna: Record<string, EstadoSesion>
}

export interface Cumplimiento {
  columnas: ColumnaCumplimiento[]
  filas: FilaCumplimiento[]
  hechas: number
  mandadas: number
}

// Cada columna es un entrenamiento mandado. Se identifica por la emisión, el día y
// el deporte, no por la sesión del grupo: la copia no guarda de qué sesión salió,
// solo de qué emisión. Dos entrenamientos del mismo deporte, el mismo día y en la
// misma emisión saldrían en la misma columna — es raro y, cuando pasa, son la misma
// cosa a efectos de mirar quién la hizo.
export const claveColumna = (s: any) =>
  String(s.id_emision) + '|' + String(s.fecha_sesion).slice(0, 10) + '|' + String(s.disciplina || '')

export function construirCumplimiento(
  sesiones: any[], miembros: { id_deportista: number; nombre: string }[],
): Cumplimiento {
  const cols = new Map<string, ColumnaCumplimiento>()
  for (const s of sesiones || []) {
    const clave = claveColumna(s)
    if (!cols.has(clave)) {
      cols.set(clave, { clave, fecha: String(s.fecha_sesion).slice(0, 10), disciplina: s.disciplina || '—' })
    }
  }
  const columnas = [...cols.values()].sort((a, b) =>
    a.fecha === b.fecha ? a.disciplina.localeCompare(b.disciplina) : a.fecha.localeCompare(b.fecha))

  const filas: FilaCumplimiento[] = miembros.map(m => {
    const suyas = (sesiones || []).filter(s => String(s.id_deportista) === String(m.id_deportista))
    const porColumna: Record<string, EstadoSesion> = {}
    for (const s of suyas) porColumna[claveColumna(s)] = (s.estado || 'Planificada') as EstadoSesion
    return {
      id_deportista: m.id_deportista,
      nombre: m.nombre,
      // «Mandadas» son las que esa persona tiene de verdad, no el total de columnas:
      // quien entró al grupo más tarde no recibió las de antes, y contárselas como
      // no hechas sería acusarle de algo que nunca se le pidió.
      mandadas: suyas.length,
      hechas: suyas.filter(s => s.estado === 'Realizada').length,
      porColumna,
    }
  })

  return {
    columnas,
    filas,
    hechas: filas.reduce((a, f) => a + f.hechas, 0),
    mandadas: filas.reduce((a, f) => a + f.mandadas, 0),
  }
}

export async function cargarCumplimiento(
  sb: any, idGrupo: string, miembros: { id_deportista: number; nombre: string }[],
  desde: string, hasta: string,
): Promise<Cumplimiento> {
  const vacio: Cumplimiento = { columnas: [], filas: [], hechas: 0, mandadas: 0 }
  if (!miembros.length) return vacio

  const { data: emis } = await sb.from('grupo_entreno_emision').select('id').eq('id_grupo', idGrupo)
  const idsEmi = (emis || []).map((e: any) => e.id)
  if (!idsEmi.length) return vacio

  const { data } = await sb.from('sesion')
    .select('id, id_emision, id_deportista, fecha_sesion, disciplina, estado')
    .in('id_emision', idsEmi).in('id_deportista', miembros.map(m => m.id_deportista))
    .gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
    .or('eliminada.is.null,eliminada.eq.false')
    .order('fecha_sesion')

  return construirCumplimiento(data || [], miembros)
}

// Porcentaje redondeado. Sin nada mandado NO se devuelve 0: cero de cero no es un
// suspenso, es que no hay nada que medir todavía.
export function porcentaje(c: { hechas: number; mandadas: number }): number | null {
  if (!c.mandadas) return null
  return Math.round((c.hechas / c.mandadas) * 100)
}
