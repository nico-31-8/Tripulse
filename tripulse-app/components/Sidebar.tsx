'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usuarioActual, perfilActual, deportistaActual } from '@/lib/sesion'
import { getEspacio, setEspacio, EVENTO_ESPACIO, type Espacio } from '@/lib/espacio'
import { setAtletaActivo } from '@/lib/atletaActivo'
import { useTutorial } from './tutorial/TutorialProvider'

const RUTAS_PUBLICAS = ['/', '/login', '/registro', '/privacidad', '/terminos']

/* El modo entreno se usa a pantalla completa, con el móvil en la mano entre
   series. El botón del menú es `fixed left-0 top-0 z-50`, o sea que se comía esa
   esquina — y justo ahí está el «← Plan» de la sesión: un toque en el botón de
   volver pulsaba el logo. Se comprobó con elementFromPoint. NavDeportista ya se
   excluía de aquí; el menú también debe. */
const esModoEntreno = (p: string) => /^\/sesion\/[^/]+\/ejecutar/.test(p)

const modulosEntrenador = [
  { icon: '👥', titulo: 'Deportistas', href: '/deportistas' },
  { icon: '📅', titulo: 'Planificación', href: '/planificacion-visual' },
  { icon: '🧩', titulo: 'Planificador', href: '/planificador' },
  { icon: '💚', titulo: 'Wellness', href: '/wellness-entrenador' },
  { icon: '📈', titulo: 'Carga', href: '/carga' },
  { icon: '🔬', titulo: 'SICAT', href: '/eco' },
  { icon: '🎯', titulo: 'Índices', href: '/indices' },
  { icon: '🏋️', titulo: 'Tests', href: '/tests' },
  { icon: '💪', titulo: 'Biblioteca Fuerza', href: '/fuerza' },
  { icon: '📊', titulo: 'Volumen', href: '/volumen' },
  { icon: '💬', titulo: 'Comunicación', href: '/comunicacion' },
  { icon: '📨', titulo: 'Envíos', href: '/envios' },
  { icon: '🤖', titulo: 'Asistente IA', href: '/asistente' },
  { icon: '🤝', titulo: 'Comunidad', href: '/comunidad' },
  { icon: '🗑️', titulo: 'Papelera', href: '/papelera' },
]

// Los módulos del deportista se construyen con su id (wellness y chat lo necesitan)
/* Por estas dos entradas pasa el recorrido del primer día (lib/tutorial). */
const ANCLA_MENU: Record<string, string> = { '/deportistas': 'menu.deportistas', '/planificacion-visual': 'menu.planificacion' }
/* Y por estas, el del deportista en el ordenador (su href lleva su id: van por el título). */
const ANCLA_MENU_DEPORTISTA: Record<string, string> = {
  'Mis sesiones': 'menu.d-sesiones', Wellness: 'menu.d-wellness', 'Mis análisis': 'menu.d-analisis', 'Comunicación': 'menu.d-chat',
  'Mi plan': 'menu.d-mi-plan',
}

const modulosDeportistaFn = (depId: number | null) => [
  // Primero el plan: es lo que da sentido a todo lo demás. Un atleta sin plan
  // que entra en «Mis sesiones» ve una lista vacía y no sabe por qué.
  { icon: '🎯', titulo: 'Mi plan', href: '/mi-plan' },
  { icon: '📋', titulo: 'Mis sesiones', href: '/mis-sesiones' },
  { icon: '💚', titulo: 'Wellness', href: depId ? '/wellness/' + depId : '/dashboard-deportista' },
  { icon: '🏋️', titulo: 'Mis tests', href: '/mis-tests' },
  { icon: '📊', titulo: 'Mis análisis', href: '/mis-analisis' },
  { icon: '💬', titulo: 'Comunicación', href: depId ? '/chat/' + depId : '/dashboard-deportista' },
  { icon: '🤝', titulo: 'Comunidad', href: '/comunidad' },
  { icon: '🗓', titulo: 'Disponibilidad', href: '/disponibilidad' },
]

