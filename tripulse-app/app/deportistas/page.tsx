'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

function calcularEdad(fechaNacimiento: string): number {
  const hoy = new Date()
  const nac = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad
}

function calcularFCMaxima(fechaNacimiento: string): number {
  const edad = calcularEdad(fechaNacimiento)
  return Math.round(208 - 0.7 * edad)
}

function TooltipHRV() {
  const [visible, setVisible] = useState(false)
  const generarEnlaceInvitacion = async (dep: any) => {
    setGenerandoEnlace(dep.id)
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('invitacion_deportista').insert({
      token,
      id_entrenador: user?.id,
      id_deportista: dep.id,
      nombre_deportista: dep.nombre,
      usado: false,
    })
    const url = window.location.origin + '/invitacion/' + token
    setEnlaceInvitacion(url)
    setGenerandoEnlace(null)
  }

  return (
    <div className="relative inline-block ml-2">
      <button type="button" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} onClick={() => setVisible(!visible)} className="w-5 h-5 rounded-full bg-gray-600 hover:bg-orange-500 text-white text-xs font-bold transition flex items-center justify-center">?</button>
      {visible && (
        <div className="absolute left-7 top-0 z-10 w-72 bg-gray-700 text-gray-200 text-xs rounded-lg p-3 shadow-xl border border-gray-600">
          <p className="font-bold text-white mb-1">HRV Basal</p>
          <p className="mb-2">Media de los valores nocturnos del reloj Garmin durante 7-14 días en reposo.</p>
        </div>
      )}
    </div>
  )
}

export default function Deportistas() {
  const [deportistas, setDeportistas] = useState<any[]>([])
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [sexo, setSexo] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [hrvBasal, setHrvBasal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [enlaceInvitacion, setEnlaceInvitacion] = useState<string | null>(null)
  const [generandoEnlace, setGenerandoEnlace] = useState<number | null>(null)

  useEffect(() => { cargarDeportistas() }, [])

  const cargarDeportistas = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    const { data, error } = await supabase.from('deportista').select('*').eq('id_entrenador', user.id)
    if (error) setError('Error al cargar: ' + error.message)
    setDeportistas(data || [])
  }

  const crearDeportista = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const fcMaxima = fechaNacimiento ? calcularFCMaxima(fechaNacimiento) : null
    const { error } = await supabase.from('deportista').insert({
      id_entrenador: user?.id,
      nombre,
      sexo,
      fecha_nacimiento: fechaNacimiento || null,
      fc_maxima: fcMaxima,
      hrv_basal: hrvBasal ? Number(hrvBasal) : null
    })
    if (error) {
      setError('Error al guardar: ' + error.message)
    } else {
      setNombre(''); setSexo(''); setFechaNacimiento(''); setHrvBasal('')
      setMostrarForm(false)
      cargarDeportistas()
    }
    setLoading(false)
  }

  const generarEnlaceInvitacion = async (dep: any) => {
    setGenerandoEnlace(dep.id)
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('invitacion_deportista').insert({
      token,
      id_entrenador: user?.id,
      id_deportista: dep.id,
      nombre_deportista: dep.nombre,
      usado: false,
    })
    const url = window.location.origin + '/invitacion/' + token
    setEnlaceInvitacion(url)
    setGenerandoEnlace(null)
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">
        <button onClick={() => window.location.href = "/dashboard"} className="text-xl font-bold text-orange-500 hover:text-orange-400 transition">TRIPULSE</button>
        <a href="/dashboard" className="text-gray-400 hover:text-white text-sm transition">← Dashboard</a>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Deportistas</h2>
          <button onClick={() => setMostrarForm(!mostrarForm)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg text-sm font-medium transition">
            {mostrarForm ? 'Cancelar' : '+ Nuevo deportista'}
          </button>
        </div>
        {error && <div className="bg-red-900 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {mostrarForm && (
          <form onSubmit={crearDeportista} className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 flex flex-col gap-4">
            <h3 className="font-bold text-lg">Nuevo deportista</h3>
            <input type="text" placeholder="Nombre completo" value={nombre} onChange={e => setNombre(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
            <select value={sexo} onChange={e => setSexo(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">Sexo (opcional)</option>
              <option value="Hombre">Hombre</option>
              <option value="Mujer">Mujer</option>
            </select>
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Fecha de nacimiento</label>
              <input type="date" value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
            </div>
            {fechaNacimiento && (
              <div className="bg-gray-800 px-4 py-3 rounded-lg text-sm">
                <span className="text-gray-400">Edad: </span>
                <span className="text-white font-medium">{calcularEdad(fechaNacimiento)} años</span>
                <span className="text-gray-400 ml-4">FC máxima estimada (Tanaka): </span>
                <span className="text-orange-400 font-medium">{calcularFCMaxima(fechaNacimiento)} ppm</span>
              </div>
            )}
            <div>
              <div className="flex items-center mb-1">
                <label className="text-gray-400 text-sm">HRV basal (ms) — opcional</label>
                <TooltipHRV />
              </div>
              <input type="number" placeholder="Ej: 52" value={hrvBasal} onChange={e => setHrvBasal(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
            </div>
            <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar deportista'}</button>
          </form>
        )}
        {deportistas.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">👥</div>
            <p>No tienes deportistas todavia. Anade el primero.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {deportistas.map(d => (
              <div key={d.id} className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-orange-500 transition flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-lg">{d.nombre}</h3>
                  <p className="text-gray-400 text-sm">
                    {d.sexo || 'Sin especificar'} · 
                    {d.fecha_nacimiento ? ` ${calcularEdad(d.fecha_nacimiento)} años · ` : ' '}
                    FC max: {d.fc_maxima || '—'} ppm · 
                    HRV basal: {d.hrv_basal || '—'} ms
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => generarEnlaceInvitacion(d)}
                    disabled={generandoEnlace === d.id}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition border border-gray-700 hover:border-orange-500">
                    {generandoEnlace === d.id ? 'Generando...' : '🔗 Invitar'}
                  </button>
                  <a href={`/deportistas/${d.id}`} className="text-orange-500 hover:underline text-sm">Ver perfil →</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Modal enlace invitación */}
      {enlaceInvitacion && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 rounded-2xl p-6 border border-gray-700 w-full max-w-md">
            <h3 className="font-bold text-lg mb-2">🔗 Enlace de invitación</h3>
            <p className="text-gray-400 text-sm mb-4">Manda este enlace al deportista. Solo tendrá que poner su email y contraseña para quedar vinculado a ti automáticamente.</p>
            <div className="bg-gray-800 rounded-lg p-3 mb-4 break-all text-xs text-orange-400 border border-gray-700">
              {enlaceInvitacion}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { navigator.clipboard.writeText(enlaceInvitacion); }}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-medium transition">
                📋 Copiar enlace
              </button>
              <button
                onClick={() => setEnlaceInvitacion(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg text-sm transition">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
