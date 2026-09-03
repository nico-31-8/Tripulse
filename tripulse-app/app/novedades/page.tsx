'use client'
// ============================================================
// Novedades — qué ha cambiado en la aplicación
// ============================================================
// El texto NO se lee aquí: se pide a /api/novedades, que comprueba quién
// pregunta antes de mandarlo. Ver el comentario de esa ruta: leerlo en el
// servidor y esconderlo al pintar no era restringir nada.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseNovedades, type Novedades } from '@/lib/novedades'
import VistaNovedades from '@/components/VistaNovedades'
import Cargando from '@/components/Cargando'

export default function PaginaNovedades() {
  const router = useRouter()
  const [novedades, setNovedades] = useState<Novedades | null>(null)
  const [fuera, setFuera] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { router.replace('/login'); return }

      const r = await fetch('/api/novedades', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      })
      if (cancelado) return

      if (r.status === 403) { setFuera(true); return }
      if (!r.ok) { setError('No se han podido cargar las novedades.'); return }

      const { md } = await r.json()
      if (!cancelado) setNovedades(parseNovedades(md || ''))
    })().catch(() => { if (!cancelado) setError('No se han podido cargar las novedades.') })
    return () => { cancelado = true }
  }, [router])

  if (fuera || error) {
    return (
      <div className="min-h-screen bg-[#080b10] text-white flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="text-gray-300">
            {fuera ? 'Esta pantalla todavía no está disponible.' : error}
          </p>
          <button onClick={() => router.push('/dashboard')}
            className="mt-5 text-orange-400 hover:text-orange-300 text-sm transition">
            ← Volver al panel
          </button>
        </div>
      </div>
    )
  }

  if (!novedades) return <Cargando />

  return <VistaNovedades novedades={novedades} />
}
