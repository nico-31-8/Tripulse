'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const RUTAS_PUBLICAS = ['/', '/login', '/registro']

const modulosEntrenador = [
  { icon: '👥', titulo: 'Deportistas', href: '/deportistas' },
  { icon: '📅', titulo: 'Planificacion', href: '/planificacion-visual' },
  { icon: '💚', titulo: 'Wellness', href: '/wellness-entrenador' },
  { icon: '📈', titulo: 'Carga', href: '/carga' },
  { icon: '🔬', titulo: 'Sistema ECO', href: '/eco' },
  { icon: '🎯', titulo: 'Índices', href: '/indices' },
  { icon: '🏋️', titulo: 'Tests', href: '/tests' },
  { icon: '💪', titulo: 'Biblioteca Fuerza', href: '/fuerza' },
  { icon: '📊', titulo: 'Volumen', href: '/volumen' },
]

const modulosDeportista = [
  { icon: '📋', titulo: 'Mis sesiones', href: '/mis-sesiones' },
  { icon: '💚', titulo: 'Wellness', href: '/wellness-deportista' },
  { icon: '🏋️', titulo: 'Mis tests', href: '/mis-tests' },
  { icon: '🗓', titulo: 'Disponibilidad', href: '/disponibilidad' },
]

export default function Sidebar() {
  const [expandido, setExpandido] = useState(false)
  const [autenticado, setAutenticado] = useState(false)
  const [rol, setRol] = useState<string | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    const comprobar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAutenticado(false); return }
      setAutenticado(true)
      const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
      setRol(p?.rol || null)
    }
    comprobar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAutenticado(!!session)
      if (!session) setRol(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!autenticado || RUTAS_PUBLICAS.includes(pathname)) return null

  const esDeportista = rol === 'deportista'
  const modulos = esDeportista ? modulosDeportista : modulosEntrenador
  const dashboardHref = esDeportista ? '/dashboard-deportista' : '/dashboard'

  return (
    <div
      onMouseEnter={() => setExpandido(true)}
      onMouseLeave={() => setExpandido(false)}
      className={'fixed left-0 top-0 h-full bg-gray-900 border-r border-gray-800 z-50 flex flex-col transition-all duration-300 ' + (expandido ? 'w-48' : 'w-14')}
    >
      <div className="px-3 py-4 border-b border-gray-800">
        <span className="text-orange-500 font-bold text-lg">{expandido ? 'TRIPULSE' : 'T'}</span>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {modulos.map(m => (
          <button key={m.titulo} onClick={() => window.location.href = m.href}
            className={'w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left ' +
              (pathname === m.href ? 'bg-gray-800 border-l-2 border-orange-500' : '')}>
            <span className="text-xl flex-shrink-0">{m.icon}</span>
            {expandido && <span className="text-gray-300 text-sm whitespace-nowrap">{m.titulo}</span>}
          </button>
        ))}
      </nav>

      <div className="border-t border-gray-800 py-2">
        <button onClick={() => window.history.back()}
          className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
          <span className="text-xl flex-shrink-0">◀️</span>
          {expandido && <span className="text-gray-300 text-sm whitespace-nowrap">Atrás</span>}
        </button>
        <button onClick={() => window.location.href = '/perfil'}
          className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
          <span className="text-xl flex-shrink-0">⚙️</span>
          {expandido && <span className="text-gray-300 text-sm whitespace-nowrap">Mi perfil</span>}
        </button>
        <button onClick={() => window.location.href = dashboardHref}
          className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
          <span className="text-xl flex-shrink-0">🏠</span>
          {expandido && <span className="text-gray-300 text-sm whitespace-nowrap">Dashboard</span>}
        </button>
      </div>
    </div>
  )
}
