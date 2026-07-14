'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function ResetPassword() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/nueva-password',
    })
    if (error) {
      setError('Error: ' + error.message)
    } else {
      setEnviado(true)
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 rounded-2xl p-8 border border-gray-700 w-full max-w-md">
        <h1 className="text-3xl font-bold text-orange-500 mb-1">TRIPULSE</h1>
        <p className="text-gray-400 mb-6">Recuperar contraseña</p>

        {enviado ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">📧</div>
            <p className="font-bold text-white text-lg mb-2">Email enviado</p>
            <p className="text-gray-400 text-sm mb-6">
              Revisa tu bandeja de entrada y sigue el enlace para crear una nueva contraseña.
            </p>
            <Link href="/login" className="text-orange-500 hover:underline text-sm">
              Volver al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <p className="text-gray-400 text-sm">
              Introduce tu email y te mandaremos un enlace para restablecer tu contraseña.
            </p>
            <input
              type="email"
              placeholder="Tu email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar enlace →'}
            </button>
            <Link href="/login" className="text-center text-gray-500 hover:text-white text-sm transition">
              ← Volver al login
            </Link>
          </form>
        )}
      </div>
    </main>
  )
}
