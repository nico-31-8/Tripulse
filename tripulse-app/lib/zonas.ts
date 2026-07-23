// ============================================================
// TRIPULSE — Catálogo "Zonas 2" (sistema metabólico)
// Fuente de verdad de las 19 zonas: 9 de resistencia + 10 de fuerza/flexibilidad.
// Referencias: Pallarés & Morán-Navarro (2012), Allen & Coggan (2019),
// Wakayoshi et al. (1992), Toubekis et al. (2006), Buchheit & Laursen (2013),
// González-Badillo & Ribas-Serna (2002), Haff & Triplett (2016).
//
// Ciclismo: los % son sobre FTP (convertidos desde PAM al modelo de Coggan).
// Carrera: % sobre VAM.  Natación: offset sobre CSS (texto).
// ============================================================

export type Indicador = 'FC' | 'FC+RPE' | 'RPE'

export interface ZonaResistencia {
  sigla: string
  nombre: string
  factor: string            // factor de carga (agrupación)
  vamMin: number | null     // % VAM (carrera); null = sin límite por ese lado
  vamMax: number | null
  ftpMin: number | null     // % FTP (ciclismo)
  ftpMax: number | null
  css: string               // prescripción natación (offset sobre CSS)
  fcMin: number | null      // % FC máx; null = no fiable / sin límite
  fcMax: number | null
  rpeMin: number
  rpeMax: number
  indicador: Indicador
  duracion: string
  color: string
  requiereSprint: boolean   // PLA/CALA/PALA → necesitan test ASR/APR
}

export interface ZonaFuerza {
  sigla: string
  nombre: string
  factor: string
  rmMin: number | null      // % 1RM; null = n/a (flexibilidad)
  rmMax: number | null
  rpeMin: number
  rpeMax: number
  series: string
  repTiempo: string
  descanso: string
  durSerie: string
  indicador: Indicador
  color: string
}

// ------------------------------------------------------------
// 9 ZONAS DE RESISTENCIA
// ------------------------------------------------------------
export const ZONAS_RESISTENCIA: ZonaResistencia[] = [
  { sigla: 'AER',  nombre: 'Recuperación',        factor: 'Recuperación',           vamMin: null, vamMax: 65,  ftpMin: null, ftpMax: 55,  css: 'CSS +20s o más lento',        fcMin: null, fcMax: 70, rpeMin: 1,  rpeMax: 3,  indicador: 'FC',     duracion: '> 30 min',  color: '#6B7280', requiereSprint: false },
  { sigla: 'AEL',  nombre: 'Aeróbico lipolítico', factor: 'Resistencia básica',     vamMin: 65,   vamMax: 75,  ftpMin: 56,   ftpMax: 75,  css: 'CSS +10–20s',                 fcMin: 70,   fcMax: 80, rpeMin: 3,  rpeMax: 4,  indicador: 'FC',     duracion: '20–90 min', color: '#38BDF8', requiereSprint: false },
  { sigla: 'AEM',  nombre: 'Aeróbico glucolítico',factor: 'Resistencia básica',     vamMin: 75,   vamMax: 85,  ftpMin: 76,   ftpMax: 90,  css: 'CSS +4–8s (⚓MLSS)',           fcMin: 80,   fcMax: 88, rpeMin: 4,  rpeMax: 6,  indicador: 'FC',     duracion: '10–40 min', color: '#22C55E', requiereSprint: false },
  { sigla: 'AEI',  nombre: 'Aeróbico intenso',    factor: 'Resistencia mixta',      vamMin: 90,   vamMax: 95,  ftpMin: 91,   ftpMax: 105, css: 'CSS ±3s (⚓CSS)',              fcMin: 88,   fcMax: 93, rpeMin: 6,  rpeMax: 7,  indicador: 'FC',     duracion: '5–20 min',  color: '#14B8A6', requiereSprint: false },
  { sigla: 'PAE',  nombre: 'Potencia aeróbica',   factor: 'Resistencia de velocidad',vamMin: 95,  vamMax: 100, ftpMin: 106,  ftpMax: 120, css: 'CSS −4 a −8s (⚓vVO₂máx)',     fcMin: 93,   fcMax: 100,rpeMin: 7,  rpeMax: 8,  indicador: 'FC',     duracion: '2–8 min',   color: '#EAB308', requiereSprint: false },
  { sigla: 'CLA',  nombre: 'Capacidad lactácida', factor: 'Resistencia de velocidad',vamMin: 105, vamMax: 120, ftpMin: 121,  ftpMax: 150, css: 'CSS −8 a −15s (series 25–50m)',fcMin: null,fcMax: null,rpeMin: 8, rpeMax: 9,  indicador: 'FC+RPE', duracion: '30s–2 min', color: '#F97316', requiereSprint: false },
  { sigla: 'PLA',  nombre: 'Potencia lactácida',  factor: 'Resistencia de velocidad',vamMin: 120, vamMax: 140, ftpMin: 150,  ftpMax: null,css: 'Series ≤25m, vel. máxima',    fcMin: null, fcMax: null,rpeMin: 9, rpeMax: 10, indicador: 'RPE',    duracion: '10–30 s',   color: '#EF4444', requiereSprint: true  },
  { sigla: 'CALA', nombre: 'Capacidad aláctica',  factor: 'Velocidad',              vamMin: 140,  vamMax: null,ftpMin: null,  ftpMax: null,css: 'Series 10–15m, desde pared',  fcMin: null, fcMax: null,rpeMin: 9, rpeMax: 10, indicador: 'RPE',    duracion: '5–10 s',    color: '#DC2626', requiereSprint: true  },
  { sigla: 'PALA', nombre: 'Potencia aláctica',   factor: 'Velocidad',              vamMin: 160,  vamMax: null,ftpMin: null,  ftpMax: null,css: 'Series <10m, desde salida',   fcMin: null, fcMax: null,rpeMin: 10,rpeMax: 10, indicador: 'RPE',    duracion: '< 5 s',     color: '#A855F7', requiereSprint: true  },
]

