// ============================================================
// TRIPULSE — Hablar con /api/relojes desde el navegador
// ============================================================
// Lo usan la tarjeta del reloj en el perfil y el formulario de wellness, que
// antes de preguntar las horas de sueño trae la noche de Polar. Un solo sitio
// para las dos: si la forma de llamar cambia, cambia para ambas.
//
// Las cuentas (juntar noches, pasar minutos a horas) viven en noches-reloj.ts,
// sin nada de red, para poder probarlas.

import { supabase } from '@/lib/supabase'

export interface RespuestaReloj { ok: boolean; cuerpo: Record<string, unknown> }

/** POST a una ruta de /api/relojes con el token de quien está en la app. */
export async function llamarReloj(ruta: string): Promise<RespuestaReloj> {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(ruta, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (session?.access_token || '') },
  })
  const cuerpo = await r.json().catch(() => ({}))
  return { ok: r.ok, cuerpo }
}
