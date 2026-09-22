// ============================================================
// TRIPULSE — Las disciplinas: cuáles hay y cuáles programa cada deportista
// ============================================================
//
// UN SOLO CATÁLOGO. Las disciplinas estaban escritas a mano en una treintena de
// sitios —cada pantalla con su lista, su color y su icono—, y añadir una nueva
// era ir pantalla por pantalla esperando no olvidar ninguna. Aquí están una vez.
//
// HÍBRIDO = FUERZA CON CARDIO. Entrenamiento tipo HYROX: ejercicios de fuerza,
// complejos y líneas de cardio (carrera, remo, ski, trineo…) en la misma sesión.
// Se programa con la MISMA tabla que Fuerza y su carga sale igual, del RPE y la
// duración. Sus tareas se guardan como 'Hibrido', no como 'Fuerza': así el
// reparto de carga por bloque (lib/atribucion) lo cuenta aparte y en las
// gráficas sale como lo que es.
//
// CADA DEPORTISTA, LAS SUYAS. Un corredor no necesita ver natación cada vez que
// se le programa algo. En su ficha, el entrenador marca qué disciplinas le salen
// (`deportista.disciplinas`). Vacío = todas: así los que ya existían no
// cambian. Solo filtra los menús del ENTRENADOR al programar; el deportista, al
// apuntarse una sesión por su cuenta, sigue viéndolas todas.

export const HIBRIDO = 'Hibrido'

export interface Disciplina {
  id: string
  label: string
  emoji: string
  /** El color de las gráficas y los puntos del calendario. */
  color: string
}

/** Todas, en el orden en que salen en los menús. */
export const CATALOGO: Disciplina[] = [
  { id: 'Natacion', label: 'Natación', emoji: '🏊', color: '#60a5fa' },
  { id: 'Ciclismo', label: 'Ciclismo', emoji: '🚴', color: '#fbbf24' },
  { id: 'Carrera', label: 'Carrera', emoji: '🏃', color: '#4ade80' },
  { id: 'Fuerza', label: 'Fuerza', emoji: '🏋️', color: '#f87171' },
  { id: 'Brick', label: 'Brick', emoji: '🔀', color: '#a855f7' },
  { id: HIBRIDO, label: 'Híbrido', emoji: '⚡', color: '#f472b6' },
]

export const TODAS: string[] = CATALOGO.map(d => d.id)

/**
 * Las que reciben carga y volumen: todas menos Brick, que es un FORMATO y
 * reparte lo suyo entre los deportes de sus bloques (lib/atribucion).
 *
 * Las gráficas que suman «Natación + Ciclismo + Carrera + Fuerza» escritas a
 * mano dejaban fuera cualquier disciplina nueva: su carga desaparecía del
 * total sin avisar. Es lo que les pasó a los bricks, y le pasaría a Híbrido.
 */
export const DEPORTES: string[] = TODAS.filter(d => d !== 'Brick')

/** 'Natación' con tilde es como se guardaban las sesiones antiguas. */
export const normalizar = (d: string | null | undefined): string =>
  d === 'Natación' ? 'Natacion' : (d || '')

const info = (d: string | null | undefined): Disciplina | undefined =>
  CATALOGO.find(x => x.id === normalizar(d))

export const etiquetaDisciplina = (d: string | null | undefined): string => info(d)?.label || d || ''
export const emojiDisciplina = (d: string | null | undefined): string => info(d)?.emoji || ''
export const colorDisciplina = (d: string | null | undefined): string => info(d)?.color || '#9ca3af'

/** Las que se programan con la tabla de fuerza. */
export const DISCIPLINAS_DE_FUERZA = ['Fuerza', HIBRIDO]

/**
 * Si se programa con la tabla de fuerza (ejercicios, complejos, cardio).
 *
 * Es LA pregunta que se hacían unas sesenta comprobaciones repartidas por la
 * app con `=== 'Fuerza'`. Con Híbrido la respuesta dejó de ser una sola
 * disciplina, y cada comprobación que se quedara con la vieja abriría una
 * sesión híbrida con el editor de carrera.
 */
export const esDisciplinaDeFuerza = (d: string | null | undefined): boolean =>
  DISCIPLINAS_DE_FUERZA.includes(normalizar(d))

