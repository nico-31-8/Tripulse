'use client'
// Panel de chat del asistente del entrenador.
// Carga el deportista activo (localStorage), arma su contexto con la sesión Supabase
// del entrenador (respeta RLS) y lo manda a /api/asistente, mostrando la respuesta
// en streaming. La API key nunca pasa por aquí: vive en el servidor.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getAtletaActivo } from '@/lib/atletaActivo'
import { construirContextoTexto } from '@/lib/asistente'
import { useContextoModulo } from '@/lib/contexto-modulo'
import AsistenteChat from './AsistenteChat'


const SUGERENCIAS = [
  'Resúmeme la semana de este deportista',
  '¿Cómo está de frescura y qué le pondría hoy?',
  'Propón la sesión de mañana según su readiness',
  '¿Va bien encaminado para su próxima competición?',
]

export default function AsistenteEntrenador() {
  const router = useRouter()
  const [dep, setDep] = useState<any>(null)
  const [contexto, setContexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [sinAtleta, setSinAtleta] = useState(false)
  const modulo = useContextoModulo()

  useEffect(() => {
    const cargar = async () => {
      const id = getAtletaActivo()
      if (!id) { setSinAtleta(true); setCargando(false); return }
      const { data: d } = await supabase.from('deportista').select('*').eq('id', id).single()
      if (!d) { setSinAtleta(true); setCargando(false); return }
      setDep(d)
      try { setContexto(await construirContextoTexto(supabase, d)) } catch { /* seguimos sin contexto */ }
      setCargando(false)
    }
    cargar()
  }, [])

  if (cargando) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Preparando el asistente…</div>

  if (sinAtleta) return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-3">🤖</div>
        <p className="font-semibold text-lg mb-1">Asistente del entrenador</p>
        <p className="text-gray-400 text-sm mb-5">Elige primero un deportista en el dashboard y vuelve aquí.</p>
        <button onClick={() => router.push('/dashboard')} className="bg-orange-500 hover:bg-orange-400 px-5 py-2.5 rounded-xl text-sm font-semibold transition">Ir al dashboard →</button>
      </div>
    </main>
  )

  return (
    <main className="h-screen bg-gray-950 text-white flex flex-col">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center text-lg flex-shrink-0">🤖</div>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">Asistente del entrenador</p>
          <p className="text-gray-500 text-xs truncate">Copiloto para {dep?.nombre} · propone, tú decides</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="ml-auto text-gray-500 hover:text-gray-300 text-sm transition flex-shrink-0">← Dashboard</button>
      </header>

      <AsistenteChat
        nombre={dep?.nombre || ''}
        contexto={contexto}
        modulo={modulo}
        sugerencias={SUGERENCIAS}
        depId={dep?.id ?? null}
      />
    </main>
  )
}