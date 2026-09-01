// Motor de análisis wellness (determinista, ciencia del deporte).
// Convierte los registros diarios en conclusiones y un veredicto de disposición (readiness).
// Idea central: comparar la semana reciente con la LÍNEA BASE del propio atleta (media ± DE),
// no con valores fijos. Así se detecta cuándo algo se sale de SU normalidad.

export interface RegistroWellness {
  fecha: string
  calidad_sueno: number
  horas_sueno: number
  fatiga: number
  estres: number
  dolor_muscular: number
  animo: number
  motivacion: number
  malestar_general?: number
  hrv?: number | null
  fc_reposo?: number | null
  score_wellness?: number
}

export interface Conclusion { tipo: 'rojo' | 'ambar' | 'positivo' | 'info'; texto: string }

export interface MetricaAnalisis {
  key: string
  label: string
  unidad: string
  reciente: number | null
  base: number | null
  mejor: 'alto' | 'bajo'   // dirección: si "alto" es mejor o peor
  fuera: boolean           // fuera del rango normal del atleta (o umbral absoluto)
  flecha: 'up' | 'down' | 'flat'
}

export type NivelReadiness = 'optimo' | 'vigilar' | 'fatiga' | 'alerta'

export interface AnalisisWellness {
  nRegistros: number
  baselineFiable: boolean
  readiness: { nivel: NivelReadiness; label: string; color: string; recomendacion: string } | null
  conclusiones: Conclusion[]
  metricas: MetricaAnalisis[]
}

const CFG: { key: string; label: string; unidad: string; mejor: 'alto' | 'bajo'; absLow?: number; absHigh?: number; peso: number }[] = [
  { key: 'horas_sueno', label: 'Sueño', unidad: 'h', mejor: 'alto', absLow: 7, peso: 1.5 },
  { key: 'calidad_sueno', label: 'Calidad sueño', unidad: '/7', mejor: 'bajo', absHigh: 5, peso: 1 },
  { key: 'fatiga', label: 'Fatiga', unidad: '/7', mejor: 'bajo', absHigh: 5, peso: 1.5 },
  { key: 'dolor_muscular', label: 'Dolor muscular', unidad: '/7', mejor: 'bajo', absHigh: 5, peso: 1.5 },
  { key: 'estres', label: 'Estrés', unidad: '/7', mejor: 'bajo', absHigh: 5, peso: 1 },
  { key: 'animo', label: 'Ánimo', unidad: '/7', mejor: 'alto', absLow: 3, peso: 1 },
  { key: 'motivacion', label: 'Motivación', unidad: '/7', mejor: 'alto', absLow: 3, peso: 1 },
  { key: 'hrv', label: 'HRV', unidad: 'ms', mejor: 'alto', peso: 2 },
  { key: 'fc_reposo', label: 'FC reposo', unidad: 'ppm', mejor: 'bajo', peso: 2 },
]

// El tipo va suelto porque ya leía con `as any` por dentro: pedir el registro
// completo solo obligaba a quien llama a rellenar huecos que no tiene.
const nums = (arr: { [k: string]: any }[], key: string): number[] =>
  arr.map(r => (r as any)[key]).filter(v => v != null && !isNaN(Number(v))).map(Number)
const media = (a: number[]): number | null => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const desv = (a: number[], m: number): number => (a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : 0)
const r1 = (n: number) => Math.round(n * 10) / 10

