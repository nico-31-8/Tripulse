'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const [perfil, setPerfil] = useState<any>(null)

  useEffect(() => {
    const cargarPerfil = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      setPerfil(data)
    }
    cargarPerfil()
  }, [])

  const [verInfo, setVerInfo] = useState(false)
  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const ir = (ruta: string) => { window.location.href = ruta }

  const modulos = [
    { icon: '👥', titulo: 'Deportistas', descripcion: 'Añade y gestiona tus atletas. Accede a su perfil, tests y zonas de entrenamiento.', href: '/deportistas' },
    { icon: '📅', titulo: 'Planificación', descripcion: 'Diseña macrociclos, mesociclos, microciclos y sesiones. Planifica tareas por zona y disciplina.', href: '/planificacion-visual' },
    { icon: '💚', titulo: 'Wellness', descripcion: 'Consulta el estado diario de tus atletas. Score, HRV, fatiga, estrés y evolución gráfica.', href: '/wellness-entrenador' },
    { icon: '📈', titulo: 'Carga', descripcion: 'Monitoriza ATL, CTL, TSB, ACWR, monotonía y strain. Control del estrés de entrenamiento.', href: '/carga' },
    { icon: '📊', titulo: 'Volumen', descripcion: 'Visualiza el volumen de entrenamiento por disciplina. Metros, minutos y carga UA por semana.', href: '/volumen' },
    { icon: '🔬', titulo: 'Sistema ECO', descripcion: 'Análisis individualizado del coste energético por disciplina. Factores F1-F4 y corrector HRV.', href: '/eco' },
    { icon: '🎯', titulo: 'Análisis de Índices', descripcion: 'Índice de percepción y planificación por sesión. Semáforo de doble dimensión.', href: '/indices' },
    { icon: '🏋️', titulo: 'Tests', descripcion: 'Registra FTP, CSS, VAM y 1RM. Genera zonas de entrenamiento automáticas.', href: '/tests' },
    { icon: '💪', titulo: 'Biblioteca Fuerza', descripcion: 'Gestiona ejercicios por grupo muscular con video de referencia. Acceso con clave de admin.', href: '/fuerza' },
  ]

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-orange-500">TRIPULSE</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{perfil?.nombre}</span>
          <button onClick={cerrarSesion} className="text-gray-400 hover:text-white text-sm transition">Cerrar sesion</button>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold">Bienvenido, {perfil?.nombre} 👋</h2>
          <button onClick={() => setVerInfo(!verInfo)}
            className={'px-4 py-2 rounded-lg text-sm font-medium transition border ' +
              (verInfo ? 'bg-orange-500 border-orange-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500')}>
            {verInfo ? '📖 Ocultar info' : 'ℹ️ Ver info'}
          </button>
        </div>
        <p className="text-gray-400 mb-8">Panel del entrenador</p>
        <div className={'grid gap-4 ' + (verInfo ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-3')}>
          {modulos.map(m => (
            <button key={m.titulo} onClick={() => ir(m.href)} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition text-left w-full">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{m.icon}</span>
                <h3 className={'font-bold ' + (verInfo ? 'text-lg' : 'text-sm')}>{m.titulo}</h3>
              </div>
              {verInfo && <p className="text-gray-400 text-sm mt-2">{m.descripcion}</p>}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
