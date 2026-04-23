'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

function calcularEdad(fechaNacimiento: string): number {
  const hoy = new Date()
  const nac = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad
}

export default function PerfilDeportista({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [deportista, setDeportista] = useState<any>(null)
  const [macrociclos, setMacrociclos] = useState<any[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [objetivo, setObjetivo] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [duracion, setDuracion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargarDatos() }, [id])

  const cargarDatos = async () => {
    const { data: dep } = await supabase.from('deportista').select('*').eq('id', id).single()
    setDeportista(dep)
    const { data: mac } = await supabase.from('macrociclo').select('*').eq('id_deportista', id).order('fecha_inicio', { ascending: false })
    setMacrociclos(mac || [])
  }

  const crearMacrociclo = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.from('macrociclo').insert({
      id_deportista: Number(id),
      objetivo,
      fecha_inicio: fechaInicio,
      duracion_semanas: Number(duracion)
    })
    if (error) { setError('Error: ' + error.message) }
    else {
      setObjetivo(''); setFechaInicio(''); setDuracion('')
      setMostrarForm(false)
      cargarDatos()
    }
    setLoading(false)
  }

  if (!deportista) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <h1 className="text-xl font-bold text-orange-500">TRIPULSE</h1>
        <a href="/deportistas" className="text-gray-400 hover:text-white text-sm transition">← Deportistas</a>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-1">{deportista.nombre}</h2>
              <p className="text-gray-400 text-sm">
                {deportista.sexo || 'Sin especificar'} · 
                {deportista.fecha_nacimiento ? ` ${calcularEdad(deportista.fecha_nacimiento)} años · ` : ' '}
                FC máx: {deportista.fc_maxima || '—'} ppm · 
                HRV basal: {deportista.hrv_basal || '—'} ms
              </p>
            </div>
            <div className="flex gap-2"><button onClick={() => window.location.href = `/tests/${deportista.id}`} className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1 rounded-full transition">Tests</button><span className="bg-gray-700 text-gray-300 text-xs px-3 py-1 rounded-full">Activo</span></div>
          </div>
        </div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Macrociclos</h3>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            {mostrarForm ? 'Cancelar' : '+ Nuevo macrociclo'}
          </button>
        </div>
        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {mostrarForm && (
          <form onSubmit={crearMacrociclo} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h4 className="font-bold">Nuevo macrociclo</h4>
            <input type="text" placeholder="Objetivo (ej: Temporada 2025-26, Ironman Vitoria)" value={objetivo} onChange={e => setObjetivo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Fecha de inicio</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" required />
            </div>
            <input type="number" placeholder="Duracion en semanas" value={duracion} onChange={e => setDuracion(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar macrociclo'}</button>
          </form>
        )}
        {macrociclos.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-3">📅</div>
            <p>No hay macrociclos todavia. Crea el primero.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {macrociclos.map(m => (
              <a key={m.id} href={`/macrociclo/${m.id}`} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition block">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-lg">{m.objetivo}</h4>
                    <p className="text-gray-400 text-sm">Inicio: {m.fecha_inicio} · {m.duracion_semanas} semanas</p>
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