export function analizarWellness(registros: RegistroWellness[]): AnalisisWellness {
  const asc = [...registros].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  const n = asc.length
  const recientes = asc.slice(-7)
  const base = n > 7 ? asc.slice(0, n - 7) : []      // periodo anterior a la última semana
  const baselineFiable = base.length >= 5

  if (n < 3) {
    return { nRegistros: n, baselineFiable: false, readiness: null, conclusiones: [
      { tipo: 'info', texto: 'Registra unos días más de wellness para poder analizar tendencias y tu línea base.' },
    ], metricas: [] }
  }

  const conclusiones: Conclusion[] = []
  const metricas: MetricaAnalisis[] = []
  let cargaAlerta = 0
  let objetivosFuera = 0

  for (const c of CFG) {
    const rec = media(nums(recientes, c.key))
    const baseVals = baselineFiable ? nums(base, c.key) : []
    const baseM = baseVals.length ? media(baseVals) : null
    const baseSd = baseM != null ? desv(baseVals, baseM) : 0

    if (rec == null) { continue } // sin datos de esta métrica (típico en HRV/FC opcionales)

    // ¿fuera del rango normal? Con base fiable usamos media ± DE; si no, umbrales absolutos.
    let fuera = false, severidad = 0 // 0 nada, 1 ámbar, 2 rojo
    const umbralDelta = Math.max(baseSd, c.unidad === '/7' ? 0.6 : c.key === 'hrv' ? 3 : c.key === 'fc_reposo' ? 2 : c.key === 'horas_sueno' ? 0.5 : 1)
    if (baseM != null) {
      const z = baseSd > 0 ? (rec - baseM) / baseSd : 0
      if (c.mejor === 'bajo' && rec > baseM + umbralDelta) { fuera = true; severidad = z > 2 ? 2 : 1 }
      if (c.mejor === 'alto' && rec < baseM - umbralDelta) { fuera = true; severidad = z < -2 ? 2 : 1 }
    }
    // Umbrales absolutos (siempre, refuerzan)
    if (c.absHigh != null && rec >= c.absHigh) { fuera = true; severidad = Math.max(severidad, rec >= c.absHigh + 1 ? 2 : 1) }
    if (c.absLow != null && rec < c.absLow) { fuera = true; severidad = Math.max(severidad, 1) }

    const flecha: 'up' | 'down' | 'flat' = baseM == null ? 'flat' : rec > baseM + umbralDelta / 2 ? 'up' : rec < baseM - umbralDelta / 2 ? 'down' : 'flat'
    metricas.push({ key: c.key, label: c.label, unidad: c.unidad, reciente: r1(rec), base: baseM != null ? r1(baseM) : null, mejor: c.mejor, fuera, flecha })

    if (fuera) {
      cargaAlerta += c.peso * (severidad === 2 ? 1.6 : 1)
      if (c.peso >= 2) objetivosFuera++
      conclusiones.push({ tipo: severidad === 2 ? 'rojo' : 'ambar', texto: fraseMetrica(c, rec, baseM, recientes) })
    } else if (baseM != null) {
      // Positivos destacables
      if (c.key === 'hrv' && rec > baseM + Math.max(baseSd, 3)) conclusiones.push({ tipo: 'positivo', texto: `HRV por encima de tu base (${r1(rec)} vs ${r1(baseM)} ms): buena adaptación/recuperación.` })
    }
  }

  // Sueño: nº de noches < 7h en la semana
  const nochesCortas = nums(recientes, 'horas_sueno').filter(h => h < 7).length
  if (nochesCortas >= 3) conclusiones.push({ tipo: nochesCortas >= 5 ? 'rojo' : 'ambar', texto: `${nochesCortas} de ${recientes.length} noches por debajo de 7h esta semana.` })

  // Ánimo + motivación altos y estables → positivo mental
  const animoRec = media(nums(recientes, 'animo')), motivRec = media(nums(recientes, 'motivacion'))
  if (animoRec != null && motivRec != null && animoRec >= 5 && motivRec >= 5)
    conclusiones.push({ tipo: 'positivo', texto: 'Ánimo y motivación altos y estables: buena disposición mental.' })

  // Sin datos objetivos → recordatorio
  const hayObjetivos = recientes.some(r => r.hrv != null || r.fc_reposo != null)
  if (!hayObjetivos) conclusiones.push({ tipo: 'info', texto: 'Sin HRV ni FC en reposo: el análisis se basa en lo subjetivo. Añadirlos (del reloj) sube mucho la fiabilidad.' })

  if (!baselineFiable) conclusiones.push({ tipo: 'info', texto: `Con ${n} registros el análisis usa umbrales generales; a partir de ~2 semanas se ajusta a TU línea base.` })

  // Readiness
  let nivel: NivelReadiness = cargaAlerta === 0 ? 'optimo' : cargaAlerta < 2.5 ? 'vigilar' : cargaAlerta < 5 ? 'fatiga' : 'alerta'
  if (objetivosFuera >= 2 && nivel === 'vigilar') nivel = 'fatiga' // HRV↓ + FC reposo↑ juntos escalan
  const READ: Record<NivelReadiness, { label: string; color: string; recomendacion: string }> = {
    optimo: { label: 'Óptimo', color: '#22c55e', recomendacion: 'Marcadores dentro de tu normalidad. Entrena según lo planificado.' },
    vigilar: { label: 'Vigilar', color: '#eab308', recomendacion: 'Algún marcador algo fuera de tu rango. Entrena normal pero atento a las sensaciones.' },
    fatiga: { label: 'Fatiga', color: '#f97316', recomendacion: 'Señales de fatiga acumulada. Baja intensidad/volumen hoy o cambia por sesión suave.' },
    alerta: { label: 'Alerta', color: '#ef4444', recomendacion: 'Varios marcadores fuera de rango. Prioriza recuperación; valora descanso y revisa sueño/estrés.' },
  }

  // Si no hay ninguna conclusión negativa, un mensaje global positivo primero
  if (!conclusiones.some(c => c.tipo === 'rojo' || c.tipo === 'ambar'))
    conclusiones.unshift({ tipo: 'positivo', texto: 'Todos los marcadores dentro de tu normalidad. Buena semana.' })

  const orden = { rojo: 0, ambar: 1, positivo: 2, info: 3 }
  conclusiones.sort((a, b) => orden[a.tipo] - orden[b.tipo])

  return { nRegistros: n, baselineFiable, readiness: { nivel, ...READ[nivel] }, conclusiones: conclusiones.slice(0, 6), metricas }
}

