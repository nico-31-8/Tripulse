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
//
// FUNCIONAL, lo mismo: las estaciones de HYROX y los gimnásticos de CrossFit
// (wall balls, burpees, toes to bar…). Se añadió con los bloques con formato,
// para poder elegirlos de la biblioteca dentro de un AMRAP o un EMOM.

export const COMPLEJOS = 'Complejos'
export const FUNCIONAL = 'Funcional'

/** Las etiquetas de `tipo` que además son el grupo con el que sale al prescribir. */
export const GRUPOS_DE_ETIQUETA = [COMPLEJOS, FUNCIONAL]

/** El grupo que manda la etiqueta, o null si no lleva ninguna de esas. */
export const grupoDeEtiqueta = (tipo: string[] | null | undefined): string | null =>
  GRUPOS_DE_ETIQUETA.find(g => (tipo || []).includes(g)) ?? null

/** Si lleva la etiqueta de Complejos. */
export const esComplejo = (tipo: string[] | null | undefined): boolean =>
  (tipo || []).includes(COMPLEJOS)

/**
 * EL GRIFO DE LOS GRUPOS GEMELOS.
 *
 * El grupo de un ejercicio nuevo sale de su primera REGIÓN, y las regiones de
 * /fuerza se llaman más corto que los grupos de la biblioteca: «Rodilla» frente
 * a «Rodilla (fortalecimiento)», «Core» frente a «Core y estabilidad». Sin esta
 * tabla, el primer ejercicio que alguien creara con región «Core» abriría un
 * grupo nuevo al lado del que ya existe, con los mismos ejercicios repartidos
 * entre los dos y el desplegable creciendo solo.
 *
 * Pasó de verdad con «Espalda alta» frente a «Espalda alta y romboides», y se
 * arregló a mano el 25/09/2026 (supabase/fusion-grupos-gemelos.sql). Esto es
 * para no repetirlo.
 */
const GRUPO_DE_REGION: Record<string, string> = {
  'Core': 'Core y estabilidad',
  'Cuello': 'Cuello y cervical',
  'Hombro': 'Hombro y manguito rotador',
  'Rodilla': 'Rodilla (fortalecimiento)',
  'Espalda alta': 'Espalda alta y romboides',
}

/**
 * El grupo de un ejercicio nuevo: Complejos o Funcional si lo es; si no, el de
 * su primera región, y si no tiene región, Movilidad u Otros según el tipo.
 *
 * «Otros» se queda como último recurso a propósito: un ejercicio sin región no
 * tiene grupo, y meterlo a la fuerza en uno sería peor que decir que no se
 * sabe. Es el cajón de los que hay que clasificar, no un error.
 */
export function grupoAlCrear(tipo: string[] | null | undefined, region: string[] | null | undefined): string {
  const g = grupoDeEtiqueta(tipo)
  if (g) return g
  const primera = (region || [])[0]
  if (primera) return GRUPO_DE_REGION[primera] ?? primera
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
  const era = GRUPOS_DE_ETIQUETA.includes(anterior || '') ? anterior : null
  const es = grupoDeEtiqueta(tipo)
  if (es && es !== era) return es
  if (era && !es) return grupoAlCrear(tipo, region)
  return null
}
