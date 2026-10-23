// ============================================================
// El informe de una batería de movimiento (FMS o Nine Test)
// ============================================================
//
// v3 del analizador, paso 2 (17-10-2026; maqueta aprobada). Una página para
// descargar en PDF o imprimir, SOLO PARA EL ENTRENADOR: si se la manda al
// deportista, lo decide el entrenador. Primero lo que hay que trabajar, luego qué
// ha cambiado desde la anterior, la tabla prueba a prueba, las gráficas que se
// elijan al descargarlo y un fotograma por prueba y lado.
//
// Aquí solo se arma el contenido, sin pantalla (la pinta components/movimiento/
// InformeMovimiento). Las notas salen de lib/baterias-movimiento, como en el
// resultado de la pestaña: el informe no puede decir otra cosa que la app.
//
// LAS GRÁFICAS SALEN DE LO GUARDADO. El vídeo no sale del dispositivo, así que
// días después solo queda la curva que el analizador guardó con cada prueba
// (aSerieGuardada, dentro de sus medidas). Pesa: por eso las listas no la
// cargan y el informe la pide aparte (lib/movimiento-datos: cargarMedidas).

import { DE_VISTA, resultadoBateria, type DefBateria, type Lado, type Prueba } from './baterias-movimiento'
import { fiabilidadDe, MEDIDAS_GRAFICA, NOMBRE_MEDIDA, type ClaveGrafica, type Fiabilidad, type LadoCuerpo } from './cuerpo'
import { fotogramasDeFila, type FilaPrueba, type Medida, type SerieGuardada } from './movimiento-datos'

const NOMBRE_LADO: Record<Lado, string> = { unico: '', izq: 'izquierda', der: 'derecha' }
const ORDEN_LADO: Record<Lado, number> = { unico: 0, izq: 1, der: 2 }
const porLado = (a: FilaPrueba, b: FilaPrueba) => ORDEN_LADO[a.lado] - ORDEN_LADO[b.lado]
const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** «Prueba de dolor de hombro (derecha)». */
const conLado = (nombre: string, lado: Lado) => nombre + (lado !== 'unico' ? ' (' + NOMBRE_LADO[lado] + ')' : '')
/** «a, b y c». */
export const enLista = (xs: string[]) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1])

/** «3,20 s». */
export const enSegundos = (s: number) => s.toFixed(2).replace('.', ',') + ' s'

/* ---------------------------------------------------------------
   Lo que apunta el analizador al guardar
   --------------------------------------------------------------- */

/** La medida que dice de qué fotograma salen las demás. */
export const NOMBRE_FOTOGRAMA = 'Fotograma'
export const TEXTO_DE_LA_APP = 'el que miró la app para la nota'

/**
 * De qué fotograma salen las medidas y la imagen que se guardan: en un vídeo,
 * cuándo (`segundos`; null en una foto) y si es el que miró la app para
 * sugerir la nota (el fondo de la sentadilla, por ejemplo). El informe lo dice
 * debajo de la imagen.
 */
export function medidaDelFotograma(segundos: number | null, deLaApp: boolean): Medida {
  return {
    nombre: NOMBRE_FOTOGRAMA,
    valor: (segundos == null ? 'una foto' : 'a los ' + enSegundos(segundos)) + (deLaApp ? ' · ' + TEXTO_DE_LA_APP : ''),
  }
}

/** Con más valores que esto (40 s a 30 fps), la curva se guarda de varios en varios fotogramas. */
export const MAXIMO_VALORES = 1200

/**
 * A una décima, pero sin que cambie el grado entero en que se redondea: el
 * visor enseña Math.round del valor exacto, y 69,46 a una décima (69,5) ya
 * subiría a 70. Entonces se guarda 69,4.
 */
export function aDecima(v: number): number {
  const d = Math.round(v * 10) / 10
  const g = Math.round(v)
  return Math.round(d) === g ? d : Math.round((g + 0.4 * Math.sign(v - g)) * 10) / 10
}

