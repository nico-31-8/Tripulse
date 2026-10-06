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
