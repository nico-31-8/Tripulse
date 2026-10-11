'use client'
// ============================================================
// Ficha del deportista → «Acceso de tu director»
// ============================================================
// Una línea encima de las pestañas, solo si el entrenador trabaja con un
// director: si ese director ve a ESTE deportista, y el botón para abrirlo o
// cerrarlo sin ir a la tabla de Deportistas → Directores.
//
// Dentro del espacio de otro entrenador no sale: la ficha es de su deportista,
// no del director. Y aunque saliera, la base no le dejaría tocar nada
// (entrenador_dar_acceso comprueba que el deportista sea de quien llama).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEspacio } from '@/lib/espacio'

type Vinculo = { id_director: string; nombre: string | null; estado: string }
type Acceso = { id_director: string; id_deportista: number; estado: string; mensaje: string | null }

export default function AccesoDirectorFicha({ idDeportista }: { idDeportista: number }) {
  const [director, setDirector] = useState<Vinculo | null>(null)
  const [acceso, setAcceso] = useState<Acceso | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    if (getEspacio()) { setDirector(null); return }
    const [v, a] = await Promise.all([
      supabase.rpc('entrenador_mis_directores'),
      supabase.rpc('entrenador_accesos'),
    ])
    const activo = v.error ? null : ((v.data || []) as Vinculo[]).find(x => x.estado === 'activo') || null
    setDirector(activo)
    setAcceso(activo && !a.error
      ? ((a.data || []) as Acceso[]).find(x => x.id_director === activo.id_director && x.id_deportista === idDeportista) || null
      : null)
  }, [idDeportista])
  useEffect(() => { cargar() }, [cargar])

  const hacer = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setOcupado(true); setError('')
    const { error: e } = await fn()
    setOcupado(false)
    if (e) { setError(e.message); return }
    cargar()
  }

  if (!director) return null
  const args = { _id_director: director.id_director, _id_deportista: idDeportista }

  return (
    <div className="mb-4 rounded-xl border border-teal-400/25 bg-teal-500/[0.06] px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span aria-hidden>🧭</span>
      <span className="flex-1 min-w-[180px] text-gray-200">
        Tu director, <b className="text-white">{director.nombre || '—'}</b>,{' '}
        {acceso?.estado === 'concedido' ? 've y puede cambiar el plan de este deportista.'
          : acceso?.estado === 'pendiente' ? 'te ha pedido acceso a este deportista.'
          : 'no ve a este deportista.'}
        {acceso?.estado === 'pendiente' && acceso.mensaje && <span className="text-gray-400 italic"> «{acceso.mensaje}»</span>}
      </span>
      <span className="flex items-center gap-2 text-xs">
        {acceso?.estado === 'concedido' ? (
          <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_quitar_acceso', args))}
            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-semibold transition disabled:opacity-50">Quitarle el acceso</button>
        ) : acceso?.estado === 'pendiente' ? (
          <>
            <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_dar_acceso', args))}
              className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition disabled:opacity-50">Darle acceso</button>
            <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_negar_acceso', args))}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 transition disabled:opacity-50">No darlo</button>
          </>
        ) : (
          <button disabled={ocupado} onClick={() => hacer(() => supabase.rpc('entrenador_dar_acceso', args))}
            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-semibold transition disabled:opacity-50">Darle acceso</button>
        )}
      </span>
      {error && <p className="basis-full text-xs text-red-300">{error}</p>}
    </div>
  )
}
