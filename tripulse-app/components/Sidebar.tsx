'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const RUTAS_PUBLICAS = ['/', '/login', '/registro', '/privacidad', '/terminos']

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

// Los módulos del deportista se construyen con su id (wellness y chat lo necesitan)
const modulosDeportistaFn = (depId: number | null) => [
  { icon: '📋', titulo: 'Mis sesiones', href: '/mis-sesiones' },
  { icon: '💚', titulo: 'Wellness', href: depId ? '/wellness/' + depId : '/dashboard-deportista' },
  { icon: '🏋️', titulo: 'Mis tests', href: '/mis-tests' },
  { icon: '📊', titulo: 'Mis análisis', href: '/mis-analisis' },
  { icon: '💬', titulo: 'Comunicación', href: depId ? '/chat/' + depId : '/dashboard-deportista' },
  { icon: '🗓', titulo: 'Disponibilidad', href: '/disponibilidad' },
]

export default function Sidebar() {
  const [abierto, setAbierto] = useState(false)
  const [autenticado, setAutenticado] = useState(false)
  const [rol, setRol] = useState<string | null>(null)
  const [depId, setDepId] = useState<number | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const botonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const comprobar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAutenticado(false); return }
      setAutenticado(true)
      const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
      setRol(p?.rol || null)
      if (p?.rol === 'deportista') {
        const { data: dep } = await supabase.from('deportista').select('id').eq('id_usuario', user.id).maybeSingle()
        setDepId(dep?.id ?? null)
      }
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
  const modulos = esDeportista ? modulosDeportistaFn(depId) : modulosEntrenador
  const dashboardHref = esDeportista ? '/dashboard-deportista' : '/dashboard'

  return (
    <>
      {/* Botón trigger - siempre visible */}
      <button
        ref={botonRef}
        onClick={() => setAbierto(!abierto)}
        style={{ height: 53 }}
        className={'fixed left-0 top-0 z-50 px-4 flex items-center bg-gray-900 border-r hover:bg-gray-800 transition ' + (abierto ? '' : 'border-b border-gray-800')}
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
        style={{ paddingTop: 53 }}
        className={'fixed left-0 top-0 h-full w-48 bg-gray-900 border-r border-gray-800 z-50 flex flex-col transition-transform duration-300 ' +
          (abierto ? 'translate-x-0' : '-translate-x-full')}
      >
        <nav className="flex-1 py-2 overflow-y-auto">
          {modulos.map(m => (
            <button key={m.titulo} onClick={() => router.push(m.href)}
              className={'w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left ' +
                (pathname === m.href ? 'bg-gray-800 border-l-2 border-orange-500' : '')}>
              <span className="text-xl flex-shrink-0">{m.icon}</span>
              <span className="text-gray-300 text-sm whitespace-nowrap">{m.titulo}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-gray-800 py-2">
          <button onClick={() => router.back()}
            className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
            <span className="text-xl flex-shrink-0">◀️</span>
            <span className="text-gray-300 text-sm whitespace-nowrap">Atrás</span>
          </button>
          <button onClick={() => router.push('/perfil')}
            className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
            <span className="text-xl flex-shrink-0">⚙️</span>
            <span className="text-gray-300 text-sm whitespace-nowrap">Mi perfil</span>
          </button>
          <button onClick={() => router.push(dashboardHref)}
            className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
            <span className="text-xl flex-shrink-0">🏠</span>
            <span className="text-gray-300 text-sm whitespace-nowrap">Dashboard</span>
          </button>
        </div>
      </div>
    </>
  )
}
