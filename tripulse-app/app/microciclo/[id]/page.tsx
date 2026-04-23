'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

const DISCIPLINAS = ['Natacion', 'Ciclismo', 'Carrera', 'Fuerza', 'Brick']

export default function PaginaMicrociclo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [microciclo, setMicrociclo] = useState<any>(null)
  const [sesiones, setSesiones] = useState<any[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [disciplina, setDisciplina] = useState('')
  const [fechaSesion, setFechaSesion] = useState('')
  const [duracion, setDuracion] = useState('')
  const [rpe, setRpe] = useState('')
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: micro } = await supabase.from('microciclo').select('*').eq('id', id).single()
    setMicrociclo(micro)
    const { data: ses } = await supabase.from('sesion').select('*').eq('id_microciclo', id).order('fecha_sesion', { ascending: true })
    setSesiones(ses || [])
  }

  const crearSesion = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.from('sesion').insert({
      id_microciclo: Number(id),
      disciplina,
      fecha_sesion: fechaSesion,
      duracion_minutos: duracion ? Number(duracion) : null,
      rpe_estimado: rpe ? Number(rpe) : null,
      notas_entrenador: notas,
      estado: 'Planificada'
    })
    if (error) { setError('Error: ' + error.message) }
    else {
      setDisciplina(''); setFechaSesion(''); setDuracion(''); setRpe(''); setNotas('')
      setMostrarForm(false)
      cargarDatos()
    }
    setLoading(false)
  }

  const colorDisciplina = (d: string) => {
    if (d === 'Natacion') return 'bg-blue-900 text-blue-300'
    if (d === 'Ciclismo') return 'bg-yellow-900 text-yellow-300'
    if (d === 'Carrera') return 'bg-green-900 text-green-300'
    if (d === 'Fuerza') return 'bg-red-900 text-red-300'
    return 'bg-purple-900 text-purple-300'
  }

  if (!microciclo) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = "/dashboard"} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <a href={`/mesociclo/${microciclo.id_mesociclo}`} className="text-gray-400 hover:text-white text-sm transition">← Mesociclo</a>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold">{microciclo.objetivo}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${microciclo.tipo === 'Carga' ? 'bg-orange-900 text-orange-300' : microciclo.tipo === 'Recuperacion' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>{microciclo.tipo}</span>
          </div>
          <p className="text-gray-400 text-sm">Inicio: {microciclo.fecha_inicio}</p>
        </div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Sesiones de la semana</h3>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            {mostrarForm ? 'Cancelar' : '+ Nueva sesion'}
          </button>
        </div>
        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {mostrarForm && (
          <form onSubmit={crearSesion} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Nueva sesion</h4>
            <select value={disciplina} onChange={e => setDisciplina(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
              <option value="">Disciplina</option>
              {DISCIPLINAS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Fecha de la sesion</label>
              <input type="date" value={fechaSesion} onChange={e => setFechaSesion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required />
            </div>
            <input type="number" placeholder="Duracion en minutos" value={duracion} onChange={e => setDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" />
            <div>
              <label className="text-gray-400 text-sm mb-1 block">RPE estimado (1-10)</label>
              <input type="number" min="1" max="10" placeholder="Ej: 7" value={rpe} onChange={e => setRpe(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
            </div>
            <textarea placeholder="Notas para el atleta (opcional)" value={notas} onChange={e => setNotas(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" rows={3} />
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar sesion'}</button>
          </form>
        )}
        {sesiones.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">🏊</div>
            <p>No hay sesiones esta semana. Planifica la primera.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {sesiones.map(s => (
              <a key={s.id} href={`/sesion/${s.id}`} className="bg-gray-900 rounded-xl p-5 border border-gray-800 hover:border-orange-500 transition block">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colorDisciplina(s.disciplina)}`}>{s.disciplina}</span>
                    <div>
                      <p className="font-medium">{s.fecha_sesion}</p>
                      <p className="text-gray-400 text-sm">{s.duracion_minutos ? `${s.duracion_minutos} min` : '—'} · RPE est: {s.rpe_estimado || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${s.estado === 'Realizada' ? 'bg-green-900 text-green-300' : s.estado === 'Cancelada' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'}`}>{s.estado}</span>
                    <span className="text-orange-500 text-sm">Ver →</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
