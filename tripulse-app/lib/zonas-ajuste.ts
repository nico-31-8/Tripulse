// ============================================================
// TRIPULSE — Los porcentajes de una zona para un deportista
// ============================================================
//
// UNA CLASIFICACIÓN ES UNA PLANTILLA. Sus porcentajes valen para todos, y el
// entrenador puede corregirlos para una persona arrastrando las fronteras de su
// escalera (o escribiendo el número). Se guarda en `zona_ajuste`, una fila por
// zona y deportista, y se aplica AL PRESCRIBIR: la tarea congela su copia con
// los porcentajes de esa persona, y todo lo demás —la ficha, el modo entreno,
// sus ritmos— sale de esa copia sin enterarse. Lo ya mandado no cambia.
//
// SOLO LOS PORCENTAJES (decidido con el usuario el 20-10-2026). El hito es el
// de la plantilla; el ajuste lo guarda solo para comprobarlo. Si la zona cambia
// de hito, ese límite deja de aplicarse, en vez de colgar un 92,5 % de un hito
// que no era.
//
// LAS FRONTERAS SE MUEVEN JUNTAS. Si una zona acaba justo donde empieza la
// siguiente (mismo hito y mismo % en la plantilla), es UNA frontera de las dos:
// al moverla, las dos zonas se mueven a la vez y no quedan huecos ni pisadas. Y
// ninguna zona puede quedar del revés: lo que acaba no pasa de donde empieza.
//
// Sin Supabase: todo lo de aquí se prueba con datos a mano.

import { leerLimite, type Clasificacion, type Limite, type ZonaEntrenador } from './zonas-entrenador'
import type { Evaluacion } from './clasificaciones-zonas'
import { esCopiaDeLimites, type CopiaPrescrita, type LimiteCopia } from './prescripcion-zona'

export type Lado = 'desde' | 'hasta'

/** Lo que un deportista tiene guardado para una zona. `null` en un límite = el de la plantilla. */
export interface AjusteZona {
  idZona: number
  desde: Limite | null
  hasta: Limite | null
}

/** Lo que se está editando: el % de cada límite que se ha movido, por id de zona. */
export type Borrador = Record<number, { desde?: number; hasta?: number }>

/** Al arrastrar, de medio en medio punto. Escribiendo, de décima en décima. */
export const PASO_ARRASTRE = 0.5
export const PASO_ESCRITO = 0.1

const redondear = (n: number, paso: number) => Math.round(n / paso) * paso
/** Sin los decimales de coma flotante: 92.50000000001 → 92.5. */
const limpio = (n: number) => Math.round(n * 1000) / 1000

// ------------------------------------------------------------
// Leer y aplicar lo guardado
// ------------------------------------------------------------

type FilaBase = Record<string, unknown>

/** Las filas de `zona_ajuste` de un deportista, por zona. */
export function leerAjustes(filas: FilaBase[] | null | undefined): Map<number, AjusteZona> {
  const out = new Map<number, AjusteZona>()
  for (const f of filas || []) {
    const id = Number(f?.id_zona)
    if (!(id > 0)) continue
    const desde = leerLimite(f?.desde), hasta = leerLimite(f?.hasta)
    if (!desde && !hasta) continue
    out.set(id, { idZona: id, desde, hasta })
  }
  return out
}

/** Las de varios deportistas: deportista → zona → ajuste. */
export function leerAjustesDeVarios(filas: FilaBase[] | null | undefined): Map<number, Map<number, AjusteZona>> {
  const out = new Map<number, Map<number, AjusteZona>>()
  for (const f of filas || []) {
    const dep = Number(f?.id_deportista)
    if (!(dep > 0)) continue
    const una = leerAjustes([f])
    if (!una.size) continue
    const suyas = out.get(dep) || new Map<number, AjusteZona>()
    for (const [k, v] of una) suyas.set(k, v)
    out.set(dep, suyas)
  }
  return out
}

