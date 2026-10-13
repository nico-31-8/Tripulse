// ============================================================
// El esqueleto del analizador de vídeo (fase 2)
// ============================================================
//
// MediaPipe (lib/detector-cuerpo) da 33 puntos del cuerpo en cada fotograma.
// Aquí se decide qué se dibuja, qué lado se mide, qué ángulos salen y cuánto
// fiarse de cada uno. Sin imagen, solo geometría: para poder probarlo.
//
// CUÁNTO FIARSE, de la biblioteca (Motricidad/_bruto/valoracion-baterias-
// adultos.md). Con una cámara, el plano sagital de cadera y rodilla vale; el
// frontal sale pobre (Scataglini 2024). En sentadillas y aterrizajes el error
// de medida baja de 5° en casi todas las articulaciones, salvo la flexión de
// cadera: de 4 a 11° (Yoma 2025). Por eso, de perfil, rodilla, tronco y tibia
// salen «fiables» y lo que depende del punto de la cadera «con margen»; y de
// frente no se da ningún número: el valgo lo juzga el entrenador a ojo.
//
// QUÉ LADO SE MIDE. En las pruebas de dos lados, el que se puntúa (la pierna
// que pasa la valla, la de delante en la zancada). En las de uno, el que está
// más cerca de la cámara en el vídeo entero: el de enfrente sale tapado y el
// modelo lo adivina. Se decide una vez por vídeo, no por fotograma, para que no
// salte de un lado a otro a mitad del movimiento.
//
// EL PUNTO DUDOSO. MediaPipe dice de cada punto cuánto cree que se ve. Por
// debajo de VISIBLE_MINIMO lo está adivinando: sale en ámbar, la medida que lo
// usa también, y no entra en la gráfica. Arrastrado a mano deja de serlo.

import { anguloEnVertice, enEjesDelSuelo, frenteAVertical, type Punto } from './geometria-fotograma'
import { DE_VISTA, type Lado, type Vista } from './baterias-movimiento'

/** Un punto del cuerpo en píxeles del fotograma, con lo que el modelo cree que se ve (0-1). */
export interface PuntoCuerpo extends Punto {
  v: number
}

/** Los 33 puntos de MediaPipe, en su orden. */
export type Cuerpo = PuntoCuerpo[]

/** Las correcciones a mano de un fotograma: índice del punto → dónde va. */
export type Ajustes = Record<number, Punto>

/** Los índices de MediaPipe que se usan. «_i» es el lado izquierdo de la persona. */
export const P = {
  oreja_i: 7, oreja_d: 8,
  hombro_i: 11, hombro_d: 12, codo_i: 13, codo_d: 14, muneca_i: 15, muneca_d: 16,
  cadera_i: 23, cadera_d: 24, rodilla_i: 25, rodilla_d: 26, tobillo_i: 27, tobillo_d: 28,
  talon_i: 29, talon_d: 30, puntera_i: 31, puntera_d: 32,
} as const

export type LadoCuerpo = 'i' | 'd'
export type Parte = 'oreja' | 'hombro' | 'codo' | 'muneca' | 'cadera' | 'rodilla' | 'tobillo' | 'talon' | 'puntera'

export const indice = (parte: Parte, lado: LadoCuerpo): number => P[`${parte}_${lado}`]

export const otroLado = (l: LadoCuerpo): LadoCuerpo => (l === 'i' ? 'd' : 'i')

/** Los huesos de cada lado que se dibujan. */
export const HUESOS: [Parte, Parte][] = [
  ['oreja', 'hombro'], ['hombro', 'codo'], ['codo', 'muneca'], ['hombro', 'cadera'],
  ['cadera', 'rodilla'], ['rodilla', 'tobillo'], ['tobillo', 'talon'], ['talon', 'puntera'], ['tobillo', 'puntera'],
]

/** Lo que une un lado con el otro. */
export const CRUCES: Parte[] = ['hombro', 'cadera']

/** Las partes que se dibujan de cada lado. */
export const PARTES: Parte[] = ['oreja', 'hombro', 'codo', 'muneca', 'cadera', 'rodilla', 'tobillo', 'talon', 'puntera']

