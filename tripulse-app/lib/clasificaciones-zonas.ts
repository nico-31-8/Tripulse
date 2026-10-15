// ============================================================
// TRIPULSE — Cómo le queda una clasificación a un deportista
// ============================================================
//
// UNA CLASIFICACIÓN SE ESCRIBE UNA VEZ Y SE LEE CON LOS NÚMEROS DE CADA UNO.
// «Del VT1 + 15 % al VT2 − 5 %» es una zona perfectamente razonable… hasta que
// llega alguien con el VT1 y el VT2 muy juntos: su VT1 + 15 % pasa su VT2 − 5 %
// y la zona le queda al revés. Con estos porcentajes pasa en cuanto el VT2 está
// menos de un 21 % por encima del VT1, que no es raro.
//
// LA APP AVISA Y NO ARREGLA NADA SOLA. Lo que hace este fichero es decir, para
// un atleta concreto: qué número sale en cada límite, qué zonas le quedan al
// revés, cuáles se pisan y dónde hay huecos. Y la escalera: cada zona en su
// carril sobre el mismo eje, que es como se ve de un vistazo.
//
// EL EJE ES DEL ESFUERZO, no del número. En km/h, vatios o pulsaciones, más es
// más fuerte; en un ritmo (s/100, un tiempo), menos es más fuerte. Para poder
// ordenar y pintar todas igual se trabaja con el esfuerzo: el número tal cual,
// o su inverso si la unidad es un tiempo. Y como los porcentajes son del
// esfuerzo (lib/referencia-propia), en ese eje un 10 % más es siempre la misma
// distancia, sea cual sea la unidad.

import { mmss } from './medicion'
import { aplicarPct, leerValor, unidadCanonica, type TestConMediciones } from './referencia-propia'
import { buscarHito, valorHito, type HitoDisponible, type TestsApp } from './hitos'
import type { Clasificacion, Limite, ZonaEntrenador } from './zonas-entrenador'
import { textoAbierto, textoPunto, textoTramo } from './prescripcion-zona'

/** Por encima de esta diferencia relativa, dos números son distintos. */
const EPS = 1e-6

const esfuerzo = (n: number, inverso: boolean): number => (inverso ? 1 / n : n)
const numeroDe = (x: number, inverso: boolean): number => (inverso ? 1 / x : x)
const mayor = (a: number, b: number) => a > b * (1 + EPS)

export interface HitoEvaluado {
  id: string
  /** Null = ya no existe (el test se archivó o es de otro deporte). */
  hito: HitoDisponible | null
  /** Lo que vale para este atleta. Null = no lo tiene medido. */
  valor: number | null
  fecha: string | null
}

export interface LimiteEvaluado extends Limite {
  /** «VT1». Vacío si el hito ya no existe. */
  corto: string
  /** El número en la unidad de la clasificación. Null = falta el dato. */
  numero: number | null
}

export type EstadoZona = 'ok' | 'reves' | 'sin-dato'

export interface ZonaEvaluada {
  zona: ZonaEntrenador
  desde: LimiteEvaluado | null
  hasta: LimiteEvaluado | null
  /** En esfuerzo. `null` = sin límite (o sin dato: mira `estado`). */
  lo: number | null
  hi: number | null
  estado: EstadoZona
  /** «5:00–4:21 /km», «más lento de 5:00 /km». Vacío sin dato. */
  texto: string
}

export interface Aviso {
  tipo: 'reves' | 'pisan' | 'hueco'
  siglas: string[]
  titulo: string
  detalle: string
}

export interface Evaluacion {
  unidad: string
  inverso: boolean
  hitos: HitoEvaluado[]
  zonas: ZonaEvaluada[]
  avisos: Aviso[]
  /** Los hitos que le faltan y que hacen falta para alguna zona («VO2máx»). */
  faltan: string[]
}

// ------------------------------------------------------------
// Textos
// ------------------------------------------------------------

const nEs = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',')

/** «su VT1», «su VT1 + 15 %», «tu VT2 − 5 %». */
export function hitoConPct(corto: string, pct: number, quien: 'su' | 'tu' = 'su'): string {
  const base = quien + ' ' + (corto || 'hito')
  const d = Math.round((Number(pct) - 100) * 10) / 10
  if (d === 0) return base
  return base + (d > 0 ? ' + ' : ' − ') + nEs(Math.abs(d)) + ' %'
}

/**
 * De dónde sale una zona, dicho para una persona: «entre su VT1 + 15 % y su
 * VT2 − 5 %», «por debajo de su VT1», «entre el 95 y el 105 % de su VT2».
 *
 * La misma frase para el entrenador («su») y para el atleta («tu»): lo que lee
 * cada uno es la misma regla, no dos parecidas.
 */