/**
 * Con qué disciplina se guarda una tarea de la tabla de fuerza.
 *
 * La de la sesión: en una híbrida, 'Hibrido'. Guardarla como 'Fuerza' haría
 * que el reparto por bloque (lib/atribucion) contara la sesión híbrida como
 * fuerza en todas las gráficas.
 */
export const disciplinaDeTareaFuerza = (disciplinaSesion: string | null | undefined): string =>
  normalizar(disciplinaSesion) === HIBRIDO ? HIBRIDO : 'Fuerza'

// ============================================================
// Las de cada deportista
// ============================================================

export interface Perfil {
  id: string
  label: string
  disciplinas: string[]
}

/** Atajos de un toque para no ir marcando una a una. */
export const PERFILES: Perfil[] = [
  { id: 'triatlon', label: 'Triatlón', disciplinas: ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza', 'Brick'] },
  { id: 'atletismo', label: 'Atletismo', disciplinas: ['Carrera', 'Fuerza'] },
  { id: 'natacion', label: 'Natación', disciplinas: ['Natacion', 'Fuerza'] },
  { id: 'ciclismo', label: 'Ciclismo', disciplinas: ['Ciclismo', 'Fuerza'] },
  { id: 'hyrox', label: 'HYROX', disciplinas: ['Carrera', 'Fuerza', HIBRIDO] },
  { id: 'todo', label: 'Todo', disciplinas: TODAS },
]

/**
 * Las disciplinas que programa este deportista, en el orden del catálogo.
 *
 * Sin elegir (null o vacío) son todas: es lo que veían antes de existir esto,
 * y un deportista sin ninguna disciplina no se podría programar.
 */
export function disciplinasDe(dep: { disciplinas?: string[] | null } | null | undefined): string[] {
  const suyas = new Set((dep?.disciplinas || []).map(normalizar))
  const validas = TODAS.filter(d => suyas.has(d))
  return validas.length ? validas : TODAS
}

/**
 * Las opciones de un menú, recortadas a las del deportista.
 *
 * Cada pantalla ofrece las suyas (una no deja crear bricks, otra sí) y esto
 * solo quita las que el deportista no hace. Dos redes:
 *   · La disciplina ACTUAL se queda aunque no esté marcada: si editas una
 *     sesión de natación de alguien que ya no nada, el menú no puede decir
 *     otra cosa que lo que la sesión es.
 *   · Si el recorte dejara el menú vacío, se enseñan todas: un menú sin
 *     opciones no deja programar nada.
 */
export function paraProgramar(
  dep: { disciplinas?: string[] | null } | null | undefined,
  opciones: string[],
  actual?: string | null,
): string[] {
  const suyas = new Set(disciplinasDe(dep))
  const act = normalizar(actual)
  const quedan = opciones.filter(o => suyas.has(normalizar(o)) || (act && normalizar(o) === act))
  return quedan.length ? quedan : opciones
}

/** Qué atajo coincide exactamente con lo marcado, para resaltarlo. */
export function perfilDe(disciplinas: string[] | null | undefined): string | null {
  const marcadas = disciplinasDe({ disciplinas })
  const igual = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))
  return PERFILES.find(p => igual(p.disciplinas, marcadas))?.id ?? null
}

/**
 * Lo que se guarda al marcar o desmarcar una.
 *
 * Todas marcadas se guarda como null, no como la lista entera: así, si mañana
 * se añade otra disciplina al catálogo, a este deportista le sale sin que haya
 * que volver a marcarla. Y no deja quitar la última: un deportista sin
 * disciplinas no se podría programar.
 */
export function alternar(actuales: string[] | null | undefined, d: string): string[] | null {
  const marcadas = new Set(disciplinasDe({ disciplinas: actuales }))
  if (marcadas.has(d)) {
    if (marcadas.size === 1) return actuales?.length ? actuales : null
    marcadas.delete(d)
  } else {
    marcadas.add(d)
  }
  const lista = TODAS.filter(x => marcadas.has(x))
  return lista.length === TODAS.length ? null : lista
}

/** Lo que se guarda al pulsar un atajo: «Todo» es null, por lo mismo. */
export const guardarPerfil = (p: Perfil): string[] | null =>
  p.disciplinas.length === TODAS.length ? null : [...p.disciplinas]