// ------------------------------------------------------------
// 10 ZONAS DE FUERZA Y FLEXIBILIDAD
// ------------------------------------------------------------
export const ZONAS_FUERZA: ZonaFuerza[] = [
  { sigla: 'AFG',    nombre: 'Acondicionamiento Físico General', factor: 'Fuerza básica',    rmMin: 40,  rmMax: 60,  rpeMin: 5,  rpeMax: 6,  series: '2–4', repTiempo: '15–25 rep',     descanso: '45–90 s',   durSerie: '30–75 s',  indicador: 'FC',     color: '#6B7280' },
  { sigla: 'FMI',    nombre: 'Fuerza Máxima Intramuscular',      factor: 'Fuerza básica',    rmMin: 85,  rmMax: 100, rpeMin: 8,  rpeMax: 10, series: '3–6', repTiempo: '1–5 rep',       descanso: '3–5 min',   durSerie: '< 15 s',   indicador: 'RPE',    color: '#DC2626' },
  { sigla: 'FMH',    nombre: 'Fuerza Máxima Hipertrofia',        factor: 'Fuerza básica',    rmMin: 65,  rmMax: 85,  rpeMin: 7,  rpeMax: 9,  series: '3–5', repTiempo: '6–12 rep',      descanso: '60–120 s',  durSerie: '20–60 s',  indicador: 'FC+RPE', color: '#EF4444' },
  { sigla: 'FEC',    nombre: 'Fuerza Explosiva Cíclica',         factor: 'Fuerza explosiva', rmMin: 30,  rmMax: 60,  rpeMin: 7,  rpeMax: 9,  series: '3–5', repTiempo: '4–8 rep',       descanso: '2–4 min',   durSerie: '< 10 s',   indicador: 'RPE',    color: '#F97316' },
  { sigla: 'FEA',    nombre: 'Fuerza Explosiva Acíclica',        factor: 'Fuerza explosiva', rmMin: 30,  rmMax: 60,  rpeMin: 8,  rpeMax: 10, series: '3–5', repTiempo: '3–5 rep',       descanso: '3–5 min',   durSerie: '< 5 s',    indicador: 'RPE',    color: '#F59E0B' },
  { sigla: 'RFMIX1', nombre: 'Resistencia de Fuerza Mixta 1',    factor: 'Resistencia de fuerza', rmMin: 50, rmMax: 70, rpeMin: 7, rpeMax: 9, series: '3–5', repTiempo: '10–20 rep',    descanso: '60–120 s',  durSerie: '10–20 s',  indicador: 'RPE',    color: '#14B8A6' },
  { sigla: 'RFLA',   nombre: 'Resistencia de Fuerza Lactácida',  factor: 'Resistencia de fuerza', rmMin: 40, rmMax: 65, rpeMin: 8, rpeMax: 10,series: '3–5', repTiempo: '20–40 rep',    descanso: '2–4 min',   durSerie: '20 s–2 min',indicador: 'FC+RPE', color: '#A855F7' },
  { sigla: 'RFMIX2', nombre: 'Resistencia de Fuerza Mixta 2',    factor: 'Resistencia de fuerza', rmMin: 35, rmMax: 55, rpeMin: 7, rpeMax: 8, series: '3–4', repTiempo: 'Continuo',     descanso: '2–3 min',   durSerie: '2–5 min',  indicador: 'FC+RPE', color: '#06B6D4' },
  { sigla: 'RFAE',   nombre: 'Resistencia de Fuerza Aeróbica',   factor: 'Resistencia de fuerza', rmMin: 20, rmMax: 45, rpeMin: 5, rpeMax: 7, series: '2–4', repTiempo: '> 30 rep',     descanso: '60–90 s',   durSerie: '> 5 min',  indicador: 'FC',     color: '#22C55E' },
  { sigla: 'FLEX',   nombre: 'Flexibilidad / Movilidad',         factor: 'Flexibilidad',     rmMin: null,rmMax: null,rpeMin: 3,  rpeMax: 5,  series: '2–4', repTiempo: '20–60 s/pos.',  descanso: '30–60 s',   durSerie: '20–60 s',  indicador: 'RPE',    color: '#EC4899' },
]

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
// La sigla puede llegar vacía: tarea.zona_entrenamiento es nullable.
export const zonaResistencia = (sigla: string | null | undefined) =>
  sigla ? ZONAS_RESISTENCIA.find(z => z.sigla === sigla) || null : null
