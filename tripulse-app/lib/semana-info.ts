// ============================================================
// TRIPULSE — Información de la semana
// ============================================================
//
// Lo que el entrenador necesita saber MIENTRAS monta la semana: cuántas series
// lleva cada grupo muscular y cómo está repartido el tiempo por zonas.
//
// NO CALCULA NADA NUEVO. Las dos cuentas ya existían y estaban peleadas en
// pantallas distintas: las series por grupo las hace `lib/series-por-grupo` y el
// tiempo y los metros por zona salen de los bloques de `lib/atribucion`, donde
// un bloque ES una tarea y trae su zona puesta. Aquí solo se agrupan.
//
// Y SE MIRA LO PRESCRITO, no lo realizado. Es lo que se pidió y además es lo
// único coherente: a mitad de semana, mezclar los minutos reales de los días
// pasados con los planeados de los que faltan daría una semana que no existe en
// ningún sitio. Para ver lo hecho hay un botón aparte, y entonces se mira todo
// realizado.

import { ZONAS_RESISTENCIA } from './zonas'
/* El formateador de horas NO se escribe aquí: ya existe, y hay un test que
   salta si alguien se hace el suyo. Lo cazó escribiendo este fichero. */
import { horasMinutos } from './medicion'
import { esDisciplinaDeFuerza } from './disciplinas'
import { vivas } from './papelera'
import { cargarBloques } from './atribucion'
import { conRondasHechas } from './series-por-grupo'

/** Un bloque de `lib/atribucion`, con lo poco que hace falta aquí. */
export interface BloqueSemana {
  disciplina: string
  minutos: number
  metros: number
  zona: string | null
  id_sesion?: number
}

export interface ZonaSemana {
  zona: string
  /** Cómo se llama de verdad, para no enseñar solo la sigla. */
  nombre: string
  color: string
  minutos: number
  metros: number
  /** Del total de minutos de la semana. */
  pct: number
}

export interface DisciplinaSemana {
  disciplina: string
  minutos: number
  metros: number
  sesiones: number
}

/**
 * DÓNDE ESTÁ EL CORTE ENTRE SUAVE Y DURO.
 *
 * En AEM. Por debajo —recuperación y aeróbico lipolítico— se está claramente
 * por debajo del primer umbral: AEL llega hasta el 75 % de la VAM. De AEM
 * (75-90 %) hacia arriba ya no es suave por mucho que se llame «resistencia
 * básica», y contarlo como tal es justo el error que describe el máster: los
 * días suaves que se van acelerando hasta que medio volumen acaba en el centro.
 *
 * Es UNA decisión, no una ley, y por eso está en una constante con nombre y no
 * repartida por la pantalla.
 */
export const ZONAS_SUAVES = ['AER', 'AEL']

const META = new Map(ZONAS_RESISTENCIA.map(z => [z.sigla, z]))
const SIN_ZONA = 'Sin zona'

/**
 * Los bloques que de verdad son de resistencia.
 *
 * LAS ZONAS DE FUERZA NO SE MEZCLAN CON LAS DE RESISTENCIA. Son dos sistemas
 * distintos —FMI y FLEX contra AEL y PAE— y juntarlos hacía dos destrozos a la
 * vez: la cinta de colores enseñaba zonas de gimnasio como si fueran de
 * carrera, y el porcentaje de «suave» las contaba como DURAS por no estar en la
 * lista de suaves. Una semana con tres sesiones de fuerza salía más dura de lo
 * que era, y el número que el entrenador usa para decidir si va polarizado era
 * falso.
 *
 * Se mira la disciplina y no la sigla a propósito: una zona de fuerza que
 * mañana se llame igual que una de resistencia seguiría cayendo bien.
 */
export const soloResistencia = (bloques: BloqueSemana[] | null | undefined): BloqueSemana[] =>
  (bloques || []).filter(b => !esDisciplinaDeFuerza(b?.disciplina))

