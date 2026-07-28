// Distribución de intensidad del entrenamiento (TID — Training Intensity Distribution).
//
// La ciencia compara siempre contra el modelo de 3 bandas de Seiler:
//   baja  = por debajo del umbral aeróbico (VT1)
//   media = entre VT1 y VT2  ← el "agujero negro" de Seiler
//   alta  = por encima de VT2 / vVO₂máx
//
// Referencias (vault, B1-06-Polarizado-vs-Umbral-vs-Piramidal):
//   Seiler & Kjerland (2006) · Stöggl & Sperlich (2014, PMC3912323)
//   Sellés-Pérez et al. (2019, PMC6873141) · Muñoz et al. (2014, PubMed 23921084)
//   Casado et al. (2024, meta-análisis PMC11329428)
//
// OJO con el matiz que evita dar mal consejo: la banda media NO es mala para todos.
// En 70.3 e Ironman correlaciona con MEJOR rendimiento porque es la intensidad de
// competición; los mejores de larga distancia entrenan piramidal con 15–20% de media.
// Por eso el veredicto no juzga contra un ideal universal: compara contra el modelo
// que el entrenador declaró para ESE mesociclo.

export type Banda = 'baja' | 'media' | 'alta'
export type ModeloTID = 'polarizado' | 'piramidal' | 'umbral'

/** Zonas 2 (9 siglas) y clásicas (Z1–Z7) → banda de Seiler. */
const BANDA_POR_ZONA: Record<string, Banda> = {
  // Zonas 2 — anclajes en lib/zonas.ts: AEM ⚓MLSS, AEI ⚓CSS, PAE ⚓vVO₂máx
  AER: 'baja', AEL: 'baja',
  AEM: 'media', AEI: 'media',
  PAE: 'alta', CLA: 'alta', PLA: 'alta', CALA: 'alta', PALA: 'alta',
  // Clásicas
  Z1: 'baja', Z2: 'baja',
  Z3: 'media', Z4: 'media',
  Z5: 'alta', Z6: 'alta', Z7: 'alta',
}

export function bandaDeZona(sigla: string | null | undefined): Banda | null {
  if (!sigla) return null
  return BANDA_POR_ZONA[sigla.trim().toUpperCase()] ?? null
}

export interface DistribucionTID {
  /** Minutos por banda. */
  baja: number; media: number; alta: number
  /** Minutos con zona conocida (los que entran en los porcentajes). */
  minutos: number
  /** Minutos sin zona asignada: no se reparten, pero se avisa. */
  sinZona: number
  /** Porcentajes redondeados; suman 100 salvo redondeo. */
  pctBaja: number; pctMedia: number; pctAlta: number
}

/** Reparte los minutos de una lista de bloques en las 3 bandas. */
export function distribucionTID(bloques: { zona?: string | null; minutos?: number | null }[]): DistribucionTID {
  let baja = 0, media = 0, alta = 0, sinZona = 0
  for (const b of bloques || []) {
    const min = Number(b.minutos) || 0
    if (min <= 0) continue
    const banda = bandaDeZona(b.zona)
    if (banda === 'baja') baja += min
    else if (banda === 'media') media += min
    else if (banda === 'alta') alta += min
    else sinZona += min
  }
  const minutos = baja + media + alta
  const pct = (v: number) => (minutos ? Math.round((v / minutos) * 100) : 0)
  return { baja, media, alta, minutos, sinZona, pctBaja: pct(baja), pctMedia: pct(media), pctAlta: pct(alta) }
}

// Definición operativa usada en la literatura para etiquetar una distribución:
//   · umbral     → mucha banda media (o poca baja): el volumen vive en el umbral
//   · polarizado → bimodal, la alta pesa más que la media
//   · piramidal  → pirámide descendente, la media pesa más que la alta
export function clasificarTID(d: DistribucionTID): ModeloTID | null {
  if (!d.minutos) return null
  if (d.pctMedia >= 35 || d.pctBaja < 50) return 'umbral'
  return d.pctAlta > d.pctMedia ? 'polarizado' : 'piramidal'
}

export const NOMBRE_MODELO: Record<ModeloTID, string> = {
  polarizado: 'Polarizada',
  piramidal: 'Piramidal',
  umbral: 'De umbral',
}

/** Reparto de referencia de cada modelo (para explicar la desviación). */
export const REFERENCIA: Record<ModeloTID, { baja: string; media: string; alta: string }> = {
  polarizado: { baja: '75–80%', media: '<10%', alta: '15–20%' },
  piramidal: { baja: '75–80%', media: '10–20%', alta: '5–10%' },
  umbral: { baja: '40–55%', media: '35–50%', alta: '5–15%' },
}

export interface VeredictoTID {
  modelo: ModeloTID | null
  /** 'ok' = coincide con lo previsto · 'aviso' = se desvía · 'info' = sin objetivo declarado */
  tono: 'ok' | 'aviso' | 'info'
  titulo: string
  texto: string
}

/**
 * Compara la distribución real con el modelo declarado en el mesociclo.
 * Sin objetivo declarado NO se juzga: solo se describe (evita dar mal consejo,
 * porque el reparto correcto depende de la distancia objetivo y la fase).
 */
export function veredictoTID(d: DistribucionTID, objetivo?: ModeloTID | null): VeredictoTID {
  const modelo = clasificarTID(d)
  if (!modelo) {
    return { modelo: null, tono: 'info', titulo: 'Sin datos suficientes',
      texto: 'Las sesiones de este período no tienen zona asignada, así que no se puede repartir la intensidad.' }
  }
  const reparto = `${d.pctBaja}% suave · ${d.pctMedia}% media · ${d.pctAlta}% alta`

  if (!objetivo) {
    return { modelo, tono: 'info', titulo: NOMBRE_MODELO[modelo],
      texto: `${reparto}. Declara el modelo objetivo en el mesociclo para saber si se está cumpliendo el plan.` }
  }
  if (modelo === objetivo) {
    return { modelo, tono: 'ok', titulo: `${NOMBRE_MODELO[modelo]} · como estaba previsto`,
      texto: `${reparto}. Coincide con el modelo ${NOMBRE_MODELO[objetivo].toLowerCase()} planificado para este bloque.` }
  }
  // Se desvía: se explica hacia dónde y qué referencia se esperaba.
  const ref = REFERENCIA[objetivo]
  const deriva = modelo === 'umbral'
    ? 'se está colando intensidad media: es el punto donde más cuesta recuperar y menos adaptación se gana'
    : modelo === 'polarizado'
      ? 'hay más trabajo duro y menos zona media de la prevista'
      : 'hay más zona media y menos trabajo duro del previsto'
  return { modelo, tono: 'aviso', titulo: `${NOMBRE_MODELO[modelo]} · se esperaba ${NOMBRE_MODELO[objetivo].toLowerCase()}`,
    texto: `${reparto}. Para un bloque ${NOMBRE_MODELO[objetivo].toLowerCase()} la referencia es ${ref.baja} suave · ${ref.media} media · ${ref.alta} alta; ${deriva}.` }
}
