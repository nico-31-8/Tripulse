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
  /**
   * El MISMO color en clases de Tailwind, para lo que no se pinta con `style`:
   *   · solido — el color tal cual: el punto del calendario, un fondo lleno.
   *   · chip   — la etiqueta suave con su borde.
   *   · boton  — la sesión que se pulsa, con su hover.
   *
   * ESCRITAS ENTERAS A PROPÓSITO. Tailwind busca los nombres de clase en el
   * código fuente: una clase montada al vuelo ('bg-' + color + '-900') no
   * llega nunca al CSS y el chip saldría sin color.
   */
  clases: { solido: string; chip: string; boton: string }
  /** Tres letras, para las casillas donde no cabe el nombre (el calendario). */
  corto: string
}

/**
 * Todas, en el orden en que salen en los menús.
 *
 * `color` y `clases.solido` son el mismo color dicho de dos maneras
 * (#60a5fa = bg-blue-400), y un test lo comprueba: si alguien cambia uno y no
 * el otro, el punto del calendario y la barra de la gráfica dejarían de ser
 * del mismo color sin que nada se rompiera.
 */
export const CATALOGO: Disciplina[] = [
  { id: 'Natacion', label: 'Natación', emoji: '🏊', color: '#60a5fa',
    clases: { solido: 'bg-blue-400', chip: 'bg-blue-900 text-blue-300 border-blue-700', boton: 'bg-blue-800 text-blue-200 hover:bg-blue-700' }, corto: 'Nat' },
  { id: 'Ciclismo', label: 'Ciclismo', emoji: '🚴', color: '#fbbf24',
    clases: { solido: 'bg-amber-400', chip: 'bg-amber-900 text-amber-300 border-amber-700', boton: 'bg-amber-800 text-amber-200 hover:bg-amber-700' }, corto: 'Cic' },
  { id: 'Carrera', label: 'Carrera', emoji: '🏃', color: '#4ade80',
    clases: { solido: 'bg-green-400', chip: 'bg-green-900 text-green-300 border-green-700', boton: 'bg-green-800 text-green-200 hover:bg-green-700' }, corto: 'Car' },
  { id: 'Fuerza', label: 'Fuerza', emoji: '🏋️', color: '#f87171',
    clases: { solido: 'bg-red-400', chip: 'bg-red-900 text-red-300 border-red-700', boton: 'bg-red-800 text-red-200 hover:bg-red-700' }, corto: 'Fue' },
  { id: 'Brick', label: 'Brick', emoji: '🔀', color: '#a855f7',
    clases: { solido: 'bg-purple-500', chip: 'bg-purple-900 text-purple-300 border-purple-700', boton: 'bg-purple-800 text-purple-200 hover:bg-purple-700' }, corto: 'Brk' },
  { id: HIBRIDO, label: 'Híbrido', emoji: '⚡', color: '#f472b6',
    clases: { solido: 'bg-pink-400', chip: 'bg-pink-900 text-pink-300 border-pink-700', boton: 'bg-pink-800 text-pink-200 hover:bg-pink-700' }, corto: 'Hib' },
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

/**
 * «🏊 Natación»: el icono y el nombre juntos, que es como salen en casi todos
 * los menús y leyendas. Estaba escrito a mano en una docena de sitios.
 *
 * Si la disciplina no está en el catálogo sale el nombre a secas, sin hueco
 * delante: un espacio suelto al principio se ve.
 */
export const etiquetaConEmoji = (d: string | null | undefined): string => {
  const i = info(d)
  return i ? i.emoji + ' ' + i.label : (d || '')
}

/**
 * Tres letras para donde no cabe el nombre. Si no está en el catálogo, el
 * nombre tal cual: antes cada pantalla ponía su `|| s.disciplina` detrás.
 */
export const cortoDisciplina = (d: string | null | undefined): string => info(d)?.corto || d || ''
export const colorDisciplina = (d: string | null | undefined): string => info(d)?.color || '#9ca3af'

/**
 * Lo de «no sé qué disciplina es» también lo decide este sitio.
 *
 * Cada pantalla tenía su propio gris de respaldo (#6b7280, #94a3b8, #9ca3af,
 * bg-gray-400, bg-gray-500, bg-gray-700…), así que una sesión sin disciplina
 * salía de un gris distinto en cada una.
 */
const DESCONOCIDA = {
  solido: 'bg-gray-500',
  chip: 'bg-gray-800 text-gray-300 border-gray-700',
  boton: 'bg-gray-700 text-gray-200 hover:bg-gray-600',
}

const clasesDe = (d: string | null | undefined) => info(d)?.clases ?? DESCONOCIDA

/** El color tal cual: el punto del calendario, un fondo lleno. */
export const claseDisciplina = (d: string | null | undefined): string => clasesDe(d).solido
/** La etiqueta suave con su borde. */
export const chipDisciplina = (d: string | null | undefined): string => clasesDe(d).chip
/** La sesión que se pulsa, con su hover. */
export const botonDisciplina = (d: string | null | undefined): string => clasesDe(d).boton

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
