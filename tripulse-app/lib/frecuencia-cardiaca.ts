// ============================================================
// TRIPULSE — Las pulsaciones de una zona, para ESTE atleta
// ============================================================
//
// LO QUE HABÍA. Dos ramas de la misma función calculaban la FC de dos maneras.
// Con siglas (AER, AEL, AEM…) se aplicaba el porcentaje directamente sobre la
// FCmáx. Con las clásicas Z1–Z7 se fabricaba un umbral en `FCmáx × 0,85` y se
// aplicaban porcentajes sobre ese invento. Ese 0,85 no estaba explicado en
// ningún sitio: aparecía, sin más, en dos ficheros.
//
// LO QUE DICE LA FUENTE. NSCA Essentials, capítulo 20 (está en el vault, en
// nsca-essentials-sc-08-diseno-resistencia-aerobica.md):
//
//   · FCR = FCmáx − FCreposo, y **%VO₂máx ≈ %FCR** entre el 50 y el 90 %.
//   · «El método Karvonen (FCR) es más fisiológico que %FCmáx».
//   · Tabla 20.1 con las equivalencias, que es lo que permite pasar de un
//     método al otro sin inventarse nada.
//
// LO QUE SE HACE AHORA. Un solo camino para los dos sistemas de zonas:
//
//   1. El porcentaje de la zona se lleva a %FCmáx (las siglas ya vienen así;
//      las clásicas van en % del umbral y se convierten).
//   2. Si se le conoce la FC de reposo, ese %FCmáx se pasa a %FCR con la tabla
//      20.1 y se aplica Karvonen. Es lo que individualiza el número.
//   3. Si no se le conoce, se queda en %FCmáx, que es lo que se hacía.
//
// PARA UN ATLETA CORRIENTE APENAS CAMBIA, y es lo esperable: la tabla 20.1
// codifica una FC de reposo típica. Donde cambia de verdad es en quien se sale
// de lo típico — un atleta con 45 de reposo puede tener 8 pulsaciones de
// diferencia en su zona base. Ahí es donde el %FCmáx le estaba mintiendo.

/**
 * Tabla 20.1 de la NSCA: %FCR ↔ %FCmáx. Es la única fuente de la conversión;
 * no hay ningún factor inventado en este fichero.
 */
export const TABLA_NSCA: [number, number][] = [
  [50, 66], [60, 74], [70, 81], [80, 88], [90, 96],
]

/**
 * El umbral como fracción de la FCmáx, para las zonas clásicas.
 *
 * Sus porcentajes están expresados «sobre el umbral» (Z4 es 94–100 % del
 * umbral), pero la app no mide la FC de umbral de nadie: la deduce. Este 0,85
 * es el que ya usaba el código; lo único que cambia es que ahora tiene nombre y
 * un sitio, en vez de estar suelto en dos ficheros.
 *
 * Coincide bien con la tabla: el umbral suele quedar cerca del 85–88 % de la
 * FCmáx, que es la banda del 80 % de FCR.
 */
export const UMBRAL_SOBRE_FCMAX = 0.85

/** De qué se ha sacado el número, para poder decírselo al atleta sin mentir. */
export type MetodoFC = 'karvonen' | 'fcmax'

export interface DatosFC {
  fcMax: number
  /** Su FC de reposo. Sin ella no hay Karvonen y se usa %FCmáx. */
  fcReposo?: number | null
}

