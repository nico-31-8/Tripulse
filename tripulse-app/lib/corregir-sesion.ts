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
