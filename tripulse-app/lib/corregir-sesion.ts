// ============================================================
// TRIPULSE — Cerrar una sesión por él, y corregir lo que apuntó
// ============================================================
//
// EL CASO, dicho por el entrenador: «los deportistas a veces se equivocan o no
// se acuerdan de dar una sesión por realizada». Tres cosas distintas que son el
// mismo problema:
//
//   1. No la cerró y la hizo  →  cerrarla él.
//   2. La cerró con datos malos →  corregirlos.
//   3. La cerró sin querer     →  devolverla a planificada.
//
// LO QUE ESTO MUEVE, y por eso las reglas viven aquí y no repartidas por la
// pantalla: el RPE y la duración alimentan la carga de la semana, el SICAT y
// las gráficas; los kilos y las repeticiones, el volumen de fuerza y «lo que
// hizo vs lo prescrito». Un número corregido a ojo cambia la forma de una
// semana entera, así que lo que se guarda pasa por un solo sitio que sabe qué
// es un valor imposible.
//
// EL RPE LLEVA FIRMA Y NO SE FALSIFICA. `sesion.rpe_origen` distingue «me dijo
// que un 9» de «le puse un 9 mirándolo». Cerrar la sesión por él o cambiarle el
// RPE pone «entrenador»; tocar cualquier otra cosa NO lo toca, porque el RPE
// sigue siendo suyo. Sin esta regla, la carga del atleta acabaría calculada con
// números que él nunca dijo y nadie podría distinguirlos.
//
// LAS SERIES NO LLEVAN FIRMA, y es una decisión del usuario: «con corregirlo
// llega». Además hay un motivo técnico para no marcarlas como del entrenador:
// el modo dirigir BORRA y reescribe las series firmadas así (`anotado_por =
// 'entrenador'`), o sea que marcarlas haría desaparecer la corrección la
// próxima vez que dirija esa sesión.

import { mmss, mmssASegundos } from './medicion'

/** Lo que se puede tocar de la sesión. */
export interface CamposSesion {
  duracion_real: string
  rpe: string
  notas_post: string
}

/** Lo que se puede tocar de cada bloque. */
export interface CamposTarea {
  rpe_reportado: string
  fc_media: string
  sensacion_tecnica: string
  dolor_muscular: string
  notas_post: string
}

/** Lo que se puede tocar de cada serie de fuerza. */
export interface CamposSerie {
  peso_real: string
  repeticiones_reales: string
  tiempo_real: string
  control_real: string
}

/**
 * Lo que se puede tocar de un bloque de RESISTENCIA.
 *
 * Es otra cosa que la fuerza y vive en otras tablas: los metros en
 * `p_distancia.metros_reales`, el tiempo en `p_duracion.tiempo_real` (en
 * SEGUNDOS, aunque se escriba mm:ss) y el detalle de las series en un resumen
 * de TEXTO dentro de `tarea.sensacion_general`.
 *
 * EL DETALLE SE PUEDE TOCAR, y no es un capricho: si corriges los metros de 8
 * a 8000 y el resumen se queda diciendo «8m», la pantalla enseña dos números
 * distintos de lo mismo y ninguno de los dos se puede creer.
 */
export interface CamposResistencia {
  metros_reales: string
  /** Se escribe mm:ss porque es como se lee un tiempo; se guarda en segundos. */
  tiempo_real: string
  detalle: string
}

export interface Pega { donde: string; texto: string }

/**
 * Un número escrito a mano, o nada.
 *
 * VACÍO ES `null` Y NO CERO, que es la diferencia entre «no lo sé» y «fue
 * cero». Un cero en la FC media de un bloque se promedia con los demás y
 * hunde la media del día; un null se queda fuera, que es lo correcto.
 */
