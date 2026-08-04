'use client'
// Módulo Comunidad — pantalla de entrada.
//
// Ser social es OPCIONAL. La primera vez (social='pendiente') se pregunta: unirse o
// quedarse al margen. Reversible siempre. Ver docs/comunidad-arquitectura.md.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import ComunidadDirectorio from '@/components/ComunidadDirectorio'

type EstadoSocial = 'pendiente' | 'activo' | 'inactivo'

export default function ComunidadPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [social, setSocial] = useState<EstadoSocial>('pendiente')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const cargar = async () => {
      const user = await usuarioActual()
      if (!user) { router.replace('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('social').eq('id', user.id).single()
      setSocial((p?.social as EstadoSocial) || 'pendiente')
      setCargando(false)
    }
    cargar()
  }, [router])

  const decidir = async (estado: 'activo' | 'inactivo') => {
    setGuardando(true)
    setError('')
    const { error } = await supabase.rpc('set_estado_social', { _estado: estado })
    setGuardando(false)
    if (error) { setError('No se ha podido guardar. Inténtalo de nuevo.'); return }
    setSocial(estado)
  }

  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Cargando…</div>
  }

  // ---- Ya está dentro ----
  if (social === 'activo') {
    return <ComunidadDirectorio onSalir={() => decidir('inactivo')} />
  }

  // ---- Al margen (lo eligió antes) ----
  if (social === 'inactivo') {
    return (
      <main className="min-h-screen flex items-center justify-center text-white px-6">
        <div className="max-w-md text-center">
          <p className="text-4xl mb-4">🔕</p>
          <h1 className="text-2xl font-bold mb-2">Estás al margen de la comunidad</h1>
          <p className="text-gray-400 text-sm mb-6">
            No apareces para nadie y no ves a los demás. Puedes unirte cuando quieras.
          </p>
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button onClick={() => decidir('activo')} disabled={guardando}
            className="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-xl font-medium transition disabled:opacity-50">
            {guardando ? 'Un momento…' : 'Unirme a la comunidad'}
          </button>
        </div>
      </main>
    )
  }

  // ---- Primera vez: la pregunta ----
  return (
    <main className="min-h-screen flex items-center justify-center text-white px-6 py-10">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <p className="text-5xl mb-4">🤝</p>
          <h1 className="text-3xl font-bold mb-3">La comunidad TRIPULSE</h1>
          <p className="text-gray-400 leading-relaxed">
            Conecta con otra gente que entrena: descúbrela, montad grupos y quedadas,
            competid en retos. Ser parte de esto es cosa tuya — y puedes cambiar de idea
            cuando quieras.
          </p>
        </div>

        {/* La promesa de privacidad, por delante */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-8 flex gap-3">
          <span className="text-xl flex-shrink-0">🔒</span>
          <p className="text-gray-400 text-sm leading-relaxed">
            <span className="text-gray-200 font-medium">Tus entrenamientos siguen siendo privados.</span>{' '}
            En la comunidad solo se comparte un perfil ligero —nombre, ciudad, deportes— que tú decides.
            Nunca tus sesiones.
          </p>
        </div>

        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

        <div className="flex flex-col gap-3">
          <button onClick={() => decidir('activo')} disabled={guardando}
            className="bg-orange-500 hover:bg-orange-600 py-3.5 rounded-xl font-semibold text-lg transition disabled:opacity-50">
            {guardando ? 'Un momento…' : 'Unirme a la comunidad'}
          </button>
          <button onClick={() => decidir('inactivo')} disabled={guardando}
            className="text-gray-400 hover:text-gray-200 py-3 rounded-xl text-sm transition disabled:opacity-50">
            Prefiero quedarme al margen
          </button>
        </div>
      </div>
    </main>
  )
}