/** El límite que vale para esa persona: el suyo si cuelga del mismo hito; si no, el de la plantilla. */
export function limiteAjustado(plantilla: Limite | null, suyo: Limite | null | undefined): Limite | null {
  if (!plantilla) return null
  if (!suyo || suyo.ref !== plantilla.ref || !(Number(suyo.pct) > 0)) return plantilla
  return { ref: plantilla.ref, pct: Number(suyo.pct) }
}

/** La zona con los porcentajes de esa persona. Sin nada suyo, la misma zona. */
export function zonaAjustada(z: ZonaEntrenador, a: AjusteZona | null | undefined): ZonaEntrenador {
  if (!a) return z
  const desde = limiteAjustado(z.desde, a.desde)
  const hasta = limiteAjustado(z.hasta, a.hasta)
  if (desde?.pct === z.desde?.pct && hasta?.pct === z.hasta?.pct) return z
  return { ...z, desde, hasta }
}

/** Si esa zona, para esa persona, no es la de la plantilla. */
export const zonaEstaAjustada = (z: ZonaEntrenador, a: AjusteZona | null | undefined): boolean =>
  zonaAjustada(z, a) !== z

/** La clasificación con los porcentajes de esa persona. Sin nada suyo, la misma. */
export function clasificacionAjustada(c: Clasificacion, ajustes: Map<number, AjusteZona> | null | undefined): Clasificacion {
  if (!ajustes || !ajustes.size) return c
  let cambia = false
  const zonas = c.zonas.map(z => {
    const x = z.id ? zonaAjustada(z, ajustes.get(z.id)) : z
    if (x !== z) cambia = true
    return x
  })
  return cambia ? { ...c, zonas } : c
}

export const clasificacionesAjustadas = (
  cs: Clasificacion[] | null | undefined, ajustes: Map<number, AjusteZona> | null | undefined,
): Clasificacion[] => (cs || []).map(c => clasificacionAjustada(c, ajustes))

// ------------------------------------------------------------
// El borrador: lo que se está moviendo
// ------------------------------------------------------------

/** El borrador que sale de lo guardado: solo lo que de verdad le aplica (mismo hito, otro %). */
export function borradorDe(cs: Clasificacion[] | null | undefined, ajustes: Map<number, AjusteZona> | null | undefined): Borrador {
  const b: Borrador = {}
  for (const c of cs || []) {
    for (const z of c.zonas) {
      if (!z.id) continue
      const x = zonaAjustada(z, ajustes?.get(z.id))
      if (x === z) continue
      const e: { desde?: number; hasta?: number } = {}
      if (x.desde && z.desde && x.desde.pct !== z.desde.pct) e.desde = x.desde.pct
      if (x.hasta && z.hasta && x.hasta.pct !== z.hasta.pct) e.hasta = x.hasta.pct
      if (e.desde !== undefined || e.hasta !== undefined) b[z.id] = e
    }
  }
  return b
}

/** Lo que dice un borrador, como ajustes: para pintar la escalera con él. */
export function ajustesDeBorrador(b: Borrador, cs: Clasificacion[] | null | undefined): Map<number, AjusteZona> {
  const out = new Map<number, AjusteZona>()
  for (const c of cs || []) {
    for (const z of c.zonas) {
      const e = z.id ? b[z.id] : undefined
      if (!z.id || !e) continue
      out.set(z.id, {
        idZona: z.id,
        desde: z.desde && e.desde != null ? { ref: z.desde.ref, pct: e.desde } : null,
        hasta: z.hasta && e.hasta != null ? { ref: z.hasta.ref, pct: e.hasta } : null,
      })
    }
  }
  return out
}

/** Si dos borradores dicen lo mismo. */
export function mismoBorrador(a: Borrador, b: Borrador): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of ids) {
    const x = a[Number(k)] || {}, y = b[Number(k)] || {}
    if (x.desde !== y.desde || x.hasta !== y.hasta) return false
  }
  return true
}

export const zonasAjustadasEn = (b: Borrador): number => Object.keys(b).length

// ------------------------------------------------------------
// Las fronteras de la escalera
// ------------------------------------------------------------

export interface Clave { idZona: number; lado: Lado }

