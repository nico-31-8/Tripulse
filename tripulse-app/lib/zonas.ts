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
  { sigla: 'AEM',  nombre: 'Aeróbico glucolítico',factor: 'Resistencia básica',     vamMin: 75,   vamMax: 90,  ftpMin: 76,   ftpMax: 90,  css: 'CSS +4–8s (⚓MLSS)',           fcMin: 80,   fcMax: 88, rpeMin: 4,  rpeMax: 6,  indicador: 'FC',     duracion: '10–40 min', color: '#22C55E', requiereSprint: false },
  { sigla: 'AEI',  nombre: 'Aeróbico intenso',    factor: 'Resistencia mixta',      vamMin: 90,   vamMax: 95,  ftpMin: 91,   ftpMax: 105, css: 'CSS ±3s (⚓CSS)',              fcMin: 88,   fcMax: 93, rpeMin: 6,  rpeMax: 7,  indicador: 'FC',     duracion: '5–20 min',  color: '#14B8A6', requiereSprint: false },
  { sigla: 'PAE',  nombre: 'Potencia aeróbica',   factor: 'Resistencia de velocidad',vamMin: 95,  vamMax: 105, ftpMin: 106,  ftpMax: 120, css: 'CSS −4 a −8s (⚓vVO₂máx)',     fcMin: 93,   fcMax: 100,rpeMin: 7,  rpeMax: 8,  indicador: 'FC',     duracion: '2–8 min',   color: '#EAB308', requiereSprint: false },
  { sigla: 'CLA',  nombre: 'Capacidad lactácida', factor: 'Resistencia de velocidad',vamMin: 105, vamMax: 120, ftpMin: 121,  ftpMax: 150, css: 'CSS −8 a −15s (series 25–50m)',fcMin: null,fcMax: null,rpeMin: 8, rpeMax: 9,  indicador: 'FC+RPE', duracion: '30s–2 min', color: '#F97316', requiereSprint: false },
  { sigla: 'PLA',  nombre: 'Potencia lactácida',  factor: 'Resistencia de velocidad',vamMin: 120, vamMax: 140, ftpMin: 150,  ftpMax: null,css: 'Series ≤25m, vel. máxima',    fcMin: null, fcMax: null,rpeMin: 9, rpeMax: 10, indicador: 'RPE',    duracion: '10–30 s',   color: '#EF4444', requiereSprint: true  },
  { sigla: 'CALA', nombre: 'Capacidad aláctica',  factor: 'Velocidad',              vamMin: 140,  vamMax: 160, ftpMin: null,  ftpMax: null,css: 'Series 10–15m, desde pared',  fcMin: null, fcMax: null,rpeMin: 9, rpeMax: 10, indicador: 'RPE',    duracion: '5–10 s',    color: '#DC2626', requiereSprint: true  },
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
  // RPE 1–3, no 3–5: la movilidad no es una zona de esfuerzo. Con 3–5 empataba
  // con el AFG y una sesión de estiramientos pesaba como una de gimnasio suave.
  { sigla: 'FLEX',   nombre: 'Flexibilidad / Movilidad',         factor: 'Flexibilidad',     rmMin: null,rmMax: null,rpeMin: 1,  rpeMax: 3,  series: '2–4', repTiempo: '20–60 s/pos.',  descanso: '30–60 s',   durSerie: '20–60 s',  indicador: 'RPE',    color: '#EC4899' },
]

