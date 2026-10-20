// ============================================================
// TRIPULSE — Leer un fichero FIT
// ============================================================
// El FIT es el formato en que guardan los entrenos los relojes (COROS, Polar,
// Garmin…). Esto lee SOLO lo que hace falta para el detalle de un entreno
// (lib/detalle-entreno): las vueltas, la sesión y, segundo a segundo, la FC,
// la distancia, la velocidad, la cadencia y la potencia.
//
// LAS COORDENADAS NO SE LEEN. Los campos de posición (record 0 y 1, los de
// inicio y fin de cada vuelta y de la sesión) se saltan sin convertirlos: el
// recorrido no llega a existir como dato. Es a propósito y tiene su test.
//
// El formato (FIT Protocol de Garmin, público): una cabecera de 12 o 14 bytes
// con «.FIT» en los bytes 8 a 11, y después una lista de mensajes. Cada uno
// empieza por un byte que dice qué es:
//   bit 7 = 1   datos con la hora COMPRIMIDA: los de la definición local de los
//               bits 5-6, a unos segundos (bits 0-4) de la última hora leída;
//   bit 6 = 1   una DEFINICIÓN: qué campos trae un tipo de mensaje (número,
//               tamaño y tipo de cada uno), en qué orden de bytes, y si lleva
//               campos de desarrollador (bit 5), que aquí se saltan;
//   si no       DATOS de la definición local de los bits 0-3.
// Lo que no se entiende se salta; lo que no cuadra (un fichero cortado) hace
// que se devuelva null: mejor ningún detalle que uno inventado.

export interface RegistroFit {
  /** Segundos FIT (desde el 31-12-1989), como vienen. Solo se usan las diferencias. */
  t: number
  fc?: number
  /** Distancia acumulada desde el principio. */
  metros?: number
  /** m/s. */
  velocidad?: number
  /** Como la graba el reloj: en carrera son las de UNA pierna (×2 = pasos por minuto). */
  cadencia?: number
  potencia?: number
}

export interface VueltaFit {
  inicio?: number
  fin?: number
  /** El tiempo en marcha (sin las pausas), en segundos. */
  segundos?: number
  segundosTotales?: number
  metros?: number
  velocidad?: number
  fcMedia?: number
  fcMax?: number
  cadencia?: number
  potencia?: number
  desnivel?: number
}

export interface SesionFit {
  deporte?: number
  subdeporte?: number
  segundos?: number
  metros?: number
}

export interface Fit {
  sesiones: SesionFit[]
  vueltas: VueltaFit[]
  registros: RegistroFit[]
}

/** Lo más que se acepta: un entreno de 48 h a un dato por segundo cabe holgado. */
const MAX_BYTES = 32 * 1024 * 1024
const MAX_MENSAJES = 600_000

/* Los mensajes que interesan, y de cada uno, los campos: número → [nombre, escala].
   Ni un campo de posición: no están en la lista, así que no se leen. */
type Campos = Record<number, [string, number]>
const SESION = 18, VUELTA = 19, REGISTRO = 20
const QUE_LEER: Record<number, Campos> = {
  [SESION]: { 5: ['deporte', 1], 6: ['subdeporte', 1], 8: ['segundos', 1000], 9: ['metros', 100] },
  [VUELTA]: {
    2: ['inicio', 1], 253: ['fin', 1], 7: ['segundosTotales', 1000], 8: ['segundos', 1000], 9: ['metros', 100],
    13: ['velocidad', 1000], 110: ['velocidadAmpliada', 1000], 15: ['fcMedia', 1], 16: ['fcMax', 1],
    17: ['cadencia', 1], 19: ['potencia', 1], 21: ['desnivel', 1],
  },
  [REGISTRO]: {
    253: ['t', 1], 3: ['fc', 1], 5: ['metros', 100], 6: ['velocidad', 1000], 73: ['velocidadAmpliada', 1000],
    4: ['cadencia', 1], 7: ['potencia', 1],
  },
}

interface CampoDef { num: number; tam: number; tipo: number }
interface Definicion { global: number; grande: boolean; campos: CampoDef[]; tamDev: number }

/**
 * El valor de un campo numérico, o undefined si es el «no válido» de su tipo
 * (FIT marca así lo que el reloj no midió: 0xFF en una FC, por ejemplo).
 * Si el campo es una lista, el primer elemento. Los de 64 bits y los textos
 * no hacen falta aquí y no se leen.
 */