export interface Frontera {
  /** Una (un borde suelto) o dos (donde una zona acaba y empieza la siguiente). */
  claves: Clave[]
  /** El hito del que cuelga: es el mismo en las dos zonas que la comparten. */
  ref: string
  /** «AER | TEMPO», «Empieza UMB», «Acaba ANA». */
  nombre: string
}

/** Dos números iguales salvo una millonésima: lo mismo que mira la escalera para avisar de huecos. */
const igual = (x: number, y: number) => Math.abs(x - y) <= Math.max(Math.abs(x), Math.abs(y)) * 1e-6
/** Un % calculado desde otro hito: con decimales de sobra para caer donde el otro (92,5 → 94,838710). */
const fino = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * Las fronteras de una clasificación, en el orden de sus zonas, PARA ESA
 * PERSONA: dos zonas comparten frontera si una acaba justo donde empieza la
 * siguiente con sus porcentajes (`b`; sin él, los de la plantilla). Con sus
 * números (`ev`), también si los dos límites cuelgan de hitos distintos pero
 * caen en el mismo punto. Así, dos zonas que la plantilla dejaba separadas
 * (N2 acaba en el 115 % y N3 empieza en el 116 %) se pueden JUNTAR, y desde
 * entonces se mueven a la vez.
 *
 * Solo las zonas guardadas (con id): una zona nueva aún no se puede ajustar a
 * nadie.
 */
export function fronterasDe(c: Clasificacion, b: Borrador = {}, ev?: Evaluacion | null): Frontera[] {
  const out: Frontera[] = []
  const zs = c.zonas
  const juntas = (a: ZonaEntrenador | undefined, s: ZonaEntrenador | undefined): boolean => {
    if (!a?.id || !s?.id || !a.hasta || !s.desde) return false
    const pa = pctDe(c, b, { idZona: a.id, lado: 'hasta' }), ps = pctDe(c, b, { idZona: s.id, lado: 'desde' })
    if (pa === null || ps === null) return false
    if (a.hasta.ref === s.desde.ref) return igual(pa, ps)
    const ea = ev ? esfuerzoDeHito(ev, a.hasta.ref) : null, es = ev ? esfuerzoDeHito(ev, s.desde.ref) : null
    return ea !== null && es !== null && igual(ea * pa, es * ps)
  }
  zs.forEach((z, i) => {
    if (!z.id) return
    if (z.desde && !juntas(zs[i - 1], z)) {
      out.push({ claves: [{ idZona: z.id, lado: 'desde' }], ref: z.desde.ref, nombre: 'Empieza ' + z.sigla })
    }
    if (z.hasta) {
      const sig = zs[i + 1]
      out.push(juntas(z, sig)
        ? { claves: [{ idZona: z.id, lado: 'hasta' }, { idZona: sig.id!, lado: 'desde' }], ref: z.hasta.ref, nombre: z.sigla + ' | ' + sig.sigla }
        : { claves: [{ idZona: z.id, lado: 'hasta' }], ref: z.hasta.ref, nombre: 'Acaba ' + z.sigla })
    }
  })
  return out
}

const zonaDe = (c: Clasificacion, id: number) => c.zonas.find(z => z.id === id)

/** El % de un límite para esa persona: el del borrador o el de la plantilla. `null` = sin ese límite. */
export function pctDe(c: Clasificacion, b: Borrador, k: Clave): number | null {
  const l = zonaDe(c, k.idZona)?.[k.lado]
  if (!l) return null
  return b[k.idZona]?.[k.lado] ?? l.pct
}

/** Si esa frontera, para esa persona, no está donde dice la plantilla. */
export const fronteraMovida = (b: Borrador, f: Frontera): boolean =>
  f.claves.some(k => b[k.idZona]?.[k.lado] !== undefined)

/** Lo que vale un hito para esa persona en el eje del esfuerzo. `null` si no lo tiene medido. */
export function esfuerzoDeHito(ev: Evaluacion, ref: string): number | null {
  const h = ev.hitos.find(x => x.id === ref)
  if (!h?.hito || h.valor === null || !(h.valor > 0)) return null
  return h.hito.inverso ? 1 / h.valor : h.valor
}

