// ============================================================
// TRIPULSE — Cada sesión, con los minutos que le da el plan
// ============================================================
// El planificador decide cuántos minutos lleva cada sesión: salen de las horas
// de la semana, y esas de la carga relativa del mesociclo. Hasta el 2026-10-18
// el volcado escribía la plantilla con su volumen FIJO y esos minutos se
// tiraban, así que la semana de descarga y la de sobrecarga de un bloque
// salían idénticas en el calendario (deportista 20: ~8 h 20′ las seis semanas,
// cuando el plan pedía de 7 a 8,5 h y 4,5 la de descarga).
//
// Esto ajusta la plantilla a sus minutos sin dejar de ser esa sesión:
//
//   · El calentamiento y la vuelta a la calma no se tocan.
//   · LO DURO (AEM para arriba) cambia CUÁNTAS repeticiones, nunca cuánto mide
//     cada una ni su descanso: eso es lo que hace que sea ese método. Es lo que
//     hace B1-04 en la descarga: «4×8 min Z4» pasa a «2×8 min Z4».
//   · LO SUAVE cambia su duración o sus metros. Los ejercicios cortos (técnica,
//     progresivos, cadencia) se quedan como están: no son volumen.
//   · TOPES: ni más repeticiones ni más volumen del que la plantilla documenta
//     en alguno de sus niveles (un 2×20′ de tempo no pasa a 3×20′: la fuente da
//     «2 × 20 / 3 × 15»), y lo duro no baja de la mitad de lo de su nivel.
//   · Lo que le sobra a una sesión de CALIDAD con lo duro ya en su tope va como
//     rodaje en AEL al final, como en las semanas tipo de B1-04 («4×5 min Z5 +
//     volumen Z2»). A una SUAVE no se le inventa volumen: se queda en su tope.
//   · Lo que no cabe se dice (`aviso`), no se esconde.
//
// Los minutos se cuentan con la MISMA cuenta que el calendario
// (calcularDuracionEstimada, con el ritmo de referencia si falta el test): lo
// que se escribe y lo que luego se enseña tienen que cuadrar entre sí.
import { resolverClave } from './plantillas'
import type { BloqueP, NivelPlantilla } from './plantillas-tipos'
import { calcularDuracionEstimada, type TestsDeportista } from './duracion'

export interface SesionAjustada {
  bloques: BloqueP[]
  /** Lo que dura con esos bloques, estimado con sus ritmos. */
  minutos: number
  /** Los minutos que le daba el plan. */
  objetivo: number
  /** Si no cabe en sus minutos sin salirse de lo documentado, por qué. */
  aviso?: string
}

const NIVELES: NivelPlantilla[] = ['principiante', 'intermedio', 'avanzado']

const SUAVES = new Set(['AER', 'AEL'])
const esSuave = (zona: string) => SUAVES.has(zona)

/** Lo duro no baja de la mitad de lo de su nivel (B1-04: 4×8′ → 2×8′ en la descarga). */
const SUELO_DURO = 0.5
/** Hasta aquí de diferencia no se avisa: es el redondeo de una serie o de cinco minutos. */
const TOLERANCIA_SEG = 10 * 60
/** Un rodaje de relleno de menos de esto no merece un bloque propio. */
const RELLENO_MIN_SEG = 5 * 60

/** Lo que duran unos bloques de plantilla, con la misma cuenta que el calendario. */
export function segundosDe(bloques: BloqueP[], disciplina: string, ritmos: TestsDeportista = {}): number {
  const tareas = bloques.map(b => ({
    disciplina,
    series: b.series || 1,
    descanso_segundos: b.descansoSeg ?? null,
    zona_entrenamiento: b.zona,
    p_distancia: b.metros ? [{ metros_planeados: b.metros }] : [],
    p_duracion: b.segundos ? [{ tiempo_planeado: b.segundos }] : [],
  }))
  return calcularDuracionEstimada(tareas, ritmos, { conReferencia: true }).segundos
}