export function explicarLimites(
  desde: (Limite & { corto: string }) | null | undefined,
  hasta: (Limite & { corto: string }) | null | undefined,
  quien: 'su' | 'tu' = 'su',
): string {
  if (desde && hasta) {
    if (desde.ref === hasta.ref) {
      return desde.pct === hasta.pct
        ? 'al ' + nEs(desde.pct) + ' % de ' + quien + ' ' + (desde.corto || 'hito')
        : 'entre el ' + nEs(desde.pct) + ' y el ' + nEs(hasta.pct) + ' % de ' + quien + ' ' + (desde.corto || 'hito')
    }
    return 'entre ' + hitoConPct(desde.corto, desde.pct, quien) + ' y ' + hitoConPct(hasta.corto, hasta.pct, quien)
  }
  if (hasta) return 'por debajo de ' + hitoConPct(hasta.corto, hasta.pct, quien)
  if (desde) return 'por encima de ' + hitoConPct(desde.corto, desde.pct, quien)
  return ''
}

/** La primera en mayúscula, para cuando la frase va sola. */
export const mayuscula = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ------------------------------------------------------------
// Evaluar
// ------------------------------------------------------------

/**
 * La clasificación con los números de un atleta.
 *
 * `disponibles` son los hitos que existen para ese deporte (lib/hitos): de ahí
 * salen el nombre, la unidad y el sentido de cada uno.
 */
export function evaluar(
  c: Clasificacion,
  disponibles: HitoDisponible[],
  tests: TestsApp | null | undefined,
  propios: TestConMediciones[] | null | undefined,
): Evaluacion {
  const hitos: HitoEvaluado[] = c.hitos.map(id => {
    const hito = buscarHito(disponibles, id)
    const v = hito ? valorHito(id, tests, propios) : null
    return { id, hito, valor: v?.valor ?? null, fecha: v?.fecha ?? null }
  })
  const primero = hitos.find(h => h.hito)?.hito
  const unidad = primero?.unidad ?? ''
  const inverso = primero?.inverso ?? false

  const faltan = new Set<string>()
  const evaluarLimite = (l: Limite | null): LimiteEvaluado | null => {
    if (!l) return null
    const h = hitos.find(x => x.id === l.ref) ?? {
      id: l.ref, hito: buscarHito(disponibles, l.ref), valor: null, fecha: null,
    }
    const corto = h.hito?.corto ?? ''
    if (!h.hito) return { ...l, corto, numero: null }
    if (h.valor === null) { faltan.add(corto); return { ...l, corto, numero: null } }
    return { ...l, corto, numero: aplicarPct(h.valor, l.pct, h.hito.inverso) }
  }

  const zonas: ZonaEvaluada[] = c.zonas.map(zona => {
    const desde = evaluarLimite(zona.desde)
    const hasta = evaluarLimite(zona.hasta)
    const sinDato = (!desde && !hasta)
      || (!!desde && desde.numero === null) || (!!hasta && hasta.numero === null)
    if (sinDato) return { zona, desde, hasta, lo: null, hi: null, estado: 'sin-dato' as const, texto: '' }

    const lo = desde ? esfuerzo(desde.numero!, inverso) : null
    const hi = hasta ? esfuerzo(hasta.numero!, inverso) : null
    const reves = lo !== null && hi !== null && mayor(lo, hi)
    let texto = ''
    if (desde && hasta) {
      const a = desde.numero!, b = hasta.numero!
      texto = textoTramo({ desde: Math.min(a, b), hasta: Math.max(a, b), unidad, inverso })
    } else if (hasta) texto = textoAbierto(hasta.numero!, unidad, inverso, 'bajo')
    else if (desde) texto = textoAbierto(desde.numero!, unidad, inverso, 'alto')
    return { zona, desde, hasta, lo, hi, estado: reves ? 'reves' as const : 'ok' as const, texto }
  })

  return { unidad, inverso, hitos, zonas, avisos: avisosDe(zonas, unidad, inverso), faltan: [...faltan] }
}

/** Un tramo en esfuerzo, escrito en la unidad: «3:52–4:21 /km». */
function textoEntre(x1: number, x2: number, unidad: string, inverso: boolean): string {
  const a = numeroDe(x1, inverso), b = numeroDe(x2, inverso)
  return textoTramo({ desde: Math.min(a, b), hasta: Math.max(a, b), unidad, inverso })
}

