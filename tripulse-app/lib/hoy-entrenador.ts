// ============================================================
// Qué entrenas HOY — la tira del panel del entrenador
// ============================================================
//
// El panel pregunta «¿con quién trabajamos hoy?» y hasta ahora no sabía
// contestarlo: cargaba perfiles, wellness, competiciones y mesociclos, pero NI
// UNA consulta a `sesion`. Para saber qué tocaba había que elegir atleta, ir a
// planificación, al calendario, buscar el día y entrar.
//
// Eso convertía el modo de dirigir en algo que existía y no se usaba: de pie en
// el borde del vaso con el grupo esperando, nadie da seis toques.
//
// LO QUE SALE DE VARIOS ATLETAS A LA VEZ ES UNA SOLA FILA. Un entrenamiento de
// grupo se emite una vez y se materializa en una sesión por persona (ver
// lib/grupos-emision), así que en la base son cinco sesiones que comparten
// `id_emision`. Enseñarlas como cinco líneas sería mentir sobre lo que va a
// pasar en la pista: es un entrenamiento con cinco personas.

export interface SesionHoy {
  id: number
  id_deportista: number
  id_emision?: string | null
  disciplina?: string | null
  estado?: string | null
  hora?: string | null
}

export interface GrupoDeEmision {
  idGrupo: string
  nombre: string
}

export interface FilaHoy {
  /** `sesion:<id>` o `emision:<id>`. Sirve de key y dice a dónde lleva. */
  clave: string
  esGrupo: boolean
  /** El nombre del atleta, o el del grupo. */
  titulo: string
  disciplina: string
  /** Cuántas personas van. 1 en las individuales. */
  cuantos: number
  /** A dónde lleva el botón de dirigir. */
  destino: string
  /** Para ordenar y para enseñarla. Puede no haber. */
  hora: string | null
  /** true si todas las sesiones de la fila están cerradas. */
  hecha: boolean
  /** Las sesiones que la componen, por si hace falta el detalle. */
  sesiones: SesionHoy[]
}

const norm = (s: string | null | undefined) => String(s || '').trim()

/**
 * La hora de una sesión en `HH:MM`, o null.
 *
 * Se acepta tanto `07:30` como un timestamp entero, porque según por dónde se
 * creara la sesión la columna trae una cosa u otra. Lo que NO se hace es
 * inventarse una hora cuando no la hay: sin hora, la fila va al final y se
 * enseña sin ella, que es la verdad.
 */
export function horaDe(v: string | null | undefined): string | null {
  const s = norm(v)
  if (!s) return null
  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  if (h > 23 || Number(m[2]) > 59) return null
  return String(h).padStart(2, '0') + ':' + m[2]
}

/**
 * Las filas de hoy, agrupando por emisión.
 *
 * `nombres` es id de deportista → nombre. `grupos` es id de emisión → el grupo
 * del que salió. Si no se conoce, se dice «Grupo» a secas: es peor enseñar un
 * identificador que una palabra genérica.
 */
export function filasDeHoy(
  sesiones: SesionHoy[] | null | undefined,
  nombres: Record<number, string>,
  grupos: Record<string, GrupoDeEmision>,
): FilaHoy[] {
  const porEmision = new Map<string, SesionHoy[]>()
  const sueltas: SesionHoy[] = []

  for (const s of sesiones || []) {
    const em = norm(s.id_emision)
    if (em) {
      const l = porEmision.get(em)
      if (l) l.push(s); else porEmision.set(em, [s])
    } else {
      sueltas.push(s)
    }
  }

  const filas: FilaHoy[] = []

  for (const [em, lista] of porEmision) {
    /* Una emisión con UNA sola sesión no es un grupo: es un atleta al que le
       llegó por esa vía. Enseñarla como grupo diría que hay gente esperando que
       no está. */
    if (lista.length === 1) { sueltas.push(lista[0]); continue }
    filas.push({
      clave: 'emision:' + em,
      esGrupo: true,
      titulo: grupos[em]?.nombre || 'Grupo',
      disciplina: norm(lista[0].disciplina) || '—',
      cuantos: lista.length,
      destino: '/grupo/' + (grupos[em]?.idGrupo || '') + '/dirigir',
      hora: horaDe(lista.find(s => horaDe(s.hora))?.hora),
      hecha: lista.every(s => s.estado === 'Realizada'),
      sesiones: lista,
    })
  }

  for (const s of sueltas) {
    filas.push({
      clave: 'sesion:' + s.id,
      esGrupo: false,
      titulo: nombres[s.id_deportista] || 'Deportista',
      disciplina: norm(s.disciplina) || '—',
      cuantos: 1,
      destino: '/sesion/' + s.id + '/dirigir',
      hora: horaDe(s.hora),
      hecha: s.estado === 'Realizada',
      sesiones: [s],
    })
  }

  return ordenar(filas)
}

/**
 * Primero lo que queda por hacer y antes lo que es más temprano.
 *
 * Las que no tienen hora van detrás de las que sí, dentro de su grupo: no se
 * les pone una hora falsa para poder ordenarlas. Y lo ya realizado baja del
 * todo — sigue estando, porque cerrar la mañana también es mirar lo hecho, pero
 * no ocupa el sitio de lo que falta.
 */
export function ordenar(filas: FilaHoy[]): FilaHoy[] {
  return [...filas].sort((a, b) => {
    if (a.hecha !== b.hecha) return a.hecha ? 1 : -1
    if (!a.hora && !b.hora) return a.titulo.localeCompare(b.titulo, 'es')
    if (!a.hora) return 1
    if (!b.hora) return -1
    return a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : a.titulo.localeCompare(b.titulo, 'es')
  })
}

/** «3 sesiones · 1 grupo», para la cabecera de la tira. */
export function resumenDeHoy(filas: FilaHoy[]): string {
  if (!filas.length) return 'Hoy no entrena nadie'
  const pendientes = filas.filter(f => !f.hecha).length
  const personas = filas.reduce((a, f) => a + f.cuantos, 0)
  if (pendientes === 0) return 'Todo hecho · ' + personas + (personas === 1 ? ' sesión' : ' sesiones')
  return pendientes + (pendientes === 1 ? ' por dirigir' : ' por dirigir')
    + ' · ' + personas + (personas === 1 ? ' atleta' : ' atletas')
}
