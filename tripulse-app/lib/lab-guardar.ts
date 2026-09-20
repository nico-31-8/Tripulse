// ============================================================
// TRIPULSE — Laboratorio: leer y escribir el modelo nuevo
// ============================================================
//
// La frontera entre el constructor y la base. Aquí no se calcula nada: solo se
// traduce lo guardado a un test y al revés.
//
// LO GUARDADO NO MANDA SOBRE EL CÓDIGO. Todo lo que entra se lee a la
// defensiva: un instrumento que ya no existe degrada a «a mano», una clase
// desconocida pasa a «medida», una función inventada se tira. Un test viejo no
// puede reventar la pantalla ni colarse hasta el cálculo.
//
// Y CONVIVE CON EL MODELO ANTERIOR. Un test tiene `modelo` o no lo tiene. Si lo
// tiene se lee con esto; si no, sigue siendo de `/tests-propios` y aquí ni se
// ofrece. Nada se migra a la fuerza.

import {
  esFuncion, esFuncion2, MAX_VECES,
  type Bloq, type Bloque, type Clase, type Columna, type Datos,
  type Funcion, type Funcion2, type Instrumento, type Resultado,
  type TestLab, type TipoDada, type Tramo,
} from './lab-constructor'
import { esAncla, type Ancla } from './test-definicion'

const txt = (v: unknown): string => String(v ?? '').trim()
const num = (v: unknown): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const CLASES: Clase[] = ['dada', 'medida', 'calculada']
const INSTRUMENTOS: Instrumento[] = ['mano', 'crono-seg', 'crono-min', 'contador']

// ------------------------------------------------------------
// Leer
// ------------------------------------------------------------

function leerFormula(bruto: unknown): Bloq[] {
  if (!Array.isArray(bruto)) return []
  const out: Bloq[] = []
  for (const b of bruto) {
    const o = b as Record<string, unknown> | null
    const t = txt(o?.t)
    if (t === 'num') {
      const n = num(o?.v)
      if (n !== undefined) out.push({ t: 'num', v: n })
    } else if (t === 'fn') {
      const v = txt(o?.v), de = txt(o?.de)
      if (esFuncion(v) && de) {
        const bl: Bloq = { t: 'fn', v: v as Funcion, de }
        const d = num(o?.d), h = num(o?.h)
        if (d) bl.d = Math.round(d)
        if (h) bl.h = Math.round(h)
        out.push(bl)
      }
    } else if (t === 'fn2') {
      const v = txt(o?.v), x = txt(o?.x), y = txt(o?.y)
      if (esFuncion2(v) && x && y) {
        const bl: Bloq = { t: 'fn2', v: v as Funcion2, x, y }
        const a = num(o?.a)
        if (a !== undefined) bl.a = a
        out.push(bl)
      }
    } else if (t === 'var' || t === 'ref' || t === 'op') {
      const v = txt(o?.v)
      if (v) out.push({ t, v } as Bloq)
    }
  }
  return out
}

function leerColumna(bruto: unknown): Columna | null {
  const o = bruto as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const clave = txt(o.clave)
  if (!clave) return null

  const clase = CLASES.includes(txt(o.clase) as Clase) ? (txt(o.clase) as Clase) : 'medida'
  const instrumento = INSTRUMENTOS.includes(txt(o.instrumento) as Instrumento)
    ? (txt(o.instrumento) as Instrumento) : 'mano'

  const c: Columna = {
    clave, etiqueta: txt(o.etiqueta), unidad: txt(o.unidad), clase, instrumento,
    valor: txt(o.valor),
  }

  if (clase === 'dada') {
    c.tipo = txt(o.tipo) === 'lista' ? 'lista' : 'progresion' as TipoDada
    if (c.tipo === 'lista') {
      c.etiquetas = Array.isArray(o.etiquetas) ? o.etiquetas.map(txt).filter(Boolean) : []
    } else {
      c.desde = num(o.desde) ?? 0
      c.paso = num(o.paso) ?? 0
      if (txt(o.desdeRef)) c.desdeRef = txt(o.desdeRef)
      if (txt(o.pasoRef)) c.pasoRef = txt(o.pasoRef)
    }
  }
  if (clase === 'calculada') c.formula = leerFormula(o.formula)
  return c
}

function leerTramos(bruto: unknown): Tramo[] | undefined {
  if (!Array.isArray(bruto) || !bruto.length) return undefined
  const out = bruto.map(t => {
    const o = t as Record<string, unknown> | null
    return { nombre: txt(o?.nombre), segundos: Math.max(0, Math.round(num(o?.segundos) ?? 0)) }
  })
  return out.length ? out : undefined
}

