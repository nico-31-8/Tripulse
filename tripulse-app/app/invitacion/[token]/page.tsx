'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

export default function PaginaInvitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [invitacion, setInvitacion] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase
        .from('invitacion_deportista')
        .select('*')
        .eq('token', token)
        .eq('usado', false)
        .maybeSingle()

      if (!data) {
        setError('Este enlace no es válido o ya ha sido usado.')
      } else {
        setInvitacion(data)
      }
      setLoading(false)
    }
    cargar()
  }, [token])

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError('')

    // 1. Crear cuenta en Supabase Auth
    const { data, error: errAuth } = await supabase.auth.signUp({ email, password })
    if (errAuth || !data.user) {
      setError('Error al crear la cuenta: ' + errAuth?.message)
      setGuardando(false)
      return
    }

    // 2. Crear perfil
    await supabase.from('perfiles').insert({
      id: data.user.id,
      rol: 'deportista',
      nombre: invitacion.nombre_deportista,
      email,
    })

    // 3. Vincular el usuario al deportista ya creado
    await supabase.from('deportista').update({
      id_usuario: data.user.id,
    }).eq('id', invitacion.id_deportista)

    // 4. Marcar invitación como usada
    await supabase.from('invitacion_deportista').update({ usado: true }).eq('token', token)

    setExito(true)
    setGuardando(false)

    setTimeout(() => {
      window.location.href = '/dashboard-deportista'
    }, 2000)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
      Cargando...
    </div>
  )

  if (error && !invitacion) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 rounded-2xl p-8 border border-gray-700 max-w-md w-full text-center">
        <div className="text-5xl mb-4">❌</div>
        <h2 className="text-xl font-bold text-white mb-2">Enlace no válido</h2>
        <p className="text-gray-400 text-sm mb-6">{error}</p>
        <a href="/" className="text-orange-500 hover:underline text-sm">Volver al inicio</a>
      </div>
    </main>
  )

  if (exito) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 rounded-2xl p-8 border border-green-500 max-w-md w-full text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-white mb-2">¡Cuenta creada!</h2>
        <p className="text-gray-400 text-sm">Ya estás vinculado a tu entrenador. Redirigiendo...</p>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 rounded-2xl p-8 border border-gray-700 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-orange-500 mb-1">TRIPULSE</h1>
          <p className="text-gray-400 text-sm">Tu entrenador te ha invitado a la plataforma</p>
        </div>

        {/* Info deportista */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6 border border-gray-700">
          <p className="text-gray-500 text-xs mb-1">Cuenta para</p>
          <p className="font-bold text-lg text-white">{invitacion?.nombre_deportista}</p>
          <p className="text-green-400 text-xs mt-1">✓ Ya vinculado a tu entrenador</p>
        </div>

        <form onSubmit={handleRegistro} className="flex flex-col gap-4">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Tu email</label>
            <input
              type="email"
              placeholder="email@ejemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Elige una contraseña</label>
            <input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={guardando}
            className="bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-bold transition disabled:opacity-50"
          >
            {guardando ? 'Creando cuenta...' : 'Crear mi cuenta →'}
          </button>
        </form>

        <p className="text-gray-600 text-xs text-center mt-4">
          Al crear tu cuenta aceptas usar la plataforma TRIPULSE para el seguimiento de tu entrenamiento.
        </p>
      </div>
    </main>
  )
}
