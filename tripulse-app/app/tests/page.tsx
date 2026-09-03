'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { calcularEdad } from '@/lib/fechas'
import { usuarioActual } from '@/lib/sesion'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { getAtletaActivo, setAtletaActivo } from '@/lib/atletaActivo'

export default function TestsPage() {
  const router = useRouter()
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])

  useEffect(() => {
    const cargar = async () => {
      const user = await usuarioActual()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      setDeportistas(data || [])
      // Si hay un deportista activo, entramos directo a sus tests (sin volver a elegir).
      const act = getAtletaActivo()
      if (act && (data || []).some(d => d.id === act)) { router.replace('/tests/' + act); return }
    }
    cargar()
  }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">Tests</h2>
        <p className="text-gray-400 mb-6">Selecciona un deportista para ver o añadir sus tests</p>

        {/* La entrada a la batería de campo. Va aquí arriba y no escondida en la
            ficha de un atleta porque el entrenador que va a testar todavía no ha
            elegido a quién: muchas veces son varios a la vez. */}
        <button onClick={() => router.push('/tests/dirigir')}
          className="w-full mb-8 bg-gray-900 hover:border-orange-500 border border-gray-800 rounded-xl p-5 flex items-center justify-between gap-4 text-left transition">
          <div>
            <h3 className="font-bold">Dirigir tests</h3>
            <p className="text-gray-500 text-sm mt-0.5">
              Los 17 tests de la batería a pie de pista: metes lo que mides y el resultado sale solo. A uno o a varios.
            </p>
          </div>
          <span className="text-orange-400 text-xl shrink-0">→</span>
        </button>
        {deportistas.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">🏋️</div>
            <p>No tienes deportistas todavia.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {deportistas.map(d => (
              <button key={d.id} onClick={() => { setAtletaActivo(d.id); router.push(`/tests/${d.id}`) }} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition text-left w-full">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg">{d.nombre}</h3>
                    <p className="text-gray-400 text-sm">
                      {d.sexo || 'Sin especificar'} · 
                      {d.fecha_nacimiento ? ` ${calcularEdad(d.fecha_nacimiento)} años · ` : ' '}
                      FC max: {d.fc_maxima || '—'} ppm
                    </p>
                  </div>
                  <span className="text-orange-500 text-sm">Ver tests →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

