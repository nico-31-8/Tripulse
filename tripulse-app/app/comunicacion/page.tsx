'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const COLOR_DISC: Record<string, string> = {
  'Natacion': 'bg-blue-900 text-blue-300',
  'Natación': 'bg-blue-900 text-blue-300',
  'Ciclismo': 'bg-yellow-900 text-yellow-300',
  'Carrera': 'bg-green-900 text-green-300',
  'Fuerza': 'bg-red-900 text-red-300',
  'Brick': 'bg-purple-900 text-purple-300',
}

export default function ComunicacionPage() {
  const [tab, setTab] = useState<'feedback'|'chats'>('feedback')
  const [comentarios, setComentarios] = useState<any[]>([])
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'sin_leer'|'todos'>('sin_leer')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    setUserId(user.id)

    const { data: deps } = await supabase.from('deportista').select('id, nombre').eq('id_entrenador', user.id)
    if (!deps?.length) { setLoading(false); return }
    setDeportistas(deps)

    // Contar mensajes no leídos por deportista
    const { data: noLeidos } = await supabase.from('mensajes')
      .select('id_deportista')
      .eq('id_entrenador', user.id)
      .eq('autor', 'deportista')
      .eq('leido', false)
    const conteo: Record<number, number> = {}
    noLeidos?.forEach((m: any) => { conteo[m.id_deportista] = (conteo[m.id_deportista] || 0) + 1 })
    setMensajesNoLeidos(conteo)

    // Feedback post-sesion
    const depIds = deps.map((d: any) => d.id)
    const { data: macros } = await supabase.from('macrociclo').select('id, id_deportista').in('id_deportista', depIds)
    if (!macros?.length) { setLoading(false); return }
    const { data: mesos } = await supabase.from('mesociclo').select('id, id_macrociclo').in('id_macrociclo', macros.map((m: any) => m.id))
    if (!mesos?.length) { setLoading(false); return }
    const { data: micros } = await supabase.from('microciclo').select('id, id_mesociclo').in('id_mesociclo', mesos.map((m: any) => m.id))
    if (!micros?.length) { setLoading(false); return }
    const { data: sesiones } = await supabase.from('sesion').select('id, fecha_sesion, disciplina, id_microciclo').in('id_microciclo', micros.map((m: any) => m.id)).order('fecha_sesion', { ascending: false })
    if (!sesiones?.length) { setLoading(false); return }
    const { data: tareas } = await supabase.from('tarea').select('id, id_sesion, notas_post, comentario_leido, rpe_reportado').in('id_sesion', sesiones.map((s: any) => s.id)).not('notas_post', 'is', null).neq('notas_post', '')
    if (!tareas?.length) { setLoading(false); return }

    const microToMeso: Record<number, number> = {}
    micros.forEach((mi: any) => { microToMeso[mi.id] = mi.id_mesociclo })
    const mesoToMacro: Record<number, number> = {}
    mesos.forEach((me: any) => { mesoToMacro[me.id] = me.id_macrociclo })
    const macroToDep: Record<number, number> = {}
    macros.forEach((ma: any) => { macroToDep[ma.id] = ma.id_deportista })

    const resultado = tareas.map((t: any) => {
      const sesion = sesiones.find((s: any) => s.id === t.id_sesion)
      if (!sesion) return null
      const mesoId = microToMeso[sesion.id_microciclo]
      const macroId = mesoToMacro[mesoId]
      const depId = macroToDep[macroId]
      const dep = deps.find((d: any) => String(d.id) === String(depId))
      return { tareaId: t.id, sesionId: sesion.id, fecha: sesion.fecha_sesion, disciplina: sesion.disciplina, notas: t.notas_post, leido: t.comentario_leido, rpe: t.rpe_reportado, depNombre: dep?.nombre || 'Deportista', depId: depId }
    }).filter(Boolean).sort((a: any, b: any) => b.fecha.localeCompare(a.fecha))

    setComentarios(resultado)
    setLoading(false)
  }

  const marcarLeido = async (tareaId: number) => {
    await supabase.from('tarea').update({ comentario_leido: true }).eq('id', tareaId)
    setComentarios(prev => prev.map((c: any) => c.tareaId === tareaId ? { ...c, leido: true } : c))
  }

  const marcarNoLeido = async (tareaId: number) => {
    await supabase.from('tarea').update({ comentario_leido: false }).eq('id', tareaId)
    setComentarios(prev => prev.map((c: any) => c.tareaId === tareaId ? { ...c, leido: false } : c))
  }

  const sinLeerFeedback = comentarios.filter((c: any) => !c.leido).length
  const sinLeerChats = Object.values(mensajesNoLeidos).reduce((a, b) => a + b, 0)
  const comentariosFiltrados = filtro === 'sin_leer' ? comentarios.filter((c: any) => !c.leido) : comentarios

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">Comunicacion</h2>
            <p className="text-gray-400 text-sm">Feedback y mensajes de tus deportistas</p>
          </div>
          {(sinLeerFeedback + sinLeerChats) > 0 && (
            <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-full">{sinLeerFeedback + sinLeerChats} sin leer</span>
          )}
        </div>

        {/* TABS */}
        <div className="flex gap-1 border-b border-gray-800 mb-6">
          <button onClick={() => setTab('feedback')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' + (tab === 'feedback' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            Feedback {sinLeerFeedback > 0 && <span className="ml-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">{sinLeerFeedback}</span>}
          </button>
          <button onClick={() => setTab('chats')}
            className={'px-5 py-2.5 text-sm font-medium transition border-b-2 ' + (tab === 'chats' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white')}>
            Chats {sinLeerChats > 0 && <span className="ml-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">{sinLeerChats}</span>}
          </button>
        </div>

        {/* TAB FEEDBACK */}
        {tab === 'feedback' && (
          <div>
            <div className="flex gap-1 mb-4">
              <button onClick={() => setFiltro('sin_leer')} className={'px-4 py-1.5 text-xs rounded-lg transition ' + (filtro === 'sin_leer' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                Sin leer {sinLeerFeedback > 0 && `(${sinLeerFeedback})`}
              </button>
              <button onClick={() => setFiltro('todos')} className={'px-4 py-1.5 text-xs rounded-lg transition ' + (filtro === 'todos' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                Todos ({comentarios.length})
              </button>
            </div>
            {comentariosFiltrados.length === 0 ? (
              <div className="text-center py-16 text-gray-600">
                <div className="text-5xl mb-4">💬</div>
                <p>{filtro === 'sin_leer' ? 'No hay comentarios sin leer.' : 'No hay comentarios todavia.'}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {comentariosFiltrados.map((c: any) => (
                  <div key={c.tareaId} className={'rounded-xl border p-5 transition ' + (c.leido ? 'bg-gray-900 border-gray-800' : 'bg-gray-900 border-orange-500/50')}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!c.leido && <span className="w-2 h-2 rounded-full bg-orange-500 inline-block flex-shrink-0" />}
                        <span className="font-bold text-white">{c.depNombre}</span>
                        <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (COLOR_DISC[c.disciplina] || 'bg-gray-700 text-gray-300')}>{c.disciplina}</span>
                        <span className="text-gray-500 text-xs">{c.fecha}</span>
                        {c.rpe && <span className="text-gray-500 text-xs">RPE: {c.rpe}/10</span>}
                      </div>
                      <button onClick={() => window.location.href = '/sesion/' + c.sesionId} className="text-gray-500 hover:text-orange-400 text-xs transition flex-shrink-0">Ver sesion →</button>
                    </div>
                    <p className="text-gray-300 text-sm italic mb-3">"{c.notas}"</p>
                    <div className="flex justify-between items-center">
                      <button onClick={() => window.location.href = '/chat/' + c.depId}
                        className="text-orange-400 hover:text-orange-300 text-xs transition font-medium">
                        💬 Responder en chat →
                      </button>
                      {c.leido ? (
                        <button onClick={() => marcarNoLeido(c.tareaId)} className="text-gray-600 hover:text-gray-400 text-xs transition">Leido · Marcar como no leido</button>
                      ) : (
                        <button onClick={() => marcarLeido(c.tareaId)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg transition font-medium">Marcar como leido</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB CHATS */}
        {tab === 'chats' && (
          <div className="flex flex-col gap-2">
            {deportistas.length === 0 ? (
              <div className="text-center py-16 text-gray-600">
                <div className="text-5xl mb-4">👥</div>
                <p>No tienes deportistas asignados todavia.</p>
              </div>
            ) : (
              deportistas.map((dep: any) => {
                const noLeidos = mensajesNoLeidos[dep.id] || 0
                return (
                  <button key={dep.id} onClick={() => window.location.href = '/chat/' + dep.id}
                    className="bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-orange-500/50 rounded-xl p-4 flex items-center gap-4 transition text-left w-full">
                    <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center font-bold flex-shrink-0">
                      {dep.nombre?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white">{dep.nombre}</p>
                      <p className="text-gray-500 text-xs">Toca para abrir el chat</p>
                    </div>
                    {noLeidos > 0 && (
                      <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full flex-shrink-0">{noLeidos}</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </main>
  )
}