const util = (n: unknown): number => {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** Si se puede usar Karvonen: hacen falta las dos, y en el orden correcto. */
export function hayReserva(d: DatosFC | null | undefined): boolean {
  const max = util(d?.fcMax), rep = util(d?.fcReposo)
  return max > 0 && rep > 0 && rep < max
}

/**
 * Pasa un %FCmáx a su %FCR equivalente, interpolando la tabla 20.1.
 *
 * Fuera de la tabla NO se extrapola en línea recta hasta el absurdo: por debajo
 * del 66 % de FCmáx y por encima del 96 % la relación deja de ser lineal, y
 * estirar la recta daría porcentajes negativos o por encima de 100. Se acota a
 * los extremos, que es admitir que ahí la tabla no dice nada en vez de
 * inventárselo.
 */
export function fcrDesdeFcmax(pctFcmax: number): number {
  const p = Number(pctFcmax)
  if (!Number.isFinite(p)) return 0
  const primero = TABLA_NSCA[0], ultimo = TABLA_NSCA[TABLA_NSCA.length - 1]
  if (p <= primero[1]) return primero[0]
  if (p >= ultimo[1]) return ultimo[0]

  for (let i = 0; i < TABLA_NSCA.length - 1; i++) {
    const [fcrA, maxA] = TABLA_NSCA[i], [fcrB, maxB] = TABLA_NSCA[i + 1]
    if (p >= maxA && p <= maxB) {
      const t = (p - maxA) / (maxB - maxA)
      return fcrA + t * (fcrB - fcrA)
    }
  }
  return ultimo[0]
}

/**
 * Las pulsaciones que corresponden a un porcentaje de la FCmáx.
 *
 * Con FC de reposo va por Karvonen —el porcentaje se traduce antes a %FCR—; sin
 * ella, directo sobre la FCmáx.
 */
export function ppmDePctFcmax(pctFcmax: number, d: DatosFC): number {
  const max = util(d.fcMax)
  if (!max) return 0
  if (!hayReserva(d)) return Math.round(max * Number(pctFcmax) / 100)
  const rep = util(d.fcReposo)
  const pctFcr = fcrDesdeFcmax(pctFcmax)
  return Math.round(rep + (max - rep) * pctFcr / 100)
}

export interface BandaFC {
  texto: string
  metodo: MetodoFC
  min: number
  max: number
}

/**
 * La banda de pulsaciones de una zona.
 *
 * `base` dice en qué está expresado el porcentaje que trae la zona:
 * `'fcmax'` para las siglas y `'umbral'` para las clásicas Z1–Z7.
 *
 * `null` cuando no se sabe la FCmáx o la zona no tiene banda de FC — y eso es
 * un resultado, no un fallo: hay zonas (CLA, PLA, CALA) donde la FC no sirve
 * porque el esfuerzo acaba antes de que el corazón llegue.
 */
export function bandaFC(
  pctMin: number | null | undefined,
  pctMax: number | null | undefined,
  base: 'fcmax' | 'umbral',
  d: DatosFC,
): BandaFC | null {
  if (!util(d.fcMax)) return null
  const a = Number(pctMin), b = Number(pctMax)
  const hayA = Number.isFinite(a) && a > 0, hayB = Number.isFinite(b) && b > 0
  if (!hayA && !hayB) return null

  const aFcmax = (p: number) => base === 'umbral' ? p * UMBRAL_SOBRE_FCMAX : p
  const metodo: MetodoFC = hayReserva(d) ? 'karvonen' : 'fcmax'

  const min = hayA ? ppmDePctFcmax(aFcmax(a), d) : 0
  const max = hayB ? ppmDePctFcmax(aFcmax(b), d) : 0

  const texto = hayA && hayB ? `${min}–${max} ppm`
    : hayB ? `< ${max} ppm`
    : `> ${min} ppm`

  return { texto, metodo, min, max }
}

/** Cómo se le explica al atleta de dónde sale ese número. */
export function deDondeSaleLaFC(metodo: MetodoFC): string {
  return metodo === 'karvonen'
    ? 'De tu frecuencia cardiaca de reserva: tu máxima y tu reposo'
    : 'De tu frecuencia cardiaca máxima. Con tu FC de reposo saldría más ajustado'
}

/**
 * La FC de reposo que se le conoce, de la mejor fuente que haya.
 *
 * El wellness manda sobre la anamnesis, y no por capricho: la anamnesis se
 * rellena una vez al empezar y ahí se queda, mientras que el wellness es un
 * registro de cada mañana. Con varias mediciones se coge la MEDIANA de las
 * últimas, no la media: una mañana con fiebre o mal medida desplaza la media y
 * no mueve la mediana.
 */
export function fcReposoDe(
  wellness: { fc_reposo?: number | null }[] | null | undefined,
  anamnesis?: { fc_reposo?: number | null } | null,
): number {
  const vals = (wellness || [])
    .map(w => util(w?.fc_reposo))
    .filter(v => v >= 25 && v <= 120)   // fuera de ahí es un dedazo, no un pulso
    .slice(0, 30)
  if (vals.length >= 3) {
    const orden = [...vals].sort((x, y) => x - y)
    const m = Math.floor(orden.length / 2)
    return orden.length % 2 ? orden[m] : Math.round((orden[m - 1] + orden[m]) / 2)
  }
  const anam = util(anamnesis?.fc_reposo)
  if (anam >= 25 && anam <= 120) return anam
  // Una o dos mediciones sueltas valen más que nada, pero no se promedian.
  return vals.length ? vals[0] : 0
}