const veces = (b: BloqueP) => (b.series && b.series > 1 ? b.series : 1)
/** Lo que mide una repetición: segundos o metros, lo que lleve. */
const medida = (b: BloqueP) => b.segundos ?? b.metros ?? 0
const conMedida = (b: BloqueP, x: number): BloqueP => (b.segundos != null ? { ...b, segundos: x } : { ...b, metros: x })

/* Números que un entrenador escribiría: tramos largos de cinco en cinco
   minutos o de cien en cien metros; los cortos, más finos. */
function redondear(b: BloqueP, x: number): number {
  const paso = b.segundos != null
    ? (x >= 600 ? 300 : x >= 120 ? 60 : 10)
    : (x >= 1000 ? 100 : 50)
  return Math.max(paso, Math.round(x / paso) * paso)
}

const mcd = (a: number, b: number): number => (b ? mcd(b, a % b) : a)

/**
 * Cómo cambia cada bloque de la parte principal.
 *
 * · 'veces': cambia cuántas repeticiones. Las series duras, y las suaves que
 *   van enlazadas a ellas (el fartlek alterna 200 AEL con 100 AEM: si una cambia
 *   de número y la otra no, deja de alternar).
 * · 'largo': cambia lo que mide. Lo continuo, y las series suaves largas
 *   (B1-00d da la Z2 de natación como «2 × 1.500 / 1 × 2.000 / 3 × 1.000»: lo
 *   que manda es el volumen, no el trozo).
 * · 'igual': ejercicios cortos dentro de una sesión suave —técnica, progresivos,
 *   cadencia—. No son volumen; el volumen lo pone el rodaje que los rodea.
 */
type Modo = 'veces' | 'largo' | 'igual'

function modosDe(principal: BloqueP[]): Modo[] {
  const largo = (b: BloqueP) => veces(b) === 1 || (b.metros ?? 0) >= 400 || (b.segundos ?? 0) >= 300
  const seriesDuras = principal.some(b => veces(b) > 1 && !esSuave(b.zona))
  const hayLargo = principal.some(largo)
  return principal.map(b => {
    if (veces(b) === 1) return 'largo'
    if (!esSuave(b.zona) || seriesDuras) return 'veces'
    if (largo(b)) return 'largo'
    return hayLargo ? 'igual' : 'veces'
  })
}

/**
 * La parte principal, escalada por `k` (1 = como está en su nivel).
 *
 * Los topes salen de los TRES niveles de la plantilla, que son el rango que
 * documenta la fuente (B1-00e §4: «los rangos documentados SON los niveles»).
 * Solo se miran si los tres niveles tienen la misma forma; si no, el tope es
 * el propio bloque.
 */
function escaladora(principal: BloqueP[], porNivel: Record<NivelPlantilla, BloqueP[]>) {
  const modo = modosDe(principal)
  const mismaForma = NIVELES.every(n => porNivel[n]?.length === principal.length &&
    porNivel[n].every((b, i) => b.zona === principal[i].zona))
  const enNiveles = (i: number, f: (b: BloqueP) => number) =>
    mismaForma ? NIVELES.map(n => f(porNivel[n][i])) : [f(principal[i])]

  // Las series que cambian de número lo hacen JUNTAS, en grupos: 4 × 50 AEM con
  // 8 × 50 AEI son 4 grupos de (1 + 2), y así siguen.
  const g = principal.reduce((a, b, i) => (modo[i] === 'veces' ? mcd(a, veces(b)) : a), 0)
  const tope = (b: BloqueP, i: number) => Math.max(veces(b), Math.min(
    Math.max(...enNiveles(i, veces)),
    Math.floor(Math.max(...enNiveles(i, x => veces(x) * medida(x))) / medida(b)),
  ))
  const gMax = g ? Math.max(g, Math.min(...principal.map((b, i) =>
    modo[i] === 'veces' ? Math.floor(tope(b, i) / (veces(b) / g)) : Infinity))) : 0
  const duro = principal.some((b, i) => modo[i] === 'veces' && !esSuave(b.zona))
  const gMin = g ? Math.max(1, Math.ceil(g * (duro ? SUELO_DURO : 0.25) - 1e-9)) : 0

  return (k: number): BloqueP[] => principal.map((b, i) => {
    if (modo[i] === 'igual') return b
    if (modo[i] === 'veces') {
      const grupos = Math.min(gMax, Math.max(gMin, Math.round(g * k)))
      return conSeries(b, (veces(b) / g) * grupos)
    }
    const maxVolumen = Math.max(...enNiveles(i, x => veces(x) * medida(x)))
    if (veces(b) > 1) {
      // Tramos suaves repetidos: se acortan hasta la mitad y, por debajo, se
      // quitan tramos. «3 × 150 m» no es una serie larga extensiva.
      const largo = Math.min(maxVolumen / veces(b), Math.max(medida(b) * 0.5, medida(b) * k))
      const n = Math.max(1, Math.min(veces(b), Math.round(veces(b) * medida(b) * k / largo)))
      return conSeries(conMedida(b, redondear(b, largo)), n)
    }
    const min = esSuave(b.zona)
      ? Math.min(medida(b), b.segundos != null ? 300 : 100)
      : medida(b) * SUELO_DURO
    return conMedida(b, redondear(b, Math.min(maxVolumen, Math.max(min, medida(b) * k))))
  })
}

