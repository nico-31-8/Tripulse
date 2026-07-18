// Conversión de la unidad elegida en el formulario a la unidad canónica de la BD.
// La BD guarda SIEMPRE: distancia en metros (p_distancia), tiempo en segundos
// (p_duracion), repeticiones como número (p_repeticiones). El entrenador puede
// introducir el valor en la unidad que le resulte cómoda (m/km, seg/min/mm:ss).

export type UnidadMedicion = '' | 'm' | 'km' | 'seg' | 'min' | 'mmss' | 'reps'

export function mmssASegundos(str: string): number {
  const p = String(str).split(':')
  if (p.length === 2) return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0)
  return parseInt(str) || 0
}

// Tabla de medición a la que corresponde cada unidad.
export function tablaMedicion(u: UnidadMedicion): 'p_distancia' | 'p_duracion' | 'p_repeticiones' | null {
  if (u === 'm' || u === 'km') return 'p_distancia'
  if (u === 'seg' || u === 'min' || u === 'mmss') return 'p_duracion'
  if (u === 'reps') return 'p_repeticiones'
  return null
}

// Valor en unidad canónica (metros / segundos / reps) a partir del texto introducido.
export function valorCanonico(u: UnidadMedicion, valor: string): number {
  const n = Number(valor) || 0
  switch (u) {
    case 'km': return Math.round(n * 1000)
    case 'm': return n
    case 'min': return Math.round(n * 60)
    case 'seg': return n
    case 'mmss': return mmssASegundos(valor)
    case 'reps': return n
    default: return 0
  }
}

// Lee la medición ya guardada de una tarea (para rellenar el modal de edición).
// Devuelve la unidad más natural: metros, segundos o reps. El entrenador puede
// cambiarla a km / min / mm:ss en el propio modal si lo prefiere.
export function detectarMedicion(t: any): { tipo: UnidadMedicion; valor: string } {
  const m = t?.p_distancia?.[0]?.metros_planeados
  if (m != null) return { tipo: 'm', valor: String(m) }
  const s = t?.p_duracion?.[0]?.tiempo_planeado
  if (s != null) return { tipo: 'seg', valor: String(s) }
  const r = t?.p_repeticiones?.[0]?.repeticiones_planteadas
  if (r != null) return { tipo: 'reps', valor: String(r) }
  return { tipo: '', valor: '' }
}

const COL_MEDICION = {
  p_distancia: 'metros_planeados',
  p_duracion: 'tiempo_planeado',
  p_repeticiones: 'repeticiones_planteadas',
} as const

// Guarda la medición de una tarea ya existente: escribe en la tabla que toca y
// borra las otras dos (una tarea tiene UNA medición). `t` debe traer sus filas
// p_distancia/p_duracion/p_repeticiones anidadas para saber cuáles ya existen.
export async function guardarMedicion(
  supabase: any,
  t: any,
  tipo: UnidadMedicion,
  valorStr: string,
): Promise<void> {
  const destino = tablaMedicion(tipo)
  const valor = destino ? valorCanonico(tipo, valorStr) : 0
  const tablas = ['p_distancia', 'p_duracion', 'p_repeticiones'] as const

  for (const tabla of tablas) {
    const fila = t?.[tabla]?.[0]
    const esDestino = tabla === destino && valor > 0
    if (esDestino) {
      const payload = { [COL_MEDICION[tabla]]: valor }
      if (fila?.id) await supabase.from(tabla).update(payload).eq('id', fila.id)
      else await supabase.from(tabla).insert({ id_tarea: t.id, ...payload })
    } else if (fila?.id) {
      // Cambió de tipo (o se quitó la medición): la fila vieja sobra.
      await supabase.from(tabla).delete().eq('id', fila.id)
    }
  }
}
