'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function PlanificacionVisualIndex() {
  const [deportistas, setDeportistas] = useState<any[]>([])

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      setDeportistas(data || [])
    }
    cargar()
  }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">Planificacion visual</h2>
        <p className="text-gray-400 mb-8">Selecciona un deportista para ver su planificacion</p>
        {deportistas.length === 0 ? (
          <div className="text-center py-16 text-gray-500"><div className="text-5xl mb-4">📅</div><p>No tienes deportistas todavia.</p></div>
        ) : (
          <div className="grid gap-4">
            {deportistas.map(d => (
              <button key={d.id} onClick={() => window.location.href = '/planificacion-visual/' + d.id} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition text-left">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg">{d.nombre}</h3>
                    <p className="text-gray-400 text-sm">{d.sexo || 'Sin especificar'} · FC max: {d.fc_maxima || '—'} ppm</p>
                  </div>
                  <span className="text-orange-500">Ver planificacion →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
