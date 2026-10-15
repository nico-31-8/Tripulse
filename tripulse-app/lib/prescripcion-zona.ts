// ============================================================
// TRIPULSE — Prescribir una tarea: deporte → de dónde → zona → porcentaje
// ============================================================
//
// LO QUE CAMBIA. Hasta ahora una tarea solo elegía zona, y la referencia iba
// implícita: si era carrera, la VAM. Eso dejaba fuera el caso normal — un
// entrenador que pasa una prueba de esfuerzo, saca su VT1, su VT2 y su VO2máx,
// y quiere sus propias zonas encima.
//
// Ahora la tarea dice, tarea por tarea:
//
//   deporte  →  qué hay para este atleta
//   fuente   →  las zonas de la app (sobre su VAM, su FTP, su CSS) o una de
//               las clasificaciones del entrenador
//   zona     →  cuál de las de esa fuente
//   %        →  el de la zona, o uno más fino DENTRO de él
//
// EL PORCENTAJE SE AFINA, NO SE PISA. AEL es 65–75 y ahí se queda: cabe un
// 70–70 o un 68–72, no un 60. Un AEL fuera de su rango no es un AEL, y el RPE
// y el nivel —de los que salen la carga y la altura de la barra del dibujo—
// dejarían de significar lo que dicen.
//
// Y SOLO SE AFINA UNA ZONA DE UN HITO. «98–102 % de su VT2» está claro; en una
// zona que va del VT1 + 15 % al VT2 − 5 %, o en una sin techo, un porcentaje
// no tiene un sentido claro, así que esas se mandan enteras.
//
// SOLO EN ZONAS 2. Un atleta en el sistema clásico sigue igual que siempre:
// elige su Z1…Z7 y no hay referencia que elegir. Es lo que acota el riesgo de
// todo esto.
//
// ESTE FICHERO NO SABE DE PANTALLAS NI DE BASE DE DATOS. Recibe lo que ya está
// cargado y devuelve qué ofrecer, qué se puede escribir y qué sale de ello.

import { ZONAS_RESISTENCIA, rangoDeZona, nivelDeRpe, cargaZona, type CargaZona, type CopiaZona } from './zonas'
import { mmss } from './medicion'
import { aplicarPct, leerValor, valorDe, opcionesDeRef, normDeporte, unidadCanonica, type TestConMediciones } from './referencia-propia'
import {
  ANCLA_DE, idApp, idPropia, leerIdPropia, hitosDisponibles, buscarHito, valorHito,
  type HitoDisponible, type ModoRango, type TestsApp,
} from './hitos'
import { fichaDe, esDeUnHito, motivoNoUsable, type Clasificacion, type Limite, type ZonaEntrenador } from './zonas-entrenador'

/* Vivían aquí y los importa media aplicación: se reexportan desde su sitio
   nuevo (lib/hitos) para no obligar a nadie a cambiar el import. */
export { ANCLA_DE, idApp, idPropia, leerIdPropia }
export type { ModoRango, TestsApp }

export interface Referencia {
  /** `app:vam` · `propia:7:0`. Es lo que se congela en la tarea. */
  id: string
  deporte: string
  /** Lo que se lee en el desplegable: «Su VAM», «6x100 · Ritmo100». */
  etiqueta: string
  tipo: 'app' | 'propia'
  modo: ModoRango
  valor: number
  unidad: string
  /** En esta unidad bajar es mejorar. Decide hacia dónde va el porcentaje. */
  inverso: boolean
  /** De qué día salió el número. Se enseña siempre que exista. */
  fecha: string | null
  /**
   * Si hay número detrás.
   *
   * UNA REFERENCIA SIN MEDIR SE SIGUE OFRECIENDO, y es importante: lo que
   * cuelga de ella son las zonas, y prescribir un AEL tiene sentido aunque
   * todavía no se le pueda calcular el ritmo. Atar «puedo elegir zona» a
   * «tiene el test hecho» dejaría sin poder mandar nada a un atleta nuevo,
   * que es justo cuando más se le manda.
   */
  medida: boolean
  /** Solo las de la app: qué columna es, que es lo que decide su catálogo. */
  ancla?: 'vam' | 'ftp' | 'css'
}