/**
 * Lo que no encaja, en el orden en que se lee la escalera.
 *
 *   · AL REVÉS — el desde le sale más fuerte que el hasta.
 *   · SE PISAN — un tramo en el que le tocan dos zonas a la vez.
 *   · HUECO    — un tramo en el que no le toca ninguna.
 *
 * Una zona al revés no entra en las otras dos cuentas: no es un tramo, es un
 * error, y contarla también como «se pisa» diría dos veces lo mismo.
 */
function avisosDe(zonas: ZonaEvaluada[], unidad: string, inverso: boolean): Aviso[] {
  const out: Aviso[] = []

  for (const z of zonas) {
    if (z.estado !== 'reves') continue
    const d = z.desde!, h = z.hasta!
    out.push({
      tipo: 'reves', siglas: [z.zona.sigla],
      titulo: (z.zona.sigla || 'Una zona') + ' le queda al revés',
      detalle: 'Empieza en ' + hitoConPct(d.corto, d.pct) + ' (' + textoPunto(d.numero!, unidad)
        + ') y acaba en ' + hitoConPct(h.corto, h.pct) + ' (' + textoPunto(h.numero!, unidad)
        + '): el principio va más fuerte que el final.',
    })
  }

  const buenas = zonas.filter(z => z.estado === 'ok')
  const lo = (z: ZonaEvaluada) => z.lo ?? -Infinity
  const hi = (z: ZonaEvaluada) => z.hi ?? Infinity

  for (let i = 0; i < buenas.length; i++) {
    for (let j = i + 1; j < buenas.length; j++) {
      const a = buenas[i], b = buenas[j]
      const ini = Math.max(lo(a), lo(b)), fin = Math.min(hi(a), hi(b))
      if (!(fin > ini) || !mayor(fin, ini)) continue
      /* Un tramo sin final (las dos sin techo, o sin suelo) no se puede
         escribir con números: se dice con palabras. */
      const rango = Number.isFinite(ini) && Number.isFinite(fin)
        ? 'En ' + textoEntre(ini, fin, unidad, inverso) + ' le tocan las dos.'
        : 'Las dos siguen sin límite hacia el mismo lado, así que se pisan siempre.'
      out.push({
        tipo: 'pisan', siglas: [a.zona.sigla, b.zona.sigla],
        titulo: a.zona.sigla + ' y ' + b.zona.sigla + ' se pisan',
        detalle: rango,
      })
    }
  }

  /* Los huecos: se recorren de menos a más fuerte llevando hasta dónde llega lo
     cubierto. Lo que empieza más allá deja un tramo sin zona. */
  const orden = [...buenas].sort((a, b) => lo(a) - lo(b))
  let hasta = -Infinity
  let quien: ZonaEvaluada | null = null
  for (const z of orden) {
    if (quien && Number.isFinite(hasta) && z.lo !== null && mayor(z.lo, hasta)) {
      out.push({
        tipo: 'hueco', siglas: [quien.zona.sigla, z.zona.sigla],
        titulo: 'Entre ' + quien.zona.sigla + ' y ' + z.zona.sigla + ' hay un hueco',
        detalle: 'En ' + textoEntre(hasta, z.lo, unidad, inverso) + ' no le toca ninguna zona.',
      })
    }
    if (hi(z) > hasta) { hasta = hi(z); quien = z }
    if (!Number.isFinite(hasta)) break
  }

  return out
}

/** Los avisos que tocan a una zona: para marcarla con ⚠ donde se elige. */
export const avisosDeZona = (ev: Evaluacion | null | undefined, sigla: string): Aviso[] =>
  (ev?.avisos || []).filter(a => a.siglas.includes(sigla))

// ------------------------------------------------------------
// La escalera
// ------------------------------------------------------------

export interface Carril {
  sigla: string
  nombre: string
  color: string
  /** Dónde empieza y cuánto ocupa, en % del ancho. */
  izq: number
  ancho: number
  /** Sin suelo o sin techo: se pinta difuminado hacia el borde. */
  abiertoIzq: boolean
  abiertoDer: boolean
  estado: EstadoZona
  /** Se pisa con otra: se le marca el borde. */
  pisada: boolean
}

export interface Marca { id: string; corto: string; pos: number }
export interface Tick { pos: number; arriba: string; abajo: string }

export interface Escalera {
  carriles: Carril[]
  marcas: Marca[]
  ticks: Tick[]
  leyenda: string
}

/** Un paso «redondo» cercano a `bruto`: 1, 2, 2,5 o 5 por una potencia de 10. */
function pasoRedondo(bruto: number): number {
  if (!(bruto > 0) || !Number.isFinite(bruto)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(bruto)))
  return [1, 2, 2.5, 5, 10].map(k => k * p)
    .reduce((m, c) => (Math.abs(Math.log(c / bruto)) < Math.abs(Math.log(m / bruto)) ? c : m))
}