/** «172°», «−85°»: los grados del informe, enteros y con signo menos de verdad. */
export const grados = (v: number) => (Math.round(v) < 0 ? '−' : '') + Math.abs(Math.round(v)) + '°'

/**
 * De la serie del analizador (fotograma → valor, ya sin los dudosos ni los
 * saltos) a la que se guarda: un valor por fotograma desde el primero, null en
 * los huecos, a una décima (aDecima: el mínimo y el máximo, redondeados,
 * salen iguales que en el visor). En un vídeo muy largo, uno de cada `paso`
 * fotogramas, sin perder el mínimo ni el máximo.
 */
export function aSerieGuardada(
  clave: ClaveGrafica, lado: LadoCuerpo, serie: { clave: number; valor: number }[], fps: number,
): SerieGuardada | null {
  const buenos = serie.filter(s => Number.isFinite(s.clave) && Number.isFinite(s.valor))
  if (!buenos.length || !(fps > 0)) return null
  const desde = Math.min(...buenos.map(s => s.clave)), hasta = Math.max(...buenos.map(s => s.clave))
  const paso = Math.max(1, Math.ceil((hasta - desde + 1) / MAXIMO_VALORES))
  const v: (number | null)[] = Array(Math.floor((hasta - desde) / paso) + 1).fill(null)
  const hueco = (s: { clave: number }) => Math.floor(Math.round(s.clave - desde) / paso)
  let min = buenos[0], max = buenos[0]
  for (const s of buenos) {
    if (v[hueco(s)] == null) v[hueco(s)] = aDecima(s.valor)
    if (s.valor < min.valor) min = s
    if (s.valor > max.valor) max = s
  }
  v[hueco(min)] = aDecima(min.valor)
  v[hueco(max)] = aDecima(max.valor)
  return { clave, lado, desde, fps, v, ...(paso > 1 ? { paso } : {}) }
}

/* ---------------------------------------------------------------
   Lo que hay que trabajar
   --------------------------------------------------------------- */

export interface PuntoATrabajar {
  prueba: string
  /** «Sentadilla a una pierna, derecha»: con el lado peor, si los dos no coinciden. */
  titulo: string
  nota: number
  /** Las notas de cada lado, si duele y los criterios que no se cumplen. */
  detalle: string
}

/** Los criterios marcados como que no se cumplen, del lado que se diga (o de todos). */
function criteriosQueFallan(p: Prueba, registros: FilaPrueba[], lado: Lado | null): string[] {
  const textos = new Set<string>()
  for (const f of registros) {
    if (f.prueba !== p.clave || (lado != null && f.lado !== lado)) continue
    for (const c of p.criterios) if (f.criterios?.[c.clave] === false) textos.add(minuscula(c.texto))
  }
  return [...textos]
}

/** Los lados en que salió el dolor de una prueba: «derecha», «izquierda y derecha»; vacío si es de un solo lado. */
const ladosConDolor = (clave: string, registros: FilaPrueba[]) =>
  enLista(registros.filter(r => r.prueba === clave && r.dolor).sort(porLado).map(r => NOMBRE_LADO[r.lado]).filter(Boolean))

/** Por qué vale 0: le duele haciéndola, o en su prueba de dolor. Con el lado, si lo tiene. */
function textoDolor(def: DefBateria, p: Prueba, registros: FilaPrueba[]): string {
  const entre = (lados: string) => (lados ? ' (' + lados + ')' : '')
  if (registros.some(r => r.prueba === p.clave && r.dolor)) return 'Duele al hacerla' + entre(ladosConDolor(p.clave, registros)) + '.'
  const d = def.dolores.find(x => x.clave === p.dolor)
  return d ? 'Duele en la ' + minuscula(d.nombre) + entre(ladosConDolor(d.clave, registros)) + '.' : 'Duele.'
}

