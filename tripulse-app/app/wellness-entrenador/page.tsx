'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const VARIABLES = [
  { key: 'score_wellness', label: 'Score wellness', color: '#f97316', domain: [0, 100] },
  { key: 'hrv', label: 'HRV (ms)', color: '#60a5fa', domain: ['auto', 'auto'] },
  { key: 'fatiga', label: 'Fatiga', color: '#f87171', domain: [1, 7] },
  { key: 'estres', label: 'Estrés', color: '#fb923c', domain: [1, 7] },
  { key: 'animo', label: 'Ánimo', color: '#4ade80', domain: [1, 7] },
  { key: 'motivacion', label: 'Motivación', color: '#a78bfa', domain: [1, 7] },
  { key: 'calidad_sueno', label: 'Calidad sueño', color: '#34d399', domain: [1, 7] },
  { key: 'horas_sueno', label: 'Horas sueño', color: '#38bdf8', domain: [0, 12] },
  { key: 'dolor_muscular', label: 'Dolor muscular', color: '#fbbf24', domain: [1, 7] },
]

const RANGOS = [
  { label: '7 días', dias: 7 },
  { label: '14 días', dias: 14 },
  { label: '30 días', dias: 30 },
  { label: 'Todo', dias: 365 },
]

function colorScore(s: number) {
  if (s <= 25) return 'text-green-400'
  if (s <= 50) return 'text-yellow-400'
  if (s <= 75) return 'text-orange-400'
  return 'text-red-400'
}
function bgScore(s: number) {
  if (s <= 25) return 'border-green-500'
  if (s <= 50) return 'border-yellow-500'
  if (s <= 75) return 'border-orange-500'
  return 'border-red-500'
}
function estadoScore(s: number) {
  if (s <= 25) return 'Óptimo'
  if (s <= 50) return 'Aceptable'
  if (s <= 75) return 'Deteriorado'
  return 'Crítico'
}

