'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase'

// Guardia de rol para páginas exclusivas del entrenador.
// Si no hay sesión → /login. Si el usuario es deportista → /dashboard-deportista.
// Usa getSession() (lee de storage, sin adquirir el lock del token) para no
// competir con otras llamadas de auth de la página.
export function useRequireEntrenador() {
  const router = useRouter()
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.replace('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
      if (cancelado) return
      if (p?.rol === 'deportista') router.replace('/dashboard-deportista')
    })()
    return () => { cancelado = true }
  }, [router])
}
