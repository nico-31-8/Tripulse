// ============================================================
// TRIPULSE — Modelos de periodización y sus mesociclos
// ============================================================
// QUÉ PASÓ. El tipo de un mesociclo no es una lista fija: depende del modelo de
// periodización que tenga su macrociclo. Esa lista estaba escrita a mano en DOS
// formularios (el calendario y la vista de bloques), y los colores del calendario
// en un TERCER sitio que solo conocía los cuatro tipos del modelo ATR.
//
// Resultado: un plan Tradicional, Inverso u Ondulatorio pintaba el calendario
// entero en gris, y la leyenda seguía enseñando los cuatro de ATR — que no eran
// los que había en pantalla. No fallaba nada. El calendario simplemente dejaba de
// decir nada, que en una pantalla cuyo único trabajo es decir algo de un vistazo
// es peor que un error.
//
// Ahora hay una sola lista y el color va pegado al tipo, así que no se pueden
// separar: si alguien añade un tipo nuevo sin color, el test salta.
//
// QUÉ SIGNIFICA CADA COLOR
// En los modelos que son una secuencia (ATR, Tradicional, Inversa) el color dice
// por dónde va el bloque: naranja al principio, amarillo en medio, rojo en lo más
// específico y azul en el afinado. Ondulatoria no es una secuencia sino una
// alternancia de carga, así que ahí el color ES la carga. El verde es siempre
// recuperación, en todos los modelos.

export type ColorMeso = 'naranja' | 'amarillo' | 'rojo' | 'verde' | 'azul'

export type ModeloPeriodizacion = 'ATR' | 'Tradicional' | 'Inversa' | 'Ondulatoria'

/**
 * En Tailwind v4 la opacidad va en la propia clase (`bg-color/N`) y tiene que ser
 * un literal completo para que el compilador la detecte. Por eso están escritas
 * enteras en vez de componerse en runtime: `'bg-' + color + '/40'` no existe
 * cuando Tailwind mira el fichero, y la clase no se genera.
 */
export const CLASES_MESO: Record<ColorMeso, { suave: string; medio: string; solido: string; hex: string }> = {
  naranja:  { suave: 'bg-orange-500/20 hover:bg-orange-500/30', medio: 'bg-orange-500/40 hover:bg-orange-500/60', solido: 'bg-orange-500', hex: '#f97316' },
  amarillo: { suave: 'bg-yellow-500/20 hover:bg-yellow-500/30', medio: 'bg-yellow-500/40 hover:bg-yellow-500/60', solido: 'bg-yellow-500', hex: '#eab308' },
  rojo:     { suave: 'bg-red-500/20 hover:bg-red-500/30',       medio: 'bg-red-500/40 hover:bg-red-500/60',       solido: 'bg-red-500',    hex: '#ef4444' },
  verde:    { suave: 'bg-green-500/20 hover:bg-green-500/30',   medio: 'bg-green-500/40 hover:bg-green-500/60',   solido: 'bg-green-500',  hex: '#22c55e' },
  azul:     { suave: 'bg-sky-500/20 hover:bg-sky-500/30',       medio: 'bg-sky-500/40 hover:bg-sky-500/60',       solido: 'bg-sky-500',    hex: '#0ea5e9' },
}

export interface TipoMeso { tipo: string; color: ColorMeso }

export const TIPOS_MESO: Record<ModeloPeriodizacion, TipoMeso[]> = {
  // El de la app por defecto: ATR de Issurin (acumulación → transmutación →
  // realización), con la descarga como cuarto bloque.
  ATR: [
    { tipo: 'Acumulación', color: 'naranja' },
    { tipo: 'Transmutación', color: 'amarillo' },
    { tipo: 'Realización', color: 'rojo' },
    { tipo: 'Recuperación', color: 'verde' },
  ],
  Tradicional: [
    { tipo: 'General', color: 'naranja' },
    { tipo: 'Específica', color: 'amarillo' },
    { tipo: 'Competitiva', color: 'rojo' },
    { tipo: 'Taper', color: 'azul' },
  ],
  // En la inversa se empieza por la intensidad y se construye volumen hacia la
  // prueba, así que el naranja del principio es la fase de intensidad. El color
  // sigue diciendo «por dónde vas», no «cómo de duro es».
  Inversa: [
    { tipo: 'Intensidad', color: 'naranja' },
    { tipo: 'Desarrollo', color: 'amarillo' },
    { tipo: 'Resistencia específica', color: 'rojo' },
    { tipo: 'Taper', color: 'azul' },
  ],
  Ondulatoria: [
    { tipo: 'Carga alta', color: 'rojo' },
    { tipo: 'Carga media', color: 'amarillo' },
    { tipo: 'Recuperación', color: 'verde' },
  ],
}

export const MODELOS: ModeloPeriodizacion[] = ['ATR', 'Tradicional', 'Inversa', 'Ondulatoria']

const sinTildes = (s: any) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** El modelo de un macrociclo. Lo que no se reconoce cae en ATR, el de la app. */
export function modeloDe(tipoPeriodizacion: string | null | undefined): ModeloPeriodizacion {
  const t = sinTildes(tipoPeriodizacion)
  if (t === 'tradicional') return 'Tradicional'
  if (t === 'inversa') return 'Inversa'
  if (t === 'ondulatoria') return 'Ondulatoria'
  return 'ATR'
}

/** Los tipos de mesociclo que puede elegir el entrenador con ese modelo. */
export function tiposDeMeso(tipoPeriodizacion: string | null | undefined): TipoMeso[] {
  return TIPOS_MESO[modeloDe(tipoPeriodizacion)]
}

// Índice tipo → color, por nombre normalizado. Se compara sin tildes y en
// minúsculas porque el tipo llega de la base tal y como se guardó: comparar
// «Específica» con «Especifica» devolvía gris, que es no decir nada.
const POR_NOMBRE = new Map<string, ColorMeso>(
  MODELOS.flatMap(m => TIPOS_MESO[m].map(t => [sinTildes(t.tipo), t.color] as const)),
)

/** Las clases y el color de un tipo de mesociclo, sea del modelo que sea. */
export function colorMeso(tipo: string | null | undefined) {
  const c = POR_NOMBRE.get(sinTildes(tipo))
  return c ? CLASES_MESO[c] : null
}

/**
 * Los tipos que de verdad hay en el plan, para que la leyenda diga la verdad.
 *
 * Antes la leyenda era una lista fija con los cuatro de ATR: un plan Ondulatorio
 * veía explicados unos colores que no estaban en su calendario, y sin explicar
 * los que sí.
 */
export function tiposEnPlan(mesos: { tipo?: string | null }[] | null | undefined): { tipo: string; hex: string }[] {
  const vistos = new Map<string, string>()
  ;(mesos || []).forEach(m => {
    if (!m?.tipo || vistos.has(m.tipo)) return
    vistos.set(m.tipo, colorMeso(m.tipo)?.hex || '#6b7280')
  })
  return [...vistos].map(([tipo, hex]) => ({ tipo, hex }))
}
