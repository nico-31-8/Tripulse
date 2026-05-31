'use client'
import { useState, useEffect, use, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function ChatPage({ params }: { params: Promise<{ deportistaId: string }> }) {
  const { deportistaId } = use(params)
  const [mensajes, setMensajes] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [miRol, setMiRol] = useState<'entrenador' | 'deportista' | null>(null)
  const [deportista, setDeportista] = useState<any>(null)
  const [entrenadorId, setEntrenadorId] = useState<string | null>(null)
  const [citaActiva, setCitaActiva] = useState<{ texto: string; disciplina?: string; fecha?: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const cita = p.get('cita')
    if (cita) {
      setCitaActiva({
        texto: cita,
        disciplina: p.get('disciplina') || undefined,
        fecha: p.get('fecha') || undefined,
      })
    }
  }, [])

  useEffect(() => { cargar() }, [deportistaId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes])
  useEffect(() => { if (citaActiva) textareaRef.current?.focus() }, [citaActiva])

  const cargar = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
    const rol = p?.rol === 'deportista' ? 'deportista' : 'entrenador'
    setMiRol(rol)
    const { data: dep } = await supabase.from('deportista').select('id, nombre, id_entrenador').eq('id', Number(deportistaId)).single()
    setDeportista(dep)
    if (rol === 'entrenador') {
      setEntrenadorId(user.id)
    } else {
      setEntrenadorId(dep?.id_entrenador || null)
    }
    await supabase.from('mensajes')
      .update({ leido: true })
      .eq('id_deportista', Number(deportistaId))
      .eq('autor', rol === 'entrenador' ? 'deportista' : 'entrenador')
      .eq('leido', false)
    const { data: msgs } = await supabase.from('mensajes')
      .select('*')
      .eq('id_deportista', Number(deportistaId))
      .order('created_at', { ascending: true })
    setMensajes(msgs || [])
    setLoading(false)
  }

  const enviar = async () => {
    if (!texto.trim() || !miRol || !entrenadorId) return
    setEnviando(true)
    const insertar: any = {
      id_entrenador: entrenadorId,
      id_deportista: Number(deportistaId),
      contenido: texto.trim(),
      autor: miRol,
      leido: false,
    }
    if (citaActiva) {
      insertar.contexto = citaActiva.texto
      insertar.contexto_disciplina = citaActiva.disciplina || null
      insertar.contexto_fecha = citaActiva.fecha || null
    }
    const { data } = await supabase.from('mensajes').insert(insertar).select().single()
    if (data) setMensajes(prev => [...prev, data])
    setTexto('')
    setCitaActiva(null)
    setEnviando(false)
  }

  const formatHora = (ts: string) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const formatFecha = (ts: string) => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <nav className="bg-gray-900 px-4 py-4 flex items-center gap-3 border-b border-gray-800">
        <button onClick={() => window.history.back()} className="text-gray-400 hover:text-white text-sm transition">←</button>
        <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
          {deportista?.nombre?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <p className="font-bold text-sm">{deportista?.nombre || 'Deportista'}</p>
          <p className="text-gray-500 text-xs">Chat directo</p>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
        {mensajes.length === 0 && (
          <div className="text-center py-16 text-gray-600">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm">Sin mensajes todavía. ¡Empieza la conversación!</p>
          </div>
        )}
        {mensajes.map((m, i) => {
          const esMio = m.autor === miRol
          const anterior = mensajes[i - 1]
          const mismaFecha = anterior && formatFecha(anterior.created_at) === formatFecha(m.created_at)
          return (
            <div key={m.id}>
              {!mismaFecha && (
                <div className="text-center my-3">
                  <span className="text-gray-600 text-xs bg-gray-900 px-3 py-1 rounded-full">{formatFecha(m.created_at)}</span>
                </div>
              )}
              <div className={'flex ' + (esMio ? 'justify-end' : 'justify-start')}>
                <div className="max-w-xs lg:max-w-md">
                  {m.contexto && (
                    <div className={'px-3 py-2 rounded-t-xl text-xs border-l-2 mb-px ' +
                      (esMio
                        ? 'bg-orange-700/50 border-orange-300 text-orange-100'
                        : 'bg-gray-700 border-gray-500 text-gray-300')}>
                      <div className="flex items-center gap-1.5 mb-1 font-medium opacity-80">
                        <span>↩</span>
                        <span>Feedback de sesión</span>
                        {m.contexto_disciplina && <span className="opacity-60">· {m.contexto_disciplina}</span>}
                        {m.contexto_fecha && <span className="opacity-60">· {m.contexto_fecha}</span>}
                      </div>
                      <p className="italic line-clamp-2 opacity-90">"{m.contexto}"</p>
                    </div>
                  )}
                  <div className={'px-4 py-2.5 text-sm ' + (
                    m.contexto
                      ? (esMio ? 'bg-orange-500 text-white rounded-b-2xl rounded-tr-2xl' : 'bg-gray-800 text-gray-100 rounded-b-2xl rounded-tl-2xl')
                      : (esMio ? 'bg-orange-500 text-white rounded-2xl rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-2xl rounded-bl-sm')
                  )}>
                    <p>{m.contenido}</p>
                    <p className={'text-xs mt-1 ' + (esMio ? 'text-orange-200 text-right' : 'text-gray-500')}>
                      {formatHora(m.created_at)}
                      {esMio && <span className="ml-1">{m.leido ? '✓✓' : '✓'}</span>}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {citaActiva && (
        <div className="bg-gray-800 border-t border-orange-500/40 px-4 py-2.5 flex items-start gap-3">
          <div className="flex-1 border-l-2 border-orange-400 pl-3">
            <p className="text-orange-400 text-xs font-medium mb-0.5">
              ↩ Respondiendo a feedback
              {citaActiva.disciplina && <span className="text-orange-300/60 ml-1">· {citaActiva.disciplina}</span>}
              {citaActiva.fecha && <span className="text-orange-300/60 ml-1">· {citaActiva.fecha}</span>}
            </p>
            <p className="text-gray-300 text-xs italic line-clamp-2">"{citaActiva.texto}"</p>
          </div>
          <button onClick={() => setCitaActiva(null)} className="text-gray-500 hover:text-white text-xl leading-none mt-0.5 flex-shrink-0 transition">×</button>
        </div>
      )}

      <div className="bg-gray-900 border-t border-gray-800 px-4 py-3 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          placeholder={citaActiva ? 'Escribe tu respuesta...' : 'Escribe un mensaje...'}
          rows={1}
          className="flex-1 bg-gray-800 text-white px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 resize-none text-sm"
        />
        <button onClick={enviar} disabled={enviando || !texto.trim()}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl font-bold transition text-sm flex-shrink-0">
          ➤
        </button>
      </div>
    </main>
  )
}