function leerBloque(bruto: unknown, i: number): Bloque | null {
  const o = bruto as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const columnas = (Array.isArray(o.columnas) ? o.columnas : [])
    .map(leerColumna).filter(Boolean) as Columna[]
  /* Un bloque sin columnas no mide nada: no se deja entrar, porque en pantalla
     sería una tabla de filas vacías sin forma de arreglarla. */
  if (!columnas.length) return null

  const veces = Math.max(1, Math.min(MAX_VECES, Math.round(num(o.veces) ?? 1)))
  const bl: Bloque = {
    clave: txt(o.clave) || 'b' + (i + 1),
    etiqueta: txt(o.etiqueta),
    modo: txt(o.modo) === 'abierto' ? 'abierto' : 'cerrado',
    veces,
    duracion: Math.max(0, Math.round(num(o.duracion) ?? 0)),
    columnas,
  }
  if (txt(o.duracionUd) === 'min') bl.duracionUd = 'min'
  const tramos = leerTramos(o.tramos)
  if (tramos) bl.tramos = tramos
  if (o.pitaCambio === false) bl.pitaCambio = false
  else if (o.pitaCambio === true) bl.pitaCambio = true
  const aviso = num(o.avisoAntes)
  if (aviso) bl.avisoAntes = Math.max(0, Math.round(aviso))
  const ritmo = txt(o.ritmo)
  if (ritmo === 'metros' || ritmo === 'segundos') {
    bl.ritmo = ritmo
    bl.ritmoCada = Math.max(0, num(o.ritmoCada) ?? 0)
  }
  return bl
}

function leerResultado(bruto: unknown): Resultado | null {
  const o = bruto as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const nombre = txt(o.nombre)
  if (!nombre) return null

  const r: Resultado = { nombre, unidad: txt(o.unidad), formula: leerFormula(o.formula) }
  /* Un ancla que ya no exista degrada a «nada»: LO GUARDADO NO MANDA SOBRE EL
     CÓDIGO, y menos cuando de eso depende qué número gobierna las zonas. */
  if (esAncla(txt(o.ancla))) r.ancla = txt(o.ancla) as Ancla
  if (o.graf === false) r.graf = false
  if (typeof o.inverso === 'boolean') r.inverso = o.inverso
  return r
}

/**
 * Rehace un test desde lo guardado, venga como venga.
 *
 * `jsonb` normalmente llega ya como objeto, pero un cliente que lo pida como
 * texto lo devuelve en cadena, y una fila vieja puede devolver null. Ninguna de
 * las tres puede reventar la pantalla.
 *
 * Devuelve null cuando la fila NO es del modelo nuevo, que es lo que distingue
 * un test del laboratorio de uno de `/tests-propios`.
 */
export function leerModelo(bruto: unknown, nombre = '', deporte = 'Carrera'): TestLab | null {
  let d: unknown = bruto
  if (typeof d === 'string') { try { d = JSON.parse(d) } catch { return null } }
  if (!d || typeof d !== 'object') return null
  const o = d as Record<string, unknown>
  if (!Array.isArray(o.sueltos) && !Array.isArray(o.bloques)) return null

  return {
    nombre: txt(o.nombre) || nombre,
    deporte: txt(o.deporte) || deporte,
    sueltos: (Array.isArray(o.sueltos) ? o.sueltos : []).map(leerColumna).filter(Boolean) as Columna[],
    bloques: (Array.isArray(o.bloques) ? o.bloques : []).map(leerBloque).filter(Boolean) as Bloque[],
    resultados: (Array.isArray(o.resultados) ? o.resultados : []).map(leerResultado).filter(Boolean) as Resultado[],
  }
}

// ------------------------------------------------------------
// Escribir
// ------------------------------------------------------------

/**
 * La fila que se manda a la base.
 *
 * `nombre` y `deporte` van FUERA del jsonb además de dentro porque son lo
 * único por lo que se lista y se ordena: meterlos solo en el blob obligaría a
 * bajarse todos los modelos enteros para pintar una lista de nombres.
 *
 * Y `campos` y `resultados` se dejan vacíos a propósito: son del modelo viejo.
 * Rellenarlos con algo parecido haría que `/tests-propios` enseñara una versión
 * mutilada del test y dejara corregirla allí, que es la peor forma de tener el
 * mismo test en dos sitios.
 */
export function paraGuardar(t: TestLab, idEntrenador: string) {
  return {
    id_entrenador: idEntrenador,
    nombre: t.nombre.trim(),
    deporte: t.deporte,
    campos: [],
    resultados: [],
    modelo: { nombre: t.nombre.trim(), deporte: t.deporte, sueltos: t.sueltos, bloques: t.bloques, resultados: t.resultados },
  }
}

// ------------------------------------------------------------
// Las mediciones
// ------------------------------------------------------------

export interface Medicion {
  fecha: string
  datos: Datos
}

/**
 * Lo que se guarda de una pasada: el protocolo Y lo medido, juntos.
 *
 * El protocolo se copia en CADA medición aunque sea el mismo para todos los que
 * hicieron el test ese día. No es duplicar por duplicar: dos tests que
 * arrancaron con distinto incremento no son comparables, y si el protocolo
 * viviera solo en la definición, cambiarlo mañana reescribiría en silencio
 * todas las VAM del pasado.
 */
export const medicionDe = (proto: Datos, mio: Datos): Datos => ({ ...proto, ...mio })

/** Las mediciones de la base, tirando lo que no se entienda. */
export function leerMediciones(filas: unknown[] | null | undefined): Medicion[] {
  return (filas || []).map(f => {
    const o = f as Record<string, unknown> | null
    const fecha = txt(o?.fecha)
    if (!fecha) return null
    let datos = o?.datos
    if (typeof datos === 'string') { try { datos = JSON.parse(datos) } catch { datos = {} } }
    return { fecha, datos: (datos && typeof datos === 'object' ? datos : {}) as Datos }
  }).filter(Boolean) as Medicion[]
}
