'use client'
// ============================================================
// Deportistas, dentro del espacio de otro entrenador
// ============================================================
// Lo que ve un director en /deportistas cuando está en el espacio de uno de sus
// entrenadores: todos sus deportistas, los abiertos con su botón para abrir el
// panel y los cerrados con candado y solo el nombre. Crear deportistas, grupos o
// evaluados no tiene sentido aquí: son del entrenador.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { setAtletaActivo } from '@/lib/atletaActivo'
import { fondoDe, inicialDe } from '@/lib/avatar'
import type { Espacio } from '@/lib/espacio'
import type { FilaRoster } from '@/components/EntradaEspacio'
import PedirAcceso from '@/components/PedirAcceso'

export default function ListaEspacio({ espacio }: { espacio: Espacio }) {
  const router = useRouter()
  const [roster, setRoster] = useState<FilaRoster[] | null>(null)
  const [pidiendo, setPidiendo] = useState<FilaRoster | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('director_roster', { _id_entrenador: espacio.id })
    setError(e ? e.message : '')
    setRoster((data || []) as FilaRoster[])
  }, [espacio.id])
  useEffect(() => { cargar() }, [cargar])

  const abrir = (id: number) => { setAtletaActivo(id); router.push('/dashboard') }
  const anular = async (f: FilaRoster) => {
    const { error: e } = await supabase.rpc('director_anular_peticion', { _id_deportista: f.id_deportista })
    if (e) { setError(e.message); return }
    cargar()
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold">Deportistas de {espacio.nombre || 'tu entrenador'}</h2>
      <p className="text-gray-400 text-sm mt-1 mb-6">Con candado solo ves el nombre. Pide acceso y le llegará la petición.</p>
      {error && <p className="text-sm text-red-300 mb-4">{error}</p>}
      {roster === null ? (
        <p className="text-gray-500 text-sm">Cargando…</p>
      ) : roster.length === 0 ? (
        <p className="text-gray-500 text-sm">Todavía no tiene deportistas.</p>
      ) : (
        <div className="grid gap-2">
          {roster.map(f => {
            const abierto = f.estado === 'concedido'
            return (
              <div key={f.id_deportista} className="bg-gray-900 rounded-xl px-4 py-3 border border-gray-800 flex items-center gap-3 flex-wrap">
                {abierto ? (
                  <span className="w-10 h-10 rounded-[13px] grid place-items-center font-bold text-white flex-shrink-0" style={{ background: fondoDe(f.nombre) }}>{inicialDe(f.nombre)}</span>
                ) : (
                  <span className="w-10 h-10 rounded-[13px] grid place-items-center bg-gray-800 border border-gray-700 flex-shrink-0">🔒</span>
                )}
                <div className="flex-1 min-w-[150px]">
                  <p className={'font-semibold text-[14px] ' + (abierto ? 'text-white' : 'text-gray-400')}>{f.nombre}</p>
                  <p className="text-xs text-gray-500">{abierto ? 'Con acceso' : 'Solo ves el nombre'}</p>
                </div>
                {abierto ? (
                  <button onClick={() => abrir(f.id_deportista)} className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 transition">Abrir su panel</button>
                ) : f.estado === 'pendiente' ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 font-semibold">Pedido</span>
                    <button onClick={() => anular(f)} className="text-gray-400 hover:text-white underline underline-offset-2">Anular</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    {f.estado === 'denegado' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-200 font-semibold">No te lo ha abierto</span>}
                    <button onClick={() => setPidiendo(f)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">
                      {f.estado === 'denegado' ? 'Volver a pedir' : 'Pedir acceso'}
                    </button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {pidiendo && (
        <PedirAcceso idDeportista={pidiendo.id_deportista} nombre={pidiendo.nombre} nombreEntrenador={espacio.nombre}
          onCerrar={() => setPidiendo(null)}
          onHecho={() => { setPidiendo(null); cargar() }} />
      )}
    </div>
  )
}
