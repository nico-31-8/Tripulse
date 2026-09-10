import { describe, it, expect } from 'vitest'
import {
  EMISOR_COROS, emisorCoros, mcpDe, ALCANCE_COROS, REDIRECT_COROS_PRODUCCION, redirectCoros, cuerpoRegistro,
  crearVerificador, retoDe, urlAutorizacionCoros, cookiePkce, borrarCookiePkce, leerCookiePkce, COOKIE_PKCE,
  subDeIdToken, leerTokenCoros, leerRenovacionCoros, hayQueRenovar, inicializar, peticionMcp, leerRespuestaMcp, contenidoDeResultado,
  argumentosDeFechas, recortarParaAprender, motivoDeErrorCoros, HERRAMIENTAS_COROS,
} from './coros'

describe('región y direcciones', () => {
  it('se fija Europa, donde están los atletas', () => {
    expect(EMISOR_COROS).toBe('https://mcpeu.coros.com')
    expect(mcpDe(EMISOR_COROS)).toBe('https://mcpeu.coros.com/mcp')
  })
  it('se puede forzar otra región, sin barra al final', () => {
    expect(emisorCoros(' https://mcpus.coros.com/ ')).toBe('https://mcpus.coros.com')
    expect(emisorCoros(null)).toBe(EMISOR_COROS)
  })
  it('la vuelta: producción fija, localhost para desarrollar', () => {
    expect(redirectCoros('https://otro.example.com')).toBe(REDIRECT_COROS_PRODUCCION)
    expect(redirectCoros('http://localhost:3000')).toBe('http://localhost:3000/api/relojes/coros/callback')
    expect(redirectCoros('no es url')).toBe(REDIRECT_COROS_PRODUCCION)
  })
  it('las herramientas que se piden son las del README oficial', () => {
    expect([...HERRAMIENTAS_COROS]).toEqual(['querySleepData', 'querySleepHrv', 'queryRestingHeartRate', 'querySportRecords'])
  })
})

describe('alta dinámica', () => {
  const c = cuerpoRegistro(REDIRECT_COROS_PRODUCCION)
  it('pide lo mismo que el cliente oficial de COROS', () => {
    expect(c.grant_types).toEqual(['authorization_code', 'refresh_token'])
    expect(c.response_types).toEqual(['code'])
    expect(c.scope).toBe('openid offline_access mcp.tools')
    expect(c.token_endpoint_auth_method).toBe('none')
  })
  it('se presenta como TRIPULSE, que es lo que verá el atleta al dar permiso', () => {
    expect(c.client_name).toBe('TRIPULSE')
    expect(c.redirect_uris).toEqual([REDIRECT_COROS_PRODUCCION])
  })
})

