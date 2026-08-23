'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { vivas } from '@/lib/papelera'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'

const GRADS = [['#f97316', '#ea580c'], ['#3b82f6', '#4f46e5'], ['#22c55e', '#0d9488'], ['#a855f7', '#7c3aed'], ['#06b6d4', '#2563eb'], ['#ec4899', '#be185d'], ['#eab308', '#d97706'], ['#ef4444', '#b91c1c']]
const grad = (n: string) => GRADS[[...(n || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADS.length]
const inicial = (n: string) => (n || '?').trim()[0]?.toUpperCase() || '?'

const COLOR_DISC: Record<string, string> = {
  'Natacion': '#60a5fa', 'Natación': '#60a5fa', 'Ciclismo': '#fbbf24',
  'Carrera': '#4ade80', 'Fuerza': '#f87171', 'Brick': '#a855f7',
}
const discColor = (d: string) => COLOR_DISC[d] || '#94a3b8'

export default function ComunicacionPage() {
  const router = useRouter()
  useRequireEntrenador()
  const [userId, setUserId] = useState<string | null>(null)
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [mensajes, setMensajes] = useState<any[]>([])
  const [feedback, setFeedback] = useState<any[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'sin_leer' | 'feedback'>('todos')
  const [query, setQuery] = useState('')
  const [texto, setTexto] = useState('')
  const [reply, setReply] = useState<{ texto: string; disciplina?: string; fecha?: string } | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { cargar() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView() }, [activeId, mensajes.length])

  const cargar = async () => {
    setLoading(true)
    const user = await usuarioActual()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: deps } = await supabase.from('deportista').select('id, nombre').eq('id_entrenador', user.id).order('nombre')
    const deportistas = deps || []
    setDeportistas(deportistas)

    // Todos los mensajes del entrenador (para lista + hilos).
    const { data: msgs } = await supabase.from('mensajes').select('*').eq('id_entrenador', user.id).order('created_at', { ascending: true })
    setMensajes(msgs || [])

    /* El feedback post-sesión: lo que el atleta escribe al cerrar un
       entrenamiento. Salía de recorrer macro → meso → micro → sesión → tarea y
       de reconstruir de quién era cada nota con TRES mapas encadenados.

       `sesion.id_deportista` lo dice directo, así que son dos consultas y un
       mapa. Y con eso ENTRA EL FEEDBACK DE LAS SESIONES LIBRES: si el atleta se
       añadía un entrenamiento por su cuenta y dejaba una nota, esa nota no le
       llegaba al entrenador — que es exactamente lo contrario de para lo que
       está esta pantalla. */
    if (deportistas.length) {
      const depIds = deportistas.map((d: any) => d.id)
      const { data: sesiones } = await vivas(supabase.from('sesion')
        .select('id, fecha_sesion, disciplina, id_deportista')
        .in('id_deportista', depIds)).order('fecha_sesion', { ascending: false })

      const { data: tareas } = sesiones?.length
        ? await supabase.from('tarea')
            .select('id, id_sesion, notas_post, comentario_leido, rpe_reportado')
            .in('id_sesion', sesiones.map((x: any) => x.id))
            .not('notas_post', 'is', null).neq('notas_post', '')
        : { data: [] as any[] }

      const porId = new Map<number, any>()
      ;(sesiones || []).forEach((x: any) => porId.set(x.id, x))

      const fb = (tareas || []).map((t: any) => {
        const x = porId.get(t.id_sesion)
        if (!x) return null
        return { tareaId: t.id, sesionId: x.id, fecha: x.fecha_sesion, disciplina: x.disciplina, notas: t.notas_post, leido: t.comentario_leido, rpe: t.rpe_reportado, depId: x.id_deportista }
      }).filter(Boolean).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha))
      setFeedback(fb as any[])
    }
    setLoading(false)
  }

  const abrir = async (depId: number) => {
    setActiveId(depId); setMobileOpen(true); setReply(null)
    // Marcar como leídos los mensajes del deportista.
    await supabase.from('mensajes').update({ leido: true }).eq('id_deportista', depId).eq('autor', 'deportista').eq('leido', false)
    setMensajes(prev => prev.map(m => (m.id_deportista === depId && m.autor === 'deportista') ? { ...m, leido: true } : m))
  }

  const enviar = async () => {
    const t = texto.trim()
    if (!t || !activeId || !userId) return
    const insertar: any = { id_entrenador: userId, id_deportista: activeId, contenido: t, autor: 'entrenador', leido: false }
    if (reply) { insertar.contexto = reply.texto; insertar.contexto_disciplina = reply.disciplina || null; insertar.contexto_fecha = reply.fecha || null }
    const { data } = await supabase.from('mensajes').insert(insertar).select().single()
    if (data) setMensajes(prev => [...prev, data])
    setTexto(''); setReply(null)
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  const responderFeedback = (f: any) => {
    setReply({ texto: f.notas, disciplina: f.disciplina, fecha: f.fecha })
    if (!f.leido) { supabase.from('tarea').update({ comentario_leido: true }).eq('id', f.tareaId); setFeedback(prev => prev.map(x => x.tareaId === f.tareaId ? { ...x, leido: true } : x)) }
    setTimeout(() => taRef.current?.focus(), 50)
  }

  const formatHora = (ts: string) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const formatFecha = (ts: string) => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  const previewTime = (ts?: string) => {
    if (!ts) return ''
    const hoy = new Date().toISOString().split('T')[0]
    return ts.split('T')[0] === hoy ? formatHora(ts) : formatFecha(ts)
  }

  // ---- derivados ----
  const convos = deportistas.map(d => {
    const msgs = mensajes.filter(m => m.id_deportista === d.id)
    const last = msgs[msgs.length - 1]
    const unread = msgs.filter(m => m.autor === 'deportista' && !m.leido).length
    const fbs = feedback.filter(f => f.depId === d.id)
    return { ...d, last, unread, fbPend: fbs.filter(f => !f.leido).length, tieneFb: fbs.length > 0, lastTime: last?.created_at || '' }
  }).sort((a, b) => (b.lastTime || '').localeCompare(a.lastTime || ''))

  const q = query.trim().toLowerCase()
  const convosFiltrados = convos.filter(c => {
    if (q && !(c.nombre || '').toLowerCase().includes(q)) return false
    if (filtro === 'sin_leer' && !c.unread) return false
    if (filtro === 'feedback' && !c.tieneFb) return false
    return true
  })
  const totalUnread = convos.reduce((a, c) => a + c.unread, 0)

  const activo = deportistas.find(d => d.id === activeId)
  const threadMsgs = activeId ? mensajes.filter(m => m.id_deportista === activeId) : []
  const threadFbs = activeId ? feedback.filter(f => f.depId === activeId) : []

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Cargando…</div>

  const Avatar = ({ nombre, size = 44 }: { nombre: string; size?: number }) => {
    const [c1, c2] = grad(nombre)
    return <span className="rounded-[30%] grid place-items-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(145deg,' + c1 + ',' + c2 + ')' }}>{inicial(nombre)}</span>
  }

  return (
    <main className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      <header className="flex-none pl-44 pr-6 h-[54px] flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900/60 backdrop-blur-sm">
        <h1 className="text-[17px] font-bold tracking-tight truncate">Comunicación <span className="text-gray-500 font-normal text-[13px] hidden sm:inline">· feedback y mensajes de tus deportistas</span></h1>
        {totalUnread > 0 && <span className="text-[12px] font-semibold px-3 py-1.5 rounded-full flex-shrink-0" style={{ background: '#f9731618', color: '#fdba74', border: '1px solid #f9731633' }}>{totalUnread} sin leer</span>}
      </header>

      <div className="flex-1 min-h-0 p-4">
        <div className="h-full lg:grid lg:grid-cols-[340px_1fr] gap-4">

          {/* ===== Lista ===== */}
          <aside className={'tp-card flex-col min-h-0 h-full ' + (mobileOpen ? 'hidden lg:flex' : 'flex')}>
            <div className="flex-none p-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[15px] font-semibold">Mensajes</span>
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#fdba74' }}>{deportistas.length}</span>
              </div>
              <div className="flex items-center gap-2.5 bg-white/[0.045] border border-white/[0.075] rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar deportista…" className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-gray-500 min-w-0" />
              </div>
            </div>
            <div className="flex-none px-4 pb-2.5 flex gap-1.5">
              {([['todos', 'Todos'], ['sin_leer', 'Sin leer'], ['feedback', 'Feedback']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFiltro(k)}
                  className={'text-[11.5px] font-semibold px-2.5 py-1.5 rounded-full border transition ' + (filtro === k ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'text-gray-400 bg-white/[0.04] border-white/[0.06] hover:text-white')}>{l}</button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
              {convosFiltrados.length === 0 ? (
                <p className="text-center text-gray-500 text-[13px] py-10">Sin conversaciones que coincidan.</p>
              ) : convosFiltrados.map(c => (
                <button key={c.id} onClick={() => abrir(c.id)}
                  className={'w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition relative ' + (c.id === activeId ? 'bg-white/[0.06]' : 'hover:bg-white/[0.035]')}>
                  {c.id === activeId && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-orange-500" />}
                  <Avatar nombre={c.nombre} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={'text-[13.5px] truncate ' + (c.unread ? 'text-white font-semibold' : 'text-gray-200 font-medium')}>{c.nombre}</span>
                      <span className="text-[10.5px] text-gray-500 flex-shrink-0">{previewTime(c.lastTime)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={'text-[12px] truncate flex-1 ' + (c.unread ? 'text-gray-200' : 'text-gray-500')}>{c.last ? (c.last.autor === 'entrenador' ? 'Tú: ' : '') + c.last.contenido : 'Sin mensajes aún'}</span>
                      {c.tieneFb && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: '#8b5cf620', color: '#a78bfa' }}>feedback</span>}
                      {c.unread > 0 && <span className="text-[10px] font-bold text-white bg-orange-500 rounded-full min-w-[18px] h-[18px] grid place-items-center px-1 flex-shrink-0">{c.unread}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* ===== Hilo ===== */}
          <section className={'tp-card flex-col min-h-0 h-full ' + (mobileOpen ? 'flex' : 'hidden lg:flex')}>
            {!activo ? (
              <div className="flex-1 grid place-items-center text-center text-gray-500 p-6">
                <div>
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl grid place-items-center" style={{ background: '#f9731615', color: '#f97316' }}>
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" /></svg>
                  </div>
                  <p className="text-[13px]">Elige una conversación para empezar.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-none flex items-center gap-3 p-3.5 border-b border-gray-800">
                  <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-400 hover:text-white text-lg px-1">←</button>
                  <Avatar nombre={activo.nombre} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold leading-none truncate">{activo.nombre}</p>
                    <p className="text-[11.5px] text-gray-500 mt-1">Chat directo</p>
                  </div>
                  <button onClick={() => router.push('/deportistas/' + activo.id)} title="Ver ficha" className="w-9 h-9 grid place-items-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition">
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-2">
                  {threadFbs.length > 0 && (
                    <div className="flex flex-col gap-2 mb-1">
                      {threadFbs.slice(0, 3).map(f => (
                        <div key={f.tareaId} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3" style={{ borderLeft: '2px solid ' + discColor(f.disciplina) }}>
                          <div className="flex items-center gap-2 text-[11.5px] font-semibold text-gray-300">
                            <span className="w-5 h-5 rounded-md grid place-items-center flex-shrink-0" style={{ background: discColor(f.disciplina) + '2e', color: discColor(f.disciplina) }}>
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5h16v11H9l-4 3.5V16.5H4Z" /></svg>
                            </span>
                            Feedback · {f.disciplina} · {f.fecha}
                            {f.rpe && <span className="ml-auto text-[10.5px] text-gray-500 font-normal">RPE {f.rpe}/10</span>}
                          </div>
                          <p className="text-[13px] text-gray-100 italic mt-2 leading-snug">"{f.notas}"</p>
                          <div className="flex items-center gap-3 mt-2">
                            <button onClick={() => responderFeedback(f)} className="text-[11.5px] font-semibold text-orange-300 hover:text-orange-200 transition">↩ Responder</button>
                            <button onClick={() => router.push('/sesion/' + f.sesionId)} className="text-[11.5px] text-gray-500 hover:text-gray-300 transition">Ver sesión →</button>
                          </div>
                        </div>
                      ))}
                      <div className="border-t border-gray-800/70 my-1" />
                    </div>
                  )}

                  {threadMsgs.length === 0 && threadFbs.length === 0 && (
                    <div className="flex-1 grid place-items-center text-gray-600 text-[13px]">Sin mensajes todavía. ¡Empieza la conversación!</div>
                  )}

                  {threadMsgs.map((m, i) => {
                    const mio = m.autor === 'entrenador'
                    const prev = threadMsgs[i - 1]
                    const mismaFecha = prev && formatFecha(prev.created_at) === formatFecha(m.created_at)
                    return (
                      <div key={m.id}>
                        {!mismaFecha && <div className="text-center my-2"><span className="text-[10.5px] text-gray-500 bg-white/5 px-3 py-1 rounded-full">{formatFecha(m.created_at)}</span></div>}
                        <div className={'flex ' + (mio ? 'justify-end' : 'justify-start')}>
                          <div className="max-w-[76%]">
                            {m.contexto && (
                              <div className={'px-3 py-1.5 rounded-t-xl text-[11px] mb-px border-l-2 ' + (mio ? 'bg-orange-700/40 border-orange-300 text-orange-100' : 'bg-gray-700/60 border-gray-500 text-gray-300')}>
                                <span className="opacity-70">↩ Feedback{m.contexto_disciplina ? ' · ' + m.contexto_disciplina : ''}</span>
                                <p className="italic opacity-90 line-clamp-2">"{m.contexto}"</p>
                              </div>
                            )}
                            <div className={'px-3.5 py-2 text-[13.5px] leading-snug ' + (mio ? 'bg-orange-500 text-white' : 'bg-[#11161d] border border-white/[0.06] text-gray-100') + (m.contexto ? ' rounded-b-2xl' : ' ' + (mio ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm'))}>
                              <p>{m.contenido}</p>
                              <p className={'text-[10px] mt-1 flex items-center gap-1 ' + (mio ? 'justify-end text-orange-200' : 'text-gray-500')}>
                                {formatHora(m.created_at)}{mio && <span>{m.leido ? '✓✓' : '✓'}</span>}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                {reply && (
                  <div className="flex-none flex items-start gap-3 px-4 py-2.5 border-t border-orange-500/40" style={{ background: 'rgba(249,115,22,.06)' }}>
                    <span className="w-0.5 self-stretch rounded bg-orange-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-orange-300">↩ Respondiendo a feedback{reply.disciplina ? ' · ' + reply.disciplina : ''}{reply.fecha ? ' · ' + reply.fecha : ''}</p>
                      <p className="text-[11.5px] text-gray-400 italic truncate">"{reply.texto}"</p>
                    </div>
                    <button onClick={() => setReply(null)} className="text-gray-500 hover:text-white text-lg leading-none flex-shrink-0">×</button>
                  </div>
                )}

                <div className="flex-none flex items-end gap-2.5 p-3.5 border-t border-gray-800">
                  <textarea ref={taRef} value={texto} rows={1}
                    onChange={e => { setTexto(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px' }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                    placeholder={reply ? 'Escribe tu respuesta…' : 'Escribe un mensaje…'}
                    className="flex-1 bg-white/[0.05] border border-white/[0.075] rounded-2xl text-[13.5px] px-4 py-2.5 outline-none focus:border-orange-500/50 resize-none placeholder:text-gray-500" />
                  <button onClick={enviar} disabled={!texto.trim()}
                    className="w-11 h-11 rounded-[14px] bg-orange-500 hover:bg-orange-400 disabled:opacity-40 grid place-items-center flex-shrink-0 transition">
                    <svg className="w-[19px] h-[19px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l16-8-6 16-3-6-7-2Z" /></svg>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