/* Con la unidad como la entiende la app: un «Km/h» escrito a mano también se
   lee como ritmo (lib/referencia-propia, `unidadCanonica`). */
function etiquetaTick(n: number, unidad: string): { arriba: string; abajo: string } {
  const u = unidadCanonica(unidad)
  if (u === 'km/h') return { arriba: mmss(3600 / n), abajo: nEs(n) }
  if (u === 'W') return { arriba: String(Math.round(n)), abajo: '' }
  if (u === 's/100') return { arriba: mmss(n), abajo: '' }
  return { arriba: leerValor(n, unidad, true), abajo: '' }
}

const LEYENDA: Record<string, string> = {
  'km/h': 'Ritmo en min/km arriba y km/h debajo.',
  W: 'En vatios.',
  's/100': 'Ritmo en el 100.',
}

/**
 * Cada zona en su carril, todas sobre el mismo eje, con los hitos marcados.
 * `null` si no hay ni un número que pintar.
 */
export function escalera(ev: Evaluacion): Escalera | null {
  const xs: number[] = []
  for (const z of ev.zonas) {
    if (z.estado === 'sin-dato') continue
    if (z.lo !== null) xs.push(z.lo)
    if (z.hi !== null) xs.push(z.hi)
  }
  for (const h of ev.hitos) if (h.hito && h.valor !== null) xs.push(esfuerzo(h.valor, ev.inverso))
  const finitos = xs.filter(x => Number.isFinite(x) && x > 0)
  if (!finitos.length) return null

  let min = Math.min(...finitos), max = Math.max(...finitos)
  const span = max - min > 0 ? max - min : max * 0.2
  const abiertaAbajo = ev.zonas.some(z => z.estado !== 'sin-dato' && z.lo === null)
  const abiertaArriba = ev.zonas.some(z => z.estado !== 'sin-dato' && z.hi === null)
  /* Lo que no tiene suelo o techo necesita sitio para que se vea que sigue. */
  min -= span * (abiertaAbajo ? 0.18 : 0.05)
  max += span * (abiertaArriba ? 0.18 : 0.05)
  if (min <= 0) min = Math.min(...finitos) * 0.5
  const pos = (x: number) => ((x - min) / (max - min)) * 100

  const pisadas = new Set(ev.avisos.filter(a => a.tipo === 'pisan').flatMap(a => a.siglas))
  const carriles: Carril[] = ev.zonas.map(z => {
    const base = { sigla: z.zona.sigla, nombre: z.zona.nombre, color: z.zona.color, estado: z.estado, pisada: pisadas.has(z.zona.sigla) }
    if (z.estado === 'sin-dato') return { ...base, izq: 0, ancho: 0, abiertoIzq: false, abiertoDer: false }
    const a = z.lo ?? min, b = z.hi ?? max
    const izq = pos(Math.min(a, b)), der = pos(Math.max(a, b))
    return { ...base, izq, ancho: Math.max(0.6, der - izq), abiertoIzq: z.lo === null, abiertoDer: z.hi === null }
  })

  const marcas: Marca[] = ev.hitos
    .filter(h => h.hito && h.valor !== null)
    .map(h => ({ id: h.id, corto: h.hito!.corto, pos: pos(esfuerzo(h.valor!, ev.inverso)) }))

  /* Las marcas del eje, en números «redondos» DE LA UNIDAD que se lee: km/h
     enteros, segundos de 5 en 5… En un ritmo eso no cae a distancias iguales
     en el eje del esfuerzo, y está bien: es el eje el que es lineal. */
  const ticks: Tick[] = []
  const nA = numeroDe(ev.inverso ? max : min, ev.inverso)
  const nB = numeroDe(ev.inverso ? min : max, ev.inverso)
  const paso = pasoRedondo((nB - nA) / 8)
  for (let n = Math.ceil(nA / paso) * paso, k = 0; n <= nB + paso * EPS && k < 14; n += paso, k++) {
    const p = pos(esfuerzo(n, ev.inverso))
    if (p < -0.5 || p > 100.5) continue
    ticks.push({ pos: Math.min(100, Math.max(0, p)), ...etiquetaTick(n, ev.unidad) })
  }
  /* En un ritmo se recorren de más rápido a más lento, que en el eje es de
     derecha a izquierda: se dejan siempre de izquierda a derecha. */
  ticks.sort((a, b) => a.pos - b.pos)

  return {
    carriles, marcas, ticks,
    leyenda: LEYENDA[unidadCanonica(ev.unidad)] ?? (ev.unidad ? 'En ' + ev.unidad + '.' : ''),
  }
}
