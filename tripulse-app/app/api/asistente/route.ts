// Ruta del asistente del entrenador. Vive SOLO en el servidor: aquí es donde se usa
// la API key de Anthropic (ANTHROPIC_API_KEY), que nunca llega al navegador.
// Recibe { messages, contexto } y devuelve la respuesta de Claude en streaming.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { METODOLOGIA_ASISTENTE } from '@/lib/asistente'

export const runtime = 'nodejs'

const cabecerasTexto = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  // Aún sin key configurada → mensaje claro (no error feo) para la fase actual.
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      '⚠️ El asistente todavía no está configurado: falta la API key de Anthropic (ANTHROPIC_API_KEY) en el servidor. En cuanto la añadas al .env.local y reinicies, funcionará.',
      { status: 200, headers: cabecerasTexto },
    )
  }

  // Este endpoint gasta créditos → solo usuarios autenticados de TRIPULSE.
  // El cliente manda su token de Supabase; lo validamos aquí.
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return new Response('No autenticado.', { status: 401 })
  // Cliente autenticado como el usuario (su token) para que las lecturas respeten RLS.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return new Response('Sesión no válida.', { status: 401 })
  // El asistente gasta créditos de Anthropic y es una herramienta del ENTRENADOR:
  // no dejar que un deportista (u otro rol) lo dispare.
  const { data: perfil } = await sb.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'entrenador') return new Response('El asistente es solo para entrenadores.', { status: 403 })

  let body: any
  try { body = await req.json() } catch { return new Response('Petición inválida.', { status: 400 }) }

  const messages = Array.isArray(body?.messages) ? body.messages : []
  const contexto: string = typeof body?.contexto === 'string' ? body.contexto : ''
  if (!messages.length) return new Response('Sin mensajes.', { status: 400 })

  const anthropic = new Anthropic()

  const system: any[] = [
    { type: 'text', text: METODOLOGIA_ASISTENTE, cache_control: { type: 'ephemeral' } },
  ]
  if (contexto) system.push({ type: 'text', text: 'DATOS DEL DEPORTISTA (contexto actual):\n' + contexto })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const ms = anthropic.messages.stream({
          model: 'claude-opus-4-8',
          max_tokens: 2048,
          system,
          messages: messages.map((m: any) => ({
            role: m?.role === 'assistant' ? 'assistant' : 'user',
            content: String(m?.content ?? ''),
          })),
        })
        for await (const event of ms) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch (e: any) {
        const msg = /credit|balance|insufficient/i.test(e?.message || '')
          ? '\n\n⚠️ Sin saldo en la cuenta de Anthropic. Añade créditos para usar el asistente.'
          : '\n\n⚠️ Error al contactar con el asistente: ' + (e?.message || 'desconocido')
        controller.enqueue(encoder.encode(msg))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: cabecerasTexto })
}