describe('PKCE', () => {
  /* El ejemplo del propio estándar (RFC 7636, apéndice B). */
  it('el reto es el del ejemplo del RFC 7636', () => {
    expect(retoDe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('el verificador tiene 43 caracteres de base64url y no se repite', () => {
    const a = crearVerificador(), b = crearVerificador()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })
})

describe('urlAutorizacionCoros', () => {
  const u = new URL(urlAutorizacionCoros({ emisor: EMISOR_COROS, clientId: 'cli', redirect: REDIRECT_COROS_PRODUCCION, estado: 'est', reto: 'ret' }))
  it('va al autorizador de la región', () => expect(u.origin + u.pathname).toBe('https://mcpeu.coros.com/oauth2/authorize'))
  it('lleva PKCE, el alcance y el recurso MCP', () => {
    expect(u.searchParams.get('code_challenge')).toBe('ret')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('scope')).toBe(ALCANCE_COROS)
    expect(u.searchParams.get('resource')).toBe('https://mcpeu.coros.com/mcp')
    expect(u.searchParams.get('state')).toBe('est')
    expect(u.searchParams.get('response_type')).toBe('code')
  })
})

describe('la cookie del verificador', () => {
  const d = { v: 'x'.repeat(43), c: 'cliente-1', e: EMISOR_COROS }
  it('va y vuelve igual', () => {
    const set = cookiePkce(d)
    const valor = set.split(';')[0]
    expect(leerCookiePkce('otra=1; ' + valor + '; mas=2')).toEqual(d)
  })
  /* Si JavaScript pudiera leerla, un script ajeno podría llevarse el
     verificador; y sin Secure viajaría sin cifrar. */
  it('es HttpOnly, Secure y SameSite=Lax, y solo viaja a las rutas de COROS', () => {
    const set = cookiePkce(d)
    expect(set).toMatch(/HttpOnly/)
    expect(set).toMatch(/Secure/)
    expect(set).toMatch(/SameSite=Lax/)
    expect(set).toMatch(/Path=\/api\/relojes\/coros/)
  })
  it('borrarla la caduca en el acto', () => expect(borrarCookiePkce()).toMatch(/Max-Age=0/))
  it('sin cookie, o rota, no hay datos', () => {
    expect(leerCookiePkce(null)).toBeNull()
    expect(leerCookiePkce(COOKIE_PKCE + '=basura')).toBeNull()
    expect(leerCookiePkce('otra=1')).toBeNull()
  })
  it('un emisor que no es https no se acepta', () => {
    const set = cookiePkce({ ...d, e: 'http://malo.example.com' }).split(';')[0]
    expect(leerCookiePkce(set)).toBeNull()
  })
})

describe('el token', () => {
  const ahora = new Date('2026-09-10T10:00:00Z')
  const jwt = (carga: object) => 'h.' + Buffer.from(JSON.stringify(carga)).toString('base64url') + '.f'

  it('lee token, renovación, caducidad y quién es', () => {
    expect(leerTokenCoros({ access_token: 'a', refresh_token: 'r', expires_in: 3600, id_token: jwt({ sub: 'u-9' }) }, ahora))
      .toEqual({ accessToken: 'a', refreshToken: 'r', caducaEn: '2026-09-10T11:00:00.000Z', idExterno: 'u-9' })
  })
  /* Sin él, a la hora dejaría de funcionar y el atleta no sabría por qué. */
  it('sin token de renovación no vale', () => {
    expect(leerTokenCoros({ access_token: 'a', expires_in: 3600 }, ahora)).toBeNull()
  })
  it('sin caducidad, una hora, como el cliente oficial', () => {
    expect(leerTokenCoros({ access_token: 'a', refresh_token: 'r' }, ahora)!.caducaEn).toBe('2026-09-10T11:00:00.000Z')
  })
  it('sin id_token, sin identificador, y no pasa nada', () => {
    expect(leerTokenCoros({ access_token: 'a', refresh_token: 'r' }, ahora)!.idExterno).toBeNull()
    expect(subDeIdToken('no-es-un-jwt')).toBeNull()
    expect(subDeIdToken(null)).toBeNull()
  })
  it('un error no es un token', () => expect(leerTokenCoros({ error: 'invalid_grant' })).toBeNull())

  it('al renovar sin token de renovación nuevo, se sigue con el anterior', () => {
    expect(leerRenovacionCoros({ access_token: 'a2', expires_in: 3600 }, 'r-viejo', ahora)!.refreshToken).toBe('r-viejo')
  })
  it('al renovar con uno nuevo, se queda el nuevo: el viejo ya no vale', () => {
    expect(leerRenovacionCoros({ access_token: 'a2', refresh_token: 'r-nuevo' }, 'r-viejo', ahora)!.refreshToken).toBe('r-nuevo')
  })
  it('una renovación sin token de acceso no vale', () => {
    expect(leerRenovacionCoros({ error: 'invalid_grant' }, 'r-viejo', ahora)).toBeNull()
  })

  it('se renueva cuando falta menos de un minuto', () => {
    const t = Date.parse('2026-09-10T10:00:00Z')
    expect(hayQueRenovar('2026-09-10T10:00:30Z', t)).toBe(true)
    expect(hayQueRenovar('2026-09-10T10:05:00Z', t)).toBe(false)
    expect(hayQueRenovar(null, t)).toBe(true)
  })
})

describe('MCP', () => {
  it('initialize con la versión del protocolo del cliente oficial', () => {
    const p = inicializar()
    expect(p).toMatchObject({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    expect(p.params).toMatchObject({ protocolVersion: '2025-06-18', clientInfo: { name: 'TRIPULSE' } })
  })
  it('tools/call con su nombre y sus argumentos', () => {
    expect(peticionMcp(3, 'tools/call', { name: 'querySleepData', arguments: {} }))
      .toEqual({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'querySleepData', arguments: {} } })
  })

  it('lee una respuesta en JSON', () => {
    expect(leerRespuestaMcp('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}', 'application/json'))
      .toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } })
  })
  it('lee una respuesta en flujo de eventos, saltándose los avisos', () => {
    const flujo = [
      'event: message', 'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}', '',
      'event: message', 'data: {"jsonrpc":"2.0","id":2,', 'data: "result":{"tools":[]}}', '',
    ].join('\n')
    expect(leerRespuestaMcp(flujo, 'text/event-stream; charset=utf-8')).toEqual({ jsonrpc: '2.0', id: 2, result: { tools: [] } })
  })
  it('una respuesta vacía o rota no es nada', () => {
    expect(leerRespuestaMcp('', 'application/json')).toBeNull()
    expect(leerRespuestaMcp('<html>', 'text/html')).toBeNull()
  })

  it('prefiere el contenido estructurado', () => {
    expect(contenidoDeResultado({ structuredContent: { a: 1 }, content: [{ type: 'text', text: '{"b":2}' }] })).toEqual({ a: 1 })
  })
  it('si no, el texto, como JSON cuando lo es', () => {
    expect(contenidoDeResultado({ content: [{ type: 'text', text: '{"b":2}' }] })).toEqual({ b: 2 })
    expect(contenidoDeResultado({ content: [{ type: 'text', text: 'sin datos' }] })).toBe('sin datos')
  })
  it('sin contenido, nada', () => expect(contenidoDeResultado({ content: [] })).toBeNull())
})

