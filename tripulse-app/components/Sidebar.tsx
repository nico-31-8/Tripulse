'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const RUTAS_PUBLICAS = ['/', '/login', '/registro']

const modulosEntrenador = [
  { icon: '👥', titulo: 'Deportistas', href: '/deportistas' },
  { icon: '📅', titulo: 'Planificacion', href: '/planificacion-visual' },
  { icon: '💚', titulo: 'Wellness', href: '/wellness-entrenador' },
  { icon: '📈', titulo: 'Carga', href: '/carga' },
  { icon: '🔬', titulo: 'SICAT', href: '/eco' },
  { icon: '🎯', titulo: 'Índices', href: '/indices' },
  { icon: '🏋️', titulo: 'Tests', href: '/tests' },
  { icon: '💪', titulo: 'Biblioteca Fuerza', href: '/fuerza' },
  { icon: '📊', titulo: 'Volumen', href: '/volumen' },
  { icon: '💬', titulo: 'Comunicación', href: '/comunicacion' },
  { icon: '🗑️', titulo: 'Papelera', href: '/papelera' },
]

const modulosDeportista = [
  { icon: '📋', titulo: 'Mis sesiones', href: '/mis-sesiones' },
  { icon: '💚', titulo: 'Wellness', href: '/wellness-deportista' },
  { icon: '🏋️', titulo: 'Mis tests', href: '/mis-tests' },
  { icon: '📊', titulo: 'Mis análisis', href: '/mis-analisis' },
  { icon: '🗓', titulo: 'Disponibilidad', href: '/disponibilidad' },
]

export default function Sidebar() {
  const [abierto, setAbierto] = useState(false)
  const [autenticado, setAutenticado] = useState(false)
  const [rol, setRol] = useState<string | null>(null)
  const pathname = usePathname()
  const panelRef = useRef<HTMLDivElement>(null)
  const botonRef = useRef<HTMLButtonElement>(null)

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

  // Cierra el menú al cambiar de página
  useEffect(() => {
    setAbierto(false)
  }, [pathname])

  // Cierra el menú al hacer click fuera del panel y del botón
  useEffect(() => {
    if (!abierto) return
    const handleClickFuera = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        botonRef.current && !botonRef.current.contains(target)
      ) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClickFuera)
    return () => document.removeEventListener('mousedown', handleClickFuera)
  }, [abierto])

  if (!autenticado || RUTAS_PUBLICAS.includes(pathname)) return null

  const esDeportista = rol === 'deportista'
  const modulos = esDeportista ? modulosDeportista : modulosEntrenador
  const dashboardHref = esDeportista ? '/dashboard-deportista' : '/dashboard'

  return (
    <>
      {/* Botón trigger - siempre visible */}
      <button
        ref={botonRef}
        onClick={() => setAbierto(!abierto)}
        className="fixed left-0 top-0 z-50 px-3 py-4 bg-gray-900 border-r border-b border-gray-800 hover:bg-gray-800 transition"
      >
        <span className="text-orange-500 font-bold text-lg">TRIPULSE</span>
      </button>

      {/* Overlay oscuro al abrir */}
      {abierto && (
        <div className="fixed inset-0 bg-black/50 z-40" />
      )}

      {/* Panel lateral */}
      <div
        ref={panelRef}
        className={'fixed left-0 top-0 h-full w-48 bg-gray-900 border-r border-gray-800 z-50 flex flex-col pt-16 transition-transform duration-300 ' +
          (abierto ? 'translate-x-0' : '-translate-x-full')}
      >
        <nav className="flex-1 py-2 overflow-y-auto">
          {modulos.map(m => (
            <button key={m.titulo} onClick={() => window.location.href = m.href}
              className={'w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left ' +
                (pathname === m.href ? 'bg-gray-800 border-l-2 border-orange-500' : '')}>
              <span className="text-xl flex-shrink-0">{m.icon}</span>
              <span className="text-gray-300 text-sm whitespace-nowrap">{m.titulo}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-gray-800 py-2">
          <button onClick={() => window.history.back()}
            className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
            <span className="text-xl flex-shrink-0">◀️</span>
            <span className="text-gray-300 text-sm whitespace-nowrap">Atrás</span>
          </button>
          <button onClick={() => window.location.href = '/perfil'}
            className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
            <span className="text-xl flex-shrink-0">⚙️</span>
            <span className="text-gray-300 text-sm whitespace-nowrap">Mi perfil</span>
          </button>
          <button onClick={() => window.location.href = dashboardHref}
            className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
            <span className="text-xl flex-shrink-0">🏠</span>
            <span className="text-gray-300 text-sm whitespace-nowrap">Dashboard</span>
          </button>
        </div>
      </div>
    </>
  )
}
