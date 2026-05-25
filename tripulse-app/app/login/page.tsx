'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const IMAGENES = [
  'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=1920&q=80',
  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1920&q=80',
  'https://images.unsplash.com/photo-1519311965067-36d3e5f33d39?w=1920&q=80',
  'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1920&q=80',
  'https://images.unsplash.com/photo-1486218119243-13301be4cb28?w=1920&q=80',
  'https://images.unsplash.com/photo-1544717305-2782549b5136?w=1920&q=80',
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [imgActual, setImgActual] = useState(0)
  const [imgAnterior, setImgAnterior] = useState(-1)

  useEffect(() => {
    const interval = setInterval(() => {
      setImgAnterior(imgActual)
      setImgActual(prev => (prev + 1) % IMAGENES.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [imgActual])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError('Email o contraseña incorrectos'); setLoading(false); return }
    if (data.user) {
      const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', data.user.id).single()
      window.location.href = perfil?.rol === 'deportista' ? '/dashboard-deportista' : '/dashboard'
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .fade-in { animation: fadeIn 1.5s ease-in-out forwards; }
      `}</style>

      {/* Imágenes de fondo con transición */}
      {IMAGENES.map((img, i) => (
        <div key={img} className="absolute inset-0" style={{ opacity: i === imgActual ? 1 : 0, zIndex: i === imgActual ? 1 : 0, transition: 'opacity 1.5s ease-in-out' }}>
          <img src={img} alt="" className="w-full h-full object-cover" />
        </div>
      ))}

      {/* Overlay oscuro */}
      <div className="absolute inset-0 bg-black bg-opacity-60 z-10" />

      {/* Formulario */}
      <div className="relative z-20 w-full max-w-sm px-6">
        <div className="bg-gray-900 bg-opacity-90 backdrop-blur-sm rounded-2xl p-8 border border-gray-800 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-orange-500 tracking-tight mb-1">TRIPULSE</h1>
            <p className="text-gray-400 text-sm">Triatlón & Fuerza</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 transition"
                placeholder="tu@email.com" required />
            </div>
            <div>
              <label className="text-gray-400 text-xs uppercase tracking-wide mb-1.5 block">Contraseña</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 transition"
                placeholder="••••••••" required />
            </div>
            {error && <div className="bg-red-900 bg-opacity-50 border border-red-700 text-red-300 px-4 py-3 rounded-xl text-sm">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-xl font-bold tracking-wide transition disabled:opacity-50 mt-2">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p className="text-gray-500 text-sm mt-6 text-center">
            ¿No tienes cuenta?{' '}
            <a href="/registro" className="text-orange-400 hover:text-orange-300 transition">Regístrate</a>
          </p>
          <p className="text-center text-sm mt-2">
            <a href="/reset-password" className="text-gray-500 hover:text-orange-400 transition">¿Olvidaste tu contraseña?</a>
          </p>
        </div>

        {/* Indicadores */}
        <div className="flex justify-center gap-2 mt-6">
          {IMAGENES.map((_, i) => (
            <button key={i} onClick={() => setImgActual(i)}
              className={'w-2 h-2 rounded-full transition-all ' + (i === imgActual ? 'bg-orange-500 w-6' : 'bg-white bg-opacity-40')} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-20 absolute bottom-6 text-center">
        <p className="text-gray-500 text-xs">TRIPULSE · Rioboó Barral, Nicolás · 2026</p>
      </div>
    </main>
  )
}
