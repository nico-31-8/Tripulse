'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRequireEntrenador } from '@/lib/useRequireEntrenador'

const COLOR_DISC: Record<string, string> = {
  Natacion: 'bg-blue-900 text-blue-300', Natación: 'bg-blue-900 text-blue-300',
  Ciclismo: 'bg-yellow-900 text-yellow-300', Carrera: 'bg-green-900 text-green-300',
  Fuerza: 'bg-red-900 text-red-300', Brick: 'bg-purple-900 text-purple-300',
}

export default function PapeleraPage() {
  const router = useRouter()
  useRequireEntrenador()
  const [sesiones, setSesiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [restaurando, setRestaurando] = useState<number | null>(null)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: deps } = await supabase.from('deportista').select('id, nombre').eq('id_entrenador', user.id)
    if (!deps?.length) { setLoading(false); return }
    const depIds = deps.map((d: any) => d.id)

    const { data: macs } = await supabase.from('macrociclo').select('id, id_deportista').in('id_deportista', depIds)
    if (!macs?.length) { setLoading(false); return }

    const { data: mes } = await supabase.from('mesociclo').select('id, id_macrociclo').in('id_macrociclo', macs.map((m: any) => m.id))
    if (!mes?.length) { setLoading(false); return }

    const { data: micros } = await supabase.from('microciclo').select('id, id_mesociclo').in('id_mesociclo', mes.map((m: any) => m.id))
    if (!micros?.length) { setLoading(false); return }

    const { data: ses } = await supabase.from('sesion')
      .select('*')
      .in('id_microciclo', micros.map((m: any) => m.id))
      .eq('eliminada', true)
      .order('fecha_sesion', { ascending: false })

    // Construir mapa micro -> deportista
    const microToMeso: Record<number, number> = {}
    micros.forEach((mi: any) => { microToMeso[mi.id] = mi.id_mesociclo })
    const mesoToMac: Record<number, number> = {}
    mes.forEach((me: any) => { mesoToMac[me.id] = me.id_macrociclo })
    const macToDep: Record<number, number> = {}
    macs.forEach((ma: any) => { macToDep[ma.id] = ma.id_deportista })
    const depMap: Record<number, string> = {}
    deps.forEach((d: any) => { depMap[d.id] = d.nombre })

    const sesEnriquecidas = (ses || []).map((s: any) => {
      const mesoId = microToMeso[s.id_microciclo]
      const macId = mesoToMac[mesoId]
      const depId = macToDep[macId]
      return { ...s, depNombre: depMap[depId] || 'Deportista' }
    })

    setSesiones(sesEnriquecidas)
    setLoading(false)
  }

  const restaurar = async (sesId: number) => {
    setRestaurando(sesId)
    await supabase.from('sesion').update({ eliminada: false }).eq('id', sesId)
    setSesiones(p => p.filter(s => s.id !== sesId))
    setRestaurando(null)
  }

  const borrarDefinitivo = async (sesId: number) => {
    if (!confirm('Borrar definitivamente? No se puede deshacer.')) return
    await supabase.from('sesion').delete().eq('id', sesId)
    setSesiones(p => p.filter(s => s.id !== sesId))
  }

  const vaciarPapelera = async () => {
    if (!confirm('Borrar definitivamente todas las sesiones de la papelera?')) return
    const ids = sesiones.map(s => s.id)
    if (ids.length) await supabase.from('sesion').delete().in('id', ids)
    setSesiones([])
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Cargando...</div>

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-end items-center border-b border-gray-800">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-sm transition">← Volver</button>
      </nav>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-1">🗑 Papelera</h2>
            <p className="text-gray-400 text-sm">Sesiones eliminadas — recupéralas o bórralas definitivamente</p>
          </div>
          {sesiones.length > 0 && (
            <button onClick={vaciarPapelera} className="bg-red-900/50 hover:bg-red-900 border border-red-700/50 text-red-400 hover:text-red-300 text-xs px-4 py-2 rounded-lg transition">
              Vaciar papelera
            </button>
          )}
        </div>
        {sesiones.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <div className="text-5xl mb-4">🗑</div>
            <p className="text-lg">La papelera esta vacia</p>
            <p className="text-sm mt-1">Las sesiones eliminadas apareceran aqui</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sesiones.map(s => (
              <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                <span className={'text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ' + (COLOR_DISC[s.disciplina] || 'bg-gray-700 text-gray-300')}>
                  {s.disciplina}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">{s.fecha_sesion}</p>
                  <p className="text-gray-500 text-xs">{s.depNombre} · {s.duracion_minutos ? s.duracion_minutos + 'min' : '-'} · RPE {s.rpe_estimado || '-'}</p>
                  {s.notas_entrenador && <p className="text-gray-600 text-xs mt-0.5 truncate">{s.notas_entrenador}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => restaurar(s.id)} disabled={restaurando === s.id}
                    className="bg-green-900/40 hover:bg-green-900 border border-green-700/50 text-green-400 hover:text-green-300 text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                    {restaurando === s.id ? 'Restaurando...' : 'Restaurar'}
                  </button>
                  <button onClick={() => borrarDefinitivo(s.id)}
                    className="bg-red-900/20 hover:bg-red-900/50 border border-red-800 text-red-600 hover:text-red-400 text-xs px-3 py-1.5 rounded-lg transition">
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

