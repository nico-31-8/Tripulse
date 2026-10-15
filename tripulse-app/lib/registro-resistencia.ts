// ============================================================
// TRIPULSE — El atleta apunta su propia sesión de nadar, rodar o correr
// ============================================================
//
// El hermano de `registro-fuerza`. Allí el atleta apunta ejercicios y series;
// aquí apunta BLOQUES: zona, cuántas series, de cuánto, a qué ritmo y con qué
// descanso. «8 × 100 m a 1:38 con 20 s» es un bloque.
//
// POR QUÉ HACÍA FALTA
// Hasta ahora el atleta solo podía dejar la cabecera —disciplina, día, duración,
// RPE y una nota—. Podía decir «nadé 62 minutos» y nada más. Eso no entra en el
// volumen por zonas, no entra en la distribución de intensidad y no le sirve al
// entrenador para nada: es un rectángulo en el calendario.
//
// LO QUE SE GUARDA SON FILAS NORMALES
// `sesion` + `tarea` + su medición (`p_distancia` o `p_duracion`), exactamente
// las mismas que deja el volcado de un plan. Por eso el volumen, la carga y la
// distribución de zonas cuentan esta sesión sin enterarse de que la escribió el
// atleta y no el entrenador.
//
// PLANEADO Y REAL VALEN LO MISMO AQUÍ
// Cuando el atleta apunta algo que YA hizo, no hay dos números que comparar: lo
// que escribe es lo que pasó. Se escriben los dos campos —`metros_planeados` y
// `metros_reales`— con el mismo valor, porque las pantallas de la app leen unas
// veces uno y otras veces el otro, y dejar uno vacío haría que la sesión
// apareciera en unos sitios y en otros no.

import { valorCanonico } from './medicion'
import { rellenarRpeTareas } from './rpe-sesion'
import { idsEnOrden } from './copiar-sesion'

export interface BloqueRegistro {
  /** Sigla de Zonas 2 (AEL, AEM…) o «Z3» del sistema clásico. Vacío = sin zona. */
  zona: string
  series: string
  cantidad: string
  unidad: 'm' | 'min'
  /**
   * El ritmo al que se hizo, en mm:ss. Solo tiene sentido midiendo por
   * distancia: un bloque de 40 minutos no tiene «ritmo» sin saber la distancia.
   */
  ritmo: string
  /** Descanso entre series, en segundos. */
  descanso: string
}

export const BLOQUE_VACIO: BloqueRegistro = {
  zona: '', series: '1', cantidad: '', unidad: 'm', ritmo: '', descanso: '',
}

