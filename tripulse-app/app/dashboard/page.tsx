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

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-orange-500">TRIPULSE</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{perfil?.nombre}</span>
          <button onClick={cerrarSesion} className="text-gray-400 hover:text-white text-sm transition">Cerrar sesión</button>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">Bienvenido, {perfil?.nombre} 👋</h2>
        <p className="text-gray-400 mb-8">Panel del entrenador</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition cursor-pointer">
            <div className="text-3xl mb-3">👥</div>
            <h3 className="font-bold text-lg mb-1">Deportistas</h3>
            <p className="text-gray-400 text-sm">Gestiona tus atletas</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition cursor-pointer">
            <div className="text-3xl mb-3">📅</div>
            <h3 className="font-bold text-lg mb-1">Planificación</h3>
            <p className="text-gray-400 text-sm">Macrociclos, mesociclos y sesiones</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition cursor-pointer">
            <div className="text-3xl mb-3">📊</div>
            <h3 className="font-bold text-lg mb-1">Sistema ECO</h3>
            <p className="text-gray-400 text-sm">Análisis de carga individual</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition cursor-pointer">
            <div className="text-3xl mb-3">💚</div>
            <h3 className="font-bold text-lg mb-1">Wellness</h3>
            <p className="text-gray-400 text-sm">Estado diario de tus atletas</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition cursor-pointer">
            <div className="text-3xl mb-3">🏋️</div>
            <h3 className="font-bold text-lg mb-1">Tests</h3>
            <p className="text-gray-400 text-sm">FTP, CSS, VAM, 1RM</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition cursor-pointer">
            <div className="text-3xl mb-3">📈</div>
            <h3 className="font-bold text-lg mb-1">Carga</h3>
            <p className="text-gray-400 text-sm">ATL, CTL, TSB y ACWR</p>
          </div>
        </div>
      </div>
    </main>
  )
}