/**
 * Lo que hay que trabajar, que es lo primero del informe. `puntos`, con su
 * porqué: lo prioritario, que es lo que duele (0), los 1 y las de lados
 * distintos; primero la nota más baja, a igual nota las de lados distintos, y
 * si no, en el orden de la batería. `tambien`: los demás 2, solo por su nombre,
 * para que lo prioritario no se pierda entre ellos. Si no hay nada prioritario,
 * los 2 son los puntos.
 */
export function queTrabajar(def: DefBateria, registros: FilaPrueba[]): { puntos: PuntoATrabajar[]; tambien: string[] } {
  const res = resultadoBateria(def, registros)
  const todos: { punto: PuntoATrabajar; prioritario: boolean; asimetria: boolean; orden: number }[] = []
  def.pruebas.forEach((p, orden) => {
    const n = res.porPrueba[p.clave]
    if (n.nota == null || n.nota === 3) return
    const peor: Lado | null = n.asimetria && n.izq != null && n.der != null ? (n.izq < n.der ? 'izq' : 'der') : null
    const partes: string[] = []
    if (p.bilateral && n.izq != null && n.der != null) partes.push(`Izquierda ${n.izq}, derecha ${n.der}.`)
    if (n.porDolor) partes.push(textoDolor(def, p, registros))
    const fallan = criteriosQueFallan(p, registros, peor)
    if (fallan.length) partes.push('No se cumple: ' + fallan.join('; ') + '.')
    todos.push({
      punto: { prueba: p.clave, titulo: p.nombre + (peor ? ', ' + NOMBRE_LADO[peor] : ''), nota: n.nota, detalle: partes.join(' ') },
      prioritario: n.nota <= 1 || n.asimetria,
      asimetria: n.asimetria,
      orden,
    })
  })
  todos.sort((a, b) => a.punto.nota - b.punto.nota || Number(b.asimetria) - Number(a.asimetria) || a.orden - b.orden)
  if (!todos.some(x => x.prioritario)) return { puntos: todos.map(x => x.punto), tambien: [] }
  return {
    puntos: todos.filter(x => x.prioritario).map(x => x.punto),
    tambien: todos.filter(x => !x.prioritario).sort((a, b) => a.orden - b.orden).map(x => x.punto.titulo),
  }
}

/** «También por debajo de 3: sentadilla profunda y zancada en línea.» Vacío si no hay. */
export const textoTambien = (tambien: string[]) =>
  tambien.length ? 'También por debajo de 3: ' + enLista(tambien.map(minuscula)) + '.' : ''

/* ---------------------------------------------------------------
   Lo que ha cambiado, el dolor y lo que falta
   --------------------------------------------------------------- */

export interface Cambio { nombre: string; de: number; a: number }

/** Las pruebas que suben y las que bajan desde la anterior. Sin anterior, nada. */
export function cambiosDesde(def: DefBateria, registros: FilaPrueba[], previa: FilaPrueba[] | null): { suben: Cambio[]; bajan: Cambio[] } {
  const suben: Cambio[] = [], bajan: Cambio[] = []
  if (!previa) return { suben, bajan }
  const ahora = resultadoBateria(def, registros), antes = resultadoBateria(def, previa)
  for (const p of def.pruebas) {
    const a = ahora.porPrueba[p.clave].nota, de = antes.porPrueba[p.clave].nota
    if (a == null || de == null || a === de) continue
    ;(a > de ? suben : bajan).push({ nombre: p.nombre, de, a })
  }
  return { suben, bajan }
}

/** «zancada en línea (1 → 2) y rotación sentado (2 → 3)». */
export const textoCambios = (cs: Cambio[]) => enLista(cs.map(c => minuscula(c.nombre) + ' (' + c.de + ' → ' + c.a + ')'))

/**
 * Lo que se dice del dolor: dónde duele. Si no duele en nada, no se puede
 * decir «sin dolor» mientras queden pruebas de dolor sin apuntar o pruebas sin
 * hacer.
 */