function fraseMetrica(c: { key: string; label: string; unidad: string; mejor: 'alto' | 'bajo' }, rec: number, baseM: number | null, recientes: RegistroWellness[]): string {
  const v = r1(rec), b = baseM != null ? r1(baseM) : null
  switch (c.key) {
    case 'hrv': return `HRV media ${v} ms${b ? `, ${Math.round((1 - rec / (baseM || rec)) * 100)}% por debajo de tu base (${b})` : ''}: posible fatiga/estrés fisiológico.`
    case 'fc_reposo': return `FC en reposo ${v} ppm${b ? `, +${r1(rec - (baseM || rec))} sobre tu base (${b})` : ''}: vigila recuperación/carga.`
    case 'horas_sueno': return `Sueño medio ${v} h/noche esta semana${b ? ` (tu base ${b} h)` : ''}: por debajo de lo recomendable.`
    case 'fatiga': return `Fatiga elevada (${v}/7)${b ? ` frente a tu base ${b}` : ''}: recuperación por completar.`
    case 'dolor_muscular': return `Dolor muscular alto (${v}/7)${b ? ` sobre tu base ${b}` : ''}: recuperación incompleta.`
    case 'estres': return `Estrés elevado (${v}/7): puede frenar la recuperación y la adaptación.`
    case 'calidad_sueno': return `Calidad de sueño baja (${v}/7 en la escala): descanso poco reparador.`
    case 'animo': return `Ánimo bajo (${v}/7): vigila el estado mental y la adherencia.`
    case 'motivacion': return `Motivación baja (${v}/7): posible fatiga mental o hastío del plan.`
    default: return `${c.label}: fuera de tu rango habitual (${v}${c.unidad}).`
  }
}

