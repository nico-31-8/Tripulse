'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

export default function PaginaMesociclo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [mesociclo, setMesociclo] = useState<any>(null)
  const [microciclos, setMicrociclos] = useState<any[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [objetivo, setObjetivo] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [tipo, setTipo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: meso } = await supabase.from('mesociclo').select('*').eq('id', id).single()
    setMesociclo(meso)
    const { data: micro } = await supabase.from('microciclo').select('*').eq('id_mesociclo', id).order('fecha_inicio', { ascending: true })
    setMicrociclos(micro || [])
  }

  const crearMicrociclo = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.from('microciclo').insert({
      id_mesociclo: Number(id),
      objetivo,
      fecha_inicio: fechaInicio,
      duracion_dias: 7,
      tipo
    })
    if (error) { setError('Error: ' + error.message) }
    else {
      setObjetivo(''); setFechaInicio(''); setTipo('')
      setMostrarForm(false)
      cargarDatos()
    }
    setLoading(false)
  }

  if (!mesociclo) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-orange-500">TRIPULSE</h1>
        <a href={`/macrociclo/${mesociclo.id_macrociclo}`} className="text-gray-400 hover:text-white text-sm transition">← Macrociclo</a>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold">{mesociclo.objetivo}</h2>
            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{mesociclo.tipo}</span>
          </div>
          <p className="text-gray-400 text-sm">Inicio: {mesociclo.fecha_inicio} · {mesociclo.duracion_semanas} semanas · Intensidad: {mesociclo.intensidad_relativa || '—'}/10</p>
        </div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Semanas</h3>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            {mostrarForm ? 'Cancelar' : '+ Nueva semana'}
          </button>
        </div>
        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {mostrarForm && (
          <form onSubmit={crearMicrociclo} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Nueva semana</h4>
            <input type="text" placeholder="Objetivo de la semana" value={objetivo} onChange={e => setObjetivo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
              <option value="">Tipo de semana</option>
              <option value="Carga">Carga</option>
              <option value="Recuperación">Recuperacion</option>
              <option value="Competición">Competicion</option>
            </select>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Lunes de inicio</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required />
            </div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar semana'}</button>
          </form>
        )}
        {microciclos.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">📆</div>
            <p>No hay semanas todavia. Crea la primera.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {microciclos.map((m, i) => (
              <a key={m.id} href={`/microciclo/${m.id}`} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition block">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-lg">Semana {i + 1} — {m.objetivo}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.tipo === 'Carga' ? 'bg-orange-900 text-orange-300' : m.tipo === 'Recuperación' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>{m.tipo}</span>
                    </div>
                    <p className="text-gray-400 text-sm">Inicio: {m.fecha_inicio}</p>
                  </div>
                  <span className="text-orange-500 text-sm">Ver sesiones →</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
