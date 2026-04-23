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

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const ir = (ruta: string) => { window.location.href = ruta }

  const modulos = [
    { icon: '👥', titulo: 'Deportistas', descripcion: 'Gestiona tus atletas', href: '/deportistas' },
    { icon: '📅', titulo: 'Planificacion', descripcion: 'Macrociclos, mesociclos y sesiones', href: '/deportistas' },
    { icon: '📊', titulo: 'Sistema ECO', descripcion: 'Analisis de carga individual', href: '/deportistas' },
    { icon: '💚', titulo: 'Wellness', descripcion: 'Estado diario de tus atletas', href: '/deportistas' },
    { icon: '🏋️', titulo: 'Tests', descripcion: 'FTP, CSS, VAM, 1RM', href: '/deportistas' },
    { icon: '📈', titulo: 'Carga', descripcion: 'ATL, CTL, TSB y ACWR', href: '/deportistas' },
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
        <h2 className="text-2xl font-bold mb-2">Bienvenido, {perfil?.nombre} 👋</h2>
        <p className="text-gray-400 mb-8">Panel del entrenador</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {modulos.map(m => (
            <button key={m.titulo} onClick={() => ir(m.href)} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition text-left w-full">
              <div className="text-3xl mb-3">{m.icon}</div>
              <h3 className="font-bold text-lg mb-1">{m.titulo}</h3>
              <p className="text-gray-400 text-sm">{m.descripcion}</p>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
