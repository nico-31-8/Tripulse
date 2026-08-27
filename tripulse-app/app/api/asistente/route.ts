// Ruta del asistente del entrenador. Vive SOLO en el servidor: aquí es donde se usa
// la API key de Anthropic (ANTHROPIC_API_KEY), que nunca llega al navegador.
// Recibe { messages, contexto } y devuelve la respuesta de Claude en streaming.

import Anthropic from '@anthropic-ai/sdk'
import { REGLA_DATOS_AJENOS, bloqueDeDatos } from '@/lib/contexto-seguro'
import { consumirCuota, mensajeDeTope } from '@/lib/cuota-api'
import { createClient } from '@supabase/supabase-js'
import { METODOLOGIA_ASISTENTE } from '@/lib/asistente'
import { ESQUEMA_PROPUESTA } from '@/lib/propuesta-sesion'

/* Separador entre la respuesta en texto y la propuesta en JSON. Va al final del
   stream, así el cliente puede ir pintando el texto y quedarse con la propuesta
   cuando llega. Se usa una marca que la prosa no va a escribir jamás. */
export const MARCA_PROPUESTA = '\n<<<PROPUESTA>>>\n'

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
  /* El tope de llamadas. Va DESPUÉS de saber quién es: contar por usuario
     necesita el usuario, y una llamada sin sesión ya se ha ido en el 401. */
  const cuota = await consumirCuota(sb, 'asistente')
  if (!cuota.ok) return new Response(mensajeDeTope(cuota, 'consultas al asistente'), { status: 429, headers: cabecerasTexto })


  let body: any
  try { body = await req.json() } catch { return new Response('Petición inválida.', { status: 400 }) }

  const messages = Array.isArray(body?.messages) ? body.messages : []
  const contexto: string = typeof body?.contexto === 'string' ? body.contexto : ''
  // Qué pantalla tiene delante el entrenador. Va como bloque aparte para que el
  // modelo lo trate como el "aquí y ahora" y no lo mezcle con el histórico.
  const modulo: string = typeof body?.modulo === 'string' ? body.modulo : ''
  const contextoModulo: string = typeof body?.contextoModulo === 'string' ? body.contextoModulo : ''
  if (!messages.length) return new Response('Sin mensajes.', { status: 400 })

  const anthropic = new Anthropic()

  /* La regla de los datos ajenos va pegada a la metodología y con el mismo
     cache_control: es parte del encargo permanente, no del contexto de esta
     conversación. */
  const system: any[] = [
    { type: 'text', text: METODOLOGIA_ASISTENTE + '\n\n' + REGLA_DATOS_AJENOS, cache_control: { type: 'ephemeral' } },
  ]
  /* Las notas y la anamnesis las escribió el ATLETA, no el entrenador que está
     preguntando. Van acotadas para que una frase suya no se lea como una orden
     al asistente de su entrenador. */
  if (contexto) {
    const bloque = bloqueDeDatos('Datos del deportista (contexto actual)', contexto)
    if (bloque) system.push({ type: 'text', text: bloque })
  }
  if (contextoModulo) {
    system.push({
      type: 'text',
      text: bloqueDeDatos(`Pantalla que tiene delante ahora mismo${modulo ? ` (módulo ${modulo})` : ''}`, contextoModulo) +
        '\n\nSi la pregunta es ambigua, interprétala sobre esto: es lo que está mirando. ' +
        'No se lo repitas de vuelta —ya lo ve—; úsalo para interpretarlo y decirle qué hacer.',
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const ms = anthropic.messages.stream({
          model: 'claude-opus-5',
          // El pensamiento consume de max_tokens, así que hay que subirlo o la
          // respuesta se queda a medias justo en las preguntas más complejas.
          // Opus 5 piensa más que 4.8 y encima aquí caben tres cosas: el
          // pensamiento, la respuesta y el JSON de la propuesta.
          max_tokens: 16000,
          // Razona mejor sobre números (TSB, ACWR, índices) antes de opinar. No se
          // muestra: abajo solo se reenvían los `text_delta`, nunca los de thinking.
          thinking: { type: 'adaptive' },
          // Herramienta, no structured output: así el modelo escribe su respuesta
          // normal Y ADEMÁS propone la sesión, en vez de tener que elegir entre las
          // dos cosas. Si la pregunta no pide una sesión, simplemente no la llama.
          tools: [{
            name: 'proponer_sesion',
            description:
              'Propone UNA sesión concreta para el deportista. Úsala solo cuando el entrenador pida ' +
              'qué entrenar (hoy, mañana, esta semana) o cuando propongas una sesión en tu respuesta. ' +
              'Los bloques deben ser aplicables tal cual: zona del catálogo, y minutos (o metros en ' +
              'natación). Justifica en `porque` con los datos concretos del atleta, no con generalidades.',
            input_schema: ESQUEMA_PROPUESTA as any,
          }],
          system,
          messages: messages.map((m: any) => ({
            role: m?.role === 'assistant' ? 'assistant' : 'user',
            content: String(m?.content ?? ''),
          })),
        })
        // El JSON de la herramienta llega troceado en `input_json_delta`: se acumula
        // y se manda entero al final, detrás de la marca.
        let jsonPropuesta = ''
        let enHerramienta = false
        for await (const event of ms) {
          if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            enHerramienta = true
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text))
            } else if (event.delta.type === 'input_json_delta' && enHerramienta) {
              jsonPropuesta += event.delta.partial_json
            }
          } else if (event.type === 'content_block_stop') {
            enHerramienta = false
          }
        }
        if (jsonPropuesta.trim()) {
          // Se valida aquí que al menos sea JSON: si el modelo lo dejó a medias,
          // mejor no mandar basura al cliente y que la respuesta valga igual.
          try {
            JSON.parse(jsonPropuesta)
            controller.enqueue(encoder.encode(MARCA_PROPUESTA + jsonPropuesta))
          } catch { /* propuesta incompleta: se ignora, el texto ya ha llegado */ }
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
