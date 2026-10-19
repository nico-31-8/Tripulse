import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  accesoDelDeportista, accesoDelServidor, sincronizarCoros, sincronizarPolar, sincronizarTodos, HORAS_SIN_TRAER,
  type AccesoReloj, type FilaCruda, type Pendiente, type TokenReloj, type TokenRenovado,
} from './relojes-sincronizar'
import { motivoDeError, type Medicion } from './polar'
import { VERSION_MCP } from './coros'
import { hoyISO, sumarDias } from './fechas'

afterEach(() => { vi.unstubAllGlobals() })

const enUnaHora = () => new Date(Date.now() + 3600_000).toISOString()
const yaCaducado = () => new Date(Date.now() - 1000).toISOString()

/** Un acceso de mentira: apunta lo que se le pide. */
function accesoFalso(op: { token?: TokenReloj | null; tokenLuego?: TokenReloj | null; renovarOk?: boolean; yaNoches?: boolean; yaEntrenos?: boolean } = {}) {
  const hecho = {
    tokens: 0,
    guardar: [] as { mediciones: Medicion[]; error: string | null }[],
    crudo: [] as FilaCruda[][],
    renovar: [] as TokenRenovado[],
  }
  const acceso: AccesoReloj = {
    async token() {
      hecho.tokens++
      return hecho.tokens === 1 ? (op.token ?? null) : (op.tokenLuego !== undefined ? op.tokenLuego : (op.token ?? null))
    },
    async renovar(_m, n) { hecho.renovar.push(n); return op.renovarOk ?? true },
    async guardar(_m, mediciones, error) { hecho.guardar.push({ mediciones, error }); return { guardadas: mediciones.length, error: null } },
    async guardarCrudo(_m, filas) { hecho.crudo.push(filas) },
    async yaHay(_m, tipo) { return tipo === 'sueno' ? !!op.yaNoches : !!op.yaEntrenos },
  }
  return { acceso, hecho }
}

const respuestaJson = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })

// ---------------------------------------------------------------------------
// Un COROS de mentira: el MCP y la renovación del token
// ---------------------------------------------------------------------------

const RANGO = { type: 'object', properties: { startDate: { type: 'string' }, endDate: { type: 'string' } } }
const HERRAMIENTAS = ['querySleepOverview', 'querySleepHrv', 'queryRestingHeartRate', 'querySportRecords', 'queryTrainingSchedule']
  .map(name => ({ name, inputSchema: RANGO }))

interface PeticionCoros { url: string; auth: string | null; metodo?: string; herramienta?: string; args?: Record<string, unknown>; cuerpo?: string }

function corosFalso(op: { refresco?: { status: number; cuerpo?: unknown }; respuestas?: Record<string, string> } = {}) {
  const peticiones: PeticionCoros[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    const auth = new Headers(init?.headers).get('authorization')
    if (u.endsWith('/oauth2/token')) {
      peticiones.push({ url: u, auth, cuerpo: String(init?.body) })
      return respuestaJson(op.refresco?.cuerpo ?? {}, op.refresco?.status ?? 200)
    }
    const m = JSON.parse(String(init?.body)) as { id?: number; method: string; params?: { name?: string; arguments?: Record<string, unknown> } }
    peticiones.push({ url: u, auth, metodo: m.method, herramienta: m.params?.name, args: m.params?.arguments })
    if (m.method === 'initialize') return respuestaJson({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: VERSION_MCP, capabilities: {}, serverInfo: { name: 'coros' } } })
    if (m.method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (m.method === 'tools/list') return respuestaJson({ jsonrpc: '2.0', id: m.id, result: { tools: HERRAMIENTAS } })
    if (m.method === 'tools/call') {
      const texto = op.respuestas?.[m.params?.name || ''] ?? 'Sin datos en ese rango.'
      return respuestaJson({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: texto }] } })
    }
    return new Response('', { status: 404 })
  }))
  const llamadas = (h: string) => peticiones.filter(p => p.herramienta === h)
  return { peticiones, llamadas }
}

const tokenCoros = (o: Partial<TokenReloj> = {}): TokenReloj => ({
  id_externo: null, access_token: 'acc-1', refresh_token: 'ref-1', extra: { cliente: 'cliente-1' }, caduca_en: enUnaHora(), ...o,
})