/** Los puntos que se dibujan (y se pueden arrastrar), de los dos lados. */
export const DIBUJADOS: number[] = (['i', 'd'] as LadoCuerpo[]).flatMap(l => PARTES.map(p => indice(p, l)))

/** Por debajo de esto el modelo no ve el punto: lo adivina. */
export const VISIBLE_MINIMO = 0.5

/** Los puntos con que se decide el lado cercano: los de las medidas. */
const TRONCO_Y_PIERNA: Parte[] = ['hombro', 'cadera', 'rodilla', 'tobillo']

/** Con lo arrastrado a mano encima. Lo arrastrado se da por visto. */
export function conAjustes(c: Cuerpo, ajustes: Ajustes | undefined): Cuerpo {
  if (!ajustes) return c
  return c.map((q, i) => (ajustes[i] ? { ...ajustes[i], v: 1 } : q))
}

/** El lado más cerca de la cámara en todo el vídeo: el que el modelo ve mejor de media. */
export function ladoCercano(fotogramas: Cuerpo[]): LadoCuerpo {
  const media = (l: LadoCuerpo) => {
    let s = 0, n = 0
    for (const c of fotogramas) for (const p of TRONCO_Y_PIERNA) { const q = c[indice(p, l)]; if (q) { s += q.v; n++ } }
    return n ? s / n : 0
  }
  return media('i') > media('d') ? 'i' : 'd'
}

/** El lado que se mide: el que se puntúa o, en las pruebas de un lado, el cercano. */
export function ladoAMedir(lado: Lado, fotogramas: Cuerpo[]): LadoCuerpo {
  return lado === 'izq' ? 'i' : lado === 'der' ? 'd' : ladoCercano(fotogramas)
}

export type Fiabilidad = 'fiable' | 'margen' | 'no'

export const NOMBRE_FIABILIDAD: Record<Fiabilidad, string> = { fiable: 'fiable', margen: 'con margen', no: 'no se da' }

export type ClaveMedida = 'rodilla' | 'cadera' | 'tronco' | 'tibia' | 'tronco_tibia' | 'femur' | 'frontal'

export interface MedidaCuerpo {
  clave: ClaveMedida
  nombre: string
  /** En grados. null cuando no se da. */
  valor: number | null
  texto: string
  fiabilidad: Fiabilidad
  /** Por qué se puede fiar tanto, con la fuente. */
  porque: string
  /** Sale de algún punto que el modelo está adivinando. */
  dudosa: boolean
}

const grados = (g: number) => Math.round(g) + '°'

const PORQUE = {
  rodilla: 'Error de medida por debajo de 5° en sentadillas (Yoma 2025).',
  cadera: 'La flexión de cadera es la que más baila: de 4 a 11° (Yoma 2025).',
  sagital: 'Plano sagital, de perfil (Yoma 2025; Scataglini 2024).',
  juntas: 'Sale del tronco y de la tibia, los dos fiables de perfil.',
  femur: 'Depende del punto de la cadera, el que más baila (Yoma 2025).',
  frontal: 'El plano frontal sale pobre con una cámara (Scataglini 2024): lo juzga el entrenador a ojo.',
}

/**
 * El muslo frente a la horizontal (la del suelo, si se da su inclinación), con
 * signo: positivo si la cadera está por debajo de la rodilla (en la imagen, la
 * y crece hacia abajo).
 */
export function femurFrenteAHorizontal(cadera: Punto, rodilla: Punto, inclinacion = 0): number {
  const d = enEjesDelSuelo(cadera.x - rodilla.x, cadera.y - rodilla.y, inclinacion)
  return (Math.atan2(d.y, Math.abs(d.x)) * 180) / Math.PI
}

/**
 * Lo que se mide del esqueleto en un fotograma. De perfil, los ángulos del
 * plano sagital del lado medido; desde cualquier otra vista, ninguno, y se dice
 * por qué. `inclinacion`: la del suelo marcado (lib/trazos-fotograma), para que
 * las verticales y horizontales no salgan torcidas si el móvil lo estaba.
 */
