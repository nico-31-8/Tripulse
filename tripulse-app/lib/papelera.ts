// ============================================================
// TRIPULSE — Lo que está en la papelera no cuenta
// ============================================================
// Borrar una sesión en esta app es `eliminada = true`: se va a la papelera y se
// puede recuperar. Ese convenio estaba bien aplicado al ESCRIBIR y mal aplicado
// al LEER.
//
// De treinta y cuatro consultas de lectura sobre `sesion`, veinte no filtraban
// nada. O sea que una sesión borrada seguía:
//   · sumando a la carga y al TSB (la curva de forma del atleta),
//   · contando en el volumen y en las sesiones de la semana,
//   · bajando el porcentaje de adherencia,
//   · saliendo en «próximas sesiones»,
//   · y entrando en el contexto que se le manda al asistente de IA.
//
// No rompía nada. Solo hacía que los números fueran mentira, que es la forma de
// fallo más cara de este proyecto: el entrenador ve «Sobrecarga» y afloja el
// plan por sesiones que él mismo borró.
//
// POR QUÉ UNA FUNCIÓN Y NO UNA CADENA SUELTA: ya había dos copias del filtro
// escritas a mano en sitios distintos. Una tercera era cuestión de tiempo.

/** El filtro en crudo, por si hace falta pasarlo a `.or()` directamente. */
export const FILTRO_VIVAS = 'eliminada.is.null,eliminada.eq.false'

/**
 * Quita de una consulta lo que está en la papelera.
 *
 * `is.null` además de `eq.false` porque la columna se añadió después: las filas
 * anteriores la tienen a null, y `eliminada.eq.false` a secas las dejaría fuera
 * — que es el fallo contrario y peor, porque desaparecería el histórico.
 *
 * Se envuelve la consulta en vez de devolver un trozo de cadena para que el uso
 * se lea igual en todas partes:
 *
 *     const { data } = await vivas(supabase.from('sesion').select('*').eq(...))
 */
export function vivas<T>(query: T): T {
  return (query as any).or(FILTRO_VIVAS)
}

/**
 * Lo contrario: SOLO lo de la papelera.
 *
 * Para la pantalla de papelera y para contar cuánto hay dentro. Existe aquí para
 * que las dos caras del convenio estén juntas y se vea que son dos.
 */
export function soloPapelera<T>(query: T): T {
  return (query as any).eq('eliminada', true)
}