describe('sincronizarCoros', () => {
  it('sin COROS conectado no habla con nadie', async () => {
    const { peticiones } = corosFalso()
    const { acceso, hecho } = accesoFalso({ token: null })
    expect(await sincronizarCoros(acceso)).toEqual({ ok: false, status: 400, error: 'No tienes COROS conectado.' })
    expect(peticiones).toHaveLength(0)
    expect(hecho.guardar).toHaveLength(0)
  })

  it('la primera vez pide cuatro semanas de todo, la HRV de siete en siete días', async () => {
    const { peticiones, llamadas } = corosFalso()
    const { acceso, hecho } = accesoFalso({ token: tokenCoros() })
    const r = await sincronizarCoros(acceso)
    expect(r.ok).toBe(true)

    const hoy = hoyISO()
    expect(llamadas('querySleepOverview').map(p => p.args)).toEqual([{ startDate: sumarDias(hoy, -27), endDate: hoy }])
    expect(llamadas('querySportRecords').map(p => p.args)).toEqual([{ startDate: sumarDias(hoy, -27), endDate: hoy }])
    expect(llamadas('querySleepHrv')).toHaveLength(4)
    expect(llamadas('querySleepHrv').every(p => (Date.parse(String(p.args?.endDate)) - Date.parse(String(p.args?.startDate))) / 86400000 <= 6)).toBe(true)
    /* El calendario, solo en crudo: las dos semanas que vienen. */
    expect(llamadas('queryTrainingSchedule').map(p => p.args)).toEqual([{ startDate: hoy, endDate: sumarDias(hoy, 13) }])

    /* Sin renovar (le queda una hora) y siempre con su token. */
    expect(peticiones.some(p => p.url.endsWith('/oauth2/token'))).toBe(false)
    expect(peticiones.every(p => p.auth === 'Bearer acc-1')).toBe(true)
    expect(hecho.guardar).toEqual([{ mediciones: [], error: null }])
    expect(hecho.crudo).toHaveLength(1)
    expect(hecho.crudo[0].map(f => f.herramienta)).toEqual(['tools/list', ...HERRAMIENTAS.map(h => h.name)])
  })

  it('con noches y entrenos ya recibidos, una semana', async () => {
    const { llamadas } = corosFalso()
    const { acceso } = accesoFalso({ token: tokenCoros(), yaNoches: true, yaEntrenos: true })
    await sincronizarCoros(acceso)
    const hoy = hoyISO()
    expect(llamadas('querySleepOverview').map(p => p.args)).toEqual([{ startDate: sumarDias(hoy, -6), endDate: hoy }])
    expect(llamadas('querySleepHrv').map(p => p.args)).toEqual([{ startDate: sumarDias(hoy, -6), endDate: hoy }])
    expect(llamadas('querySportRecords').map(p => p.args)).toEqual([{ startDate: sumarDias(hoy, -6), endDate: hoy }])
  })

  it('con noches pero sin ningún entreno todavía, los entrenos de cuatro semanas', async () => {
    const { llamadas } = corosFalso()
    const { acceso } = accesoFalso({ token: tokenCoros(), yaNoches: true, yaEntrenos: false })
    await sincronizarCoros(acceso)
    const hoy = hoyISO()
    expect(llamadas('querySleepOverview').map(p => p.args?.startDate)).toEqual([sumarDias(hoy, -6)])
    expect(llamadas('querySportRecords').map(p => p.args?.startDate)).toEqual([sumarDias(hoy, -27)])
  })

  it('a punto de caducar, lo renueva, lo guarda y sigue con el nuevo', async () => {
    const { peticiones } = corosFalso({ refresco: { status: 200, cuerpo: { access_token: 'acc-2', refresh_token: 'ref-2', expires_in: 3600 } } })
    const { acceso, hecho } = accesoFalso({ token: tokenCoros({ caduca_en: yaCaducado() }) })
    const r = await sincronizarCoros(acceso)
    expect(r.ok).toBe(true)
    expect(peticiones[0].cuerpo).toContain('refresh_token=ref-1')
    expect(peticiones[0].cuerpo).toContain('client_id=cliente-1')
    expect(hecho.renovar.map(n => [n.accessToken, n.refreshToken])).toEqual([['acc-2', 'ref-2']])
    expect(peticiones.slice(1).every(p => p.auth === 'Bearer acc-2')).toBe(true)
  })

  it('si COROS no acepta el permiso porque OTRA sincronización acaba de renovarlo, sigue con el que quedó guardado', async () => {
    const { peticiones } = corosFalso({ refresco: { status: 400, cuerpo: { error: 'invalid_grant' } } })
    const { acceso, hecho } = accesoFalso({
      token: tokenCoros({ caduca_en: yaCaducado() }),
      tokenLuego: tokenCoros({ access_token: 'acc-de-la-otra', caduca_en: enUnaHora() }),
    })
    const r = await sincronizarCoros(acceso)
    expect(r.ok).toBe(true)
    expect(hecho.renovar).toHaveLength(0)
    expect(peticiones.filter(p => p.metodo).every(p => p.auth === 'Bearer acc-de-la-otra')).toBe(true)
    expect(hecho.guardar.every(g => g.error === null)).toBe(true)
  })

  it('si no lo acepta y nadie lo ha renovado, lo apunta: hay que volver a conectar', async () => {
    const { peticiones } = corosFalso({ refresco: { status: 400, cuerpo: { error: 'invalid_grant' } } })
    const { acceso, hecho } = accesoFalso({ token: tokenCoros({ caduca_en: yaCaducado() }) })
    const r = await sincronizarCoros(acceso)
    const mensaje = 'COROS ya no reconoce la conexión. Desconecta y vuelve a conectar tu cuenta.'
    expect(r).toEqual({ ok: false, status: 409, error: mensaje })
    expect(hecho.guardar).toEqual([{ mediciones: [], error: mensaje }])
    expect(peticiones.filter(p => p.metodo)).toHaveLength(0)
  })

  it('los entrenos se guardan en crudo sin el sitio ni las coordenadas', async () => {
    corosFalso({
      respuestas: {
        querySportRecords: 'Sport Records — 2026-10-01 to 2026-10-19 (1 records)\n\n1. Run — 2026-10-18\n   Location: Calle Inventada 12\n   Start Coordinates: 43.3712, -8.3959\n   Duration: 0:31:02 | Distance: 4.60 km',
      },
    })
    const { acceso, hecho } = accesoFalso({ token: tokenCoros() })
    await sincronizarCoros(acceso)
    const fila = hecho.crudo[0].find(f => f.herramienta === 'querySportRecords')
    const guardado = JSON.stringify(fila)
    expect(guardado).not.toContain('Calle Inventada')
    expect(guardado).not.toContain('43.3712')
    expect(guardado).toContain('Duration: 0:31:02')
  })
})