/** Dónde cae esa frontera para esa persona, en el eje del esfuerzo. */
export function esfuerzoDeFrontera(c: Clasificacion, b: Borrador, f: Frontera, ev: Evaluacion): number | null {
  const E = esfuerzoDeHito(ev, f.ref)
  const p = pctDe(c, b, f.claves[0])
  return E === null || p === null ? null : (E * p) / 100
}

/**
 * Mueve una frontera a un % de su hito (el de su primer límite), sin dejar
 * ninguna de sus zonas del revés: el final de una zona no puede pasar de su
 * principio, ni al revés. Cruzar otras zonas sí se puede: si quedan pisadas o
 * con hueco, la escalera lo avisa, como con la plantilla.
 *
 * El % va de `paso` en `paso`, salvo `exacto`: al pegarse al borde de la zona
 * de al lado, que puede no caer en ese paso. Una frontera entre dos hitos (dos
 * zonas juntadas) lleva en cada límite el % de SU hito que cae en ese punto.
 *
 * Lo que vuelve al % de la plantilla deja de contar como ajuste. Devuelve el
 * borrador nuevo (el de entrada no se toca) y el % con el que se quedó.
 */
export function moverFrontera(
  c: Clasificacion, f: Frontera, pct: number, b: Borrador, ev: Evaluacion, paso = PASO_ARRASTRE, exacto = false,
): { borrador: Borrador; pct: number } {
  const actual = pctDe(c, b, f.claves[0])
  const E = esfuerzoDeHito(ev, f.ref)
  if (actual === null || E === null || !Number.isFinite(pct)) return { borrador: b, pct: actual ?? pct }

  /* Lo que la sujeta: el otro extremo de cada zona que la usa. */
  let lo = paso, hi = Infinity
  for (const k of f.claves) {
    const otro: Lado = k.lado === 'desde' ? 'hasta' : 'desde'
    const l = zonaDe(c, k.idZona)?.[otro]
    if (!l) continue
    const Eo = esfuerzoDeHito(ev, l.ref)
    const po = pctDe(c, b, { idZona: k.idZona, lado: otro })
    if (Eo === null || po === null) continue
    const enEsteHito = ((Eo * po) / 100 / E) * 100
    if (k.lado === 'hasta') lo = Math.max(lo, enEsteHito + paso)
    else hi = Math.min(hi, enEsteHito - paso)
  }
  const pLo = exacto ? lo : Math.ceil(lo / paso - 1e-9) * paso
  const pHi = exacto ? hi : Number.isFinite(hi) ? Math.floor(hi / paso + 1e-9) * paso : Infinity
  if (pLo > pHi) return { borrador: b, pct: actual }
  const p = exacto
    ? fino(Math.min(pHi, Math.max(pLo, pct)))
    : limpio(Math.min(pHi, Math.max(pLo, redondear(pct, paso))))

  const nuevo: Borrador = { ...b }
  for (const k of f.claves) {
    const lim = zonaDe(c, k.idZona)?.[k.lado]
    if (!lim) continue
    /* En SU hito, el mismo punto del eje. */
    const Ek = lim.ref === f.ref ? E : esfuerzoDeHito(ev, lim.ref)
    if (Ek === null) continue
    const pk = lim.ref === f.ref ? p : fino((p * E) / Ek)
    const e = { ...(nuevo[k.idZona] || {}) }
    if (igual(lim.pct, pk)) delete e[k.lado]
    else e[k.lado] = pk
    if (e.desde === undefined && e.hasta === undefined) delete nuevo[k.idZona]
    else nuevo[k.idZona] = e
  }
  return { borrador: nuevo, pct: p }
}

/**
 * Dónde se pega una frontera al arrastrarla, en el eje del esfuerzo: el borde
 * de la zona de al lado que no es suyo (el final de la anterior, el principio
 * de la siguiente). Soltada ahí, las dos zonas quedan juntas —donde acaba una
 * empieza la otra— y desde entonces se mueven a la vez (`fronterasDe`).
 */
