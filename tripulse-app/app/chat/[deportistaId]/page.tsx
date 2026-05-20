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
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { cargar() }, [deportistaId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes])

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
    const { data } = await supabase.from('mensajes').insert({
      id_entrenador: entrenadorId,
      id_deportista: Number(deportistaId),
      contenido: texto.trim(),
      autor: miRol,
      leido: false,
    }).select().single()
    if (data) setMensajes(prev => [...prev, data])
    setTexto('')
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
                <div className={'max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ' +
                  (esMio ? 'bg-orange-500 text-white rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm')}>
                  <p>{m.contenido}</p>
                  <p className={'text-xs mt-1 ' + (esMio ? 'text-orange-200 text-right' : 'text-gray-500')}>
                    {formatHora(m.created_at)}
                    {esMio && <span className="ml-1">{m.leido ? '✓✓' : '✓'}</span>}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="bg-gray-900 border-t border-gray-800 px-4 py-3 flex gap-2 items-end">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          placeholder="Escribe un mensaje..."
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
