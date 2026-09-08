// ============================================================
// TRIPULSE — Prescribir una tarea: referencia → zona → porcentaje
// ============================================================
//
// LO QUE CAMBIA. Hasta ahora una tarea solo elegía zona, y la referencia iba
// implícita: si era carrera, la VAM. Eso dejaba fuera el caso normal — un
// entrenador que pasa un 6×100, saca «1:13 el 100» y quiere colgar de ahí las
// zonas de ese nadador. Ese número no es un CSS y no tiene por qué serlo.
//
// Ahora la tarea dice las tres cosas, y tarea por tarea:
//
//   deporte  →  qué referencias tiene este atleta
//   ref      →  de qué número cuelga ESTA tarea
//   zona     →  cuál de las que cuelgan de esa referencia
//   %        →  el de la zona, o uno más fino DENTRO de él
//
// EL PORCENTAJE SE AFINA, NO SE PISA. AEL es 65–75 y ahí se queda: cabe un
// 70–70 o un 68–72, no un 60. Un AEL fuera de su rango no es un AEL, y el RPE
// y el nivel —de los que salen la carga y la altura de la barra del dibujo—
// dejarían de significar lo que dicen.
//
// SOLO EN ZONAS 2. Un atleta en el sistema clásico sigue igual que siempre:
// elige su Z1…Z7 y no hay referencia que elegir. Es lo que acota el riesgo de
// todo esto.
//
// ESTE FICHERO NO SABE DE PANTALLAS NI DE BASE DE DATOS. Recibe lo que ya está
// cargado y devuelve qué ofrecer, qué se puede escribir y qué sale de ello.

import { ZONAS_RESISTENCIA, rangoDeZona, nivelDeRpe, cargaZona, type CargaZona, type CopiaZona } from './zonas'
import { aplicarPct, valorDe, opcionesDeRef, type TestConMediciones } from './referencia-propia'
import { fichaDe, type ZonaEntrenador } from './zonas-entrenador'

/** Cómo se escribe el rango de una zona sobre su referencia. */
export type ModoRango = 'pct' | 'seg'

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

export interface ZonaOfrecida {
  sigla: string
  nombre: string
  color: string
  rpe: number
  nivel: number
  /** El tramo en el que se puede afinar. `null` en un extremo = sin límite. */
  rango: [number | null, number | null]
  origen: 'app' | 'propia'
}

const norm = (d: string): string => {
  const s = String(d ?? '').trim()
  return s.startsWith('Nat') ? 'Natacion' : s
}
const mismoDeporte = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase()

// ------------------------------------------------------------
// Qué referencias tiene este atleta
// ------------------------------------------------------------

/** La referencia que la app trae para cada deporte. */
export const ANCLA_DE: Record<string, { ancla: 'vam' | 'ftp' | 'css'; nombre: string; unidad: string; modo: ModoRango; inverso: boolean }> = {
  Carrera:   { ancla: 'vam', nombre: 'VAM', unidad: 'km/h',  modo: 'pct', inverso: false },
  Ciclismo:  { ancla: 'ftp', nombre: 'FTP', unidad: 'W',     modo: 'pct', inverso: false },
  /* El CSS es el único que NO se manda con un porcentaje: sus zonas son un
     desfase en segundos («CSS +10 a +20 s»). Tratarlo como % daba ritmos
     absurdos, y por eso la app ya lo guarda aparte. */
  Natacion:  { ancla: 'css', nombre: 'CSS', unidad: 's/100', modo: 'seg', inverso: true },
}

export interface TestsApp { vam?: number | null; ftp?: number | null; css?: number | null }

export const idApp = (ancla: string): string => 'app:' + ancla
export const idPropia = (idDefinicion: number, indice: number): string => 'propia:' + idDefinicion + ':' + indice