export function textoDolores(def: DefBateria, registros: FilaPrueba[]): string {
  const duele: string[] = []
  const ordenados = [...registros].sort(porLado)
  for (const d of def.dolores) for (const r of ordenados) if (r.prueba === d.clave && r.dolor) duele.push(conLado(minuscula(d.nombre), r.lado))
  for (const p of def.pruebas) for (const r of ordenados) if (r.prueba === p.clave && r.dolor) duele.push(conLado(minuscula(p.nombre), r.lado))
  if (duele.length) return 'Duele: ' + duele.join(', ') + '.'
  const sinApuntar = def.dolores.filter(d => {
    const filas = registros.filter(r => r.prueba === d.clave)
    return d.bilateral ? !(filas.some(r => r.lado === 'izq') && filas.some(r => r.lado === 'der')) : !filas.length
  })
  if (sinApuntar.length) return 'Sin apuntar: ' + enLista(sinApuntar.map(d => minuscula(d.nombre))) + '.'
  return resultadoBateria(def, registros).completa ? 'Sin dolor en ninguna prueba.' : 'Sin dolor en las pruebas hechas.'
}

/** Las pruebas que aún no tienen nota. */
export function faltanDe(def: DefBateria, registros: FilaPrueba[]): string[] {
  const res = resultadoBateria(def, registros)
  return def.pruebas.filter(p => res.porPrueba[p.clave].nota == null).map(p => p.nombre)
}

/* ---------------------------------------------------------------
   La tabla prueba a prueba
   --------------------------------------------------------------- */

export interface FilaInforme {
  prueba: string
  nombre: string
  bilateral: boolean
  izq: number | null
  der: number | null
  nota: number | null
  porDolor: boolean
  /** La de la anterior, si la hay. */
  antes: number | null
}

export function filasDelInforme(def: DefBateria, registros: FilaPrueba[], previa: FilaPrueba[] | null): FilaInforme[] {
  const res = resultadoBateria(def, registros)
  const ant = previa ? resultadoBateria(def, previa) : null
  return def.pruebas.map(p => {
    const n = res.porPrueba[p.clave]
    return {
      prueba: p.clave, nombre: p.nombre, bilateral: p.bilateral, izq: n.izq, der: n.der, nota: n.nota, porDolor: n.porDolor,
      antes: ant ? ant.porPrueba[p.clave].nota : null,
    }
  })
}

/* ---------------------------------------------------------------
   Las gráficas que se pueden incluir
   --------------------------------------------------------------- */

export interface PuntoSerie { t: number; v: number }

export interface GraficaDisponible {
  /** Única en el informe: prueba, lado de la prueba, medida y lado del cuerpo. */
  id: string
  prueba: string
  nombrePrueba: string
  lado: Lado
  clave: ClaveGrafica
  nombre: string
  /** «de 70° a 172°», en grados enteros. */
  texto: string
  fiabilidad: Fiabilidad
  min: PuntoSerie
  max: PuntoSerie
  serie: SerieGuardada
}

/** Las que tienen signo, que leído en una hoja suelta no se adivina. */
export const QUE_ES_EL_SIGNO: Partial<Record<ClaveGrafica, string>> = {
  tronco_tibia: 'En negativo, el tronco más vertical que la tibia.',
  femur: 'En positivo, la cadera por debajo de la rodilla.',
}

const esClaveGrafica = (c: unknown): c is ClaveGrafica => (MEDIDAS_GRAFICA as unknown[]).includes(c)

/** Lo guardado viene de la base: se comprueba antes de dibujarlo. */
function esSerie(s: unknown): s is SerieGuardada {
  const x = s as SerieGuardada | null
  return !!x && esClaveGrafica(x.clave) && (x.lado === 'i' || x.lado === 'd') && Number.isFinite(x.desde)
    && x.fps > 0 && Array.isArray(x.v) && (x.paso == null || x.paso >= 1)
}