export function imanes(c: Clasificacion, b: Borrador, f: Frontera, ev: Evaluacion): number[] {
  const suyas = new Set(f.claves.map(k => k.idZona + k.lado))
  const out: number[] = []
  for (const k of f.claves) {
    const i = c.zonas.findIndex(z => z.id === k.idZona)
    const vecina = c.zonas[k.lado === 'hasta' ? i + 1 : i - 1]
    const lado: Lado = k.lado === 'hasta' ? 'desde' : 'hasta'
    const l = vecina?.id ? vecina[lado] : null
    if (!vecina?.id || !l || suyas.has(vecina.id + lado)) continue
    const E = esfuerzoDeHito(ev, l.ref)
    const p = pctDe(c, b, { idZona: vecina.id, lado })
    if (E !== null && p !== null) out.push((E * p) / 100)
  }
  return out
}

/**
 * Arrastrar una frontera hasta un punto del eje. A menos de `radio` (en el eje
 * del esfuerzo) del borde de una zona de al lado, se PEGA a él, exacto.
 */
export function arrastrarFrontera(
  c: Clasificacion, f: Frontera, esfuerzo: number, b: Borrador, ev: Evaluacion, radio = 0,
): Borrador {
  const E = esfuerzoDeHito(ev, f.ref)
  if (E === null || !Number.isFinite(esfuerzo)) return b
  let iman: number | null = null
  for (const x of imanes(c, b, f, ev)) {
    const d = Math.abs(x - esfuerzo)
    if (d <= radio && (iman === null || d < Math.abs(iman - esfuerzo))) iman = x
  }
  return moverFrontera(c, f, ((iman ?? esfuerzo) / E) * 100, b, ev, PASO_ARRASTRE, iman !== null).borrador
}

/** Un borde de una zona, solo: para mover un lado de una frontera sin el otro. */
const bordeSuelto = (c: Clasificacion, idZona: number, lado: Lado): Frontera | null => {
  const l = zonaDe(c, idZona)?.[lado]
  return l ? { claves: [{ idZona, lado }], ref: l.ref, nombre: '' } : null
}

/** Dónde cae un límite para esa persona, en el eje del esfuerzo. */
const esfuerzoDeLimite = (c: Clasificacion, b: Borrador, ev: Evaluacion, idZona: number, lado: Lado): number | null => {
  const l = zonaDe(c, idZona)?.[lado]
  const p = pctDe(c, b, { idZona, lado })
  const E = l ? esfuerzoDeHito(ev, l.ref) : null
  return E === null || p === null ? null : (E * p) / 100
}

/** Si una zona empieza justo donde acaba la anterior: comparten frontera, para esa persona. */
export function pegadas(c: Clasificacion, b: Borrador, ev: Evaluacion, idAnterior: number, idSiguiente: number): boolean {
  return fronterasDe(c, b, ev).some(f => f.claves.length === 2
    && f.claves[0].idZona === idAnterior && f.claves[1].idZona === idSiguiente)
}

/**
 * PEGAR una zona a la anterior: que empiece justo donde acaba la otra, y desde
 * entonces se muevan juntas. Se mueve su principio; si no puede (la zona
 * quedaría del revés), el final de la anterior. Si tampoco, nada.
 */
export function pegarZonas(c: Clasificacion, b: Borrador, ev: Evaluacion, idAnterior: number, idSiguiente: number): Borrador {
  if (pegadas(c, b, ev, idAnterior, idSiguiente)) return b
  const intentos: [number, Lado, number, Lado][] = [[idSiguiente, 'desde', idAnterior, 'hasta'], [idAnterior, 'hasta', idSiguiente, 'desde']]
  for (const [id, lado, idOtro, ladoOtro] of intentos) {
    const f = bordeSuelto(c, id, lado)
    const destino = esfuerzoDeLimite(c, b, ev, idOtro, ladoOtro)
    const E = f ? esfuerzoDeHito(ev, f.ref) : null
    if (!f || destino === null || E === null) continue
    const nuevo = moverFrontera(c, f, (destino / E) * 100, b, ev, PASO_ARRASTRE, true).borrador
    if (pegadas(c, nuevo, ev, idAnterior, idSiguiente)) return nuevo
  }
  return b
}

