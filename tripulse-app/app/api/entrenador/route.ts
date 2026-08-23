// ============================================================
// El entrenador de IA del DEPORTISTA
// ============================================================
// Gemela de /api/asistente, con dos diferencias que no son de detalle:
//
//   1. EL GUARDIÁN VA AL REVÉS. Aquella exige rol de entrenador; esta es del
//      atleta. Un entrenador que quiera hablar de un atleta tiene la suya, con
//      más datos y otro idioma.
//   2. EL CONTEXTO LO ARMA EL SERVIDOR, no el navegador. En la del entrenador lo
//      manda el cliente porque el entrenador elige de qué atleta hablar; aquí no
//      hay elección posible —se habla de quien pregunta— y dejar que el cliente
//      mande su propio contexto sería dejarle escribir lo que el modelo cree
//      saber de él.
//
// Vive solo en el servidor: la API key nunca llega al navegador.
import { hoyISO } from '@/lib/fechas'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { METODOLOGIA_ENTRENADOR_IA, contextoParaAtleta } from '@/lib/entrenador-ia'
import { horasDeAnamnesis } from '@/lib/anamnesis-datos'
import { semanasDelMesociclo } from '@/lib/plan-mesociclo'
import { sumarDias, diasEntre } from '@/lib/desplazar'

export const runtime = 'nodejs'

const cabecerasTexto = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      'Tu entrenador todavía no está disponible. Avisa a soporte: falta configurar la clave de la API.',
      { status: 200, headers: cabecerasTexto },
    )
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return new Response('No autenticado.', { status: 401 })

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return new Response('Sesión no válida.', { status: 401 })

  // Su ficha. Con RLS, esta consulta solo devuelve la suya.
  const { data: dep } = await sb.from('deportista')
    .select('id, nombre').eq('id_usuario', user.id).maybeSingle()
  if (!dep) return new Response('Esto es para deportistas: no encuentro tu ficha.', { status: 403 })

  let body: any
  try { body = await req.json() } catch { return new Response('Petición inválida.', { status: 400 }) }
  const messages = Array.isArray(body?.messages) ? body.messages : []
  if (!messages.length) return new Response('Sin mensajes.', { status: 400 })

  const hoy = hoyISO()
  const contexto = await armarContexto(sb, dep, hoy)

  const anthropic = new Anthropic()
  const stream = anthropic.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: METODOLOGIA_ENTRENADOR_IA, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'LO QUE SABES DE ÉL AHORA MISMO:\n' + contexto },
    ] as any,
    messages: messages.map((m: any) => ({ role: m.role, content: String(m.content ?? '') })),
  })

  const salida = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      try {
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && (ev as any).delta?.type === 'text_delta') {
            controller.enqueue(enc.encode((ev as any).delta.text))
          }
        }
      } catch (e: any) {
        controller.enqueue(enc.encode('\n\n(Se ha cortado la respuesta: ' + (e?.message || 'error') + ')'))
      }
      controller.close()
    },
  })
  return new Response(salida, { headers: cabecerasTexto })
}

/**
 * Lo que el modelo sabe de él, armado AQUÍ.
 *
 * Se lee lo justo para contestar «qué hago hoy» y «por qué»: su bloque actual,
 * su carrera, lo de hoy, lo que viene y lo que ha hecho últimamente. Nada de
 * índices ni de series históricas — con el atleta no se habla de eso.
 */
async function armarContexto(sb: any, dep: any, hoy: string) {
  const desde = sumarDias(hoy, -14)
  const hasta = sumarDias(hoy, 7)

  const [{ data: mesos }, { data: comps }, { data: ses }, { data: an }] = await Promise.all([
    sb.from('mesociclo').select('id, objetivo, tipo, fecha_inicio, duracion_semanas')
      .eq('id_deportista', dep.id).order('fecha_inicio'),
    sb.from('competicion').select('nombre, fecha, prioridad')
      .eq('id_deportista', dep.id).gte('fecha', hoy).order('fecha').limit(3),
    sb.from('sesion').select('fecha_sesion, disciplina, estado, duracion_minutos, duracion_real, rpe_reportado')
      .eq('id_deportista', dep.id).gte('fecha_sesion', desde).lte('fecha_sesion', hasta)
      .or('eliminada.is.null,eliminada.eq.false').order('fecha_sesion'),
    sb.from('anamnesis').select('volumen_semanal, dias_semana').eq('id_deportista', dep.id).maybeSingle(),
  ])

  // En qué bloque está y qué semana de él: el primero que aún no ha terminado.
  const lista = (mesos || []).map((m: any) => ({ ...m, fecha_inicio: String(m.fecha_inicio).slice(0, 10) }))
  const actual = lista.find((m: any) => sumarDias(m.fecha_inicio, (m.duracion_semanas || 4) * 7) > hoy)
  let bloque = null
  if (actual) {
    const n = Math.floor(diasEntre(actual.fecha_inicio, hoy) / 7) + 1
    const sem = semanasDelMesociclo({
      tipo: actual.tipo, semanas: actual.duracion_semanas || 4,
      horasReferencia: horasDeAnamnesis(an?.volumen_semanal) ?? 8, distancia: 'medio',
    })
    bloque = {
      nombre: actual.objetivo || 'Bloque',
      tipo: actual.tipo || '—',
      semanaN: Math.max(1, n),
      semanas: actual.duracion_semanas || 4,
      esDescarga: !!sem[Math.max(0, n - 1)]?.esDescarga,
    }
  }

  const todas = (ses || []).map((s: any) => ({ ...s, fecha: String(s.fecha_sesion).slice(0, 10) }))
  const comp = (comps || [])[0]

  return contextoParaAtleta({
    nombre: dep.nombre,
    hoy,
    bloque,
    competicion: comp ? {
      nombre: comp.nombre,
      fecha: String(comp.fecha).slice(0, 10),
      semanas: Math.floor(diasEntre(hoy, String(comp.fecha).slice(0, 10)) / 7),
    } : null,
    sesionesHoy: todas.filter((s: any) => s.fecha === hoy)
      .map((s: any) => ({ disciplina: s.disciplina, minutos: s.duracion_minutos })),
    proximas: todas.filter((s: any) => s.fecha > hoy)
      .map((s: any) => ({ fecha: s.fecha, disciplina: s.disciplina })),
    ultimas: todas.filter((s: any) => s.fecha < hoy).slice(-10)
      .map((s: any) => ({
        fecha: s.fecha, disciplina: s.disciplina,
        minutos: s.duracion_real || s.duracion_minutos,
        rpe: s.rpe_reportado,
        hecha: s.estado === 'Realizada',
      })),
    horasSemana: an?.volumen_semanal ?? null,
    diasSemana: an?.dias_semana ?? null,
  })
}
