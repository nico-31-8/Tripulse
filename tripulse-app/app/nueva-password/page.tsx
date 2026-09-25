'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import CrearPassword from '@/components/CrearPassword'
import { errorAlEnviar } from '@/lib/password'

export default function NuevaPassword() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [exito, setExito] = useState(false)
  const [error, setError] = useState('')
  const [caducado, setCaducado] = useState(false)

  /* ── EL ENLACE DEL CORREO ENTRA POR AQUÍ ─────────────────
     Hay dos formas de llegar a esta pantalla y las dos tienen que funcionar:

     · La VIEJA: el correo llevaba al endpoint de Supabase, que verificaba y
       redirigía aquí con la sesión ya hecha. Sigue valiendo para los enlaces
       que se mandaron antes de este cambio.
     · La NUEVA: el correo trae directamente a tripulse.app con un `token_hash`
       y aquí se canjea. Se cambió porque el enlace anterior apuntaba a
       `…supabase.co`, y un correo que dice venir de TRIPULSE y te manda a otro
       dominio es la firma clásica del phishing: Gmail lo pintaba en rojo con
       «este mensaje podría ser peligroso». Ahora el enlace es del mismo sitio
       que el remitente.

     Se lee de `window.location` y no con useSearchParams a propósito: esa
     pantalla es de cliente y así no hace falta envolverla en un Suspense. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const token_hash = p.get('token_hash')
    if (!token_hash) return
    const tipo = (p.get('type') || 'recovery') as 'recovery' | 'invite' | 'email'
    supabase.auth.verifyOtp({ token_hash, type: tipo }).then(({ error }) => {
      /* Un enlace caducado o ya usado no es un error del formulario: no hay
         nada que rellenar, hay que pedir otro correo. */
      if (error) setCaducado(true)
      else window.history.replaceState({}, '', '/nueva-password')
    })
  }, [])

  const handleNuevaPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    /* Las dos comprobaciones (largo y que coincidan) viven en lib/password
       para que digan lo mismo aquí, en /registro y en /invitacion. Antes cada
       pantalla tenía su propia versión y su propio texto. */
    const mal = errorAlEnviar(password, confirmPassword)
    if (mal) { setError(mal); return }
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

        {caducado ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">⏳</div>
            <p className="font-bold text-white text-lg mb-2">Este enlace ya no vale</p>
            <p className="text-gray-400 text-sm mb-5">
              Los enlaces para cambiar la contraseña caducan, y solo se pueden usar una vez.
            </p>
            <a href="/reset-password" className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition">
              Pedir uno nuevo
            </a>
          </div>
        ) : exito ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">✅</div>
            <p className="font-bold text-white text-lg mb-2">Contraseña actualizada</p>
            <p className="text-gray-400 text-sm">Redirigiendo al login...</p>
          </div>
        ) : (
          <form onSubmit={handleNuevaPassword} className="flex flex-col gap-4">
            <CrearPassword
              etiqueta="Nueva contraseña"
              valor={password}
              onChange={setPassword}
              repetida={confirmPassword}
              onRepetidaChange={setConfirmPassword}
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
