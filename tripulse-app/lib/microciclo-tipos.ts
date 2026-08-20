// ============================================================
// TRIPULSE — Los tipos que admite `microciclo.tipo`
// ============================================================
// La columna tiene un CHECK en la base:
//
//   CHECK (tipo = ANY (ARRAY['Carga', 'Recuperación', 'Competición']))
//
// Tres valores, dos de ellos CON TILDE. Este fichero existe porque esa lista no
// estaba en ninguna parte del código y cada pantalla se inventó la suya:
//
//   · El lienzo ofrecía «Taper», que el CHECK RECHAZA. Elegirlo y darle a
//     generar reventaba el guardado con un error de Postgres en crudo.
//   · La ficha del microciclo compara contra «Recuperacion» SIN tilde, así que
//     nunca acertaba y pintaba de azul lo que era verde.
//
// Ninguno de los dos fallaba de forma escandalosa, que es justo por lo que
// llevaban ahí tanto tiempo.
export const TIPOS_MICROCICLO = ['Carga', 'Recuperación', 'Competición'] as const

export type TipoMicrociclo = typeof TIPOS_MICROCICLO[number]

/** El que se escribe cuando no hay nada mejor. Es el único que nunca falla. */
export const TIPO_POR_DEFECTO: TipoMicrociclo = 'Carga'

/**
 * Normaliza cualquier cosa a un valor que el CHECK acepte.
 *
 * Tolera la falta de tildes y los nombres viejos («Taper» → «Competición»),
 * porque hay borradores y filas antiguas escritas con ellos. Lo que no reconoce
 * cae en «Carga»: guardar la semana con el color equivocado es un incordio;
 * no poder guardarla, un muro.
 */
export function tipoMicrociclo(v: string | null | undefined): TipoMicrociclo {
  const t = String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (t.startsWith('recup') || t.startsWith('descarg')) return 'Recuperación'
  if (t.startsWith('compet') || t.startsWith('taper') || t.startsWith('realiz')) return 'Competición'
  return TIPO_POR_DEFECTO
}
