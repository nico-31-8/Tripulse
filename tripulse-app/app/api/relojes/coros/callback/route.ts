// La vuelta de COROS, después de que el deportista autorice.
//
// Llega sin sesión, como la de Polar: quién es sale del `state`, de un solo uso.
// Y el verificador de PKCE sale de la cookie HttpOnly que puso «conectar» en
// este mismo navegador. Sin ella no se puede cambiar el código por el token,
// y es a propósito: quien interceptara la vuelta en otro navegador tendría el
// código pero no el verificador.
//
// El cliente que COROS dio de alta y la región se guardan con el token (en el
// Vault, como «extra»): sin ellos, a la hora no se podría renovar.

import { clienteAnonimo, ESPERA_MS } from '@/lib/relojes-servidor'
import { leerCookiePkce, borrarCookiePkce, leerTokenCoros, redirectCoros } from '@/lib/coros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const u = new URL(req.url)
  /* No con Response.redirect: sus cabeceras no se pueden tocar, y hace falta
     borrar la cookie del verificador en la misma respuesta. */
  const volver = (motivo: string | null) => {
    const destino = new URL('/perfil', u.origin)
    destino.searchParams.set('reloj', motivo ? 'coros-error' : 'coros-conectado')
    if (motivo) destino.searchParams.set('motivo', motivo)
    return new Response(null, { status: 303, headers: { Location: destino.toString(), 'Set-Cookie': borrarCookiePkce() } })
  }

  const errorCoros = u.searchParams.get('error')
  if (errorCoros) {
    return volver(errorCoros === 'access_denied'
      ? 'No se dio permiso en COROS. Si fue sin querer, vuelve a pulsar Conectar.'
      : 'COROS ha devuelto un error (' + errorCoros + ').')
  }

  const code = u.searchParams.get('code')
  const estado = u.searchParams.get('state')
  if (!code || !estado) return volver('Faltan datos en la vuelta de COROS. Vuelve a pulsar Conectar.')

  const pkce = leerCookiePkce(req.headers.get('cookie'))
  if (!pkce) {
    return volver('La conexión con COROS se perdió por el camino. Conecta desde el mismo navegador en el que la empezaste y vuelve a pulsar Conectar.')
  }

  const redirect = redirectCoros(u.origin, process.env.COROS_REDIRECT_URL)

  try {
    const rt = await fetch(pkce.e + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: pkce.c,
        code,
        redirect_uri: redirect,
        code_verifier: pkce.v,
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
      cache: 'no-store',
    })
    const cuerpo = await rt.json().catch(() => null)
    const token = rt.ok ? leerTokenCoros(cuerpo) : null
    if (!token) {
      const cod = (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo) ? String((cuerpo as { error: unknown }).error) : String(rt.status)
      return volver('COROS no ha dado el permiso (' + cod + '). Vuelve a pulsar Conectar.')
    }

    const { error } = await clienteAnonimo().rpc('reloj_completar', {
      p_estado: estado,
      p_proveedor: 'coros',
      p_id_externo: token.idExterno,
      p_access_token: token.accessToken,
      p_refresh_token: token.refreshToken,
      p_caduca_en: token.caducaEn,
      p_extra: { cliente: pkce.c, emisor: pkce.e },
    })
    if (error) return volver(error.message)

    return volver(null)
  } catch (e) {
    const agotado = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return volver(agotado ? 'COROS ha tardado demasiado en responder. Prueba otra vez.' : 'No se ha podido completar la conexión con COROS.')
  }
}
