// ============================================================
// Los errores, en un texto que se pueda pegar
// ============================================================
//
// Pasarme errores a mano es un trabajo tonto: hay que ir uno por uno, copiar el
// mensaje, acordarse de la ruta, buscar la pila en el desplegable. Con quince
// errores nadie lo hace, y entonces los errores no se cuentan.
//
// Esto los deja en un bloque de texto plano listo para pegar en el chat.
//
// LO IMPORTANTE ES QUÉ SE RECORTA
// Una pila entera son 1200 caracteres, casi todos rutas de ficheros compilados
// que no dicen nada. Quince de esas son un muro que no se puede leer. Se dejan
// las primeras líneas, que son donde está la información: el tipo de error y de
// dónde salió.

export interface EventoTexto {
  ts?: string | null
  nivel?: string | null
  origen?: string | null
  quien?: string | null
  mensaje?: string | null
  detalle?: any
}

const fecha = (iso?: string | null) => {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'sin fecha'
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Las primeras líneas de la pila, que es donde está lo que sirve. */
export function pilaCorta(detalle: any, lineas = 3): string {
  const pila = detalle?.pila
  if (typeof pila !== 'string' || !pila.trim()) return ''
  return pila.split('\n').slice(0, lineas).map(l => l.trim()).filter(Boolean).join('\n    ')
}

/** Un error, en tres líneas como mucho. */
export function unEvento(e: EventoTexto, n: number): string {
  const cabecera = `[${n}] ${fecha(e.ts)} · ${e.nivel || 'error'}`
    + (e.origen ? ` · ${e.origen}` : '')
    + (e.quien ? ` · ${e.quien}` : '')

  const pila = pilaCorta(e.detalle)
  return cabecera + '\n    ' + (e.mensaje || 'sin mensaje') + (pila ? '\n    ' + pila : '')
}

/**
 * Todo el bloque.
 *
 * Lleva cuántos hay y de cuándo son en la cabecera: sin eso, al pegarlo no se
 * sabe si son los de hoy o los de tres meses.
 */
export function eventosComoTexto(eventos: EventoTexto[] | null | undefined, tope = 40): string {
  const lista = (eventos || []).slice(0, tope)
  if (!lista.length) return 'Sin errores registrados.'

  const cabecera = `TRIPULSE · ${lista.length} de ${(eventos || []).length} errores`
    + ` · del ${fecha(lista[lista.length - 1].ts)} al ${fecha(lista[0].ts)}`

  const cuerpo = lista.map((e, i) => unEvento(e, i + 1)).join('\n\n')

  const cola = (eventos || []).length > tope
    ? `\n\n(hay ${(eventos || []).length - tope} más, no caben aquí)`
    : ''

  return cabecera + '\n\n' + cuerpo + cola
}