/**
 * Una serie con `n` repeticiones. Si se queda en una, ya no es una serie: se
 * escribe como un bloque, sin el descanso entre repeticiones, que no tiene
 * entre qué ir. (Los bloques que YA eran de una repetición conservan el suyo:
 * en la pirámide o en las series en descenso es la pausa hasta el siguiente.)
 */
function conSeries(b: BloqueP, n: number): BloqueP {
  if (n > 1) return { ...b, series: n }
  const uno = { ...b }
  delete uno.series
  delete uno.descansoSeg
  return uno
}

const fmt = (seg: number) => Math.round(seg / 60) + '′'

export function ajustarAMinutos(
  clave: string, nivel: NivelPlantilla, minutos: number, ritmos: TestsDeportista = {},
): SesionAjustada | undefined {
  const r = resolverClave(clave)
  if (!r) return undefined
  const { plantilla: p, variante: v } = r
  const disciplina = p.disciplina
  const cal = v?.calentamiento ?? p.calentamiento
  const vuelta = v?.vuelta ?? p.vuelta
  const porNivel = v ? v.principal : p.principal
  const principal = porNivel[nivel]
  const conPrincipal = (m: BloqueP[]) => [...cal, ...m, ...vuelta]
  const dura = (m: BloqueP[]) => segundosDe(conPrincipal(m), disciplina, ritmos)
  const tal = (): SesionAjustada => ({ bloques: conPrincipal(principal), minutos: Math.round(dura(principal) / 60), objetivo: minutos })

  const objetivo = Math.round((Number(minutos) || 0) * 60)
  if (objetivo <= 0) return tal()
  // Lo que no se puede cronometrar no se puede ajustar: la natación anaeróbica
  // no tiene ritmo sobre el CSS (lib/zonas). Se deja como está.
  if (principal.some(b => !(segundosDe([b], disciplina, ritmos) > 0))) return tal()

  const calidad = !esSuave(p.zona)
  let main: BloqueP[]

  if (v?.ajuste === 'por-niveles') {
    // El nivel más largo que quepa; si no cabe ninguno, el más corto.
    const opciones = NIVELES.map(n => porNivel[n]).sort((a, b) => dura(a) - dura(b))
    main = [...opciones].reverse().find(m => dura(m) <= objetivo + 120) ?? opciones[0]
  } else {
    // La escala que más se acerca. El total crece con k (a saltos, por las
    // series enteras), así que se busca por bisección el mayor k que no se pasa.
    const escalar = escaladora(principal, porNivel)
    let lo = 0, hi = 8
    for (let i = 0; i < 40; i++) {
      const k = (lo + hi) / 2
      if (dura(escalar(k)) <= objetivo) lo = k
      else hi = k
    }
    const abajo = escalar(lo), arriba = escalar(hi)
    // A una de calidad, lo que falte se lo pone el rodaje en AEL: se queda con
    // la que no se pasa. A una suave no: se queda con la más cercana.
    main = !calidad && Math.abs(dura(arriba) - objetivo) < Math.abs(dura(abajo) - objetivo) ? arriba : abajo
  }

  // Lo que le sobra a una de calidad: rodaje en AEL al final, antes de la vuelta.
  const falta = objetivo - dura(main)
  if (calidad && falta >= RELLENO_MIN_SEG) main = conRelleno(main, falta, disciplina, ritmos)

  const total = dura(main)
  const sesion: SesionAjustada = { bloques: conPrincipal(main), minutos: Math.round(total / 60), objetivo: minutos }
  if (total - objetivo > TOLERANCIA_SEG) {
    sesion.aviso = `Dura ${fmt(total)} y el plan le daba ${fmt(objetivo)}: no se acorta más sin tocar el calentamiento, la vuelta a la calma o la mitad de lo duro.`
  } else if (objetivo - total > TOLERANCIA_SEG) {
    sesion.aviso = `Dura ${fmt(total)} y el plan le daba ${fmt(objetivo)}: no se alarga más de lo que su plantilla da para un avanzado.`
  }
  return sesion
}

