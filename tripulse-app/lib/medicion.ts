// Conversión de la unidad elegida en el formulario a la unidad canónica de la BD.
// La BD guarda SIEMPRE: distancia en metros (p_distancia), tiempo en segundos
// (p_duracion), repeticiones como número (p_repeticiones). El entrenador puede
// introducir el valor en la unidad que le resulte cómoda (m/km, seg/min/mm:ss).

/* Lo único que importa este fichero, y a propósito: `lib/repeticiones` no
   importa nada, así que medicion sigue siendo el sitio sin dependencias donde
   pueden apoyarse los demás (lib/zonas depende de esto, no al revés). */
import { leerReps, repsDePrescripcion, columnasPrescripcion } from './repeticiones'

export type UnidadMedicion = '' | 'm' | 'km' | 'seg' | 'min' | 'mmss' | 'reps'

export function mmssASegundos(str: string): number {
  const p = String(str).split(':')
  if (p.length === 2) return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0)
  return parseInt(str) || 0
}

/**
 * Segundos → «3:41». Siempre con los dos puntos, porque es para MOSTRAR.
 *
 * HABÍA NUEVE DECLARACIONES DE ESTO, todas llamadas `mmss`, y tres
 * comportamientos distintos:
 *
 *   · La de lib/duracion-carga no redondeaba, así que escribía «1:30.5» en
 *     cuanto le llegaban segundos con decimales — y a los ritmos les llegan:
 *     3600/velocidad casi nunca es un entero.
 *   · Seis copias hacían `Math.round(seg % 60)`: redondear los segundos SIN
 *     arrastrar el minuto. Con 239,7 s eso escribe **«3:60»** en vez de «4:00»,
 *     y cae ahí uno de cada ciento veinte ritmos.
 *   · Y una tomaba MILISEGUNDOS con el mismo nombre.
 *
 * Aquí el redondeo se hace UNA vez y sobre el total, así que el minuto se lleva
 * el acarreo y no puede salir un «:60».
 *
 * ES PARA DURACIONES, que no son negativas. Una DIFERENCIA con signo la escribe
 * quien la calcula (lo hace /apuntar), porque el signo va delante del minuto.
 */
export function mmss(seg: number): string {
  const total = Math.max(0, Math.round(seg || 0))
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
}

/**
 * Minutos → «45′», «2h», «2h05». El volumen de una sesión o de una semana.
 *
 * Estaba escrito SEIS veces y con tres comportamientos: cuatro copias de este
 * («2h» sin el «00»), una con las horas siempre («1h00») y otra con espacios
 * («7 h 12»). Las tres hacen falta, así que se separan el nombre y la
 * implementación vive aquí, como ya se hizo con mmss y mmssCorto.
 *
 * `vacio` es lo que sale con 0 o menos, y cambia según la pantalla: un «0» en un
 * total y un «—» donde un hueco es un hueco y no un cero medido.
 */
export function horasMinutos(min: number | null | undefined, vacio = '0'): string {
  const m = Math.round(Number(min) || 0)
  if (m <= 0) return vacio
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return r + '′'
  return h + 'h' + (r ? String(r).padStart(2, '0') : '')
}

/**
 * Minutos → «1h00», «7 h 12»: las horas SIEMPRE y los minutos a dos cifras.
 *
 * Es lo que quiere una TABLA —los tiempos de carrera de /pacing— y lo que quiere
 * el sueño, que se lee en horas aunque sean cero. El separador se elige porque
 * el sueño lo escribe con espacios y la tabla no.
 */
export function horasExactas(min: number | null | undefined, sep = 'h'): string {
  const m = Math.round(Number(min) || 0)
  const seguro = Math.max(0, m)
  return Math.floor(seguro / 60) + sep + String(seguro % 60).padStart(2, '0')
}

/**
 * «2», «1:30», «0:45». Sin el «:00» cuando el minuto es exacto.
 *
 * Es lo que espera una CASILLA editable: al guardar, `mmssASegundos` entiende
 * «2» y «1:30», pero nadie quiere teclear «2:00» para dos minutos. También se
 * usa donde detrás va un « min», que deshace la ambigüedad.
 */
export function mmssCorto(seg: number): string {
  const total = Math.max(0, Math.round(seg || 0))
  const s = total % 60
  const min = Math.floor(total / 60)
  return s > 0 ? min + ':' + String(s).padStart(2, '0') : String(min)
}