/** Cada valor con su tiempo, en segundos del vídeo; null donde no había valor fiable (la línea se corta ahí). */
export function puntosDeSerie(s: SerieGuardada): (PuntoSerie | null)[] {
  const paso = s.paso ?? 1
  return s.v.map((v, i) => (typeof v === 'number' && Number.isFinite(v) ? { t: (s.desde + i * paso) / s.fps, v } : null))
}

/** El mínimo y el máximo de una curva, con cuándo; con empates, el primero. */
export function extremosDeSerie(s: SerieGuardada): { min: PuntoSerie; max: PuntoSerie } | null {
  const ps = puntosDeSerie(s).filter((p): p is PuntoSerie => !!p)
  if (!ps.length) return null
  let min = ps[0], max = ps[0]
  for (const p of ps) { if (p.v < min.v) min = p; if (p.v > max.v) max = p }
  return { min, max }
}

/** Con menos valores que esto no hay curva que enseñar (lo mismo que en el visor). */
export const MINIMO_PUNTOS = 3

/**
 * Las gráficas guardadas de esta batería: las curvas que el analizador guardó
 * con cada prueba, en el orden de la batería, de sus lados y de las medidas
 * (MEDIDAS_GRAFICA). Es lo que el informe pregunta si incluir.
 */
export function graficasDisponibles(def: DefBateria, registros: FilaPrueba[]): GraficaDisponible[] {
  const out: GraficaDisponible[] = []
  for (const p of def.pruebas) {
    for (const r of registros.filter(x => x.prueba === p.clave).sort(porLado)) {
      const series = (r.medidas ?? []).map(m => m?.serie).filter(esSerie)
        .sort((a, b) => MEDIDAS_GRAFICA.indexOf(a.clave as ClaveGrafica) - MEDIDAS_GRAFICA.indexOf(b.clave as ClaveGrafica))
      for (const s of series) {
        const clave = s.clave as ClaveGrafica
        const e = extremosDeSerie(s)
        if (!e || puntosDeSerie(s).filter(Boolean).length < MINIMO_PUNTOS) continue
        const id = [p.clave, r.lado, clave, s.lado].join('|')
        if (out.some(g => g.id === id)) continue
        out.push({
          id, prueba: p.clave, nombrePrueba: p.nombre, lado: r.lado, clave, nombre: NOMBRE_MEDIDA[clave],
          texto: 'de ' + grados(e.min.v) + ' a ' + grados(e.max.v), fiabilidad: fiabilidadDe(clave), min: e.min, max: e.max, serie: s,
        })
      }
    }
  }
  return out
}

/* ---------------------------------------------------------------
   El dibujo de una gráfica, en las unidades del SVG
   --------------------------------------------------------------- */

/** El lienzo de la gráfica del informe (viewBox 0 0 ancho alto) y dónde va la curva dentro. */
export const LIENZO = { ancho: 600, alto: 150, izq: 42, der: 584, arriba: 12, abajo: 122 }

export interface Trazado {
  /** Un `d` de <path> por tramo seguido: donde no había valor fiable, la línea se corta. */
  tramos: string[]
  ejeY: { v: number; y: number }[]
  ejeX: { t: number; x: number }[]
  min: PuntoSerie & { x: number; y: number }
  max: PuntoSerie & { x: number; y: number }
}

/** Marcas redondas entre lo y hi: el paso más fino que no pase de `cuantas`. */
function marcas(lo: number, hi: number, pasos: number[], cuantas: number): number[] {
  const paso = pasos.find(p => (hi - lo) / p <= cuantas) ?? pasos[pasos.length - 1]
  const out: number[] = []
  for (let m = Math.ceil(lo / paso - 1e-9) * paso; m <= hi + 1e-9; m += paso) out.push(Math.round(m * 1000) / 1000)
  return out
}

