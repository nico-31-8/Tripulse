// ============================================================
// TRIPULSE — Retocar la semana generada antes de volcarla
// ============================================================
//
// EL PROBLEMA. El planificador generaba una semana y solo daba dos salidas: te
// vale entera, o vuelves a generarla con otros mandos y a ver si sale mejor. Y
// casi nunca es eso: es «esta bien, pero el jueves no puedo» o «hora y media de
// rodillo es demasiado esta semana». Sin poder tocar una cosa, el entrenador
// acababa volcando algo que no era lo que quería y corrigiéndolo después en el
// calendario, una sesión cada vez.
//
// QUÉ SE PUEDE TOCAR. Mover de día, cambiar la duración y quitar. No cambiar la
// plantilla: elegir otra sesión es volver a decidir qué entrenamiento es, y eso
// es lo que hace el generador con el catálogo entero delante. Para eso está
// volver a generar.
//
// LO QUE SE TOCA QUEDA MARCADO. `editado` no es cosmético: al volcar, el
// entrenador tiene que poder ver de un vistazo qué se apartó de lo que propuso
// el generador. Un plan que se ha corregido a mano y uno que salió así no son
// lo mismo aunque se vean igual.

import type { Relleno } from './plan-relleno'
import { DIAS, type DiaSemana } from './plan-colocacion'

/* Los días salen de `plan-colocacion`, que es donde ya estaban. Escribirlos otra
   vez aquí habría creado una segunda lista —y la mía iba sin acentos, así que
   «Miércoles» y «miercoles» habrían sido días distintos: mover una sesión ahí
   la habría dejado en un día que el volcado no reconoce. */

/**
 * Suelo y techo de la duración.
 *
 * Diez minutos es lo más corto que es una sesión y no un calentamiento suelto;
 * cinco horas cubre la tirada larga más larga de un Ironman. Fuera de ahí es un
 * dedo que resbaló, y una sesión de 6000 minutos se volcaría al calendario tan
 * tranquila y le rompería la carga de la semana.
 */
export const MIN_MINUTOS = 10
export const MAX_MINUTOS = 300

export type RellenoEditable = Relleno & { editado?: boolean }

/**
 * Deja los minutos dentro de lo posible, o null si eso no es un número.
 *
 * OJO CON EL VACÍO. `Number('')` es cero, no NaN, así que sin esta guarda
 * borrar la casilla para escribir otra cifra la dejaría en el mínimo a mitad
 * de tecleo: escribes «9», se queda en 10, y ya no puedes llegar a «90».
 */
export function acotarMinutos(n: unknown): number | null {
  if (n == null) return null
  if (typeof n === 'string' && n.trim() === '') return null
  const x = Math.round(Number(n))
  if (!Number.isFinite(x)) return null
  return Math.min(MAX_MINUTOS, Math.max(MIN_MINUTOS, x))
}

/**
 * Mueve una sesión a otro día.
 *
 * Devuelve una lista nueva; no toca la que recibe. Así el «antes» sigue estando
 * para poder comparar, y React ve que ha cambiado.
 */
export function moverA(lista: RellenoEditable[], i: number, dia: DiaSemana): RellenoEditable[] {
  if (!lista[i] || !DIAS.includes(dia)) return lista
  if (lista[i].dia === dia) return lista
  return lista.map((r, k) => (k === i ? { ...r, dia, editado: true } : r))
}

/** Cambia la duración, acotada. Un valor imposible se ignora. */
export function cambiarDuracion(lista: RellenoEditable[], i: number, minutos: unknown): RellenoEditable[] {
  const m = acotarMinutos(minutos)
  if (!lista[i] || m == null) return lista
  if (lista[i].minutos === m) return lista
  return lista.map((r, k) => (k === i ? { ...r, minutos: m, editado: true } : r))
}

/**
 * Las otras sesiones que valen para ese mismo hueco.
 *
 * Son las del catálogo con SU misma disciplina y SU misma zona. Ahí es donde
 * está la diferencia entre continua y por series: en ciclismo AEI el catálogo
 * ofrece «Intervalos al FTP», «FTP continuo» y «Over-unders», y en carrera AEM
 * hay continuo medio, continuo variable e interválico largo.
 *
 * NO se ofrecen las de otra zona. Cambiar de zona no es cambiar la forma de la
 * sesión, es cambiar lo que entrena: el reparto de intensidades de la semana
 * lo decidió el generador contando zonas, y sacar una de Z4 para meter otra de
 * Z2 rompería ese reparto sin que nada avisara. Para eso está volver a generar.
 */
