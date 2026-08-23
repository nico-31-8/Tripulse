// ============================================================
// TRIPULSE — Qué significa una zona para ESTE atleta
// ============================================================
// Una zona es un porcentaje; lo que el atleta necesita es un ritmo, unos vatios
// o unas pulsaciones. Traducir de lo uno a lo otro hace falta en tres sitios: la
// tabla donde se prescribe, el panel de la semana y el briefing.
//
// ESTABA DENTRO DE LA TABLA DE TAREAS, y allí ya había pasado lo que pasa
// siempre: la tabla de %VAM local estaba desplazada 5–10 puntos respecto a la de
// la pantalla de ejecución, así que el mismo Z4 daba dos ritmos distintos según
// por dónde entrases. Se arregló apuntando a ZONAS_CLASICAS de lib/zonas; este
// fichero es el siguiente paso: que la traducción entera viva en un sitio.
import { ZONAS_CLASICAS, zonaResistencia, prescripcion, type ZonaResistencia } from './zonas'

export interface Tests {
  vam?: number | null
  css?: number | null
  ftp?: number | null
}

export interface Referencia {
  /** «150–170 ppm», si se sabe la FC máxima. */
  fc: string | null
  /** «RPE 4–6». */
  rpe: string
  /** El porcentaje o la sigla + factor. */
  porcentaje: string | null
  /** El número que el atleta va a mirar: vatios, min/km, s/100m. Null sin test. */
  ritmo: string | null
}

/**
 * Las siete zonas del sistema clásico tal y como se ELIGEN en el formulario.
 *
 * Los porcentajes de aquí son sobre el umbral y los usa el cálculo de FC; los
 * de ritmo/vatios salen de ZONAS_CLASICAS, que es la tabla buena.
 */
export const ZONAS_UI = [
  { num: 1, nombre: 'Z1 Recuperación',  pct: [0, 75],    rpe: [2, 3] },
  { num: 2, nombre: 'Z2 Aeróbica',      pct: [75, 85],   rpe: [4, 5] },
  { num: 3, nombre: 'Z3 Tempo',         pct: [86, 93],   rpe: [6, 7] },
  { num: 4, nombre: 'Z4 Umbral',        pct: [94, 100],  rpe: [7, 8] },
  { num: 5, nombre: 'Z5 VO2máx',        pct: [101, 110], rpe: [8, 9] },
  { num: 6, nombre: 'Z6 Anaeróbica',    pct: [0, 0],     rpe: [9, 10] },
  { num: 7, nombre: 'Z7 Neuromuscular', pct: [0, 0],     rpe: [10, 10] },
]

/** Referencia de una zona del sistema Zonas 2 (siglas: AER, AEL, PAE…). */
function refZona2(z: ZonaResistencia, disciplina: string, tests: Tests, fcMax: number): Referencia {
  const fc = (z.fcMin || z.fcMax) && fcMax > 0
    ? `${z.fcMin ? Math.round(fcMax * z.fcMin / 100) : ''}${z.fcMin && z.fcMax ? '–' : ''}${z.fcMax ? Math.round(fcMax * z.fcMax / 100) : ''} ppm`
    : null
  return {
    fc,
    rpe: 'RPE ' + z.rpeMin + (z.rpeMax !== z.rpeMin ? '–' + z.rpeMax : ''),
    porcentaje: z.sigla + ' · ' + z.factor,
    ritmo: prescripcion(z, disciplina, tests),
  }
}

/** Referencia de una zona del sistema clásico (Z1…Z7). */
function refClasica(zona: any, disciplina: string, tests: Tests, fcMax: number): Referencia | null {
  if (!zona) return null
  const ref = ZONAS_CLASICAS[zona.num]
  const fcUmbral = fcMax ? fcMax * 0.85 : 0
  const fcMin = fcUmbral > 0 && zona.pct[0] > 0 ? Math.round(fcUmbral * zona.pct[0] / 100) : null
  const fcTope = fcUmbral > 0 && zona.pct[1] > 0 ? Math.round(fcUmbral * zona.pct[1] / 100) : null
  const fc = fcMin && fcTope ? fcMin + '–' + fcTope + ' ppm' : null
  const rpe = 'RPE ' + zona.rpe[0] + '–' + zona.rpe[1]
  let ritmo: string | null = null
  let porcentaje: string | null = null

  if (disciplina === 'Ciclismo') {
    porcentaje = ref.ftpPct[0] + '–' + ref.ftpPct[1] + '% FTP'
    if (tests.ftp) {
      ritmo = Math.round(tests.ftp * ref.ftpPct[0] / 100) + '–'
        + Math.round(tests.ftp * ref.ftpPct[1] / 100) + ' W'
    }
  } else if (disciplina === 'Carrera') {
    porcentaje = ref.vamPct[0] + '–' + ref.vamPct[1] + '% VAM'
    if (tests.vam) {
      const min = tests.vam * ref.vamPct[0] / 100
      const max = tests.vam * ref.vamPct[1] / 100
      const paso = (v: number) => v > 0
        ? Math.floor(60 / v) + ':' + String(Math.round((60 / v % 1) * 60)).padStart(2, '0')
        : null
      const pMin = paso(min), pMax = paso(max)
      if (pMin && pMax) ritmo = pMin + '–' + pMax + ' /km'
    }
  } else if (disciplina === 'Natacion' || disciplina === 'Natación') {
    porcentaje = ref.cssPct[0] + '–' + ref.cssPct[1] + '% CSS'
    if (tests.css) {
      const min = tests.css * ref.cssPct[0] / 100
      const max = tests.css * ref.cssPct[1] / 100
      if (min > 0 && max > 0) ritmo = Math.round(100 / min) + '–' + Math.round(100 / max) + ' s/100m'
    }
  }

  return { fc, rpe, porcentaje, ritmo }
}