/* Los esquemas de aquí son INVENTADOS para probar la función: COROS no publica
   los suyos. Lo que se prueba es que solo rellena lo que el esquema declara. */
describe('argumentosDeFechas', () => {
  it('rellena inicio y fin en texto AAAA-MM-DD', () => {
    expect(argumentosDeFechas({ properties: { startDate: { type: 'string' }, endDate: { type: 'string' } } }, '2026-08-13', '2026-09-10'))
      .toEqual({ startDate: '2026-08-13', endDate: '2026-09-10' })
  })
  it('en número, AAAAMMDD', () => {
    expect(argumentosDeFechas({ properties: { startDay: { type: 'integer' }, endDay: { type: 'integer' } } }, '2026-08-13', '2026-09-10'))
      .toEqual({ startDay: 20260813, endDay: 20260910 })
  })
  it('con formato date-time, el día entero', () => {
    expect(argumentosDeFechas({ properties: { from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' } } }, '2026-08-13', '2026-09-10'))
      .toEqual({ from: '2026-08-13T00:00:00Z', to: '2026-09-10T23:59:59Z' })
  })
  it('entiende también los nombres al revés y con guion bajo', () => {
    expect(argumentosDeFechas({ properties: { date_from: { type: 'string' }, date_to: { type: 'string' } } }, '2026-08-13', '2026-09-10'))
      .toEqual({ date_from: '2026-08-13', date_to: '2026-09-10' })
  })
  /* Lo que no es un rango no se toca: «calendar» y «trend» contienen «end». */
  it('no confunde con fechas nombres que solo se les parecen', () => {
    expect(argumentosDeFechas({ properties: { calendar: { type: 'string' }, trend: { type: 'string' }, sportType: { type: 'integer' } } }, '2026-08-13', '2026-09-10'))
      .toEqual({})
  })
  it('sin esquema, no manda nada: la herramienta usa lo suyo por defecto', () => {
    expect(argumentosDeFechas(null, '2026-08-13', '2026-09-10')).toEqual({})
  })
})

describe('recortarParaAprender', () => {
  it('lo pequeño pasa entero', () => expect(recortarParaAprender({ a: 1 })).toEqual({ a: 1 }))
  it('lo enorme se recorta y lo dice', () => {
    const r = recortarParaAprender('x'.repeat(100), 10) as { recortado: boolean; longitud: number }
    expect(r.recortado).toBe(true)
    expect(r.longitud).toBe(100)
  })
})

describe('motivoDeErrorCoros', () => {
  it('el 401 pide volver a conectar', () => expect(motivoDeErrorCoros(401)).toMatch(/vuelve a conectar/))
  it('cualquier otro dice el código', () => expect(motivoDeErrorCoros(418)).toMatch(/418/))
})