const num = (s: string | null | undefined): number => {
  const n = Number(String(s ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Las series de un bloque, que es 1 si no se dice otra cosa. */
export function seriesDe(b: BloqueRegistro): number {
  const n = Math.floor(num(b?.series))
  return n > 0 ? n : 1
}

/**
 * ¿Este bloque dice algo?
 *
 * La cantidad es lo único imprescindible: sin ella no hay ni metros ni minutos
 * que contar, y una zona suelta no es un bloque de entrenamiento.
 */
export function bloqueTieneAlgo(b: BloqueRegistro): boolean {
  return num(b?.cantidad) > 0
}

/** Los bloques que de verdad se hicieron, en orden. */
export function bloquesQueCuentan(bloques: BloqueRegistro[]): BloqueRegistro[] {
  return (bloques || []).filter(bloqueTieneAlgo)
}

/**
 * Lo que suma la sesión entera.
 *
 * Metros y minutos van por separado a propósito: mezclar «8 × 100 m» con «20
 * min de vuelta a la calma» en una sola cifra obligaría a inventarse un ritmo
 * para el segundo bloque, y un número inventado es peor que dos números.
 */
export function totalDe(bloques: BloqueRegistro[]): { metros: number; minutos: number } {
  let metros = 0
  let minutos = 0
  for (const b of bloquesQueCuentan(bloques)) {
    const total = seriesDe(b) * num(b.cantidad)
    if (b.unidad === 'min') minutos += total
    else metros += total
  }
  return { metros: Math.round(metros), minutos: Math.round(minutos) }
}

/** «1 600 m · 22 min», o solo la mitad que exista. */
export function resumenTotal(bloques: BloqueRegistro[]): string {
  const { metros, minutos } = totalDe(bloques)
  const trozos: string[] = []
  if (metros > 0) trozos.push(metros.toLocaleString('es-ES') + ' m')
  if (minutos > 0) trozos.push(minutos + ' min')
  return trozos.join(' · ')
}

export function tareaDe(b: BloqueRegistro, idSesion: number, orden: number, disciplina: string) {
  return {
    id_sesion: idSesion,
    disciplina,
    orden,
    zona_entrenamiento: b.zona || null,
    series: seriesDe(b),
    descanso_segundos: num(b.descanso) > 0 ? Math.round(num(b.descanso)) : null,
  }
}

/**
 * En qué tabla vive la medición de este bloque y con qué fila.
 *
 * El valor es el de UNA serie, no el del bloque entero: la tarea ya lleva
 * `series`, así que multiplicar aquí contaría los metros dos veces.
 *
 * EL RITMO VA APARTE, NO EN LA FILA.
 * `ritmo_objetivo` nació como `numeric` y guardar «1:38» ahí revienta. Si
 * viajara dentro del mismo insert, un ritmo mal tipado tiraría también los
 * metros — que es justo lo que pasó la última vez que se metió en el insert
 * «para ahorrarse una consulta». Primero se aseguran los metros; el ritmo se
 * intenta después y, si no entra, se pierde solo el ritmo.
 */
export function medicionDe(b: BloqueRegistro, idTarea: number): {
  tabla: string; fila: any; ritmo: string | null
} {
  const valor = valorCanonico(b.unidad, b.cantidad)
  if (b.unidad === 'min') {
    return {
      tabla: 'p_duracion',
      fila: { id_tarea: idTarea, tiempo_planeado: valor, tiempo_real: valor },
      ritmo: null,
    }
  }
  return {
    tabla: 'p_distancia',
    fila: { id_tarea: idTarea, metros_planeados: valor, metros_reales: valor },
    ritmo: (b.ritmo || '').trim() || null,
  }
}

/**
 * Las mediciones de VARIOS bloques: una inserción por tabla, las dos a la vez,
 * con el ritmo dentro. Iba bloque a bloque y en dos pasos (los metros, y luego
 * su ritmo), así que eran dos esperas por bloque más la de su tarea.
 *
 * La garantía es la misma que la de `escribirMedicion`: si con el ritmo la base
 * dice que no, se repite sin él y se avisa (`sinRitmo`); lo que no puede pasar
 * es perder los metros por no poder guardar el ritmo.
 */
async function escribirMediciones(sb: any, bloques: BloqueRegistro[], idsTarea: number[]): Promise<{
  error: string | null; sinRitmo: boolean
}> {
  const porTabla: Record<string, { con: any[]; sin: any[]; hayRitmo: boolean }> = {}
  bloques.forEach((b, i) => {
    const { tabla, fila, ritmo } = medicionDe(b, idsTarea[i])
    const g = (porTabla[tabla] ||= { con: [], sin: [], hayRitmo: false })
    g.sin.push(fila)
    g.con.push(ritmo ? { ...fila, ritmo_objetivo: ritmo } : fila)
    if (ritmo) g.hayRitmo = true
  })
  const mal = 'No se pudo guardar la medición de un bloque.'
  const res = await Promise.all(Object.entries(porTabla).map(async ([tabla, g]) => {
    const r = await sb.from(tabla).insert(g.con)
    if (!r?.error) return { error: null, sinRitmo: false }
    if (!g.hayRitmo) return { error: r.error.message || mal, sinRitmo: false }
    const r2 = await sb.from(tabla).insert(g.sin)
    return r2?.error ? { error: r2.error.message || mal, sinRitmo: false } : { error: null, sinRitmo: true }
  }))
  return { error: res.find(x => x.error)?.error ?? null, sinRitmo: res.some(x => x.sinRitmo) }
}

export interface ResultadoResistencia {
  idSesion: number | null
  guardados: number
  error: string | null
  /** Los metros entraron pero el ritmo no. Se avisa; no es un fallo de guardado. */
  aviso?: string | null
}

const AVISO_RITMO = 'Se ha guardado todo menos los ritmos: la base no los admite todavía.'

export async function guardarRegistroResistencia(
  sb: any,
  opciones: {
    idDeportista: number
    disciplina: string
    fecha: string
    idMicrociclo: number | null
    realizada: boolean
    duracionMinutos: number | null
    rpe: number | null
    notas: string | null
    bloques: BloqueRegistro[]
  },
): Promise<ResultadoResistencia> {
  const {
    idDeportista, disciplina, fecha, idMicrociclo, realizada,
    duracionMinutos, rpe, notas, bloques,
  } = opciones
  const cuentan = bloquesQueCuentan(bloques)
  if (!fecha) return { idSesion: null, guardados: 0, error: 'Falta el día.' }

  const { data: ses, error: eS } = await sb.from('sesion').insert({
    id_deportista: idDeportista,
    id_microciclo: idMicrociclo,
    origen: 'deportista',
    disciplina,
    fecha_sesion: fecha,
    estado: realizada ? 'Realizada' : 'Planificada',
    duracion_minutos: duracionMinutos,
    rpe_estimado: !realizada && rpe != null ? rpe : null,
    rpe_reportado: realizada && rpe != null ? rpe : null,
    notas_entrenador: notas || null,
  }).select('id').single()

  if (eS || !ses) return { idSesion: null, guardados: 0, error: eS?.message || 'No se pudo crear la sesión.' }

  /* Si algo falla a mitad, la sesión se va entera. Media sesión guardada es
     peor que ninguna: cuenta en el volumen con la mitad de los metros. */
  const deshacer = async (msg: string): Promise<ResultadoResistencia> => {
    await sb.from('sesion').delete().eq('id', ses.id)
    return { idSesion: null, guardados: 0, error: msg }
  }

  /* Todos los bloques de golpe: sus tareas en una escritura y sus mediciones
     en otra (ver escribirMediciones). Iba bloque a bloque, tres esperas por
     cada uno. Los ids se emparejan como en lib/copiar-sesion. */
  let sinRitmo = false
  if (cuentan.length) {
    const filasT = cuentan.map((b, i) => tareaDe(b, ses.id, i + 1, disciplina))
    const rT = await sb.from('tarea').insert(filasT).select('id')
    const ids = rT?.error ? null : idsEnOrden(rT?.data, filasT.length)
    if (!ids) return deshacer(rT?.error?.message || 'No se pudo guardar un bloque.')

    const m = await escribirMediciones(sb, cuentan, ids)
    if (m.error) return deshacer(m.error)
    sinRitmo = m.sinRitmo
  }

  // El RPE también en sus tareas: el SICAT y los índices lo leen de ahí.
  if (realizada) await rellenarRpeTareas(sb, ses.id, rpe)

  return {
    idSesion: ses.id, guardados: cuentan.length, error: null,
    aviso: sinRitmo ? AVISO_RITMO : null,
  }
}

/**
 * Los bloques de una sesión ya guardada, para poder corregirla.
 *
 * Espeja lo que escribió `guardarRegistroResistencia`: si la tarea mide por
 * duración vuelve en minutos, y si mide por distancia vuelve en metros con su
 * ritmo.
 */
export function bloquesDesdeSesion(tareas: any[]): BloqueRegistro[] {
  return (tareas || []).map(t => {
    const pd = t?.p_distancia?.[0]
    const pu = t?.p_duracion?.[0]
    const seg = pu?.tiempo_real ?? pu?.tiempo_planeado ?? null
    const met = pd?.metros_reales ?? pd?.metros_planeados ?? null

    const porTiempo = met == null && seg != null
    return {
      zona: t?.zona_entrenamiento || '',
      series: String(t?.series ?? 1),
      cantidad: porTiempo ? String(Math.round(Number(seg) / 60)) : (met != null ? String(met) : ''),
      unidad: porTiempo ? 'min' : 'm',
      ritmo: pd?.ritmo_objetivo != null ? String(pd.ritmo_objetivo) : '',
      descanso: t?.descanso_segundos != null ? String(t.descanso_segundos) : '',
    } as BloqueRegistro
  })
}

/**
 * Corregir una sesión ya apuntada.
 *
 * Se guarda lo nuevo ANTES de borrar lo viejo, igual que en fuerza: si el
 * insert falla, el atleta se queda con lo que tenía en vez de con nada.
 */
export async function actualizarRegistroResistencia(
  sb: any,
  idSesion: number,
  opciones: {
    disciplina: string
    fecha: string
    realizada: boolean
    duracionMinutos: number | null
    rpe: number | null
    notas: string | null
    bloques: BloqueRegistro[]
  },
): Promise<{ guardados: number; error: string | null; aviso?: string | null }> {
  const cuentan = bloquesQueCuentan(opciones.bloques)

  const { data: viejas } = await sb.from('tarea').select('id').eq('id_sesion', idSesion)
  const idsViejos: number[] = (viejas || []).map((t: any) => t.id)

  const fallo = (e: any) =>
    (typeof e === 'string' ? e + '. ' : e?.message ? e.message + '. ' : '')
    + 'No se ha borrado nada: tu registro anterior sigue como estaba.'

  /* Lo nuevo de golpe, como al crearla (ver guardarRegistroResistencia). Y lo
     nuevo ANTES de borrar lo viejo: si algo falla, se quita solo lo nuevo y el
     registro anterior sigue como estaba. */
  let sinRitmo = false
  if (cuentan.length) {
    const orden = (idsViejos.length || 0) + 1
    const filasT = cuentan.map((b, i) => tareaDe(b, idSesion, orden + i, opciones.disciplina))
    const rT = await sb.from('tarea').insert(filasT).select('id')
    const nuevas = rT?.error ? null : idsEnOrden(rT?.data, filasT.length)
    if (!nuevas) {
      /* Si entraron pero no se pueden emparejar, se quitan: mejor nada nuevo
         que unas tareas sin su medición. */
      const entraron = ((rT?.data || []) as any[]).map(t => t.id)
      if (entraron.length) await sb.from('tarea').delete().in('id', entraron)
      return { guardados: 0, error: fallo(rT?.error || 'No se pudo guardar un bloque') }
    }

    const m = await escribirMediciones(sb, cuentan, nuevas)
    if (m.error) {
      await sb.from('tarea').delete().in('id', nuevas)
      return { guardados: 0, error: fallo(m.error) }
    }
    sinRitmo = m.sinRitmo
  }

  /* Fuera lo viejo y la cabecera, a la vez: son tablas distintas. El RPE de
     las tareas va DETRÁS del borrado y no a la vez: los dos tocan varias filas
     de `tarea` de esta sesión, y dos escrituras así a la vez pueden bloquearse
     una a otra en la base. */
  const borrarViejas = idsViejos.length ? sb.from('tarea').delete().in('id', idsViejos) : Promise.resolve(null)
  const [, { error: eS }] = await Promise.all([
    Promise.resolve(borrarViejas).then(() => opciones.realizada ? rellenarRpeTareas(sb, idSesion, opciones.rpe) : undefined),
    sb.from('sesion').update({
      disciplina: opciones.disciplina,
      fecha_sesion: opciones.fecha,
      estado: opciones.realizada ? 'Realizada' : 'Planificada',
      duracion_minutos: opciones.duracionMinutos,
      rpe_estimado: !opciones.realizada && opciones.rpe != null ? opciones.rpe : null,
      rpe_reportado: opciones.realizada && opciones.rpe != null ? opciones.rpe : null,
      notas_entrenador: opciones.notas || null,
    }).eq('id', idSesion),
  ])
  if (eS) return { guardados: cuentan.length, error: eS.message }

  return { guardados: cuentan.length, error: null, aviso: sinRitmo ? AVISO_RITMO : null }
}
