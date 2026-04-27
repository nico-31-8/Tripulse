'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function colorScore(score: number) {
  if (score <= 25) return 'text-green-400'
  if (score <= 50) return 'text-yellow-400'
  if (score <= 75) return 'text-orange-400'
  return 'text-red-400'
}

function bgScore(score: number) {
  if (score <= 25) return 'border-green-500'
  if (score <= 50) return 'border-yellow-500'
  if (score <= 75) return 'border-orange-500'
  return 'border-red-500'
}

function estadoScore(score: number) {
  if (score <= 25) return 'Optimo'
  if (score <= 50) return 'Aceptable'
  if (score <= 75) return 'Deteriorado'
  return 'Critico'
}

function colorGrafica(score: number) {
  if (score <= 25) return '#4ade80'
  if (score <= 50) return '#facc15'
  if (score <= 75) return '#fb923c'
  return '#f87171'
}

export default function WellnessEntrenador() {
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [registros, setRegistros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      if (deps) {
        const conWellness = await Promise.all(deps.map(async d => {
          const { data: w } = await supabase.from('wellness').select('*').eq('id_deportista', d.id).order('fecha', { ascending: false }).limit(1)
          return { ...d, ultimoWellness: w?.[0] || null }
        }))
        setDeportistas(conWellness)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const verDetalle = async (deportista: any) => {
    setSeleccionado(deportista)
    const { data } = await supabase.from('wellness').select('*').eq('id_deportista', deportista.id).order('fecha', { ascending: true }).limit(14)
    setRegistros(data || [])
  }

  const alertas = deportistas.filter(d => d.ultimoWellness && d.ultimoWellness.score_wellness > 75)

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">Wellness — Vista entrenador</h2>
        <p className="text-gray-400 mb-6">Estado de tus deportistas</p>

        {alertas.length > 0 && (
          <div className="bg-red-900 border border-red-500 rounded-xl p-4 mb-6">
            <p className="font-bold text-red-300 mb-2">⚠️ Alertas — Estado critico</p>
            <div className="flex flex-wrap gap-2">
              {alertas.map(d => (
                <button key={d.id} onClick={() => verDetalle(d)} className="bg-red-800 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm transition">
                  {d.nombre} — {d.ultimoWellness.score_wellness}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {deportistas.map(d => (
            <button key={d.id} onClick={() => verDetalle(d)} className={'bg-gray-900 rounded-xl p-5 border-2 text-left transition hover:opacity-90 ' + (d.ultimoWellness ? bgScore(d.ultimoWellness.score_wellness) : 'border-gray-700')}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{d.nombre}</h3>
                  {d.ultimoWellness ? (
                    <div>
                      <p className="text-gray-400 text-sm">Ultimo registro: {d.ultimoWellness.fecha}</p>
                      <p className="text-gray-300 text-sm">Sueno: {d.ultimoWellness.horas_sueno}h · Fatiga: {d.ultimoWellness.fatiga}/7</p>
                      {d.ultimoWellness.hrv && <p className="text-blue-400 text-sm">HRV: {d.ultimoWellness.hrv} ms</p>}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">Sin registros todavia</p>
                  )}
                </div>
                {d.ultimoWellness && (
                  <div className="text-right">
                    <p className={'text-3xl font-bold ' + colorScore(d.ultimoWellness.score_wellness)}>{d.ultimoWellness.score_wellness}</p>
                    <p className={'text-xs ' + colorScore(d.ultimoWellness.score_wellness)}>{estadoScore(d.ultimoWellness.score_wellness)}</p>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {seleccionado && (
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Evolucion wellness — {seleccionado.nombre}</h3>
              <button onClick={() => setSeleccionado(null)} className="text-gray-400 hover:text-white text-sm">Cerrar</button>
            </div>
            {registros.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No hay registros suficientes para mostrar la grafica.</p>
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={registros.map(r => ({ fecha: r.fecha.slice(5), score: r.score_wellness, hrv: r.hrv }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} stroke="#9ca3af" tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white' }} />
                    <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} name="Score wellness" />
                  </LineChart>
                </ResponsiveContainer>

                {registros.some(r => r.hrv) && (
                  <div className="mt-6">
                    <h4 className="font-medium text-gray-300 mb-3">Evolucion HRV</h4>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={registros.filter(r => r.hrv).map(r => ({ fecha: r.fecha.slice(5), hrv: r.hrv }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                        <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white' }} />
                        <Line type="monotone" dataKey="hrv" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 4 }} name="HRV (ms)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-6 grid gap-2">
                  <h4 className="font-medium text-gray-300 mb-1">Ultimos registros</h4>
                  {registros.slice(-5).reverse().map(r => (
                    <div key={r.id} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{r.fecha}</p>
                        <p className="text-gray-400 text-xs">Sueno: {r.horas_sueno}h · Fatiga: {r.fatiga}/7 · Estres: {r.estres}/7 · Animo: {r.animo}/7</p>
                      </div>
                      <div className="text-right">
                        <p className={'font-bold ' + colorScore(r.score_wellness)}>{r.score_wellness}</p>
                        {r.hrv && <p className="text-blue-400 text-xs">{r.hrv} ms</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {deportistas.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-5xl mb-4">💚</div>
            <p>No tienes deportistas todavia.</p>
          </div>
        )}
      </div>
    </main>
  )
}