// ---------------------------------------------------------------------------
// Polar
// ---------------------------------------------------------------------------

function polarFalso(estados: { sleep: number; recharge: number; exercises: number }) {
  const pedidas: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    const u = String(url)
    pedidas.push(u)
    const status = u.endsWith('/users/sleep') ? estados.sleep : u.endsWith('/users/nightly-recharge') ? estados.recharge : estados.exercises
    return status === 204 ? new Response(null, { status }) : respuestaJson({}, status)
  }))
  return pedidas
}

const tokenPolar = (o: Partial<TokenReloj> = {}): TokenReloj => ({ id_externo: '123', access_token: 'pol-1', caduca_en: new Date(Date.now() + 300 * 86400_000).toISOString(), ...o })

describe('sincronizarPolar', () => {
  it('sin Polar conectado no pide nada', async () => {
    const pedidas = polarFalso({ sleep: 204, recharge: 204, exercises: 204 })
    const { acceso } = accesoFalso({ token: null })
    expect(await sincronizarPolar(acceso)).toEqual({ ok: false, status: 400, error: 'No tienes Polar conectado.' })
    expect(pedidas).toHaveLength(0)
  })

  it('caducada (dura un año), lo apunta sin preguntar a Polar', async () => {
    const pedidas = polarFalso({ sleep: 204, recharge: 204, exercises: 204 })
    const { acceso, hecho } = accesoFalso({ token: tokenPolar({ caduca_en: yaCaducado() }) })
    const r = await sincronizarPolar(acceso)
    expect(r.ok).toBe(false)
    expect(pedidas).toHaveLength(0)
    expect(hecho.guardar[0].error).toContain('ha caducado')
  })

  it('si fallan las tres, lo apunta como error de la conexión', async () => {
    polarFalso({ sleep: 401, recharge: 401, exercises: 401 })
    const { acceso, hecho } = accesoFalso({ token: tokenPolar() })
    expect(await sincronizarPolar(acceso)).toEqual({ ok: false, status: 409, error: motivoDeError(401) })
    expect(hecho.guardar).toEqual([{ mediciones: [], error: motivoDeError(401) }])
  })

  it('«no hay nada» (204) no es un error; uno que falla solo, se avisa sin apuntarlo', async () => {
    polarFalso({ sleep: 204, recharge: 204, exercises: 204 })
    const a = accesoFalso({ token: tokenPolar() })
    expect(await sincronizarPolar(a.acceso)).toEqual({ ok: true, cuerpo: { guardadas: 0, noches: 0, recargas: 0, entrenos: 0, aviso: null } })
    expect(a.hecho.guardar).toEqual([{ mediciones: [], error: null }])

    polarFalso({ sleep: 500, recharge: 204, exercises: 204 })
    const b = accesoFalso({ token: tokenPolar() })
    const r = await sincronizarPolar(b.acceso)
    expect(r.ok && r.cuerpo.aviso).toBe(motivoDeError(500))
    expect(b.hecho.guardar.every(g => g.error === null)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Los accesos: qué funciones de la base llama cada uno
// ---------------------------------------------------------------------------

function sbQueApunta(respuestas: Record<string, { data: unknown; error: { message: string } | null }> = {}) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = []
  const filtros: [string, unknown][] = []
  const sb = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      return respuestas[fn] ?? { data: null, error: null }
    }),
    from: vi.fn(() => {
      const cadena = {
        select: () => cadena,
        eq: (c: string, v: unknown) => { filtros.push([c, v]); return cadena },
        then: (ok: (r: { count: number }) => unknown) => Promise.resolve({ count: 3 }).then(ok),
      }
      return cadena
    }),
  } as unknown as SupabaseClient
  return { sb, rpcs, filtros }
}

describe('accesoDelDeportista', () => {
  it('usa las funciones de siempre, que miran quién llama', async () => {
    const { sb, rpcs, filtros } = sbQueApunta({ reloj_token_propio: { data: [tokenPolar()], error: null }, reloj_guardar: { data: 2, error: null } })
    const a = accesoDelDeportista(sb, 'uid-1')
    expect((await a.token('polar'))?.access_token).toBe('pol-1')
    expect(await a.guardar('polar', [], null)).toEqual({ guardadas: 2, error: null })
    await a.renovar('coros', { accessToken: 'n', refreshToken: null, caducaEn: null })
    await a.guardarCrudo('coros', [])
    expect(rpcs.map(r => r.fn)).toEqual(['reloj_token_propio', 'reloj_guardar', 'reloj_renovar', 'reloj_guardar_crudo'])
    expect(rpcs.every(r => !('p_llave' in r.args))).toBe(true)
    /* «Ya hay» cuenta lo SUYO: el de quien llama, no lo de sus deportistas. */
    expect(await a.yaHay('coros', 'sueno')).toBe(true)
    expect(filtros).toEqual([['deportista.id_usuario', 'uid-1'], ['proveedor', 'coros'], ['tipo', 'sueno']])
  })

  it('si la base no da el token, es que no está conectado', async () => {
    const { sb } = sbQueApunta({ reloj_token_propio: { data: null, error: { message: 'x' } } })
    expect(await accesoDelDeportista(sb, 'uid-1').token('polar')).toBeNull()
  })
})

describe('accesoDelServidor', () => {
  it('usa las gemelas del servidor, con la llave y el deportista, y no lee ninguna tabla', async () => {
    const { sb, rpcs } = sbQueApunta({ reloj_servidor_token: { data: [tokenCoros()], error: null } })
    const p: Pendiente = { id_deportista: 20, proveedor: 'coros', hay_noches: true, hay_entrenos: false }
    const a = accesoDelServidor(sb, 'la-llave', p)
    expect((await a.token('coros'))?.access_token).toBe('acc-1')
    await a.renovar('coros', { accessToken: 'n', refreshToken: 'r', caducaEn: null })
    await a.guardar('coros', [], 'un fallo')
    await a.guardarCrudo('coros', [])
    expect(rpcs.map(r => r.fn)).toEqual(['reloj_servidor_token', 'reloj_servidor_renovar', 'reloj_servidor_guardar', 'reloj_servidor_guardar_crudo'])
    expect(rpcs.every(r => r.args.p_llave === 'la-llave' && r.args.p_deportista === 20 && r.args.p_proveedor === 'coros')).toBe(true)
    expect(rpcs[2].args.p_error).toBe('un fallo')
    /* «Ya hay» sale de la lista de pendientes: sin sesión no se puede leer reloj_medicion. */
    expect([await a.yaHay('coros', 'sueno'), await a.yaHay('coros', 'entreno')]).toEqual([true, false])
    expect(sb.from).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Todos los que tocan
// ---------------------------------------------------------------------------

function sbServidor(pendientes: Pendiente[] | { error: string }, op: { fallaToken?: number } = {}) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = []
  let enMarcha = 0
  let maximo = 0
  const sb = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      if (fn === 'reloj_servidor_pendientes') return 'error' in pendientes ? { data: null, error: { message: pendientes.error } } : { data: pendientes, error: null }
      if (fn === 'reloj_servidor_token') {
        if (args.p_deportista === op.fallaToken) throw new Error('la base se ha caído')
        enMarcha++
        maximo = Math.max(maximo, enMarcha)
        await new Promise(r => setTimeout(r, 5))
        return { data: [tokenPolar({ access_token: 'pol-' + args.p_deportista })], error: null }
      }
      if (fn === 'reloj_servidor_guardar') { enMarcha--; return { data: 0, error: null } }
      return { data: null, error: null }
    }),
    from: vi.fn(() => { throw new Error('sin sesión no se lee ninguna tabla') }),
  } as unknown as SupabaseClient
  return { sb, rpcs, maximo: () => maximo }
}

const polares = (n: number): Pendiente[] =>
  Array.from({ length: n }, (_, i) => ({ id_deportista: i + 1, proveedor: 'polar' as const, hay_noches: true, hay_entrenos: true }))

describe('sincronizarTodos', () => {
  it('si la base no da la lista (llave mala, sin migrar…), no hace nada', async () => {
    const { sb } = sbServidor({ error: 'Solo desde el servidor' })
    expect(await sincronizarTodos(sb, 'llave')).toEqual({ ok: false, error: 'Solo desde el servidor' })
  })

  it('pide los que llevan más de tres horas y trae cada uno con SU deportista, de pocos en pocos', async () => {
    polarFalso({ sleep: 204, recharge: 204, exercises: 204 })
    const { sb, rpcs, maximo } = sbServidor(polares(5))
    const r = await sincronizarTodos(sb, 'llave', { aLaVez: 2 })
    expect(r.ok && r.todos).toMatchObject({ pendientes: 5, sinTiempo: 0 })
    expect(r.ok && r.todos.resultados.every(x => x.ok)).toBe(true)
    expect(rpcs[0]).toEqual({ fn: 'reloj_servidor_pendientes', args: { p_llave: 'llave', p_horas: HORAS_SIN_TRAER } })
    const guardados = rpcs.filter(x => x.fn === 'reloj_servidor_guardar').map(x => x.args.p_deportista).sort()
    expect(guardados).toEqual([1, 2, 3, 4, 5])
    expect(rpcs.every(x => x.args.p_llave === 'llave')).toBe(true)
    expect(maximo()).toBeLessThanOrEqual(2)
  })

  it('pasado el tope de tiempo no empieza más: quedan para la siguiente vuelta', async () => {
    polarFalso({ sleep: 204, recharge: 204, exercises: 204 })
    const { sb } = sbServidor(polares(5))
    let t = -60
    const r = await sincronizarTodos(sb, 'llave', { aLaVez: 1, tope: 100, ahora: () => (t += 60) })
    expect(r.ok && [r.todos.resultados.length, r.todos.sinTiempo]).toEqual([1, 4])
  })

  it('un fallo inesperado con uno no para a los demás', async () => {
    polarFalso({ sleep: 204, recharge: 204, exercises: 204 })
    const { sb } = sbServidor(polares(3), { fallaToken: 2 })
    const r = await sincronizarTodos(sb, 'llave')
    if (!r.ok) throw new Error('no debería fallar entero')
    const porDep = Object.fromEntries(r.todos.resultados.map(x => [x.id_deportista, x]))
    expect([porDep[1].ok, porDep[2].ok, porDep[3].ok]).toEqual([true, false, true])
    expect(porDep[2].inesperado).toBeInstanceOf(Error)
  })

  it('con COROS, la ventana sale de lo que dice la lista: con noches, una semana', async () => {
    const { llamadas } = corosFalso()
    const rpcs: string[] = []
    const sb = {
      rpc: vi.fn(async (fn: string) => {
        rpcs.push(fn)
        if (fn === 'reloj_servidor_pendientes') return { data: [{ id_deportista: 20, proveedor: 'coros', hay_noches: true, hay_entrenos: true }], error: null }
        if (fn === 'reloj_servidor_token') return { data: [tokenCoros()], error: null }
        if (fn === 'reloj_servidor_guardar') return { data: 0, error: null }
        return { data: 1, error: null }
      }),
      from: vi.fn(() => { throw new Error('sin sesión no se lee ninguna tabla') }),
    } as unknown as SupabaseClient
    const r = await sincronizarTodos(sb, 'llave')
    expect(r.ok && r.todos.resultados.map(x => x.ok)).toEqual([true])
    expect(llamadas('querySleepOverview').map(p => p.args?.startDate)).toEqual([sumarDias(hoyISO(), -6)])
    expect(rpcs).toEqual(['reloj_servidor_pendientes', 'reloj_servidor_token', 'reloj_servidor_guardar', 'reloj_servidor_guardar_crudo'])
  })
})
