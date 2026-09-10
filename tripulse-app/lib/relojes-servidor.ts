// ============================================================
// TRIPULSE — Lo común a las rutas /api/relojes/*
// ============================================================
// SOLO PARA EL SERVIDOR. Lo usan las rutas de API; ninguna pantalla debe
// importarlo, porque las credenciales de los relojes viven en variables sin
// NEXT_PUBLIC_ y en el navegador saldrían vacías.
//
// Nada de esto usa la clave de servicio de Supabase, y es a propósito: la app
// no la ha usado nunca y esto no la introduce. Cada ruta habla con la base
// con el token de quien llama, o como anon en la vuelta de Polar, y todo lo
// delicado lo deciden funciones de la base que comprueban quién pregunta.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

const URL_SB = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Cliente sin sesión. Solo para la vuelta de Polar, que llega sin ella. */
export const clienteAnonimo = (): SupabaseClient =>
  createClient(URL_SB(), ANON(), { auth: { persistSession: false, autoRefreshToken: false } })

/**
 * El usuario que llama y un cliente que habla con la base COMO ÉL.
 *
 * Igual que el resto de rutas de la app: el token viaja en la cabecera, y es
 * la base —con ese token— la que decide qué puede ver y hacer. Nunca se fía
 * de un identificador que venga en el cuerpo de la petición.
 */
export async function quienLlama(req: Request): Promise<
  { ok: true; sb: SupabaseClient; uid: string } | { ok: false; respuesta: Response }
> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, respuesta: json({ error: 'No autenticado.' }, 401) }
  const sb = createClient(URL_SB(), ANON(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return { ok: false, respuesta: json({ error: 'Sesión no válida.' }, 401) }
  return { ok: true, sb, uid: user.id }
}

/** Tiempo máximo esperando a un proveedor: si se cuelga, que no se cuelgue la ruta con él. */
export const ESPERA_MS = 15_000
