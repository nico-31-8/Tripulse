'use client'
// Checklist de "Primeros pasos" del deportista. Consolida en un solo bloque con progreso
// lo que antes eran avisos sueltos (sin entrenador / anamnesis pendiente), y permite vincularse
// con el entrenador metiendo el código aquí mismo (antes había que ir a /perfil). Se oculta solo
// cuando los pasos esenciales están hechos.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function OnboardingDeportista({ deportista, anamnesisPendiente }: { deportista: any; anamnesisPendiente: boolean }) {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  if (!deportista) return null
  const tieneEntrenador = !!deportista.id_entrenador
  const anamnesisOk = !anamnesisPendiente
  const pasos = [tieneEntrenador, anamnesisOk]
  const hechos = pasos.filter(Boolean).length
  if (hechos === pasos.length) return null // todo listo → no molestar

  const vincular = async (e: React.FormEvent) => {
    e.preventDefault()
    const cod = codigo.toUpperCase().trim()
    if (!cod) return
    setCargando(true); setError('')
    const { data: ent } = await supabase.rpc('buscar_entrenador', { p_codigo: cod }).maybeSingle() as { data: { id: string; nombre: string } | null }
    if (!ent) { setError('Código no encontrado, revísalo bien.'); setCargando(false); return }
    const { error: errUpd } = await supabase.from('deportista').update({ id_entrenador: ent.id }).eq('id', deportista.id)
    if (errUpd) { setError('No se pudo vincular: ' + errUpd.message); setCargando(false); return }
    location.reload() // recargar para que el panel reconozca al entrenador y actualice el checklist
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-lg">🚀 Primeros pasos</p>
        <span className="text-xs text-gray-400">{hechos} de {pasos.length}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full mb-4 overflow-hidden">
        <div className="h-full bg-orange-500 transition-all" style={{ width: (hechos / pasos.length * 100) + '%' }} />
      </div>

      {/* Paso 1: vincularse con el entrenador */}
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <span className={tieneEntrenador ? 'text-green-400' : 'text-gray-600'}>{tieneEntrenador ? '✅' : '⬜'}</span>
          <p className={'font-medium ' + (tieneEntrenador ? 'text-gray-500 line-through' : 'text-white')}>Conéctate con tu entrenador</p>
        </div>
        {!tieneEntrenador && (
          <div className="mt-2 ml-7">
            <p className="text-gray-400 text-sm mb-2">Pídele su código (ej. <span className="text-gray-300 font-medium">NICO27</span>) y mételo aquí para que pueda ver y planificar tus sesiones.</p>
            <form onSubmit={vincular} className="flex gap-2">
              <input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Código del entrenador"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500 uppercase placeholder:normal-case" />
              <button type="submit" disabled={cargando || !codigo.trim()}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
                {cargando ? '…' : 'Vincular'}
              </button>
            </form>
            {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
            <p className="text-gray-600 text-xs mt-2">¿Aún no tienes entrenador? Puedes empezar tú solo y vincularte más adelante desde Mi perfil.</p>
          </div>
        )}
      </div>

      {/* Paso 2: anamnesis */}
      <div>
        <div className="flex items-center gap-2">
          <span className={anamnesisOk ? 'text-green-400' : 'text-gray-600'}>{anamnesisOk ? '✅' : '⬜'}</span>
          <p className={'font-medium ' + (anamnesisOk ? 'text-gray-500 line-through' : 'text-white')}>Completa tu historial (anamnesis)</p>
        </div>
        {!anamnesisOk && (
          <div className="mt-2 ml-7">
            <p className="text-gray-400 text-sm mb-2">Tu salud, lesiones y objetivos — para que tu entrenador planifique con seguridad.</p>
            <button onClick={() => router.push('/anamnesis')}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
              Rellenar anamnesis →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
