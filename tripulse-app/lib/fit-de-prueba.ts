// ============================================================
// TRIPULSE — Ficheros FIT inventados, para los tests
// ============================================================
// Los de verdad traen la salud y el recorrido de alguien: no se guardan en el
// repositorio. Esto escribe uno a medida, con el mismo formato (lib/fit), para
// probar el lector y el detalle con números que se saben de antemano.
// Solo lo usan los tests.

/** Tipos base de FIT: el número que va en la definición. */
export const FIT = { ENUM: 0x00, U8: 0x02, S16: 0x83, U16: 0x84, S32: 0x85, U32: 0x86, U8Z: 0x0a, F32: 0x88 } as const

const TAM: Record<number, number> = { 0x00: 1, 0x02: 1, 0x0a: 1, 0x83: 2, 0x84: 2, 0x85: 4, 0x86: 4, 0x88: 4 }
const NO_VALIDO: Record<number, number> = { 0x00: 0xff, 0x02: 0xff, 0x0a: 0x00, 0x83: 0x7fff, 0x84: 0xffff, 0x85: 0x7fffffff, 0x86: 0xffffffff }

export type MensajePrueba =
  | { tipo: 'def'; local: number; global: number; campos: [num: number, tipo: number][]; grande?: boolean; dev?: number[] }
  | { tipo: 'datos'; local: number; valores: (number | undefined)[]; dev?: number[]; comprimida?: number }

export const definir = (local: number, global: number, campos: [number, number][], op: { grande?: boolean; dev?: number[] } = {}): MensajePrueba =>
  ({ tipo: 'def', local, global, campos, ...op })

/** Los valores en el orden de su definición; undefined = «no válido» de su tipo. */
export const datos = (local: number, valores: (number | undefined)[], op: { dev?: number[]; comprimida?: number } = {}): MensajePrueba =>
  ({ tipo: 'datos', local, valores, ...op })

/** Un fichero FIT con esos mensajes, cabecera de 14 bytes y los CRC a cero (el lector no los mira). */
export function fitDePrueba(mensajes: MensajePrueba[]): Uint8Array {
  const trozos: number[] = []
  const defs: Record<number, { campos: [number, number][]; grande: boolean; dev: number[] }> = {}
  const escribir = (tipo: number, valor: number | undefined, grande: boolean) => {
    const tam = TAM[tipo]
    const b = new DataView(new ArrayBuffer(tam))
    const v = valor === undefined ? NO_VALIDO[tipo] : valor
    if (tipo === 0x88) b.setFloat32(0, v, !grande)
    else if (tam === 1) b.setUint8(0, v & 0xff)
    else if (tipo === 0x83) b.setInt16(0, v, !grande)
    else if (tam === 2) b.setUint16(0, v, !grande)
    else if (tipo === 0x85) b.setInt32(0, v, !grande)
    else b.setUint32(0, v >>> 0, !grande)
    for (let i = 0; i < tam; i++) trozos.push(b.getUint8(i))
  }
  for (const m of mensajes) {
    if (m.tipo === 'def') {
      const grande = !!m.grande
      const dev = m.dev || []
      defs[m.local] = { campos: m.campos, grande, dev }
      trozos.push(0x40 | (dev.length ? 0x20 : 0) | (m.local & 0x0f), 0, grande ? 1 : 0)
      if (grande) trozos.push((m.global >> 8) & 0xff, m.global & 0xff)
      else trozos.push(m.global & 0xff, (m.global >> 8) & 0xff)
      trozos.push(m.campos.length)
      for (const [num, tipo] of m.campos) trozos.push(num, TAM[tipo], tipo)
      if (dev.length) {
        trozos.push(dev.length)
        dev.forEach((tam, i) => trozos.push(i, tam, 0))
      }
    } else {
      const d = defs[m.local]
      if (!d) throw new Error('datos sin definición local ' + m.local)
      trozos.push(m.comprimida != null ? 0x80 | ((m.local & 0x03) << 5) | (m.comprimida & 0x1f) : m.local & 0x0f)
      d.campos.forEach(([, tipo], i) => escribir(tipo, m.valores[i], d.grande))
      for (const tam of d.dev) for (let i = 0; i < tam; i++) trozos.push(0xab)
    }
  }
  const cab = new DataView(new ArrayBuffer(14))
  cab.setUint8(0, 14)
  cab.setUint8(1, 0x20)
  cab.setUint16(2, 2132, true)
  cab.setUint32(4, trozos.length, true)
  ;[...'.FIT'].forEach((c, i) => cab.setUint8(8 + i, c.charCodeAt(0)))
  const salida = new Uint8Array(14 + trozos.length + 2)
  salida.set(new Uint8Array(cab.buffer), 0)
  salida.set(trozos, 14)
  return salida
}

/** Semicírculos FIT de unas coordenadas: lo que el lector NO debe leer. */
export const semicirculos = (grados: number) => Math.round(grados * 2 ** 31 / 180)

/**
 * Una carrera inventada de `km` kilómetros a velocidad constante (m/s), un dato
 * por segundo, con su FC y su posición (para probar que no se lee), y una
 * vuelta por cada `vuelta` metros.
 */
export function carreraDePrueba(op: { km: number; velocidad: number; fc: (s: number) => number; vuelta?: number; t0?: number; pausa?: { en: number; s: number } }): Uint8Array {
  const t0 = op.t0 ?? 1_100_000_000
  const total = Math.round(op.km * 1000 / op.velocidad)
  const m: MensajePrueba[] = [
    definir(0, 20, [[253, FIT.U32], [0, FIT.S32], [1, FIT.S32], [3, FIT.U8], [5, FIT.U32], [6, FIT.U16], [4, FIT.U8]]),
  ]
  let t = t0
  for (let s = 0; s <= total; s++) {
    if (op.pausa && s === op.pausa.en) t += op.pausa.s
    m.push(datos(0, [t, semicirculos(43.3712 + s * 1e-5), semicirculos(-8.3959), op.fc(s), Math.round(s * op.velocidad * 100), Math.round(op.velocidad * 1000), 82]))
    t++
  }
  const vuelta = op.vuelta ?? op.km * 1000
  m.push(definir(1, 19, [[254, FIT.U16], [253, FIT.U32], [2, FIT.U32], [3, FIT.S32], [4, FIT.S32], [8, FIT.U32], [9, FIT.U32], [15, FIT.U8], [16, FIT.U8], [17, FIT.U8]]))
  let hecho = 0, n = 0
  while (hecho < op.km * 1000 - 1) {
    const metros = Math.min(vuelta, op.km * 1000 - hecho)
    const segs = metros / op.velocidad
    const desde = Math.round(hecho / op.velocidad)
    m.push(datos(1, [n++, t0 + desde + Math.round(segs), t0 + desde, semicirculos(43.3712), semicirculos(-8.3959), Math.round(segs * 1000), Math.round(metros * 100), op.fc(desde + 1), op.fc(desde + Math.round(segs)), 82]))
    hecho += metros
  }
  m.push(definir(2, 18, [[253, FIT.U32], [5, FIT.ENUM], [6, FIT.ENUM], [8, FIT.U32], [9, FIT.U32]]))
  m.push(datos(2, [t, 1, 0, total * 1000, Math.round(op.km * 1000 * 100)]))
  return fitDePrueba(m)
}
