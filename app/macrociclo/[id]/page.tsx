'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

export default function PaginaMacrociclo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [macrociclo, setMacrociclo] = useState<any>(null)
  const [mesociclos, setMesociclos] = useState<any[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [objetivo, setObjetivo] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [duracion, setDuracion] = useState('')
  const [tipo, setTipo] = useState('')
  const [intensidad, setIntensidad] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: mac } = await supabase.from('macrociclo').select('*').eq('id', id).single()
    setMacrociclo(mac)
    const { data: meso } = await supabase.from('mesociclo').select('*').eq('id_macrociclo', id).order('fecha_inicio', { ascending: true })
    setMesociclos(meso || [])
  }

  const crearMesociclo = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.from('mesociclo').insert({
      id_macrociclo: Number(id),
      objetivo,
      fecha_inicio: fechaInicio,
      duracion_semanas: Number(duracion),
      tipo,
      intensidad_relativa: intensidad ? Number(intensidad) : null
    })
    if (error) { setError('Error: ' + error.message) }
    else {
      setObjetivo(''); setFechaInicio(''); setDuracion(''); setTipo(''); setIntensidad('')
      setMostrarForm(false)
      cargarDatos()
    }
    setLoading(false)
  }

  if (!macrociclo) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-orange-500">TRIPULSE</h1>
        <a href={`/deportistas/${macrociclo.id_deportista}`} className="text-gray-400 hover:text-white text-sm transition">← Perfil deportista</a>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <h2 className="text-2xl font-bold mb-1">{macrociclo.objetivo}</h2>
          <p className="text-gray-400 text-sm">Inicio: {macrociclo.fecha_inicio} · {macrociclo.duracion_semanas} semanas</p>
        </div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Mesociclos</h3>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            {mostrarForm ? 'Cancelar' : '+ Nuevo mesociclo'}
          </button>
        </div>
        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {mostrarForm && (
          <form onSubmit={crearMesociclo} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Nuevo mesociclo</h4>
            <input type="text" placeholder="Objetivo (ej: Bloque de base, Especifico competicion)" value={objetivo} onChange={e => setObjetivo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required>
              <option value="">Tipo de mesociclo</option>
              <option value="Acumulación">Acumulación</option>
              <option value="Transmutación">Transmutación</option>
              <option value="Realización">Realización</option>
              <option value="Recuperación">Recuperación</option>
            </select>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Fecha de inicio</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required />
            </div>
            <input type="number" placeholder="Duracion en semanas" value={duracion} onChange={e => setDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Intensidad relativa (1-10)</label>
              <input type="number" min="1" max="10" placeholder="Ej: 7" value={intensidad} onChange={e => setIntensidad(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
            </div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar mesociclo'}</button>
          </form>
        )}
        {mesociclos.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">🗓️</div>
            <p>No hay mesociclos todavia. Crea el primero.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {mesociclos.map(m => (
              <a key={m.id} href={`/mesociclo/${m.id}`} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition block">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-lg">{m.objetivo}</h4>
                      <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{m.tipo}</span>
                    </div>
                    <p className="text-gray-400 text-sm">Inicio: {m.fecha_inicio} · {m.duracion_semanas} semanas · Intensidad: {m.intensidad_relativa || '—'}/10</p>
                  </div>
                  <span className="text-orange-500 text-sm">Ver →</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
