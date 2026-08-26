// Ruta del planificador. Vive SOLO en el servidor: aquí es donde se usa la API
// key de Anthropic, que nunca llega al navegador.
//
// Recibe una semana YA GENERADA por las reglas (lib/plan-semana → plan-colocacion
// → plan-relleno) más el contexto del deportista, y devuelve la MISMA semana con
// los cambios que el modelo haya propuesto y hayan pasado el filtro.
//
// LA VALIDACIÓN SE HACE AQUÍ, NO EN EL CLIENTE. Se podría devolver la respuesta
// cruda y que el navegador la aplicase, pero entonces el filtro sería opcional:
// bastaría con no llamarlo. Aplicando en el servidor, lo que sale por esta ruta
// ya es una semana válida — el peor caso es que sea la que entró.
//
// Y SI ALGO FALLA, DEVUELVE LA SEMANA TAL CUAL. Sin key, con el modelo caído, con
// un timeout o con una respuesta que no se parsea, el entrenador recibe el plan
// determinista y un aviso de por qué no hubo revisión. Un planificador que se
// queda sin plan porque el proveedor está de baja no sirve de nada.

import Anthropic from '@anthropic-ai/sdk'
import { consumirCuota, mensajeDeTope } from '@/lib/cuota-api'
import { createClient } from '@supabase/supabase-js'
import {
  ESQUEMA_REVISION, INSTRUCCIONES_REVISION, aplicarRevision, describirSemanaParaIA,
  type RevisionIA,
} from '@/lib/plan-ia'
import type { SemanaRellena } from '@/lib/plan-relleno'
import { IA_PLANIFICADOR } from '@/lib/flags'

export const runtime = 'nodejs'

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

/** La semana de vuelta sin tocar, con el motivo de que no se revisara. */
const sinRevision = (semana: SemanaRellena, motivo: string) =>
  json({ semana, aplicados: [], rechazados: [], nota: '', revisada: false, motivo })

export async function POST(req: Request) {
  // Apagada en producción hasta probar la capa de IA a mano. Ver lib/flags.ts.
  if (!IA_PLANIFICADOR) return json({ error: 'La revisión con IA no está disponible.' }, 404)

  // El endpoint gasta créditos → solo usuarios autenticados, y solo entrenadores.
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'No autenticado.' }, 401)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Sesión no válida.' }, 401)
  const { data: perfil } = await sb.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'entrenador') return json({ error: 'El planificador es solo para entrenadores.' }, 403)
  /* El tope de llamadas. Va DESPUÉS de saber quién es: contar por usuario
     necesita el usuario, y una llamada sin sesión ya se ha ido en el 401. */
  const cuota = await consumirCuota(sb, 'plan')
  if (!cuota.ok) return json({ error: mensajeDeTope(cuota, 'planes') }, 429)


  let body: any
  try { body = await req.json() } catch { return json({ error: 'Petición inválida.' }, 400) }

  const semana: SemanaRellena | undefined = body?.semana
  if (!semana || !Array.isArray(semana.relleno) || !semana.relleno.length) {
    return json({ error: 'Falta la semana que hay que revisar.' }, 400)
  }
  const contexto: string = typeof body?.contexto === 'string' ? body.contexto : ''

  // Sin key no se falla: se devuelve el plan de las reglas, que es válido.
  if (!process.env.ANTHROPIC_API_KEY) {
    return sinRevision(semana, 'Falta la API key de Anthropic en el servidor. El plan es el que generan las reglas, sin revisión del asistente.')
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const mensaje = [
    contexto ? `CONTEXTO DEL DEPORTISTA:\n${contexto}` : 'No hay contexto del deportista: sin datos suyos, cambia solo lo que sea evidente.',
    '',
    'LA SEMANA QUE HAN GENERADO LAS REGLAS:',
    describirSemanaParaIA(semana),
    '',
    semana.avisos.length ? `Avisos que dejaron las reglas: ${semana.avisos.join(' ')}` : '',
    '',
    'Revísala. Si está bien, devuelve la lista de cambios vacía.',
  ].filter(Boolean).join('\n')

  try {
    const r = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: INSTRUCCIONES_REVISION,
      // Herramienta y no texto libre: lo que se necesita es una lista de cambios
      // con su clave exacta, y el esquema la obliga. Parsear prosa aquí sería
      // volver a abrir la puerta que cerramos con el catálogo cerrado.
      tools: [{
        name: 'revisar_semana',
        description: 'Devuelve los cambios que harías en la semana. Lista vacía si está bien.',
        input_schema: ESQUEMA_REVISION as any,
      }],
      tool_choice: { type: 'tool', name: 'revisar_semana' },
      messages: [{ role: 'user', content: mensaje }],
    })

    const uso = r.content.find(c => c.type === 'tool_use')
    if (!uso || uso.type !== 'tool_use') {
      return sinRevision(semana, 'El asistente no devolvió ninguna revisión.')
    }
    const revision = uso.input as RevisionIA

    // Aquí es donde se filtra. Nada de lo que devuelva el modelo llega al
    // entrenador sin pasar por esto.
    const { semana: revisada, aplicados, rechazados } = aplicarRevision(semana, revision)
    return json({ semana: revisada, aplicados, rechazados, nota: revision?.nota || '', revisada: true })
  } catch (e: any) {
    // Un fallo del proveedor no puede dejar al entrenador sin plan.
    return sinRevision(semana, 'El asistente no pudo revisar la semana (' + (e?.message || 'error desconocido') + '). El plan es el que generan las reglas.')
  }
}