export function medidasCuerpo(c: Cuerpo, lado: LadoCuerpo, vista: Vista, inclinacion = 0): MedidaCuerpo[] {
  if (vista !== 'perfil') {
    return [{
      clave: 'frontal', nombre: vista === 'frente' ? 'Valgo de rodilla, de frente' : 'Ángulos ' + DE_VISTA[vista],
      valor: null, texto: '—', fiabilidad: 'no', porque: PORQUE.frontal, dudosa: false,
    }]
  }
  const pt = (p: Parte) => c[indice(p, lado)]
  const duda = (...ps: Parte[]) => ps.some(p => (pt(p)?.v ?? 0) < VISIBLE_MINIMO)
  const [hombro, cadera, rodilla, tobillo] = [pt('hombro'), pt('cadera'), pt('rodilla'), pt('tobillo')]

  const rod = anguloEnVertice(cadera, rodilla, tobillo)
  const cad = anguloEnVertice(hombro, cadera, rodilla)
  const tronco = frenteAVertical(cadera, hombro, inclinacion)
  const tibia = frenteAVertical(tobillo, rodilla, inclinacion)
  const femur = cadera && rodilla ? femurFrenteAHorizontal(cadera, rodilla, inclinacion) : null

  let textoJuntas = '—', juntas: number | null = null
  if (tronco != null && tibia != null) {
    juntas = tronco - tibia
    const d = Math.round(Math.abs(juntas))
    textoJuntas = d < 3 ? 'paralelos' : juntas < 0 ? `${d}° más vertical` : `${d}° más inclinado`
  }
  const textoFemur = femur == null ? '—'
    : Math.abs(femur) < 2 ? 'horizontal'
    : `${Math.round(Math.abs(femur))}° por ${femur > 0 ? 'debajo' : 'encima'}`

  return [
    { clave: 'rodilla', nombre: 'Rodilla', valor: rod, texto: rod == null ? '—' : grados(rod), fiabilidad: 'fiable', porque: PORQUE.rodilla, dudosa: duda('cadera', 'rodilla', 'tobillo') },
    { clave: 'cadera', nombre: 'Cadera', valor: cad, texto: cad == null ? '—' : grados(cad), fiabilidad: 'margen', porque: PORQUE.cadera, dudosa: duda('hombro', 'cadera', 'rodilla') },
    { clave: 'tronco', nombre: 'Tronco frente a la vertical', valor: tronco, texto: tronco == null ? '—' : grados(tronco), fiabilidad: 'fiable', porque: PORQUE.sagital, dudosa: duda('hombro', 'cadera') },
    { clave: 'tibia', nombre: 'Tibia frente a la vertical', valor: tibia, texto: tibia == null ? '—' : grados(tibia), fiabilidad: 'fiable', porque: PORQUE.sagital, dudosa: duda('rodilla', 'tobillo') },
    { clave: 'tronco_tibia', nombre: 'Tronco frente a la tibia', valor: juntas, texto: textoJuntas, fiabilidad: 'fiable', porque: PORQUE.juntas, dudosa: duda('hombro', 'cadera', 'rodilla', 'tobillo') },
    { clave: 'femur', nombre: 'Fémur frente a la horizontal', valor: femur, texto: textoFemur, fiabilidad: 'margen', porque: PORQUE.femur, dudosa: duda('cadera', 'rodilla') },
  ]
}

/** Los puntos que se dibujan en ámbar: los de las medidas que el modelo adivina. Solo de perfil. */
export function dudosos(c: Cuerpo, lado: LadoCuerpo, vista: Vista): number[] {
  if (vista !== 'perfil') return []
  return TRONCO_Y_PIERNA.map(p => indice(p, lado)).filter(i => (c[i]?.v ?? 0) < VISIBLE_MINIMO)
}

