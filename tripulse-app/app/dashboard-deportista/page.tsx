'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function DashboardDeportista() {
  const [perfil, setPerfil] = useState<any>(null)
  const [deportista, setDeportista] = useState<any>(null)
  const [sesionesHoy, setSesionesHoy] = useState<any[]>([])
  const [ultimoWellness, setUltimoWellness] = useState<any>(null)

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      setPerfil(p)
      if (p?.rol !== 'deportista') { window.location.href = '/dashboard'; return }
      const { data: dep } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).single()
      setDeportista(dep)
      if (dep) {
        const hoy = new Date().toISOString().split('T')[0]
        const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
        const macroIds = (macros || []).map((m: any) => m.id)
        const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
        const mesoIds = (mesos || []).map((m: any) => m.id)
        const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
        const microIds = (micros || []).map((m: any) => m.id)
        const { data: sesHoy } = await supabase.from('sesion').select('*').in('id_microciclo', microIds).eq('fecha_sesion', hoy)
        setSesionesHoy(sesHoy || [])
        const { data: wellness } = await supabase.from('wellness').select('*').eq('id_deportista', dep.id).order('fecha', { ascending: false }).limit(1)
        setUltimoWellness(wellness?.[0] || null)
      }
    }
    cargar()
  }, [])

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const irWellness = () => { if (deportista) window.location.href = '/wellness/' + deportista.id }
  const irSesion = (id: number) => { window.location.href = '/sesion/' + id }
  const irMisSesiones = () => { window.location.href = '/mis-sesiones' }

  const colorScore = (score: number) => {
    if (score <= 25) return 'text-green-400'
    if (score <= 50) return 'text-yellow-400'
    if (score <= 75) return 'text-orange-400'
    return 'text-red-400'
  }

  const colorDisciplina = (d: string) => {
    if (!d) return 'bg-gray-700 text-gray-300'
    if (d.includes('Nat')) return 'bg-blue-900 text-blue-300'
    if (d === 'Ciclismo') return 'bg-yellow-900 text-yellow-300'
    if (d === 'Carrera') return 'bg-green-900 text-green-300'
    if (d === 'Fuerza') return 'bg-red-900 text-red-300'
    return 'bg-purple-900 text-purple-300'
  }

  if (!perfil) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-orange-500">TRIPULSE</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{perfil?.nombre}</span>
          <button onClick={cerrarSesion} className="text-gray-400 hover:text-white text-sm transition">Cerrar sesion</button>
        </div>
      </nav>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-1">Hola, {perfil?.nombre} 👋</h2>
        <p className="text-gray-400 mb-8">Tu panel de entrenamiento</p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <button onClick={irWellness} className="bg-gray-900 rounded-xl p-5 border border-gray-800 hover:border-green-500 transition text-left">
            <div className="text-3xl mb-2">💚</div>
            <h3 className="font-bold mb-1 text-sm">Wellness</h3>
            {ultimoWellness ? (
              <div>
                <p className={'text-xl font-bold ' + colorScore(ultimoWellness.score_wellness)}>{ultimoWellness.score_wellness}</p>
                <p className="text-gray-400 text-xs">{ultimoWellness.fecha}</p>
              </div>
            ) : (
              <p className="text-gray-400 text-xs">Registra tu estado</p>
            )}
          </button>

          <button onClick={irMisSesiones} className="bg-gray-900 rounded-xl p-5 border border-gray-800 hover:border-orange-500 transition text-left">
            <div className="text-3xl mb-2">📅</div>
            <h3 className="font-bold mb-1 text-sm">Mis sesiones</h3>
            <p className="text-gray-400 text-xs">Ver calendario</p>
          </button>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="text-3xl mb-2">📊</div>
            <h3 className="font-bold mb-1 text-sm">Mi progreso</h3>
            <p className="text-gray-400 text-xs">Proximamente</p>
          </div>
        </div>

        {sesionesHoy.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-4">Sesion de hoy 🔥</h3>
            {sesionesHoy.map(s => (
              <div key={s.id} className="bg-gray-900 rounded-xl p-6 border border-orange-500">
                <div className="flex items-center gap-3 mb-3">
                  <span className={'text-xs px-2 py-1 rounded-full font-medium ' + colorDisciplina(s.disciplina)}>{s.disciplina}</span>
                  <span className="text-gray-400 text-sm">{s.duracion_minutos ? s.duracion_minutos + ' min' : '—'}</span>
                  <span className="text-gray-400 text-sm">RPE est: {s.rpe_estimado || '—'}</span>
                </div>
                {s.notas_entrenador && <p className="text-gray-300 text-sm italic mb-4">"{s.notas_entrenador}"</p>}
                <button onClick={() => irSesion(s.id)} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition w-full">Ver sesion completa</button>
              </div>
            ))}
          </div>
        )}

        {sesionesHoy.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-5xl mb-4">😴</div>
            <p className="text-lg font-medium text-white mb-1">Hoy es dia de descanso</p>
            <p>Recupera bien para la proxima sesion.</p>
          </div>
        )}
      </div>
    </main>
  )
}