/** Una clasificación del entrenador como fuente de zonas de una tarea. */
export interface FuenteClasificacion {
  /** `clasif:12`. Es lo que se congela en la tarea como `fuente`. */
  id: string
  tipo: 'clasif'
  deporte: string
  /** Su nombre: «Laboratorio · VT1–VT2–VO2máx». */
  etiqueta: string
  clasificacion: Clasificacion
  /** Sus hitos, resueltos: cómo se llaman y en qué unidad van. */
  hitos: HitoDisponible[]
  /** Si el atleta tiene medidos todos sus hitos. Sin ellos se manda igual. */
  medida: boolean
}

/** De dónde salen las zonas de una tarea. */
export type Fuente = Referencia | FuenteClasificacion

export const esClasificacion = (f: Fuente | null | undefined): f is FuenteClasificacion => f?.tipo === 'clasif'

export interface ZonaOfrecida {
  sigla: string
  nombre: string
  color: string
  rpe: number
  nivel: number
  /**
   * El tramo en el que se puede afinar. `null` en un extremo = sin límite.
   * `null` entero = la zona se manda entera (dos hitos, o sin techo o suelo).
   */
  rango: [number | null, number | null] | null
  origen: 'app' | 'propia'
  /** Sus límites, en una zona de una clasificación. */
  desde?: Limite | null
  hasta?: Limite | null
}

const norm = normDeporte
const mismoDeporte = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase()

// ------------------------------------------------------------
// Qué referencias tiene este atleta
// ------------------------------------------------------------

export const idClasif = (id: number): string => 'clasif:' + id

