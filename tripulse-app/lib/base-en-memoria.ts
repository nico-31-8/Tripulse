// ============================================================
// TRIPULSE — Una base en memoria que contesta como Supabase (SOLO PARA TESTS)
// ============================================================
// Los dobles de supabase de los tests suelen ser una cadena que devuelve lo que
// se le diga, pase lo que pase: `maybeSingle()` da la fila que le pasas aunque
// la consulta hubiera traído cinco. Para casi todo vale. Para la anamnesis
// repetida NO: el fallo ERA justo lo que hace `maybeSingle()` con dos filas
// —un error y `data` a null—, y un doble que no lo imita da los tests en verde
// sobre el código roto.
//
// Esto guarda filas de verdad por tabla y las filtra, ordena y corta como
// PostgREST, con su `maybeSingle()` y su `single()` tal cual (supabase-js
// 2.104): con más de una fila, error PGRST116 y `data` null.
//
// Lo que NO imita: `or()` (no filtra; ninguna tabla de estos tests lo necesita),
// los selects anidados y el RLS.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Fila = Record<string, any>
type Operacion = 'select' | 'insert' | 'update' | 'delete'
type ErrorBase = { message: string; code?: string }

/** Lo que se ha pedido a la base, por si un test necesita contar escrituras. */
export interface Peticion { tabla: string; op: Operacion }

const PGRST116 = (n: number): ErrorBase => ({
  code: 'PGRST116',
  message: 'JSON object requested, multiple (or no) rows returned',
  ...(n > 1 ? { details: `Results contain ${n} rows, application/vnd.pgrst.object+json requires 1 row` } : {}),
} as ErrorBase)

/** Solo las columnas pedidas; con `*` en la lista, la fila entera. */
function proyectar(f: Fila, columnas: string): Fila {
  const lista = columnas.split(',').map(c => c.trim()).filter(Boolean)
  if (!lista.length || lista.includes('*')) return { ...f }
  return Object.fromEntries(lista.filter(c => !c.includes('(')).map(c => [c, f[c] ?? null]))
}

/** Orden de Postgres: los null al final si sube, al principio si baja. */
function comparar(a: any, b: any, asc: boolean, nullsFirst?: boolean): number {
  const primeroNull = nullsFirst ?? !asc
  if (a == null || b == null) {
    if (a == null && b == null) return 0
    return (a == null) === primeroNull ? -1 : 1
  }
  const r = a < b ? -1 : a > b ? 1 : 0
  return asc ? r : -r
}

/**
 * Una base con estas tablas. Se usa como el `supabase` de la app:
 * `base.from('sesion').select('*').eq(…)`. Las filas quedan en `base.tablas`.
 */
export function baseEnMemoria(inicial: Record<string, Fila[]> = {}) {
  const tablas: Record<string, Fila[]> = {}
  for (const [t, filas] of Object.entries(inicial)) tablas[t] = filas.map(f => ({ ...f }))
  const peticiones: Peticion[] = []
  const fallos = new Map<string, ErrorBase>()

  function from(tabla: string) {
    tablas[tabla] ||= []
    let op: Operacion = 'select'
    let columnas = '*'
    let devolver = false
    let valores: any = null
    let modo: 'lista' | 'single' | 'maybeSingle' = 'lista'
    let limite: number | null = null
    const filtros: ((f: Fila) => boolean)[] = []
    const ordenes: { col: string; asc: boolean; nullsFirst?: boolean }[] = []
    const igual = (a: any, b: any) => a != null && b != null && String(a) === String(b)

    function ejecutar(): { data: any; error: ErrorBase | null } {
      peticiones.push({ tabla, op })
      const fallo = fallos.get(`${tabla}:${op}`)
      if (fallo) return { data: null, error: fallo }

      let filas: Fila[]
      if (op === 'insert') {
        const nuevas = (Array.isArray(valores) ? valores : [valores]).map((v: Fila) => {
          const max = tablas[tabla].reduce((m, f) => Math.max(m, Number(f.id) || 0), 0)
          const fila = { id: max + 1, ...v }
          tablas[tabla].push(fila)
          return fila
        })
        if (!devolver) return { data: null, error: null }
        filas = nuevas
      } else {
        filas = tablas[tabla].filter(f => filtros.every(ok => ok(f)))
        if (op === 'update') {
          for (const f of filas) Object.assign(f, valores)
          if (!devolver) return { data: null, error: null }
        } else if (op === 'delete') {
          tablas[tabla] = tablas[tabla].filter(f => !filas.includes(f))
          if (!devolver) return { data: null, error: null }
        }
      }

      if (ordenes.length) {
        filas = [...filas].sort((a, b) => {
          for (const o of ordenes) {
            const r = comparar(a[o.col], b[o.col], o.asc, o.nullsFirst)
            if (r) return r
          }
          return 0
        })
      }
      if (limite != null) filas = filas.slice(0, limite)
      const data = filas.map(f => proyectar(f, columnas))

      if (modo === 'maybeSingle') {
        if (data.length > 1) return { data: null, error: PGRST116(data.length) }
        return { data: data[0] ?? null, error: null }
      }
      if (modo === 'single') {
        if (data.length !== 1) return { data: null, error: PGRST116(data.length) }
        return { data: data[0], error: null }
      }
      return { data, error: null }
    }

    const q: any = {
      select(c = '*') { columnas = c; if (op !== 'select') devolver = true; return q },
      insert(v: any) { op = 'insert'; valores = v; return q },
      update(v: any) { op = 'update'; valores = v; return q },
      delete() { op = 'delete'; return q },
      eq(c: string, v: any) { filtros.push(f => igual(f[c], v)); return q },
      neq(c: string, v: any) { filtros.push(f => !igual(f[c], v)); return q },
      in(c: string, vs: any[]) { filtros.push(f => vs.some(v => igual(f[c], v))); return q },
      gt(c: string, v: any) { filtros.push(f => f[c] != null && f[c] > v); return q },
      gte(c: string, v: any) { filtros.push(f => f[c] != null && f[c] >= v); return q },
      lt(c: string, v: any) { filtros.push(f => f[c] != null && f[c] < v); return q },
      lte(c: string, v: any) { filtros.push(f => f[c] != null && f[c] <= v); return q },
      is(c: string, v: any) { filtros.push(f => (v === null ? f[c] == null : f[c] === v)); return q },
      not(c: string, oper: string, v: any) {
        if (oper === 'is' && v === null) filtros.push(f => f[c] != null)
        else if (oper === 'eq') filtros.push(f => !igual(f[c], v))
        return q
      },
      or() { return q },
      order(c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) {
        ordenes.push({ col: c, asc: o.ascending ?? true, nullsFirst: o.nullsFirst }); return q
      },
      limit(n: number) { limite = n; return q },
      maybeSingle() { modo = 'maybeSingle'; return q },
      single() { modo = 'single'; return q },
      // Como el de verdad: no hace nada hasta que alguien espera, y contesta
      // en otra vuelta del bucle (dos esperas a la vez se cruzan de verdad).
      then(ok: (r: any) => any, ko?: (e: any) => any) {
        return Promise.resolve().then(ejecutar).then(ok, ko)
      },
    }
    return q
  }

  return {
    from,
    /** Las filas, tabla a tabla. */
    tablas,
    /** Todo lo que se le ha pedido, en orden. */
    peticiones,
    /** Que una operación sobre una tabla falle desde ya (null la arregla). */
    falla(tabla: string, op: Operacion, error: ErrorBase | null) {
      if (error) fallos.set(`${tabla}:${op}`, error); else fallos.delete(`${tabla}:${op}`)
    },
  }
}