export function numeroONada(txt: unknown): number | null {
  const s = String(txt ?? '').trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const entero = (txt: unknown): number | null => {
  const n = numeroONada(txt)
  return n == null ? null : Math.round(n)
}

const textoONada = (txt: unknown): string | null => {
  const s = String(txt ?? '').trim()
  return s ? s : null
}

/* Los topes. No son gustos: son los límites de lo que la escala significa.
   Un RPE de 12 no es un esfuerzo mayor, es un dedo que resbaló, y entra en la
   carga como si fuera verdad. */
const TOPES: Record<string, { min: number; max: number; que: string }> = {
  rpe: { min: 1, max: 10, que: 'El RPE va de 1 a 10' },
  duracion_real: { min: 1, max: 1440, que: 'La duración va en minutos y cabe en un día' },
  fc_media: { min: 30, max: 240, que: 'La frecuencia cardiaca media va en pulsaciones por minuto' },
  sensacion_tecnica: { min: 1, max: 5, que: 'La sensación técnica va de 1 a 5' },
  dolor_muscular: { min: 1, max: 5, que: 'El dolor muscular va de 1 a 5' },
  metros_reales: { min: 0, max: 500000, que: 'La distancia va en metros' },
  peso_real: { min: 0, max: 1000, que: 'El peso va en kilos' },
  repeticiones_reales: { min: 0, max: 999, que: 'Las repeticiones son un número entero' },
  tiempo_real: { min: 0, max: 86400, que: 'El tiempo va en segundos' },
  control_real: { min: 0, max: 10, que: 'El control (RIR o RPE) va de 0 a 10' },
}

function fuera(campo: string, txt: unknown, donde: string): Pega | null {
  const s = String(txt ?? '').trim()
  if (!s) return null
  const n = numeroONada(s)
  const t = TOPES[campo]
  if (!t) return null
  if (n == null) return { donde, texto: t.que + ', y «' + s + '» no es un número.' }
  if (n < t.min || n > t.max) return { donde, texto: t.que + ': ' + t.min + ' a ' + t.max + '. Has puesto ' + s + '.' }
  return null
}

/**
 * Lo que está mal ANTES de guardar.
 *
 * Se contesta antes de tocar la base y no después, que es la política de avisos
 * de la aplicación: si se puede saber antes de la acción, contesta el destino.
 */
export function pegasDeCorreccion(
  sesion: CamposSesion,
  tareas: Record<string | number, CamposTarea> = {},
  series: Record<string | number, CamposSerie> = {},
): Pega[] {
  const out: Pega[] = []
  const mete = (p: Pega | null) => { if (p) out.push(p) }

  mete(fuera('duracion_real', sesion?.duracion_real, 'sesion'))
  mete(fuera('rpe', sesion?.rpe, 'sesion'))

  for (const [id, t] of Object.entries(tareas || {})) {
    mete(fuera('rpe', t?.rpe_reportado, 'tarea:' + id))
    mete(fuera('fc_media', t?.fc_media, 'tarea:' + id))
    mete(fuera('sensacion_tecnica', t?.sensacion_tecnica, 'tarea:' + id))
    mete(fuera('dolor_muscular', t?.dolor_muscular, 'tarea:' + id))
  }

  for (const [id, s] of Object.entries(series || {})) {
    mete(fuera('peso_real', s?.peso_real, 'serie:' + id))
    mete(fuera('repeticiones_reales', s?.repeticiones_reales, 'serie:' + id))
    mete(fuera('tiempo_real', s?.tiempo_real, 'serie:' + id))
    mete(fuera('control_real', s?.control_real, 'serie:' + id))
  }
  return out
}

/**
 * El parche de la sesión, con la firma del RPE puesta cuando toca.
 *
 * `rpeAntes` es el que había. Si el número no cambia, `rpe_origen` NO se toca:
 * abrir la corrección, mirar y guardar sin cambiar nada no puede convertir en
 * suyo lo que dijo el atleta.
 */
export function parcheDeSesion(
  campos: CamposSesion,
  rpeAntes: number | null | undefined,
): Record<string, unknown> {
  const rpe = numeroONada(campos?.rpe)
  const parche: Record<string, unknown> = {
    duracion_real: entero(campos?.duracion_real),
    rpe_reportado: rpe,
    notas_post: textoONada(campos?.notas_post),
  }
  const antes = rpeAntes == null ? null : Number(rpeAntes)
  if (rpe !== antes) parche.rpe_origen = rpe == null ? null : 'entrenador'
  return parche
}

/** El parche de un bloque. */
export function parcheDeTarea(c: CamposTarea): Record<string, unknown> {
  return {
    rpe_reportado: entero(c?.rpe_reportado),
    fc_media: numeroONada(c?.fc_media),
    sensacion_tecnica: entero(c?.sensacion_tecnica),
    dolor_muscular: entero(c?.dolor_muscular),
    notas_post: textoONada(c?.notas_post),
  }
}

/**
 * El parche de una serie.
 *
 * `completada` se pone sola: si hay algo escrito, la serie se hizo. Es la misma
 * regla que ya usa toda la aplicación para leerlas (`lib/serie-hecha`), porque
 * casi nadie toca el circulito de «hecha» y un peso de 40 kg con la serie
 * marcada como no hecha es un dato que se contradice a sí mismo.
 *
 * NO se toca `anotado_por`: ver arriba, el modo dirigir borra las que llevan su
 * firma.
 */
export function parcheDeSerie(c: CamposSerie): Record<string, unknown> {
  const peso = numeroONada(c?.peso_real)
  const reps = entero(c?.repeticiones_reales)
  const tiempo = entero(c?.tiempo_real)
  const control = numeroONada(c?.control_real)
  return {
    peso_real: peso,
    repeticiones_reales: reps,
    tiempo_real: tiempo,
    control_real: control,
    completada: peso != null || reps != null || tiempo != null || control != null,
  }
}

/**
 * Segundos escritos como mm:ss, o como un número suelto de segundos.
 *
 * Se acepta «4:35» y «275», porque los dos significan lo mismo y obligar a una
 * forma concreta con el dato ya delante es pedirle al entrenador que traduzca.
 */
export function segundosDeTexto(txt: unknown): number | null {
  const s = String(txt ?? '').trim()
  if (!s) return null
  /* AQUÍ SOLO SE VALIDA. La cuenta la hace `mmssASegundos`, que es la única
     que sabe pasar de texto a segundos en toda la aplicación; lo que se añade
     es la pregunta que ella no contesta —«¿esto es una hora que existe?»—,
     porque ella es indulgente a propósito y «4:75» le sale 315. */
  if (s.indexOf(':') >= 0) {
    const [m, sg] = s.split(':')
    if (!/^\d+$/.test(m.trim())) return null
    if (!/^\d{1,2}$/.test(sg.trim()) || Number(sg) > 59) return null
  } else if (!/^\d+$/.test(s)) {
    return null
  }
  return mmssASegundos(s)
}

/**
 * Segundos → «4:35», para poder escribirlos encima.
 *
 * Vacío cuando no hay nada: un «0:00» en la casilla se lee como un dato, y al
 * guardar volvería como cero lo que era «no lo sé».
 */
export const textoDeSegundos = (seg: number | null | undefined): string => {
  const n = Number(seg)
  return Number.isFinite(n) && n > 0 ? mmss(n) : ''
}

/**
 * Lo que está mal en un bloque de resistencia.
 *
 * El tiempo se mira aparte de los números normales porque un «4:75» no es un
 * número fuera de rango: es un tiempo que no existe.
 */
export function pegasDeResistencia(porTarea: Record<string | number, CamposResistencia>): Pega[] {
  const out: Pega[] = []
  for (const [id, c] of Object.entries(porTarea || {})) {
    const p = fuera('metros_reales', c?.metros_reales, 'tarea:' + id)
    if (p) out.push(p)
    const t = String(c?.tiempo_real ?? '').trim()
    if (t && segundosDeTexto(t) == null) {
      out.push({ donde: 'tarea:' + id, texto: 'El tiempo se escribe mm:ss («4:35») o en segundos, y «' + t + '» no lo es.' })
    }
  }
  return out
}

/** Lo que se le escribe a `p_distancia`. */
export const parcheDistancia = (c: CamposResistencia): Record<string, unknown> =>
  ({ metros_reales: entero(c?.metros_reales) })

/** Lo que se le escribe a `p_duracion`. */
export const parcheDuracion = (c: CamposResistencia): Record<string, unknown> =>
  ({ tiempo_real: segundosDeTexto(c?.tiempo_real) })

/** El resumen de series, que vive en la tarea y es texto. */
export const parcheDetalle = (c: CamposResistencia): Record<string, unknown> =>
  ({ sensacion_general: textoONada(c?.detalle) })

/**
 * Una serie de fuerza que TODAVÍA NO EXISTE en la base.
 *
 * Hace falta porque las filas se crean solo cuando el atleta escribe algo: una
 * sesión de fuerza que cerró sin apuntar nada no tiene ni una, y entonces no
 * había nada que corregir —que es justo lo que se encontró el entrenador—. Las
 * que sigan vacías no se crean: una fila de nulos no es un dato, es ruido que
 * luego hay que distinguir de lo que sí se hizo.
 *
 * `id_deportista` no se pone: lo rellena un disparador de la base. Y
 * `anotado_por` tampoco, por lo de arriba.
 */
export function filaNuevaDeSerie(
  idEjercicio: number,
  numeroSerie: number,
  controlTipo: string | null | undefined,
  c: CamposSerie,
): Record<string, unknown> | null {
  const p = parcheDeSerie(c)
  if (!p.completada) return null
  return {
    ...p,
    id_ejercicio: idEjercicio,
    numero_serie: numeroSerie,
    ejercicio_numero: 1,
    control_tipo: p.control_real != null ? (controlTipo || 'rir') : null,
  }
}

/**
 * Con qué se rellena el formulario de «darla por hecha».
 *
 * Sale de lo que YA se sabe: la duración de lo planificado y el RPE que
 * estimaste al montarla. Empezar en blanco obliga a inventarse dos números, y
 * un número inventado desde cero es peor que el que tú mismo planificaste.
 */
export function comoDarlaPorHecha(sesion: {
  duracion_minutos?: number | null
  duracion_real?: number | null
  rpe_estimado?: number | null
  notas_post?: string | null
}, estimadaMin?: number | null): CamposSesion {
  const dur = sesion?.duracion_real || sesion?.duracion_minutos || estimadaMin || null
  return {
    duracion_real: dur ? String(Math.round(dur)) : '',
    rpe: sesion?.rpe_estimado != null ? String(sesion.rpe_estimado) : '',
    /* La nota que hubiera se ARRASTRA, no se pierde: el parche escribe este
       campo tal cual, así que empezar en blanco borraría lo que ya había sin
       que nadie lo hubiera pedido. */
    notas_post: sesion?.notas_post || '',
  }
}

/**
 * Si hay que ofrecer cerrarla tú.
 *
 * SOLO SI EL DÍA YA PASÓ. En una sesión de mañana el cartel sería ruido, y
 * cerrar por adelantado algo que no ha ocurrido es exactamente lo que ensucia
 * la carga de la semana.
 */
export function sePuedeDarPorHecha(
  sesion: { estado?: string | null; fecha_sesion?: string | null } | null | undefined,
  hoy: string,
): boolean {
  if (!sesion) return false
  if (sesion.estado === 'Realizada' || sesion.estado === 'Cancelada') return false
  const f = String(sesion.fecha_sesion || '')
  return !!f && f <= String(hoy)
}