/** `clasif:12` → `12`. `null` si no es de esa forma. */
export function leerIdClasif(id: string | null | undefined): number | null {
  const m = /^clasif:(\d+)$/.exec(String(id ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * Todo lo que puede gobernar una tarea de ese deporte para ese atleta.
 *
 * PRIMERO LA DE LA APP, y no por jerarquía: es la que ya usaban todas las
 * tareas de antes, así que ponerla la primera hace que lo de siempre siga
 * saliendo primero. El CSS en natación solo aparece si el atleta lo tiene
 * medido — ofrecer una referencia vacía es ofrecer una división por cero.
 */
export function referenciasDe(
  deporte: string,
  tests: TestsApp | null | undefined,
  propios: TestConMediciones[] | null | undefined,
): Referencia[] {
  const dep = norm(deporte)
  const out: Referencia[] = []

  const a = ANCLA_DE[dep]
  if (a) {
    const bruto = Number(tests?.[a.ancla])
    const medida = Number.isFinite(bruto) && bruto > 0
    out.push({
      id: idApp(a.ancla), deporte: dep, etiqueta: 'Su ' + a.nombre, tipo: 'app',
      /* El CSS se guarda en m/s y las zonas se cuentan en segundos por 100:
         se pasa aquí, una vez, en vez de en cada pantalla que lo enseñe. */
      modo: a.modo, valor: medida ? (a.ancla === 'css' ? 100 / bruto : bruto) : 0,
      unidad: a.unidad, inverso: a.inverso, fecha: null, ancla: a.ancla, medida,
    })
  }

  /* Se reusa opcionesDeRef, que ya sabe filtrar por deporte y quedarse con los
     resultados que son referencia. Repetir aquí ese filtro es cómo un test
     acaba ofreciéndose en una pantalla y en la otra no. */
  for (const o of opcionesDeRef(propios || [], dep)) {
    const v = valorDe(o.test, o.ref.indice)
    if (!v) continue   // sin medición no hay número del que colgar nada
    out.push({
      id: idPropia(o.ref.idDefinicion, o.ref.indice), deporte: dep,
      etiqueta: o.etiqueta, tipo: 'propia',
      modo: 'pct', valor: v.valor, unidad: v.unidad, inverso: v.inverso, fecha: v.fecha, medida: true,
    })
  }
  return out
}

export const buscarReferencia = (refs: Referencia[], id: string | null | undefined): Referencia | null =>
  (refs || []).find(r => r.id === id) ?? null

/**
 * De dónde puede sacar sus zonas una tarea de ese deporte: las de la app y las
 * clasificaciones del entrenador para ese deporte.
 *
 * YA NO SE OFRECE UN TEST SUELTO como referencia: lo que colgaba de él eran
 * sus zonas, y esas ahora viven en una clasificación —la que se creó sola con
 * el nombre del test—. Ofrecer las dos cosas sería enseñar lo mismo dos veces.
 *
 * SOLO LAS QUE EXISTEN EN LA BASE y tienen alguna zona lista: una clasificación
 * vacía en el desplegable es una puerta a nada.
 */
export function fuentesDe(
  deporte: string,
  tests: TestsApp | null | undefined,
  propios: TestConMediciones[] | null | undefined,
  clasificaciones: Clasificacion[] | null | undefined,
): Fuente[] {
  const out: Fuente[] = referenciasDe(deporte, tests, propios).filter(r => r.tipo === 'app')
  const disponibles = hitosDisponibles(deporte, propios)
  for (const c of clasificaciones || []) {
    if (!c.id || c.suelta || !mismoDeporte(c.deporte, deporte)) continue
    const f = fuenteDeClasificacion(c, disponibles, tests, propios)
    if (zonasDe(f).length) out.push(f)
  }
  return out
}

/** Una clasificación como fuente, con sus hitos resueltos para este atleta. */
export function fuenteDeClasificacion(
  c: Clasificacion,
  disponibles: HitoDisponible[],
  tests: TestsApp | null | undefined,
  propios: TestConMediciones[] | null | undefined,
): FuenteClasificacion {
  const hitos = c.hitos.map(id => buscarHito(disponibles, id)).filter((h): h is HitoDisponible => !!h)
  return {
    id: idClasif(c.id ?? 0), tipo: 'clasif', deporte: norm(c.deporte), etiqueta: c.nombre,
    clasificacion: c, hitos,
    medida: c.hitos.length > 0 && c.hitos.every(h => valorHito(h, tests, propios) !== null),
  }
}

export const buscarFuente = (fuentes: Fuente[], id: string | null | undefined): Fuente | null =>
  (fuentes || []).find(f => f.id === id) ?? null

// ------------------------------------------------------------
// Qué zonas cuelgan de una fuente
// ------------------------------------------------------------

/** Una zona del entrenador tal como se ofrece en una tarea. */
function ofrecer(z: ZonaEntrenador): ZonaOfrecida | null {
  const f = fichaDe(z)
  /* Sin RPE no hay nivel, y sin nivel no hay carga ni altura de barra: esa
     zona no se ofrece en vez de ofrecerse a medias. */
  if (f.rpe === null || f.nivel === null) return null
  return {
    sigla: z.sigla, nombre: z.nombre, color: z.color, rpe: f.rpe, nivel: f.nivel,
    rango: esDeUnHito(z) ? [z.desde!.pct, z.hasta!.pct] : null,
    origen: 'propia', desde: z.desde, hasta: z.hasta,
  }
}

/**
 * Las zonas que se pueden mandar desde esa fuente.
 *
 * De la app cuelgan las del catálogo, con el rango de SU ancla. De una
 * clasificación, sus zonas listas. De un test suelto (las tareas de antes de
 * las clasificaciones) solo las zonas de un hito que cuelgan de él: las del
 * catálogo no, porque un «AEL» está definido como % de la VAM y no significa
 * nada sobre un ritmo de 100 que el entrenador se inventó.
 */
export function zonasDe(fuente: Fuente | null, mias?: ZonaEntrenador[] | null): ZonaOfrecida[] {
  if (!fuente) return []

  if (fuente.tipo === 'app') {
    const out: ZonaOfrecida[] = []
    for (const z of ZONAS_RESISTENCIA) {
      const rango = rangoDeZona(z.sigla, fuente.ancla!)
      if (!rango) continue   // PLA no tiene tramo en natación: no se ofrece
      const rpe = (z.rpeMin + z.rpeMax) / 2
      out.push({ sigla: z.sigla, nombre: z.nombre, color: z.color, rpe, nivel: nivelDeRpe(rpe), rango, origen: 'app' })
    }
    return out
  }

  if (fuente.tipo === 'clasif') {
    const zs = fuente.clasificacion.zonas
    return zs
      .filter((z, i) => motivoNoUsable(z, i, zs, fuente.clasificacion.hitos) === null)
      .map(ofrecer)
      .filter((z): z is ZonaOfrecida => !!z)
  }

  if (!leerIdPropia(fuente.id)) return []
  return (mias || [])
    .filter(z => esDeUnHito(z) && z.desde!.ref === fuente.id)
    .map(ofrecer)
    .filter((z): z is ZonaOfrecida => !!z)
}

export const buscarZona = (zonas: ZonaOfrecida[], sigla: string | null | undefined): ZonaOfrecida | null =>
  (zonas || []).find(z => z.sigla === sigla) ?? null

// ------------------------------------------------------------
// El porcentaje
// ------------------------------------------------------------

/**
 * Con qué tramo arranca una zona recién elegida: el suyo entero.
 *
 * LOS EXTREMOS ABIERTOS SE RELLENAN CON LA REGLA QUE YA USA LA APP. AER es
 * «hasta 65 %»: poner 65–65 mandaría la recuperación justo en su borde más
 * duro. `pctVamZona` resuelve ese caso con máximo × 0,92, y las que no tienen
 * techo con su propio suelo. Inventar aquí una tercera regla es cómo el mismo
 * concepto acaba respondiendo distinto según quién pregunte.
 *
 * Una zona que se manda entera no tiene tramo que afinar: `null`.
 */
export function rangoInicial(z: ZonaOfrecida | null): [number, number] | null {
  if (!z || !z.rango) return null
  const [lo, hi] = z.rango
  if (lo !== null && hi !== null) return [lo, hi]
  if (hi !== null) return [Math.round(hi * 0.92), hi]
  if (lo !== null) return [lo, lo]
  return null
}

/** Un valor devuelto al tramo de su zona. Un extremo abierto no acota. */
export function acotar(valor: number | null, rango: [number | null, number | null] | null): number | null {
  if (valor === null || !Number.isFinite(valor) || !rango) return valor
  let n = Number(valor)
  if (rango[0] !== null && n < rango[0]) n = rango[0]
  if (rango[1] !== null && n > rango[1]) n = rango[1]
  return n
}

/** Si ese valor se sale del tramo de la zona. Para pintarlo, no para corregirlo. */
export const seSale = (valor: number | null, rango: [number | null, number | null] | null): boolean =>
  valor !== null && !!rango &&
  ((rango[0] !== null && valor < rango[0]) || (rango[1] !== null && valor > rango[1]))

/** Si se mandó más fino que la zona entera. */
export function estaAfinada(pctMin: number | null, pctMax: number | null, z: ZonaOfrecida | null): boolean {
  const ini = rangoInicial(z)
  if (!ini || pctMin === null || pctMax === null) return false
  return pctMin !== ini[0] || pctMax !== ini[1]
}

// ------------------------------------------------------------
// Qué le sale al atleta
// ------------------------------------------------------------

export interface Tramo {
  /** El número del extremo bajo del rango, en la unidad de la referencia. */
  desde: number
  hasta: number
  unidad: string
  /** Si esa unidad es un tiempo: quien pinte decidirá enseñarlo como m:ss. */
  inverso: boolean
}

/**
 * El objetivo de esa tarea para ese atleta.
 *
 * `desde` y `hasta` vienen ORDENADOS POR EL NÚMERO, no por el porcentaje. Es
 * una sola regla que vale para los tres casos: en vatios el % bajo da el número
 * bajo y en un ritmo lo da alto, y quien pinta no tiene que saber cuál es cuál.
 */
export function tramoDe(
  ref: Referencia | null,
  pctMin: number | null,
  pctMax: number | null,
): Tramo | null {
  if (!ref || pctMin === null || pctMax === null) return null
  /* SIN NÚMERO NO HAY RITMO, y hay que decirlo aquí explícitamente: en el modo
     de segundos, «0 + 10» daría 10 s/100 tan tranquilo — un ritmo de récord
     mundial salido de un atleta sin test. La división por cero del otro modo
     al menos se nota. */
  if (!ref.medida || !(ref.valor > 0)) return null

  const a = ref.modo === 'seg' ? ref.valor + pctMin : aplicarPct(ref.valor, pctMin, ref.inverso)
  const b = ref.modo === 'seg' ? ref.valor + pctMax : aplicarPct(ref.valor, pctMax, ref.inverso)
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null

  const [desde, hasta] = [a, b].sort((x, y) => x - y)
  return { desde, hasta, unidad: ref.unidad, inverso: ref.inverso }
}

/**
 * El tramo escrito para que lo lea una persona.
 *
 * UN SOLO SITIO, y eso es lo importante: este texto lo enseñan el editor del
 * entrenador y el briefing del atleta. Si cada uno lo formateara por su cuenta,
 * el día que uno cambiara de criterio los dos estarían mirando la misma tarea
 * con dos números distintos, que es el fallo que este proyecto lleva
 * persiguiendo desde el principio.
 *
 * SIEMPRE LO MÁS RÁPIDO PRIMERO, sea cual sea la unidad. En km/h el número alto
 * es el rápido y en un ritmo es el bajo; quien lee no tiene que saberlo.
 */
export function textoTramo(t: Tramo | null): string {
  if (!t) return ''
  /* Se decide con la unidad como la entiende la app: un «Km/h» escrito a mano
     también se lee como ritmo (lib/referencia-propia, `unidadCanonica`). */
  const u = unidadCanonica(t.unidad)
  if (u === 'km/h') {
    /* Un tramo afinado a un punto exacto se lee «5:21 /km», no «5:21–5:21».
       Faltaba aquí y sí estaba en las otras dos unidades. */
    const a = mmss(3600 / t.hasta), b = mmss(3600 / t.desde)
    return a === b ? a + ' /km' : a + '–' + b + ' /km'
  }
  if (u === 'W') {
    const a = Math.round(t.desde), b = Math.round(t.hasta)
    return a === b ? a + ' W' : a + '–' + b + ' W'
  }
  if (u === 's/100') {
    return t.desde === t.hasta ? mmss(t.desde) + ' /100' : mmss(t.desde) + '–' + mmss(t.hasta) + ' /100'
  }
  /* Cualquier otra unidad la escribió el entrenador a mano: se enseña tal cual,
     sin intentar embellecerla. Interpretarla para adornarla es justo el paso
     donde se cuelan los números que mienten. Se redondea como en todas partes
     (leerValor): las pulsaciones, enteras. Si al redondear los dos extremos
     quedan iguales, se lee uno solo. */
  const a = leerValor(t.desde, t.unidad, true), b = leerValor(t.hasta, t.unidad, true)
  return a === b ? a + ' ' + t.unidad : a + '–' + b + ' ' + t.unidad
}

/** Un número suelto, escrito como los tramos: «5:00 /km», «245 W», «1:16 /100». */
export function textoPunto(n: number, unidad: string): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const u = unidadCanonica(unidad)
  if (u === 'km/h') return mmss(3600 / n) + ' /km'
  if (u === 'W') return Math.round(n) + ' W'
  if (u === 's/100') return mmss(n) + ' /100'
  return leerValor(n, unidad)
}

/**
 * Una zona sin techo o sin suelo, escrita: «más lento de 5:00 /km», «por
 * encima de 300 W».
 *
 * `lado` es del ESFUERZO, no del número: 'bajo' = menos que esto. En un ritmo
 * menos esfuerzo es más lento; en vatios o pulsaciones, menos número.
 */
export function textoAbierto(n: number, unidad: string, inverso: boolean, lado: 'bajo' | 'alto'): string {
  const p = textoPunto(n, unidad)
  if (!p) return ''
  if (unidadCanonica(unidad) === 'km/h' || inverso) return (lado === 'bajo' ? 'más lento de ' : 'más rápido de ') + p
  return (lado === 'bajo' ? 'por debajo de ' : 'por encima de ') + p
}

// ------------------------------------------------------------
// Lo que se congela en la tarea
// ------------------------------------------------------------

/** Un límite tal como viaja en la copia: con el nombre de su hito, congelado. */
export interface LimiteCopia extends Limite {
  /** «VT1». Para poder explicar la zona aunque el test se archive. */
  corto: string
}

export interface CopiaPrescrita extends CopiaZona {
  /** El % que se mandó, que puede ser más fino que el de la zona. */
  pctMin: number
  pctMax: number
  /**
   * De qué referencia salió el %, para recalcular el ritmo al enseñarlo.
   * Vacío en una zona que se mandó entera desde una clasificación: ahí no hay
   * «un» porcentaje, hay dos límites.
   */
  refId: string
  refEtiqueta: string
  /** Solo las de una clasificación: `clasif:12`. Es lo que vuelve a la fila al editarla. */
  fuente?: string
  /** El nombre de la clasificación, congelado. */
  clasificacion?: string
  /** Sus dos límites, ya afinados. `null` = sin límite. */
  desde?: LimiteCopia | null
  hasta?: LimiteCopia | null
}

/**
 * La copia que viaja con la tarea.
 *
 * SE CONGELA LO QUE DECIDIÓ EL ENTRENADOR Y NADA MÁS. El ritmo no entra: ese
 * depende de los tests del atleta y se calcula al enseñarlo, así que un test
 * nuevo mueve los ritmos sin reescribir lo que se mandó. Es el mismo criterio
 * que la app ya usa con los ejercicios de fuerza — el nombre se congela, el
 * vídeo se resuelve en vivo.
 *
 * Y el PORCENTAJE sí entra, aunque la zona lo tenga: si mandaste un 70 exacto,
 * lo que se hizo ese día fue un 70. Sin guardarlo, cambiar la zona mañana
 * reescribiría el historial. En una zona de una clasificación entran sus dos
 * límites, con el % que se mandó y el nombre de su hito.
 */
export function copiaPrescrita(
  fuente: Fuente | null,
  zona: ZonaOfrecida | null,
  pctMin: number | null,
  pctMax: number | null,
): CopiaPrescrita | null {
  if (!fuente || !zona) return null
  const base = { sigla: zona.sigla, nombre: zona.nombre, color: zona.color, rpe: zona.rpe, nivel: zona.nivel }

  if (fuente.tipo === 'clasif') {
    const corto = (ref: string) => buscarHito(fuente.hitos, ref)?.corto ?? ''
    const copiaDe = (l: Limite | null | undefined, pct?: number): LimiteCopia | null =>
      l ? { ref: l.ref, pct: pct ?? l.pct, corto: corto(l.ref) } : null
    const comun = { fuente: fuente.id, clasificacion: fuente.etiqueta }

    if (zona.rango && zona.desde && zona.hasta) {
      /* De un hito: se afina dentro de la zona, como las de la app. */
      const ini = rangoInicial(zona)
      const a = acotar(pctMin ?? ini?.[0] ?? null, zona.rango)
      const b = acotar(pctMax ?? ini?.[1] ?? null, zona.rango)
      if (a === null || b === null) return null
      const min = Math.min(a, b), max = Math.max(a, b)
      return {
        ...base, pctMin: min, pctMax: max,
        refId: zona.desde.ref, refEtiqueta: corto(zona.desde.ref),
        ...comun, desde: copiaDe(zona.desde, min), hasta: copiaDe(zona.hasta, max),
      }
    }
    /* Entera: sus límites tal cual. */
    if (!zona.desde && !zona.hasta) return null
    return {
      ...base, pctMin: 0, pctMax: 0, refId: '', refEtiqueta: '',
      ...comun, desde: copiaDe(zona.desde), hasta: copiaDe(zona.hasta),
    }
  }

  const ini = rangoInicial(zona)
  const min = acotar(pctMin ?? ini?.[0] ?? null, zona.rango)
  const max = acotar(pctMax ?? ini?.[1] ?? null, zona.rango)
  if (min === null || max === null) return null

  return {
    ...base,
    pctMin: Math.min(min, max), pctMax: Math.max(min, max),
    refId: fuente.id, refEtiqueta: fuente.etiqueta,
  }
}

function leerLimiteCopia(v: unknown): LimiteCopia | null {
  const l = v as Record<string, unknown> | null
  if (!l || typeof l !== 'object') return null
  const pct = Number(l.pct)
  const ref = String(l.ref ?? '')
  if (!ref || !Number.isFinite(pct) || pct <= 0) return null
  return { ref, pct, corto: String(l.corto ?? '') }
}

/**
 * Rehace la copia desde el jsonb de `tarea.zona_copia`.
 *
 * TOLERA LO QUE FALTE Y DEVUELVE NULL SI NO HAY SIGLA. Una copia a medias es
 * peor que ninguna: sin sigla, `cargaZona` la ignora y resuelve por catálogo,
 * que es exactamente lo que hacía antes de todo esto.
 */
export function leerCopia(bruto: unknown): CopiaPrescrita | null {
  const c = bruto as Record<string, unknown> | null
  if (!c || typeof c !== 'object') return null
  const sigla = String(c.sigla ?? '').trim()
  if (!sigla) return null
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const out: CopiaPrescrita = {
    sigla,
    nombre: String(c.nombre ?? '').trim() || sigla,
    color: String(c.color ?? '') || '#6b7280',
    rpe: n(c.rpe), nivel: n(c.nivel),
    pctMin: n(c.pctMin), pctMax: n(c.pctMax),
    refId: String(c.refId ?? ''), refEtiqueta: String(c.refEtiqueta ?? ''),
  }
  /* Lo de las clasificaciones solo aparece si estaba: una copia de antes
     vuelve exactamente igual que siempre. */
  if (c.fuente) out.fuente = String(c.fuente)
  if (c.clasificacion) out.clasificacion = String(c.clasificacion)
  if ('desde' in c || 'hasta' in c) {
    out.desde = leerLimiteCopia(c.desde)
    out.hasta = leerLimiteCopia(c.hasta)
  }
  return out
}

/** Si la copia es de una zona de una clasificación (lleva sus límites). */
export const esCopiaDeLimites = (c: CopiaPrescrita | null | undefined): boolean =>
  !!c && (!!c.desde || !!c.hasta)

// ------------------------------------------------------------
// La puerta para todo lo que lee tareas guardadas
// ------------------------------------------------------------

/** Lo mínimo que hace falta de una tarea para saber cuánto pesa. */
export interface TareaConZona {
  zona_entrenamiento?: string | null
  zona_copia?: unknown
}

/**
 * Cuánto vale la zona de una tarea guardada.
 *
 * UNA SOLA LÍNEA POR PANTALLA, y ese es todo el objetivo. Media aplicación
 * llama a `cargaZona(t.zona_entrenamiento)` para sacar el RPE, el nivel y el
 * color: la carga de la semana, la curva de forma, la altura de la barra del
 * dibujo, el volumen, la nutrición. Si cada una tuviera que aprender a leer la
 * copia, unas lo harían y otras no, y la misma sesión pesaría distinto según
 * por dónde entrases. Eso es peor que no tener zonas propias.
 *
 * Con esto, cada sitio cambia `cargaZona(t.zona_entrenamiento)` por
 * `cargaDeTarea(t)` y ya está: sin copia se comporta EXACTAMENTE igual que
 * antes, que es lo que hacen las 450 tareas que ya existen.
 */
export const cargaDeTarea = (t: TareaConZona | null | undefined): CargaZona =>
  cargaZona(t?.zona_entrenamiento, leerCopia(t?.zona_copia))

/** Las columnas que hay que pedir para que `cargaDeTarea` no mienta. */
export const COLUMNAS_ZONA = 'zona_entrenamiento, zona_copia'

/**
 * La tarea que representa a una sesión: la más dura de todas.
 *
 * DEVUELVE LA TAREA Y NO SU SIGLA, y esa es la gracia. Media aplicación hacía
 * este mismo `reduce` sobre un array de siglas sueltas —el volumen, el SICAT,
 * el mesociclo—, y una sigla suelta no sabe lo que pesa: una zona propia se
 * colaría entre las suaves porque su respaldo dice nivel 2. Con la tarea entera
 * viaja la copia, y con la copia el nivel de verdad.
 */
export function tareaPico<T extends TareaConZona>(tareas: T[] | null | undefined): T | null {
  let mejor: T | null = null
  let nivel = -1
  for (const t of tareas || []) {
    if (!t?.zona_entrenamiento) continue
    const n = cargaDeTarea(t).nivel
    if (n > nivel) { nivel = n; mejor = t }
  }
  return mejor
}

/**
 * El objetivo de dos límites para ese atleta: «4:21–4:13 /km», «más lento de
 * 5:00 /km».
 *
 * TODOS LOS HITOS EN %, también el CSS: en una clasificación cada límite se
 * lee igual, y el 95 % de un ritmo es más lento. Si falta el número de algún
 * hito, cadena vacía: un objetivo con medio dato es un objetivo que miente.
 */
export function objetivoDeLimites(
  desde: Limite | null | undefined,
  hasta: Limite | null | undefined,
  disciplina: string,
  tests: TestsApp | null | undefined,
  propios: TestConMediciones[] | null | undefined,
): string {
  if (!desde && !hasta) return ''
  const hitos = hitosDisponibles(disciplina, propios)
  let unidad = '', inverso = false
  const numero = (l: Limite): number | undefined => {
    const h = buscarHito(hitos, l.ref)
    const v = valorHito(l.ref, tests, propios)
    if (!h || !v) return undefined
    unidad ||= h.unidad
    if (!inverso) inverso = h.inverso
    return aplicarPct(v.valor, l.pct, h.inverso) ?? undefined
  }
  const a = desde ? numero(desde) : null
  const b = hasta ? numero(hasta) : null
  if (a === undefined || b === undefined) return ''
  if (a !== null && b !== null) {
    return textoTramo({ desde: Math.min(a, b), hasta: Math.max(a, b), unidad, inverso })
  }
  if (b !== null) return textoAbierto(b, unidad, inverso, 'bajo')
  if (a !== null) return textoAbierto(a, unidad, inverso, 'alto')
  return ''
}

/**
 * El objetivo de una tarea ya prescrita, desde su copia.
 *
 * LO USAN EL ENTRENADOR Y EL ATLETA, y por eso vive aquí. El editor lo enseña
 * en la fila y el briefing en la sesión del atleta: si cada uno lo calculara por
 * su cuenta, el día que uno cambiara de criterio los dos estarían mirando la
 * misma tarea con dos ritmos distintos y sin forma de saber cuál es el bueno.
 *
 * VALE TAMBIÉN PARA LAS ZONAS DE LA APP, no solo para las propias. Si se mandó
 * un AEL afinado al 70 exacto, el atleta tiene que ver el ritmo del 70, no el
 * del 65–75 que dice el catálogo.
 *
 * Cadena vacía cuando no se puede: sin la referencia —el test se archivó, o el
 * atleta aún no la tiene medida— NO se cae hacia la de la app, porque daría un
 * ritmo que no es el que se mandó. Mejor ninguno que uno que miente.
 */
export function objetivoDeCopia(
  copia: CopiaPrescrita | null | undefined,
  disciplina: string,
  tests: TestsApp | null | undefined,
  propios: TestConMediciones[] | null | undefined,
): string {
  if (!copia) return ''
  if (esCopiaDeLimites(copia)) return objetivoDeLimites(copia.desde, copia.hasta, disciplina, tests, propios)
  if (!copia.refId) return ''
  const ref = buscarReferencia(referenciasDe(disciplina, tests, propios), copia.refId)
  return ref ? textoTramo(tramoDe(ref, copia.pctMin, copia.pctMax)) : ''
}

/**
 * Los tests del entrenador de los que cuelga una copia: el de su referencia y
 * los de sus dos límites. Es lo que hay que cargar para poder enseñar su ritmo.
 */
export function testsDeCopia(copia: CopiaPrescrita | null | undefined): number[] {
  if (!copia) return []
  const ids = [copia.refId, copia.desde?.ref, copia.hasta?.ref]
    .map(r => leerIdPropia(r || '')?.idDefinicion)
    .filter((x): x is number => !!x)
  return [...new Set(ids)]
}

/** Si esta tarea cuelga de un test del entrenador y no de la referencia de la app. */
export const cuelgaDeTestPropio = (t: TareaConZona | null | undefined): boolean =>
  testsDeCopia(leerCopia(t?.zona_copia)).length > 0