// ------------------------------------------------------------
// El sistema clásico Z1–Z7
// ------------------------------------------------------------
// No es código muerto: es el sistema de los atletas que no están en «Zonas 2»
// (ver tareas-tabla.tsx, donde se elige uno u otro según la sigla de la tarea).
//
// ESTA TABLA ES LA ÚNICA. Antes vivía copiada en tres sitios —la ficha de sesión,
// la pantalla de ejecución y los puntos medios de lib/duracion.ts— y las copias
// se habían separado: la columna de VAM de la ficha estaba desplazada 5–10 puntos
// respecto a la de ejecución, así que el MISMO Z4 prescribía 3:57–4:21/km en una
// pantalla y 4:10–4:41/km en la otra para un atleta de VAM 16. Nada reventaba; el
// ritmo simplemente cambiaba según por dónde entrases.
//
// FUENTES
//   · %FTP  → Coggan (7 niveles). Coincide con los ftpMin/ftpMax de Zonas 2.
//   · %VAM  → Tuimil, B1-00c Tabla 3. Es la que estaba mal en la ficha.
//   · %CSS  → derivada de los desfases sobre el CSS de Zonas 2 (ver abajo).
//
// LA COLUMNA DE CSS ESTABA CORRIDA HACIA ABAJO, y era el fallo más gordo de los
// tres: ponía el «umbral» (Z4) en 86–95 % del CSS cuando el CSS ES el umbral, así
// que tenía que estar en el 100 %. Con un CSS de 1:45, la Z4 salía a 1:55 y
// B1-00d dice que son 1:43–1:47. Toda la escala iba lenta, y en Z1 llegaba a
// mandar un 2:55/100m para un nado suave.
//
// CÓMO SE DERIVA, para que se pueda auditar. `lib/zonas.ts` ya prescribe natación
// en Zonas 2 por DESFASE sobre el CSS, y el sistema clásico Z1–Z7 mapea 1:1 con
// las siete primeras siglas (igual que hace la columna de %FTP con Coggan).
// Pasando cada desfase a proporción de velocidad con el atleta de referencia de
// B1-00d (CSS = 1:45 = 105 s/100m):
//
//   Z1 = AER  «CSS +20s o más lento» → ≥125 s → ≤ 84 %
//   Z2 = AEL  «CSS +10 a +20s»       → 115–125 s → 84–91 %
//   Z3 = AEM  «CSS +4 a +8s»         → 109–113 s → 93–96 %
//   Z4 = AEI  «CSS ±3s»              → 102–108 s → 97–103 %
//   Z5 = PAE  «CSS −4 a −8s»         → 97–101 s  → 104–108 %
//   Z6 = CLA  «CSS −8 a −15s»        → 90–97 s   → 108–117 %
//   Z7 = PLA  «≤25m a velocidad máxima»          → por encima
//
// Los pequeños huecos entre bandas (91→93, 96→97) vienen de que los propios
// desfases los tienen; se cierran redondeando, que es lo que permite que un ritmo
// cualquiera caiga siempre en alguna zona.
//
// LÍMITE CONOCIDO: un desfase en segundos NO es proporcional, así que ningún
// porcentaje puede representarlo exacto — el % real depende del CSS de cada uno.
// Calibrado con el atleta de referencia, la desviación es de unos ±4 puntos en
// los extremos (un nadador de 1:20 o de 2:10). La solución de verdad sería que el
// sistema clásico prescribiera natación por desfase como hace Zonas 2, pero eso
// obliga a tocar las cuatro pantallas que consumen esta tabla como porcentaje.
// Queda anotado; con la escala centrada donde toca, el error residual es pequeño
// al lado del que había.
export interface ZonaClasica {
  num: number
  ftpPct: [number, number]
  vamPct: [number, number]
  cssPct: [number, number]
}

export const ZONAS_CLASICAS: Record<number, ZonaClasica> = {
  1: { num: 1, ftpPct: [45, 55],   vamPct: [45, 60],   cssPct: [75, 84] },
  2: { num: 2, ftpPct: [56, 75],   vamPct: [60, 70],   cssPct: [84, 92] },
  3: { num: 3, ftpPct: [76, 90],   vamPct: [70, 80],   cssPct: [92, 97] },
  4: { num: 4, ftpPct: [91, 105],  vamPct: [80, 90],   cssPct: [97, 103] },
  5: { num: 5, ftpPct: [106, 120], vamPct: [90, 100],  cssPct: [103, 108] },
  6: { num: 6, ftpPct: [121, 150], vamPct: [100, 115], cssPct: [108, 117] },
  7: { num: 7, ftpPct: [151, 200], vamPct: [115, 150], cssPct: [117, 130] },
}

/** El número de zona a partir de la sigla clásica: 'Z4' → 4. `null` si no lo es. */
export function numZonaClasica(codigo: string | null | undefined): number | null {
  const m = String(codigo ?? '').trim().toUpperCase().match(/^Z([1-7])$/)
  return m ? Number(m[1]) : null
}

export const zonaClasica = (codigo: string | null | undefined): ZonaClasica | null => {
  const n = numZonaClasica(codigo)
  return n ? ZONAS_CLASICAS[n] : null
}

/**
 * El punto medio del rango, que es lo que usa la estimación de duración.
 *
 * Se calcula, no se escribe a mano: escrito a mano es como se separó de la tabla
 * la primera vez. Z1 va aparte porque su rango real empieza en 0 —«todo lo que
 * sea más suave que esto»— y su media aritmética no significa nada.
 */
