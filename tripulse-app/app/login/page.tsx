'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { setAtletaActivo } from '@/lib/atletaActivo'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  // Forzar la reproducción (algunos navegadores no autoarrancan aunque esté muteado).
  useEffect(() => { videoRef.current?.play().catch(() => {}) }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError('Email o contraseña incorrectos'); setLoading(false); return }
    if (data.user) {
      // Login fresco: olvidamos el deportista activo para que el entrenador vea el selector.
      setAtletaActivo(null)
      const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', data.user.id).single()
      if (perfil?.rol === 'deportista') {
        const { data: dep } = await supabase.from('deportista').select('id, id_entrenador').eq('id_usuario', data.user.id).single()
        // Solo se exige anamnesis si tiene entrenador (es a quien le sirve)
        if (dep && dep.id_entrenador) {
          const { data: an } = await supabase.from('anamnesis').select('estado').eq('id_deportista', dep.id).maybeSingle()
          router.push((!an || an.estado === 'borrador') ? '/anamnesis' : '/dashboard-deportista')
        } else {
          router.push('/dashboard-deportista')
        }
      } else {
        router.push('/dashboard')
      }
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center">
      {/* Fondo: imagen fija de respaldo + vídeo encima (poster para que nunca haya negro) */}
      <img
        src="/login/hero-poster.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover z-0"
      />
      <video
        ref={videoRef}
        src="/login/hero-bg-web.mp4"
        poster="/login/hero-poster.jpg"
        autoPlay muted loop playsInline preload="auto"
        onCanPlay={e => e.currentTarget.play().catch(() => {})}
        className="absolute inset-0 w-full h-full object-cover z-0"
      />

      {/* Overlay oscuro (ligero: la imagen ya es oscura de por sí) */}
      <div className="absolute inset-0 bg-black/40 z-10" />

      {/* Formulario */}
      <div className="relative z-20 w-full max-w-sm px-6">
        <div className="bg-gray-900/90 backdrop-blur-sm rounded-2xl p-8 border border-gray-800 shadow-2xl">
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
            {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-xl text-sm">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-xl font-bold tracking-wide transition disabled:opacity-50 mt-2">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <p className="text-gray-500 text-sm mt-6 text-center">
            ¿No tienes cuenta?{' '}
            <Link href="/registro" className="text-orange-400 hover:text-orange-300 transition">Regístrate</Link>
          </p>
          <p className="text-center text-sm mt-2">
            <Link href="/reset-password" className="text-gray-500 hover:text-orange-400 transition">¿Olvidaste tu contraseña?</Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-20 absolute bottom-6 text-center">
        <p className="text-gray-500 text-xs">TRIPULSE · Rioboó Barral, Nicolás · 2026</p>
      </div>
    </main>
  )
}
