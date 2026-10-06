// ============================================================
// TRIPULSE — El historial de un ejercicio
// ============================================================
//
// Qué ha hecho este atleta en ESTE ejercicio, día a día.
//
// LO QUE ENSEÑÓ EL PRIMER DATO REAL, y que decide cómo se mide esto. El hip
// thrust de un atleta, tres sesiones:
//
//     20 ago · 50 kg · 5 · 5 · 5 · 5
//     28 ago · 50 kg · 7 · 7 · 7 · 7
//      7 sep · 50 kg · 7 · 9 · 10
//
// Progresó, y el peso no se movió un kilo. Midiendo «el peso máximo del día»
// —que es lo que uno hace sin pensar— el gráfico diría 50, 50, 50: no progresa.
// Por eso cada día lleva SU PESO Y SUS REPETICIONES, y el trabajo total como
// resumen: subir reps al mismo peso es progresar, y es la forma más corriente
// de hacerlo.

import { vivas } from './papelera'

/** Una serie anotada, como sale de la base. */
export interface SerieAnotada {
  fecha: string
  peso?: number | string | null
  reps?: number | string | null
  /** Lo que el atleta anotó de esfuerzo, en la unidad de `controlTipo`. */
  control?: number | string | null
  /** 'rir' | 'rpe' | null. Son escalas INVERSAS: RIR 2 ≈ RPE 8. */
  controlTipo?: string | null
  serie?: number | null
}

export interface SerieDelDia {
  peso: number | null
  reps: number | null
  control: number | null
  controlTipo: string | null
}

/** Las series de un mismo peso dentro de un día. */
export interface PesoDelDia {
  peso: number | null
  reps: (number | null)[]
}

export interface DiaHistorial {
  fecha: string
  series: SerieDelDia[]
  /**
   * EL DÍA, PARTIDO POR PESOS, de más pesado a menos.
   *
   * Un día no siempre es un peso. Hay aproximaciones, hay drop sets, y hay
   * series anotadas en el ejercicio que no era. En un caso real había tres
   * series a 50 kg y tres a 8, 12,5 y 15: enseñándolo como una sola línea
   * salía «50 kg · 7 · 9 · 10 · 10 · 10 · 10», que dice que hizo seis series a
   * cincuenta kilos. Y eso no es un detalle feo, es un número falso donde el
   * entrenador va a decidir la carga de la semana que viene.
   */
  porPeso: PesoDelDia[]
  /** El peso más alto del día. Es con el que se compara entre días. */
  pesoTop: number | null
  /** Todas las repeticiones del día sumadas. */
  reps: number
  /** Σ peso × reps. El número que ve subir la progresión que el peso esconde. */
  trabajo: number
  /** Si alguna serie trae esfuerzo anotado. Sin él, dos días no se comparan igual. */
  conControl: boolean
}

const num = (x: unknown): number | null => {
  if (x === null || x === undefined || x === '') return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}

/**
 * El historial agrupado por día, del más reciente al más antiguo.
 *
 * POR DÍA Y NO POR SESIÓN: dos sesiones el mismo día con el mismo ejercicio son
 * el mismo estímulo para esto, y partirlas en dos puntos haría ver una caída
 * donde solo hubo un descanso de dos horas.
 */
