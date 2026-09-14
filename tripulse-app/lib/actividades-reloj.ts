// ============================================================
// TRIPULSE — Los entrenos que manda el reloj, listos para mirar
// ============================================================
// `reloj_medicion` guarda una fila por actividad con un `datos` en JSON, y ese
// JSON lo escribe el traductor de cada marca (`lib/polar.ts` hoy; COROS cuando
// conecte el primero). Esta capa lo convierte en algo que una pantalla pueda
// pintar sin saber de qué marca viene.
//
// POR QUÉ ES TAN DESCONFIADA: lo de aquí no lo hemos escrito nosotros, lo ha
// escrito el reloj. Un campo que hoy es un número puede llegar mañana como
// texto, o no llegar. La regla es la misma de siempre: lo que no se entiende se
// queda en `null` y la pantalla enseña un guion, en vez de un 0 que parece un
// dato medido.
//
// Tampoco se inventa la disciplina: un triatlón o un esquí de fondo no son
// ninguna de las cuatro nuestras, y meterlos en la que se parezca ensuciaría la
// carga de esa disciplina (mismo criterio que `disciplinaDePolar`).

export interface FilaMedicion {
  id?: number
  proveedor?: string | null
  fecha?: string | null
  id_externo?: string | null
  datos?: unknown
  recibido_en?: string | null
}

export interface ActividadReloj {
  id: number
  proveedor: string
  /** El día al que pertenece, en la hora local del atleta. */
  fecha: string
  /** «07:12», o null si el reloj no dijo a qué hora. */
  hora: string | null
  /** Una de las nuestras, o null si el deporte no es ninguna de las cuatro. */
  disciplina: string | null
  /** Cómo lo llama el reloj: «RUNNING», «ROAD_BIKING»… Para no perder el matiz. */
  deporte: string | null
  minutos: number | null
  metros: number | null
  fcMedia: number | null
  fcMax: number | null
  calorias: number | null
  /** La carga que calcula el propio reloj, con su nombre y su escala. */
  cargaDelReloj: number | null
}

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

/**
 * Un número, venga como número o como texto.
 *
 * Acepta la cadena porque distintas marcas serializan distinto el mismo campo, y
 * un `"52"` que se quedara en null sería un dato perdido sin ruido. Lo que no
 * es finito se descarta: `NaN` e `Infinity` pintan peor que un guion.
 */
const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Positivo o nada: un entreno de 0 minutos o de 0 metros no es un dato, es un hueco. */
const positivo = (v: unknown): number | null => {
  const n = numero(v)
  return n != null && n > 0 ? n : null
}

const DISCIPLINAS = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza']

/** La hora de un `inicio` tipo «2026-09-12T07:12:31.000». Sin zona: es la local del atleta. */
export function horaDe(inicio: unknown): string | null {
  const s = texto(inicio)
  if (!s) return null
  const m = s.match(/T(\d{2}):(\d{2})/)
  return m ? m[1] + ':' + m[2] : null
}

/** Una fila de `reloj_medicion` de tipo entreno, o null si no hay nada que enseñar. */
export function actividadDeMedicion(fila: FilaMedicion): ActividadReloj | null {
  if (!fila || fila.id == null) return null
  const fecha = texto(fila.fecha)?.slice(0, 10)
  if (!fecha) return null
  const d = (fila.datos && typeof fila.datos === 'object' ? fila.datos : {}) as Record<string, unknown>

  const disciplina = texto(d.disciplina)
  return {
    id: fila.id,
    proveedor: texto(fila.proveedor) || 'reloj',
    fecha,
    hora: horaDe(d.inicio),
    disciplina: disciplina && DISCIPLINAS.includes(disciplina) ? disciplina : null,
    deporte: texto(d.deporte_detalle) || texto(d.deporte),
    minutos: positivo(d.duracion_min),
    metros: positivo(d.distancia_m),
    fcMedia: positivo(d.fc_media),
    fcMax: positivo(d.fc_max),
    calorias: positivo(d.calorias),
    cargaDelReloj: positivo(d.carga_polar) ?? positivo(d.carga),
  }
}

/** Todas, de la más reciente a la más antigua. Lo que no se entiende se cae. */
export function actividadesDeMediciones(filas: FilaMedicion[]): ActividadReloj[] {
  return (filas || [])
    .map(actividadDeMedicion)
    .filter((a): a is ActividadReloj => a !== null)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.hora || '').localeCompare(a.hora || ''))
}

// ------------------------------------------------------------
// Para leerlo
// ------------------------------------------------------------

/** «ROAD_BIKING» → «Road biking». El reloj grita; aquí no hace falta. */
export function nombreDeporte(deporte: string | null): string | null {
  if (!deporte) return null
  const s = deporte.replace(/_/g, ' ').toLowerCase()
  return s[0].toUpperCase() + s.slice(1)
}

/** «7,4 km» o «1.900 m»: en natación los kilómetros no dicen nada. */
export function distanciaTexto(metros: number | null, disciplina?: string | null): string {
  if (metros == null) return '—'
  if (disciplina === 'Natacion' || metros < 1000) return Math.round(metros).toLocaleString('es-ES') + ' m'
  return (Math.round(metros / 100) / 10).toFixed(1).replace('.', ',') + ' km'
}

/**
 * El ritmo, en lo que se lee en cada deporte.
 *
 * Correr y nadar se leen por tiempo por distancia; la bici, en km/h. Y solo se
 * calcula cuando hay las dos cosas: un ritmo sacado de una distancia que no
 * llegó sería inventado.
 */
export function ritmoTexto(a: Pick<ActividadReloj, 'minutos' | 'metros' | 'disciplina'>): string | null {
  if (!a.minutos || !a.metros) return null
  if (a.disciplina === 'Ciclismo') {
    return (Math.round((a.metros / 1000) / (a.minutos / 60) * 10) / 10).toFixed(1).replace('.', ',') + ' km/h'
  }
  const porUnidad = a.disciplina === 'Natacion' ? 100 : 1000
  const seg = Math.round((a.minutos * 60) / (a.metros / porUnidad))
  if (!Number.isFinite(seg) || seg <= 0) return null
  const mm = Math.floor(seg / 60), ss = seg % 60
  return mm + ':' + String(ss).padStart(2, '0') + (porUnidad === 100 ? ' /100 m' : ' /km')
}

export interface TotalesReloj {
  actividades: number
  minutos: number
  metros: number
  /** Cuántas no se pudieron asignar a una de nuestras cuatro disciplinas. */
  sinDisciplina: number
}

export function totales(as: ActividadReloj[]): TotalesReloj {
  return {
    actividades: as.length,
    minutos: as.reduce((t, a) => t + (a.minutos || 0), 0),
    metros: as.reduce((t, a) => t + (a.metros || 0), 0),
    sinDisciplina: as.filter(a => !a.disciplina).length,
  }
}