const PASOS_GRADOS = [1, 2, 5, 10, 15, 20, 30, 45, 60, 90]
const PASOS_SEGUNDOS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120]

/** La curva, los ejes y dónde caen el mínimo y el máximo. null si no hay curva que dibujar. */
export function trazadoDe(s: SerieGuardada): Trazado | null {
  const ps = puntosDeSerie(s)
  const hay = ps.filter((p): p is PuntoSerie => !!p)
  const e = extremosDeSerie(s)
  if (!e || hay.length < MINIMO_PUNTOS) return null
  const { izq, der, arriba, abajo } = LIENZO
  const t0 = hay[0].t, t1 = hay[hay.length - 1].t
  const holgura = Math.max(2, (e.max.v - e.min.v) * 0.1)
  const lo = e.min.v - holgura, hi = e.max.v + holgura
  const X = (t: number) => izq + ((t - t0) / Math.max(1e-9, t1 - t0)) * (der - izq)
  const Y = (v: number) => abajo - ((v - lo) / (hi - lo)) * (abajo - arriba)
  const r = (n: number) => Math.round(n * 10) / 10

  const tramos: string[] = []
  let actual: string[] = []
  const cerrar = () => {
    /* Un valor suelto entre dos huecos: un punto (el trazo es redondo). */
    if (actual.length === 1) actual.push('l0.01,0')
    if (actual.length) tramos.push(actual.join(' '))
    actual = []
  }
  for (const p of ps) {
    if (!p) { cerrar(); continue }
    actual.push((actual.length ? 'L' : 'M') + r(X(p.t)) + ',' + r(Y(p.v)))
  }
  cerrar()

  return {
    tramos,
    ejeY: marcas(lo, hi, PASOS_GRADOS, 4).map(v => ({ v, y: r(Y(v)) })),
    ejeX: marcas(t0, t1, PASOS_SEGUNDOS, 6).map(t => ({ t, x: r(X(t)) })),
    min: { ...e.min, x: r(X(e.min.t)), y: r(Y(e.min.v)) },
    max: { ...e.max, x: r(X(e.max.t)), y: r(Y(e.max.v)) },
  }
}

/* ---------------------------------------------------------------
   Los fotogramas
   --------------------------------------------------------------- */

export interface FotoInforme {
  ruta: string
  /** «Sentadilla a una pierna · der». */
  titulo: string
  nota: number | null
  /** De qué fotograma es: «a los 3,20 s · el que miró la app para la nota». Vacío si no se apuntó. */
  texto: string
  /** Es el fotograma que miró la app para sugerir la nota. */
  deLaApp: boolean
}

/**
 * Un fotograma por prueba y lado, en el orden de la batería: los que se
 * guardaron con su imagen. En las pruebas de dos vistas, uno por vista, que
 * dicen de qué vista son y si son de la misma repetición.
 */
export function fotogramasDelInforme(def: DefBateria, registros: FilaPrueba[]): FotoInforme[] {
  const out: FotoInforme[] = []
  for (const p of def.pruebas) {
    for (const r of registros.filter(x => x.prueba === p.clave).sort(porLado)) {
      const fotos = fotogramasDeFila(r)
      const dos = fotos.length === 2
      for (const f of fotos) {
        const de = (f.medidas ?? []).find(m => m?.nombre === NOMBRE_FOTOGRAMA)
        const texto = typeof de?.valor === 'string' ? de.valor : ''
        out.push({
          ruta: f.ruta,
          titulo: p.nombre + (r.lado === 'izq' ? ' · izq' : r.lado === 'der' ? ' · der' : '') + (dos && f.vista ? ' · ' + DE_VISTA[f.vista] : ''),
          nota: r.dolor ? 0 : r.nota,
          texto: [texto, dos && r.segunda_vista?.misma_repeticion ? 'misma repetición' : ''].filter(Boolean).join(' · '),
          deLaApp: texto.includes(TEXTO_DE_LA_APP),
        })
      }
    }
  }
  return out
}