export function pctMedioClasica(num: number, campo: 'ftpPct' | 'vamPct' | 'cssPct'): number {
  const z = ZONAS_CLASICAS[num]
  if (!z) return 0
  const [lo, hi] = z[campo]
  return Math.round((lo + hi) / 2)
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
// La sigla puede llegar vacía: tarea.zona_entrenamiento es nullable.
export const zonaResistencia = (sigla: string | null | undefined) =>
  sigla ? ZONAS_RESISTENCIA.find(z => z.sigla === sigla) || null : null
export const zonaFuerza = (sigla: string) => ZONAS_FUERZA.find(z => z.sigla === sigla) || null
export const esZona2 = (sigla: string) => !!zonaResistencia(sigla) || !!zonaFuerza(sigla)

/**
 * A qué zona pertenece un % de la VAM. La búsqueda inversa.
 *
 * NO EXISTÍA, y por eso los dos huecos de la escala de carrera pudieron vivir
 * años sin que nada se quejara: todo el código iba en la otra dirección (zona →
 * ritmo), donde un agujero no se nota. Solo se veía al querer prescribir un ritmo
 * que caía dentro —el de media maratón, sin ir más lejos— y descubrir que no
 * pertenecía a ninguna zona.
 *
 * Los huecos eran 85–90 % (entre AEM y AEI) y 100–105 % (entre PAE y CLA), y se
 * han cerrado extendiendo AEM hasta 90 y PAE hasta 105. No es criterio propio:
 * B1-00e §2.1 documenta que la Z4 de Tuimil (80–90 % VAM) «cae dentro del AEM de
 * la app», y su tabla maestra empareja PAE con las Z5/Z6 de Tuimil, que llegan
 * hasta el 115 %. Los bordes estaban recortados, no elegidos. De paso, CALA se
 * cierra en 160 —donde empieza PALA— en vez de quedar abierta y solaparse.
 *
 * Devuelve null solo si el número no es un número. Por arriba y por abajo hay
 * zona siempre: la escala cubre de 0 a infinito y un test lo fija.
 */
export function zonaDeVam(pct: number | null | undefined): ZonaResistencia | null {
  if (pct == null || !Number.isFinite(pct)) return null
  return ZONAS_RESISTENCIA.find(z =>
    (z.vamMin == null || pct >= z.vamMin) &&
    (z.vamMax == null || pct < z.vamMax)) || null
}

/**
 * Huecos y solapes de la escala de carrera. Vacío = todo ritmo tiene UNA zona.
 *
 * Es el guardián de lo de arriba. Los dos huecos vivieron años porque nadie
 * miraba la escala como un todo: zona a zona, cada una parecía razonable.
 */
export function huecosDeVam(): string[] {
  const conRango = ZONAS_RESISTENCIA.filter(z => z.vamMin != null || z.vamMax != null)
  const fallos: string[] = []
  for (let i = 1; i < conRango.length; i++) {
    const ant = conRango[i - 1], act = conRango[i]
    if (ant.vamMax == null || act.vamMin == null) continue
    if (act.vamMin > ant.vamMax) fallos.push(`hueco ${ant.vamMax}–${act.vamMin} % entre ${ant.sigla} y ${act.sigla}`)
    if (act.vamMin < ant.vamMax) fallos.push(`solape ${act.vamMin}–${ant.vamMax} % entre ${ant.sigla} y ${act.sigla}`)
  }
  return fallos
}

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

// ------------------------------------------------------------
// Ritmo objetivo de una tarea
// ------------------------------------------------------------
// El mismo entreno es un entreno distinto para cada atleta: la zona se traduce a
// ritmo/vatios con SUS tests. Vive aquí y no en una pantalla porque lo necesitan
// tanto el editor del entrenador como el briefing del deportista.
//
// Cubre los dos sistemas: siglas de Zonas 2 (vía el catálogo) y el clásico Z1–Z7.
//
// AQUÍ VIVÍA LA CUARTA COPIA de la tabla clásica, y no discrepaba solo en los
// números: discrepaba en el CRITERIO. Carrera y ciclismo cogían el punto medio
// del rango; natación cogía el extremo rápido. O sea que el «ritmo objetivo» de
// un Z2 de nadar apuntaba al borde con Z3 y el de un Z2 de correr al centro de
// su zona — el mismo concepto con dos reglas según el deporte.
//
// Ahora los tres salen de ZONAS_CLASICAS con la misma regla: el punto medio. Es
// la que ya usaban carrera y ciclismo, y es la defendible: si de un rango hay que
// dar un solo número, el del medio representa la zona; el del extremo te deja
// entrenando en la frontera con la siguiente.
const mmss = (segundos: number) =>
  Math.floor(segundos / 60) + ':' + String(Math.round(segundos % 60)).padStart(2, '0')

export function ritmoObjetivo(
  zona: string | null | undefined,
  disciplina: string | null | undefined,
  tests: { vam?: number | null; ftp?: number | null; css?: number | null } | null | undefined,
): string {
  if (!zona || !disciplina || !tests) return ''
  // Zonas 2: el catálogo ya sabe traducir la zona a ritmo real.
  const zr = zonaResistencia(zona)
  if (zr) { const p = prescripcion(zr, disciplina, tests); return p && p !== '—' ? p : '' }

  const num = numZonaClasica(zona)
  if (!num) return ''
  if (disciplina === 'Carrera' && tests.vam) {
    return mmss(3600 / (tests.vam * pctMedioClasica(num, 'vamPct') / 100)) + ' /km'
  }
  if (disciplina === 'Ciclismo' && tests.ftp) {
    return Math.round(tests.ftp * pctMedioClasica(num, 'ftpPct') / 100) + ' W'
  }
  if (disciplina === 'Natacion' || disciplina === 'Natación') {
    if (!tests.css) return ''
    return mmss(100 / (tests.css * pctMedioClasica(num, 'cssPct') / 100)) + ' /100m'
  }
  return ''
}