/** Grados que se aparta un fotograma de sus vecinos para tomarlo por un fallo del detector. */
export const SALTO_SOSPECHOSO = 20

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * Quita de una serie los fotogramas que se apartan de golpe de los de alrededor.
 * A 30 fotogramas por segundo una articulación no salta 20° en una prueba del
 * FMS; el detector, cuando se confunde con un fotograma (borroso, con un
 * corte), sí, y además se queda tan tranquilo: no lo marca como dudoso. Sin
 * esto, ese fotograma sería el mínimo.
 *
 * Es un filtro de Hampel: cada fotograma contra la mediana de una ventana de
 * siete CON ÉL DENTRO (tres a cada lado, menos en los bordes). Con él dentro,
 * en un movimiento seguido la mediana es él mismo y no se toca nada; y aguanta
 * hasta tres fotogramas malos de siete.
 *
 * EL UMBRAL CRECE CON LO QUE SE MUEVE LA VENTANA (tres veces su desviación
 * mediana, como el Hampel de manual), y `umbral` es solo el mínimo. Con un
 * umbral fijo, el pico de un movimiento rápido —la pierna que sube y baja sin
 * pararse— se apartaba de la mediana tanto como un fallo, y se tiraba justo el
 * mejor momento.
 */
export function sinPicos<T extends { valor: number }>(serie: T[], umbral = SALTO_SOSPECHOSO): T[] {
  if (serie.length < 5) return serie
  return serie.filter((s, i) => {
    const ventana = serie.slice(Math.max(0, i - 3), i + 4).map(x => x.valor)
    const centro = mediana(ventana)
    const desviacion = mediana(ventana.map(v => Math.abs(v - centro)))
    return Math.abs(s.valor - centro) <= Math.max(umbral, 3 * 1.4826 * desviacion)
  })
}

/**
 * Una medida a lo largo del vídeo, en orden, sin los fotogramas en que es
 * dudosa ni los que saltan de golpe (sinPicos).
 */
export function serieCuerpo(
  fotogramas: Record<number, Cuerpo>, ajustes: Record<number, Ajustes>, lado: LadoCuerpo, vista: Vista, clave: ClaveMedida,
  inclinacion = 0,
): { clave: number; valor: number }[] {
  const out: { clave: number; valor: number }[] = []
  for (const k of Object.keys(fotogramas).map(Number).sort((a, b) => a - b)) {
    const m = medidasCuerpo(conAjustes(fotogramas[k], ajustes[k]), lado, vista, inclinacion).find(x => x.clave === clave)
    if (m && m.valor != null && !m.dudosa) out.push({ clave: k, valor: m.valor })
  }
  return sinPicos(out)
}

/*
 * LAS PIERNAS CAMBIADAS. De perfil, las dos piernas se superponen y el detector
 * a veces confunde cuál es la izquierda durante unos fotogramas: la pierna que
 * se mide salta a donde estaba la otra. Se corrige mirando el fotograma de
 * antes (ya corregido): si con las piernas cambiadas cada una queda mucho más
 * cerca de donde estaba, se cambian. Las piernas y la parte de arriba (hombros,
 * brazos, cabeza) van por separado: el detector puede cruzar unas sin las otras.
 */
const PARES_PIERNAS: [number, number][] = [[23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]
const PARES_ARRIBA: [number, number][] = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22],
]

/** Solo se cambian si así quedan MUCHO más cerca: con una pierna encima de la otra, da igual cómo se llamen. */
export const MEJORA_PARA_CAMBIAR = 0.5

const separacion = (a?: Punto, b?: Punto) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0)

function cambiarSiCruzado(antes: Cuerpo, c: Cuerpo, pares: [number, number][]): Cuerpo {
  let igual = 0, cruzado = 0
  for (const [i, d] of pares) {
    igual += separacion(c[i], antes[i]) + separacion(c[d], antes[d])
    cruzado += separacion(c[i], antes[d]) + separacion(c[d], antes[i])
  }
  if (!(cruzado < igual * MEJORA_PARA_CAMBIAR)) return c
  const out = [...c]
  for (const [i, d] of pares) { out[i] = c[d]; out[d] = c[i] }
  return out
}

/** Un fotograma con las piernas y los brazos en el lado en que estaban en el anterior, ya corregido. */
export function descruzar(antes: Cuerpo | null | undefined, c: Cuerpo): Cuerpo {
  if (!antes) return c
  return cambiarSiCruzado(antes, cambiarSiCruzado(antes, c, PARES_PIERNAS), PARES_ARRIBA)
}