/**
 * SEPARAR dos zonas pegadas. Para que sean dos asas tienen que estar en sitios
 * distintos: la siguiente empieza medio punto después (y si no puede, la
 * anterior acaba medio punto antes). Desde ahí, cada una se arrastra por su
 * lado; soltándola otra vez cerca, se vuelven a pegar.
 */
export function separarZonas(c: Clasificacion, b: Borrador, ev: Evaluacion, idAnterior: number, idSiguiente: number): Borrador {
  if (!pegadas(c, b, ev, idAnterior, idSiguiente)) return b
  const intentos: [number, Lado, 1 | -1][] = [[idSiguiente, 'desde', 1], [idAnterior, 'hasta', -1]]
  for (const [id, lado, dir] of intentos) {
    const f = bordeSuelto(c, id, lado)
    const p = pctDe(c, b, { idZona: id, lado })
    if (!f || p === null) continue
    const nuevo = moverFrontera(c, f, p + dir * PASO_ARRASTRE, b, ev).borrador
    if (!pegadas(c, nuevo, ev, idAnterior, idSiguiente)) return nuevo
  }
  return b
}

/**
 * Escribir a mano el % de un límite, en SU hito. En una frontera entre dos
 * hitos (N4 acaba en el VT2 y N5 empieza en el VO2), el otro límite se va al
 * mismo punto con el % del suyo.
 */
export function escribirLimite(
  c: Clasificacion, f: Frontera, k: Clave, pct: number, b: Borrador, ev: Evaluacion,
): Borrador {
  const lim = zonaDe(c, k.idZona)?.[k.lado]
  if (!lim) return b
  if (lim.ref === f.ref) return moverFrontera(c, f, pct, b, ev, PASO_ESCRITO).borrador
  const Ek = esfuerzoDeHito(ev, lim.ref), E = esfuerzoDeHito(ev, f.ref)
  if (Ek === null || E === null) return b
  return moverFrontera(c, f, (pct * Ek) / E, b, ev, PASO_ESCRITO, true).borrador
}

/**
 * Un paso con el teclado (`grande`, con Mayúsculas). Si por el camino está el
 * borde de la zona de al lado, se para en él: también con las flechas se
 * juntan dos zonas.
 */
export function pasoFrontera(
  c: Clasificacion, f: Frontera, direccion: 1 | -1, grande: boolean, b: Borrador, ev: Evaluacion,
): Borrador {
  const p = pctDe(c, b, f.claves[0])
  const E = esfuerzoDeHito(ev, f.ref)
  if (p === null || E === null) return b
  const destino = p + direccion * (grande ? 2.5 : PASO_ARRASTRE)
  const enMedio = imanes(c, b, f, ev).map(x => (x / E) * 100)
    .filter(x => (direccion > 0 ? x > p && x < destino : x < p && x > destino) && !igual(x, p) && !igual(x, destino))
  if (enMedio.length) {
    const x = direccion > 0 ? Math.min(...enMedio) : Math.max(...enMedio)
    return moverFrontera(c, f, x, b, ev, PASO_ARRASTRE, true).borrador
  }
  return moverFrontera(c, f, destino, b, ev, PASO_ARRASTRE).borrador
}

/**
 * Una zona vuelta a la plantilla. Sus fronteras compartidas también vuelven en
 * la zona vecina: si no, la vecina se quedaría con un borde donde ya no hay
 * nada y abriría un hueco. Con `ev`, también las que se juntaron para esa
 * persona (ver `fronterasDe`).
 */
export function zonaALaPlantilla(c: Clasificacion, b: Borrador, idZona: number, ev?: Evaluacion | null): Borrador {
  const nuevo: Borrador = { ...b }
  for (const f of fronterasDe(c, b, ev)) {
    if (!f.claves.some(k => k.idZona === idZona)) continue
    for (const k of f.claves) {
      const e = { ...(nuevo[k.idZona] || {}) }
      delete e[k.lado]
      if (e.desde === undefined && e.hasta === undefined) delete nuevo[k.idZona]
      else nuevo[k.idZona] = e
    }
  }
  return nuevo
}

