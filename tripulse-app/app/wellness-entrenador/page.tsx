'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { analizarWellness } from '@/lib/wellness-analisis'

const VARS_SUBJETIVAS = [
  { key: 'fatiga',         label: 'Fatiga',         color: '#f87171' },
  { key: 'estres',         label: 'Estrés',         color: '#fb923c' },
  { key: 'animo',          label: 'Ánimo',          color: '#4ade80' },
  { key: 'motivacion',     label: 'Motivación',     color: '#a78bfa' },
  { key: 'calidad_sueno',  label: 'Calidad sueño',  color: '#34d399' },
  { key: 'horas_sueno',    label: 'Horas sueño',    color: '#38bdf8' },
  { key: 'dolor_muscular', label: 'Dolor muscular', color: '#fbbf24' },
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

const tooltipStyle = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }

export default function WellnessEntrenador() {
  const router = useRouter()
  useRequireEntrenador()
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [seleccionado, setSeleccionado] = useState<any>(null)
  const [registros, setRegistros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [rango, setRango] = useState(14)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [usarFechasCustom, setUsarFechasCustom] = useState(false)
  const [varsActivas, setVarsActivas] = useState<string[]>(['fatiga', 'estres', 'animo', 'motivacion'])

  useEffect(() => {
    const cargar = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: deps } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
      if (deps) {
        const conWellness = await Promise.all(deps.map(async d => {
          const { data: w } = await supabase.from('wellness').select('*').eq('id_deportista', d.id).order('fecha', { ascending: false }).limit(14)
          const recientes = w || []
          return { ...d, ultimoWellness: recientes[0] || null, readiness: analizarWellness(recientes).readiness }
        }))
        setDeportistas(conWellness)
      }
      setLoading(false)
    }
    cargar()
  }, [])

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

  const verDetalle = async (dep: any) => {
    setSeleccionado(dep)
    await cargarRegistros(dep.id, rango, fechaDesde, fechaHasta, usarFechasCustom)
  }

  const cambiarRango = async (dias: number) => {
    setRango(dias); setUsarFechasCustom(false)
    if (seleccionado) await cargarRegistros(seleccionado.id, dias, '', '', false)
  }

  const aplicarFechas = async () => {
    setUsarFechasCustom(true)
    if (seleccionado) await cargarRegistros(seleccionado.id, rango, fechaDesde, fechaHasta, true)
  }

  const toggleVar = (key: string) => {
    setVarsActivas(prev => prev.includes(key) ? prev.filter(v => v !== key) : [...prev, key])
  }

  const datos = registros.map(r => ({ fecha: r.fecha.slice(5), ...r }))
  const alertas = deportistas.filter(d => d.ultimoWellness && d.ultimoWellness.score_wellness > 75)

  // Selector de rango compartido
  const SelectorRango = () => (
    <div className="flex gap-2 flex-wrap items-center mb-4">
      <p className="text-gray-500 text-xs uppercase tracking-wide mr-1">Período</p>
      {RANGOS.map(r => (
        <button key={r.dias} onClick={() => cambiarRango(r.dias)}
          className={'px-3 py-1.5 rounded-lg text-xs font-medium transition ' +
            (!usarFechasCustom && rango === r.dias ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
          {r.label}
        </button>
      ))}
      <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
        className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-orange-500" />
      <span className="text-gray-500 text-xs">—</span>
      <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
        className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-orange-500" />
      <button onClick={aplicarFechas}
        className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg transition">
        Aplicar
      </button>
    </div>
  )

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-white text-sm transition">← Dashboard</button>
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg">{d.nombre}</h3>
                    {d.readiness && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: d.readiness.color + '22', color: d.readiness.color }}>{d.readiness.label}</span>
                    )}
                  </div>
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
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Evolución — {seleccionado.nombre}</h3>
              <button onClick={() => setSeleccionado(null)} className="text-gray-400 hover:text-white text-sm">Cerrar ×</button>
            </div>

            <SelectorRango />

            {registros.length === 0 ? (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center text-gray-400">
                No hay registros en este período.
              </div>
            ) : (
              <>
                {/* ANÁLISIS — readiness + conclusiones (mismo motor que ve el atleta) */}
                {(() => {
                  const a = analizarWellness(registros)
                  if (!a.readiness) return null
                  return (
                    <div className="bg-gray-900 rounded-xl border overflow-hidden" style={{ borderColor: a.readiness.color + '55' }}>
                      <div className="p-4 flex items-center gap-3" style={{ borderLeft: '5px solid ' + a.readiness.color }}>
                        <span className="text-xl font-black leading-none" style={{ color: a.readiness.color }}>{a.readiness.label}</span>
                        <p className="text-gray-300 text-sm flex-1">{a.readiness.recomendacion}</p>
                      </div>
                      <div className="px-4 pb-4 flex flex-col gap-1.5">
                        {a.conclusiones.map((c, i) => {
                          const ic = c.tipo === 'rojo' ? '🔴' : c.tipo === 'ambar' ? '🟠' : c.tipo === 'positivo' ? '🟢' : 'ℹ️'
                          return (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <span style={{ fontSize: 11 }} className="mt-0.5">{ic}</span>
                              <span className="text-gray-300">{c.texto}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* GRÁFICA 1 — Score wellness */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-orange-400">Score Wellness</h4>
                    <span className="text-xs text-gray-500">Escala 0–100</span>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={datos}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <ReferenceLine y={25} stroke="#4ade80" strokeDasharray="4 4" label={{ value: 'Óptimo', fill: '#4ade80', fontSize: 10 }} />
                      <ReferenceLine y={50} stroke="#facc15" strokeDasharray="4 4" label={{ value: 'Aceptable', fill: '#facc15', fontSize: 10 }} />
                      <ReferenceLine y={75} stroke="#f97316" strokeDasharray="4 4" label={{ value: 'Deteriorado', fill: '#f97316', fontSize: 10 }} />
                      <Line type="monotone" dataKey="score_wellness" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 4 }} name="Score wellness" connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* GRÁFICA 2 — HRV */}
                {registros.some(r => r.hrv) && (
                  <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold text-blue-400">HRV</h4>
                      <span className="text-xs text-gray-500">Milisegundos (ms)</span>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={datos.filter(r => r.hrv)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="hrv" stroke="#60a5fa" strokeWidth={2.5} dot={{ fill: '#60a5fa', r: 4 }} name="HRV (ms)" connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* GRÁFICA 3 — Variables subjetivas */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-gray-200">Variables subjetivas</h4>
                    <span className="text-xs text-gray-500">Escala 1–7</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {VARS_SUBJETIVAS.map(v => (
                      <button key={v.key} onClick={() => toggleVar(v.key)}
                        className={'px-3 py-1 rounded-lg text-xs font-medium transition border ' +
                          (varsActivas.includes(v.key) ? 'text-gray-900 border-transparent' : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500')}
                        style={varsActivas.includes(v.key) ? { background: v.color, borderColor: v.color } : {}}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                  {varsActivas.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">Selecciona al menos una variable</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={datos}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                        <YAxis domain={[1, 7]} stroke="#9ca3af" tick={{ fontSize: 11 }} ticks={[1,2,3,4,5,6,7]} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                        {VARS_SUBJETIVAS.filter(v => varsActivas.includes(v.key)).map(v => (
                          <Line key={v.key} type="monotone" dataKey={v.key} stroke={v.color} strokeWidth={2}
                            dot={{ fill: v.color, r: 3 }} name={v.label} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Últimos registros */}
                <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
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
              </>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