function leerNumero(v: DataView, p: number, tam: number, tipo: number, grande: boolean): number | undefined {
  const le = !grande
  switch (tipo & 0x1f) {
    case 0: case 2: case 13: { if (tam < 1) return; const x = v.getUint8(p); return x === 0xff ? undefined : x }
    case 1: { if (tam < 1) return; const x = v.getInt8(p); return x === 0x7f ? undefined : x }
    case 10: { if (tam < 1) return; const x = v.getUint8(p); return x === 0 ? undefined : x }
    case 3: { if (tam < 2) return; const x = v.getInt16(p, le); return x === 0x7fff ? undefined : x }
    case 4: { if (tam < 2) return; const x = v.getUint16(p, le); return x === 0xffff ? undefined : x }
    case 11: { if (tam < 2) return; const x = v.getUint16(p, le); return x === 0 ? undefined : x }
    case 5: { if (tam < 4) return; const x = v.getInt32(p, le); return x === 0x7fffffff ? undefined : x }
    case 6: { if (tam < 4) return; const x = v.getUint32(p, le); return x === 0xffffffff ? undefined : x }
    case 12: { if (tam < 4) return; const x = v.getUint32(p, le); return x === 0 ? undefined : x }
    case 8: { if (tam < 4) return; if (v.getUint32(p, le) === 0xffffffff) return; const x = v.getFloat32(p, le); return Number.isFinite(x) ? x : undefined }
    case 9: { if (tam < 8) return; const x = v.getFloat64(p, le); return Number.isFinite(x) ? x : undefined }
    default: return undefined
  }
}

/** Lee un FIT. null si no lo es o está cortado. */
export function leerFit(bytes: Uint8Array): Fit | null {
  if (!bytes || bytes.length < 14 || bytes.length > MAX_BYTES) return null
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const cab = bytes[0]
  if (cab !== 12 && cab !== 14) return null
  if (String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== '.FIT') return null
  const tamDatos = v.getUint32(4, true)
  const fin = cab + tamDatos
  if (fin > bytes.length) return null

  const defs: (Definicion | undefined)[] = []
  const salida: Fit = { sesiones: [], vueltas: [], registros: [] }
  let ultimaHora: number | undefined
  let p = cab
  let n = 0

  while (p < fin) {
    if (++n > MAX_MENSAJES) return null
    const h = bytes[p++]

    if (h & 0x40 && !(h & 0x80)) {
      // ---- Definición ----
      if (p + 5 > fin) return null
      const grande = bytes[p + 1] === 1
      const global = grande ? v.getUint16(p + 2, false) : v.getUint16(p + 2, true)
      const nCampos = bytes[p + 4]
      p += 5
      if (p + nCampos * 3 > fin) return null
      const campos: CampoDef[] = []
      for (let i = 0; i < nCampos; i++, p += 3) campos.push({ num: bytes[p], tam: bytes[p + 1], tipo: bytes[p + 2] })
      let tamDev = 0
      if (h & 0x20) {
        if (p + 1 > fin) return null
        const nDev = bytes[p++]
        if (p + nDev * 3 > fin) return null
        for (let i = 0; i < nDev; i++, p += 3) tamDev += bytes[p + 1]
      }
      defs[h & 0x0f] = { global, grande, campos, tamDev }
      continue
    }

    // ---- Datos (normales o con la hora comprimida) ----
    const comprimida = !!(h & 0x80)
    const d = defs[comprimida ? (h >> 5) & 0x03 : h & 0x0f]
    if (!d) return null
    const tam = d.campos.reduce((s, c) => s + c.tam, 0) + d.tamDev
    if (p + tam > fin) return null

    const quiero = QUE_LEER[d.global]
    const valores: Record<string, number> = {}
    let q = p
    for (const c of d.campos) {
      const que = quiero?.[c.num]
      /* La hora la lleva cualquier mensaje: se sigue siempre, para las comprimidas. */
      if (c.num === 253) {
        const t = leerNumero(v, q, c.tam, c.tipo, d.grande)
        if (t != null) { ultimaHora = t; if (que) valores[que[0]] = t }
      } else if (que) {
        const x = leerNumero(v, q, c.tam, c.tipo, d.grande)
        if (x != null) valores[que[0]] = x / que[1]
      }
      q += c.tam
    }
    if (comprimida && ultimaHora != null) {
      const desfase = h & 0x1f
      let t = (ultimaHora & ~0x1f) + desfase
      if (desfase < (ultimaHora & 0x1f)) t += 0x20
      ultimaHora = t
      if (quiero?.[253]) valores[quiero[253][0]] = t
    }
    p += tam

    if (d.global === REGISTRO) {
      if (valores.t == null) continue
      const r: RegistroFit = { t: valores.t }
      if (valores.fc != null) r.fc = valores.fc
      if (valores.metros != null) r.metros = valores.metros
      const vel = valores.velocidadAmpliada ?? valores.velocidad
      if (vel != null) r.velocidad = vel
      if (valores.cadencia != null) r.cadencia = valores.cadencia
      if (valores.potencia != null) r.potencia = valores.potencia
      salida.registros.push(r)
    } else if (d.global === VUELTA) {
      const { velocidadAmpliada, ...resto } = valores
      salida.vueltas.push({ ...resto, ...(velocidadAmpliada != null ? { velocidad: velocidadAmpliada } : {}) } as VueltaFit)
    } else if (d.global === SESION) {
      salida.sesiones.push(valores as SesionFit)
    }
  }
  return salida
}