/**
 * Una duración corta para LEER: «45 s», «2 min» o «2:30 min».
 *
 * Los segundos sueltos no se redondean a minutos. El resumen del deportista y
 * el modo entrenador hacían `Math.round(seg / 60) + ' min'`, así que una
 * plancha de 40 s salía «1 min» y una de 20 s, «0 min».
 */
export function duracionCorta(seg: number): string {
  const s = Math.max(0, Math.round(seg || 0))
  return s < 60 ? s + ' s' : mmssCorto(s) + ' min'
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
    /* «8-10» es un rango: para lo que se mide vale su mínimo, y el tope lo
       guarda guardarMedicion en su columna. Antes esto era Number('8-10'),
       o sea NaN, y NaN hacía que la medición se borrara sin decir nada. */
    case 'reps': return leerReps(valor)?.min || 0
    default: return 0
  }
}

/* Lo más que se entrena DE UNA VEZ, por serie y por deporte, en km. Es el
   umbral para preguntar, no para prohibir: un fondo de ultra o una brevet
   existen, y se guardan si el entrenador dice que sí. */
const TOPE_SERIE_KM: Record<string, { km: number; nombre: string }> = {
  carrera: { km: 60, nombre: 'carrera' },
  natacion: { km: 15, nombre: 'natación' },
  ciclismo: { km: 400, nombre: 'bici' },
}

/**
 * ¿Una distancia por serie que no se entrena nunca? La frase para preguntarlo
 * antes de guardar, o null si es normal.
 *
 * La trajo un «4 × 1.000.000 m» de carrera (15-10-2026): 1.000 km por serie
 * —se quería poner 1.000 m, y lo más probable es que fuera la unidad «km» con
 * un 1000 detrás—. Se guardó sin que nada dijera nada, el atleta lo tenía en su
 * sesión, y la barra de carga de esa semana se fue a 134.359.
 */
export function distanciaSospechosa(
  disciplina: string | null | undefined, metrosPorSerie: number, series?: number | null,
): string | null {
  const clave = String(disciplina || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const tope = TOPE_SERIE_KM[clave]
  const km = (Number(metrosPorSerie) || 0) / 1000
  if (!(km > (tope?.km ?? 100))) return null
  const veces = series && series > 1 ? series + ' × ' : ''
  return '«' + veces + km.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' km»'
    + (tope ? ' de ' + tope.nombre : '') + ' por serie es más de lo que se entrena de una vez.'
    + ' Si querías metros, revisa la unidad o los ceros.'
}

// Lee la medición ya guardada de una tarea (para rellenar el modal de edición).
// Devuelve la unidad más natural: metros, segundos o reps. El entrenador puede
// cambiarla a km / min / mm:ss en el propio modal si lo prefiere.
export function detectarMedicion(t: any): { tipo: UnidadMedicion; valor: string } {
  const m = t?.p_distancia?.[0]?.metros_planeados
  if (m != null) return { tipo: 'm', valor: String(m) }
  const s = t?.p_duracion?.[0]?.tiempo_planeado
  if (s != null) return { tipo: 'seg', valor: String(s) }
  const reps = repsDePrescripcion(t?.p_repeticiones?.[0])
  if (reps) return { tipo: 'reps', valor: reps }
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

  /* Las tres tablas a la vez: cada una toca solo lo suyo (iban en fila). */
  await Promise.all(tablas.map(async tabla => {
    const fila = t?.[tabla]?.[0]
    const esDestino = tabla === destino && valor > 0
    if (esDestino) {
      /* EL TOPE VIAJA CON EL MÍNIMO. Si se escribiera solo el mínimo, pasar
         de «8-10» a «12» dejaría el tope en 10: un rango al revés, que la
         propia base rechaza y que dejaría la sesión sin guardar. */
      const payload: Record<string, unknown> = tabla === 'p_repeticiones'
        ? columnasPrescripcion(valorStr)
        : { [COL_MEDICION[tabla]]: valor }
      if (fila?.id) await supabase.from(tabla).update(payload).eq('id', fila.id)
      else await supabase.from(tabla).insert({ id_tarea: t.id, ...payload })
    } else if (fila?.id) {
      // Cambió de tipo (o se quitó la medición): la fila vieja sobra.
      await supabase.from(tabla).delete().eq('id', fila.id)
    }
  }))
}
