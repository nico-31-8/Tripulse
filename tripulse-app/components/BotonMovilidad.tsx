'use client'
// ============================================================
// Añadir movilidad o flexibilidad a una sesión
// ============================================================
// La zona FLEX se podía elegir desde siempre, pero no había ninguna rutina: para
// prescribir movilidad había que escribir los siete ejercicios a mano cada vez.
// Esto pega una rutina del catálogo como tareas de la sesión.
//
// Enseña la regla del timing junto a la lista a propósito: el error habitual con
// los estiramientos no es elegir mal el ejercicio, es ponerlo en el momento
// equivocado.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { escribirBloquesFuerza } from '@/lib/plan-volcado'
import {
  PLANTILLAS_MOVILIDAD, REGLA_TIMING, ETIQUETA_MOMENTO,
  type MomentoMovilidad, type PlantillaMovilidad,
} from '@/lib/plantillas-movilidad'

const MOMENTOS: MomentoMovilidad[] = ['antes', 'despues', 'aparte']

interface Props {
  idSesion: number
  /** Cuántas tareas tiene ya la sesión: la movilidad se añade detrás. */
  ordenBase: number
  /** Para recargar cuando se han escrito las tareas. */
  onHecho: () => void
  clase?: string
}

export default function BotonMovilidad({ idSesion, ordenBase, onHecho, clase }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState('')

  const aplicar = async (p: PlantillaMovilidad) => {
    setGuardando(p.id); setError('')
    const err = await escribirBloquesFuerza(supabase, idSesion, p.bloques, ordenBase)
    setGuardando(null)
    if (err) { setError(err); return }
    setAbierto(false)
    onHecho()
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className={clase ?? 'text-[11.5px] text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 transition'}>
        🧘 Movilidad
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={() => setAbierto(false)}>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>

            <div className="flex justify-between items-start gap-4 p-5 pb-3 border-b border-gray-800">
              <div>
                <h3 className="text-xl font-bold">🧘 Movilidad y flexibilidad</h3>
                <p className="text-gray-500 text-xs mt-1">Se añade como tareas al final de esta sesión.</p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-gray-400 hover:text-white text-2xl leading-none flex-shrink-0">×</button>
            </div>

            <div className="overflow-y-auto p-5 flex flex-col gap-5">
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-3">
                <p className="text-[12.5px] text-amber-200/90">{REGLA_TIMING.aviso}</p>
                <p className="text-[11.5px] text-amber-200/60 mt-1.5">{REGLA_TIMING.prevencion}</p>
              </div>

              {MOMENTOS.map(m => {
                const rutinas = PLANTILLAS_MOVILIDAD.filter(p => p.momento === m)
                if (!rutinas.length) return null
                return (
                  <section key={m}>
                    <h4 className="text-[13px] font-semibold text-gray-200">{ETIQUETA_MOMENTO[m]}</h4>
                    <p className="text-[11.5px] text-gray-500 mb-2.5">
                      {m === 'antes' ? REGLA_TIMING.antes : m === 'despues' ? REGLA_TIMING.despues
                        : 'Día suelto de movilidad. Es la sesión de los últimos 10–14 días antes de la competición A.'}
                    </p>
                    <div className="flex flex-col gap-2">
                      {rutinas.map(p => (
                        <div key={p.id} className="rounded-xl bg-gray-950 border border-gray-800 px-3.5 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[13.5px] font-semibold text-gray-100">{p.nombre}</p>
                              <p className="text-[11.5px] text-gray-500 mt-0.5">
                                {p.bloques.length} ejercicios · ~{p.duracionMin}′
                                {p.origen === 'propuesta' && ' · secuencia propuesta'}
                              </p>
                            </div>
                            <button onClick={() => aplicar(p)} disabled={!!guardando}
                              className="flex-shrink-0 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg transition">
                              {guardando === p.id ? 'Añadiendo…' : 'Añadir'}
                            </button>
                          </div>
                          <p className="text-[12px] text-gray-400 mt-2 leading-relaxed">{p.objetivo}</p>
                          <p className="text-[10.5px] text-gray-600 mt-1.5">{p.fuente}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}

              {error && <p className="text-red-400 text-[12.5px]">No se pudo añadir: {error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
