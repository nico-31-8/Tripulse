'use client'
// ============================================================
// El chat del deportista con su entrenador de IA
// ============================================================
// A diferencia del asistente del entrenador, aquí NO se manda contexto desde el
// navegador: lo arma el servidor con la sesión de quien pregunta. No hay
// elección de atleta que hacer —se habla de uno mismo— y dejar que el cliente
// mande su propio contexto sería dejarle escribir lo que el modelo cree saber
// de él.
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { SUGERENCIAS_ATLETA } from '@/lib/entrenador-ia'
import TextoAsistente from '@/components/TextoAsistente'

interface Mensaje { role: 'user' | 'assistant'; content: string }

export default function ChatEntrenador() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, enviando])

  const enviar = async (pregunta?: string) => {
    const q = (pregunta ?? texto).trim()
    if (!q || enviando) return
    setTexto('')
    const historial: Mensaje[] = [...mensajes, { role: 'user', content: q }]
    setMensajes(historial)
    setEnviando(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/entrenador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ messages: historial }),
      })

      if (!r.ok || !r.body) {
        const err = await r.text().catch(() => '')
        setMensajes([...historial, { role: 'assistant', content: err || 'No he podido contestarte. Prueba otra vez.' }])
        return
      }

      // Se va pintando según llega: esperar al final con un "pensando" hace que
      // parezca colgado cuando la respuesta es larga.
      const lector = r.body.getReader()
      const dec = new TextDecoder()
      let acc = ''
      setMensajes([...historial, { role: 'assistant', content: '' }])
      while (true) {
        const { done, value } = await lector.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setMensajes([...historial, { role: 'assistant', content: acc }])
      }
    } catch (e: any) {
      setMensajes([...historial, { role: 'assistant', content: 'Se ha cortado la conexión: ' + (e?.message || '') }])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 min-h-[120px]">
        {mensajes.length === 0 && (
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px] text-gray-500">Pregúntame lo que necesites. Por ejemplo:</p>
            <div className="flex flex-wrap gap-2">
              {SUGERENCIAS_ATLETA.map(s => (
                <button key={s} onClick={() => enviar(s)}
                  className="text-[12.5px] text-gray-300 bg-gray-900 border border-gray-800 hover:border-orange-500/60 hover:text-white rounded-xl px-3 py-2 transition text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => m.role === 'user' ? (
          <div key={i} className="flex justify-end">
            <p className="bg-orange-500/15 border border-orange-500/30 text-gray-100 text-[13.5px] rounded-2xl rounded-br-md px-3.5 py-2 max-w-[85%]">
              {m.content}
            </p>
          </div>
        ) : (
          // A todo el ancho, no en burbuja: la respuesta suele ser más larga que
          // la pregunta y en una burbuja queda más estrecha que ella.
          <div key={i} className="text-[13.5px] text-gray-200 leading-relaxed">
            {m.content ? <TextoAsistente texto={m.content} /> : <span className="text-gray-600">Pensando…</span>}
          </div>
        ))}
        <div ref={finRef} />
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          rows={1}
          placeholder="¿Qué me toca hoy?"
          className="flex-1 resize-none bg-gray-900 border border-gray-800 text-white text-[13.5px] px-3.5 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/60 max-h-32" />
        <button onClick={() => enviar()} disabled={enviando || !texto.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl transition flex-shrink-0">
          {enviando ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
