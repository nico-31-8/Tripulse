'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ResumenDeportista } from '@/components/ResumenSemanal'

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
      const { data: dep } = await supabase.from('deportista').select('*').eq('id_usuario', user.id).maybeSingle()
      setDeportista(dep)
      if (dep) {
        const hoy = new Date().toISOString().split('T')[0]
        const { data: macros } = await supabase.from('macrociclo').select('id').eq('id_deportista', dep.id)
        const macroIds = (macros || []).map((m: any) => m.id)
        const { data: mesos } = await supabase.from('mesociclo').select('id').in('id_macrociclo', macroIds)
        const mesoIds = (mesos || []).map((m: any) => m.id)
        const { data: micros } = await supabase.from('microciclo').select('id').in('id_mesociclo', mesoIds)
        const microIds = (micros || []).map((m: any) => m.id)
        const { data: sesHoy } = await supabase.from('sesion').select('*').in('id_microciclo', microIds).eq('fecha_sesion', hoy).or('eliminada.is.null,eliminada.eq.false')
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

  const colorScore = (score: number) => {
    if (score <= 25) return 'text-green-400'
    if (score <= 50) return 'text-yellow-400'
    if (score <= 75) return 'text-orange-400'
    return 'text-red-400'
  }

  const estadoScore = (score: number) => {
    if (score <= 25) return 'Óptimo'
    if (score <= 50) return 'Aceptable'
    if (score <= 75) return 'Deteriorado'
    return 'Crítico'
  }

  const colorDisciplina = (d: string) => {
    if (!d) return 'bg-gray-700 text-gray-300'
    if (d.includes('Nat')) return 'bg-blue-900 text-blue-300'
    if (d === 'Ciclismo') return 'bg-yellow-900 text-yellow-300'
    if (d === 'Carrera') return 'bg-green-900 text-green-300'
    if (d === 'Fuerza') return 'bg-red-900 text-red-300'
    return 'bg-purple-900 text-purple-300'
  }

  const modulos = [
    { icon: '📅', titulo: 'Mis sesiones', descripcion: 'Consulta tu calendario de entrenamientos. Ve el detalle de cada sesión y registra cómo fue.', href: '/mis-sesiones', border: 'hover:border-orange-500' },
    { icon: '💚', titulo: 'Wellness', descripcion: 'Registra tu estado diario — sueño, fatiga, estrés, HRV. Tu entrenador lo consulta para ajustar la carga.', href: deportista ? '/wellness/' + deportista.id : '#', border: 'hover:border-green-500' },
    { icon: '🏋️', titulo: 'Mis tests', descripcion: 'Consulta tus resultados de tests — VAM, CSS, FTP, 1RM — y las zonas de entrenamiento generadas.', href: '/mis-tests', border: 'hover:border-blue-500' },
    { icon: '💬', titulo: 'Comunicación', descripcion: 'Habla directamente con tu entrenador. Consulta dudas, comparte cómo te sientes.', href: deportista ? '/chat/' + deportista.id : '#', border: 'hover:border-orange-500' },
    { icon: '📊', titulo: 'Mis análisis', descripcion: 'Revisa tus sesiones realizadas y compara lo planificado con lo que hiciste realmente.', href: '/mis-analisis', border: 'hover:border-purple-500' },
    { icon: '👤', titulo: 'Mi perfil', descripcion: 'Gestiona tu cuenta, vincula o desvincula tu entrenador con su código.', href: '/perfil', border: 'hover:border-gray-500' },
  ]

  if (!perfil) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{perfil?.nombre}</span>
          <button onClick={cerrarSesion} className="text-gray-400 hover:text-white text-sm transition">Cerrar sesión</button>
        </div>
      </nav>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-1">Hola, {perfil?.nombre} 👋</h2>
        <p className="text-gray-400 mb-4">Tu panel de entrenamiento</p>

        {deportista && <ResumenDeportista depId={deportista.id} />}

        {/* Aviso si no tiene entrenador asignado */}
        {deportista && !deportista.id_entrenador && (
          <div className="bg-yellow-950 border-2 border-yellow-600 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-bold text-yellow-300 text-lg mb-1">No tienes entrenador asignado</p>
                <p className="text-yellow-400 text-sm mb-3">
                  Para recibir tu planificación de entrenamiento necesitas estar vinculado a un entrenador.
                </p>
                <div className="bg-yellow-900 rounded-lg p-3 mb-3">
                  <p className="text-yellow-300 text-xs font-medium mb-1">¿Cómo vincularte?</p>
                  <p className="text-yellow-400 text-xs">Tu entrenador puede enviarte un enlace de invitación directamente, o puedes ir a <strong>Mi perfil</strong> e introducir el código de tu entrenador.</p>
                </div>
                <button
                  onClick={() => window.location.href = '/perfil'}
                  className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                  Ir a Mi perfil →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Aviso si tiene entrenador pero no hay sesiones hoy */}

        {/* Banner wellness pendiente */}
        {(() => {
          const hoyStr = new Date().toISOString().split('T')[0]
          const wellnessHoy = ultimoWellness?.fecha === hoyStr
          if (wellnessHoy) return null
          return (
            <button onClick={() => window.location.href = deportista ? '/wellness/' + deportista.id : '#'}
              className="w-full bg-green-900 border-2 border-green-500 rounded-xl p-5 mb-6 text-left hover:bg-green-800 transition">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-green-300 font-bold text-lg">💚 Registra tu wellness de hoy</p>
                  <p className="text-green-400 text-sm mt-1">Tu entrenador necesita estos datos para ajustar tu entrenamiento.</p>
                  {ultimoWellness && (
                    <p className="text-green-600 text-xs mt-1">Último registro: {ultimoWellness.fecha}</p>
                  )}
                </div>
                <span className="text-green-400 text-2xl ml-4">→</span>
              </div>
            </button>
          )
        })()}

        {/* Sesión de hoy */}
        {sesionesHoy.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-bold mb-3 text-orange-400">🔥 Sesión de hoy</h3>
            {sesionesHoy.map(s => (
              <div key={s.id} className="bg-gray-900 rounded-xl p-5 border border-orange-500 mb-3">
                <div className="flex items-center gap-3 mb-3">
                  <span className={'text-xs px-2 py-1 rounded-full font-medium ' + colorDisciplina(s.disciplina)}>{s.disciplina}</span>
                  <span className="text-gray-400 text-sm">{s.duracion_minutos ? s.duracion_minutos + ' min' : '—'}</span>
                  <span className="text-gray-400 text-sm">RPE est: {s.rpe_estimado || '—'}</span>
                </div>
                {s.notas_entrenador && <p className="text-gray-300 text-sm italic mb-4">"{s.notas_entrenador}"</p>}
                <button onClick={() => window.location.href = '/sesion/' + s.id}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition w-full">
                  Ver sesión completa
                </button>
              </div>
            ))}
          </div>
        )}

        {sesionesHoy.length === 0 && (
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8 text-center">
            <div className="text-4xl mb-2">😴</div>
            <p className="font-medium text-white mb-1">Hoy es día de descanso</p>
            <p className="text-gray-500 text-sm">Recupera bien para la próxima sesión.</p>
          </div>
        )}

        {/* Wellness rápido */}
        {ultimoWellness && (
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Último wellness — {ultimoWellness.fecha}</p>
                <p className="text-gray-300 text-sm">Fatiga: {ultimoWellness.fatiga}/7 · Estrés: {ultimoWellness.estres}/7 · Sueño: {ultimoWellness.horas_sueno}h</p>
              </div>
              <div className="text-right">
                <p className={'text-3xl font-bold ' + colorScore(ultimoWellness.score_wellness)}>{ultimoWellness.score_wellness}</p>
                <p className={'text-xs ' + colorScore(ultimoWellness.score_wellness)}>{estadoScore(ultimoWellness.score_wellness)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Módulos */}
        <div className="grid grid-cols-1 gap-3">
          {modulos.map(m => (
            <button key={m.titulo} onClick={() => window.location.href = m.href}
              className={'bg-gray-900 rounded-xl p-5 border border-gray-800 text-left transition w-full flex items-start gap-4 ' + m.border}>
              <span className="text-3xl flex-shrink-0">{m.icon}</span>
              <div>
                <h3 className="font-bold mb-1">{m.titulo}</h3>
                <p className="text-gray-400 text-sm">{m.descripcion}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
