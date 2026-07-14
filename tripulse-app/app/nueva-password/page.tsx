'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function NuevaPassword() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [error, setError] = useState('')

  const handleNuevaPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setGuardando(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('Error: ' + error.message)
    } else {
      setExito(true)
      setTimeout(() => { router.push('/login')}, 2000)
    }
    setGuardando(false)
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 rounded-2xl p-8 border border-gray-700 w-full max-w-md">
        <h1 className="text-3xl font-bold text-orange-500 mb-1">TRIPULSE</h1>
        <p className="text-gray-400 mb-6">Nueva contraseña</p>

        {exito ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">✅</div>
            <p className="font-bold text-white text-lg mb-2">Contraseña actualizada</p>
            <p className="text-gray-400 text-sm">Redirigiendo al login...</p>
          </div>
        ) : (
          <form onSubmit={handleNuevaPassword} className="flex flex-col gap-4">
            <input
              type="password"
              placeholder="Nueva contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
              required
              minLength={6}
            />
            <input
              type="password"
              placeholder="Confirmar contraseña"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={guardando}
              className="bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar nueva contraseña →'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
