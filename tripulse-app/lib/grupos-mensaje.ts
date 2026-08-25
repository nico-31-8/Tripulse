// ============================================================
// TRIPULSE — Un mensaje a todo el grupo
// ============================================================
//
// Un mensaje al grupo son N MENSAJES DE VERDAD, uno por miembro. Es la misma
// decisión que en `emitirSesion`: el grupo no es dueño de nada, así que lo que
// se crea son filas normales y corrientes y todo lo que ya existe —la bandeja
// del entrenador, el chat del atleta, el contador de sin leer del panel—
// funciona sin enterarse de que los grupos existen.
//
// A cada uno le llega a SU conversación de siempre. No se marca como «del
// grupo» y es a propósito, por dos razones: no hace falta tocar el esquema, y
// el atleta no tiene por qué saber a cuántos más se lo mandaste. Si algún día
// se quiere agrupar en la bandeja del entrenador para no verlo ocho veces, eso
// sí sería una columna nueva.
//
// SE MANDA DE UNA VEZ, no en un bucle: ocho filas idénticas son un solo insert.
// Pero si ese insert falla, se reintenta uno a uno — con ocho personas, que la
// RLS rechace a una no puede dejar a las otras siete sin el aviso, y hace falta
// poder decir cuál falló. Es el mismo principio que en la emisión de sesiones,
// solo que aquí el camino rápido se puede intentar primero.

export interface ResultadoMensaje {
  id_deportista: number
  nombre: string
  ok: boolean
  error?: string
}

export interface MiembroDestino {
  id_deportista: number
  nombre: string
}

/**
 * Las filas que hay que escribir. Pura y aparte para poder probarla sin base:
 * lo que importa de esta función es que el texto y el autor sean iguales para
 * todos y que cada fila lleve a SU destinatario.
 */
export function filasDeMensaje(
  idEntrenador: string,
  miembros: MiembroDestino[],
  texto: string,
): { id_entrenador: string; id_deportista: number; contenido: string; autor: string; leido: boolean }[] {
  const t = (texto || '').trim()
  if (!t) return []
  return (miembros || []).map(m => ({
    id_entrenador: idEntrenador,
    id_deportista: m.id_deportista,
    contenido: t,
    autor: 'entrenador',
    leido: false,
  }))
}

export async function mandarAlGrupo(
  sb: any,
  opciones: { idEntrenador: string; miembros: MiembroDestino[]; texto: string },
): Promise<{ resultados: ResultadoMensaje[]; error: string | null }> {
  const { idEntrenador, miembros, texto } = opciones

  if (!idEntrenador) return { resultados: [], error: 'No sé quién eres.' }
  if (!miembros?.length) return { resultados: [], error: 'El grupo no tiene a nadie.' }
  if (!(texto || '').trim()) return { resultados: [], error: 'Escribe algo antes de mandarlo.' }

  const filas = filasDeMensaje(idEntrenador, miembros, texto)

  // Camino rápido: una sola escritura para todos.
  const { error } = await sb.from('mensajes').insert(filas)
  if (!error) {
    return { resultados: miembros.map(m => ({ ...m, ok: true })), error: null }
  }

  // Falló el lote. Se va uno a uno para que llegue a todos los que se pueda y
  // para poder decir exactamente quién se quedó fuera y por qué.
  const resultados: ResultadoMensaje[] = []
  for (const m of miembros) {
    const fila = filasDeMensaje(idEntrenador, [m], texto)[0]
    const { error: e } = await sb.from('mensajes').insert(fila)
    resultados.push({ ...m, ok: !e, error: e?.message })
  }

  if (!resultados.some(r => r.ok)) {
    return { resultados, error: error.message || 'No se pudo mandar a nadie.' }
  }
  return { resultados, error: null }
}

/** «Mandado a 8» o «Mandado a 6 de 8». */
export function resumenMensaje(resultados: ResultadoMensaje[]): string {
  const total = resultados.length
  const ok = resultados.filter(r => r.ok).length
  if (!total) return 'No se mandó nada.'
  if (ok === total) return 'Mandado a ' + total + (total === 1 ? ' deportista' : ' deportistas') + '.'
  return 'Mandado a ' + ok + ' de ' + total + '.'
}