// ------------------------------------------------------------
// Guardar
// ------------------------------------------------------------

export interface FilaAjuste {
  id_zona: number
  id_deportista: number
  desde: Limite | null
  hasta: Limite | null
  ajustado_en: string
}

/**
 * Lo que se escribe al guardar para un deportista: una fila por zona con algún
 * límite distinto del de la plantilla (y solo ese límite), y las zonas que
 * vuelven a la plantilla, que se BORRAN: una fila sin ningún límite no dice
 * nada, y la base no la deja guardar.
 */
export function ajustesParaGuardar(
  cs: Clasificacion[] | null | undefined, b: Borrador, idDeportista: number,
  guardadas: Iterable<number>, ahora: string,
): { filas: FilaAjuste[]; borrar: number[] } {
  const yaHay = new Set(guardadas)
  const filas: FilaAjuste[] = []
  const borrar: number[] = []
  for (const c of cs || []) {
    for (const z of c.zonas) {
      if (!z.id) continue
      const e = b[z.id]
      const desde = z.desde && e?.desde != null && e.desde !== z.desde.pct ? { ref: z.desde.ref, pct: e.desde } : null
      const hasta = z.hasta && e?.hasta != null && e.hasta !== z.hasta.pct ? { ref: z.hasta.ref, pct: e.hasta } : null
      if (desde || hasta) filas.push({ id_zona: z.id, id_deportista: idDeportista, desde, hasta, ajustado_en: ahora })
      else if (yaHay.has(z.id)) borrar.push(z.id)
    }
  }
  return { filas, borrar }
}

// ------------------------------------------------------------
// Asas que se tapan
// ------------------------------------------------------------

/**
 * De varias asas en el mismo sitio, la que se coge al tirar hacia un lado.
 *
 * DOS FRONTERAS PUEDEN QUEDAR UNA ENCIMA DE OTRA: el principio y el final de
 * una zona que se ha quedado casi sin anchura, o una zona de la plantilla que
 * va del 100 % al 100 %. La de encima taparía siempre a la otra, y como no
 * puede pasar por encima de ella (la zona quedaría del revés), parecía que no
 * se podía mover ninguna. Hacia la izquierda se coge la primera en el orden de
 * la escalera, que es la que empieza la zona; hacia la derecha, la última, que
 * es la que la acaba.
 */
export function asaHacia(bajo: number[], direccion: 1 | -1): number | null {
  if (!bajo.length) return null
  return direccion < 0 ? Math.min(...bajo) : Math.max(...bajo)
}

// ------------------------------------------------------------
// Deshacer
// ------------------------------------------------------------

/** Cuántos pasos atrás se guardan. */
export const PASOS_DESHACER = 100

/**
 * El borrador con lo necesario para deshacer (pedido el 20-10-2026: «que se
 * pueda pulsar las veces que haga falta y actúe como Ctrl+Z»).
 *
 * Cada paso atrás es un borrador ENTERO, nunca `null` («igual que lo
 * guardado»): así también se deshace después de guardar, y lo deshecho vuelve
 * a contar como cambio sin guardar.
 */
export interface Historial {
  /** `null` = igual que lo guardado. */
  borrador: Borrador | null
  /** Cómo estaba antes de cada cambio; el último, al final. */
  atras: Borrador[]
  /** El grupo del último cambio: los seguidos del mismo grupo son UN paso. */
  grupo: string | null
  /** La clasificación en la que se hicieron: solo se deshace desde ella. */
  clasif: number | null
}

export const HISTORIAL_VACIO: Historial = { borrador: null, atras: [], grupo: null, clasif: null }

export type AccionHistorial =
  /* `grupo`: un arrastre entero, o lo que se escribe en una casilla cifra a
     cifra, es un solo paso. Sin grupo (una flecha, un «↺ General»), cada
     cambio es su propio paso. `base` es lo guardado. */
  | { tipo: 'cambiar'; hacer: (b: Borrador) => Borrador; base: Borrador; grupo: string | null; clasif: number }
  | { tipo: 'deshacer'; clasif: number }
  /* Lo de ahora pasa a ser lo guardado; lo de atrás sigue ahí. */
  | { tipo: 'guardado' }
  /* Otro deportista: de cero. */
  | { tipo: 'empezar' }

