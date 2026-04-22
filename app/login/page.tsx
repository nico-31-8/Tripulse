'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMensaje('Email o contraseña incorrectos')
    } else {
      window.location.href = '/dashboard'
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-1">TRIPULSE</h1>
        <p className="text-gray-400 mb-6">Accede a tu cuenta</p>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
          <input type="password" placeholder="Contrasena" value={password} onChange={e => setPassword(e.target.value)} className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500" required />
          {mensaje && <p className="text-red-400 text-sm">{mensaje}</p>}
          <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition disabled:opacity-50">{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
        <p className="text-gray-400 text-sm mt-4 text-center">No tienes cuenta? <a href="/registro" className="text-orange-500 hover:underline">Registrate</a></p>
      </div>
    </main>
  )
}
