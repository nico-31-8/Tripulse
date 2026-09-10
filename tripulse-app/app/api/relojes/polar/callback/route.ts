// La vuelta de Polar, después de que el deportista autorice.
//
// LLEGA SIN SESIÓN: es el navegador del deportista viniendo desde Polar, no
// una llamada de la app. Por eso quién es no se saca de ninguna cabecera, sino
// del `state` que se generó al pulsar Conectar. Ese estado es aleatorio, de un
// solo uso y caduca en 15 minutos; si no cuadra, no se guarda nada.
//
// El orden importa:
//   1. Cambiar el código por el token (con las credenciales del cliente, que
//      solo existen aquí, en el servidor).
//   2. Registrar al usuario con nuestro cliente. Sin esto Polar no da ningún
//      dato; un 409 es «ya estaba registrado» y no es un error.
//   3. Guardar, consumiendo el estado. El token va al almacén cifrado.
// Si algo falla antes del 3, no queda nada a medias en la base.
//
// Pase lo que pase, se vuelve al perfil con un mensaje que el deportista
// entienda: una pantalla en blanco o un JSON de error no le dicen qué hacer.

import { clienteAnonimo, ESPERA_MS } from '@/lib/relojes-servidor'
import { POLAR, basicAuth, leerToken, motivoDeError, redirectPolar } from '@/lib/polar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const u = new URL(req.url)
  const volver = (motivo: string | null) => {
    const destino = new URL('/perfil', u.origin)
    destino.searchParams.set('reloj', motivo ? 'polar-error' : 'polar-conectado')
    if (motivo) destino.searchParams.set('motivo', motivo)
    return Response.redirect(destino, 303)
  }

  const errorPolar = u.searchParams.get('error')
  if (errorPolar) {
    return volver(errorPolar === 'access_denied'
      ? 'No se dio permiso en Polar. Si fue sin querer, vuelve a pulsar Conectar.'
      : 'Polar ha devuelto un error (' + errorPolar + ').')
  }

  const code = u.searchParams.get('code')
  const estado = u.searchParams.get('state')
  if (!code || !estado) return volver('Faltan datos en la vuelta de Polar. Vuelve a pulsar Conectar.')

  const clientId = process.env.POLAR_CLIENT_ID
  const secreto = process.env.POLAR_CLIENT_SECRET
  if (!clientId || !secreto) return volver('El servidor no tiene configurada la conexión con Polar.')

  /* Tiene que ser la MISMA dirección que se mandó al autorizar: Polar la exige
     otra vez al dar el token. Por eso sale de la misma función. */
  const redirect = redirectPolar(u.origin, process.env.POLAR_REDIRECT_URL)

  try {
    // ---- 1. El token ----
    const rt = await fetch(POLAR.token, {
      method: 'POST',
      headers: {
        Authorization: basicAuth(clientId, secreto),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json;charset=UTF-8',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
      signal: AbortSignal.timeout(ESPERA_MS),
      cache: 'no-store',
    })
    const cuerpo = await rt.json().catch(() => null)
    const token = rt.ok ? leerToken(cuerpo) : null
    if (!token) {
      const cod = (cuerpo && typeof cuerpo === 'object' && 'error' in cuerpo) ? String((cuerpo as { error: unknown }).error) : String(rt.status)
      return volver('Polar no ha dado el permiso (' + cod + '). Vuelve a pulsar Conectar.')
    }

    // ---- 2. Registrar al usuario con nuestro cliente ----
    const rr = await fetch(POLAR.api + '/users', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token.accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ 'member-id': 'tripulse-' + token.idExterno }),
      signal: AbortSignal.timeout(ESPERA_MS),
      cache: 'no-store',
    })
    if (!rr.ok && rr.status !== 409) return volver(motivoDeError(rr.status))

    // ---- 3. Guardar, consumiendo el estado ----
    const { error } = await clienteAnonimo().rpc('reloj_completar', {
      p_estado: estado,
      p_proveedor: 'polar',
      p_id_externo: token.idExterno,
      p_access_token: token.accessToken,
      p_refresh_token: null,
      p_caduca_en: token.caducaEn,
    })
    if (error) return volver(error.message)

    return volver(null)
  } catch (e) {
    const agotado = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return volver(agotado ? 'Polar ha tardado demasiado en responder. Prueba otra vez.' : 'No se ha podido completar la conexión con Polar.')
  }
}
