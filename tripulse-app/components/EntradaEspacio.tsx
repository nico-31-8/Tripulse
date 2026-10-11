'use client'
// ============================================================
// «¿Con quién trabajamos hoy?» dentro del espacio de otro entrenador
// ============================================================
// La misma entrada del dashboard, para un director que ha entrado en el
// espacio de uno de sus entrenadores. Salen TODOS los deportistas de ese
// entrenador, pero de los que no le ha abierto solo se ve el nombre, con un
// candado y el botón para pedírselo.
//
// La lista con candados sale de director_roster() (solo nombres y estado); el
// panel de un deportista abierto se carga como siempre, por las tablas, y la
// base solo deja pasar a los abiertos.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { coloresDe, fondoDe, inicialDe } from '@/lib/avatar'
import type { Espacio } from '@/lib/espacio'
import PedirAcceso from '@/components/PedirAcceso'

export type FilaRoster = { id_deportista: number; nombre: string; estado: 'sin_acceso' | 'pendiente' | 'concedido' | 'denegado'; mensaje: string | null }

export default function EntradaEspacio({ espacio, roster, deportistas, onAbrir, onCambio }: {
  espacio: Espacio
  roster: FilaRoster[]
  deportistas: any[]
  onAbrir: (dep: any) => void
  onCambio: () => void
}) {
  const [pidiendo, setPidiendo] = useState<FilaRoster | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const pila = (espacio.nombre || '').split(' ')[0] || 'su entrenador'

  const anular = async (f: FilaRoster) => {
    setOcupado(true); setError('')
    const { error: e } = await supabase.rpc('director_anular_peticion', { _id_deportista: f.id_deportista })
    setOcupado(false)
    if (e) { setError(e.message); return }
    onCambio()
  }

  return (
    <div className="min-h-[74vh] flex flex-col items-center justify-center text-center">
      <p className="fade-up text-sm font-medium text-teal-300 mb-2">Espacio de {espacio.nombre || 'tu entrenador'}</p>
      <h2 className="fade-up text-3xl sm:text-[34px] font-bold tracking-tight mb-2" style={{ animationDelay: '60ms' }}>¿Con quién trabajamos hoy?</h2>
      <p className="fade-up text-gray-500 text-sm mb-10 max-w-md" style={{ animationDelay: '110ms' }}>
        Elige un deportista para abrir su panel. Los que tienen candado te los tiene que abrir {pila}.
      </p>

      {roster.length === 0 ? (
        <p className="text-gray-500 text-sm">{pila} todavía no tiene deportistas.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8 w-full max-w-lg">
          {roster.map((f, i) => {
            const dep = f.estado === 'concedido' ? deportistas.find(d => d.id === f.id_deportista) : null
            if (dep) {
              const [c1] = coloresDe(dep.nombre)
              return (
                <button key={f.id_deportista} onClick={() => onAbrir(dep)}
                  className="fade-up group flex flex-col items-center gap-3.5 rounded-2xl py-4 transition-transform duration-300 ease-out hover:-translate-y-1.5 focus-visible:outline-none"
                  style={{ animationDelay: (160 + i * 70) + 'ms' }}>
                  <span className="relative w-[86px] h-[86px] rounded-[26px] flex items-center justify-center text-[34px] font-bold text-white transition-all duration-300 ease-out group-hover:scale-105"
                    style={{ background: fondoDe(dep.nombre), boxShadow: '0 12px 30px -6px ' + c1 + '66' }}>
                    {inicialDe(dep.nombre)}
                  </span>
                  <span className="font-semibold text-[15px] text-gray-400 group-hover:text-white transition-colors duration-200">{dep.nombre}</span>
                </button>
              )
            }
            return (
              <div key={f.id_deportista} className="fade-up flex flex-col items-center gap-2.5 py-4" style={{ animationDelay: (160 + i * 70) + 'ms' }}>
                <button type="button" disabled={f.estado === 'pendiente'} onClick={() => { setPidiendo(f); setError('') }}
                  aria-label={'Pedir acceso a ' + f.nombre}
                  className="w-[86px] h-[86px] rounded-[26px] grid place-items-center text-3xl bg-gray-800/80 border border-gray-700 text-gray-500 disabled:cursor-default">
                  🔒
                </button>
                <span className="font-semibold text-[15px] text-gray-500">{f.nombre}</span>
                {f.estado === 'pendiente' ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 font-semibold">Pedido</span>
                    <button disabled={ocupado} onClick={() => anular(f)} className="text-gray-400 hover:text-white underline underline-offset-2">Anular</button>
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    {f.estado === 'denegado' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-200 font-semibold">No te lo ha abierto</span>}
                    <button onClick={() => { setPidiendo(f); setError('') }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 transition">
                      {f.estado === 'denegado' ? 'Volver a pedir' : 'Pedir acceso'}
                    </button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-300 mt-6">{error}</p>}

      {pidiendo && (
        <PedirAcceso idDeportista={pidiendo.id_deportista} nombre={pidiendo.nombre} nombreEntrenador={espacio.nombre}
          onCerrar={() => setPidiendo(null)}
          onHecho={() => { setPidiendo(null); onCambio() }} />
      )}
    </div>
  )
}
