import { describe, it, expect } from 'vitest'
import { contextosDe, guardarTestsDeCampo, resumenDeTests, testsDeHoy, diasHastaCarreraA } from './dirigir-tests'
import { testPorClave } from './catalogo-tests'

const BOSCO = testPorClave('bosco')!
const SEIS = testPorClave('6min')!

const PERSONAS = [
  { id_deportista: 1, nombre: 'Ana', valores: { sj: '30', cmj: '34' } },
  { id_deportista: 2, nombre: 'Bea', valores: { sj: '28', cmj: '33' } },
]

function sbFalso(op: { fallaLote?: boolean; fallaA?: number } = {}) {
  const escritas: any[] = []
  return {
    escritas,
    from(tabla: string) {
      return {
        insert(v: any) {
          const filas = Array.isArray(v) ? v : [v]
          const ids = new Set(filas.map((f: any) => f.id_deportista))
          if (ids.size > 1 && op.fallaLote) return Promise.resolve({ error: { message: 'lote no' } })
          if (op.fallaA != null && ids.has(op.fallaA)) return Promise.resolve({ error: { message: 'RLS' } })
          escritas.push(...filas.map((f: any) => ({ ...f, _tabla: tabla })))
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

describe('contextosDe', () => {
  function sbLectura() {
    const pedidas: string[] = []
    return {
      pedidas,
      from(tabla: string) {
        pedidas.push(tabla)
        const q: any = {
          select(cols: string) { q._cols = cols; return q },
          in() { return q },
          order() {
            if (tabla === 'registro_peso') {
              return Promise.resolve({ data: [
                { id_deportista: 1, peso_kg: 71, fecha: '2026-08-30' },
                { id_deportista: 1, peso_kg: 68, fecha: '2026-01-10' },
                { id_deportista: 2, peso_kg: 60, fecha: '2026-08-29' },
              ] })
            }
            return Promise.resolve({ data: [
              { id_deportista: 1, vam: 18.5, fecha: '2026-08-01' },
              { id_deportista: 1, vam: 17, fecha: '2026-02-01' },
            ] })
          },
          then(res: any) { return Promise.resolve({ data: [{ id: 1, sexo: 'Hombre' }, { id: 2, sexo: 'Mujer' }] }).then(res) },
        }
        return q
      },
    }
  }

  it('junta el sexo y el peso de cada uno', async () => {
    const ctx = await contextosDe(sbLectura() as any, [1, 2])
    expect(ctx[1]).toEqual({ sexo: 'Hombre', pesoKg: 71 })
    expect(ctx[2].sexo).toBe('Mujer')
    expect(ctx[2].pesoKg).toBe(60)
  })

  it('se queda con el pesaje MÁS NUEVO, no con el último que llegue', () => {
    /* Vienen ordenados de nuevo a viejo y Ana tiene dos. Si se sobreescribiera
       en cada vuelta, la potencia del CMJ saldría calculada con el peso de
       enero. */
    return contextosDe(sbLectura() as any, [1]).then(ctx => {
      expect(ctx[1].pesoKg).toBe(71)
    })
  })

  it('todo el mundo sale en el mapa aunque no tenga datos', async () => {
    const ctx = await contextosDe(sbLectura() as any, [1, 2, 99])
    expect(ctx[99]).toEqual({})
  })

  it('sin nadie no consulta nada', async () => {
    const sb = sbLectura()
    expect(await contextosDe(sb as any, [])).toEqual({})
    expect(sb.pedidas).toEqual([])
  })
})

describe('guardarTestsDeCampo', () => {
  it('escribe una fila por resultado de cada persona', async () => {
    const sb = sbFalso()
    const r = await guardarTestsDeCampo(sb as any, {
      test: BOSCO, fecha: '2026-09-02', protocolo: { unidad: 'cm' }, personas: PERSONAS,
      contextos: { 1: { pesoKg: 72 }, 2: { pesoKg: 60 } },
    })
    expect(r.error).toBeNull()
    expect(r.resultados.map(x => x.filas)).toEqual([5, 5])
    expect(sb.escritas).toHaveLength(10)
    expect(sb.escritas.every(f => f._tabla === 'tests_libres')).toBe(true)
  })

  it('el protocolo se mezcla con lo de cada uno', async () => {
    /* La unidad es del aparato y va arriba una sola vez. Si no llegase a la
       cuenta, 526 ms se leerían como 526 cm. */
    const sb = sbFalso()
    await guardarTestsDeCampo(sb as any, {
      test: BOSCO, fecha: '2026-09-02', protocolo: { unidad: 'ms' },
      personas: [{ id_deportista: 1, nombre: 'Ana', valores: { cmj: '526' } }],
    })
    const cmj = sb.escritas.find(f => f.nombre.endsWith('CMJ'))
    expect(cmj.resultado).toBeCloseTo(33.9, 1)
  })

  it('SE SALTA a quien no lo terminó en vez de guardarle un test vacío', async () => {
    const sb = sbFalso()
    const r = await guardarTestsDeCampo(sb as any, {
      test: SEIS, fecha: '2026-09-02', protocolo: {},
      personas: [
        { id_deportista: 1, nombre: 'Ana', valores: { metros: '1500' } },
        { id_deportista: 2, nombre: 'Bea', valores: {} },
      ],
    })
    expect(r.resultados.map(x => x.id_deportista)).toEqual([1])
    expect(sb.escritas).toHaveLength(1)
    expect(sb.escritas[0].resultado).toBe(15)
  })

  it('si el lote falla se reintenta uno a uno y se salva lo que se pueda', async () => {
    const sb = sbFalso({ fallaLote: true, fallaA: 2 })
    const r = await guardarTestsDeCampo(sb as any, {
      test: SEIS, fecha: '2026-09-02', protocolo: {},
      personas: [
        { id_deportista: 1, nombre: 'Ana', valores: { metros: '1500' } },
        { id_deportista: 2, nombre: 'Bea', valores: { metros: '1400' } },
      ],
    })
    expect(r.error).toBeNull()
    expect(r.resultados.map(x => x.ok)).toEqual([true, false])
    expect(sb.escritas).toHaveLength(1)
  })

  it('sin fecha no se guarda', async () => {
    const sb = sbFalso()
    const r = await guardarTestsDeCampo(sb as any, {
      test: SEIS, fecha: '', protocolo: {}, personas: PERSONAS,
    })
    expect(r.error).toBeTruthy()
    expect(sb.escritas).toHaveLength(0)
  })

  it('si nadie lo terminó se dice y no se escribe', async () => {
    const sb = sbFalso()
    const r = await guardarTestsDeCampo(sb as any, {
      test: SEIS, fecha: '2026-09-02', protocolo: {},
      personas: [{ id_deportista: 1, nombre: 'Ana', valores: {} }],
    })
    expect(r.error).toBe('Ningún test está completo todavía.')
    expect(sb.escritas).toHaveLength(0)
  })

  it('la nota va en todas las filas', async () => {
    const sb = sbFalso()
    await guardarTestsDeCampo(sb as any, {
      test: BOSCO, fecha: '2026-09-02', protocolo: { unidad: 'cm' },
      personas: [PERSONAS[0]], contextos: { 1: { pesoKg: 72 } }, notas: 'pista mojada',
    })
    expect(sb.escritas.every(f => f.notas === 'pista mojada')).toBe(true)
  })
})

describe('resumenDeTests', () => {
  it('cuenta guardados, errores y los que faltan', () => {
    const ok = (id: number) => ({ id_deportista: id, nombre: 'x', ok: true, filas: 1 })
    expect(resumenDeTests([ok(1)], 1)).toBe('1 test guardado.')
    expect(resumenDeTests([ok(1), ok(2)], 5)).toBe('2 tests guardados · 3 sin terminar.')
    expect(resumenDeTests([ok(1), { id_deportista: 2, nombre: 'y', ok: false, filas: 0 }], 2))
      .toBe('1 test guardado · 1 con error.')
  })
})

describe('testsDeHoy — para el aviso de dos disciplinas', () => {
  const sbCon = (filas: any[]) => ({
    from() {
      const q: any = { select: () => q, in: () => q, eq: () => Promise.resolve({ data: filas }) }
      return q
    },
  })

  it('reconoce el test por el prefijo del nombre', async () => {
    const r = await testsDeHoy(sbCon([
      { id_deportista: 1, nombre: 'FTP 20 minutos · FTP' },
    ]) as any, [1], '2026-09-02')
    expect(r[1].map(t => t.clave)).toEqual(['ftp20'])
  })

  it('un test que dejó cinco filas cuenta UNA vez', async () => {
    /* Sin esto el aviso diría que hoy se han hecho cinco tests de saltos. */
    const r = await testsDeHoy(sbCon([
      { id_deportista: 1, nombre: 'Saltos: SJ y CMJ · CMJ' },
      { id_deportista: 1, nombre: 'Saltos: SJ y CMJ · EUR' },
      { id_deportista: 1, nombre: 'Saltos: SJ y CMJ · Squat Jump' },
    ]) as any, [1], '2026-09-02')
    expect(r[1]).toHaveLength(1)
  })

  it('lo que no es de la batería se ignora', async () => {
    /* tests_libres admite cualquier cosa escrita a mano desde la ficha. */
    const r = await testsDeHoy(sbCon([
      { id_deportista: 1, nombre: 'Dominadas' },
      { id_deportista: 1, nombre: null },
    ]) as any, [1], '2026-09-02')
    expect(r[1]).toEqual([])
  })

  it('sin fecha o sin nadie no consulta', async () => {
    expect(await testsDeHoy(sbCon([]) as any, [], '2026-09-02')).toEqual({})
    expect(await testsDeHoy(sbCon([]) as any, [1], '')).toEqual({ 1: [] })
  })
})

describe('diasHastaCarreraA', () => {
  const sbCon = (filas: any[]) => ({
    from() {
      const q: any = { select: () => q, in: () => q, gte: () => Promise.resolve({ data: filas }) }
      return q
    },
  })

  it('coge la A más cercana, no la primera que llegue', async () => {
    const r = await diasHastaCarreraA(sbCon([
      { id_deportista: 1, fecha: '2026-11-01', prioridad: 'A' },
      { id_deportista: 1, fecha: '2026-09-16', prioridad: 'A' },
    ]) as any, [1], '2026-09-02')
    expect(r[1]).toBe(14)
  })

  it('las B y C no cuentan: el tapering es de la A', async () => {
    const r = await diasHastaCarreraA(sbCon([
      { id_deportista: 1, fecha: '2026-09-09', prioridad: 'B' },
    ]) as any, [1], '2026-09-02')
    expect(r[1]).toBeNull()
  })

  it('sin prioridad guardada, null y no sale el aviso', async () => {
    /* Hay bases sin esa columna. Un aviso de tapering falso hace que se dejen
       de leer los avisos de verdad. */
    const r = await diasHastaCarreraA(sbCon([
      { id_deportista: 1, fecha: '2026-09-09' },
    ]) as any, [1], '2026-09-02')
    expect(r[1]).toBeNull()
  })

  it('todo el mundo sale en el mapa aunque no compita', async () => {
    const r = await diasHastaCarreraA(sbCon([]) as any, [1, 2], '2026-09-02')
    expect(r).toEqual({ 1: null, 2: null })
  })
})