export function historialPorDia(series: SerieAnotada[] | null | undefined): DiaHistorial[] {
  const dias = new Map<string, SerieDelDia[]>()
  for (const s of series || []) {
    const f = (s?.fecha || '').slice(0, 10)
    if (!f) continue
    const lista = dias.get(f) || []
    lista.push({
      peso: num(s?.peso),
      reps: num(s?.reps),
      control: num(s?.control),
      controlTipo: (s?.controlTipo || null) as string | null,
    })
    dias.set(f, lista)
  }

  return [...dias.entries()]
    .map(([fecha, series]) => {
      const pesos = series.map(x => x.peso).filter((n): n is number => n != null && n > 0)
      const reps = series.reduce((a, x) => a + (x.reps || 0), 0)
      /* El trabajo solo cuenta las series que tienen LAS DOS cosas: con el peso
         sin reps, o al revés, sumar cero mentiría menos que sumar a medias,
         pero las dos opciones son peores que no contarla. */
      const trabajo = series.reduce((a, x) =>
        a + (x.peso != null && x.reps != null ? x.peso * x.reps : 0), 0)
      /* Agrupadas por peso, de más a menos. Las que no lo traen van juntas al
         final: son las de tiempo o las que se anotaron a medias, y mezclarlas
         con un peso cualquiera sería inventarlo. */
      const grupos = new Map<string, PesoDelDia>()
      for (const x of series) {
        const clave = x.peso == null ? 'sin' : String(x.peso)
        const g = grupos.get(clave) || { peso: x.peso, reps: [] }
        g.reps.push(x.reps)
        grupos.set(clave, g)
      }
      const porPeso = [...grupos.values()]
        .sort((a, b) => (b.peso ?? -1) - (a.peso ?? -1))

      return {
        fecha,
        series,
        porPeso,
        pesoTop: pesos.length ? Math.max(...pesos) : null,
        reps,
        trabajo: Math.round(trabajo),
        conControl: series.some(x => x.control != null),
      }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/**
 * Qué ha cambiado entre los dos últimos días, en una frase.
 *
 * DICE LA DE REPETICIONES CUANDO EL PESO NO SE MUEVE, que es el caso que de
 * verdad pasa. Diciendo solo «mismo peso» se perdería la progresión entera.
 * Devuelve null con menos de dos días: con uno no hay nada que comparar, y
 * escribir «primera vez» ya lo dice la propia lista.
 */
export function queCambio(dias: DiaHistorial[] | null | undefined): string | null {
  const l = dias || []
  if (l.length < 2) return null
  const [hoy, antes] = l

  const dp = hoy.pesoTop != null && antes.pesoTop != null ? hoy.pesoTop - antes.pesoTop : null
  const dr = hoy.reps - antes.reps

  if (dp != null && dp !== 0) {
    const signo = dp > 0 ? '+' : '−'
    return signo + Math.abs(Math.round(dp * 10) / 10) + ' kg'
  }

  /* CON DISTINTO NÚMERO DE SERIES NO SE COMPARAN LOS TOTALES. Pasó en el caso
     real: de 4×7 a 7+9+10 son 28 reps contra 26, así que la resta diría «menos
     repeticiones» — y lo que hizo fue subir de 7 a 10 por serie. Cuando las
     series cambian se dice ESO y no se juzga, que es lo honesto: el entrenador
     tiene las dos filas delante para verlo. */
  if (hoy.series.length !== antes.series.length) {
    return 'mismo peso, ' + hoy.series.length +
      (hoy.series.length === 1 ? ' serie' : ' series') + ' en vez de ' + antes.series.length
  }

  if (dr !== 0) {
    const signo = dr > 0 ? '+' : '−'
    return 'mismo peso, ' + signo + Math.abs(dr) + (Math.abs(dr) === 1 ? ' repetición' : ' repeticiones')
  }
  if (hoy.trabajo !== antes.trabajo) {
    return hoy.trabajo > antes.trabajo ? 'más trabajo' : 'menos trabajo'
  }
  return 'igual que la vez anterior'
}

/**
 * La clave con la que se reconoce «el mismo ejercicio» entre semanas.
 *
 * EL ENLACE A LA BIBLIOTECA MANDA, y el nombre es el respaldo: 369 de 402
 * prescripciones lo llevan, y las 33 que no son las escritas a mano. Con el
 * nombre a secas, renombrar un ejercicio en la biblioteca partiría su historial
 * en dos; con el enlace a secas, esas 33 no tendrían historial ninguno.
 */
export const claveDeEjercicio = (e: { ejercicio_id?: number | null; nombre?: string | null }): string =>
  e?.ejercicio_id != null ? 'bib:' + e.ejercicio_id : 'nom:' + (e?.nombre || '').trim().toLowerCase()

// ------------------------------------------------------------
// Traerlo de la base
// ------------------------------------------------------------

/**
 * El historial de un ejercicio para un atleta.
 *
 * Se busca por el ENLACE A LA BIBLIOTECA, y por nombre solo cuando no lo hay.
 * Las dos a la vez traerían repetidas las prescripciones que tienen las dos
 * cosas.
 *
 * Y de la papelera no sale nada: una sesión tirada no es historial de nadie.
 */
export async function cargarHistorial(
  sb: unknown,
  idDeportista: number,
  ejercicio: { id?: number | null; nombre?: string | null },
  tope = 12,
): Promise<DiaHistorial[]> {
  const cliente = sb as { from: (t: string) => any }
  if (!idDeportista) return []

  /* Primero las prescripciones de ese ejercicio: por enlace si lo hay, y si no
     por nombre. Sin esto no se sabe qué series son de este ejercicio. */
  let q = cliente.from('ejercicios').select('id')
  q = ejercicio?.id != null
    ? q.eq('ejercicio_id', ejercicio.id)
    : q.ilike('nombre', (ejercicio?.nombre || '').trim())
  const { data: prescripciones } = await q
  const ids = (prescripciones || []).map((e: { id: number }) => e.id)
  if (!ids.length) return []

  const { data } = await cliente.from('series_realizadas')
    .select('peso_real, repeticiones_reales, control_real, control_tipo, numero_serie, id_ejercicio')
    .eq('id_deportista', idDeportista).in('id_ejercicio', ids)
  if (!data?.length) return []

  /* La fecha vive en la sesión, no en la serie. Se piden las tareas y las
     sesiones de esas prescripciones en dos viajes y se cruzan aquí. */
  const { data: ejs } = await cliente.from('ejercicios').select('id, id_tarea').in('id', ids)
  const tareaDe = new Map((ejs || []).map((e: { id: number; id_tarea: number }) => [e.id, e.id_tarea]))
  const idsTarea = [...new Set([...tareaDe.values()].filter(Boolean))]
  if (!idsTarea.length) return []

  const { data: tareas } = await cliente.from('tarea').select('id, id_sesion').in('id', idsTarea)
  const sesionDe = new Map((tareas || []).map((t: { id: number; id_sesion: number }) => [t.id, t.id_sesion]))
  const idsSesion = [...new Set([...sesionDe.values()].filter(Boolean))]
  if (!idsSesion.length) return []

  const { data: sesiones } = await vivas(cliente.from('sesion')
    .select('id, fecha_sesion').in('id', idsSesion))
  const fechaDe = new Map((sesiones || [])
    .map((s: { id: number; fecha_sesion: string }) => [s.id, s.fecha_sesion]))

  const series: SerieAnotada[] = []
  for (const r of data as Record<string, unknown>[]) {
    const tarea = tareaDe.get(r.id_ejercicio as number)
    const sesion = tarea != null ? sesionDe.get(tarea) : undefined
    const fecha = sesion != null ? fechaDe.get(sesion) : undefined
    if (!fecha) continue   // de la papelera, o sin sesión viva
    series.push({
      fecha: fecha as string,
      peso: r.peso_real as number | null,
      reps: r.repeticiones_reales as number | null,
      control: r.control_real as number | null,
      controlTipo: r.control_tipo as string | null,
      serie: r.numero_serie as number | null,
    })
  }

  return historialPorDia(series).slice(0, tope)
}
