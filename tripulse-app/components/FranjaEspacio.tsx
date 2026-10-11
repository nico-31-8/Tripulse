'use client'
// ============================================================
// La franja «Estás en el espacio de Laura»
// ============================================================
// Arriba del todo y en todas las pantallas mientras un director trabaja en el
// espacio de uno de sus entrenadores, para que nunca dude de en nombre de quién
// está cambiando cosas. Va en el flujo de la página, como AvisoMantenimiento:
// empuja el contenido en vez de taparlo.
//
// SE CIERRA SOLA si al entrar resulta que la relación ya no está activa (el
// entrenador cortó, la plataforma quitó la marca): un espacio caducado dejaría
// al director viendo listas vacías sin saber por qué.
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usuarioActual } from '@/lib/sesion'
import { getEspacio, setEspacio, EVENTO_ESPACIO, type Espacio } from '@/lib/espacio'
import { setAtletaActivo } from '@/lib/atletaActivo'

const RUTAS_PUBLICAS = ['/', '/login', '/registro', '/privacidad', '/terminos']

export default function FranjaEspacio() {
  const [espacio, setEsp] = useState<Espacio | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const leer = () => setEsp(getEspacio())
    leer()
    window.addEventListener(EVENTO_ESPACIO, leer)
    window.addEventListener('storage', leer)
    return () => {
      window.removeEventListener(EVENTO_ESPACIO, leer)
      window.removeEventListener('storage', leer)
    }
  }, [])

  const idEspacio = espacio?.id
  useEffect(() => {
    if (!idEspacio) return
    let vivo = true
    ;(async () => {
      const user = await usuarioActual()
      if (!vivo) return
      if (!user) { setEspacio(null); return }
      const { data, error } = await supabase.rpc('director_mis_entrenadores')
      /* Un fallo de red no cierra el espacio: se vuelve a mirar la próxima vez. */
      if (!vivo || error) return
      const v = (data || []).find((x: any) => x.id_entrenador === idEspacio && x.estado === 'activo')
      if (!v) { setAtletaActivo(null); setEspacio(null); return }
      if (v.nombre && v.nombre !== getEspacio()?.nombre) setEspacio({ id: idEspacio, nombre: v.nombre })
    })()
    return () => { vivo = false }
  }, [idEspacio])

  if (!espacio || RUTAS_PUBLICAS.includes(pathname) || /^\/sesion\/[^/]+\/ejecutar/.test(pathname)) return null

  const pila = (espacio.nombre || '').split(' ')[0] || 'tu entrenador'
  const salir = () => {
    setAtletaActivo(null)
    setEspacio(null)
    router.push('/entrenadores')
  }

  return (
    <div role="status"
      className="w-full pl-16 pr-4 py-2 flex items-center justify-center gap-3 text-[13px] leading-snug bg-teal-500/[0.13] text-teal-50 border-b border-teal-400/30">
      <span aria-hidden className="flex-none w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_0_4px_rgba(45,212,191,0.18)]" />
      <span className="min-w-0">
        Estás en el espacio de <b className="font-semibold text-white">{espacio.nombre || 'tu entrenador'}</b>.
        <span className="text-teal-100/80"> Lo que cambies le llegará a {pila} y al deportista.</span>
      </span>
      <button onClick={salir}
        className="flex-none text-xs font-semibold px-3 py-1 rounded-lg bg-teal-400/15 hover:bg-teal-400/25 border border-teal-400/40 text-teal-50 transition">
        Salir
      </button>
    </div>
  )
}