// ============================================================
// Un día suelto, comparado con lo normal de ese atleta
// ============================================================
// `analizarWellness` mira la última semana contra el periodo anterior: sirve
// para «¿cómo va?». Esto es otra pregunta: «el miércoles, ¿cómo amaneció?».
//
// VIVE AQUÍ Y NO EN OTRO FICHERO A PROPÓSITO. Reutiliza CFG —la dirección de
// cada métrica, sus umbrales absolutos— y la misma regla de umbralDelta. Con
// una copia en otro sitio acabaríamos teniendo dos ideas distintas de qué es
// «fatiga alta» para el mismo atleta, y esta app ya ha pagado ese precio.

export interface MetricaDia {
  key: string
  label: string
  unidad: string
  valor: number
  /** Su normal, si hay historial suficiente. */
  base: number | null
  mejor: 'alto' | 'bajo'
  /** Cómo cae ese día respecto a su normal. */
  respecto: 'peor' | 'mejor' | 'igual'
  /** Fuera de su rango normal, o pasado un umbral absoluto. */
  fuera: boolean
}

/**
 * Cómo fue UN día para ese atleta, comparado con su historial.
 *
 * `historial` son sus otros registros. El propio día se excluye aunque venga
 * dentro: si no, se estaría comparando consigo mismo y un día malo tiraría de
 * su propia referencia hacia abajo, haciéndolo parecer menos malo.
 */
/* El tipo va suelto a propósito. `RegistroWellness` exige las siete métricas, y
   aquí cada una se comprueba antes de usarla —un registro viejo puede no tener
   HRV, y uno recién insertado llega tal cual lo devuelve Supabase—. Exigir el
   tipo completo obligaría a quien llama a inventarse ceros para rellenarlo, que
   es justo lo que no se quiere: un cero no es «sin dato». */
type RegistroSuelto = { fecha: string; [k: string]: any }

export function compararDia(
  registro: RegistroSuelto | null | undefined,
  historial: RegistroSuelto[],
): MetricaDia[] {
  if (!registro) return []
  const otros = (historial || []).filter(r => r.fecha !== registro.fecha)
  const salida: MetricaDia[] = []

  for (const c of CFG) {
    const v = (registro as any)[c.key]
    if (v == null || isNaN(Number(v))) continue
    const valor = Number(v)

    const baseVals = nums(otros, c.key)
    const baseM = baseVals.length >= 5 ? media(baseVals) : null
    const baseSd = baseM != null ? desv(baseVals, baseM) : 0
    const umbralDelta = Math.max(baseSd, c.unidad === '/7' ? 0.6 : c.key === 'hrv' ? 3 : c.key === 'fc_reposo' ? 2 : c.key === 'horas_sueno' ? 0.5 : 1)

    let respecto: 'peor' | 'mejor' | 'igual' = 'igual'
    let fuera = false
    if (baseM != null) {
      const arriba = valor > baseM + umbralDelta
      const abajo = valor < baseM - umbralDelta
      if (arriba) respecto = c.mejor === 'bajo' ? 'peor' : 'mejor'
      if (abajo) respecto = c.mejor === 'bajo' ? 'mejor' : 'peor'
      fuera = respecto === 'peor'
    }
    if (c.absHigh != null && valor >= c.absHigh && c.mejor === 'bajo') { fuera = true; respecto = 'peor' }
    if (c.absLow != null && valor < c.absLow && c.mejor === 'alto') { fuera = true; respecto = 'peor' }

    salida.push({
      key: c.key, label: c.label, unidad: c.unidad, valor: r1(valor),
      base: baseM != null ? r1(baseM) : null, mejor: c.mejor, respecto, fuera,
    })
  }
  return salida
}

/** Las que salieron mal ese día. Es lo que se enseña cuando no cabe todo. */
export const loQueFueMal = (m: MetricaDia[]): MetricaDia[] => m.filter(x => x.fuera)
