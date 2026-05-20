'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

function scoreWellness(datos: any): number {
  const animoInv = 8 - datos.animo
  const motivacionInv = 8 - datos.motivacion
  const suma = datos.calidad_sueno + datos.fatiga + datos.estres + datos.dolor_muscular + animoInv + motivacionInv
  return Math.round(((suma - 6) / 36) * 100)
}

function colorScore(score: number) {
  if (score <= 25) return 'text-green-400'
  if (score <= 50) return 'text-yellow-400'
  if (score <= 75) return 'text-orange-400'
  return 'text-red-400'
}

function estadoScore(score: number) {
  if (score <= 25) return 'Optimo'
  if (score <= 50) return 'Aceptable'
  if (score <= 75) return 'Deteriorado'
  return 'Critico'
}

function SliderInput({ label, value, onChange, min = 1, max = 7, descripcionInf, descripcionSup }: any) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-2">
        <label className="text-white font-medium text-sm">{label}</label>
        <span className="text-orange-400 font-bold text-lg">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-orange-500" />
      <div className="flex justify-between text-gray-500 text-xs mt-1">
        <span>{descripcionInf}</span>
        <span>{descripcionSup}</span>
      </div>
    </div>
  )
}

export default function WellnessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [deportista, setDeportista] = useState<any>(null)
  const [registros, setRegistros] = useState<any[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [varsActivas, setVarsActivas] = useState<string[]>(['fatiga', 'estres', 'animo', 'motivacion'])
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [calidadSueno, setCalidadSueno] = useState(4)
  const [horasSueno, setHorasSueno] = useState(7)
  const [fatiga, setFatiga] = useState(4)
  const [estres, setEstres] = useState(4)
  const [dolorMuscular, setDolorMuscular] = useState(4)
  const [animo, setAnimo] = useState(4)
  const [motivacion, setMotivacion] = useState(4)
  const [hrv, setHrv] = useState('')
  const [fcReposo, setFcReposo] = useState('')
  const [malestarGeneral, setMalestarGeneral] = useState(4)

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDeportista(dep)
    const { data: reg } = await supabase.from('wellness').select('*').eq('id_deportista', id).order('fecha', { ascending: false }).limit(30)
    setRegistros(reg || [])
  }

  const preview = scoreWellness({ calidad_sueno: calidadSueno, fatiga, estres, dolor_muscular: dolorMuscular, animo, motivacion })

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const score = scoreWellness({ calidad_sueno: calidadSueno, fatiga, estres, dolor_muscular: dolorMuscular, animo, motivacion })
    const { error } = await supabase.from('wellness').insert({
      id_deportista: Number(id),
      fecha,
      calidad_sueno: calidadSueno,
      horas_sueno: horasSueno,
      fatiga,
      estres,
      dolor_muscular: dolorMuscular,
      animo,
      motivacion,
      hrv: hrv ? Number(hrv) : null,
      fc_reposo: fcReposo ? Number(fcReposo) : null,
      malestar_general: malestarGeneral,
      score_wellness: score
    })
    if (error) setError('Error: ' + error.message)
    else { setMostrarForm(false); cargarDatos() }
    setLoading(false)
  }

  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = '/dashboard'} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <button onClick={() => window.location.href = `/deportistas/${id}`} className="text-gray-400 hover:text-white text-sm transition">← Perfil deportista</button>
      </nav>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-1">Wellness — {deportista.nombre}</h2>
          <p className="text-gray-400 text-sm">Registro diario de estado del atleta</p>
        </div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Registros recientes</h3>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            {mostrarForm ? 'Cancelar' : '+ Nuevo registro'}
          </button>
        </div>
        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}

        {mostrarForm && (
          <form onSubmit={guardar} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold text-lg">Registro de hoy</h4>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required />
            </div>
            <SliderInput label="Calidad del sueno" value={calidadSueno} onChange={setCalidadSueno} descripcionInf="Muy buena" descripcionSup="Muy mala" />
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-white font-medium text-sm">Horas de sueno</label>
                <span className="text-orange-400 font-bold text-lg">{horasSueno}h</span>
              </div>
              <input type="range" min={3} max={12} step={0.5} value={horasSueno} onChange={e => setHorasSueno(Number(e.target.value))} className="w-full accent-orange-500" />
              <div className="flex justify-between text-gray-500 text-xs mt-1"><span>3h</span><span>12h</span></div>
            </div>
            <SliderInput label="Fatiga percibida" value={fatiga} onChange={setFatiga} descripcionInf="Sin fatiga" descripcionSup="Agotado" />
            <SliderInput label="Estres general" value={estres} onChange={setEstres} descripcionInf="Sin estres" descripcionSup="Muy estresado" />
            <SliderInput label="Dolor muscular" value={dolorMuscular} onChange={setDolorMuscular} descripcionInf="Sin dolor" descripcionSup="Dolor intenso" />
            <SliderInput label="Animo" value={animo} onChange={setAnimo} descripcionInf="Muy malo" descripcionSup="Muy bueno" />
            <SliderInput label="Motivacion" value={motivacion} onChange={setMotivacion} descripcionInf="Muy baja" descripcionSup="Muy alta" />
            <SliderInput label="Malestar general" value={malestarGeneral} onChange={setMalestarGeneral} descripcionInf="Sin malestar" descripcionSup="Mucho malestar" />

            {/* Objetivos bloc */}
            <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-white font-medium text-sm mb-1">Datos objetivos del reloj</p>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">HRV matutina (ms) — opcional</label>
                <input type="number" placeholder="Ej: 52" value={hrv} onChange={e => setHrv(e.target.value)} className="bg-gray-700 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full text-sm" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">FC en reposo (ppm) — opcional</label>
                <input type="number" placeholder="Ej: 48" value={fcReposo} onChange={e => setFcReposo(e.target.value)} className="bg-gray-700 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full text-sm" />
                <p className="text-gray-600 text-xs mt-1">Una FC en reposo elevada de forma sostenida puede indicar sobreentrenamiento</p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-sm mb-1">Score wellness estimado</p>
              <p className={`text-3xl font-bold ${colorScore(preview)}`}>{preview}</p>
              <p className={`text-sm ${colorScore(preview)}`}>{estadoScore(preview)}</p>
            </div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar registro'}
            </button>
          </form>
        )}

        {/* GRÁFICAS */}
        {registros.length > 1 && (
          <div className="flex flex-col gap-4 mb-6">
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-sm font-medium text-orange-400 mb-3">Score Wellness</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={registros.slice().reverse().map(r => ({ fecha: r.fecha.slice(5), score: r.score_wellness }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                  <ReferenceLine y={25} stroke="#4ade80" strokeDasharray="4 4" />
                  <ReferenceLine y={50} stroke="#facc15" strokeDasharray="4 4" />
                  <ReferenceLine y={75} stroke="#f97316" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 3 }} name="Score" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* HRV + FC reposo juntas */}
            {registros.some(r => r.hrv || r.fc_reposo) && (
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <p className="text-sm font-medium text-blue-400 mb-3">Datos objetivos — HRV y FC en reposo</p>
                <div className="flex gap-4 mb-2 text-xs">
                  {registros.some(r => r.hrv) && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block"></span> HRV (ms)</span>}
                  {registros.some(r => r.fc_reposo) && <span className="flex items-center gap-1 text-rose-400"><span className="w-3 h-0.5 bg-rose-400 inline-block"></span> FC reposo (ppm)</span>}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={registros.slice().reverse().map(r => ({ fecha: r.fecha.slice(5), hrv: r.hrv || null, fc_reposo: r.fc_reposo || null }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                    {registros.some(r => r.hrv) && <Line type="monotone" dataKey="hrv" stroke="#60a5fa" strokeWidth={2.5} dot={{ fill: '#60a5fa', r: 3 }} name="HRV (ms)" connectNulls />}
                    {registros.some(r => r.fc_reposo) && <Line type="monotone" dataKey="fc_reposo" stroke="#fb7185" strokeWidth={2.5} dot={{ fill: '#fb7185', r: 3 }} name="FC reposo (ppm)" connectNulls />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-sm font-medium text-gray-200 mb-3">Variables subjetivas</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { key: 'fatiga', label: 'Fatiga', color: '#f87171' },
                  { key: 'estres', label: 'Estrés', color: '#fb923c' },
                  { key: 'animo', label: 'Ánimo', color: '#4ade80' },
                  { key: 'motivacion', label: 'Motivación', color: '#a78bfa' },
                  { key: 'calidad_sueno', label: 'Sueño', color: '#34d399' },
                  { key: 'dolor_muscular', label: 'Dolor', color: '#fbbf24' },
                ].map(v => (
                  <button key={v.key}
                    onClick={() => setVarsActivas(prev => prev.includes(v.key) ? prev.filter(x => x !== v.key) : [...prev, v.key])}
                    className={'px-2 py-1 rounded-lg text-xs font-medium transition border ' +
                      (varsActivas.includes(v.key) ? 'text-gray-900 border-transparent' : 'bg-gray-800 text-gray-400 border-gray-700')}
                    style={varsActivas.includes(v.key) ? { background: v.color, borderColor: v.color } : {}}>
                    {v.label}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={registros.slice().reverse().map(r => ({ fecha: r.fecha.slice(5), fatiga: r.fatiga, estres: r.estres, animo: r.animo, motivacion: r.motivacion, calidad_sueno: r.calidad_sueno, dolor_muscular: r.dolor_muscular }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="fecha" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                  <YAxis domain={[1, 7]} stroke="#9ca3af" tick={{ fontSize: 10 }} ticks={[1,2,3,4,5,6,7]} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: 'white', fontSize: 12 }} />
                  {[
                    { key: 'fatiga', label: 'Fatiga', color: '#f87171' },
                    { key: 'estres', label: 'Estrés', color: '#fb923c' },
                    { key: 'animo', label: 'Ánimo', color: '#4ade80' },
                    { key: 'motivacion', label: 'Motivación', color: '#a78bfa' },
                    { key: 'calidad_sueno', label: 'Sueño', color: '#34d399' },
                    { key: 'dolor_muscular', label: 'Dolor', color: '#fbbf24' },
                  ].filter(v => varsActivas.includes(v.key)).map(v => (
                    <Line key={v.key} type="monotone" dataKey={v.key} stroke={v.color} strokeWidth={2} dot={{ fill: v.color, r: 3 }} name={v.label} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {registros.length === 0 ? (
          <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">💚</div><p>No hay registros de wellness todavia.</p></div>
        ) : (
          <div className="grid gap-3">
            {registros.map(r => (
              <div key={r.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{r.fecha}</p>
                    <p className="text-gray-400 text-sm">Sueno: {r.horas_sueno}h · Fatiga: {r.fatiga}/7 · Estres: {r.estres}/7</p>
                    <div className="flex gap-3 mt-1">
                      {r.hrv && <p className="text-blue-400 text-sm">HRV: {r.hrv} ms</p>}
                      {r.fc_reposo && <p className="text-rose-400 text-sm">FC reposo: {r.fc_reposo} ppm</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${colorScore(r.score_wellness)}`}>{r.score_wellness}</p>
                    <p className={`text-xs ${colorScore(r.score_wellness)}`}>{estadoScore(r.score_wellness)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