export const zonaFuerza = (sigla: string) => ZONAS_FUERZA.find(z => z.sigla === sigla) || null
export const esZona2 = (sigla: string) => !!zonaResistencia(sigla) || !!zonaFuerza(sigla)

// Factores de carga en orden, para agrupar en la UI
export const FACTORES_RESISTENCIA = ['Recuperación', 'Resistencia básica', 'Resistencia mixta', 'Resistencia de velocidad', 'Velocidad']
export const FACTORES_FUERZA = ['Fuerza básica', 'Fuerza explosiva', 'Resistencia de fuerza', 'Flexibilidad']

// Formatea un rango "min–max" con sufijo, tolerando nulls (<max, >min)
export function rango(min: number | null, max: number | null, sufijo = '%'): string {
  if (min == null && max == null) return '—'
  if (min == null) return `< ${max}${sufijo}`
  if (max == null) return `> ${min}${sufijo}`
  return `${min}–${max}${sufijo}`
}

// Ritmo de carrera (min/km) desde VAM (km/h) y % — devuelve "m:ss"
function paceKm(vam: number, pct: number): string {
  const vel = vam * pct / 100
  if (vel <= 0) return '—'
  const seg = Math.round(3600 / vel)
  return `${Math.floor(seg / 60)}:${(seg % 60).toString().padStart(2, '0')}`
}

// Prescripción de una zona de resistencia por disciplina, dados los tests del atleta
export function prescripcion(z: ZonaResistencia, disciplina: string, tests: { vam?: number | null; ftp?: number | null; css?: number | null }): string {
  if (disciplina === 'Carrera') {
    if (!tests.vam) return rango(z.vamMin, z.vamMax) + ' VAM'
    const lo = z.vamMax ? paceKm(tests.vam, z.vamMax) : null   // más rápido = mayor %
    const hi = z.vamMin ? paceKm(tests.vam, z.vamMin) : null
    if (lo && hi) return `${lo}–${hi} /km`
    if (lo) return `< ${lo} /km`
    if (hi) return `> ${hi} /km`
    return rango(z.vamMin, z.vamMax) + ' VAM'
  }
  if (disciplina === 'Ciclismo') {
    if (z.ftpMin == null && z.ftpMax == null) return 'Por APR (sprint)'
    if (!tests.ftp) return rango(z.ftpMin, z.ftpMax) + ' FTP'
    const wLo = z.ftpMin != null ? Math.round(tests.ftp * z.ftpMin / 100) : null
    const wHi = z.ftpMax != null ? Math.round(tests.ftp * z.ftpMax / 100) : null
    if (wLo != null && wHi != null) return `${wLo}–${wHi} W`
    if (wHi != null) return `< ${wHi} W`
    if (wLo != null) return `> ${wLo} W`
  }
  if (disciplina === 'Natacion' || disciplina === 'Natación') {
    // Con CSS del deportista → ritmo concreto por 100 m (ej. "> 2:05 /100m").
    // Sin test de CSS → cae a la etiqueta relativa del catálogo ("CSS +20s...").
    return tests.css ? paceNatacion(z.sigla, tests.css, z.css) : z.css
  }
  return '—'
}

