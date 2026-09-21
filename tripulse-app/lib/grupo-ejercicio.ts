// ============================================================
// El grupo con el que sale un ejercicio al prescribir
// ============================================================
//
// La biblioteca clasifica con etiquetas (tipo, región…), pero el constructor de
// sesiones y el reparto de series por grupo siguen agrupando por UNA cadena,
// `grupo_muscular`. El desplegable «Grupo» de la prescripción sale tal cual de
// los valores distintos de esa columna.
//
// COMPLEJOS. Arrancada, cargada, dos tiempos, del suelo a overhead… No son de
// un músculo: son el cuerpo entero moviendo una carga de abajo arriba. Por eso
// no cuelgan de su primera región, como el resto, sino de su propio grupo,
// «Complejos», que es lo que el entrenador busca al prescribirlos.
//
// No confundir con el TIPO DE SERIE «Complex» de la prescripción, que encadena
// dos ejercicios en una misma serie. Un ejercicio del grupo Complejos se
// prescribe como una serie normal.

export const COMPLEJOS = 'Complejos'

/** Si lleva la etiqueta de Complejos. */
export const esComplejo = (tipo: string[] | null | undefined): boolean =>
  (tipo || []).includes(COMPLEJOS)

/**
 * El grupo de un ejercicio nuevo: Complejos si lo es; si no, su primera región,
 * y si no tiene región, Movilidad u Otros según el tipo.
 */
export function grupoAlCrear(tipo: string[] | null | undefined, region: string[] | null | undefined): string {
  if (esComplejo(tipo)) return COMPLEJOS
  const primera = (region || [])[0]
  if (primera) return primera
  return (tipo || []).includes('Movilidad') ? 'Movilidad y flexibilidad' : 'Otros'
}

/**
 * El grupo al editar, o `null` si no hay que tocarlo.
 *
 * Solo cambia cuando el ejercicio ENTRA o SALE de Complejos. En cualquier otro
 * caso se respeta el que tenía: los de disciplina («Natación — específico») no
 * tienen región a propósito, y rehacerles el grupo desde ella los mandaría a
 * «Otros» y los sacaría de su sitio en el desplegable.
 */
export function grupoAlEditar(
  anterior: string | null | undefined,
  tipo: string[] | null | undefined,
  region: string[] | null | undefined,
): string | null {
  const era = anterior === COMPLEJOS
  const es = esComplejo(tipo)
  if (es && !era) return COMPLEJOS
  if (era && !es) return grupoAlCrear(tipo, region)
  return null
}