export function alternativasDe(
  r: RellenoEditable,
  plantillasDe: (d: string) => any[],
  opcionesDe: (p: any) => any[],
): { clave: string; nombre: string }[] {
  const disciplina = r?.hueco?.bloque
  if (!disciplina || disciplina === 'Fuerza' || !r.zona) return []
  return (plantillasDe(disciplina) || [])
    .filter((p: any) => p.zona === r.zona)
    .flatMap((p: any) => (opcionesDe(p) || []).map((o: any) => ({
      clave: o.clave,
      nombre: o.esBase ? p.nombre : p.nombre + ' · ' + o.nombre,
    })))
}

/**
 * Cambia la sesión por otra del mismo hueco.
 *
 * El MOTIVO se reescribe, y no es un detalle. El que había explicaba por qué la
 * eligió el generador —«es la que más tiempo lleva sin usarse»— y en cuanto la
 * cambias eso deja de ser cierto. Un motivo que miente es peor que ninguno: el
 * entrenador lo lee dentro de dos semanas y se cree la razón.
 */
export function cambiarSesion(
  lista: RellenoEditable[], i: number, clave: string, nombre: string,
): RellenoEditable[] {
  if (!lista[i] || !clave) return lista
  if (lista[i].clave === clave) return lista
  return lista.map((r, k) => (k === i
    ? { ...r, clave, nombre, motivo: 'La has elegido tú en vez de la que propuso el generador.', editado: true }
    : r))
}

/** Quita una sesión de la semana. */
export function quitar(lista: RellenoEditable[], i: number): RellenoEditable[] {
  if (!lista[i]) return lista
  return lista.filter((_, k) => k !== i)
}

export function minutosTotales(lista: RellenoEditable[]): number {
  return (lista || []).reduce((a, r) => a + (Number(r.minutos) || 0), 0)
}

export interface Resumen {
  /** Cuántas se han quitado respecto a lo generado. */
  quitadas: number
  /** Cuántas de las que quedan se han tocado. */
  tocadas: number
  minutosAntes: number
  minutosAhora: number
  /** Diferencia en minutos: negativa si ahora hay menos. */
  diferencia: number
  /** Si hay algo que contar. */
  hayCambios: boolean
}

/**
 * Qué se ha cambiado respecto a lo que generó la máquina.
 *
 * Se enseña antes de volcar. No es para impedir nada: es para que quien pulsa
 * sepa que lo que va al calendario ya no es lo que propuso el generador.
 */
export function resumenEdicion(original: RellenoEditable[], actual: RellenoEditable[]): Resumen {
  const antes = minutosTotales(original)
  const ahora = minutosTotales(actual)
  const quitadas = Math.max(0, (original?.length || 0) - (actual?.length || 0))
  const tocadas = (actual || []).filter(r => r.editado).length
  return {
    quitadas, tocadas,
    minutosAntes: antes,
    minutosAhora: ahora,
    diferencia: ahora - antes,
    hayCambios: quitadas > 0 || tocadas > 0,
  }
}

/** «9,2 h» a partir de minutos. */
export function enHoras(min: number): string {
  return (Math.round(min / 6) / 10).toString().replace('.', ',') + ' h'
}

/** La frase de lo cambiado, o null si está tal como salió. */
export function textoResumen(r: Resumen): string | null {
  if (!r.hayCambios) return null
  const partes: string[] = []
  if (r.tocadas) partes.push(r.tocadas === 1 ? '1 sesión cambiada' : r.tocadas + ' sesiones cambiadas')
  if (r.quitadas) partes.push(r.quitadas === 1 ? '1 quitada' : r.quitadas + ' quitadas')
  const signo = r.diferencia > 0 ? '+' : ''
  const dif = r.diferencia === 0 ? 'el mismo tiempo' : signo + enHoras(r.diferencia)
  return partes.join(' · ') + ' · ' + enHoras(r.minutosAhora) + ' en total (' + dif + ')'
}