const num = (x: unknown): number => {
  const n = Number(x)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * El tiempo y los metros de cada zona, de más a menos.
 *
 * Las tareas SIN zona no se tiran: se juntan en «Sin zona». Escondiéndolas, los
 * porcentajes sumarían 100 % sobre un total incompleto y el entrenador vería un
 * reparto más limpio del que tiene — que es lo contrario de lo que esta
 * pantalla sirve.
 */
export function porZona(bloques: BloqueSemana[] | null | undefined): ZonaSemana[] {
  const mapa = new Map<string, { minutos: number; metros: number }>()
  for (const b of bloques || []) {
    const z = (b?.zona || '').trim() || SIN_ZONA
    const a = mapa.get(z) || { minutos: 0, metros: 0 }
    a.minutos += num(b?.minutos)
    a.metros += num(b?.metros)
    mapa.set(z, a)
  }
  const total = [...mapa.values()].reduce((a, x) => a + x.minutos, 0)
  return [...mapa.entries()]
    .map(([zona, x]) => ({
      zona,
      nombre: META.get(zona)?.nombre || zona,
      color: META.get(zona)?.color || '#6B7280',
      minutos: Math.round(x.minutos),
      metros: Math.round(x.metros),
      pct: total > 0 ? Math.round((x.minutos / total) * 1000) / 10 : 0,
    }))
    /* De más a menos y, a igualdad, por sigla: sin el segundo criterio dos
       zonas con el mismo tiempo bailan entre recargas según el orden en que
       lleguen de la base. */
    .sort((a, b) => (b.minutos - a.minutos) || a.zona.localeCompare(b.zona, 'es'))
}

/** Lo mismo por deporte. El que enseña si la carrera se ha disparado. */
export function porDisciplina(bloques: BloqueSemana[] | null | undefined): DisciplinaSemana[] {
  const mapa = new Map<string, { minutos: number; metros: number; ses: Set<number> }>()
  for (const b of bloques || []) {
    const d = (b?.disciplina || '').trim() || 'Otra'
    const a = mapa.get(d) || { minutos: 0, metros: 0, ses: new Set<number>() }
    a.minutos += num(b?.minutos)
    a.metros += num(b?.metros)
    if (b?.id_sesion != null) a.ses.add(b.id_sesion)
    mapa.set(d, a)
  }
  return [...mapa.entries()]
    .map(([disciplina, x]) => ({
      disciplina,
      minutos: Math.round(x.minutos),
      metros: Math.round(x.metros),
      sesiones: x.ses.size,
    }))
    .sort((a, b) => (b.minutos - a.minutos) || a.disciplina.localeCompare(b.disciplina, 'es'))
}

export interface Reparto {
  /** % de minutos en zona suave. */
  pctMinutos: number
  /** % de SESIONES cuya zona más alta es suave. */
  pctSesiones: number
  minutosSuaves: number
  minutosDuros: number
}

/**
 * Cuánto va suave, contado DE LAS DOS MANERAS.
 *
 * Y las dos hacen falta. Del máster, L1.4: «si solo cuentas sesiones, te vas a
 * creer más polarizado de lo que eres; si solo cuentas minutos, vas a
 * infravalorar el coste real de las sesiones duras». Un mismo programa sale
 * polarizado o piramidal según cómo se cuente, y eso no es una sutileza: cambia
 * la conclusión.
 *
 * Por minutos = tiempo en zona. Por sesiones = cada sesión entera cuenta según
 * su zona MÁS ALTA, que es como la etiquetaría el entrenador al planificarla:
 * una sesión con veinte minutos de series es una sesión dura aunque dure hora y
 * media.
 *
 * «Sin zona» no cuenta en ninguno de los dos: no se sabe qué era.
 */
export function reparto(bloques: BloqueSemana[] | null | undefined): Reparto {
  const lista = (bloques || []).filter(b => (b?.zona || '').trim())
  const esSuave = (z: string) => ZONAS_SUAVES.includes(z.trim())

  let suaves = 0, duros = 0
  for (const b of lista) {
    const m = num(b.minutos)
    if (esSuave(b.zona!)) suaves += m
    else duros += m
  }

  /* Por sesión manda su zona más alta. El orden es el del catálogo, que va de
     más suave a más dura: la posición ES la dureza. */
  const orden = ZONAS_RESISTENCIA.map(z => z.sigla)
  const dureza = new Map<number, number>()
  for (const b of lista) {
    if (b.id_sesion == null) continue
    const i = orden.indexOf(b.zona!.trim())
    if (i < 0) continue
    dureza.set(b.id_sesion, Math.max(dureza.get(b.id_sesion) ?? -1, i))
  }
  const sesiones = [...dureza.values()]
  const suavesSes = sesiones.filter(i => esSuave(orden[i])).length

  const total = suaves + duros
  return {
    pctMinutos: total > 0 ? Math.round((suaves / total) * 100) : 0,
    pctSesiones: sesiones.length > 0 ? Math.round((suavesSes / sesiones.length) * 100) : 0,
    minutosSuaves: Math.round(suaves),
    minutosDuros: Math.round(duros),
  }
}

/** «4h10», «55′». Lo pone `lib/medicion`, que es donde vive el tiempo. */
export const comoTiempo = (minutos: number): string => horasMinutos(minutos, '0′')

/**
 * La línea de una sola fila, la que se ve con el desplegable cerrado.
 *
 * Es la que de verdad se mira: si para saber si vas bien hay que abrirlo, no
 * sirve mientras montas la sesión.
 */
export function resumen(
  grupos: { grupo: string; series: number }[] | null | undefined,
  bloques: BloqueSemana[] | null | undefined,
): string {
  const gs = grupos || []
  const series = gs.reduce((a, g) => a + num(g.series), 0)
  const minutos = (bloques || []).reduce((a, b) => a + num(b?.minutos), 0)
  const r = reparto(bloques)

  const trozos: string[] = []
  if (series > 0) trozos.push(series + ' series · ' + gs.length + (gs.length === 1 ? ' grupo' : ' grupos'))
  if (minutos > 0) trozos.push(comoTiempo(minutos) + ' · ' + r.pctMinutos + ' % suave')
  /* Con la semana vacía se dice que está vacía. Devolver '' dejaría la cabecera
     con un hueco donde debería haber un número, que se lee como que falla. */
  return trozos.length ? trozos.join('  ·  ') : 'nada puesto todavía'
}

// ------------------------------------------------------------
// Traerlo de la base
// ------------------------------------------------------------

/**
 * Las columnas de `ejercicios` que hacen falta para contar series por grupo.
 *
 * Escritas aquí y no con `*` por lo de siempre, y con el cardio dentro: una
 * línea de cardio NO son series de fuerza, y sin `tipo_serie` y `cardio_modo`
 * cuatro series de remo saldrían como cuatro series de un músculo sin
 * clasificar. Lo decide `seriesPorGrupo`, pero solo si le llegan las columnas.
 */
export const SELECT_EJERCICIOS_SEMANA =
  'id, id_tarea, nombre, grupo_muscular, series, tipo_serie, cardio_modo, orden' as const

export interface SemanaCargada {
  /** Para `seriesPorGrupo` y para contar por ejercicio. */
  ejercicios: (EjercicioDeSemana & { nombre?: string | null })[]
  /** Para `porZona`, `porDisciplina` y `reparto`. */
  bloques: BloqueSemana[]
  /** Cuántas sesiones había y cuántas estaban hechas, para poder decirlo. */
  sesiones: number
  realizadas: number
}

export interface EjercicioDeSemana {
  grupo_muscular?: string | null
  series?: number | null
  tipo_serie?: string | null
  cardio_modo?: string | null
}

/**
 * Lo que hay en la semana de un atleta, listo para agrupar.
 *
 * `hecho` cambia las DOS mitades a la vez, y tiene que ser así: con lo
 * prescrito en fuerza y lo realizado en resistencia, el entrenador estaría
 * comparando dos semanas distintas sin saberlo.
 *
 *   - prescrito → todas las sesiones de la semana, con los minutos y metros
 *     planificados.
 *   - hecho     → solo las realizadas, con lo que el atleta midió, y las rondas
 *     de un AMRAP como las hizo y no como se estimaron.
 */
export async function cargarSemana(
  sb: any,
  idDeportista: number,
  desde: string,
  hasta: string,
  opciones: { hecho?: boolean } = {},
): Promise<SemanaCargada> {
  const vacio: SemanaCargada = { ejercicios: [], bloques: [], sesiones: 0, realizadas: 0 }
  if (!idDeportista || !desde || !hasta) return vacio

  /* DE LA PAPELERA NO SALE NADA, igual que en el resto de la app. Faltaba, y no
     fallaba: enseñaba números más grandes y creíbles. Un atleta que solo hace
     carrera y fuerza aparecía con cuatro sesiones de natación y cuatro de bici
     —las de un plan viejo que el entrenador ya había tirado— y la semana entera
     salía inflada sin que nada lo dijera.

     Con `vivas` y no con el `.or(...)` a mano: el convenio tiene su sitio
     (lib/papelera) y escribirlo aquí otra vez es la manera de que un día uno de
     los dos se quede sin el `is.null` y desaparezca el histórico entero. */
  const { data: todas } = await vivas(sb.from('sesion')
    .select('id, fecha_sesion, disciplina, estado, duracion_minutos, duracion_real, rpe_estimado, rpe_reportado')
    .eq('id_deportista', idDeportista)
    .gte('fecha_sesion', desde).lte('fecha_sesion', hasta))

  const lista = (todas || []) as { id: number; estado?: string | null }[]
  const realizadas = lista.filter(s => s.estado === 'Realizada')
  const sesiones = opciones.hecho ? realizadas : lista
  if (!sesiones.length) return { ...vacio, sesiones: lista.length, realizadas: realizadas.length }

  const ids = sesiones.map(s => s.id)
  /* Las tareas primero porque los ejercicios cuelgan de ellas; lo demás, en
     paralelo. Pedir las tareas dos veces —una aquí y otra dentro de la consulta
     de ejercicios— era un viaje de más por cada vez que se abre el panel. */
  const { data: tareas } = await sb.from('tarea')
    .select('id, id_sesion, formato, formato_config, resultado').in('id_sesion', ids)
  const idsTarea = (tareas || []).map((t: { id: number }) => t.id)

  const [{ data: ejs }, bloques] = await Promise.all([
    idsTarea.length
      ? sb.from('ejercicios').select(SELECT_EJERCICIOS_SEMANA).in('id_tarea', idsTarea)
      : Promise.resolve({ data: [] }),
    cargarBloques(sb, sesiones as never[], { soloPrescrito: !opciones.hecho, estimar: true }),
  ])

  /* En un AMRAP hecho, las series de cada línea son las rondas que hizo, no las
     que se estimaron al programarlo. Solo tiene sentido mirando lo realizado. */
  const ejercicios = opciones.hecho
    ? conRondasHechas((tareas || []) as never[], (ejs || []) as never[])
    : ((ejs || []) as never[])

  return {
    ejercicios: ejercicios as SemanaCargada['ejercicios'],
    bloques: bloques as BloqueSemana[],
    sesiones: lista.length,
    realizadas: realizadas.length,
  }
}

/**
 * Lo fijado SIEMPRE sale, aunque esta semana lleve cero.
 *
 * Es la mitad de para qué sirve fijarlo. Un grupo con 0 series no es «nada que
 * enseñar»: es justo la respuesta que se estaba buscando al marcarlo. Quien
 * fija el glúteo lo fija porque quiere saber si le está entrando algo, y la
 * semana que no le entra nada es la semana en la que el panel tiene que
 * decírselo — y era precisamente la semana en la que desaparecía de la lista.
 *
 * Se respeta el ORDEN EN QUE SE FIJARON y no se ordena por series: es la lista
 * del entrenador, y que un grupo salte de sitio al bajar a cero es justo cuando
 * más molesta buscarlo.
 */
export function conLosFijados<T extends { grupo: string; series: number }>(
  hay: T[] | null | undefined,
  fijados: string[] | null | undefined,
): { grupo: string; series: number }[] {
  const mapa = new Map((hay || []).map(g => [g.grupo.trim().toLowerCase(), g]))
  const out: { grupo: string; series: number }[] = []
  const puestos = new Set<string>()

  for (const f of fijados || []) {
    const clave = (f || '').trim().toLowerCase()
    if (!clave || puestos.has(clave)) continue
    puestos.add(clave)
    const suyo = mapa.get(clave)
    /* Con el nombre que fijó el entrenador, no el de la base: si no hay nada
       esta semana no hay de dónde sacarlo, y la fila saldría sin nombre. */
    out.push(suyo ? { grupo: suyo.grupo, series: suyo.series } : { grupo: f.trim(), series: 0 })
  }
  return out
}