/** `propia:7:0` → `{ idDefinicion: 7, indice: 0 }`. `null` si no es de esa forma. */
export function leerIdPropia(id: string): { idDefinicion: number; indice: number } | null {
  const p = String(id ?? '').split(':')
  if (p[0] !== 'propia' || p.length !== 3) return null
  const d = Number(p[1]), i = Number(p[2])
  return Number.isInteger(d) && d > 0 && Number.isInteger(i) && i >= 0 ? { idDefinicion: d, indice: i } : null
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

// ------------------------------------------------------------
// Qué zonas cuelgan de una referencia
// ------------------------------------------------------------

/**
 * Las zonas que se pueden mandar sobre esa referencia.
 *
 * De la app cuelgan las del catálogo, con el rango de SU ancla. De una
 * referencia propia cuelgan solo las zonas del entrenador que apuntan a ella:
 * las del catálogo no, porque un «AEL» está definido como % de la VAM y no
 * significa nada sobre un ritmo de 100 que el entrenador se inventó.
 */
export function zonasDe(ref: Referencia | null, mias: ZonaEntrenador[] | null | undefined): ZonaOfrecida[] {
  if (!ref) return []

  if (ref.tipo === 'app') {
    const out: ZonaOfrecida[] = []
    for (const z of ZONAS_RESISTENCIA) {
      const rango = rangoDeZona(z.sigla, ref.ancla!)
      if (!rango) continue   // PLA no tiene tramo en natación: no se ofrece
      const rpe = (z.rpeMin + z.rpeMax) / 2
      out.push({ sigla: z.sigla, nombre: z.nombre, color: z.color, rpe, nivel: nivelDeRpe(rpe), rango, origen: 'app' })
    }
    return out
  }

  const suya = leerIdPropia(ref.id)
  if (!suya) return []
  const out: ZonaOfrecida[] = []
  for (const z of mias || []) {
    if (!z.ref || z.ref.idDefinicion !== suya.idDefinicion || z.ref.indice !== suya.indice) continue
    const f = fichaDe(z)
    /* Sin RPE no hay nivel, y sin nivel no hay carga ni altura de barra: esa
       zona no se ofrece en vez de ofrecerse a medias. */
    if (f.rpe === null || f.nivel === null) continue
    out.push({
      sigla: z.sigla, nombre: z.nombre, color: z.color, rpe: f.rpe, nivel: f.nivel,
      rango: [z.pctMin, z.pctMax], origen: 'propia',
    })
  }
  return out
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
 */
export function rangoInicial(z: ZonaOfrecida | null): [number, number] | null {
  if (!z) return null
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

const mmss = (seg: number): string =>
  Math.floor(seg / 60) + ':' + String(Math.round(seg % 60)).padStart(2, '0')

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
  if (t.unidad === 'km/h') {
    /* Un tramo afinado a un punto exacto se lee «5:21 /km», no «5:21–5:21».
       Faltaba aquí y sí estaba en las otras dos unidades. */
    const a = mmss(3600 / t.hasta), b = mmss(3600 / t.desde)
    return a === b ? a + ' /km' : a + '–' + b + ' /km'
  }
  if (t.unidad === 'W') {
    const a = Math.round(t.desde), b = Math.round(t.hasta)
    return a === b ? a + ' W' : a + '–' + b + ' W'
  }
  if (t.unidad === 's/100') {
    return t.desde === t.hasta ? mmss(t.desde) + ' /100' : mmss(t.desde) + '–' + mmss(t.hasta) + ' /100'
  }
  /* Cualquier otra unidad la escribió el entrenador a mano: se enseña tal cual,
     sin intentar embellecerla. Interpretarla para adornarla es justo el paso
     donde se cuelan los números que mienten. */
  const n = (x: number) => (Math.round(x * 100) / 100).toString().replace('.', ',')
  return t.desde === t.hasta
    ? n(t.desde) + ' ' + t.unidad
    : n(t.desde) + '–' + n(t.hasta) + ' ' + t.unidad
}

// ------------------------------------------------------------
// Lo que se congela en la tarea
// ------------------------------------------------------------

export interface CopiaPrescrita extends CopiaZona {
  /** El % que se mandó, que puede ser más fino que el de la zona. */
  pctMin: number
  pctMax: number
  /** De qué referencia salió, para poder recalcular el ritmo al enseñarlo. */
  refId: string
  refEtiqueta: string
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
 * reescribiría el historial.
 */
export function copiaPrescrita(
  ref: Referencia | null,
  zona: ZonaOfrecida | null,
  pctMin: number | null,
  pctMax: number | null,
): CopiaPrescrita | null {
  if (!ref || !zona) return null
  const ini = rangoInicial(zona)
  const min = acotar(pctMin ?? ini?.[0] ?? null, zona.rango)
  const max = acotar(pctMax ?? ini?.[1] ?? null, zona.rango)
  if (min === null || max === null) return null

  return {
    sigla: zona.sigla, nombre: zona.nombre, color: zona.color,
    rpe: zona.rpe, nivel: zona.nivel,
    pctMin: Math.min(min, max), pctMax: Math.max(min, max),
    refId: ref.id, refEtiqueta: ref.etiqueta,
  }
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
  return {
    sigla,
    nombre: String(c.nombre ?? '').trim() || sigla,
    color: String(c.color ?? '') || '#6b7280',
    rpe: n(c.rpe), nivel: n(c.nivel),
    pctMin: n(c.pctMin), pctMax: n(c.pctMax),
    refId: String(c.refId ?? ''), refEtiqueta: String(c.refEtiqueta ?? ''),
  }
}

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
  if (!copia || !copia.refId) return ''
  const ref = buscarReferencia(referenciasDe(disciplina, tests, propios), copia.refId)
  return ref ? textoTramo(tramoDe(ref, copia.pctMin, copia.pctMax)) : ''
}

/** Si esta tarea cuelga de un test del entrenador y no de la referencia de la app. */
export const cuelgaDeTestPropio = (t: TareaConZona | null | undefined): boolean =>
  !!leerIdPropia(leerCopia(t?.zona_copia)?.refId || '')
