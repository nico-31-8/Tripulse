// ============================================================
// El orden de los chips dentro de una semana del lienzo
// ============================================================
//
// No había ninguno: salían en el orden en que se habían creado, mezclando
// fuerza y carrera. Con once chips en una semana —que es lo normal en una de
// carga— para contar cuántas sesiones de fuerza llevaba había que leerlos uno
// a uno.
//
// EL ORDEN, DE ARRIBA ABAJO: primero el deporte, y dentro de cada deporte de
// más duro a más suave. Lo eligió el usuario así: fuerza arriba y carrera
// abajo. El híbrido va pegado a la fuerza porque es fuerza con cardio, y el
// brick justo antes de la carrera porque acaba corriendo.
//
// LOS «SIN ZONA» CIERRAN SU GRUPO, no la columna: son sesiones del calendario
// a las que les falta la zona, y lo que interesa es verlas junto a las de su
// deporte para saber cuál es la que está a medias.

import { normalizar, TODAS } from './disciplinas'
import { cargaZona } from './zonas'

/** De arriba abajo en la columna. */
export const ORDEN_DISCIPLINA = ['Fuerza', 'Hibrido', 'Natacion', 'Ciclismo', 'Brick', 'Carrera']

export interface ChipOrdenable {
  disciplina?: string | null
  zona?: string | null
}

/** La clave por la que se agrupan: la disciplina normalizada. */
export const grupoDeChip = (c: ChipOrdenable): string => normalizar(c?.disciplina)

const puesto = (c: ChipOrdenable): number => {
  const i = ORDEN_DISCIPLINA.indexOf(grupoDeChip(c))
  /* Una disciplina que no esté en la lista va al final, nunca fuera: el chip
     tiene que salir igual. Si aparece una nueva, salta su test. */
  return i < 0 ? ORDEN_DISCIPLINA.length : i
}

/**
 * Cuánto pesa la zona. Sin zona, por debajo de todas las de su grupo.
 *
 * El nivel manda, y el RPE desempata: AEL y AEM son las dos nivel 2, pero el
 * AEM se hace a 5 de esfuerzo y el AEL a 3,5. Sin el desempate, dos zonas
 * distintas quedaban en el orden en que se hubieran creado.
 */
const dureza = (c: ChipOrdenable): number => {
  const z = (c?.zona || '').trim()
  if (!z) return -1
  const carga = cargaZona(z)
  return carga.nivel + (carga.rpe || 0) / 100
}

/**
 * Los chips de una semana, ordenados PARA PINTAR DE ARRIBA ABAJO.
 *
 * Ojo con esto último: la columna se pintaba con `flex-col-reverse`, o sea que
 * el primero del array salía abajo del todo. Al ordenar aquí, la columna pasa a
 * `flex-col` + `justify-end` —mismo aspecto, los chips siguen apoyados abajo—
 * para que el orden del array sea el que se ve.
 */
export function ordenarChips<T extends ChipOrdenable>(chips: T[]): T[] {
  return [...(chips || [])].sort((a, b) =>
    puesto(a) - puesto(b) || dureza(b) - dureza(a))
}

/** ¿Empieza aquí un grupo nuevo? Para dejar un hueco entre deportes. */
export function abreGrupo(lista: ChipOrdenable[], i: number): boolean {
  return i > 0 && grupoDeChip(lista[i]) !== grupoDeChip(lista[i - 1])
}

/** Las disciplinas del catálogo que no tienen sitio en el orden. Para su test. */
export const sinSitio = (): string[] => TODAS.filter(d => !ORDEN_DISCIPLINA.includes(d))