// ------------------------------------------------------------
// ------------------------------------------------------------
// Tabla de intensidades del deportista (VAM / FTP / CSS → objetivos por zona)
// ------------------------------------------------------------

// Offset numérico de natación por zona: segundos por 100 m respecto al CSS
// (negativo = más rápido que CSS). Derivado del texto del catálogo.
const CSS_OFFSET: Record<string, [number | null, number | null]> = {
  AER: [20, null], AEL: [10, 20], AEM: [4, 8], AEI: [-3, 3],
  PAE: [-8, -4], CLA: [-15, -8], PLA: [null, null], CALA: [null, null], PALA: [null, null],
}

// Segundos → "m:ss"
function fmtSeg(s: number): string {
  if (!isFinite(s) || s <= 0) return '—'
  const t = Math.round(s)
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`
}

// ------------------------------------------------------------
// Intensidad real de una zona, para estimar duraciones (lib/duracion.ts).
//
// Ojo con el atajo fácil: cargaZona() comprime estas 9 zonas en 7 niveles (AER y AEL
// caen las dos en el nivel 1; PLA y CALA en el 6). Si se estima con ese nivel, AEL
// acaba corriendo al 60% de la VAM (el % de AER) cuando es 65–75%. Por eso estos
// helpers leen el catálogo directamente, sin pasar por el nivel.
// ------------------------------------------------------------

// % de VAM del punto medio de una zona de carrera. Los extremos abiertos (AER sin
// mínimo, CALA/PALA sin máximo) se resuelven con el único borde que tienen.
export function pctVamZona(sigla: string | null | undefined): number | null {
  const z = zonaResistencia(sigla)
  if (!z) return null
  const { vamMin, vamMax } = z
  if (vamMin != null && vamMax != null) return (vamMin + vamMax) / 2
  if (vamMax != null) return vamMax * 0.92   // AER: "hasta 65%" → se rueda por debajo
  if (vamMin != null) return vamMin          // CALA/PALA: el suelo es la referencia
  return null
}

// Velocidad de natación (m/s) de una zona, dado el CSS en m/s.
// Se calcula desde el desfase real en segundos sobre el CSS (CSS_OFFSET), no con un
// % sobre la velocidad: un "CSS +15s" no es un 85% del CSS, y tratarlo como % daba
// ritmos absurdos.
export function velNatacionZona(sigla: string | null | undefined, css: number): number | null {
  if (!sigla || !css || css <= 0) return null
  const off = CSS_OFFSET[sigla]
  if (!off) return null
  const base = 100 / css                       // seg/100m al CSS
  const [oMin, oMax] = off
  // Punto medio del rango de la zona; con un solo borde, ese borde manda.
  const seg = oMin != null && oMax != null ? base + (oMin + oMax) / 2
    : oMin != null ? base + oMin
    : oMax != null ? base + oMax
    : null
  // PLA/CALA/PALA no tienen desfase: son series a velocidad máxima, no estimables
  // por ritmo relativo al CSS.
  if (seg == null || seg <= 0) return null
  return 100 / seg
}

// Ritmo de natación por 100 m para una zona, dado el CSS en m/s.
function paceNatacion(sigla: string, css: number, textoFallback: string): string {
  const off = CSS_OFFSET[sigla]
  if (!off || (off[0] == null && off[1] == null)) return 'Máx. (series)'
  const base = 100 / css // seg/100m a CSS
  const [oMin, oMax] = off
  const lo = oMin != null ? base + oMin : null // borde más rápido (menos tiempo)
  const hi = oMax != null ? base + oMax : null // borde más lento (más tiempo)
  if (lo != null && hi != null) return `${fmtSeg(lo)}–${fmtSeg(hi)} /100m`
  if (lo != null) return `> ${fmtSeg(lo)} /100m` // AER: CSS+20 o más lento
  if (hi != null) return `< ${fmtSeg(hi)} /100m`
  return textoFallback
}

export interface FilaIntensidad {
  sigla: string; nombre: string; color: string; factor: string
  carrera: string; ciclismo: string; natacion: string; fc: string; rpe: string
}

// Construye la tabla de intensidades para las 9 zonas de resistencia.
export function tablaIntensidades(
  tests: { vam?: number | null; ftp?: number | null; css?: number | null },
  fcMax?: number | null,
): FilaIntensidad[] {
  return ZONAS_RESISTENCIA.map(z => ({
    sigla: z.sigla,
    nombre: z.nombre,
    color: z.color,
    factor: z.factor,
    carrera: prescripcion(z, 'Carrera', tests),
    ciclismo: prescripcion(z, 'Ciclismo', tests),
    natacion: tests.css ? paceNatacion(z.sigla, tests.css, z.css) : (z.css || '—'),
    fc: (fcMax && z.fcMin != null && z.fcMax != null)
      ? `${Math.round(fcMax * z.fcMin / 100)}–${Math.round(fcMax * z.fcMax / 100)} ppm`
      : '—',
    rpe: z.rpeMin === z.rpeMax ? String(z.rpeMin) : `${z.rpeMin}–${z.rpeMax}`,
  }))
}

// Carga: resolver único para cualquier sigla (Z1–Z7 o Zonas 2)
// Devuelve intensidad representativa para los cálculos/gráficos de carga.
// El RPE sale del propio catálogo (punto medio del rango); el "nivel" 1–7
// es la zona clásica equivalente por RPE. Nada inventado: RPE-anclado.
// ------------------------------------------------------------
const RPE_CLASICO = [2.5, 4.5, 6.5, 7.5, 8.5, 9.5, 10]
const COLOR_CLASICO = ['#94a3b8', '#34d399', '#a3e635', '#fbbf24', '#fb923c', '#f87171', '#c084fc']
const NOMBRE_CLASICO = ['Recuperación', 'Aeróbica', 'Tempo', 'Umbral', 'VO₂máx', 'Anaeróbica', 'Neuromuscular']

function nivelDeRpe(rpe: number): number {
  let best = 0, bestD = Infinity
  RPE_CLASICO.forEach((r, i) => { const d = Math.abs(r - rpe); if (d < bestD) { bestD = d; best = i } })
  return best + 1
}

export interface CargaZona {
  nivel: number   // 1–7, zona clásica equivalente por RPE (altura de barra, ritmo, %)
  rpe: number     // RPE representativo (para UA)
  color: string   // color de la zona (real de Zonas 2, o clásico)
  nombre: string  // nombre de la zona
}

// Intensidad representativa de una zona. Acepta 'Z1'…'Z7' o siglas Zonas 2.
export function cargaZona(sigla: string | null | undefined): CargaZona {
  const fallback: CargaZona = { nivel: 2, rpe: RPE_CLASICO[1], color: COLOR_CLASICO[1], nombre: NOMBRE_CLASICO[1] }
  if (!sigla) return fallback
  const mz = sigla.match(/^[Zz]\s*(\d)/)
  if (mz) {
    const n = Math.min(Math.max(parseInt(mz[1]), 1), 7)
    return { nivel: n, rpe: RPE_CLASICO[n - 1], color: COLOR_CLASICO[n - 1], nombre: NOMBRE_CLASICO[n - 1] }
  }
  const zr = zonaResistencia(sigla)
  if (zr) { const rpe = (zr.rpeMin + zr.rpeMax) / 2; return { nivel: nivelDeRpe(rpe), rpe, color: zr.color, nombre: zr.nombre } }
  const zf = zonaFuerza(sigla)
  if (zf) { const rpe = (zf.rpeMin + zf.rpeMax) / 2; return { nivel: nivelDeRpe(rpe), rpe, color: zf.color, nombre: zf.nombre } }
  return fallback
}
