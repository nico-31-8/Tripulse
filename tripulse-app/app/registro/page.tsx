'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Registro() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('')
  const [codigoEntrenador, setCodigoEntrenador] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rol) { setMensaje('Selecciona si eres entrenador o deportista'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { setMensaje('Error: ' + error.message); setLoading(false); return }
    if (data.user) {
      await supabase.from('perfiles').insert({ id: data.user.id, rol, nombre, email })
      if (rol === 'deportista') {
        if (codigoEntrenador) {
          const { data: entrenador } = await supabase.from('perfiles').select('id').eq('codigo_entrenador', codigoEntrenador.toUpperCase()).single()
          if (entrenador) {
            await supabase.from('deportista').insert({ id_entrenador: entrenador.id, id_usuario: data.user.id, nombre })
          } else {
            await supabase.from('deportista').insert({ id_usuario: data.user.id, nombre })
          }
        } else {
          await supabase.from('deportista').insert({ id_usuario: data.user.id, nombre })
        }
      }
      window.location.href = rol === 'entrenador' ? '/dashboard' : '/dashboard-deportista'
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-1">TRIPULSE</h1>
        <p className="text-gray-400 mb-6">Crea tu cuenta</p>
        <form onSubmit={handleRegistro} className="flex flex-col gap-4">
          <input type="text" placeholder="Tu nombre" value={nombre} onChange={e => setNombre(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
          <input type="password" placeholder="Contrasena" value={password} onChange={e => setPassword(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
          <div>
            <p className="text-gray-400 text-sm mb-2">Soy...</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setRol('entrenador')} className={`py-3 rounded-lg font-medium transition border-2 ${rol === 'entrenador' ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>Entrenador</button>
              <button type="button" onClick={() => setRol('deportista')} className={`py-3 rounded-lg font-medium transition border-2 ${rol === 'deportista' ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>Deportista</button>
            </div>
          </div>
          {rol === 'deportista' && (
            <div>
              <input type="text" placeholder="Codigo de tu entrenador (opcional)" value={codigoEntrenador} onChange={e => setCodigoEntrenador(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 w-full" />
              <p className="text-gray-500 text-xs mt-1">Tu entrenador te dara su codigo para vincularte</p>
            </div>
          )}
          {mensaje && <p className="text-red-400 text-sm">{mensaje}</p>}
          <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Creando cuenta...' : 'Crear cuenta'}</button>
        </form>
        <p className="text-gray-400 text-sm mt-4 text-center">Ya tienes cuenta? <a href="/login" className="text-orange-500 hover:underline">Entra aqui</a></p>
      </div>
    </main>
  )
}