export default function Sidebar() {
  const [abierto, setAbierto] = useState(false)
  const [autenticado, setAutenticado] = useState(false)
  const [rol, setRol] = useState<string | null>(null)
  const [depId, setDepId] = useState<number | null>(null)
  // El enlace al panel solo lo ven las cuentas de plataforma. Esconderlo es
  // cosmética: el candado de verdad está en cada función SQL de /admin.
  const [esPlataforma, setEsPlataforma] = useState(false)
  /* «Mis entrenadores» solo para directores, por lo mismo que «Plataforma»: es
     cosmética, el candado está en las funciones director_* de la base. */
  const [esDirector, setEsDirector] = useState(false)
  // El espacio del entrenador en el que trabaja un director (lib/espacio).
  const [espacio, setEsp] = useState<Espacio | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const botonRef = useRef<HTMLButtonElement>(null)
  const tutorial = useTutorial()
  /* El botón ? va pegado al de TRIPULSE: se mide su ancho para ponerse al lado. */
  const [anchoMenu, setAnchoMenu] = useState(132)
  useEffect(() => {
    const b = botonRef.current
    if (!b) return
    const medir = () => setAnchoMenu(b.offsetWidth || 132)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(b)
    return () => ro.disconnect()
  }, [autenticado])

  useEffect(() => {
    const comprobar = async () => {
      const user = await usuarioActual()
      if (!user) { setAutenticado(false); return }
      setAutenticado(true)
      const p = await perfilActual()
      setRol(p?.rol || null)
      if (p?.rol === 'deportista') {
        const dep = await deportistaActual()
        setDepId(dep?.id ?? null)
      } else {
        const [pla, dir] = await Promise.all([supabase.rpc('soy_plataforma'), supabase.rpc('soy_director')])
        setEsPlataforma(!!pla.data)
        setEsDirector(!!dir.data)
      }
    }
    comprobar()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAutenticado(!!session)
      if (!session) setRol(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const leer = () => setEsp(getEspacio())
    leer()
    window.addEventListener(EVENTO_ESPACIO, leer)
    window.addEventListener('storage', leer)
    return () => {
      window.removeEventListener(EVENTO_ESPACIO, leer)
      window.removeEventListener('storage', leer)
    }
  }, [])

  /* La marca de director se vuelve a mirar cada vez que se abre el menú: si la
     plataforma la pone (o la quita) con la página ya cargada, el enlace a «Mis
     entrenadores» aparece sin tener que recargar. Es una consulta pequeña. */
  useEffect(() => {
    if (!abierto || rol === 'deportista' || !rol) return
    let vivo = true
    supabase.rpc('soy_director').then(({ data, error }) => { if (vivo && !error) setEsDirector(!!data) })
    return () => { vivo = false }
  }, [abierto, rol])

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

  if (!autenticado || RUTAS_PUBLICAS.includes(pathname) || esModoEntreno(pathname)) return null

  const esDeportista = rol === 'deportista'
  const enEspacio = !esDeportista && !!espacio
  /* El director ve «Mis entrenadores» justo debajo de Deportistas. Dentro del
     espacio de otro entrenador, Comunicación se queda con candado: el chat es
     entre ese entrenador y sus deportistas. */
  const modulosCoach = modulosEntrenador.flatMap(m =>
    m.href === '/deportistas' && esDirector
      ? [m, { icon: '🧭', titulo: 'Mis entrenadores', href: '/entrenadores' }]
      : [m])
  const modulos = esDeportista
    ? modulosDeportistaFn(depId)
    : esPlataforma
      ? [...modulosCoach, { icon: '🛠', titulo: 'Plataforma', href: '/admin' }]
      : modulosCoach
  const bloqueado = (href: string) => enEspacio && (href === '/comunicacion' || href === '/envios')
  const salirDelEspacio = () => {
    setAtletaActivo(null)
    setEspacio(null)
    router.push('/entrenadores')
  }
  const dashboardHref = esDeportista ? '/dashboard-deportista' : '/dashboard'

  return (
    <>
      {/* Botón trigger - siempre visible */}
      <button
        ref={botonRef}
        data-guia="menu"
        onClick={() => setAbierto(!abierto)}
        style={{ height: 53 }}
        className={'fixed left-0 top-0 z-50 px-4 flex items-center bg-gray-900 border-r hover:bg-gray-800 transition ' + (abierto ? '' : 'border-b border-gray-800')}
      >
        <span className="text-orange-500 font-bold text-lg">TRIPULSE</span>
      </button>

      {/* El botón ?: el recorrido de esta pantalla, o la lista si no tiene (components/tutorial). */}
      {tutorial?.activo && (
        <button type="button" data-guia="ayuda" onClick={() => { setAbierto(false); tutorial.ayuda() }}
          aria-label="Ver el recorrido de esta pantalla" title="Ver el recorrido de esta pantalla"
          style={{ height: 53, left: anchoMenu }}
          className="fixed top-0 z-50 w-10 flex items-center justify-center bg-gray-900 border-r border-b border-gray-800 hover:bg-gray-800 transition">
          <span className="w-7 h-7 rounded-full border border-orange-500/50 bg-orange-500/10 text-orange-400 text-sm font-bold grid place-items-center">?</span>
        </button>
      )}

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
          {enEspacio && (
            <div className="px-3 pt-1 pb-2 mb-1 border-b border-gray-800">
              <p className="text-[11px] text-teal-300 tracking-wide truncate">Espacio de {espacio?.nombre || 'tu entrenador'}</p>
              <button onClick={salirDelEspacio}
                className="mt-1 text-sm text-teal-200 hover:text-white transition">← Salir del espacio</button>
            </div>
          )}
          {modulos.map(m => bloqueado(m.href) ? (
            <div key={m.titulo} title={m.href === '/envios'
              ? 'Son tus envíos, no los de este entrenador: sal de su espacio para verlos'
              : 'Privado entre el entrenador y sus deportistas'}
              className="w-full flex items-center gap-3 px-3 py-3 text-left opacity-50 cursor-not-allowed">
              <span className="text-xl flex-shrink-0">{m.icon}</span>
              <span className="text-gray-400 text-sm whitespace-nowrap">{m.titulo} 🔒</span>
            </div>
          ) : (
            <button key={m.titulo} onClick={() => router.push(m.href)} data-guia={esDeportista ? ANCLA_MENU_DEPORTISTA[m.titulo] : ANCLA_MENU[m.href]}
              className={'w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left ' +
                (pathname === m.href ? 'bg-gray-800 border-l-2 border-orange-500' : '')}>
              <span className="text-xl flex-shrink-0">{m.icon}</span>
              <span className="text-gray-300 text-sm whitespace-nowrap">{m.titulo}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-gray-800 py-2">
          {tutorial?.activo && (
            <button onClick={() => { setAbierto(false); tutorial.abrirLista() }}
              className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
              <span className="text-xl flex-shrink-0">🎓</span>
              <span className="text-orange-300 text-sm font-medium whitespace-nowrap">Tutoriales</span>
            </button>
          )}
          <button onClick={() => router.back()}
            className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-800 transition text-left">
            <span className="text-xl flex-shrink-0">◀️</span>
            <span className="text-gray-300 text-sm whitespace-nowrap">Atrás</span>
          </button>
          <button onClick={() => router.push('/perfil')} data-guia="menu.perfil"
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
