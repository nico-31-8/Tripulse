// Genera una semana ENTERA con el modelo, la juzga y, si no pasa, le devuelve los
// incumplimientos para que la arregle. Vive solo en el servidor: la API key nunca
// llega al navegador.
//
// EL BUCLE ES LO QUE HACE QUE ESTO SEA VIABLE
//   1. El modelo monta la semana eligiendo del catálogo cerrado.
//   2. El verificador la juzga con las mismas reglas que usa el generador
//      determinista.
//   3. Si hay errores, se le devuelven con su fuente y vuelve a intentarlo.
//   4. Si tras tres intentos sigue sin pasar, se usa la semana determinista, que
//      es válida por construcción.
//
// O sea que el peor caso de esta ruta es gastar unas décimas de euro y devolver
// exactamente lo que habría devuelto sin llamar a nadie. Nunca sale de aquí una
// semana que incumpla las reglas.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import {
  ESQUEMA_SEMANA, INSTRUCCIONES_GENERACION, encargoParaIA, encargoDeArreglo,
  aVerificables, aRelleno, type SemanaIA,
} from '@/lib/plan-generador-ia'
import { verificarSemana, resumenVeredicto, type Veredicto } from '@/lib/plan-verificador'
import { nivelDePlantilla } from '@/lib/plan-relleno'
import type { EntradaSemana, FormaSemana } from '@/lib/plan-semana'
import type { DiaDisponible } from '@/lib/plan-colocacion'

export const runtime = 'nodejs'
export const maxDuration = 120

const INTENTOS = 3

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'No autenticado.' }, 401)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Sesión no válida.' }, 401)
  const { data: perfil } = await sb.from('perfiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'entrenador') return json({ error: 'El planificador es solo para entrenadores.' }, 403)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Petición inválida.' }, 400) }

  const entrada: EntradaSemana | undefined = body?.entrada
  const forma: FormaSemana | undefined = body?.forma
  const dias: DiaDisponible[] | number = body?.dias ?? entrada?.diasSemana ?? 6
  const contexto: string = typeof body?.contexto === 'string' ? body.contexto : ''
  if (!entrada || !forma) return json({ error: 'Falta el encargo (entrada y forma).' }, 400)

  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ generada: false, motivo: 'Falta la API key de Anthropic en el servidor.' })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const nivel = nivelDePlantilla(entrada.nivel)
  const ctxVerif = { entrada, forma, dias }

  const mensajes: Anthropic.MessageParam[] = [
    { role: 'user', content: encargoParaIA({ entrada, forma, dias, contexto }) },
  ]
  const historial: { intento: number; veredicto: string; errores: number }[] = []

  try {
    for (let intento = 1; intento <= INTENTOS; intento++) {
      const r = await anthropic.messages.create({
        model: 'claude-opus-5',
        max_tokens: 12000,
        thinking: { type: 'adaptive' },
        system: INSTRUCCIONES_GENERACION,
        tools: [{ name: 'montar_semana', description: 'Devuelve la semana completa.', input_schema: ESQUEMA_SEMANA as any }],
        tool_choice: { type: 'tool', name: 'montar_semana' },
        messages: mensajes,
      })

      const uso = r.content.find(c => c.type === 'tool_use')
      if (!uso || uso.type !== 'tool_use') {
        historial.push({ intento, veredicto: 'no devolvió semana', errores: -1 })
        break
      }
      const semanaIA = uso.input as SemanaIA
      const { sesiones, descartadas } = aVerificables(semanaIA)
      const veredicto: Veredicto = verificarSemana(sesiones, ctxVerif)
      const errores = veredicto.incumplimientos.filter(x => x.gravedad === 'error').length
      historial.push({ intento, veredicto: resumenVeredicto(veredicto), errores })

      if (veredicto.vale && !descartadas.length) {
        return json({
          generada: true,
          intentos: intento,
          historial,
          relleno: aRelleno(sesiones, nivel, semanaIA.razonamiento),
          razonamiento: semanaIA.razonamiento || '',
          avisos: veredicto.incumplimientos.filter(x => x.gravedad === 'aviso').map(x => x.texto),
        })
      }

      if (intento === INTENTOS) break
      // Se le devuelve lo que devolvió más lo que incumple, y vuelve a intentarlo.
      mensajes.push({ role: 'assistant', content: [uso as any] })
      mensajes.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: uso.id, content: encargoDeArreglo(semanaIA, veredicto.paraElModelo, descartadas) }] as any,
      })
    }

    return json({
      generada: false,
      intentos: historial.length,
      historial,
      motivo: `El asistente no consiguió una semana que cumpla las reglas en ${historial.length} intento(s). Se usa la de las reglas.`,
    })
  } catch (e: any) {
    return json({ generada: false, historial, motivo: 'El asistente falló: ' + (e?.message || 'error desconocido') })
  }
}
