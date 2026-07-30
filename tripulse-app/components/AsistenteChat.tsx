'use client'
// Conversación del asistente. Es la pieza compartida: la usan tanto la página
// (/asistente) como el panel flotante que vive en todos los módulos. La API key
// nunca pasa por aquí — se manda a /api/asistente y allí es donde vive.
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ContextoModulo } from '@/lib/contexto-modulo'
import TextoAsistente from './TextoAsistente'
import TarjetaPropuesta from './TarjetaPropuesta'
import type { PropuestaSesion } from '@/lib/propuesta-sesion'

export interface Msg { role: 'user' | 'assistant'; content: string; propuesta?: PropuestaSesion | null }

/* Debe coincidir con MARCA_PROPUESTA de app/api/asistente/route.ts. */
const MARCA = '\n<<<PROPUESTA>>>\n'

/** Separa la respuesta en texto de la sesión propuesta, si la hay. */
function partir(acc: string): { texto: string; propuesta: PropuestaSesion | null } {
  const i = acc.indexOf(MARCA)
  if (i === -1) return { texto: acc, propuesta: null }
  const texto = acc.slice(0, i)
  try {
    return { texto, propuesta: JSON.parse(acc.slice(i + MARCA.length)) as PropuestaSesion }
  } catch {
    // Puede llegar troceada mientras dura el stream: hasta que cierre, solo texto.
    return { texto, propuesta: null }
  }
}

interface Props {
  nombre: string
  /** Contexto del deportista (carga, wellness, tests, sesiones recientes). */
  contexto: string
  /** Qué está mirando ahora mismo, si el módulo lo declara. */
  modulo?: ContextoModulo | null
  /** Preguntas de arranque. Las del módulo activo van primero. */
  sugerencias: string[]
  /** Para que la tarjeta de propuesta sepa a qué calendario llevar. */
  depId?: number | null
  /** En el panel flotante hay menos sitio: burbujas y márgenes más apretados. */
  compacto?: boolean
}

export default function AsistenteChat({ nombre, contexto, modulo, sugerencias, compacto, depId }: Props) {
  const [mensajes, setMensajes] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes])

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
        body: JSON.stringify({
          messages: previos,
          contexto,
          // Lo que hay en pantalla ahora mismo. El servidor lo añade como un
          // bloque aparte para que el modelo sepa que es el "aquí y ahora".
          modulo: modulo ? modulo.modulo : null,
          contextoModulo: modulo ? modulo.resumen : null,
        }),
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
        const { texto, propuesta } = partir(acc)
        setMensajes(prev => { const c = [...prev]; c[c.length - 1] = { role: 'assistant', content: texto, propuesta }; return c })
      }
    } catch (e: any) {
      setMensajes(prev => {
        const c = [...prev]
        c[c.length - 1] = { role: 'assistant', content: '⚠️ ' + (e?.message || 'No se pudo contactar con el asistente. Revisa la conexión.') }
        return c
      })
    } finally {
      setEnviando(false)
    }
  }

  const pad = compacto ? 'px-3.5 py-4' : 'px-4 sm:px-6 py-6'
  const ancho = compacto ? '' : 'max-w-2xl mx-auto'

  return (
    <>
      <div ref={scrollRef} className={'flex-1 overflow-y-auto ' + pad}>
        <div className={ancho + ' flex flex-col gap-5'}>
          {mensajes.length === 0 ? (
            <div className={compacto ? '' : 'mt-6'}>
              <p className="text-gray-400 text-[13px] mb-3.5 leading-relaxed">
                {modulo
                  ? <>Estás en <span className="text-white font-medium">{modulo.modulo}</span>. Puedo ayudarte con lo que tienes delante, o con {nombre} en general.</>
                  : <>Pregúntame sobre <span className="text-white font-medium">{nombre}</span>. Tengo su carga, wellness, tests, volumen y sesiones recientes.</>}
              </p>
              <div className={'grid gap-2 ' + (compacto ? '' : 'sm:grid-cols-2')}>
                {sugerencias.map(s => (
                  <button key={s} onClick={() => enviar(s)}
                    className="text-left text-[13px] bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2.5 text-gray-300 hover:border-gray-600 hover:text-white transition">
                    {s}
                  </button>
                ))}
              </div>
              {!contexto && <p className="text-amber-400/70 text-xs mt-4">No he podido cargar el contexto del deportista; responderé de forma general.</p>}
            </div>
          ) : (
            /* El entrenador pregunta en burbuja; el asistente responde a todo el
               ancho, como una nota. En un panel de 400px una burbuja al 88% deja
               la respuesta —que es el contenido— más estrecha que la pregunta. */
            mensajes.map((m, i) => (
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="rounded-2xl rounded-br-md px-3.5 py-2 max-w-[85%] text-[13.5px] leading-relaxed bg-orange-500 text-white">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex flex-col gap-1.5">
                  <span className="text-[10.5px] uppercase tracking-[.09em] text-gray-600 font-semibold">Asistente</span>
                  <div className="text-[14px] leading-[1.65] text-gray-300">
                    {m.content
                      ? <TextoAsistente texto={m.content} />
                      : enviando && <span className="text-gray-600 text-[13px]">pensando…</span>}
                  </div>
                  {/* Una sesión propuesta no es un mensaje más: se puede aplicar. */}
                  {m.propuesta && (
                    <TarjetaPropuesta
                      propuesta={m.propuesta}
                      depId={depId ?? null}
                      onCambiar={t => setInput(t)}
                      onDescartar={() => setMensajes(prev => {
                        const c = [...prev]; c[i] = { ...c[i], propuesta: null }; return c
                      })}
                    />
                  )}
                  {m.content && !enviando && (
                    <button onClick={() => navigator.clipboard?.writeText(m.content)}
                      className="self-start text-[10.5px] text-gray-600 hover:text-gray-300 transition mt-0.5">
                      copiar
                    </button>
                  )}
                </div>
              )
            ))
          )}
        </div>
      </div>

      <div className={'border-t border-gray-800 flex-shrink-0 ' + (compacto ? 'px-3 py-2.5' : 'px-4 sm:px-6 py-3')}>
        <div className={ancho + ' flex items-end gap-2'}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
            rows={1} placeholder={modulo ? `Sobre ${modulo.modulo}…` : `Escribe sobre ${nombre}…`}
            className="flex-1 resize-none bg-gray-900 border border-gray-800 text-white text-[13.5px] px-3.5 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/60 max-h-32" />
          <button onClick={() => enviar()} disabled={!input.trim() || enviando}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:hover:bg-orange-500 text-white text-[13px] font-semibold px-3.5 py-2.5 rounded-xl transition flex-shrink-0">
            {enviando ? '…' : 'Enviar'}
          </button>
        </div>
        {!compacto && (
          <p className={ancho + ' text-gray-600 text-[11px] mt-2 text-center'}>
            El asistente propone; la decisión final es tuya. No sustituye criterio médico.
          </p>
        )}
      </div>
    </>
  )
}