/**
 * La referencia de una zona por su código, venga del sistema que venga.
 *
 * `null` cuando no hay zona o no se reconoce. Y `ritmo` puede ser null aunque el
 * resto no lo sea: sin el test que toca (VAM, FTP o CSS) no se propone un
 * número, que es lo acordado — un ritmo inventado es peor que ninguno.
 */
export function referenciaDeZona(
  codigo: string | null | undefined,
  disciplina: string,
  tests: Tests,
  fcMax: number,
): Referencia | null {
  if (!codigo) return null
  const z2 = zonaResistencia(codigo)
  if (z2) return refZona2(z2, disciplina, tests, fcMax)
  return refClasica(ZONAS_UI.find(z => 'Z' + z.num === codigo), disciplina, tests, fcMax)
}

/**
 * Los datos del atleta que hacen falta para traducir zonas.
 *
 * Una consulta por tabla porque cada test vive en la suya y solo interesa el más
 * reciente de cada una.
 */
export async function cargarReferencias(sb: any, idDeportista: number): Promise<{
  tests: Tests; fcMax: number; sistema: number; nombre: string | null
}> {
  const [{ data: dep }, { data: t1 }, { data: t2 }, { data: t3 }] = await Promise.all([
    // El nombre viaja aquí porque quien pide las referencias suele necesitarlo
    // en la misma cabecera, y era una quinta consulta a la misma fila.
    sb.from('deportista').select('fc_maxima, sistema_zonas, nombre').eq('id', idDeportista).maybeSingle(),
    sb.from('test1_carrera').select('vam').not('vam', 'is', null)
      .eq('id_deportista', idDeportista).order('fecha', { ascending: false }).limit(1),
    sb.from('test2_natacion').select('css').not('css', 'is', null)
      .eq('id_deportista', idDeportista).order('fecha', { ascending: false }).limit(1),
    sb.from('test3_ciclismo').select('ftp').not('ftp', 'is', null)
      .eq('id_deportista', idDeportista).order('fecha', { ascending: false }).limit(1),
  ])
  return {
    tests: { vam: t1?.[0]?.vam, css: t2?.[0]?.css, ftp: t3?.[0]?.ftp },
    fcMax: dep?.fc_maxima || 0,
    sistema: dep?.sistema_zonas || 1,
    nombre: dep?.nombre || null,
  }
}

// ------------------------------------------------------------
// Cómo se ENSEÑA un ritmo_objetivo ya guardado
// ------------------------------------------------------------

/**
 * `p_distancia.ritmo_objetivo` guarda lo que devuelve `prescripcion()`, que es
 * TEXTO y trae su propia unidad dentro: «4:12–4:30 /km», «180–220 W»,
 * «> 2:05 /100m», «Por APR (sprint)».
 *
 * Dos pantallas del atleta lo leían como SEGUNDOS y lo pasaban por un m:ss:
 * `Math.floor('180–220 W' / 60)` es `NaN`, así que en la caja naranja de «Ritmo
 * objetivo» ponía **«NaN:NaN /km»**. Otras tres lo pintaban tal cual, bien. El
 * mismo dato leído de dos formas, que es el fallo de siempre.
 *
 * Se acepta también el número por si quedan filas viejas guardadas en segundos:
 * ahí sí hay que formatear y poner la unidad, porque el número no la lleva.
 * Devuelve el texto completo listo para pintar, o null si no hay nada.
 */
export function ritmoObjetivoTexto(valor: unknown, disciplina?: string | null): string | null {
  if (valor == null) return null
  const bruto = String(valor).trim()
  if (!bruto) return null

  const esSegundos = /^\d+(\.\d+)?$/.test(bruto)
  if (!esSegundos) return bruto

  const seg = Number(bruto)
  if (!Number.isFinite(seg) || seg <= 0) return null
  const m = Math.floor(seg / 60)
  const s = Math.round(seg % 60)
  const unidad = (disciplina || '').startsWith('Nat') ? '/100m' : '/km'
  return `${m}:${s.toString().padStart(2, '0')} ${unidad}`
}