/**
 * El rodaje en AEL que completa una sesión de calidad.
 *
 * En natación, en metros a su ritmo de AEL; en bici y carrera, en tiempo. Si la
 * parte principal ya acaba en un tramo continuo de AEL, se alarga ese en vez de
 * poner otro detrás («25′ AEL + 5′ AEL» no lo escribe nadie).
 */
function conRelleno(main: BloqueP[], falta: number, disciplina: string, ritmos: TestsDeportista): BloqueP[] {
  const ultimo = main[main.length - 1]
  const continuoAEL = ultimo && ultimo.zona === 'AEL' && veces(ultimo) === 1
  if (disciplina === 'Natacion') {
    const segPorMetro = segundosDe([{ zona: 'AEL', metros: 1000 }], disciplina, ritmos) / 1000
    const metros = segPorMetro > 0 ? Math.floor(falta / segPorMetro / 100) * 100 : 0
    if (metros < 100) return main
    if (continuoAEL && ultimo.metros != null) return [...main.slice(0, -1), { ...ultimo, metros: ultimo.metros + metros }]
    return [...main, { zona: 'AEL', metros, nota: 'Nado continuo suave' }]
  }
  const segundos = Math.floor(falta / 300) * 300
  if (continuoAEL && ultimo.segundos != null) return [...main.slice(0, -1), { ...ultimo, segundos: ultimo.segundos + segundos }]
  return [...main, { zona: 'AEL', segundos, nota: disciplina === 'Ciclismo' ? 'Rodar en AEL' : 'Rodaje suave' }]
}

/**
 * La VAM y el CSS más recientes del deportista: los que pasan sus minutos de
 * carrera y de natación a metros. Los mismos que usa el calendario para
 * estimar cuánto dura una sesión, para que lo que se escribe y lo que se
 * enseña cuenten igual.
 *
 * NUNCA FALLA: sin sus tests (o sin poder leerlos) devuelve vacío, y el ajuste
 * usa el ritmo de referencia, como hace la duración estimada. No poder leer su
 * VAM no es motivo para no escribirle la semana.
 */
export async function ritmosDelDeportista(sb: any, idDeportista: number): Promise<TestsDeportista> {
  try {
    const [{ data: t1 }, { data: t2 }] = await Promise.all([
      sb.from('test1_carrera').select('vam').not('vam', 'is', null)
        .eq('id_deportista', idDeportista).order('fecha', { ascending: false }).limit(1),
      sb.from('test2_natacion').select('css').not('css', 'is', null)
        .eq('id_deportista', idDeportista).order('fecha', { ascending: false }).limit(1),
    ])
    const vam = Number(t1?.[0]?.vam) || null
    const css = Number(t2?.[0]?.css) || null
    return { vam, css }
  } catch {
    return {}
  }
}
