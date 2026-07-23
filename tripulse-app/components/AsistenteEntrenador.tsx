'use client'
// Panel de chat del asistente del entrenador.
// Carga el deportista activo (localStorage), arma su contexto con la sesión Supabase
// del entrenador (respeta RLS) y lo manda a /api/asistente, mostrando la respuesta
// en streaming. La API key nunca pasa por aquí: vive en el servidor.
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getAtletaActivo } from '@/lib/atletaActivo'
import { construirContextoTexto } from '@/lib/asistente'

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGERENCIAS = [
  'Resúmeme la semana de este deportista',
  '¿Cómo está de frescura y qué le pondría hoy?',
  'Propón la sesión de mañana según su readiness',
  '¿Va bien encaminado para su próxima competición?',
]

export default function AsistenteEntrenador() {
  const router = useRouter()
  const [dep, setDep] = useState<any>(null)
  const [contexto, setContexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [sinAtleta, setSinAtleta] = useState(false)
  const [mensajes, setMensajes] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cargar = async () => {
      const id = getAtletaActivo()
      if (!id) { setSinAtleta(true); setCargando(false); return }
      const { data: d } = await supabase.from('deportista').select('*').eq('id', id).single()
      if (!d) { setSinAtleta(true); setCargando(false); return }
      setDep(d)
      try { setContexto(await construirContextoTexto(supabase, d)) } catch { /* seguimos sin contexto */ }
      setCargando(false)
    }
    cargar()
  }, [])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [mensajes])

  const enviar = async (texto?: string) => {
    const t = (texto ?? input).trim()
    if (!t || enviando) return
    const previos: Msg[] = [...mensajes, { role: 'user', content: t }]
    setMensajes([...previos, { role: 'assistant', content: '' }])
    setInput('')
    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/asistente', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({ messages: previos, contexto }),
      })
      if (!res.ok) { const errTxt = await res.text().catch(() => ''); throw new Error(errTxt || ('Error ' + res.status)) }
      if (!res.body) throw new Error('sin cuerpo')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setMensajes(prev => { const c = [...prev]; c[c.length - 1] = { role: 'assistant', content: acc }; return c })
      }
    } catch (e: any) {
      setMensajes(prev => { const c = [...prev]; c[c.length - 1] = { role: 'assistant', content: '⚠️ ' + (e?.message || 'No se pudo contactar con el asistente. Revisa la conexión.') }; return c })
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Preparando el asistente…</div>

  if (sinAtleta) return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-3">🤖</div>
        <p className="font-semibold text-lg mb-1">Asistente del entrenador</p>
        <p className="text-gray-400 text-sm mb-5">Elige primero un deportista en el dashboard y vuelve aquí.</p>
        <button onClick={() => router.push('/dashboard')} className="bg-orange-500 hover:bg-orange-400 px-5 py-2.5 rounded-xl text-sm font-semibold transition">Ir al dashboard →</button>
      </div>
    </main>
  )

  return (
    <main className="h-screen bg-gray-950 text-white flex flex-col">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center text-lg flex-shrink-0">🤖</div>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">Asistente del entrenador</p>
          <p className="text-gray-500 text-xs truncate">Copiloto para {dep?.nombre} · propone, tú decides</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="ml-auto text-gray-500 hover:text-gray-300 text-sm transition flex-shrink-0">← Dashboard</button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">
          {mensajes.length === 0 ? (
            <div className="mt-6">
              <p className="text-gray-400 text-sm mb-4">Pregúntame sobre <span className="text-white font-medium">{dep?.nombre}</span>. Tengo su carga, wellness, tests, volumen y próximas sesiones.</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {SUGERENCIAS.map(s => (
                  <button key={s} onClick={() => enviar(s)}
                    className="text-left text-sm bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-gray-300 hover:border-gray-600 hover:text-white transition">
                    {s}
                  </button>
                ))}
              </div>
              {!contexto && <p className="text-amber-400/70 text-xs mt-4">Nota: no he podido cargar el contexto del deportista; responderé de forma general.</p>}
            </div>
          ) : (
            mensajes.map((m, i) => (
              <div key={i} className={'flex ' + (m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={'rounded-2xl px-4 py-2.5 max-w-[85%] text-sm whitespace-pre-wrap leading-relaxed ' +
                  (m.role === 'user' ? 'bg-orange-500 text-white' : 'bg-gray-900 border border-gray-800 text-gray-200')}>
                  {m.content || (enviando ? <span className="text-gray-500">escribiendo…</span> : '')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <footer className="border-t border-gray-800 px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
            rows={1} placeholder={`Escribe sobre ${dep?.nombre}…`}
            className="flex-1 resize-none bg-gray-900 border border-gray-800 text-white text-sm px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/60 max-h-32" />
          <button onClick={() => enviar()} disabled={!input.trim() || enviando}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:hover:bg-orange-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition flex-shrink-0">
            {enviando ? '…' : 'Enviar'}
          </button>
        </div>
        <p className="max-w-2xl mx-auto text-gray-600 text-[11px] mt-2 text-center">El asistente propone; la decisión final es tuya. No sustituye criterio médico.</p>
      </footer>
    </main>
  )
}
