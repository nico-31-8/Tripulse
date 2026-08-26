// ============================================================
// TRIPULSE — El aviso de mantenimiento y el buzón de sugerencias
// ============================================================
//
// Dos cosas que no existían: una forma de avisar de que la app va a estar caída,
// y una forma de que la gente cuente lo que falla sin buscarte el teléfono.

export interface Aviso {
  id?: number
  mensaje: string
  desde: string
  hasta: string
}

/**
 * Un aviso tiene TRES momentos, no dos.
 *
 * Antes de empezar es un anuncio —«el jueves a las 23:00»— y hay que leerlo con
 * calma. Durante es un hecho —«estamos actualizando»— y lo que importa es
 * cuándo vuelve. Y después no es nada y tiene que desaparecer solo, sin que
 * nadie se acuerde de quitarlo: un cartel de mantenimiento que se queda puesto
 * es peor que no haberlo puesto, porque la próxima vez ya nadie lo cree.
 */
export type MomentoAviso = 'anuncio' | 'en curso' | 'pasado'

export function momentoDe(a: Aviso | null | undefined, ahora: Date = new Date()): MomentoAviso | null {
  if (!a) return null
  const desde = new Date(a.desde).getTime()
  const hasta = new Date(a.hasta).getTime()
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return null

  const t = ahora.getTime()
  if (t < desde) return 'anuncio'
  if (t <= hasta) return 'en curso'
  return 'pasado'
}

/** ¿Hay que enseñarlo? Solo si no ha pasado. */
export function seEnsena(a: Aviso | null | undefined, ahora: Date = new Date()): boolean {
  const m = momentoDe(a, ahora)
  return m === 'anuncio' || m === 'en curso'
}

const HORA = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

const DIA = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * El texto del cartel, según el momento.
 *
 * Se escribe aquí y no en el componente porque el momento y las palabras son la
 * misma decisión: durante la ventana no tiene sentido decir «va a estar», y
 * antes no tiene sentido decir «vuelve».
 */
export function textoDe(a: Aviso, ahora: Date = new Date()): string {
  const m = momentoDe(a, ahora)
  if (m === 'en curso') return 'Estamos actualizando la app. Vuelve a estar lista sobre las ' + HORA(a.hasta) + '.'
  if (m === 'anuncio') {
    const mismoDia = new Date(a.desde).toDateString() === ahora.toDateString()
    const cuando = mismoDia ? 'hoy' : 'el ' + DIA(a.desde)
    return 'La app estará en mantenimiento ' + cuando + ' de ' + HORA(a.desde) + ' a ' + HORA(a.hasta) + '.'
  }
  return ''
}

/** El de la lista que todavía vale. Null si no hay ninguno vivo. */
export function avisoVigente(avisos: Aviso[] | null | undefined, ahora: Date = new Date()): Aviso | null {
  const vivos = (avisos || []).filter(a => seEnsena(a, ahora))
  if (!vivos.length) return null
  // El que empieza antes: si hay dos programados, el que toca es el más cercano.
  return vivos.sort((x, y) => new Date(x.desde).getTime() - new Date(y.desde).getTime())[0]
}

// ------------------------------------------------------------
// El buzón
// ------------------------------------------------------------

export type TipoSugerencia = 'error' | 'sugerencia'

/** Lo mínimo para que un mensaje sirva de algo al leerlo. */
export const MINIMO_TEXTO = 10

export function queLeFaltaAlMensaje(texto: string): string | null {
  const t = (texto || '').trim()
  if (!t) return 'Escribe qué ha pasado.'
  if (t.length < MINIMO_TEXTO) {
    return 'Cuéntamelo un poco más. Con dos palabras no voy a saber qué mirar.'
  }
  return null
}

/**
 * La fila que se manda.
 *
 * La pantalla y el navegador los pone la app, no la persona: «no me funciona»
 * sin saber dónde estaba es un mensaje que no se puede contestar, y pedirle que
 * lo explique es pedirle un trabajo que la app hace sola.
 */
export function filaDeSugerencia(opciones: {
  idPerfil: string
  tipo: TipoSugerencia
  texto: string
  pantalla?: string | null
  agente?: string | null
}) {
  return {
    id_perfil: opciones.idPerfil,
    tipo: opciones.tipo,
    texto: (opciones.texto || '').trim(),
    pantalla: opciones.pantalla || null,
    /* Recortado: lo que importa es el navegador y el sistema, y algunas cadenas
       de agente pasan de 400 caracteres. */
    agente: (opciones.agente || '').slice(0, 200) || null,
  }
}

export async function mandarSugerencia(
  sb: any,
  opciones: Parameters<typeof filaDeSugerencia>[0],
): Promise<string | null> {
  const falta = queLeFaltaAlMensaje(opciones.texto)
  if (falta) return falta

  const { error } = await sb.from('sugerencia').insert(filaDeSugerencia(opciones))
  if (!error) return null

  if (/relation|does not exist/i.test(error.message)) {
    return 'El buzón todavía no está preparado en la base. Avisa a tu entrenador.'
  }
  return 'No se pudo enviar: ' + error.message
}
