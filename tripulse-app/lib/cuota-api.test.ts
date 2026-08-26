import { describe, it, expect } from 'vitest'
import { TOPES, cuandoRenueva, mensajeDeTope, consumirCuota } from './cuota-api'

describe('los topes', () => {
  /* La cara de verdad: escribe una semana entera, la juzga y reintenta. */
  it('la ruta que genera planes tiene el tope más bajo', () => {
    expect(TOPES['plan/generar']).toBeLessThan(TOPES['asistente'])
  })

  it('todas las rutas tienen tope', () => {
    for (const r of ['plan/generar', 'plan', 'asistente', 'entrenador']) {
      expect(TOPES[r]).toBeGreaterThan(0)
    }
  })
})

describe('lo que ve la persona', () => {
  it('dice a qué hora se le renueva', () => {
    const iso = new Date('2026-08-26T18:00:00Z').toISOString()
    expect(cuandoRenueva(iso)).toMatch(/^a las \d{2}:\d{2}$/)
  })

  it('una fecha rota no revienta el mensaje', () => {
    expect(cuandoRenueva('vaya')).toBe('dentro de un rato')
    expect(cuandoRenueva(undefined)).toBe('dentro de un rato')
  })

  it('el mensaje lleva el tope y el porqué, no un «no» a secas', () => {
    const m = mensajeDeTope({ ok: false, max: 20, renueva: undefined }, 'planes')
    expect(m).toContain('20 planes por hora')
    expect(m).toMatch(/gasto/)
  })
})

describe('cuando la base no contesta', () => {
  /* La decisión importante: un tope que se cae y bloquea convierte un problema
     de facturación en una caída total. */
  it('se deja pasar si la consulta falla', async () => {
    const sb = { rpc: async () => ({ data: null, error: { message: 'boom' } }) }
    expect((await consumirCuota(sb, 'plan')).ok).toBe(true)
  })

  it('se deja pasar si devuelve vacío', async () => {
    const sb = { rpc: async () => ({ data: null, error: null }) }
    expect((await consumirCuota(sb, 'plan')).ok).toBe(true)
  })
})

describe('la cuenta', () => {
  it('pasa la ruta y su tope a la función de la base', async () => {
    let visto: any = null
    const sb = { rpc: async (_f: string, args: any) => { visto = args; return { data: { ok: true }, error: null } } }
    await consumirCuota(sb, 'plan/generar')
    expect(visto).toEqual({ _ruta: 'plan/generar', _max: TOPES['plan/generar'] })
  })

  it('una ruta desconocida no se queda sin tope', async () => {
    let visto: any = null
    const sb = { rpc: async (_f: string, args: any) => { visto = args; return { data: { ok: true }, error: null } } }
    await consumirCuota(sb, 'inventada')
    expect(visto._max).toBeGreaterThan(0)
  })

  it('devuelve tal cual lo que dice la base', async () => {
    const sb = { rpc: async () => ({ data: { ok: false, usos: 21, max: 20 }, error: null }) }
    const c = await consumirCuota(sb, 'plan/generar')
    expect(c.ok).toBe(false)
    expect(c.usos).toBe(21)
  })
})
