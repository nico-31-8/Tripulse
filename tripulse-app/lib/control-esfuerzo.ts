// ============================================================
// TRIPULSE — Cómo se controla el esfuerzo de una serie de fuerza
// ============================================================
// Los tres primeros miden lo cerca del fallo que se queda la serie, de más
// subjetivo a más objetivo. El cuarto es otra cosa: cuánto pesa la barra
// respecto a su máximo. Se ofrecen juntos porque es donde el entrenador espera
// encontrarlos, pero no significan lo mismo.
//
// ESTE FICHERO EXISTE PORQUE HABÍA TRES COPIAS
// El catálogo vivía en `tareas-tabla.tsx` (CONTROLES), en `DatosReales.tsx`
// (ETIQUETA_CTRL) y en `FuerzaRegistro.tsx` (CTRL), cada uno con los campos que
// le hacían falta. Ninguna estaba mal, pero eran tres verdades sobre lo mismo:
// la de ejecución solo conocía dos de los cuatro tipos, y la de la tabla del
// entrenador ni siquiera leía la columna donde se guarda el valor.

export type ControlTipo = 'rir' | 'rpe' | 'vel' | 'pct1rm'

export interface Control {
  id: ControlTipo
  /** Etiqueta corta, la que se ve en una cabecera o pegada al número. */
  corto: string
  /** Ejemplo para el hueco del formulario. */
  ph: string
  ayuda: string
  /**
   * Si el atleta lo anota al terminar la serie.
   *
   * Con VBT la pérdida de velocidad la marca el encoder y lo que hace es CORTAR
   * la serie, no puntuarla al final. Con %1RM el porcentaje es carga, y lo que
   * levantó ya va en kilos. En los dos casos no hay nada que apuntar: se enseña
   * lo prescrito para que sepa contra qué iba.
   */
  seAnota: boolean
  /** Tope del campo cuando se anota. */
  max?: number
  /** El número va DELANTE de la etiqueta («75 % 1RM») o detrás («RIR 2»). */
  numeroDelante: boolean
}

export const CONTROLES: Control[] = [
  { id: 'rir', corto: 'RIR', ph: '0-2', seAnota: true, max: 5, numeroDelante: false,
    ayuda: 'Repeticiones en reserva: cuántas podría hacer aún' },
  { id: 'rpe', corto: 'RPE', ph: '7-8', seAnota: true, max: 10, numeroDelante: false,
    ayuda: 'Esfuerzo percibido de 1 a 10' },
  { id: 'vel', corto: '% vel', ph: '20', seAnota: false, numeroDelante: true,
    ayuda: 'Pérdida de velocidad (VBT): corta la serie al perder ese % — necesita encoder' },
  { id: 'pct1rm', corto: '% 1RM', ph: '75', seAnota: false, numeroDelante: true,
    ayuda: 'Porcentaje de su 1RM en ese ejercicio' },
]

export const controlDe = (t: ControlTipo | string | null | undefined): Control =>
  CONTROLES.find(c => c.id === t) || CONTROLES[0]

export const siguienteControl = (t: ControlTipo): ControlTipo =>
  CONTROLES[(CONTROLES.findIndex(c => c.id === t) + 1) % CONTROLES.length].id

/**
 * Cómo se escribe un control prescrito: «RIR 2», «RPE 8», «75 % 1RM».
 *
 * Una sola función porque la ficha del entrenador y el briefing del atleta
 * tienen que decir lo mismo. Cadena vacía si no hay valor — no un guion: quien
 * pinta decide si eso es un «—» o un hueco.
 */
export function textoControl(
  tipo: ControlTipo | string | null | undefined, valor: string | number | null | undefined,
): string {
  const v = String(valor ?? '').trim()
  if (!v) return ''
  const c = controlDe(tipo)
  return c.numeroDelante ? v + ' ' + c.corto : c.corto + ' ' + v
}

/**
 * Lo mismo, pero rescatando lo que se guardó ANTES de que existieran las
 * columnas `control_tipo` y `control_valor`.
 *
 * Entonces el RIR se concatenaba dentro de `notas_ejecucion` como «RIR: 2». Las
 * sesiones de aquella época siguen ahí, y sin este rescate la columna del
 * entrenador les sale vacía — que es exactamente el fallo que se arregla aquí,
 * pero al revés.
 */
export function controlDeEjercicio(ej: any): string {
  if (!ej) return ''
  const nuevo = textoControl(ej.control_tipo, ej.control_valor)
  if (nuevo) return nuevo
  const viejo = String(ej.notas_ejecucion || '').match(/RIR:\s*(\d+)/)
  return viejo ? 'RIR ' + viejo[1] : ''
}