export default function WellnessEntrenador() {
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [registros, setRegistros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [variablesActivas, setVariablesActivas] = useState<string[]>(['score_wellness', 'hrv'])
  const [rango, setRango] = useState(14)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [usarFechasCustom, setUsarFechasCustom] = useState(false)

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
    await cargarRegistros(deportista.id, rango, fechaDesde, fechaHasta, usarFechasCustom)
  }

  const cargarRegistros = async (depId: number, dias: number, desde: string, hasta: string, custom: boolean) => {
    let query = supabase.from('wellness').select('*').eq('id_deportista', depId).order('fecha', { ascending: true })
    if (custom && desde) query = query.gte('fecha', desde)
    if (custom && hasta) query = query.lte('fecha', hasta)
    if (!custom) {
      const fechaLimite = new Date()
      fechaLimite.setDate(fechaLimite.getDate() - dias)
      query = query.gte('fecha', fechaLimite.toISOString().split('T')[0])
    }
    const { data } = await query
    setRegistros(data || [])
  }

  const cambiarRango = async (dias: number) => {
    setRango(dias)
    setUsarFechasCustom(false)
    if (seleccionado) await cargarRegistros(seleccionado.id, dias, '', '', false)
  }

  const aplicarFechasCustom = async () => {
    setUsarFechasCustom(true)
    if (seleccionado) await cargarRegistros(seleccionado.id, rango, fechaDesde, fechaHasta, true)
  }

  const toggleVariable = (key: string) => {
    setVariablesActivas(prev =>
      prev.includes(key) ? prev.filter(v => v !== key) : [...prev, key]
    )
  }

  const datosGrafica = registros.map(r => ({
    fecha: r.fecha.slice(5),
    ...VARIABLES.reduce((acc, v) => ({ ...acc, [v.key]: r[v.key] }), {})
  }))

  const alertas = deportistas.filter(d => d.ultimoWellness && d.ultimoWellness.score_wellness > 75)

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
      </nav>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">Wellness — Vista entrenador</h2>
        <p className="text-gray-400 mb-6">Estado de tus deportistas</p>

        {alertas.length > 0 && (
          <div className="bg-red-900 border border-red-500 rounded-xl p-4 mb-6">
            <p className="font-bold text-red-300 mb-2">⚠️ Estado crítico</p>
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
            <button key={d.id} onClick={() => verDetalle(d)}
              className={'bg-gray-900 rounded-xl p-5 border-2 text-left transition hover:opacity-90 ' + (d.ultimoWellness ? bgScore(d.ultimoWellness.score_wellness) : 'border-gray-700')}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{d.nombre}</h3>
                  {d.ultimoWellness ? (
                    <div>
                      <p className="text-gray-400 text-sm">Último: {d.ultimoWellness.fecha}</p>
                      <p className="text-gray-300 text-sm">Sueño: {d.ultimoWellness.horas_sueno}h · Fatiga: {d.ultimoWellness.fatiga}/7</p>
                      {d.ultimoWellness.hrv && <p className="text-blue-400 text-sm">HRV: {d.ultimoWellness.hrv} ms</p>}
                    </div>
                  ) : <p className="text-gray-500 text-sm">Sin registros todavía</p>}
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
          {deportistas.length === 0 && (
            <div className="col-span-2 text-center py-12 text-gray-500">
              <div className="text-5xl mb-4">💚</div>
              <p>No tienes deportistas todavía.</p>
            </div>
          )}
        </div>

        {seleccionado && (
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Evolución — {seleccionado.nombre}</h3>
              <button onClick={() => setSeleccionado(null)} className="text-gray-400 hover:text-white text-sm">Cerrar ×</button>
            </div>

            {/* Selector de variables */}
            <div className="mb-5">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2 font-medium">Variables a mostrar</p>
              <div className="flex flex-wrap gap-2">
                {VARIABLES.map(v => (
                  <button key={v.key} onClick={() => toggleVariable(v.key)}
                    className={'px-3 py-1.5 rounded-lg text-xs font-medium transition border ' +
                      (variablesActivas.includes(v.key)
                        ? 'text-gray-900 border-transparent'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500')}
                    style={variablesActivas.includes(v.key) ? { background: v.color, borderColor: v.color } : {}}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Selector de rango */}
            <div className="mb-5">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2 font-medium">Período</p>
              <div className="flex gap-2 flex-wrap items-end">
                <div className="flex gap-2">
                  {RANGOS.map(r => (
                    <button key={r.dias} onClick={() => cambiarRango(r.dias)}
                      className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
                        (!usarFechasCustom && rango === r.dias
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-center ml-2">
                  <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                    className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-orange-500" />
                  <span className="text-gray-500 text-xs">—</span>
                  <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                    className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-orange-500" />
                  <button onClick={aplicarFechasCustom}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg transition">
                    Aplicar
                  </button>
                </div>
              </div>
            </div>

            {/* Gráfica */}
            {registros.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No hay registros en este período.</p>
            ) : variablesActivas.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Selecciona al menos una variable para ver la gráfica.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={datosGrafica}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                  {VARIABLES.filter(v => variablesActivas.includes(v.key)).map(v => (
                    <Line key={v.key} type="monotone" dataKey={v.key} stroke={v.color} strokeWidth={2}
                      dot={{ fill: v.color, r: 3 }} name={v.label} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}

            {/* Tabla de últimos registros */}
            <div className="mt-6">
              <h4 className="font-medium text-gray-300 mb-3 text-sm">Últimos registros</h4>
              <div className="grid gap-2">
                {registros.slice(-5).reverse().map(r => (
                  <div key={r.id} className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{r.fecha}</p>
                      <p className="text-gray-400 text-xs">Sueño: {r.horas_sueno}h · Fatiga: {r.fatiga}/7 · Estrés: {r.estres}/7 · Ánimo: {r.animo}/7 · Motivación: {r.motivacion}/7</p>
                      {r.hrv && <p className="text-blue-400 text-xs">HRV: {r.hrv} ms</p>}
                    </div>
                    <div className="text-right ml-4">
                      <p className={'font-bold ' + colorScore(r.score_wellness)}>{r.score_wellness}</p>
                      <p className={'text-xs ' + colorScore(r.score_wellness)}>{estadoScore(r.score_wellness)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