export const puedeDeshacer = (h: Historial, clasif: number | null | undefined): boolean =>
  clasif != null && h.clasif === clasif && h.atras.length > 0

export function historial(h: Historial, a: AccionHistorial): Historial {
  switch (a.tipo) {
    case 'empezar':
      return HISTORIAL_VACIO
    case 'guardado':
      return { ...h, borrador: null, grupo: null }
    case 'deshacer':
      if (!puedeDeshacer(h, a.clasif)) return h
      return { ...h, borrador: h.atras[h.atras.length - 1], atras: h.atras.slice(0, -1), grupo: null }
    case 'cambiar': {
      const ahora = h.borrador ?? a.base
      const nuevo = a.hacer(ahora)
      if (mismoBorrador(nuevo, ahora)) return h
      /* Lo de otra clasificación ya no se deshace desde aquí: se empieza de nuevo. */
      const atras = h.clasif === a.clasif ? h.atras : []
      const mismoGrupo = a.grupo !== null && h.clasif === a.clasif && h.grupo === a.grupo
      /* Un arrastre que vuelve a donde empezó no deja nada que deshacer. */
      if (mismoGrupo && atras.length && mismoBorrador(nuevo, atras[atras.length - 1])) {
        return { ...h, borrador: nuevo, atras: atras.slice(0, -1), grupo: null }
      }
      return {
        borrador: nuevo,
        atras: mismoGrupo ? atras : [...atras, ahora].slice(-PASOS_DESHACER),
        grupo: a.grupo,
        clasif: a.clasif,
      }
    }
  }
}

// ------------------------------------------------------------
// Copiar a otra persona
// ------------------------------------------------------------

const mismoLimite = (a: Limite | null | undefined, b: Limite | null | undefined): boolean =>
  (!a && !b) || (!!a && !!b && a.ref === b.ref && a.pct === b.pct)

/**
 * La copia congelada de una tarea, pasada a OTRO deportista: volcar el plan de
 * un grupo a sus miembros.
 *
 * SI SE MANDÓ LA ZONA ENTERA (con los porcentajes que esa zona tenía para la
 * ficha de origen), cada uno la recibe con los SUYOS: es lo que significa
 * «mándales UMB». SI SE AFINÓ A MANO (un 98–100 % dentro de un 95–105 %), o la
 * zona ha cambiado desde que se mandó, se respeta lo que se escribió: es un
 * número que decidió el entrenador, no la plantilla.
 */
export function reanclarCopia(
  copia: CopiaPrescrita, zona: ZonaEntrenador | null | undefined,
  deOrigen: AjusteZona | null | undefined, deDestino: AjusteZona | null | undefined,
): CopiaPrescrita {
  if (!zona || !esCopiaDeLimites(copia)) return copia
  const zO = zonaAjustada(zona, deOrigen)
  const zD = zonaAjustada(zona, deDestino)
  if (!mismoLimite(copia.desde, zO.desde) || !mismoLimite(copia.hasta, zO.hasta)) return copia
  if (mismoLimite(zD.desde, zO.desde) && mismoLimite(zD.hasta, zO.hasta)) return copia
  const conNombre = (l: Limite | null, antes: LimiteCopia | null | undefined): LimiteCopia | null =>
    l ? { ref: l.ref, pct: l.pct, corto: antes?.corto ?? '' } : null
  const desde = conNombre(zD.desde, copia.desde)
  const hasta = conNombre(zD.hasta, copia.hasta)
  /* Las de un solo hito llevan además su tramo afinable en pctMin y pctMax. */
  const deUnHito = !!copia.refId && copia.pctMin > 0 && copia.pctMax > 0 && !!desde && !!hasta
  return {
    ...copia, desde, hasta,
    ...(deUnHito ? { pctMin: Math.min(desde!.pct, hasta!.pct), pctMax: Math.max(desde!.pct, hasta!.pct) } : {}),
  }
}
